# Politique de confidentialité

Dernière mise à jour : 3 septembre 2026.

Eloquent Local Assistant ne collecte, ne conserve, ne vend et ne transmet aucune donnée personnelle à son éditeur ou à un service tiers.

Le contenu des champs de texte est envoyé uniquement, à la demande de l’utilisateur pendant la saisie, au serveur LanguageTool configuré sur la machine locale. L’extension valide l’adresse avant chaque enregistrement et n’accepte que les hôtes de bouclage `localhost`, `127.0.0.1` et `::1`. L’adresse par défaut est `http://127.0.0.1:8082/v2`.

Les seuls réglages conservés dans le stockage local de Firefox sont : activation, adresse locale, langue, variantes linguistiques, niveau de correction, délai de frappe, limites de longueur et liste des domaines désactivés. Ils ne quittent pas le profil Firefox, sauf si l’utilisateur utilise lui-même une fonction de synchronisation ou de sauvegarde externe à cette extension.

## Justification des permissions

- `storage` : mémoriser les réglages et les sites désactivés ;
- `activeTab` : afficher l’état du champ actif lorsque l’utilisateur ouvre le menu de l’extension ;
- accès à toutes les pages : détecter les champs éditables et y afficher les corrections. Firefox et certaines pages protégées interdisent malgré tout l’injection.

Le projet n’intègre ni analytique, ni publicité, ni code chargé à distance. Pour signaler un problème de confidentialité, utilisez le suivi d’incidents du dépôt GitHub indiqué dans la fiche de l’extension.
