# Eloquent Local Assistant 0.1.6

Cette version corrige l'application des suggestions ouvertes directement depuis un mot dans l'éditeur ChatGPT.

- Un paragraphe interne héritant de `contenteditable` n'est plus confondu avec l'éditeur complet.
- La correction remonte jusqu'à la racine attendue par ChatGPT avant d'appliquer le remplacement.
- L'événement `input` est maintenant envoyé au bon hôte d'édition.
- Le clic du bouton Eloquent n'est plus retraité comme un clic dans le champ ChatGPT.
- Les protections transactionnelles de la version précédente restent actives.

Limite connue : le serveur LanguageTool doit déjà être lancé. L’intégration de démarrage automatique à Eloquent ainsi que les paquets macOS et Flatpak consolidés sont prévus pour les versions suivantes.
