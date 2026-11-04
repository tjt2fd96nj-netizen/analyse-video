# Analyse Vidéo

Application web installable (PWA) pour l'analyse vidéo sportive et le coaching.

## Ce que fait la version actuelle

- **Lecteur vidéo** : lecture image par image, vitesses de 0,1× à 4×, boucle A-B.
- **Dessins sur la vidéo** : crayon, ligne, flèche, flèche pointillée, rectangle, cercle,
  projecteur (assombrit tout sauf un joueur), pions numérotés, texte, gomme, annuler.
  Chaque dessin est accroché à un moment précis de la vidéo et reste affiché quelques secondes.
- **Commentaires horodatés** : liste cliquable, repères sur la barre de temps,
  pause automatique de la vidéo à chaque commentaire.
- **Comparaison** : superposition d'une 2ᵉ vidéo avec transparence, mode « différence »,
  décalage dans le temps (à l'image près), position et taille réglables.
- **Tableau blanc** : plusieurs tableaux blancs par analyse pour faire des schémas.
- **Export** : image PNG du moment affiché avec les dessins, fichier `.json` des annotations
  (réimportable sur un autre appareil).
- **Hors ligne** : tout est gardé dans le navigateur (IndexedDB), l'app s'installe sur
  téléphone, tablette et ordinateur.

Raccourcis clavier : `Espace` lecture/pause, `←` `→` image par image (`Maj` = 1 seconde), `Ctrl+Z` annuler.

## Prochaines étapes

1. Comptes (Firebase Authentication) : coach et joueurs.
2. Annotations synchronisées en ligne (Firestore).
3. Envoi des vidéos (Cloudflare R2 ou Bunny Stream) avec compression dans le navigateur.
   Le stockage vidéo passe par `public/js/video-storage.js` : il suffit d'y ajouter un fournisseur.
4. Espace joueur : le coach ajoute une vidéo à un joueur, le joueur la voit avec tous les dessins et commentaires.

## Lancer en local

Aucune installation nécessaire, juste un petit serveur web :

```bash
python3 -m http.server 8080 -d public
# puis ouvrir http://localhost:8080
```

## Mettre en ligne sur Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # choisir le projet Firebase
firebase deploy --only hosting
```

À chaque nouvelle version, changer `VERSION` dans `public/sw.js` pour que les appareils se mettent à jour.

## Organisation du code

| Fichier | Rôle |
| --- | --- |
| `public/index.html` | Structure des écrans |
| `public/css/style.css` | Apparence (ordinateur et mobile) |
| `public/js/app.js` | Logique de l'application |
| `public/js/sketch.js` | Moteur de dessin (vidéo et tableau blanc) |
| `public/js/db.js` | Sauvegarde locale (IndexedDB) |
| `public/js/video-storage.js` | Stockage des vidéos (local aujourd'hui, R2/Bunny demain) |
| `public/sw.js` | Fonctionnement hors ligne |
