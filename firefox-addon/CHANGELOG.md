# Journal des modifications

## 0.1.6 — 2026-09-03

- Correction ciblée de l'éditeur ChatGPT observée dans l'enregistrement utilisateur.
- Résolution des clics effectués sur un paragraphe interne vers le véritable hôte `contenteditable`.
- Exclusion des descendants qui héritent seulement de `isContentEditable` ou de `-moz-user-modify`.
- Envoi du remplacement et de l'événement `input` à la racine attendue par l'éditeur riche.
- Exclusion des clics de l'interface Eloquent du gestionnaire de clics de la page.
- Maintien du bouton de suggestion dans le document jusqu'à l'exécution de la commande native.
- Prise en charge de la forme HTML valide `contenteditable=""`.

## 0.1.5 — 2026-09-03

- Application transactionnelle des suggestions ouvertes directement depuis un mot souligné.
- Conservation de la sélection de l'éditeur pendant le clic sur une proposition.
- Émission des événements d'édition `beforeinput` et `input` avec le type `insertReplacementText`.
- Utilisation du setter natif pour les champs classiques et de la commande d'édition native pour les éditeurs riches.
- Contrôle du texte obtenu et nouvelles tentatives si une application web restaure son ancienne valeur.
- Recalage de la zone à remplacer à partir du texte affiché dans le popup, sans dépendre d'un état global devenu obsolète.

## 0.1.4 — 2026-09-03

- Détection au clic à partir de l’offset réel du curseur, avec les rectangles visuels en solution de secours.
- Vérification immédiate du champ lorsque l’erreur cliquée n’est pas déjà en cache.
- Popup et soulignement conservés jusqu’à une action explicite de l’utilisateur.
- Règle contextuelle locale `un teste` → `un test`, sans signaler le verbe correct `je teste`.
- Fusion des résultats locaux et LanguageTool sans soulignements dupliqués.
- Suppression des catégories et identifiants techniques dans les cartes de correction.
- Positionnement du popup immédiatement à droite ou à gauche de l’erreur selon l’espace disponible.

## 0.1.3 — 2026-09-03

- Suppression immédiate des soulignements et résultats obsolètes après chaque modification.
- Invalidation des réponses LanguageTool en cours lorsqu’un texte a déjà changé.
- Disparition du compteur en l’absence d’erreur et nettoyage lors d’un changement de champ.
- Remplacement vérifié avec solution de secours pour les éditeurs qui réinjectent leur ancien état.
- Popup ancré au rectangle de l’erreur, y compris lorsqu’il est ouvert depuis le compteur.
- Niveau exigeant utilisé par défaut pour une vérification plus systématique.

## 0.1.2 — 2026-09-03

- Injection dans les iframes `about:`, `data:` et `blob:` ayant pour origine la page principale.
- Reconnaissance des éditeurs `designMode`, `role="textbox"` et `-moz-user-modify` utilisés par certains blocs-notes en ligne.
- Clic directement sur un mot souligné dans les champs classiques et les éditeurs riches.
- Affichage de la correction ciblée près du mot, sans bouton invisible bloquant le placement du curseur.

## 0.1.1 — 2026-09-03

- Détection locale français/anglais/allemand/espagnol/italien/portugais sans dépendre du mode `auto` de LanguageTool.
- Priorité au texte, puis à la langue du champ et de la page ; repli sur le français pour les textes ambigus.
- Détection des champs dynamiques, des éditeurs riches, des iframes et des champs placés dans un Shadow DOM ouvert.
- Utilisation du chemin composé des événements et de `isConnected` pour les composants web.
- Correction des avertissements de compatibilité du manifeste Firefox.

## 0.1.0 — 2026-09-03

- Première version de développement Firefox.
- Connexion strictement locale à l’API LanguageTool `/v2/check`.
- Prise en charge des champs classiques et `contenteditable`.
- Suggestions cliquables, compteur et désactivation par site.
- Page de réglages et test du serveur local.
- Tests unitaires, validation statique et archives vérifiées sans dépendance npm.
- Scripts PowerShell pour test, construction, signature AMO et publication du fork avec GitHub CLI.
