/* SPDX-License-Identifier: GPL-3.0-only */
"use strict";

const core = globalThis.EloquentCore;
const fields = {
  endpoint: document.querySelector("#endpoint"),
  enabled: document.querySelector("#enabled"),
  language: document.querySelector("#language"),
  level: document.querySelector("#level"),
  delayMs: document.querySelector("#delay-ms"),
  preferredVariants: document.querySelector("#preferred-variants"),
};
const saveButton = document.querySelector("#save");
const saveStatus = document.querySelector("#save-status");
const testButton = document.querySelector("#test-server");
const serverStatus = document.querySelector("#server-status");
let settings = core.mergeSettings(core.DEFAULT_SETTINGS);

function setStatus(output, message, state = "") {
  output.textContent = message;
  if (state) output.dataset.state = state;
  else delete output.dataset.state;
}

function render(next) {
  settings = core.mergeSettings(next);
  fields.endpoint.value = settings.endpoint;
  fields.enabled.checked = settings.enabled;
  fields.language.value = settings.language;
  if (!fields.language.value) fields.language.value = "auto";
  fields.level.value = settings.level;
  fields.delayMs.value = String(settings.delayMs);
  if (!fields.delayMs.value) fields.delayMs.value = "650";
  fields.preferredVariants.value = settings.preferredVariants;
}

function readForm() {
  return core.mergeSettings({
    ...settings,
    endpoint: fields.endpoint.value,
    enabled: fields.enabled.checked,
    language: fields.language.value,
    level: fields.level.value,
    delayMs: fields.delayMs.value,
    preferredVariants: fields.preferredVariants.value,
  });
}

async function load() {
  const response = await browser.runtime.sendMessage({ type: "getSettings" });
  if (!response || !response.ok) throw new Error("Impossible de charger les paramètres.");
  render(response.settings);
}

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;
  setStatus(saveStatus, "Enregistrement…");
  try {
    const response = await browser.runtime.sendMessage({ type: "saveSettings", settings: readForm() });
    if (!response || !response.ok) throw new Error(response && response.error ? response.error : "Échec de l’enregistrement.");
    render(response.settings);
    setStatus(saveStatus, "Paramètres enregistrés.", "success");
  } catch (error) {
    setStatus(saveStatus, error.message, "error");
  } finally {
    saveButton.disabled = false;
  }
});

testButton.addEventListener("click", async () => {
  testButton.disabled = true;
  setStatus(serverStatus, "Connexion…");
  try {
    const saved = await browser.runtime.sendMessage({ type: "saveSettings", settings: readForm() });
    if (!saved || !saved.ok) throw new Error(saved && saved.error ? saved.error : "Paramètres invalides.");
    render(saved.settings);
    const response = await browser.runtime.sendMessage({ type: "testServer" });
    if (!response || !response.ok) throw new Error(response && response.error ? response.error : "Serveur indisponible.");
    setStatus(serverStatus, `LanguageTool ${response.version} répond en ${response.latencyMs} ms.`, "success");
  } catch (error) {
    setStatus(serverStatus, error.message, "error");
  } finally {
    testButton.disabled = false;
  }
});

load().catch((error) => setStatus(saveStatus, error.message, "error"));
