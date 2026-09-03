# Plan de test manuel

## Préparation

1. démarrer LanguageTool local sur `127.0.0.1:8081` ;
2. lancer `.\scripts\Test-Firefox.ps1` ou `web-ext run` ;
3. ouvrir les paramètres et vérifier que le test de connexion réussit.

## Scénarios essentiels

| Scénario | Résultat attendu |
|---|---|
| Saisir « Ceci est un teste. » dans un `textarea` | Un soulignement et une suggestion apparaissent après le délai |
| Cliquer sur « test » | Le texte est remplacé et l’événement `input` est émis |
| Écrire dans un éditeur `contenteditable` | Les marqueurs suivent le texte et une suggestion est applicable |
| Désactiver le site depuis le popup | Les marqueurs disparaissent et aucun nouvel appel n’est effectué |
| Arrêter LanguageTool | Le badge affiche `!` et le panneau explique l’indisponibilité |
| Entrer une URL distante dans les options | L’enregistrement est refusé |
| Naviguer et faire défiler la page | Les marqueurs restent alignés avec le champ actif |
| Ouvrir une page privée/protégée Firefox | Le popup indique simplement que la correction est indisponible |

## Plateformes

- Firefox stable sous Windows 11 ;
- Firefox natif et Firefox Flatpak sous Linux/Wayland ;
- Firefox stable sous macOS Intel et Apple Silicon ;
- thèmes clair et sombre, zoom 100 % et 200 % ;
- champs de droite à gauche à ajouter avant la version stable.
