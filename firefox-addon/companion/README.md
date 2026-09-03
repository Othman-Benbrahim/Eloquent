# Eloquent Local Companion

Compagnon de bureau multiplateforme pour l'extension Firefox **Eloquent Local Assistant**. Il lance le serveur HTTP officiel de LanguageTool sur l'adresse de bouclage, affiche son état et ne transmet aucun texte à un service distant.

## État du jalon 0.2.0

Ce premier jalon contient :

- un cœur Rust commun testé sous Windows, Linux et macOS ;
- une interface Tauri 2 sans framework JavaScript ni contenu distant ;
- la détection d'un runtime Java embarqué, de `JAVA_HOME`, de `PATH` ou d'un chemin choisi ;
- la recherche récursive de `languagetool-server.jar` ;
- le démarrage, l'arrêt et la surveillance de LanguageTool sur `127.0.0.1:8082` ;
- la conservation d'un serveur préexistant : le compagnon ne tue jamais un processus qu'il n'a pas lancé ;
- les journaux locaux, la configuration persistante et le démarrage avec la session ;
- une icône de zone de notification : fermer la fenêtre laisse la correction active et « Quitter » arrête réellement le compagnon ;
- les scripts de construction Windows, Linux et macOS ;
- une automatisation GitHub Actions prête à produire les paquets natifs sur leurs systèmes respectifs.

Les runtimes Java et LanguageTool ne sont pas stockés dans Git. `Prepare-Resources.ps1` peut les télécharger avant une construction afin de produire un installateur autonome. Les sommes de contrôle et versions devront être figées avant une publication stable.

## Essai avec l'installation Windows actuelle

Dans l'interface, conserver le port `8082`, puis indiquer :

```text
Java         : D:\Documents\Langagetool\java-runtime
LanguageTool : D:\Documents\Langagetool\languagetool-engine
```

Le compagnon retrouve lui-même `java.exe` et `languagetool-server.jar` dans leurs sous-dossiers. L'adresse affichée doit rester identique à celle configurée dans Firefox :

```text
http://127.0.0.1:8082/v2
```

## Développement

Prérequis communs : Rust 1.77.2 ou plus récent, Node.js 22 ou plus récent et les [prérequis Tauri 2](https://v2.tauri.app/start/prerequisites/) du système. Les scripts PowerShell prennent en charge Windows PowerShell 5.1 et PowerShell 7.

```powershell
cd companion
npm install
.\scripts\Test-Companion.ps1
npm run dev
```

Le cœur peut être testé sans WebView :

```powershell
cargo test -p eloquent-companion-core --all-targets
```

## Construire les ressources autonomes

Sur la plateforme cible :

```powershell
.\scripts\Prepare-Resources.ps1
```

Le script utilise l'API Adoptium pour un JRE Temurin et le paquet serveur officiel de LanguageTool. Les ressources sont ajoutées au bundle Tauri mais ignorées par Git.

## Paquets

| Système | Commande | Sorties visées |
|---|---|---|
| Windows x64/ARM64 | `.\scripts\Build-Windows.ps1 -PrepareResources` | NSIS `.exe`, MSI |
| macOS Intel/Apple Silicon | `./scripts/build-macos.sh` | `.app`, `.dmg` |
| Linux natif | `./scripts/build-linux.sh` | `.deb`, `.rpm`, AppImage |
| Linux Flatpak | `./scripts/build-flatpak.sh` | `.flatpak` de développement puis Flathub |

La signature Windows et la notarisation Apple requièrent les certificats du propriétaire au moment de la publication. Elles ne sont pas nécessaires aux constructions locales de développement.

## Sécurité du cycle de vie

- le serveur écoute uniquement sur `localhost`/`127.0.0.1` ;
- le port doit être non privilégié ;
- si un service non LanguageTool occupe le port, le démarrage est refusé ;
- seul le processus enfant créé par le compagnon peut être arrêté ;
- la sortie et les erreurs sont écrites dans le dossier de journaux propre à l'application ;
- l'interface Tauri possède une politique CSP et des permissions minimales.

## Prochain jalon

1. tester l'installateur Windows autonome avec le runtime embarqué ;
2. figer les versions et sommes SHA-256 de Java et LanguageTool ;
3. finaliser le sandbox Flatpak et son portail de démarrage en arrière-plan ;
4. signer/notariser les paquets publics ;
5. ajouter le canal Native Messaging entre Firefox et le compagnon.
