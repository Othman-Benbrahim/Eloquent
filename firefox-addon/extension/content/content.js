/*
 * Eloquent Local Assistant
 * SPDX-License-Identifier: GPL-3.0-only
 */
(function startContentScript() {
  "use strict";

  if (globalThis.__eloquentLocalAssistantLoaded) return;
  globalThis.__eloquentLocalAssistantLoaded = true;

  const core = globalThis.EloquentCore;
  const domain = core.normalizeDomain(location.hostname || (() => {
    try {
      return new URL(document.referrer).hostname;
    } catch {
      return "";
    }
  })());
  const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel"]);
  let settings = core.mergeSettings(core.DEFAULT_SETTINGS);
  let activeEditor = null;
  let activeText = "";
  let activeMatches = [];
  let requestGeneration = 0;
  let checkTimer = null;
  let serverError = "";
  let pendingClick = null;
  const replacementEditors = new WeakSet();

  function isEditorConnected(editor) {
    return Boolean(editor && editor.isConnected);
  }

  function isTextInput(element) {
    return element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type.toLowerCase());
  }

  function isEditable(element) {
    if (!(element instanceof Element)) return false;
    if (element instanceof HTMLTextAreaElement || isTextInput(element)) {
      return !element.disabled && !element.readOnly;
    }
    const hasContentEditable = element.hasAttribute("contenteditable");
    const contentEditable = (element.getAttribute("contenteditable") || "").toLowerCase();
    if (contentEditable === "false") return false;
    if (hasContentEditable
      && (contentEditable === "" || contentEditable === "true" || contentEditable === "plaintext-only")) {
      return true;
    }
    if (element.getAttribute("role") === "textbox"
      && element.getAttribute("aria-disabled") !== "true"
      && element.getAttribute("aria-readonly") !== "true") {
      return true;
    }
    if (document.designMode === "on"
      && (element === document.body || element === document.documentElement)) {
      return true;
    }

    // `isContentEditable` et `-moz-user-modify` sont hérités par les
    // paragraphes internes. Seule leur frontière extérieure est l'hôte
    // d'édition auquel il faut envoyer la correction et l'événement input.
    const parent = composedParent(element);
    if (element.isContentEditable
      && (!(parent instanceof Element) || !parent.isContentEditable)) {
      return true;
    }
    const userModify = getComputedStyle(element).getPropertyValue("-moz-user-modify");
    const parentUserModify = parent instanceof Element
      ? getComputedStyle(parent).getPropertyValue("-moz-user-modify")
      : "";
    return userModify.startsWith("read-write") && !parentUserModify.startsWith("read-write");
  }

  function composedParent(element) {
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }

  function findEditable(element) {
    if (!(element instanceof Element)) return null;
    let current = element;
    while (current) {
      if ((current.getAttribute("contenteditable") || "").toLowerCase() === "false") return null;
      if (isEditable(current)) return current;
      current = composedParent(current);
    }
    return null;
  }

  function deepActiveElement(root = document) {
    let active = root.activeElement || null;
    const visited = new Set();
    while (active && active.shadowRoot && active.shadowRoot.activeElement && !visited.has(active)) {
      visited.add(active);
      active = active.shadowRoot.activeElement;
    }
    return active;
  }

  function findEditableFromEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    const candidate = path.find((node) => node instanceof Element);
    const editor = findEditable(candidate);
    if (editor) return editor;
    return findEditable(deepActiveElement());
  }

  function editorLanguage(editor) {
    let current = editor;
    while (current) {
      const language = current.getAttribute("lang") || current.getAttribute("xml:lang");
      if (language) return language;
      current = composedParent(current);
    }
    return "";
  }

  function editorText(editor) {
    if (editor instanceof HTMLTextAreaElement || isTextInput(editor)) return editor.value;
    return editor.textContent || "";
  }

  function emitBeforeInput(editor, replacement) {
    try {
      editor.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: "insertReplacementText",
        data: replacement,
      }));
    } catch {
      // Les anciens éditeurs Firefox peuvent ne pas accepter InputEvent.
    }
  }

  function emitInput(editor, replacement) {
    try {
      editor.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertReplacementText",
        data: replacement,
      }));
    } catch {
      editor.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
  }

  function waitForEditor(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function resetVisibleResults(editor, text = "") {
    requestGeneration += 1;
    activeEditor = editor || null;
    activeText = text;
    activeMatches = [];
    serverError = "";
    pendingClick = null;
    overlay.hide();
  }

  function textBoundary(root, requestedOffset) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const maximum = Math.max(0, requestedOffset);
    let consumed = 0;
    let node = walker.nextNode();
    let lastNode = null;

    while (node) {
      const length = node.nodeValue ? node.nodeValue.length : 0;
      if (maximum <= consumed + length) {
        return { node, offset: Math.max(0, maximum - consumed) };
      }
      consumed += length;
      lastNode = node;
      node = walker.nextNode();
    }
    return lastNode ? { node: lastNode, offset: lastNode.nodeValue.length } : null;
  }

  function rangeForMatch(editor, match) {
    const start = textBoundary(editor, match.offset);
    const end = textBoundary(editor, match.offset + match.length);
    if (!start || !end) return null;
    const range = document.createRange();
    try {
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return range;
    } catch {
      return null;
    }
  }

  function textOffsetAtPoint(editor, x, y) {
    if (editor instanceof HTMLTextAreaElement || isTextInput(editor)) {
      return Number.isInteger(editor.selectionStart) ? editor.selectionStart : null;
    }

    const ownerDocument = editor.ownerDocument;
    let node = null;
    let offset = 0;
    if (typeof ownerDocument.caretPositionFromPoint === "function") {
      const position = ownerDocument.caretPositionFromPoint(x, y);
      node = position && position.offsetNode;
      offset = position ? position.offset : 0;
    } else if (typeof ownerDocument.caretRangeFromPoint === "function") {
      const range = ownerDocument.caretRangeFromPoint(x, y);
      node = range && range.startContainer;
      offset = range ? range.startOffset : 0;
    }
    if (!node || (node !== editor && !editor.contains(node))) return null;

    const prefix = ownerDocument.createRange();
    try {
      prefix.selectNodeContents(editor);
      prefix.setEnd(node, offset);
      return prefix.toString().length;
    } catch {
      return null;
    }
  }

  function locateMatchOffset(text, match, snapshotText) {
    const target = String(snapshotText || "").slice(match.offset, match.offset + match.length);
    if (!target) return -1;
    if (text.slice(match.offset, match.offset + target.length) === target) return match.offset;

    let nearest = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    let candidate = text.indexOf(target);
    while (candidate !== -1) {
      const distance = Math.abs(candidate - match.offset);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
      candidate = text.indexOf(target, candidate + Math.max(1, target.length));
    }
    return nearest;
  }

  function selectReplacementRange(editor, offset, length) {
    if (editor instanceof HTMLTextAreaElement || isTextInput(editor)) {
      if (typeof editor.setSelectionRange === "function") {
        editor.setSelectionRange(offset, offset + length);
      }
      return null;
    }
    const range = rangeForMatch(editor, { offset, length });
    const selection = editor.ownerDocument.getSelection();
    if (!range || !selection) return null;
    selection.removeAllRanges();
    selection.addRange(range);
    return { range, selection };
  }

  function applyTextControlReplacement(editor, expectedText, offset, length, replacement) {
    selectReplacementRange(editor, offset, length);
    emitBeforeInput(editor, replacement);
    const prototype = editor instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;
    valueSetter.call(editor, expectedText);
    const caret = offset + replacement.length;
    if (typeof editor.setSelectionRange === "function") editor.setSelectionRange(caret, caret);
    emitInput(editor, replacement);
  }

  function applyRichEditorReplacement(editor, offset, length, replacement) {
    const selected = selectReplacementRange(editor, offset, length);
    if (!selected) return false;

    const beforeText = editorText(editor);
    let inserted = false;
    let nativeInputObserved = false;
    const observeInput = () => {
      nativeInputObserved = true;
    };
    editor.addEventListener("input", observeInput, { once: true });
    try {
      inserted = editor.ownerDocument.execCommand("insertText", false, replacement);
    } catch {
      inserted = false;
    }
    editor.removeEventListener("input", observeInput);

    if (!inserted || editorText(editor) === beforeText) {
      const fallback = selectReplacementRange(editor, offset, length);
      if (!fallback) return false;
      emitBeforeInput(editor, replacement);
      fallback.range.deleteContents();
      const textNode = editor.ownerDocument.createTextNode(replacement);
      fallback.range.insertNode(textNode);
      fallback.range.setStartAfter(textNode);
      fallback.range.collapse(true);
      fallback.selection.removeAllRanges();
      fallback.selection.addRange(fallback.range);
    }
    if (!nativeInputObserved) emitInput(editor, replacement);
    return true;
  }

  async function replaceMatch(editor, match, replacement, snapshotText) {
    if (!isEditorConnected(editor) || replacementEditors.has(editor)) return;
    const originalText = editorText(editor);
    const sourceText = String(snapshotText || activeText || originalText);
    const offset = locateMatchOffset(originalText, match, sourceText);
    if (offset < 0) {
      resetVisibleResults(editor, originalText);
      scheduleCheck(editor, true);
      return;
    }

    const currentMatch = { ...match, offset };
    const expectedText = core.applyReplacementToText(originalText, currentMatch, replacement);
    replacementEditors.add(editor);
    editor.focus({ preventScroll: true });

    try {
      if (editor instanceof HTMLTextAreaElement || isTextInput(editor)) {
        applyTextControlReplacement(editor, expectedText, offset, match.length, replacement);
      } else {
        applyRichEditorReplacement(editor, offset, match.length, replacement);
      }
      // Le bouton reste attaché pendant la commande native : Firefox conserve
      // ainsi le geste utilisateur et la sélection jusqu'au remplacement.
      resetVisibleResults(editor, editorText(editor));

      // Certains frameworks réinjectent leur ancien état dans la micro-tâche
      // qui suit le clic. On contrôle donc le résultat stabilisé et on rejoue
      // l'opération native si la page a annulé le premier remplacement.
      for (const delay of [0, 40, 160]) {
        await waitForEditor(delay);
        if (!isEditorConnected(editor)) break;
        if (editorText(editor) === expectedText) continue;
        const currentText = editorText(editor);
        const retryOffset = locateMatchOffset(currentText, currentMatch, originalText);
        if (retryOffset < 0) break;
        const retryMatch = { ...currentMatch, offset: retryOffset };
        const retryExpectedText = core.applyReplacementToText(currentText, retryMatch, replacement);
        if (retryExpectedText !== expectedText) break;
        editor.focus({ preventScroll: true });
        if (editor instanceof HTMLTextAreaElement || isTextInput(editor)) {
          applyTextControlReplacement(editor, expectedText, retryOffset, match.length, replacement);
        } else {
          applyRichEditorReplacement(editor, retryOffset, match.length, replacement);
        }
      }
    } catch (error) {
      console.warn("Eloquent replacement", error);
    } finally {
      replacementEditors.delete(editor);
      resetVisibleResults(editor, editorText(editor));
      scheduleCheck(editor, true);
    }
  }

  class ProofreadingOverlay {
    constructor() {
      this.host = document.createElement("div");
      this.host.id = "eloquent-local-assistant-root";
      this.host.setAttribute("aria-live", "polite");
      this.shadow = this.host.attachShadow({ mode: "closed" });
      this.shadow.append(this.createStyles());
      this.layer = document.createElement("div");
      this.layer.className = "layer";
      this.shadow.append(this.layer);
      this.panelOpen = false;
      this.selectedMatchId = null;
      this.panelAnchor = null;
      this.hitAreas = [];
      this.editor = null;
      this.text = "";
      this.matches = [];
      this.error = "";
      document.documentElement.append(this.host);
    }

    createStyles() {
      const style = document.createElement("style");
      style.textContent = `
        :host { all: initial !important; }
        .layer { position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; font-family: system-ui, -apple-system, "Segoe UI", sans-serif !important; }
        .mirror-clip { position: fixed !important; overflow: hidden !important; pointer-events: none !important; }
        .mirror-text { position: absolute !important; box-sizing: border-box !important; margin: 0 !important; color: transparent !important; background: transparent !important; text-shadow: none !important; }
        .mirror-text .issue { color: transparent !important; text-decoration-line: underline !important; text-decoration-style: wavy !important; text-decoration-color: #d93025 !important; text-decoration-thickness: 1.5px !important; text-underline-offset: 2px !important; }
        .marker { position: fixed !important; height: 5px !important; padding: 0 !important; margin: 0 !important; border: 0 !important; pointer-events: none !important; background-color: transparent !important; background-image: linear-gradient(135deg, transparent 45%, #d93025 46%, #d93025 54%, transparent 55%), linear-gradient(45deg, transparent 45%, #d93025 46%, #d93025 54%, transparent 55%) !important; background-size: 6px 6px !important; background-position: 0 0, 3px 3px !important; }
        .badge { position: fixed !important; min-width: 28px !important; height: 28px !important; padding: 0 8px !important; border: 0 !important; border-radius: 14px !important; box-shadow: 0 2px 10px rgba(0,0,0,.22) !important; pointer-events: auto !important; cursor: pointer !important; color: white !important; background: #6d4aff !important; font: 700 13px/28px system-ui, sans-serif !important; text-align: center !important; }
        .badge.has-errors { background: #c5221f !important; }
        .badge.has-error { background: #8a5a00 !important; }
        .panel { position: fixed !important; width: min(360px, calc(100vw - 24px)) !important; max-height: min(480px, calc(100vh - 24px)) !important; overflow: auto !important; box-sizing: border-box !important; padding: 14px !important; border: 1px solid rgba(0,0,0,.12) !important; border-radius: 14px !important; box-shadow: 0 14px 42px rgba(0,0,0,.28) !important; pointer-events: auto !important; color: #202124 !important; background: #fff !important; font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif !important; }
        .panel-header { display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 12px !important; margin-bottom: 10px !important; }
        .panel-title { margin: 0 !important; font-size: 15px !important; font-weight: 750 !important; }
        .close { width: 28px !important; height: 28px !important; border: 0 !important; border-radius: 50% !important; cursor: pointer !important; color: #444 !important; background: #f1f3f4 !important; font: 18px/28px system-ui, sans-serif !important; }
        .empty, .server-error { margin: 0 !important; color: #5f6368 !important; }
        .server-error { color: #8a3b00 !important; }
        .issue-card { padding: 11px 0 !important; border-top: 1px solid #eceff1 !important; }
        .issue-card:first-of-type { border-top: 0 !important; }
        .issue-message { margin: 0 0 7px !important; font-weight: 600 !important; }
        .suggestions { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; }
        .suggestion, .dismiss { max-width: 100% !important; padding: 6px 9px !important; border-radius: 8px !important; cursor: pointer !important; font: 600 13px/1.2 system-ui, sans-serif !important; }
        .suggestion { overflow: hidden !important; border: 1px solid #6d4aff !important; color: #4e2bc5 !important; background: #f4f0ff !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
        .dismiss { border: 1px solid #dadce0 !important; color: #5f6368 !important; background: #fff !important; }
        @media (prefers-color-scheme: dark) {
          .panel { color: #f1f3f4 !important; background: #202124 !important; border-color: #4a4d51 !important; }
          .issue-card { border-color: #3c4043 !important; }
          .empty { color: #bdc1c6 !important; }
          .close, .dismiss { color: #e8eaed !important; background: #3c4043 !important; border-color: #5f6368 !important; }
          .server-error { color: #ffb184 !important; }
        }
      `;
      return style;
    }

    clear() {
      this.layer.replaceChildren();
    }

    hide() {
      this.editor = null;
      this.matches = [];
      this.panelOpen = false;
      this.selectedMatchId = null;
      this.panelAnchor = null;
      this.hitAreas = [];
      this.clear();
    }

    render(editor, text, matches, error = "") {
      this.editor = editor;
      this.text = text;
      this.matches = matches;
      this.error = error;
      this.hitAreas = [];
      if (this.selectedMatchId && !matches.some((match) => match.id === this.selectedMatchId)) {
        this.selectedMatchId = null;
        this.panelAnchor = null;
      }
      this.clear();
      if (!isEditorConnected(editor)) return;

      if (editor instanceof HTMLTextAreaElement || isTextInput(editor)) {
        this.renderMirror(editor, text, matches);
      } else {
        this.renderRangeMarkers(editor, matches);
      }
      if (matches.length || error) this.renderBadge(editor, matches, error);
      if (this.panelOpen) this.renderPanel(editor, matches, error);
    }

    renderMirror(editor, text, matches) {
      const rect = editor.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const computed = getComputedStyle(editor);
      const clip = document.createElement("div");
      clip.className = "mirror-clip";
      clip.style.left = `${rect.left + editor.clientLeft}px`;
      clip.style.top = `${rect.top + editor.clientTop}px`;
      clip.style.width = `${editor.clientWidth}px`;
      clip.style.height = `${editor.clientHeight}px`;

      const mirror = document.createElement("div");
      mirror.className = "mirror-text";
      mirror.style.left = `${-editor.scrollLeft}px`;
      mirror.style.top = `${-editor.scrollTop}px`;
      mirror.style.width = `${editor.clientWidth}px`;
      mirror.style.minHeight = `${Math.max(editor.clientHeight, editor.scrollHeight)}px`;
      mirror.style.font = computed.font;
      mirror.style.fontKerning = computed.fontKerning;
      mirror.style.fontFeatureSettings = computed.fontFeatureSettings;
      mirror.style.letterSpacing = computed.letterSpacing;
      mirror.style.lineHeight = computed.lineHeight;
      mirror.style.padding = computed.padding;
      mirror.style.textAlign = computed.textAlign;
      mirror.style.textIndent = computed.textIndent;
      mirror.style.textTransform = computed.textTransform;
      mirror.style.direction = computed.direction;
      mirror.style.tabSize = computed.tabSize;
      mirror.style.whiteSpace = isTextInput(editor) ? "pre" : "pre-wrap";
      mirror.style.overflowWrap = isTextInput(editor) ? "normal" : "break-word";

      const issueSpans = [];
      for (const segment of core.createSegments(text, matches)) {
        if (!segment.match) {
          mirror.append(document.createTextNode(segment.text));
          continue;
        }
        const span = document.createElement("span");
        span.className = "issue";
        span.textContent = segment.text;
        mirror.append(span);
        issueSpans.push({ span, match: segment.match });
      }
      if (editor instanceof HTMLTextAreaElement && text.endsWith("\n")) {
        mirror.append(document.createTextNode(" "));
      }
      clip.append(mirror);
      this.layer.append(clip);

      const clipRect = clip.getBoundingClientRect();
      for (const { span, match } of issueSpans) {
        for (const issueRect of span.getClientRects()) {
          this.addHitArea(match, issueRect, clipRect);
        }
      }
    }

    addHitArea(match, rect, clipRect = null) {
      const left = clipRect ? Math.max(rect.left, clipRect.left) : rect.left;
      const top = clipRect ? Math.max(rect.top, clipRect.top) : rect.top;
      const right = clipRect ? Math.min(rect.right, clipRect.right) : rect.right;
      const bottom = clipRect ? Math.min(rect.bottom, clipRect.bottom) : rect.bottom;
      if (right <= left || bottom <= top) return;
      this.hitAreas.push({ match, left, top, right, bottom });
    }

    matchAtPoint(editor, x, y) {
      if (editor !== this.editor || !this.matches.length) return null;
      const area = this.hitAreas.find((candidate) =>
        x >= candidate.left - 2
        && x <= candidate.right + 2
        && y >= candidate.top - 2
        && y <= candidate.bottom + 2,
      );
      return area ? area.match : null;
    }

    matchAtOffset(editor, offset) {
      if (editor !== this.editor || !Number.isInteger(offset)) return null;
      return this.matches.find((match) =>
        offset >= match.offset && offset <= match.offset + match.length,
      ) || null;
    }

    openMatch(editor, match, anchor) {
      if (editor !== this.editor || !this.matches.some((candidate) => candidate.id === match.id)) return;
      this.selectedMatchId = match.id;
      this.panelAnchor = anchor;
      this.panelOpen = true;
      this.render(editor, this.text, this.matches, this.error);
    }

    anchorForMatch(match) {
      const area = this.hitAreas.find((candidate) => candidate.match.id === match.id);
      return area
        ? { x: (area.left + area.right) / 2, y: area.bottom }
        : null;
    }

    renderRangeMarkers(editor, matches) {
      for (const match of matches) {
        const range = rangeForMatch(editor, match);
        if (!range) continue;
        for (const rect of range.getClientRects()) {
          if (rect.width <= 0 || rect.height <= 0) continue;
          this.addHitArea(match, rect);
          const marker = document.createElement("div");
          marker.className = "marker";
          marker.setAttribute("aria-hidden", "true");
          marker.style.left = `${rect.left}px`;
          marker.style.top = `${Math.max(rect.top, rect.bottom - 3)}px`;
          marker.style.width = `${rect.width}px`;
          this.layer.append(marker);
        }
      }
    }

    renderBadge(editor, matches, error) {
      const rect = editor.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const badge = document.createElement("button");
      badge.type = "button";
      badge.className = `badge${error ? " has-error" : matches.length ? " has-errors" : ""}`;
      badge.textContent = error ? "!" : String(matches.length);
      badge.title = error || (matches.length ? `${matches.length} correction(s)` : "Aucune erreur détectée");
      badge.style.left = `${Math.max(4, Math.min(innerWidth - 34, rect.right - 32))}px`;
      badge.style.top = `${Math.max(4, Math.min(innerHeight - 32, rect.bottom - 32))}px`;
      badge.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (this.panelOpen) {
          this.panelOpen = false;
          this.selectedMatchId = null;
          this.panelAnchor = null;
        } else {
          const firstMatch = matches[0] || null;
          this.panelOpen = true;
          this.selectedMatchId = firstMatch ? firstMatch.id : null;
          this.panelAnchor = firstMatch ? this.anchorForMatch(firstMatch) : null;
        }
        this.render(editor, this.text, this.matches, this.error);
      });
      this.layer.append(badge);
    }

    renderPanel(editor, matches, error) {
      const editorRect = editor.getBoundingClientRect();
      const panel = document.createElement("section");
      panel.className = "panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Corrections Eloquent");
      const anchorX = this.panelAnchor ? this.panelAnchor.x : editorRect.right;
      const anchorY = this.panelAnchor ? this.panelAnchor.y : editorRect.bottom;
      const desiredLeft = anchorX + 372 <= innerWidth ? anchorX + 10 : anchorX - 370;
      panel.style.left = `${Math.max(12, desiredLeft)}px`;
      const roomBelow = innerHeight - anchorY;
      panel.style.top = roomBelow >= 220
        ? `${Math.min(innerHeight - 12, anchorY + 10)}px`
        : `${Math.max(12, anchorY - 230)}px`;

      const header = document.createElement("div");
      header.className = "panel-header";
      const title = document.createElement("h2");
      title.className = "panel-title";
      title.textContent = this.selectedMatchId
        ? "Correction proposée"
        : (matches.length ? `${matches.length} correction(s)` : "Eloquent Local Assistant");
      const close = document.createElement("button");
      close.className = "close";
      close.type = "button";
      close.textContent = "×";
      close.setAttribute("aria-label", "Fermer");
      close.addEventListener("click", () => {
        this.panelOpen = false;
        this.selectedMatchId = null;
        this.panelAnchor = null;
        this.render(editor, this.text, this.matches, this.error);
      });
      header.append(title, close);
      panel.append(header);

      if (error) {
        const message = document.createElement("p");
        message.className = "server-error";
        message.textContent = error;
        panel.append(message);
      } else if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "Aucune erreur détectée dans ce champ.";
        panel.append(empty);
      } else {
        const selected = matches.find((match) => match.id === this.selectedMatchId);
        const visibleMatches = selected ? [selected] : matches;
        for (const match of visibleMatches) panel.append(this.createIssueCard(editor, match));
      }
      this.layer.append(panel);
    }

    createIssueCard(editor, match) {
      const card = document.createElement("article");
      card.className = "issue-card";
      const message = document.createElement("p");
      message.className = "issue-message";
      message.textContent = match.message;
      const actions = document.createElement("div");
      actions.className = "suggestions";

      for (const replacement of match.replacements) {
        const button = document.createElement("button");
        button.className = "suggestion";
        button.type = "button";
        button.textContent = replacement || "Supprimer";
        button.title = replacement || "Supprimer ce texte";
        const keepEditorSelection = (event) => {
          event.preventDefault();
          event.stopPropagation();
        };
        button.addEventListener("pointerdown", keepEditorSelection);
        button.addEventListener("mousedown", keepEditorSelection);
        button.addEventListener("click", (event) => {
          keepEditorSelection(event);
          void replaceMatch(editor, match, replacement, this.text);
        });
        actions.append(button);
      }
      const dismiss = document.createElement("button");
      dismiss.className = "dismiss";
      dismiss.type = "button";
      dismiss.textContent = "Ignorer";
      dismiss.addEventListener("click", () => {
        this.matches = this.matches.filter((candidate) => candidate.id !== match.id);
        activeMatches = this.matches;
        this.selectedMatchId = null;
        this.panelAnchor = null;
        this.render(editor, this.text, this.matches, this.error);
      });
      actions.append(dismiss);
      card.append(message, actions);
      return card;
    }
  }

  const overlay = new ProofreadingOverlay();

  function eventComesFromOverlay(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    return path.includes(overlay.host);
  }

  async function refreshSettings() {
    const response = await browser.runtime.sendMessage({ type: "getSettings" });
    if (response && response.ok) settings = core.mergeSettings(response.settings);
    if (!core.isDomainEnabled(settings, domain)) {
      activeMatches = [];
      overlay.hide();
    } else if (activeEditor) {
      scheduleCheck(activeEditor, true);
    }
  }

  function scheduleCheck(editor, immediate = false, invalidate = false) {
    if (!editor || !isEditable(editor) || !core.isDomainEnabled(settings, domain)) {
      overlay.hide();
      return;
    }
    if (activeEditor && activeEditor !== editor) {
      resetVisibleResults(editor, editorText(editor));
    } else if (invalidate) {
      resetVisibleResults(editor, editorText(editor));
    }
    activeEditor = editor;
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => performCheck(editor), immediate ? 0 : settings.delayMs);
  }

  async function performCheck(editor) {
    if (editor !== activeEditor || !isEditorConnected(editor)) return;
    const text = editorText(editor);
    activeText = text;
    serverError = "";

    if (text.trim().length < settings.minTextLength) {
      activeMatches = [];
      overlay.hide();
      return;
    }

    const generation = ++requestGeneration;
    try {
      const response = await browser.runtime.sendMessage({
        type: "checkText",
        text,
        domain,
        editorLanguage: editorLanguage(editor),
        pageLanguage: document.documentElement.lang || "",
      });
      if (generation !== requestGeneration || editor !== activeEditor || text !== editorText(editor)) return;
      if (!response || !response.ok) {
        activeMatches = [];
        serverError = response && response.error
          ? response.error
          : "Impossible de joindre le serveur LanguageTool local.";
      } else {
        activeMatches = response.matches || [];
      }
      overlay.render(editor, text, activeMatches, serverError);
      if (pendingClick
        && pendingClick.editor === editor
        && pendingClick.text === text
        && !serverError) {
        const click = pendingClick;
        pendingClick = null;
        const clickedMatch = overlay.matchAtOffset(editor, click.offset)
          || overlay.matchAtPoint(editor, click.x, click.y);
        if (clickedMatch) overlay.openMatch(editor, clickedMatch, { x: click.x, y: click.y });
      }
    } catch (error) {
      if (generation !== requestGeneration) return;
      activeMatches = [];
      serverError = error && error.message
        ? error.message
        : "Impossible de joindre le serveur LanguageTool local.";
      overlay.render(editor, text, activeMatches, serverError);
    }
  }

  document.addEventListener("focusin", (event) => {
    const editor = findEditableFromEvent(event);
    if (editor) scheduleCheck(editor);
  }, true);

  document.addEventListener("input", (event) => {
    const editor = findEditableFromEvent(event);
    if (editor && !replacementEditors.has(editor)) scheduleCheck(editor, false, true);
  }, true);

  document.addEventListener("pointerdown", (event) => {
    if (eventComesFromOverlay(event)) return;
    const editor = findEditableFromEvent(event);
    if (editor) scheduleCheck(editor);
  }, true);

  document.addEventListener("click", (event) => {
    if (eventComesFromOverlay(event)) return;
    const editor = findEditableFromEvent(event);
    if (!editor) return;
    const x = event.clientX;
    const y = event.clientY;
    setTimeout(() => {
      if (!isEditorConnected(editor)) return;
      const offset = textOffsetAtPoint(editor, x, y);
      const match = overlay.matchAtOffset(editor, offset) || overlay.matchAtPoint(editor, x, y);
      if (match) {
        overlay.openMatch(editor, match, { x, y });
        return;
      }
      pendingClick = { editor, offset, x, y, text: editorText(editor) };
      scheduleCheck(editor, true);
    }, 0);
  }, true);

  document.addEventListener("keydown", (event) => {
    const editor = findEditableFromEvent(event);
    if (editor) scheduleCheck(editor);
  }, true);

  document.addEventListener("compositionend", (event) => {
    const editor = findEditableFromEvent(event);
    if (editor) scheduleCheck(editor, false, true);
  }, true);

  document.addEventListener("paste", (event) => {
    const editor = findEditableFromEvent(event);
    if (editor) setTimeout(() => scheduleCheck(editor, false, true), 0);
  }, true);

  document.addEventListener("focusout", () => {
    setTimeout(() => {
      if (overlay.panelOpen) return;
      const focused = deepActiveElement();
      if (focused === overlay.host) return;
      if (!findEditable(focused) && activeEditor) resetVisibleResults(null);
    }, 0);
  }, true);

  document.addEventListener("scroll", () => {
    if (activeEditor && (activeMatches.length || serverError)) {
      overlay.render(activeEditor, activeText, activeMatches, serverError);
    }
  }, true);

  window.addEventListener("resize", () => {
    if (activeEditor && (activeMatches.length || serverError)) {
      overlay.render(activeEditor, activeText, activeMatches, serverError);
    }
  }, { passive: true });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.settings) refreshSettings();
  });

  browser.runtime.onMessage.addListener(async (message) => {
    if (message && message.type === "getPageState") {
      return {
        ok: true,
        domain,
        enabled: core.isDomainEnabled(settings, domain),
        issueCount: activeMatches.length,
        serverError,
      };
    }
    if (message && message.type === "refreshPageSettings") {
      await refreshSettings();
      return { ok: true };
    }
    return undefined;
  });

  const editorObserver = new MutationObserver(() => {
    if (activeEditor && !isEditorConnected(activeEditor)) {
      activeEditor = null;
      activeMatches = [];
      overlay.hide();
    }
    if (!activeEditor) {
      const editor = findEditable(deepActiveElement());
      if (editor) scheduleCheck(editor);
    }
  });
  editorObserver.observe(document.documentElement, { childList: true, subtree: true });

  refreshSettings().catch((error) => console.warn("Eloquent settings", error));
  const initialEditor = findEditable(deepActiveElement());
  if (initialEditor) scheduleCheck(initialEditor);
})();
