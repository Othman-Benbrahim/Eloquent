# Plan de test manuel

## Préparation

1. démarrer Eloquent Local Companion et vérifier LanguageTool sur `127.0.0.1:8082` ;
2. lancer `.\scripts\Test-Firefox.ps1` ou `web-ext run` ;
3. ouvrir les paramètres et vérifier que le test de connexion réussit.

## Scénarios essentiels

| Scénario | Résultat attendu |
|---|---|
| Saisir « Ceci est un teste. » dans un `textarea` | Un soulignement et une suggestion apparaissent après le délai |
| Cliquer sur « test » | Le texte est remplacé et l’événement `input` est émis |
| Ouvrir la proposition en cliquant sur le mot, puis choisir « test » | La correction est appliquée comme lorsqu'elle est ouverte depuis la bulle |
| Tester un éditeur React, ProseMirror ou similaire | L'ancienne valeur ne revient pas dans les 200 ms suivant la correction |
| Cliquer sur un mot contenu dans un `<p>` interne à ChatGPT | La proposition et le remplacement ciblent la racine `contenteditable` |
| Saisir puis corriger une faute dans l’éditeur de publication ou de commentaire LinkedIn | Le champ est détecté, souligné et corrigé |
| Corriger un mot dans l’éditeur Facebook | Le mot est remplacé une seule fois et ne se retrouve jamais dupliqué |
| Corriger « un teste » en « un test » | Le `e` disparaît réellement et ne revient pas après la sauvegarde automatique du site |
| Écrire « Je teste le programme. » | Aucune règle contextuelle ne signale la forme verbale correcte |
| Cliquer directement sur un mot souligné dans un `textarea` | La correction de ce mot s’ouvre près du clic |
| Cliquer sur « teste » avant la fin du délai de vérification | Une vérification immédiate ouvre la proposition « test » |
| Cliquer ailleurs après l’ouverture d’une proposition | Le soulignement et le popup restent présents jusqu’à une action explicite |
| Examiner une carte de correction | Aucun identifiant comme `FRENCH_WHITESPACE` ni catégorie technique n’est visible |
| Écrire dans un éditeur `contenteditable` | Les marqueurs suivent le texte et une suggestion est applicable |
| Utiliser un éditeur `designMode` ou `role="textbox"` | Le champ est détecté et corrigé |
| Utiliser un éditeur dans une iframe `about:`, `data:` ou `blob:` | Le script est injecté dans la frame et corrige le texte |
| Ajouter puis cibler un champ après le chargement de la page | Le nouveau champ est détecté sans recharger l’extension |
| Écrire dans un champ à l’intérieur d’un Shadow DOM ouvert | Le champ réel est retrouvé par le chemin composé de l’événement |
| Écrire dans un champ contenu dans une iframe | La correction s’exécute dans la frame concernée |
| Écrire « Ceci est un teste. » sur une page en anglais | La langue envoyée au moteur reste `fr-FR` |
| Écrire « This is a simple testt. » sur une page en français | La langue envoyée au moteur devient la variante anglaise préférée |
| Désactiver le site depuis le popup | Les marqueurs disparaissent et aucun nouvel appel n’est effectué |
| Arrêter LanguageTool | Le badge affiche `!` et le panneau explique l’indisponibilité |
| Entrer une URL distante dans les options | L’enregistrement est refusé |
| Naviguer et faire défiler la page | Les marqueurs restent alignés avec le champ actif |
| Modifier un mot déjà souligné | L’ancien soulignement et l’ancienne bulle disparaissent immédiatement |
| Passer rapidement d’un champ à un autre | Un seul compteur reste affiché, près du champ actif |
| Corriger pendant qu’une requête précédente est en cours | La réponse obsolète ne restaure aucun marqueur fantôme |
| Ouvrir une page privée/protégée Firefox | Le popup indique simplement que la correction est indisponible |

## Plateformes

- Firefox stable sous Windows 11 ;
- Firefox natif et Firefox Flatpak sous Linux/Wayland ;
- Firefox stable sous macOS Intel et Apple Silicon ;
- thèmes clair et sombre, zoom 100 % et 200 % ;
- Shadow DOM fermé et champs de droite à gauche à approfondir avant la version stable.
