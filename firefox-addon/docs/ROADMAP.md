# Feuille de route

## 0.1 — Extension Firefox

- [x] manifeste MV3 et identifiant AMO stable ;
- [x] correction locale des champs classiques et `contenteditable` ;
- [x] détection des champs dynamiques, iframes et composants à Shadow DOM ouvert ;
- [x] compatibilité avec les éditeurs isolés `about:`, `data:`, `blob:` et `designMode` ;
- [x] ouverture d’une suggestion par clic direct sur le soulignement ;
- [x] invalidation immédiate des marqueurs et requêtes devenus obsolètes ;
- [x] remplacement vérifié avec solution de secours pour les éditeurs contrôlés ;
- [x] vérification immédiate et sélection d’erreur par offset au clic ;
- [x] première règle contextuelle française locale pour les homographes ;
- [x] interface de suggestion débarrassée des métadonnées techniques ;
- [x] choix local de la langue avec repli français ;
- [x] réglages, exclusions par site et politique de confidentialité ;
- [x] construction XPI/ZIP, signature AMO et publication GitHub automatisées ;
- [ ] essais manuels sur ChatGPT, messageries web et éditeurs riches.

## 0.2 — Intégration Eloquent Linux/Flatpak

- [x] créer le cœur Rust commun de détection et de gestion du processus LanguageTool ;
- [x] créer l'interface Tauri et la configuration persistante ;
- [x] conserver le moteur actif en arrière-plan avec une icône de zone de notification ;
- [x] ajouter les scripts initiaux Windows, Linux et macOS ainsi que le manifeste Flatpak de développement ;
- [ ] tester et signer les installateurs natifs produits par GitHub Actions ;
- [ ] figer les archives Java/LanguageTool et leurs sommes SHA-256 ;
- exposer clairement l’état et le port du serveur local dans Eloquent ;
- confirmer l’accès au port de bouclage depuis Firefox natif et Firefox Flatpak ;
- ajouter une option d’activation au manifeste Flatpak avec permissions minimales ;
- tester Wayland/X11 et les mises en veille/reprises.

## 0.3 — macOS

- rendre les dépendances et chemins de ressources indépendants de GNOME/Flatpak ;
- produire un bundle d’application universel lorsque les dépendances le permettent ;
- ajouter signature Developer ID, entitlements minimaux et notarisation ;
- tester Intel et Apple Silicon.

## 0.4 — Expérience intégrée

- compagnon Native Messaging pour démarrer le moteur depuis Firefox ;
- dictionnaire personnel local ;
- règles ignorées persistantes ;
- localisation complète français/anglais ;
- tests automatisés navigateur et éditeurs riches.

## Décisions à prendre avant le port macOS

1. conserver l’interface GTK/libadwaita ou créer un compagnon sans interface ;
2. embarquer Java et LanguageTool ou utiliser une installation séparée ;
3. distribuer hors Mac App Store ou adapter le modèle au sandbox du Store ;
4. choisir le nom final et les identifiants de signature avant la première publication stable.
