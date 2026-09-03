/* SPDX-License-Identifier: GPL-3.0-only */
"use strict";

const elements = {
  statusDot: document.querySelector("#status-dot"),
  statusTitle: document.querySelector("#status-title"),
  statusMessage: document.querySelector("#status-message"),
  endpoint: document.querySelector("#endpoint"),
  start: document.querySelector("#start-engine"),
  stop: document.querySelector("#stop-engine"),
  refresh: document.querySelector("#refresh-status"),
  form: document.querySelector("#settings-form"),
  port: document.querySelector("#port"),
  javaPath: document.querySelector("#java-path"),
  languageToolPath: document.querySelector("#languagetool-path"),
  startEngineOnLaunch: document.querySelector("#start-engine-on-launch"),
  startAppOnLogin: document.querySelector("#start-app-on-login"),
  saveResult: document.querySelector("#save-result"),
  detectedJava: document.querySelector("#detected-java"),
  detectedJar: document.querySelector("#detected-jar"),
  processId: document.querySelector("#process-id"),
  selectEndpoint: document.querySelector("#select-endpoint"),
};

const stateLabels = {
  running: "Moteur disponible",
  starting: "Démarrage en cours",
  stopped: "Moteur arrêté",
  missing_java: "Java est requis",
  missing_language_tool: "LanguageTool est requis",
  port_occupied: "Port indisponible",
  error: "Une erreur est survenue",
};

function tauriApi() {
  const api = window.__TAURI__;
  if (!api || !api.core || typeof api.core.invoke !== "function") {
    throw new Error("Cette interface doit être ouverte depuis l'application Eloquent Local Companion.");
  }
  return api;
}

async function invoke(command, argumentsValue = {}) {
  return tauriApi().core.invoke(command, argumentsValue);
}

function setBusy(busy) {
  elements.start.disabled = busy;
  elements.stop.disabled = busy;
  elements.refresh.disabled = busy;
}

function renderStatus(status) {
  const state = status.state || "error";
  elements.statusDot.className = `status-dot ${state === "running" ? "running" : state === "starting" ? "starting" : state === "stopped" ? "unknown" : "error"}`;
  elements.statusTitle.textContent = stateLabels[state] || stateLabels.error;
  elements.statusMessage.textContent = status.message || "État indisponible.";
  elements.endpoint.textContent = status.endpoint || `http://127.0.0.1:${elements.port.value || 8082}/v2`;
  elements.detectedJava.textContent = status.javaPath || "Non détecté";
  elements.detectedJar.textContent = status.languageToolJar || "Non détecté";
  elements.processId.textContent = status.processId
    ? `${status.processId}${status.managed ? " · géré par Eloquent" : ""}`
    : (state === "running" ? "Serveur externe conservé" : "—");
  elements.start.disabled = state === "running" || state === "starting";
  elements.stop.disabled = state !== "running" || !status.managed;
}

function renderError(error) {
  renderStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
}

async function refreshStatus() {
  try {
    renderStatus(await invoke("get_status"));
  } catch (error) {
    renderError(error);
  }
}

async function loadSettings() {
  const settings = await invoke("get_settings");
  elements.port.value = settings.port;
  elements.javaPath.value = settings.javaPath || "";
  elements.languageToolPath.value = settings.languageToolPath || "";
  elements.startEngineOnLaunch.checked = settings.startEngineOnLaunch;
  elements.startAppOnLogin.checked = settings.startAppOnLogin;
  elements.endpoint.textContent = `http://127.0.0.1:${settings.port}/v2`;

  try {
    elements.startAppOnLogin.checked = await tauriApi().autostart.isEnabled();
  } catch {
    // La valeur du fichier de configuration reste utilisable en mode développement.
  }
}

function formSettings() {
  return {
    port: Number.parseInt(elements.port.value, 10),
    javaPath: elements.javaPath.value.trim() || null,
    languageToolPath: elements.languageToolPath.value.trim() || null,
    startEngineOnLaunch: elements.startEngineOnLaunch.checked,
    startAppOnLogin: elements.startAppOnLogin.checked,
  };
}

async function updateAutostart(enabled) {
  const autostart = tauriApi().autostart;
  if (enabled) await autostart.enable();
  else await autostart.disable();
}

elements.start.addEventListener("click", async () => {
  setBusy(true);
  try {
    renderStatus(await invoke("start_engine"));
  } catch (error) {
    renderError(error);
  } finally {
    setBusy(false);
    await refreshStatus();
  }
});

elements.stop.addEventListener("click", async () => {
  setBusy(true);
  try {
    renderStatus(await invoke("stop_engine"));
  } catch (error) {
    renderError(error);
  } finally {
    setBusy(false);
    await refreshStatus();
  }
});

elements.refresh.addEventListener("click", refreshStatus);

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.saveResult.className = "save-result";
  elements.saveResult.textContent = "Enregistrement…";
  try {
    const settings = formSettings();
    await invoke("save_settings", { settings });
    let autostartWarning = "";
    try {
      await updateAutostart(settings.startAppOnLogin);
    } catch {
      autostartWarning = " Le démarrage avec la session n’est pas disponible dans ce sandbox.";
    }
    elements.saveResult.className = "save-result success";
    elements.saveResult.textContent = `Configuration enregistrée.${autostartWarning}`;
    await refreshStatus();
  } catch (error) {
    elements.saveResult.className = "save-result error";
    elements.saveResult.textContent = error instanceof Error ? error.message : String(error);
  }
});

elements.selectEndpoint.addEventListener("click", () => {
  const range = document.createRange();
  range.selectNodeContents(elements.endpoint);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
});

async function initialize() {
  try {
    await loadSettings();
    await refreshStatus();
    setInterval(refreshStatus, 5000);
  } catch (error) {
    renderError(error);
  }
}

initialize();
