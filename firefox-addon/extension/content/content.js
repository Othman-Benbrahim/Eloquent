/*
 * Eloquent Local Assistant
 * SPDX-License-Identifier: GPL-3.0-only
 */
(function startContentScript() {
  "use strict";

  if (globalThis.__eloquentLocalAssistantLoaded) return;
  globalThis.__eloquentLocalAssistantLoaded = true;

  const core = globalThis.EloquentCore;
  const domain = core.normalizeDomain(location.hostname);
  const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel"]);
  let settings = core.mergeSettings(core.DEFAULT_SETTINGS);
  let activeEditor = null;
  let activeText = "";
  let activeMatches = [];
  let requestGeneration = 0;
  let checkTimer = null;
  let serverError = "";

  function isTextInput(element) {
    return element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type.toLowerCase());
  }

  function isEditable(element) {
    if (!(element instanceof Element)) return false;
    if (element instanceof HTMLTextAreaElement || isTextInput(element)) {
      return !element.disabled && !element.readOnly;
    }
    return element.isContentEditable;
  }

  function findEditable(element) {
    if (!(element instanceof Element)) return null;
    if (isEditable(element)) return element;
    const editable = element.closest("[contenteditable]:not([contenteditable='false'])");
    return editable && isEditable(editable) ? editable : null;
  }

  function editorText(editor) {
    if (editor instanceof HTMLTextAreaElement || isTextInput(editor)) return editor.value;
    return editor.textContent || "";
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

  function textBoundary(root, requestedOffset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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

  function replaceMatch(editor, match, replacement) {
    if (!editor || !document.contains(editor)) return;
    editor.focus({ preventScroll: true });

    if (editor instanceof HTMLTextAreaElement || isTextInput(editor)) {
      editor.setRangeText(replacement, match.offset, match.offset + match.length, "end");
      emitInput(editor, replacement);
      scheduleCheck(editor, true);
      return;
    }

    const range = rangeForMatch(editor, match);
    if (!range) return;
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, replacement);
    } catch {
      inserted = false;
    }
    if (!inserted) {
      range.deleteContents();
      const textNode = document.createTextNode(replacement);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      emitInput(editor, replacement);
    }
    scheduleCheck(editor, true);
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
        .marker { position: fixed !important; height: 5px !important; padding: 0 !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; appearance: none !important; pointer-events: auto !important; cursor: pointer !important; background-color: transparent !important; background-image: linear-gradient(135deg, transparent 45%, #d93025 46%, #d93025 54%, transparent 55%), linear-gradient(45deg, transparent 45%, #d93025 46%, #d93025 54%, transparent 55%) !important; background-size: 6px 6px !important; background-position: 0 0, 3px 3px !important; }
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
        .issue-meta { margin: 0 0 8px !important; color: #697077 !important; font-size: 12px !important; }
        .suggestions { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; }
        .suggestion, .dismiss { max-width: 100% !important; padding: 6px 9px !important; border-radius: 8px !important; cursor: pointer !important; font: 600 13px/1.2 system-ui, sans-serif !important; }
        .suggestion { overflow: hidden !important; border: 1px solid #6d4aff !important; color: #4e2bc5 !important; background: #f4f0ff !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
        .dismiss { border: 1px solid #dadce0 !important; color: #5f6368 !important; background: #fff !important; }
        @media (prefers-color-scheme: dark) {
          .panel { color: #f1f3f4 !important; background: #202124 !important; border-color: #4a4d51 !important; }
          .issue-card { border-color: #3c4043 !important; }
          .empty, .issue-meta { color: #bdc1c6 !important; }
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
      this.clear();
    }

    render(editor, text, matches, error = "") {
      this.editor = editor;
      this.text = text;
      this.matches = matches;
      this.error = error;
      this.clear();
      if (!editor || !document.contains(editor)) return;

      if (editor instanceof HTMLTextAreaElement || isTextInput(editor)) {
        this.renderMirror(editor, text, matches);
      } else {
        this.renderRangeMarkers(editor, matches);
      }
      this.renderBadge(editor, matches, error);
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

      for (const segment of core.createSegments(text, matches)) {
        if (!segment.match) {
          mirror.append(document.createTextNode(segment.text));
          continue;
        }
        const span = document.createElement("span");
        span.className = "issue";
        span.textContent = segment.text;
        mirror.append(span);
      }
      if (editor instanceof HTMLTextAreaElement && text.endsWith("\n")) {
        mirror.append(document.createTextNode(" "));
      }
      clip.append(mirror);
      this.layer.append(clip);
    }

    renderRangeMarkers(editor, matches) {
      for (const match of matches) {
        const range = rangeForMatch(editor, match);
        if (!range) continue;
        for (const rect of range.getClientRects()) {
          if (rect.width <= 0 || rect.height <= 0) continue;
          const marker = document.createElement("button");
          marker.className = "marker";
          marker.type = "button";
          marker.title = match.message;
          marker.setAttribute("aria-label", match.message);
          marker.style.left = `${rect.left}px`;
          marker.style.top = `${Math.max(rect.top, rect.bottom - 3)}px`;
          marker.style.width = `${rect.width}px`;
          marker.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.panelOpen = true;
            this.render(editor, this.text, this.matches, this.error);
          });
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
        this.panelOpen = !this.panelOpen;
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
      const desiredLeft = Math.min(innerWidth - 372, Math.max(12, editorRect.right - 360));
      panel.style.left = `${Math.max(12, desiredLeft)}px`;
      const roomBelow = innerHeight - editorRect.bottom;
      panel.style.top = roomBelow >= 260
        ? `${Math.min(innerHeight - 12, editorRect.bottom + 8)}px`
        : `${Math.max(12, editorRect.top - 400)}px`;

      const header = document.createElement("div");
      header.className = "panel-header";
      const title = document.createElement("h2");
      title.className = "panel-title";
      title.textContent = matches.length ? `${matches.length} correction(s)` : "Eloquent Local Assistant";
      const close = document.createElement("button");
      close.className = "close";
      close.type = "button";
      close.textContent = "×";
      close.setAttribute("aria-label", "Fermer");
      close.addEventListener("click", () => {
        this.panelOpen = false;
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
        for (const match of matches) panel.append(this.createIssueCard(editor, match));
      }
      this.layer.append(panel);
    }

    createIssueCard(editor, match) {
      const card = document.createElement("article");
      card.className = "issue-card";
      const message = document.createElement("p");
      message.className = "issue-message";
      message.textContent = match.message;
      const meta = document.createElement("p");
      meta.className = "issue-meta";
      meta.textContent = `${match.category}${match.ruleId ? ` · ${match.ruleId}` : ""}`;
      const actions = document.createElement("div");
      actions.className = "suggestions";

      for (const replacement of match.replacements) {
        const button = document.createElement("button");
        button.className = "suggestion";
        button.type = "button";
        button.textContent = replacement || "Supprimer";
        button.title = replacement || "Supprimer ce texte";
        button.addEventListener("click", () => replaceMatch(editor, match, replacement));
        actions.append(button);
      }
      const dismiss = document.createElement("button");
      dismiss.className = "dismiss";
      dismiss.type = "button";
      dismiss.textContent = "Ignorer";
      dismiss.addEventListener("click", () => {
        this.matches = this.matches.filter((candidate) => candidate.id !== match.id);
        activeMatches = this.matches;
        this.render(editor, this.text, this.matches, this.error);
      });
      actions.append(dismiss);
      card.append(message, meta, actions);
      return card;
    }
  }

  const overlay = new ProofreadingOverlay();

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

  function scheduleCheck(editor, immediate = false) {
    if (!editor || !isEditable(editor) || !core.isDomainEnabled(settings, domain)) {
      overlay.hide();
      return;
    }
    activeEditor = editor;
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => performCheck(editor), immediate ? 0 : settings.delayMs);
  }

  async function performCheck(editor) {
    if (editor !== activeEditor || !document.contains(editor)) return;
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
    const editor = findEditable(event.target);
    if (editor) scheduleCheck(editor);
  }, true);

  document.addEventListener("input", (event) => {
    const editor = findEditable(event.target);
    if (editor) scheduleCheck(editor);
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

  refreshSettings().catch((error) => console.warn("Eloquent settings", error));
})();
