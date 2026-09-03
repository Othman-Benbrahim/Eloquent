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
    level: "picky",
    delayMs: 650,
    minTextLength: 3,
    maxTextLength: 20000,
    disabledDomains: [],
  });

  const SUPPORTED_LEVELS = new Set(["default", "picky"]);
  const LANGUAGE_DEFAULTS = Object.freeze({
    fr: "fr-FR",
    en: "en-US",
    de: "de-DE",
    es: "es",
    it: "it",
    pt: "pt-PT",
  });
  const LANGUAGE_MARKERS = Object.freeze({
    fr: new Set([
      "ai", "au", "aux", "avec", "avoir", "bonjour", "car", "ce", "ceci", "ces", "cette",
      "comme", "dans", "de", "des", "donc", "du", "elle", "en", "est", "et", "faire", "fait",
      "il", "ils", "je", "la", "le", "les", "mais", "mes", "mon", "ne", "nous", "on", "ou",
      "où", "pas", "plus", "pour", "que", "qui", "sa", "se", "ses", "sont", "sur", "très",
      "tu", "un", "une", "vous", "ça", "être",
    ]),
    en: new Set([
      "a", "about", "am", "an", "and", "are", "as", "be", "been", "but", "do", "does", "for",
      "from", "has", "have", "he", "hello", "i", "in", "is", "it", "my", "not", "of", "on",
      "or", "our", "she", "that", "the", "their", "these", "they", "this", "to", "was", "we",
      "were", "with", "you", "your",
    ]),
    de: new Set([
      "aber", "auch", "auf", "das", "der", "die", "ein", "eine", "er", "es", "für", "hallo",
      "ich", "im", "ist", "mit", "nicht", "sie", "sind", "und", "von", "was", "wir", "zu",
    ]),
    es: new Set([
      "al", "con", "de", "del", "el", "ella", "en", "es", "esta", "gracias", "hola", "la", "las",
      "los", "no", "para", "pero", "por", "que", "se", "son", "un", "una", "y", "yo",
    ]),
    it: new Set([
      "che", "ciao", "con", "da", "di", "e", "gli", "il", "in", "io", "la", "le", "ma", "non",
      "per", "sono", "un", "una",
    ]),
    pt: new Set([
      "as", "com", "da", "de", "do", "e", "ela", "ele", "em", "eu", "não", "obrigado", "oi", "os",
      "para", "por", "que", "se", "são", "um", "uma",
    ]),
  });

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

  function preferredVariant(base, preferredVariants) {
    const variants = String(preferredVariants || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return variants.find((value) => value.toLowerCase().startsWith(`${base}-`))
      || LANGUAGE_DEFAULTS[base]
      || "fr-FR";
  }

  function normalizeLanguageTag(value, preferredVariants = "") {
    const raw = String(value || "").trim().replace(/_/g, "-");
    if (!raw || raw.toLowerCase() === "auto") return "";
    const [base] = raw.toLowerCase().split("-");
    if (!LANGUAGE_DEFAULTS[base]) return "";

    if (base === "en") {
      if (/^en-gb\b/i.test(raw)) return "en-GB";
      return preferredVariant("en", preferredVariants);
    }
    if (base === "fr") {
      if (/^fr-ca\b/i.test(raw)) return "fr-CA";
      return preferredVariant("fr", preferredVariants);
    }
    if (base === "pt") {
      if (/^pt-br\b/i.test(raw)) return "pt-BR";
      return preferredVariant("pt", preferredVariants);
    }
    return LANGUAGE_DEFAULTS[base];
  }

  function languageBase(value) {
    return String(value || "").toLowerCase().split("-")[0];
  }

  function detectLanguage(text, hints = {}, preferredVariants = DEFAULT_SETTINGS.preferredVariants) {
    const source = String(text || "").toLocaleLowerCase();
    const scores = Object.fromEntries(Object.keys(LANGUAGE_MARKERS).map((base) => [base, 0]));
    const tokens = source.match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu) || [];

    for (const token of tokens) {
      const parts = token.split(/['’]/).filter(Boolean);
      for (const part of [token, ...parts]) {
        for (const [base, markers] of Object.entries(LANGUAGE_MARKERS)) {
          if (markers.has(part)) scores[base] += 2;
        }
      }
    }

    if (/[œæçàâêëîïôùûÿ]/u.test(source)) scores.fr += 3;
    if (/[äöüß]/u.test(source)) scores.de += 3;
    if (/[ñ¿¡]/u.test(source)) scores.es += 3;
    if (/[ãõ]/u.test(source)) scores.pt += 3;

    const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
    const [bestBase, bestScore] = ranked[0];
    const secondScore = ranked[1][1];
    if (bestScore >= 2 && bestScore - secondScore >= 2) {
      return preferredVariant(bestBase, preferredVariants);
    }

    const editorHint = normalizeLanguageTag(hints.editorLanguage, preferredVariants);
    if (editorHint) return editorHint;
    const pageHint = normalizeLanguageTag(hints.pageLanguage, preferredVariants);
    if (pageHint) return pageHint;

    return preferredVariant("fr", preferredVariants);
  }

  function resolveLanguage(text, settings, hints = {}) {
    const safe = mergeSettings(settings);
    const configured = normalizeLanguageTag(safe.language, safe.preferredVariants);
    if (configured) return configured;
    return detectLanguage(text, hints, safe.preferredVariants);
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

  function contextualMatches(text, language) {
    const source = String(text || "");
    if (languageBase(language) !== "fr") return [];

    const rules = [
      {
        expression: /\b(?:un|le|ce|du|au)\s+(teste)\b/giu,
        replacement: "test",
        message: "Dans ce contexte, le nom s’écrit « test ».",
        ruleId: "LOCAL_FR_NOUN_TEST",
      },
      {
        expression: /\b(?:des|les|ces|plusieurs)\s+(testes)\b/giu,
        replacement: "tests",
        message: "Dans ce contexte, le pluriel du nom s’écrit « tests ».",
        ruleId: "LOCAL_FR_NOUN_TESTS",
      },
    ];
    const matches = [];

    for (const rule of rules) {
      for (const result of source.matchAll(rule.expression)) {
        const target = result[1];
        const offset = result.index + result[0].lastIndexOf(target);
        const replacement = /^[A-ZÀ-ÖØ-Þ]/u.test(target)
          ? `${rule.replacement[0].toUpperCase()}${rule.replacement.slice(1)}`
          : rule.replacement;
        matches.push({
          id: `${rule.ruleId}:${offset}:${target.length}`,
          offset,
          length: target.length,
          message: rule.message,
          shortMessage: "",
          replacements: [replacement],
          ruleId: rule.ruleId,
          category: "Orthographe",
          issueType: "misspelling",
        });
      }
    }
    return matches;
  }

  function mergeMatches(primary, supplemental) {
    const merged = [];
    const candidates = [...(supplemental || []), ...(primary || [])]
      .sort((left, right) => left.offset - right.offset || right.length - left.length);

    for (const candidate of candidates) {
      const overlapping = merged.find((existing) =>
        candidate.offset < existing.offset + existing.length
        && existing.offset < candidate.offset + candidate.length,
      );
      if (!overlapping) {
        merged.push({ ...candidate, replacements: [...candidate.replacements] });
        continue;
      }
      overlapping.replacements = [...new Set([
        ...overlapping.replacements,
        ...candidate.replacements,
      ])].slice(0, 8);
    }

    return merged.sort((left, right) => left.offset - right.offset || right.length - left.length);
  }

  return Object.freeze({
    DEFAULT_SETTINGS,
    applyReplacementToText,
    buildCheckBody,
    contextualMatches,
    createSegments,
    detectLanguage,
    isDomainEnabled,
    isLoopbackHostname,
    languageBase,
    mergeSettings,
    mergeMatches,
    normalizeDomain,
    normalizeEndpoint,
    normalizeLanguageTag,
    normalizeMatches,
    resolveLanguage,
    setDomainEnabled,
  });
});
