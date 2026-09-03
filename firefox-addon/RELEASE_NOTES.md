# Eloquent Local Assistant 0.1.7

Cette version étend la compatibilité aux éditeurs dynamiques de LinkedIn et corrige les mots dupliqués lors d’un remplacement sur Facebook.

- Les éditeurs Quill, ProseMirror, Lexical et Slate sont reconnus explicitement.
- La sélection, `beforeinput`, `keyup` et les mutations du contenu permettent de retrouver les champs dont les événements sont filtrés par la page.
- Un éditeur riche ne reçoit plus qu’une seule transaction de remplacement par clic.
- La solution de secours ne s’exécute plus lorsqu’un éditeur a déjà accepté une commande native asynchrone.
- Les champs natifs conservent leur reprise idempotente lorsque leur valeur est restaurée par un framework.
- Le serveur du compagnon est recherché par défaut sur `127.0.0.1:8082`.

Le compagnon `0.2.0` doit être lancé pour fournir le serveur LanguageTool local.
