# Composants tiers prévus dans les paquets autonomes

Le dépôt source n'embarque pas les archives binaires suivantes. Le script de préparation peut les ajouter localement au moment de la construction.

## Eclipse Temurin

- Projet : Eclipse Adoptium Temurin
- Rôle : environnement d'exécution Java utilisé par LanguageTool
- Source : <https://adoptium.net/temurin/>
- Licence : GPLv2 avec Classpath Exception et licences des composants associés

## LanguageTool

- Projet : LanguageTool
- Rôle : moteur local de grammaire, orthographe et style
- Source : <https://github.com/languagetool-org/languagetool>
- Licence principale : LGPL-2.1-or-later
- Limite : les règles IA du service cloud ne font pas partie du serveur local

Les notices et licences complètes fournies dans chaque distribution devront rester présentes dans les installateurs finaux.

