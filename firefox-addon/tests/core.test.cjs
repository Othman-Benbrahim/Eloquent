/* SPDX-License-Identifier: GPL-3.0-only */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../extension/shared/core.js");

test("the default endpoint is a loopback LanguageTool v2 endpoint", () => {
  assert.equal(core.normalizeEndpoint(core.DEFAULT_SETTINGS.endpoint), "http://127.0.0.1:8081/v2");
});

test("new installations use the thorough proofreading level", () => {
  assert.equal(core.DEFAULT_SETTINGS.level, "picky");
});

test("only loopback server endpoints are accepted", () => {
  assert.equal(core.normalizeEndpoint("http://localhost:8081/v2/"), "http://localhost:8081/v2");
  assert.equal(core.normalizeEndpoint("http://[::1]:8081/v2"), "http://[::1]:8081/v2");
  assert.throws(() => core.normalizeEndpoint("https://api.languagetool.org/v2"), /Seuls localhost/);
  assert.throws(() => core.normalizeEndpoint("file:///tmp/v2"), /Seuls localhost|HTTP/);
  assert.throws(() => core.normalizeEndpoint("http://localhost:8081/api"), /terminer par \/v2/);
});

test("settings are clamped and deduplicate disabled domains", () => {
  const settings = core.mergeSettings({
    delayMs: 20,
    minTextLength: 0,
    maxTextLength: 90000,
    disabledDomains: ["WWW.Example.com", "example.com", ""],
  });
  assert.equal(settings.delayMs, 250);
  assert.equal(settings.minTextLength, 1);
  assert.equal(settings.maxTextLength, 50000);
  assert.deepEqual(settings.disabledDomains, ["example.com"]);
});

test("domain settings include subdomains", () => {
  const settings = core.mergeSettings({ disabledDomains: ["example.com"] });
  assert.equal(core.isDomainEnabled(settings, "example.com"), false);
  assert.equal(core.isDomainEnabled(settings, "chat.example.com"), false);
  assert.equal(core.isDomainEnabled(settings, "notexample.com"), true);
});

test("a domain can be disabled and enabled again", () => {
  const disabled = core.setDomainEnabled(core.DEFAULT_SETTINGS, "WWW.ChatGPT.com", false);
  assert.deepEqual(disabled.disabledDomains, ["chatgpt.com"]);
  const enabled = core.setDomainEnabled(disabled, "chatgpt.com", true);
  assert.deepEqual(enabled.disabledDomains, []);
});

test("LanguageTool request body is local-server compatible", () => {
  const body = core.buildCheckBody("Une phrase.", {
    ...core.DEFAULT_SETTINGS,
    language: "auto",
    preferredVariants: "fr-FR,en-US",
    level: "picky",
  });
  assert.equal(body.get("text"), "Une phrase.");
  assert.equal(body.get("language"), "auto");
  assert.equal(body.get("preferredVariants"), "fr-FR,en-US");
  assert.equal(body.get("level"), "picky");
});

test("automatic language selection detects French without LanguageTool auto mode", () => {
  const language = core.resolveLanguage("Ceci est un teste.", core.DEFAULT_SETTINGS, {
    pageLanguage: "en-US",
  });
  assert.equal(language, "fr-FR");
});

test("automatic language selection detects English and keeps the preferred variant", () => {
  const language = core.resolveLanguage("This is a simple test.", {
    ...core.DEFAULT_SETTINGS,
    preferredVariants: "fr-FR,en-GB",
  });
  assert.equal(language, "en-GB");
});

test("an editor language hint resolves ambiguous short text", () => {
  assert.equal(
    core.resolveLanguage("xyz", core.DEFAULT_SETTINGS, { editorLanguage: "de" }),
    "de-DE",
  );
});

test("automatic language selection falls back to French", () => {
  assert.equal(core.resolveLanguage("xyz", core.DEFAULT_SETTINGS), "fr-FR");
});

test("an explicitly configured language always wins", () => {
  assert.equal(
    core.resolveLanguage("Ceci est français.", { ...core.DEFAULT_SETTINGS, language: "en-GB" }),
    "en-GB",
  );
});

test("LanguageTool matches are normalized and unsafe entries removed", () => {
  const matches = core.normalizeMatches({
    matches: [
      {
        offset: 5,
        length: 3,
        message: "Message",
        replacements: [{ value: "test" }, { value: "test" }, { value: "texte" }],
        rule: { id: "RULE", issueType: "misspelling", category: { name: "Orthographe" } },
      },
      { offset: 100, length: 4, message: "Out of bounds" },
      { offset: 1, length: 0, message: "Empty" },
    ],
  }, 20);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].ruleId, "RULE");
  assert.equal(matches[0].category, "Orthographe");
  assert.deepEqual(matches[0].replacements, ["test", "texte"]);
});

test("segments preserve the original text and skip overlapping matches", () => {
  const text = "Ceci est un teste.";
  const matches = [
    { id: "a", offset: 12, length: 5 },
    { id: "b", offset: 13, length: 2 },
  ];
  const segments = core.createSegments(text, matches);
  assert.equal(segments.map((segment) => segment.text).join(""), text);
  assert.equal(segments.filter((segment) => segment.match).length, 1);
});

test("replacement uses LanguageTool UTF-16 offsets", () => {
  assert.equal(
    core.applyReplacementToText("Ceci est un teste.", { offset: 12, length: 5 }, "test"),
    "Ceci est un test.",
  );
});

test("French contextual proofreading catches the noun typo in 'un teste'", () => {
  const matches = core.contextualMatches("Ceci est un teste.", "fr-FR");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].offset, 12);
  assert.equal(matches[0].length, 5);
  assert.deepEqual(matches[0].replacements, ["test"]);
});

test("French contextual proofreading keeps the valid verb form 'teste'", () => {
  assert.deepEqual(core.contextualMatches("Je teste le programme.", "fr-FR"), []);
});

test("contextual and server matches are merged without duplicate underlines", () => {
  const contextual = core.contextualMatches("Ceci est un teste.", "fr-FR");
  const server = [{
    id: "server",
    offset: 16,
    length: 1,
    message: "Retirez cette lettre.",
    replacements: [""],
  }];
  const matches = core.mergeMatches(server, contextual);
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].replacements, ["test", ""]);
});
