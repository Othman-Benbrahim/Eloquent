/* SPDX-License-Identifier: GPL-3.0-only */
"use strict";

const pageSection = document.querySelector("#page-state");
const unavailable = document.querySelector("#unavailable");
const domainLabel = document.querySelector("#domain");
const siteEnabled = document.querySelector("#site-enabled");
const issueCount = document.querySelector("#issue-count");
let activeTab = null;
let pageState = null;

async function loadPageState() {
  [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || activeTab.id === undefined) throw new Error("Onglet indisponible.");
  pageState = await browser.tabs.sendMessage(activeTab.id, { type: "getPageState" });
  if (!pageState || !pageState.ok || !pageState.domain) {
    throw new Error("La correction n’est pas disponible sur cette page Firefox.");
  }

  domainLabel.textContent = pageState.domain;
  domainLabel.title = pageState.domain;
  siteEnabled.checked = pageState.enabled;
  if (pageState.serverError) {
    issueCount.textContent = pageState.serverError;
    issueCount.classList.add("error");
  } else {
    issueCount.textContent = pageState.issueCount
      ? `${pageState.issueCount} correction(s) dans le champ actif.`
      : "Aucune correction en attente.";
  }
  unavailable.hidden = true;
  pageSection.hidden = false;
}

siteEnabled.addEventListener("change", async () => {
  siteEnabled.disabled = true;
  try {
    const response = await browser.runtime.sendMessage({
      type: "setDomainEnabled",
      domain: pageState.domain,
      enabled: siteEnabled.checked,
    });
    if (!response || !response.ok) throw new Error(response && response.error ? response.error : "Modification impossible.");
    await browser.tabs.sendMessage(activeTab.id, { type: "refreshPageSettings" });
  } catch (error) {
    siteEnabled.checked = !siteEnabled.checked;
    issueCount.textContent = error.message;
    issueCount.classList.add("error");
  } finally {
    siteEnabled.disabled = false;
  }
});

document.querySelector("#open-options").addEventListener("click", () => browser.runtime.openOptionsPage());

loadPageState().catch((error) => {
  unavailable.textContent = error.message;
  unavailable.classList.add("error");
});
