# Charlie Suite

Les trois outils Charlie réunis sur **un seul site** : http://localhost:3005

| URL | Outil | Description |
|---|---|---|
| `/` | **Emailing** | Prospection email automatisée — séquences, envoi Gmail, tracking, RDV |
| `/scraper` | **Scraper** | Analyse et qualification des décideurs LinkedIn |
| `/posts` | **Posts** | Studio éditorial LinkedIn — reformulation, miniatures, idées |

La navigation croisée est intégrée en haut de chaque outil.

## Lancement

```bash
npm run dev
```

Une seule commande : elle démarre les trois applications (le portail Emailing sur le port 3005, le Scraper et le serveur Posts sur des ports internes 3105 et 5001, invisibles à l'usage).

## Première installation (nouvelle machine)

```bash
npm run install-all   # installe les dépendances des 3 apps + compile le client Posts
npm run dev
```

Puis :
- **Emailing** : importer le CSV de contacts (onglet Contacts), connecter Google (Réglages) — voir `apps/emailing/README.md`.
- **Posts** : renseigner les clés API dans `apps/posts/server/.env` (CLAUDE_API_KEY…).

## Architecture

```
charlie-suite/
  apps/
    emailing/   Next.js (port 3005) — portail : proxifie /scraper et /posts
    scraper/    Next.js (port 3105, basePath /scraper)
    posts/      client Vite compilé, servi par le serveur Express (port 5001)
```

- Le portail utilise les rewrites Next.js : tout passe par le port 3005, même origine, donc le tunnel de tracking de l'Emailing couvre aussi les autres outils si besoin.
- Le client Posts est compilé avec `--base=/posts/` et appelle son API en relatif (`/posts/api/...`).
- Après une modification du client Posts : `npm run build:posts`.

## Données

Chaque app garde ses données localement (`apps/emailing/data/emailing.db`, `apps/posts/data`, `apps/scraper/data`) — rien ne part sur GitHub (`.gitignore`).
