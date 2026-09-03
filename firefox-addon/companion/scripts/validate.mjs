/* SPDX-License-Identifier: GPL-3.0-only */
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const configuration = JSON.parse(await readFile(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
const packageManifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const capabilities = JSON.parse(await readFile(resolve(root, "src-tauri/capabilities/default.json"), "utf8"));
const cargoManifest = await readFile(resolve(root, "src-tauri/Cargo.toml"), "utf8");
const rustEntry = await readFile(resolve(root, "src-tauri/src/lib.rs"), "utf8");
const coreEngine = await readFile(resolve(root, "core/src/engine.rs"), "utf8");

function record(condition, message) {
  if (!condition) failures.push(message);
}

record(configuration.version === packageManifest.version, "versions Tauri et npm différentes");
record(cargoManifest.includes(`version = "${configuration.version}"`), "version Cargo différente");
record(configuration.identifier === "io.github.othmanbenbrahim.eloquentlocalcompanion", "identifiant Tauri inattendu");
record(configuration.app?.withGlobalTauri === true, "API globale Tauri requise par l'interface");
record(Boolean(configuration.app?.security?.csp), "politique CSP manquante");
record(!configuration.app.security.csp.includes("unsafe-eval"), "unsafe-eval est interdit");
record(capabilities.permissions.includes("core:default"), "permissions Tauri de base manquantes");
record(capabilities.permissions.includes("autostart:allow-enable"), "permission autostart manquante");
record(rustEntry.includes("tauri::generate_handler!"), "commandes Tauri non enregistrées");
record(coreEngine.includes("ExternalProcess"), "protection des processus externes manquante");
record(coreEngine.includes("server_is_healthy"), "contrôle de santé du serveur manquant");
record(rustEntry.includes("TrayIconBuilder"), "icône de zone de notification manquante");
record(rustEntry.includes("api.prevent_close()"), "maintien en arrière-plan manquant");

const requiredFiles = [
  "Cargo.toml",
  "Cargo.lock",
  "package.json",
  "package-lock.json",
  "ui/index.html",
  "ui/styles.css",
  "ui/app.js",
  "core/src/lib.rs",
  "src-tauri/src/lib.rs",
  "src-tauri/icons/icon.ico",
  "src-tauri/icons/icon.icns",
  "packaging/flatpak/io.github.othmanbenbrahim.eloquentlocalcompanion.Devel.yml",
  "scripts/build-flatpak.sh",
];

for (const path of requiredFiles) {
  try {
    await access(resolve(root, path), constants.R_OK);
  } catch {
    failures.push(`fichier requis introuvable : ${path}`);
  }
}

const frontend = await readFile(resolve(root, "ui/app.js"), "utf8");
const frontendUrls = frontend.match(/https?:\/\/[^`'"\s]+/g) || [];
record(
  frontendUrls.every((url) => /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\$\{|:\d+|\/)/.test(url)),
  "l'interface exécutable contient une URL distante",
);
for (const command of ["get_settings", "save_settings", "get_status", "start_engine", "stop_engine"]) {
  record(frontend.includes(`invoke(\"${command}\"`), `commande non utilisée par l'interface : ${command}`);
}

if (failures.length) {
  console.error("Validation du compagnon échouée :");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Validation du compagnon réussie : ${requiredFiles.length} fichiers et 5 commandes contrôlés.`);
