# Architecture

## Version 0.1.6

La première version sépare volontairement l’interface navigateur du moteur de correction :

```mermaid
flowchart LR
    A["Champ Firefox"] --> B["Content script"]
    B --> C["Background MV3"]
    C --> D["LanguageTool local :8081"]
    D --> C
    C --> B
```

Le script de contenu retrouve le véritable champ dans le chemin composé des événements, y compris dans un Shadow DOM ouvert ou une iframe à origine dérivée, puis extrait uniquement son texte. Les descendants qui héritent de `isContentEditable` ou de `-moz-user-modify` ne sont jamais traités comme des champs autonomes : le script remonte jusqu'à l'hôte d'édition. Chaque modification incrémente une génération de requête et retire immédiatement la présentation précédente ; une réponse appartenant à une ancienne génération est ignorée. Le background choisit localement une langue explicite, appelle `/v2/check`, ajoute les règles contextuelles locales puis fusionne les zones qui se chevauchent. Au clic, la position du curseur détermine l’offset textuel ciblé ; les rectangles graphiques ne servent que de solution de secours et d’ancrage du popup. L'application d'une suggestion conserve la sélection, utilise les primitives d'édition natives, émet les événements attendus par les frameworks puis vérifie que le texte corrigé reste stable.

## Composants

| Composant | Responsabilité |
|---|---|
| `shared/core.js` | Validation pure, sélection locale de la langue, normalisation des réglages et réponses LanguageTool |
| `background/background.js` | Stockage, politique réseau locale et appels HTTP |
| `content/content.js` | Détection des éditeurs, temporisation, rendu et remplacement |
| `popup/` | Activation du domaine courant et état du champ actif |
| `options/` | Adresse locale, langue, niveau et délai |

## Choix de sécurité

- les fonctions de normalisation refusent toute URL qui n’est pas une adresse de bouclage ;
- aucun script distant, `eval` ou constructeur dynamique n’est autorisé ;
- les requêtes utilisent `credentials: omit`, interdisent les redirections et expirent après 12 secondes ;
- aucune permission de téléchargement, presse-papiers, historique ou identité n’est demandée ;
- le manifeste déclare explicitement qu’aucune donnée n’est collectée.

## Cible multiplateforme

L’extension elle-même est identique sur Windows, Linux et macOS. La différence concerne le processus LanguageTool :

| Système | Fournisseur local visé |
|---|---|
| Linux | Eloquent Flatpak, avec API locale explicitement activée |
| macOS | port natif d’Eloquent ou petit lanceur signé/notarié |
| Windows | lanceur PowerShell pour le développement, puis compagnon packagé |

Un protocole Native Messaging pourra ultérieurement démarrer et arrêter le moteur. Les échanges de texte resteront sur l’API HTTP de bouclage afin de conserver la compatibilité avec Eloquent et de limiter la complexité du connecteur natif.
