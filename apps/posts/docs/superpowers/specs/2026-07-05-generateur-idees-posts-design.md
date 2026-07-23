# Générateur d'idées de posts LinkedIn — Design

**Date :** 2026-07-05
**Statut :** Validé (design), en attente de plan d'implémentation
**Audience du produit :** CGP, banquiers privés, asset managers (contenu LinkedIn de Thomas & Mathis, via Charlie)

## Problème

Trouver des sujets de posts est le point de friction. Aujourd'hui Charlie
*reformule* un post fourni et génère sa miniature, mais l'utilisateur doit
encore trouver **quoi** écrire. On veut que Charlie propose lui-même des idées
de posts fraîches et pertinentes, sans que l'utilisateur ait à chercher.

## Décisions cadrées (validées avec l'utilisateur)

1. **Source des idées : signaux externes filtrés.** Charlie va chercher l'actu
   fraîche à l'extérieur et ne garde que ce qui colle aux sujets gagnants.
2. **Thèmes surveillés (les 4) :** sorties & actu IA ; réglementation &
   conformité (AMF/ACPR, MiFID II, DDA, LCB-FT/KYC, fiscalité patrimoniale) ;
   data officielle & sources (data.gouv, INSEE, Pappers/SIRENE/BODACC,
   Pennylane) ; actu marché & patrimoine (PER, assurance-vie, immobilier, taux,
   grands acteurs).
3. **Livraison : à la demande, 100 % manuelle.** Un bouton « Trouve-moi des
   sujets » déclenche la recherche. **Aucune fréquence programmée**, aucun
   rafraîchissement automatique. L'utilisateur garde la main.
4. **Les sources sont centrales.** Chaque idée DOIT porter son ou ses
   article(s) source avec lien cliquable — l'utilisateur veut d'abord voir les
   articles/sujets, pas seulement une idée abstraite. La source est un élément
   de premier plan de la carte d'idée, pas une note en bas.
5. **Moteur : Approche A — Claude + recherche web.** Recherche web pilotée par
   les patterns gagnants, zéro flux RSS à maintenir. (Épinglage d'API type
   data.gouv reporté à une v2 si un thème est sous-couvert.)

## Matière première déjà disponible (réutilisée)

- `data/patterns.json` — sujets gagnants par auteur (`sujets_gagnants`) + règles.
- `data/matching.json` — sujet → archétype de miniature qui performe.
- `data/linkedin-posts.json` — 96 posts réels étiquetés (impressions).
- `data/analytics.json` — démographie de l'audience (qui lit).
- Endpoint `POST /api/predict-performance` + helpers (`impressionDistribution`,
  `scoreToImpressions`, `buildPatternGuidance`) — **réutilisés pour scorer les
  idées**.
- Pipeline Reformulateur (pré-brief hooks + use-cases, variantes) — **cible du
  bouton « Rédiger ce post »**.

## Architecture

### Flux de données

```
[Bouton « Trouve-moi des sujets » — déclenchement manuel uniquement]
      │
      ▼
generateIdeaDigest()
      │  1. construit le prompt de découverte
      │     (sujets gagnants + 4 thèmes + démographie
      │      + fenêtre 7 jours + signatures déjà vues)
      ▼
Claude (Opus 4.8) + outil web_search  ──► idées brutes
      │  2. { titre, theme, why_now, source{titre,url}, angle,
      │        suggested_hook, suggested_archetype }
      ▼
Scoring (moteur predict-performance, Haiku)
      │  3. score /10 + impressions estimées {low, high}
      ▼
Dédoublonnage vs data/ideas.json (par signature normalisée)
      ▼
Persistance data/ideas.json (statut = nouveau)
      ▼
[Onglet « Idées »] GET /api/ideas  ──►  liste classée par score
      │
      └─ bouton « Rédiger ce post » ──► Reformulateur pré-rempli
```

### L'objet « idée »

```ts
interface PostIdea {
  id: string;                       // hash de la signature normalisée
  date_found: string;               // ISO
  theme: 'ia' | 'reglementation' | 'data_officielle' | 'marche_patrimoine';
  titre: string;                    // l'idée de post en 1 ligne
  why_now: string;                  // pourquoi c'est pertinent maintenant
  sources: { titre: string; url: string; date?: string }[]; // 1+ articles, éléments de premier plan
  angle: string;                    // angle CGP concret
  suggested_hook: string;           // accroche proposée (~140 car.)
  suggested_archetype: string;      // un des 8 archétypes de miniature
  score: number;                    // /10, du moteur de prédiction
  impressions_estimees: { low: number; high: number } | null;
  statut: 'nouveau' | 'vu' | 'utilise' | 'ecarte';
}
```

`id` / signature : normalisation du titre + thème (minuscule, sans accents,
sans ponctuation) → hash. Sert au dédoublonnage inter-runs : un même signal ne
réapparaît pas d'un jour à l'autre.

### Composants serveur (`server/index.js`)

- **Stockage :** `IDEAS_FILE = data/ideas.json` ; `readIdeas()` /
  `saveIdeas(list)`. Fichier versionné comme le reste du dossier `data`
  (repo privé).
- **Helper recherche web :** `callClaudeWithWebSearch(system, user, maxTokens)`
  — appel `POST /v1/messages` avec `tools: [{ type: 'web_search_20260209',
  name: 'web_search' }]`, en réutilisant le durcissement JSON existant
  (`callClaudeJSON` : strip des fences, extraction `{`…`}`). Modèle
  `claude-opus-4-8`.
- **Moteur :** `generateIdeaDigest()` — construit le prompt, appelle la
  recherche web, valide/normalise les idées brutes, score chacune via le moteur
  `predict-performance` (angle + hook), dédoublonne, persiste. Retourne
  `{ added, total }`. Ne jette jamais : en cas d'échec web, conserve le digest
  existant.
- **Endpoints :**
  - `POST /api/ideas/generate` — déclenche `generateIdeaDigest()` (bouton
    « Trouve-moi des sujets »). Peut être long (recherche web) : l'UI affiche un
    état de chargement.
  - `GET /api/ideas?theme=&statut=` — liste triée par score décroissant, avec
    filtres optionnels + date du dernier run.
  - `PATCH /api/ideas/:id` — met à jour `statut` (vu / utilisé / écarté).
- **Aucune planification.** Pas de rafraîchissement automatique, pas de cron,
  pas de déclenchement au démarrage. La recherche ne part QUE sur clic du
  bouton. Les idées trouvées persistent dans `data/ideas.json` entre les
  sessions jusqu'à ce que l'utilisateur relance une recherche.

### Composants client (`client/src/`)

- **Type :** `PostIdea` + `IdeasResponse` dans `types/index.ts`.
- **Hook :** `useIdeas` — `fetchIdeas(filters)`, `refreshIdeas()` (POST
  generate), `setIdeaStatus(id, statut)`.
- **Onglet `IdeasView.tsx`** (nouvel onglet de navigation, placé après
  Miniatures / avant Apprentissage) :
  - En-tête : date de la dernière recherche + gros bouton « Trouve-moi des
    sujets » (état de chargement pendant la recherche web).
  - Filtres par thème + par statut (masquer les écartés par défaut).
  - Liste de cartes classées par score : badge score /10 (même code couleur que
    la prédiction de variantes), titre, `why_now`, chip thème, **lien(s) source
    cliquable(s) mis en avant**, angle, archétype suggéré, impressions estimées.
  - Actions par carte : **« Rédiger ce post »** (→ Reformulateur pré-rempli avec
    le titre/angle comme post de départ, marque l'idée `utilise`), et
    « Écarter » (`ecarte`).
- **Branchement Reformulateur :** un état partagé (ou paramètre de navigation)
  transporte le texte de départ vers `ReformulationForm`, qui lance alors son
  pré-brief (hooks 8-désirs + use-cases) automatiquement. Réutilise le flux
  existant, aucune duplication.

## Gestion des erreurs

- **Recherche web indisponible / vide :** `generateIdeaDigest()` log l'échec,
  conserve `data/ideas.json` tel quel, `GET /api/ideas` renvoie le digest
  existant + un indicateur `last_run_failed`. L'UI affiche une note discrète
  « Impossible de rafraîchir, voici les dernières idées ».
- **JSON malformé de Claude :** même tolérance que `callClaudeJSON`.
- **Idée invalide (champ manquant) :** filtrée silencieusement, les valides
  passent.
- **Clé API manquante :** `GEMINI`/`CLAUDE` — 500 explicite, comme les autres
  endpoints.

## Tests

- **Unitaires (serveur, sans réseau) :** normalisation de signature +
  dédoublonnage (deux idées équivalentes → une seule) ; `scoreToImpressions`
  déjà couvert ; validation/filtrage des idées brutes (champ manquant écarté) ;
  fusion statut (PATCH ne réordonne pas, ne perd pas de champs).
- **Intégration (mock de l'appel Claude) :** `generateIdeaDigest()` avec une
  réponse web simulée → N idées scorées et persistées ; un 2ᵉ run avec les mêmes
  signaux → 0 ajout (dédoublonnage).
- **Manuel :** bouton « Rafraîchir » → liste peuplée ; « Rédiger ce post » →
  Reformulateur pré-rempli et pré-brief lancé ; « Écarter » → l'idée disparaît
  de la vue par défaut.

## Hors périmètre (v1 — YAGNI)

- Multi-utilisateur / séparation Thomas vs Mathis sur les idées (le moteur
  utilise les patterns fusionnés).
- Édition manuelle du contenu d'une idée (seul le statut change).
- Analytics sur les idées (taux d'utilisation, quelle idée a donné quel post
  publié).
- Épinglage d'API externes (data.gouv, etc.) — envisagé en v2 si un thème est
  sous-couvert par la recherche web.
- Cron réel / hébergement 24/7.

## Évolutions v2 possibles (notées, non engagées)

- Épingler l'API data.gouv pour garantir la couverture « data officielle ».
- Boucle d'apprentissage : quand une idée « utilisée » devient un post publié,
  rapprocher ses vraies impressions du score prédit pour calibrer le moteur.
- Vrai cron quotidien si Charlie est hébergé en continu.
