# Prépa Marathon de Paris 2027

Application web installable (PWA) pour préparer le Marathon de Paris du 4 avril 2027 en 3h20.
Plan de 26 semaines (5 octobre 2026 au 4 avril 2027), séances détaillées, suivi manuel, prédiction de chrono, plan de course et check-list.
Aucune donnée n'est envoyée sur un serveur : tout est stocké sur ton téléphone (IndexedDB).

## Publier sur GitHub Pages

1. Crée un dépôt GitHub (par exemple `prepa-marathon`) et envoie-y le contenu de ce dossier à la racine.
2. Dans le dépôt : **Settings > Pages > Build and deployment > Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. Après une minute, l'application est disponible sur `https://<ton-pseudo>.github.io/prepa-marathon/`.
4. Sur le téléphone : ouvre l'adresse, puis **Ajouter à l'écran d'accueil** (Safari : Partager, puis Sur l'écran d'accueil ; Chrome : menu, puis Installer l'application).

## Mettre à jour

Modifie les fichiers, change la valeur `VERSION` dans `sw.js` (par exemple `v2`) et pousse sur GitHub. L'application se met à jour à la prochaine ouverture avec du réseau.

## Sauvegarde

Les données vivent dans le navigateur. Utilise **Plus > Exporter en JSON** régulièrement, surtout avant de changer de téléphone ou de vider le navigateur.

## Structure

- `index.html`, `styles.css` : interface
- `js/plan.js` : génération du plan, allures, stratégie de course (fonctions pures)
- `js/app.js` : vues et interactions
- `js/store.js` : stockage local
- `sw.js`, `manifest.webmanifest`, `icons/` : mode hors-ligne et installation

## Tester en local

```
python3 -m http.server 8000
```
puis ouvre http://localhost:8000.
