/* SPDX-License-Identifier: GPL-3.0-only */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const contentScript = readFileSync(resolve(__dirname, "../extension/content/content.js"), "utf8");
const manifest = require("../extension/manifest.json");

test("content script uses composed event paths for nested and shadow editors", () => {
  assert.match(contentScript, /event\.composedPath/);
  assert.match(contentScript, /root instanceof ShadowRoot \? root\.host/);
});

test("dynamic editors and editors in every frame are covered", () => {
  assert.match(contentScript, /new MutationObserver/);
  assert.match(contentScript, /editor\.isConnected/);
  assert.equal(manifest.content_scripts[0].all_frames, true);
  assert.equal(manifest.content_scripts[0].match_about_blank, true);
  assert.equal(manifest.content_scripts[0].match_origin_as_fallback, true);
});

test("legacy and ARIA-based online editors are recognized", () => {
  assert.match(contentScript, /getAttribute\("role"\) === "textbox"/);
  assert.match(contentScript, /-moz-user-modify/);
  assert.match(contentScript, /document\.designMode === "on"/);
});

test("LinkedIn and other dynamic rich editors have explicit detection fallbacks", () => {
  assert.match(contentScript, /\.ql-editor/);
  assert.match(contentScript, /\.ProseMirror/);
  assert.match(contentScript, /data-lexical-editor/);
  assert.match(contentScript, /findEditableFromSelection/);
  assert.match(contentScript, /addEventListener\("beforeinput"/);
  assert.match(contentScript, /addEventListener\("keyup"/);
  assert.match(contentScript, /editorText\(activeEditor\) !== activeText/);
});

test("clicks inside rich editors resolve to the editing host, not an inherited paragraph", () => {
  assert.match(contentScript, /const parent = composedParent\(element\)/);
  assert.match(contentScript, /!parent\.isContentEditable/);
  assert.match(contentScript, /!parentUserModify\.startsWith\("read-write"\)/);
  assert.match(contentScript, /element\.hasAttribute\("contenteditable"\)/);
});

test("clicking an underlined issue opens its focused suggestion", () => {
  assert.match(contentScript, /matchAtPoint\(editor, x, y\)/);
  assert.match(contentScript, /matchAtOffset\(editor, offset\)/);
  assert.match(contentScript, /textOffsetAtPoint\(editor, x, y\)/);
  assert.match(contentScript, /openMatch\(editor, match, anchor\)/);
  assert.match(contentScript, /this\.selectedMatchId = match\.id/);
  assert.match(contentScript, /anchorForMatch\(match\)/);
});

test("a click requests an immediate check when the clicked issue is not cached", () => {
  assert.match(contentScript, /pendingClick = \{ editor, offset, x, y, text: editorText\(editor\) \}/);
  assert.match(contentScript, /scheduleCheck\(editor, true\)/);
});

test("the correction panel hides internal LanguageTool metadata", () => {
  assert.doesNotMatch(contentScript, /className = "issue-meta"/);
  assert.doesNotMatch(contentScript, /meta\.textContent/);
});

test("an open correction panel survives focus changes until a choice is made", () => {
  assert.match(contentScript, /if \(overlay\.panelOpen\) return/);
});

test("stale markers are invalidated after edits and replacements", () => {
  assert.match(contentScript, /function resetVisibleResults\(editor, text = ""\)/);
  assert.match(contentScript, /scheduleCheck\(editor, false, true\)/);
  assert.match(contentScript, /requestGeneration \+= 1/);
});

test("a rejected replacement is retried and checked against the expected text", () => {
  assert.match(contentScript, /for \(const delay of \[0, 40, 160\]\)/);
  assert.match(contentScript, /editorText\(editor\) === expectedText\) continue/);
  assert.match(contentScript, /locateMatchOffset\(currentText, currentMatch, originalText\)/);
});

test("rich editors receive only one replacement transaction per click", () => {
  assert.match(contentScript, /core\.shouldUseRichEditorFallback/);
  assert.match(contentScript, /if \(!useFallback\)/);
  assert.match(contentScript, /const textControl = editor instanceof HTMLTextAreaElement/);
  assert.match(contentScript, /Un éditeur riche reçoit exactement une transaction par clic/);
  assert.doesNotMatch(
    contentScript,
    /else \{\s*applyRichEditorReplacement\(editor, retryOffset/s,
  );
});

test("suggestion clicks preserve the editor selection and use the rendered snapshot", () => {
  assert.match(contentScript, /button\.addEventListener\("pointerdown", keepEditorSelection\)/);
  assert.match(contentScript, /event\.preventDefault\(\)/);
  assert.match(contentScript, /event\.stopPropagation\(\)/);
  assert.match(contentScript, /replaceMatch\(editor, match, replacement, this\.text\)/);
  assert.match(contentScript, /eventComesFromOverlay\(event\)/);
});

test("replacement is committed as a native editing transaction", () => {
  assert.match(contentScript, /InputEvent\("beforeinput"/);
  assert.match(contentScript, /inputType: "insertReplacementText"/);
  assert.match(contentScript, /Object\.getOwnPropertyDescriptor\(prototype, "value"\)\.set/);
  assert.match(contentScript, /editor\.ownerDocument\.execCommand\("insertText"/);
  assert.match(contentScript, /replacementEditors\.has\(editor\)/);
});

test("the issue badge is rendered only when useful", () => {
  assert.match(contentScript, /if \(matches\.length \|\| error\) this\.renderBadge/);
});
