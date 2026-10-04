# Prépa Marathon de Paris 2027

Application web installable (PWA) pour préparer le Marathon de Paris du 4 avril 2027 en 3h20.
Plan de 26 semaines (5 octobre 2026 au 4 avril 2027), séances détaillées, test de VMA (demi-Cooper) qui calibre les allures de fractionné, suivi manuel, prédiction de chrono, plan de course et check-list.
Aucune donnée n'est envoyée sur un serveur : tout est stocké sur ton téléphone (IndexedDB).

## Publier sur GitHub Pages

1. Crée un dépôt GitHub (par exemple `prepa-marathon`) et envoie-y **le contenu** du dossier : `index.html` doit se trouver à la racine du dépôt, pas dans un sous-dossier.
2. Dans le dépôt : **Settings > Pages > Build and deployment > Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. Après une minute, l'application est disponible sur `https://<ton-pseudo>.github.io/prepa-marathon/`.
4. Sur le téléphone : ouvre l'adresse, puis **Ajouter à l'écran d'accueil** (Safari : Partager, puis Sur l'écran d'accueil ; Chrome : menu, puis Installer l'application).

## Mettre à jour

Modifie les fichiers, change la valeur `VERSION` dans `sw.js` (par exemple `v12`) et pousse sur GitHub. À la prochaine ouverture avec du réseau, l'application détecte la nouvelle version, s'installe et se recharge toute seule (si une fiche est ouverte, elle te demande de recharger).

## Sauvegarde

Les données vivent dans le navigateur (IndexedDB, avec une copie de secours dans le stockage local). Utilise **Plus > Exporter en JSON** régulièrement, surtout avant de changer de téléphone ou de vider le navigateur. Sur téléphone, l'export ouvre la feuille de partage : enregistre le fichier dans Fichiers, iCloud Drive ou Drive, ou envoie-le-toi par mail. L'écran Plus indique la date du dernier export.

## Structure

- `index.html`, `styles.css` : interface
- `app.js` : script unique (moteur du plan, stockage, vues). Fonctionne aussi en ouvrant `index.html` directement.
- `fonts/` : polices Barlow et Barlow Condensed hébergées avec l'application (licence SIL OFL, voir `fonts/OFL.txt`)
- `sw.js`, `manifest.webmanifest`, `icons/` : mode hors-ligne et installation (`apple-touch-icon.png` est l'icône opaque utilisée par l'écran d'accueil iPhone)

## Tester en local

```
python3 -m http.server 8000
```
puis ouvre http://localhost:8000.
