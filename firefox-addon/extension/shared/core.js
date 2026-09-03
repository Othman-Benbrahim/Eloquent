/*
 * Eloquent Local Assistant
 * SPDX-License-Identifier: GPL-3.0-only
 */
(function exposeCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.EloquentCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildCore() {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    endpoint: "http://127.0.0.1:8081/v2",
    language: "auto",
    preferredVariants: "fr-FR,en-US",
    level: "default",
    delayMs: 650,
    minTextLength: 3,
    maxTextLength: 20000,
    disabledDomains: [],
  });

  const SUPPORTED_LEVELS = new Set(["default", "picky"]);

  function clampInteger(value, minimum, maximum, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
  }

  function isLoopbackHostname(hostname) {
    const normalized = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
    return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
  }

  function normalizeEndpoint(value) {
    let url;
    try {
      url = new URL(String(value || DEFAULT_SETTINGS.endpoint));
    } catch {
      throw new Error("L’adresse du serveur local n’est pas valide.");
    }

    if (!isLoopbackHostname(url.hostname)) {
      throw new Error("Seuls localhost, 127.0.0.1 et ::1 sont autorisés.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Le serveur doit utiliser HTTP ou HTTPS.");
    }

    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    if (!url.pathname || url.pathname === "/") url.pathname = "/v2";
    if (!url.pathname.endsWith("/v2")) {
      throw new Error("L’adresse doit se terminer par /v2.");
    }
    return url.toString().replace(/\/$/, "");
  }

  function normalizeDomain(domain) {
    return String(domain || "").trim().toLowerCase().replace(/^www\./, "");
  }

  function mergeSettings(input) {
    const candidate = input && typeof input === "object" ? input : {};
    const disabledDomains = Array.isArray(candidate.disabledDomains)
      ? [...new Set(candidate.disabledDomains.map(normalizeDomain).filter(Boolean))]
      : [];

    return {
      enabled: candidate.enabled !== false,
      endpoint: normalizeEndpoint(candidate.endpoint || DEFAULT_SETTINGS.endpoint),
      language: String(candidate.language || DEFAULT_SETTINGS.language),
      preferredVariants: String(candidate.preferredVariants || DEFAULT_SETTINGS.preferredVariants),
      level: SUPPORTED_LEVELS.has(candidate.level) ? candidate.level : DEFAULT_SETTINGS.level,
      delayMs: clampInteger(candidate.delayMs, 250, 3000, DEFAULT_SETTINGS.delayMs),
      minTextLength: clampInteger(candidate.minTextLength, 1, 100, DEFAULT_SETTINGS.minTextLength),
      maxTextLength: clampInteger(candidate.maxTextLength, 500, 50000, DEFAULT_SETTINGS.maxTextLength),
      disabledDomains,
    };
  }

  function isDomainEnabled(settings, domain) {
    const normalized = normalizeDomain(domain);
    if (!settings.enabled) return false;
    return !settings.disabledDomains.some((blocked) =>
      normalized === blocked || normalized.endsWith(`.${blocked}`),
    );
  }

  function setDomainEnabled(settings, domain, enabled) {
    const normalized = normalizeDomain(domain);
    const next = mergeSettings(settings);
    const domains = new Set(next.disabledDomains);
    if (enabled) domains.delete(normalized);
    else if (normalized) domains.add(normalized);
    next.disabledDomains = [...domains].sort();
    return next;
  }

  function buildCheckBody(text, settings) {
    const safe = mergeSettings(settings);
    const body = new URLSearchParams();
    body.set("text", String(text || "").slice(0, safe.maxTextLength));
    body.set("language", safe.language);
    body.set("level", safe.level);
    if (safe.language === "auto" && safe.preferredVariants) {
      body.set("preferredVariants", safe.preferredVariants);
    }
    return body;
  }

  function normalizeMatches(payload, textLength) {
    const rawMatches = Array.isArray(payload && payload.matches) ? payload.matches : [];
    const maximum = Math.max(0, Number(textLength) || 0);

    return rawMatches
      .map((match, index) => {
        const offset = clampInteger(match.offset, 0, maximum, 0);
        const length = clampInteger(match.length, 0, maximum - offset, 0);
        const replacements = Array.isArray(match.replacements)
          ? match.replacements
              .map((item) => String(item && item.value !== undefined ? item.value : ""))
              .filter((value, position, all) => all.indexOf(value) === position)
              .slice(0, 8)
          : [];
        return {
          id: `${match.rule && match.rule.id ? match.rule.id : "issue"}:${offset}:${length}:${index}`,
          offset,
          length,
          message: String(match.message || "Correction proposée"),
          shortMessage: String(match.shortMessage || ""),
          replacements,
          ruleId: String((match.rule && match.rule.id) || ""),
          category: String((match.rule && match.rule.category && match.rule.category.name) || "Grammaire"),
          issueType: String((match.rule && match.rule.issueType) || "grammar"),
        };
      })
      .filter((match) => match.length > 0 && match.offset + match.length <= maximum)
      .sort((left, right) => left.offset - right.offset || right.length - left.length);
  }

  function createSegments(text, matches) {
    const source = String(text || "");
    const segments = [];
    let cursor = 0;

    for (const match of matches || []) {
      if (match.offset < cursor || match.offset >= source.length) continue;
      if (match.offset > cursor) {
        segments.push({ text: source.slice(cursor, match.offset), match: null });
      }
      const end = Math.min(source.length, match.offset + match.length);
      segments.push({ text: source.slice(match.offset, end), match });
      cursor = end;
    }
    if (cursor < source.length) segments.push({ text: source.slice(cursor), match: null });
    if (!segments.length && source) segments.push({ text: source, match: null });
    return segments;
  }

  function applyReplacementToText(text, match, replacement) {
    const source = String(text || "");
    const start = clampInteger(match && match.offset, 0, source.length, 0);
    const length = clampInteger(match && match.length, 0, source.length - start, 0);
    return `${source.slice(0, start)}${String(replacement)}${source.slice(start + length)}`;
  }

  return Object.freeze({
    DEFAULT_SETTINGS,
    applyReplacementToText,
    buildCheckBody,
    createSegments,
    isDomainEnabled,
    isLoopbackHostname,
    mergeSettings,
    normalizeDomain,
    normalizeEndpoint,
    normalizeMatches,
    setDomainEnabled,
  });
});
