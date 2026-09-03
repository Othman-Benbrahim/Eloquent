# Publication et signature AMO

Firefox exige un XPI signé par Mozilla pour une installation normale. Le fichier `*-unsigned.xpi` construit localement sert au développement ; le XPI signé est renvoyé par AMO après soumission et validation.

## 1. Vérifier localement

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\Test-Firefox.ps1
.\scripts\Build-Firefox.ps1
```

Conservez les deux résultats de `dist/` : le XPI non signé et le ZIP de sources.

## 2. Obtenir les identifiants API AMO

Connectez-vous au portail développeur Firefox Add-ons, ouvrez la page des identifiants API et créez une paire JWT. Ne copiez jamais ces secrets dans le dépôt, dans un fichier `.env`, dans une issue GitHub ou dans un message.

Définissez-les seulement dans la session PowerShell courante :

```powershell
$env:AMO_JWT_ISSUER = "user:…"
$env:AMO_JWT_SECRET = "…"
```

Ils disparaissent à la fermeture de cette fenêtre PowerShell.

## 3. Soumettre une version publique signée

```powershell
.\scripts\Sign-AMO.ps1 -Channel listed
```

Le script lance les tests, reconstruit les archives puis exécute `web-ext sign` avec `amo-metadata.json`. Le résultat AMO est placé dans `dist/signed/`. Une soumission `listed` vise une publication sur addons.mozilla.org et reste soumise à la revue de Mozilla.

Pour une distribution privée hors catalogue, utilisez :

```powershell
.\scripts\Sign-AMO.ps1 -Channel unlisted
```

## 4. Fournir les sources au réviseur

Si le portail AMO le demande, téléversez `dist/eloquent-local-assistant-0.1.0-source.zip` dans la section consacrée au code source. Les instructions de construction sont dans le README et aucune étape de minification ou compilation n’est requise.

## 5. Publier le code et une release GitHub

Une fois le XPI signé présent dans `dist/signed/` :

```powershell
.\scripts\Publish-GitHub.ps1 -Repository "Othman-Benbrahim/Eloquent" -CreateRelease
```

Le script préfère automatiquement le XPI signé le plus récent. Vous pouvez imposer un fichier précis :

```powershell
.\scripts\Publish-GitHub.ps1 -CreateRelease -SignedXpiPath ".\dist\signed\mon-fichier.xpi"
```

## Checklist AMO

- tester la saisie et l’application d’une suggestion sur plusieurs sites ;
- vérifier que LanguageTool arrêté produit un message clair ;
- confirmer l’absence de requête distante dans les outils réseau ;
- joindre le ZIP de sources si demandé ;
- utiliser la politique de confidentialité `PRIVACY.md` ;
- ne publier aucune clé JWT ;
- incrémenter la version dans `extension/manifest.json`, `package.json` et les métadonnées avant une nouvelle soumission.
