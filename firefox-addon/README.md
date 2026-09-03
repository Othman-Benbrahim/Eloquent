# Eloquent Local Assistant

Extension Firefox libre de correction grammaticale et orthographique, conçue pour être reliée à l’instance LanguageTool locale d’Eloquent. Le texte saisi reste sur l’ordinateur : le code refuse toute adresse autre que `localhost`, `127.0.0.1` ou `::1`.

> État : prototype fonctionnel `0.1.6`. L’extension Firefox est prête à tester. Elle nécessite un serveur LanguageTool local ; son adresse et son port sont configurables dans les options. Le portage de l’application Eloquent vers macOS et le durcissement de l’intégration Flatpak constituent l’étape suivante.

## Fonctionnalités

- correction différée dans les champs `input`, `textarea`, `contenteditable`, les éditeurs riches, les iframes et les composants à Shadow DOM ouvert ;
- soulignements cliquables ouvrant directement la correction concernée, compteur d’erreurs et suggestions applicables en un clic ;
- remplacement transactionnel compatible avec les champs natifs et les éditeurs riches qui restaurent leur état après un clic ;
- identification de la véritable racine des éditeurs riches, même lorsque le clic cible un paragraphe interne comme dans ChatGPT ;
- suppression immédiate des marqueurs devenus obsolètes après une saisie, une correction ou un changement de champ ;
- vérification exigeante activée par défaut sur les nouvelles installations ;
- vérification immédiate au clic fondée sur la position réelle du curseur ;
- règle contextuelle française distinguant le nom fautif « un teste » du verbe correct « je teste » ;
- interface épurée sans identifiants de règles ni catégories internes de LanguageTool ;
- français, anglais, allemand, espagnol, italien et portugais, avec détection locale de la langue et repli sur le français ;
- niveau normal ou exigeant ;
- activation globale et désactivation par domaine ;
- aucun compte, aucun service distant, aucune télémétrie ;
- manifeste Firefox MV3 avec identifiant stable pour la signature AMO.

## Prérequis

- Firefox 142 ou plus récent ;
- Node.js 22 ou plus récent pour les tests et la construction ;
- LanguageTool local (port `8081` par défaut, ou tout autre port local configuré) ;
- sous Windows, Windows PowerShell 5.1 ou PowerShell 7 ;
- `gh` et `git` uniquement pour publier le fork.

Sous Linux, Eloquent peut fournir le serveur local lorsqu’il est lancé. Sur Windows et macOS, un paquet LanguageTool autonome peut être lancé avec Java en attendant le compagnon natif multiplateforme. L’extension permet de modifier le port dans ses paramètres, mais interdit volontairement les hôtes distants.

## Tester dans Firefox

Sous PowerShell :

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\Test-Firefox.ps1
```

Sous Linux ou macOS :

```bash
npm test
npm run validate
npx --yes web-ext@10 lint --source-dir extension
npx --yes web-ext@10 run --source-dir extension
```

Pour un essai sans `web-ext`, ouvrez `about:debugging#/runtime/this-firefox`, choisissez **Charger un module complémentaire temporaire**, puis sélectionnez `extension/manifest.json`.

## Construire les archives

Sous Windows :

```powershell
.\scripts\Build-Firefox.ps1
```

Sous Linux ou macOS :

```bash
npm run build
```

Deux fichiers sont créés dans `dist/` :

- `*-unsigned.xpi`, installable uniquement comme extension temporaire de développement ;
- `*-source.zip`, archive de sources lisibles destinée à la revue AMO.

La signature installable normale est délivrée par Mozilla. Voir [AMO-SUBMISSION.md](AMO-SUBMISSION.md).

## Publier le fork avec GitHub CLI

La commande suivante crée le fork `Othman-Benbrahim/Eloquent` s’il n’existe pas, le clone, place ce projet dans `firefox-addon/`, crée un commit et le pousse :

```powershell
.\scripts\Publish-GitHub.ps1
```

Pour un autre compte ou nom de dépôt :

```powershell
.\scripts\Publish-GitHub.ps1 -Repository "MON-COMPTE/Eloquent"
```

Après signature AMO, une release GitHub peut inclure automatiquement le dernier XPI signé :

```powershell
.\scripts\Sign-AMO.ps1 -Channel listed
.\scripts\Publish-GitHub.ps1 -CreateRelease
```

Le script ne supprime pas le dépôt cloné et ne réécrit pas son historique. Relancé, il met à jour le même dossier `firefox-addon/`.

## Organisation

- `extension/` : code réellement inclus dans le XPI ;
- `companion/` : application Tauri/Rust qui gère LanguageTool sous Windows, Linux et macOS ;
- `tests/` : tests unitaires sans dépendance externe ;
- `scripts/` : validation, empaquetage, signature AMO et publication GitHub ;
- `docs/` : architecture, feuille de route et plan de test ;
- `amo-metadata.json` : fiche bilingue utilisée par `web-ext sign`.

## Licence

GPL-3.0-only, comme le projet Eloquent d’origine. Voir [LICENSE](LICENSE).
