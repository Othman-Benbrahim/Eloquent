/* SPDX-License-Identifier: GPL-3.0-only */
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = resolve(root, "extension");
const manifest = JSON.parse(await readFile(resolve(extensionDir, "manifest.json"), "utf8"));
const failures = [];

function record(condition, message) {
  if (!condition) failures.push(message);
}

record(manifest.manifest_version === 3, "manifest_version doit être égal à 3");
record(/^\d+\.\d+\.\d+$/.test(manifest.version), "version invalide dans manifest.json");
record(Boolean(manifest.browser_specific_settings?.gecko?.id), "identifiant Gecko manquant");
record(
  manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required?.includes("none"),
  "déclaration AMO de collecte des données manquante",
);

const runtimePaths = new Set([
  "manifest.json",
  ...Object.values(manifest.icons || {}),
  manifest.action?.default_icon,
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  ...(manifest.background?.scripts || []),
  ...(manifest.content_scripts || []).flatMap((entry) => [...(entry.js || []), ...(entry.css || [])]),
].filter(Boolean));

for (const htmlPath of [manifest.action?.default_popup, manifest.options_ui?.page].filter(Boolean)) {
  const html = await readFile(resolve(extensionDir, htmlPath), "utf8");
  const base = dirname(htmlPath);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(?:https?:|data:|#)/.test(match[1])) continue;
    const absolutePath = resolve(extensionDir, base, match[1]);
    runtimePaths.add(absolutePath.slice(extensionDir.length + 1));
  }
}

for (const relativePath of runtimePaths) {
  try {
    await access(resolve(extensionDir, relativePath), constants.R_OK);
  } catch {
    failures.push(`fichier référencé introuvable : ${relativePath}`);
  }
}

const javascriptFiles = [...runtimePaths].filter((path) => path.endsWith(".js"));
for (const relativePath of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", resolve(extensionDir, relativePath)], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`syntaxe JavaScript invalide : ${relativePath}\n${result.stderr}`);
  const source = await readFile(resolve(extensionDir, relativePath), "utf8");
  if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(source)) failures.push(`code dynamique interdit : ${relativePath}`);
  if (/https?:\/\/(?!127\.0\.0\.1|localhost|\[::1\])/.test(source)) {
    failures.push(`URL distante détectée dans le code exécutable : ${relativePath}`);
  }
}

if (failures.length) {
  console.error("Validation échouée :");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Validation réussie : ${runtimePaths.size} fichiers référencés, ${javascriptFiles.length} scripts analysés.`);
