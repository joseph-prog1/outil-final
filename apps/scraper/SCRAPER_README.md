# LinkedIn Comments Scraper

## 🎯 Objectif
Scraper automatiquement les commentaires des posts LinkedIn d'un profil spécifique en utilisant Puppeteer (browser automation).

## 📋 Prérequis
- Node.js 18+ installé
- Compte LinkedIn avec Google SSO activé
- Connexion internet stable

## 🚀 Quick Start

### 1. DEBUG MODE (Recommandé en premier)
Lancez d'abord le script de debug pour analyser la structure de LinkedIn :

```bash
npm run debug
```

Cela va :
- Ouvrir LinkedIn dans un navigateur visible
- Vous demander de vous connecter manuellement
- Analyser la structure HTML
- Générer des fichiers de debug dans le dossier `debug/`

**Fichiers générés :**
- `page-screenshot.png` - Capture de la page
- `sample-post.html` - HTML du premier post
- `profile-links.json` - Tous les liens de profil trouvés
- `page-source.html` - Source HTML complète

### 2. SCRAPING (Version 2 - Recommandée)
Une fois le debug validé, lancez le scraper :

```bash
npm run scrape
```

Cela va :
- Ouvrir LinkedIn
- Vous demander de vous connecter (si non connecté)
- Scroller la page pour charger tous les posts
- Extraire les commentateurs et leurs infos
- Sauvegarder en JSON dans `data/comments.json`

### 3. Alternative : Version 1
```bash
npm run scrape:v1
```

## 📁 Structure des fichiers générés

### `data/comments.json`
```json
[
  {
    "name": "John Doe",
    "profileUrl": "https://www.linkedin.com/in/johndoe/",
    "jobTitle": "CEO at Company Inc",
    "commentCount": 5,
    "lastCommentDate": "2025-01-15T10:30:00.000Z",
    "posts": ["Post excerpt 1", "Post excerpt 2"]
  },
  ...
]
```

### `debug/` folder
Contient les fichiers d'analyse pour comprendre la structure LinkedIn actuelle.

## 🔧 Dépannage

### Le script ne trouve pas les commentaires
1. Lancez `npm run debug`
2. Vérifiez `debug/profile-links.json`
3. Vérifiez `debug/sample-post.html`
4. Mettez à jour les sélecteurs CSS dans les scripts si nécessaire

### Erreur de connexion
- Assurez-vous que le navigateur se charge bien (headless: false)
- Attendez que Google SSO se charge complètement
- Le script attend jusqu'à 2 minutes pour la connexion

### LinkedIn bloque les requêtes
- Ralentissez les scrolls en augmentant le délai d'attente dans le code
- Réduisez le nombre de scrolls (maxScrolls)
- Utilisez une IP résidentielle si vous lancez depuis un datacenter

## 🛠️ Configuration

Dans `scraper-v2.js`, vous pouvez modifier :

```javascript
const PROFILE_URL = 'https://www.linkedin.com/in/thomas-higadere/recent-activity/all/';
// Changez cette URL pour scraper un autre profil

const maxScrolls = 15;
// Nombre maximum de scrolls pour charger les posts
```

## 📊 Résultats attendus

Pour un profil actif, vous devriez obtenir :
- ✅ Tous les noms des commentateurs
- ✅ URLs LinkedIn
- ✅ Nombre de commentaires par personne
- ✅ Poste/entreprise (si visible dans le contexte)
- ✅ Posts commentés

## ⚖️ Considérations légales

Ce scraper utilise Puppeteer (browser automation) pour accéder à des données publiques.
- Les données extraites sont publiquement visibles sur LinkedIn
- Vous utilisez votre propre compte LinkedIn
- Les données sont destinées à votre usage personnel/commercial

## 📝 Notes

- LinkedIn peut changer sa structure HTML → les sélecteurs peuvent devenir obsolètes
- Lancez `npm run debug` régulièrement pour vérifier les changements
- Le scraping est volontairement lent pour éviter les blocages

## 🐛 Logs & Erreurs

Tous les logs sont affichés dans la console. En cas d'erreur :
1. Notez le message d'erreur exact
2. Lancez `npm run debug` pour investiguer
3. Vérifiez les fichiers dans `debug/`
4. Mettez à jour les sélecteurs CSS si nécessaire
