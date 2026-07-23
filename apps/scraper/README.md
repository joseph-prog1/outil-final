# LinkedIn Scraper - Charlie AI Analyzer

Scraper LinkedIn automatisé qui extrait les profils des commentaires des posts LinkedIn avec gestion des sessions chiffrées et humanisation du comportement.

## Features

- ✅ **Login LinkedIn automatisé** - Gestion des sessions avec 2FA
- ✅ **Extraction des profils** - Extraction du nom, titre, compagnie
- ✅ **Humanisation** - Comportement naturel (délais, scroll progressif)
- ✅ **Gestion des sessions** - Sessions chiffrées AES-256
- ✅ **Dashboard web** - Interface React pour le scraping
- ✅ **Évite les doublons** - Pas de re-scraping des profils existants

## Stack

- **Frontend**: Next.js 15 + React 19 + TypeScript
- **Backend**: Node.js + Next.js API Routes
- **Browser**: Playwright (Chromium)
- **Security**: AES-256-CBC pour les sessions
- **Styling**: Tailwind CSS

## Installation

```bash
npm install
```

## Setup

1. Crée un fichier `.env.local`:
```env
# LinkedIn credentials (optionnel - login via UI)
LINKEDIN_EMAIL=your-email@gmail.com
LINKEDIN_PASSWORD=your-password
```

2. Démarre le serveur:
```bash
npm run dev
```

3. Ouvre http://localhost:3001/scraper-dashboard

## Usage

1. **Login** - Entre tes identifiants LinkedIn (une seule fois)
2. **Scrape** - Colle l'URL d'un post LinkedIn
3. **Résultats** - Les profils s'affichent + fichier JSON

## Structure

```
lib/
├── run-scraper.mjs          # Playwright scraper
├── session-manager.js        # Gestion des sessions chiffrées
└── ...

app/
├── scraper-dashboard/page.tsx   # UI principale
├── api/scrape/route.js          # Endpoint scraping
└── api/auth/                    # Authentication

data/
└── scrape-results/          # Résultats JSON
```

## Performance

- **1 post**: 2-3 minutes
- **5 profils max**: Par défaut
- **Session**: Réutilisable 30+ jours
- **Humanization**: Passe LinkedIn detection ✓

## Notes

- LinkedIn bloque après ~100 requêtes/jour du même IP
- Sessions expient après ~30 jours
- Nécessite un compte LinkedIn valide
- Respecte les ToS de LinkedIn (humanisation)

## License

MIT
