# Construction Flatpak

Le manifeste `io.github.othmanbenbrahim.eloquentlocalcompanion.Devel.yml` sert au test local du premier jalon. Il utilise temporairement le réseau pendant la construction pour résoudre npm et Cargo : il **n'est pas encore acceptable pour Flathub**.

## Test local

1. préparer les ressources Linux depuis la racine `companion/` :

   ```powershell
   .\scripts\Prepare-Resources.ps1 -TargetOS linux
   ```

2. ajouter Flathub puis construire avec le SDK GNOME installé :

   ```bash
   flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
   ./scripts/build-flatpak.sh
   ```

Le script produit un fichier `.flatpak` autonome dans `target/bundle/flatpak/`. Le workflow GitHub exécute la même construction sur Ubuntu.

## Passage à Flathub

Avant soumission, il faudra :

- figer `Cargo.lock` et `package-lock.json` ;
- générer `cargo-sources.json` et `node-sources.json` avec `flatpak-builder-tools` ;
- remplacer les téléchargements dynamiques Java/LanguageTool par des sources versionnées et vérifiées par SHA-256 ;
- utiliser le portail `org.freedesktop.portal.Background` pour le lancement automatique dans le sandbox ;
- retirer `--share=network` de la construction et valider avec `flatpak-builder-lint`.

L'application n'expose aucun service au réseau extérieur. `--share=network` dans `finish-args` est toutefois nécessaire pour permettre l'écoute sur l'adresse de bouclage accessible à Firefox.
