/*
 * Eloquent Local Assistant
 * SPDX-License-Identifier: GPL-3.0-only
 */
"use strict";

const core = globalThis.EloquentCore;
const SETTINGS_KEY = "settings";
const REQUEST_TIMEOUT_MS = 12000;

async function loadSettings() {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  try {
    return core.mergeSettings(stored[SETTINGS_KEY]);
  } catch (error) {
    console.warn("Invalid settings were reset", error);
    return core.mergeSettings(core.DEFAULT_SETTINGS);
  }
}

async function saveSettings(settings) {
  const normalized = core.mergeSettings(settings);
  await browser.storage.local.set({ [SETTINGS_KEY]: normalized });
  return normalized;
}

async function requestLocalServer(path, options = {}) {
  const settings = await loadSettings();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${settings.endpoint}${path}`, {
      ...options,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Le serveur local a répondu ${response.status}.`);
    return await response.json();
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("Le serveur local met trop de temps à répondre.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkText(message, sender) {
  const settings = await loadSettings();
  const domain = core.normalizeDomain(message.domain || "");
  const text = String(message.text || "");

  if (!core.isDomainEnabled(settings, domain)) {
    return { ok: true, disabled: true, matches: [] };
  }
  if (text.trim().length < settings.minTextLength) {
    return { ok: true, matches: [] };
  }
  if (text.length > settings.maxTextLength) {
    return {
      ok: false,
      error: `Le texte dépasse la limite locale de ${settings.maxTextLength} caractères.`,
      code: "TEXT_TOO_LONG",
    };
  }

  const body = core.buildCheckBody(text, settings);
  const payload = await requestLocalServer("/check", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  });

  return {
    ok: true,
    matches: core.normalizeMatches(payload, text.length),
    language: payload.language || null,
    software: payload.software || null,
    frameId: sender.frameId,
  };
}

async function testServer() {
  const settings = await loadSettings();
  const body = core.buildCheckBody("Ceci est un teste.", { ...settings, language: "fr" });
  const startedAt = Date.now();
  const payload = await requestLocalServer("/check", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  });
  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    version: payload.software && payload.software.version ? payload.software.version : "inconnue",
  };
}

browser.runtime.onInstalled.addListener(async ({ reason }) => {
  const current = await loadSettings();
  await saveSettings(current);
  if (reason === "install") {
    await browser.runtime.openOptionsPage();
  }
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  try {
    switch (message && message.type) {
      case "checkText":
        return await checkText(message, sender);
      case "getSettings":
        return { ok: true, settings: await loadSettings() };
      case "saveSettings":
        return { ok: true, settings: await saveSettings(message.settings) };
      case "setDomainEnabled": {
        const settings = await loadSettings();
        const next = core.setDomainEnabled(settings, message.domain, Boolean(message.enabled));
        await saveSettings(next);
        return { ok: true, settings: next };
      }
      case "testServer":
        return await testServer();
      default:
        return { ok: false, error: "Message inconnu.", code: "UNKNOWN_MESSAGE" };
    }
  } catch (error) {
    console.error("Eloquent Local Assistant", error);
    return {
      ok: false,
      error: error && error.message ? error.message : "Impossible de joindre le serveur LanguageTool local.",
      code: "LOCAL_SERVER_ERROR",
    };
  }
});
