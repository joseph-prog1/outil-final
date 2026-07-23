# Générateur d'idées de posts LinkedIn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un onglet « Idées » qui, sur un clic, va chercher des sujets de posts frais via Claude + recherche web, les score/calibre sur les vrais posts, et permet de rédiger le post en un clic dans le Reformulateur existant.

**Architecture:** Toute la logique pure (signature, dédoublonnage, validation, prompt de découverte, I/O fichier) vit dans un nouveau module isolé `server/ideas.js`, testable sans réseau via `node:test`. `server/index.js` orchestre : appel Claude avec l'outil `web_search`, calibrage du score en fourchette d'impressions (réutilise `impressionDistribution` + `scoreToImpressions` déjà présents), et expose 3 endpoints REST. Côté client, un onglet `IdeasView` + un hook `useIdeas`, et un branchement du bouton « Rédiger ce post » vers le Reformulateur par pré-remplissage de son texte.

**Tech Stack:** Node ESM + Express (serveur), React + TypeScript + Vite + Tailwind (client), `node:test` (tests serveur, aucune dépendance ajoutée).

## Global Constraints

- **Aucune nouvelle dépendance npm.** Tests via `node:test`/`node:assert` intégrés.
- **Modèle de découverte : `claude-opus-4-8`** avec l'outil `web_search_20260209`. Les autres appels (Haiku) restent inchangés.
- **UI en français**, classes Tailwind existantes uniquement (`forest`, `cream`, `paper`, `line`, `ink`, `muted`, `tracking-caps`, `font-serif`). Pas d'emoji dans l'UI.
- **Persistance** dans `data/ideas.json` (le dossier `data/` est versionné volontairement, repo privé).
- **Déclenchement 100 % manuel** : aucun cron, aucun rafraîchissement auto, aucun appel au démarrage.
- **Ne jamais `git push`** sans accord explicite de Thomas. Les commits locaux sont OK.
- Serveur sur port 5001, client sur 5173. Lancement : `npm run dev` à la racine.

---

### Task 1: Module `ideas.js` — cœur logique (signature, validation, dédoublonnage)

**Files:**
- Create: `server/ideas.js`
- Create: `server/ideas.test.js`
- Modify: `server/package.json` (ajouter le script `test`)

**Interfaces:**
- Produces:
  - `IDEA_THEMES: string[]` = `['ia','reglementation','data_officielle','marche_patrimoine']`
  - `normalizeSignature(titre: string, theme: string): string`
  - `ideaId(titre: string, theme: string): string` (16 hex chars)
  - `validateRawIdea(raw: object): Idea | null` où `Idea = { id, theme, titre, why_now, sources: {titre,url,date?}[], angle, suggested_hook, suggested_archetype, score, impressions_estimees: null, statut: 'nouveau' }`
  - `mergeIdeas(existing: Idea[], incoming: Idea[]): { list: Idea[], added: number }`

- [ ] **Step 1: Écrire le module (create `server/ideas.js`)**

```js
// server/ideas.js
// Logique pure du générateur d'idées de posts (aucun effet de bord réseau).
// Isolé de index.js pour être testable via `node --test`.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const IDEA_THEMES = ['ia', 'reglementation', 'data_officielle', 'marche_patrimoine'];

const VALID_ARCHETYPES_FOR_IDEA = [
  'versus', 'partenariat', 'workflow', 'diagramme_produit',
  'mockup_iphone', 'bar_chart', 'typo_geante', 'icone_3d',
];

// Signature normalisée d'une idée: minuscule, sans accents, sans ponctuation.
// Sert de clé de dédoublonnage inter-runs.
export function normalizeSignature(titre, theme) {
  return `${theme || ''} ${titre || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // supprime les accents (diacritiques combinants)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function ideaId(titre, theme) {
  return crypto.createHash('sha1').update(normalizeSignature(titre, theme)).digest('hex').slice(0, 16);
}

// Valide/normalise une idée brute renvoyée par Claude. Renvoie null si inexploitable.
export function validateRawIdea(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const titre = typeof raw.titre === 'string' ? raw.titre.trim() : '';
  if (!titre) return null;
  const theme = IDEA_THEMES.includes(raw.theme) ? raw.theme : 'ia';
  const sources = Array.isArray(raw.sources)
    ? raw.sources
        .filter((s) => s && typeof s.url === 'string' && s.url.startsWith('http'))
        .map((s) => ({
          titre: typeof s.titre === 'string' && s.titre ? s.titre : s.url,
          url: s.url,
          date: typeof s.date === 'string' ? s.date : undefined,
        }))
    : [];
  const score = Math.min(10, Math.max(0, Math.round(Number(raw.score) || 0)));
  const suggested_archetype = VALID_ARCHETYPES_FOR_IDEA.includes(raw.suggested_archetype)
    ? raw.suggested_archetype
    : 'typo_geante';
  return {
    id: ideaId(titre, theme),
    theme,
    titre,
    why_now: typeof raw.why_now === 'string' ? raw.why_now : '',
    sources,
    angle: typeof raw.angle === 'string' ? raw.angle : '',
    suggested_hook: typeof raw.suggested_hook === 'string' ? raw.suggested_hook : '',
    suggested_archetype,
    score,
    impressions_estimees: null, // rempli par l'orchestrateur (index.js)
    statut: 'nouveau',
  };
}

// Fusionne les idées entrantes avec l'existant, dédoublonnées par id.
// Une idée déjà connue N'EST PAS réécrasée: son statut (vu/utilisé/écarté) est préservé.
export function mergeIdeas(existing, incoming) {
  const byId = new Map(existing.map((i) => [i.id, i]));
  let added = 0;
  for (const idea of incoming) {
    if (!idea || byId.has(idea.id)) continue;
    byId.set(idea.id, idea);
    added += 1;
  }
  return { list: [...byId.values()], added };
}

// Construit le prompt de découverte (system + user) piloté par les patterns gagnants.
export function buildDiscoveryPrompt({ winningTopics, demographics, seenTitles, days = 7 }) {
  const topics = (winningTopics || []).slice(0, 12).map((t) => `- ${t}`).join('\n') || '- (aucun pattern encore)';
  const seen = (seenTitles || []).slice(0, 60).map((t) => `- ${t}`).join('\n') || '(aucun)';
  const demo = demographics ? `Audience: ${demographics}.` : '';
  const system = `Tu es analyste veille + growth LinkedIn pour un compte B2B en gestion de patrimoine (CGP, banquiers privés, asset managers). Tu utilises la recherche web pour trouver des SUJETS DE POSTS frais et pertinents, et tu ne remontes que ce qui a des chances de performer pour CE compte.

THÈMES À COUVRIR: sorties & actu IA (theme=ia); réglementation & conformité AMF/ACPR/MiFID II/DDA/LCB-FT/fiscalité (theme=reglementation); data officielle & sources publiques data.gouv/INSEE/Pappers/SIRENE/BODACC (theme=data_officielle); actu marché & patrimoine PER/assurance-vie/immobilier/taux (theme=marche_patrimoine).

SUJETS QUI SURPERFORMENT chez ce compte (priorise ce qui s'en rapproche):
${topics}

Pour chaque idée: une actu RÉELLE et VÉRIFIABLE (source web avec URL fonctionnelle), fraîche (idéalement les ${days} derniers jours), transformée en idée de post pour ce public. Donne un score de potentiel /10 (10 = colle parfaitement aux sujets qui surperforment ci-dessus ET très frais; 4-5 = tangentiel). N'invente jamais de source.

NE PROPOSE PAS ces sujets déjà remontés récemment:
${seen}

Cible 8 à 12 idées réparties sur les 4 thèmes. ${demo}

SORTIE JSON STRICTE (rien d'autre, pas de markdown, pas de backticks):
{"ideas": [
  {"titre": "idée de post en 1 ligne", "theme": "ia|reglementation|data_officielle|marche_patrimoine", "why_now": "1 phrase", "sources": [{"titre": "titre article", "url": "https://...", "date": "AAAA-MM-JJ"}], "angle": "angle CGP concret", "suggested_hook": "accroche ~140 caracteres", "suggested_archetype": "un de: versus,partenariat,workflow,diagramme_produit,mockup_iphone,bar_chart,typo_geante,icone_3d", "score": 8}
]}`;
  const user = `Trouve les meilleures idées de posts LinkedIn du moment pour ce compte. Utilise la recherche web pour des sources réelles et fraîches. Réponds UNIQUEMENT avec du JSON valide.`;
  return { system, user };
}

// ─── I/O fichier ─────────────────────────────────────────────
export function readIdeas(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ideas: Array.isArray(data.ideas) ? data.ideas : [],
      last_run: data.last_run || null,
      last_run_failed: !!data.last_run_failed,
    };
  } catch {
    return { ideas: [], last_run: null, last_run_failed: false };
  }
}

export function saveIdeas(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
}
```

- [ ] **Step 2: Écrire les tests (create `server/ideas.test.js`)**

```js
// server/ideas.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import {
  normalizeSignature, ideaId, validateRawIdea, mergeIdeas,
} from './ideas.js';

test('normalizeSignature strips accents, punctuation and case', () => {
  assert.strictEqual(
    normalizeSignature('L’État OUVRE data.gouv !', 'data_officielle'),
    'data officielle l etat ouvre data gouv'
  );
});

test('ideaId is deterministic and 16 chars', () => {
  const a = ideaId('Titre X', 'ia');
  const b = ideaId('Titre X', 'ia');
  assert.strictEqual(a, b);
  assert.strictEqual(a.length, 16);
});

test('validateRawIdea rejects empty titre', () => {
  assert.strictEqual(validateRawIdea({ titre: '   ' }), null);
});

test('validateRawIdea normalizes theme, archetype, score and sources', () => {
  const idea = validateRawIdea({
    titre: 'Sujet',
    theme: 'bogus',
    score: 42,
    suggested_archetype: 'nope',
    sources: [{ url: 'ftp://x' }, { titre: 'A', url: 'https://a.com' }],
  });
  assert.strictEqual(idea.theme, 'ia');
  assert.strictEqual(idea.suggested_archetype, 'typo_geante');
  assert.strictEqual(idea.score, 10);
  assert.deepStrictEqual(idea.sources, [{ titre: 'A', url: 'https://a.com', date: undefined }]);
  assert.strictEqual(idea.statut, 'nouveau');
});

test('mergeIdeas preserves existing status and counts only new', () => {
  const existing = [{ id: 'x', titre: 'A', statut: 'utilise' }];
  const incoming = [
    { id: 'x', titre: 'A', statut: 'nouveau' },
    { id: 'y', titre: 'B', statut: 'nouveau' },
  ];
  const { list, added } = mergeIdeas(existing, incoming);
  assert.strictEqual(added, 1);
  assert.strictEqual(list.find((i) => i.id === 'x').statut, 'utilise');
  assert.strictEqual(list.length, 2);
});
```

- [ ] **Step 3: Ajouter le script de test (modify `server/package.json`)**

Dans l'objet `"scripts"`, ajouter la ligne `test` :

```json
"scripts": {
  "dev": "node --watch-path=. --watch-preserve-output index.js",
  "test": "node --test"
}
```
(Conserver les scripts déjà présents ; ajouter seulement `"test": "node --test"`.)

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `npm test --workspace=server`
Expected: `# pass 5` (5 tests, 0 fail).

- [ ] **Step 5: Commit**

```bash
git add server/ideas.js server/ideas.test.js server/package.json
git commit -m "feat(ideas): module logique idées de posts + tests (signature, validation, dédoublonnage)"
```

---

### Task 2: Tests du prompt de découverte et de l'I/O fichier

**Files:**
- Modify: `server/ideas.test.js` (ajouter des tests ; le code testé existe déjà depuis Task 1)

**Interfaces:**
- Consumes: `buildDiscoveryPrompt`, `readIdeas` de `server/ideas.js`.

- [ ] **Step 1: Ajouter les tests (modify `server/ideas.test.js`)**

Ajouter en tête l'import, puis les tests à la fin du fichier. Remplacer la ligne d'import existante par :

```js
import {
  normalizeSignature, ideaId, validateRawIdea, mergeIdeas,
  buildDiscoveryPrompt, readIdeas,
} from './ideas.js';
```

Ajouter à la fin du fichier :

```js
test('buildDiscoveryPrompt embeds winning topics and seen titles', () => {
  const { system, user } = buildDiscoveryPrompt({
    winningTopics: ['IA + data officielle Pappers'],
    seenTitles: ['Ancien sujet déjà posté'],
  });
  assert.match(system, /IA \+ data officielle Pappers/);
  assert.match(system, /Ancien sujet déjà posté/);
  assert.match(user, /JSON/);
});

test('readIdeas returns an empty store for a missing file', () => {
  const store = readIdeas('/nonexistent/path/ideas.json');
  assert.deepStrictEqual(store, { ideas: [], last_run: null, last_run_failed: false });
});
```

- [ ] **Step 2: Lancer les tests**

Run: `npm test --workspace=server`
Expected: `# pass 7` (0 fail).

- [ ] **Step 3: Commit**

```bash
git add server/ideas.test.js
git commit -m "test(ideas): couverture du prompt de découverte et de l'I/O fichier"
```

---

### Task 3: Endpoints serveur + moteur (recherche web + calibrage + persistance)

**Files:**
- Modify: `server/index.js` (imports en haut ; helpers + endpoints avant `app.get('/api/health'…)`)

**Interfaces:**
- Consumes: `IDEA_THEMES, validateRawIdea, mergeIdeas, readIdeas, saveIdeas, buildDiscoveryPrompt` (ideas.js) ; `readPatterns()`, `impressionDistribution(author)`, `scoreToImpressions(score, dist)`, `LINKEDIN_DATA_DIR`, `CLAUDE_API_KEY` (déjà dans index.js).
- Produces (HTTP) :
  - `POST /api/ideas/generate` → `{ added: number, total: number }`
  - `GET /api/ideas?theme=&statut=` → `{ ideas: Idea[], last_run: string|null, last_run_failed: boolean }`
  - `PATCH /api/ideas/:id` body `{ statut }` → l'idée mise à jour

- [ ] **Step 1: Ajouter l'import du module en haut de `server/index.js`**

Juste après les imports existants (repérer la ligne `import sharp from 'sharp';` ou le dernier `import`), ajouter :

```js
import {
  validateRawIdea, mergeIdeas, readIdeas, saveIdeas, buildDiscoveryPrompt,
} from './ideas.js';
```

- [ ] **Step 2: Ajouter le helper de recherche web + le moteur, juste avant `app.get('/api/health'`**

```js
// ─────────────────────────────────────────────────────────────
// Générateur d'idées de posts: Claude Opus 4.8 + recherche web,
// piloté par les patterns gagnants. Déclenchement 100% manuel.
// ─────────────────────────────────────────────────────────────

const IDEAS_FILE = path.join(LINKEDIN_DATA_DIR, 'ideas.json');

// Parse tolérant partagé (fences ```json, extraction du 1er { au dernier }).
function parseLooseJson(text) {
  const clean = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error('Réponse Claude invalide (JSON mal formé)');
  }
}

// Appel Claude avec l'outil de recherche web. Concatène les blocs texte de
// la réponse (la réponse mêle blocs web_search et texte) puis parse le JSON.
async function callClaudeWebSearch(system, user, maxTokens = 6000) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: maxTokens,
      system,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
      messages: [{ role: 'user', content: user }],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || `Erreur Claude: ${response.status}`;
    const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
    err.status = response.status;
    throw err;
  }
  const text = (data.content || [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
  return parseLooseJson(text);
}

// Moteur: cherche des idées fraîches, les score en impressions (calibrées sur
// les vrais posts), dédoublonne, persiste. Ne jette pas la liste existante.
async function generateIdeaDigest() {
  const store = readIdeas(IDEAS_FILE);
  try {
    const winningTopics = [
      ...new Set(Object.values(readPatterns()).flatMap((r) => r.sujets_gagnants || [])),
    ];
    const seenTitles = store.ideas.slice(0, 60).map((i) => i.titre);
    const { system, user } = buildDiscoveryPrompt({
      winningTopics,
      demographics: 'CGP, banquiers privés, asset managers (France)',
      seenTitles,
    });

    const parsed = await callClaudeWebSearch(system, user, 6000);
    const raw = Array.isArray(parsed.ideas) ? parsed.ideas : [];
    const dist = impressionDistribution(null); // distribution globale (tous auteurs)
    const now = new Date().toISOString();

    const incoming = raw
      .map(validateRawIdea)
      .filter(Boolean)
      .map((idea) => ({
        ...idea,
        date_found: now,
        impressions_estimees: dist ? scoreToImpressions(idea.score, dist) : null,
      }));

    const { list, added } = mergeIdeas(store.ideas, incoming);
    list.sort((a, b) => b.score - a.score);
    saveIdeas(IDEAS_FILE, { ideas: list, last_run: now, last_run_failed: false });
    return { added, total: list.length };
  } catch (error) {
    console.error('Échec generateIdeaDigest:', error.message);
    // Conserve les idées existantes, marque juste l'échec du dernier run
    saveIdeas(IDEAS_FILE, { ...store, last_run_failed: true });
    throw error;
  }
}

app.post('/api/ideas/generate', async (req, res) => {
  try {
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }
    const result = await generateIdeaDigest();
    res.json(result);
  } catch (error) {
    console.error('Erreur serveur (ideas/generate):', error);
    res.status(error.status || 502).json({ error: error.message || 'Erreur serveur' });
  }
});

app.get('/api/ideas', (req, res) => {
  const { theme, statut } = req.query;
  const store = readIdeas(IDEAS_FILE);
  let ideas = store.ideas;
  if (theme) ideas = ideas.filter((i) => i.theme === theme);
  if (statut) ideas = ideas.filter((i) => i.statut === statut);
  ideas = [...ideas].sort((a, b) => b.score - a.score);
  res.json({ ideas, last_run: store.last_run, last_run_failed: store.last_run_failed });
});

app.patch('/api/ideas/:id', (req, res) => {
  const VALID_STATUTS = ['nouveau', 'vu', 'utilise', 'ecarte'];
  const { statut } = req.body;
  if (!VALID_STATUTS.includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }
  const store = readIdeas(IDEAS_FILE);
  const idea = store.ideas.find((i) => i.id === req.params.id);
  if (!idea) return res.status(404).json({ error: 'Idée introuvable' });
  idea.statut = statut;
  saveIdeas(IDEAS_FILE, store);
  res.json(idea);
});
```

- [ ] **Step 3: Vérifier la syntaxe**

Run: `node --check server/index.js`
Expected: aucune sortie (pas d'erreur).

- [ ] **Step 4: Smoke test des endpoints (serveur lancé)**

S'assurer que le serveur tourne (`npm run dev` à la racine, ou déjà lancé). Puis :

Run: `curl -s -X POST http://localhost:5001/api/ideas/generate | head -c 200`
Expected: un JSON `{"added":<n>,"total":<n>}` (l'appel peut prendre 30-90 s : recherche web). Si `added` > 0, le moteur fonctionne.

Run: `curl -s "http://localhost:5001/api/ideas" | head -c 300`
Expected: `{"ideas":[...],"last_run":"...","last_run_failed":false}` avec au moins une idée portant `titre`, `sources`, `score`, `impressions_estimees`.

Run (remplacer `<ID>` par un id réel de la liste) : `curl -s -X PATCH http://localhost:5001/api/ideas/<ID> -H "Content-Type: application/json" -d '{"statut":"ecarte"}' | head -c 120`
Expected: l'idée renvoyée avec `"statut":"ecarte"`.

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat(ideas): endpoints generate/list/patch + moteur recherche web calibré"
```

---

### Task 4: Types client + hook `useIdeas`

**Files:**
- Modify: `client/src/types/index.ts` (ajouter les types)
- Create: `client/src/hooks/useIdeas.ts`

**Interfaces:**
- Produces:
  - Types `IdeaSource`, `PostIdea`, `IdeasResponse`, `GenerateIdeasResult`
  - Hook `useIdeas()` → `{ ideas, lastRun, lastRunFailed, loading, generating, error, fetchIdeas, generateIdeas, setIdeaStatus }`

- [ ] **Step 1: Ajouter les types (modify `client/src/types/index.ts`, à la fin du fichier)**

```ts
// ─── Idées de posts (onglet Idées) ───────────────────────────
export interface IdeaSource {
  titre: string;
  url: string;
  date?: string;
}

export interface PostIdea {
  id: string;
  date_found?: string;
  theme: 'ia' | 'reglementation' | 'data_officielle' | 'marche_patrimoine' | string;
  titre: string;
  why_now: string;
  sources: IdeaSource[];
  angle: string;
  suggested_hook: string;
  suggested_archetype: string;
  score: number;
  impressions_estimees: { low: number; high: number } | null;
  statut: 'nouveau' | 'vu' | 'utilise' | 'ecarte' | string;
}

export interface IdeasResponse {
  ideas: PostIdea[];
  last_run: string | null;
  last_run_failed: boolean;
}

export interface GenerateIdeasResult {
  added: number;
  total: number;
}
```

- [ ] **Step 2: Créer le hook (create `client/src/hooks/useIdeas.ts`)**

```ts
import { useState, useCallback } from 'react';
import type { PostIdea, IdeasResponse, GenerateIdeasResult } from '../types/index';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';

export function useIdeas() {
  const [ideas, setIdeas] = useState<PostIdea[]>([]);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [lastRunFailed, setLastRunFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const fetchIdeas = useCallback(async (filters?: { theme?: string; statut?: string }) => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (filters?.theme) qs.set('theme', filters.theme);
      if (filters?.statut) qs.set('statut', filters.statut);
      const q = qs.toString();
      const res = await fetch(`${SERVER_URL}/api/ideas${q ? `?${q}` : ''}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Erreur: ${res.status}`);
      }
      const data = (await res.json()) as IdeasResponse;
      setIdeas(data.ideas);
      setLastRun(data.last_run);
      setLastRunFailed(data.last_run_failed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, []);

  const generateIdeas = useCallback(async (): Promise<GenerateIdeasResult> => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch(`${SERVER_URL}/api/ideas/generate`, { method: 'POST' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Erreur: ${res.status}`);
      }
      return (await res.json()) as GenerateIdeasResult;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      throw e;
    } finally {
      setGenerating(false);
    }
  }, []);

  // Optimiste: l'UI bouge d'abord, le PATCH suit.
  const setIdeaStatus = useCallback(async (id: string, statut: string) => {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, statut } : i)));
    try {
      await fetch(`${SERVER_URL}/api/ideas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      });
    } catch {
      /* l'UI a déjà été mise à jour de façon optimiste */
    }
  }, []);

  return { ideas, lastRun, lastRunFailed, loading, generating, error, fetchIdeas, generateIdeas, setIdeaStatus };
}
```

- [ ] **Step 3: Vérifier la compilation TypeScript**

Run: `npm run -w client build`
Expected: build réussi (`✓ built in …`), pas d'erreur de type.

- [ ] **Step 4: Commit**

```bash
git add client/src/types/index.ts client/src/hooks/useIdeas.ts
git commit -m "feat(ideas): types client + hook useIdeas"
```

---

### Task 5: Composant `IdeasView`

**Files:**
- Create: `client/src/components/IdeasView.tsx`

**Interfaces:**
- Consumes: `useIdeas()` (Task 4), types `PostIdea` (Task 4).
- Produces: composant `IdeasView` avec prop `{ onWritePost: (idea: PostIdea) => void }`.

- [ ] **Step 1: Créer le composant (create `client/src/components/IdeasView.tsx`)**

```tsx
import { useEffect, useState } from 'react';
import { useIdeas } from '../hooks/useIdeas';
import type { PostIdea } from '../types/index';

interface Props {
  onWritePost: (idea: PostIdea) => void;
}

const THEME_LABELS: Record<string, string> = {
  ia: 'IA',
  reglementation: 'Réglementation',
  data_officielle: 'Data officielle',
  marche_patrimoine: 'Marché & patrimoine',
};

const THEMES = ['ia', 'reglementation', 'data_officielle', 'marche_patrimoine'];

function scoreTone(score: number): string {
  if (score >= 8) return 'text-forest';
  if (score >= 6) return 'text-ink';
  if (score >= 4) return 'text-amber-700';
  return 'text-red-700';
}

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '')}k` : `${n}`;

export function IdeasView({ onWritePost }: Props) {
  const { ideas, lastRun, lastRunFailed, loading, generating, error, fetchIdeas, generateIdeas, setIdeaStatus } = useIdeas();
  const [themeFilter, setThemeFilter] = useState<string | null>(null);

  useEffect(() => {
    void fetchIdeas();
  }, [fetchIdeas]);

  const handleGenerate = async () => {
    try {
      await generateIdeas();
      await fetchIdeas(themeFilter ? { theme: themeFilter } : undefined);
    } catch {
      /* l'erreur est déjà exposée par le hook */
    }
  };

  const visible = ideas
    .filter((i) => i.statut !== 'ecarte')
    .filter((i) => !themeFilter || i.theme === themeFilter);

  return (
    <div>
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="font-serif text-3xl">Idées de posts</h2>
          <p className="text-xs text-muted mt-1">
            {lastRun
              ? `Dernière recherche : ${new Date(lastRun).toLocaleString('fr-FR')}`
              : 'Aucune recherche encore lancée.'}
            {lastRunFailed && ' — la dernière recherche a échoué, voici les dernières idées trouvées.'}
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-6 py-3 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-40"
        >
          {generating ? 'Recherche en cours…' : 'Trouve-moi des sujets'}
        </button>
      </div>

      {/* Filtres thème */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setThemeFilter(null)}
          className={`text-xs uppercase tracking-caps px-3 py-1.5 border transition ${
            themeFilter === null ? 'border-forest text-forest' : 'border-line text-muted hover:text-ink'
          }`}
        >
          Tous
        </button>
        {THEMES.map((t) => (
          <button
            key={t}
            onClick={() => setThemeFilter(t)}
            className={`text-xs uppercase tracking-caps px-3 py-1.5 border transition ${
              themeFilter === t ? 'border-forest text-forest' : 'border-line text-muted hover:text-ink'
            }`}
          >
            {THEME_LABELS[t]}
          </button>
        ))}
      </div>

      {error && (
        <div className="border border-red-300 bg-paper text-red-800 px-5 py-4 text-sm mb-6">{error}</div>
      )}

      {!loading && visible.length === 0 && (
        <div className="border border-line bg-paper px-5 py-8 text-center text-sm text-muted">
          Aucune idée pour le moment. Cliquez sur « Trouve-moi des sujets » pour lancer une recherche.
        </div>
      )}

      {/* Liste */}
      <div className="space-y-4">
        {visible.map((idea) => (
          <div key={idea.id} className="border border-line bg-paper p-6">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex items-baseline gap-3">
                <span className={`font-serif text-2xl ${scoreTone(idea.score)}`}>{idea.score}</span>
                <span className="text-xs text-muted">/10</span>
                <span className="text-xs uppercase tracking-caps text-muted border border-line px-2 py-0.5">
                  {THEME_LABELS[idea.theme] ?? idea.theme}
                </span>
                {idea.statut === 'utilise' && (
                  <span className="text-xs uppercase tracking-caps text-forest">Utilisée</span>
                )}
              </div>
              {idea.impressions_estimees && (
                <span className="text-xs text-ink/80 whitespace-nowrap">
                  ~{fmt(idea.impressions_estimees.low)}–{fmt(idea.impressions_estimees.high)} impressions
                </span>
              )}
            </div>

            <h3 className="font-serif text-xl text-ink mb-2">{idea.titre}</h3>
            {idea.why_now && <p className="text-sm text-ink/80 mb-3">{idea.why_now}</p>}

            {idea.sources.length > 0 && (
              <div className="mb-3">
                <h4 className="text-xs uppercase tracking-caps text-muted mb-1">Sources</h4>
                <ul className="space-y-1">
                  {idea.sources.map((s, i) => (
                    <li key={i} className="text-sm">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-forest underline underline-offset-2 hover:text-ink break-all"
                      >
                        {s.titre}
                      </a>
                      {s.date && <span className="text-xs text-muted"> — {s.date}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {idea.angle && (
              <p className="text-sm text-ink/70 mb-4">
                <span className="text-xs uppercase tracking-caps text-muted">Angle CGP</span>
                <br />
                {idea.angle}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  onWritePost(idea);
                  void setIdeaStatus(idea.id, 'utilise');
                }}
                className="px-4 py-2.5 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition"
              >
                Rédiger ce post
              </button>
              <button
                onClick={() => void setIdeaStatus(idea.id, 'ecarte')}
                className="px-4 py-2.5 border border-line text-muted text-xs uppercase tracking-caps hover:text-ink hover:border-ink transition"
              >
                Écarter
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npm run -w client build`
Expected: build réussi (le composant n'est pas encore monté ; on vérifie juste qu'il compile). Note : Vite peut « tree-shaker » un composant non importé — s'il n'apparaît pas dans le build, c'est normal, l'important est l'absence d'erreur TS. Pour forcer la vérification de type : `npx -w client tsc --noEmit` doit passer sans erreur.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/IdeasView.tsx
git commit -m "feat(ideas): composant IdeasView (liste scorée, sources en avant, actions)"
```

---

### Task 6: Câblage onglet + « Rédiger ce post » vers le Reformulateur

**Files:**
- Modify: `client/src/App.tsx` (onglet, état seed, handler, render)
- Modify: `client/src/components/ReformulationForm.tsx` (prop `seedText` + effet de pré-remplissage)

**Interfaces:**
- Consumes: `IdeasView` (Task 5), `PostIdea` (Task 4).
- Produces: onglet « Idées » fonctionnel ; clic « Rédiger ce post » → bascule sur Reformulateur avec le texte pré-rempli et pré-brief auto.

- [ ] **Step 1: `ReformulationForm` — accepter un texte initial**

Dans `client/src/components/ReformulationForm.tsx`, ajouter `seedText` à l'interface `Props` :

```tsx
interface Props {
  onReformulate: (response: ReformulationResponse) => void;
  isLoading?: boolean;
  winningPosts: WinningPost[];
  hookEntries: HookEntry[];
  lessons?: Lesson[];
  // Texte injecté depuis l'onglet Idées: pré-remplit le champ et déclenche le pré-brief
  seedText?: string | null;
}
```

Ajouter `seedText` à la déstructuration des props :

```tsx
export function ReformulationForm({ onReformulate, isLoading = false, winningPosts, hookEntries, lessons, seedText }: Props) {
```

Puis, juste APRÈS le `useEffect` du pré-brief automatique (celui qui dépend de `[postText]`, se terminant par `}, [postText]);`), ajouter :

```tsx
  // Pré-remplissage depuis l'onglet Idées: pose le texte, le pré-brief se
  // déclenche ensuite tout seul via l'effet ci-dessus.
  useEffect(() => {
    if (seedText && seedText.trim()) {
      setPostText(seedText);
    }
  }, [seedText]);
```

- [ ] **Step 2: `App.tsx` — imports, onglet, état, handler**

Ajouter l'import du composant et du type (près des autres imports de composants) :

```tsx
import { IdeasView } from './components/IdeasView';
import type { PostIdea } from './types/index';
```
(Si un `import type { … } from './types/index'` existe déjà, ajouter `PostIdea` à cette liste plutôt qu'un second import.)

Ajouter l'onglet dans le tableau `TABS`, après `images` :

```tsx
  { id: 'reformulator', label: 'Reformulateur' },
  { id: 'images', label: 'Miniatures' },
  { id: 'ideas', label: 'Idées' },
  { id: 'stats', label: 'Stats' },
  { id: 'learning', label: 'Apprentissage' },
```

Étendre le type de `activeTab` pour inclure `'ideas'` :

```tsx
  const [activeTab, setActiveTab] = useState<'reformulator' | 'library' | 'learning' | 'images' | 'stats' | 'ideas'>('reformulator');
```

Ajouter l'état du seed + le handler (près des autres `useState`/handlers) :

```tsx
  const [reformulatorSeed, setReformulatorSeed] = useState<string | null>(null);

  // Depuis l'onglet Idées: pré-remplit le Reformulateur et bascule dessus.
  const handleWriteFromIdea = (idea: PostIdea) => {
    setReformulatorSeed(`${idea.titre}\n\n${idea.angle}`.trim());
    setActiveTab('reformulator');
  };
```

- [ ] **Step 3: `App.tsx` — passer le seed + monter l'onglet**

Passer `seedText` au `ReformulationForm` (repérer la balise `<ReformulationForm … />` et ajouter la prop) :

```tsx
<ReformulationForm onReformulate={handleReformulate} winningPosts={winningPosts} hookEntries={hooks} lessons={lessons} seedText={reformulatorSeed} />
```

Ajouter la branche de rendu. Dans la chaîne ternaire du `<main>`, insérer une branche `ideas` (par ex. juste avant `activeTab === 'stats'`) :

```tsx
        ) : activeTab === 'ideas' ? (
          <IdeasView onWritePost={handleWriteFromIdea} />
        ) : activeTab === 'stats' ? (
```

- [ ] **Step 4: Compiler**

Run: `npm run -w client build`
Expected: build réussi, aucune erreur TS.

- [ ] **Step 5: Vérification manuelle bout-en-bout (serveur + client lancés)**

Avec `npm run dev` actif, dans le navigateur sur http://localhost:5173 :
1. Cliquer l'onglet **Idées** → la liste se charge (vide au premier lancement).
2. Cliquer **Trouve-moi des sujets** → état « Recherche en cours… », puis apparition de cartes classées par score, avec liens sources cliquables.
3. Filtrer par thème (ex. **Data officielle**) → la liste se restreint.
4. Sur une carte, cliquer **Rédiger ce post** → bascule sur **Reformulateur**, le champ est pré-rempli (titre + angle), le pré-brief (hooks + use cases) se génère seul. La carte passe en « Utilisée ».
5. Revenir sur **Idées**, cliquer **Écarter** sur une autre carte → elle disparaît de la vue.

- [ ] **Step 6: Commit**

```bash
git add client/src/App.tsx client/src/components/ReformulationForm.tsx
git commit -m "feat(ideas): onglet Idées + bouton Rédiger ce post branché sur le Reformulateur"
```

---

## Notes d'implémentation (fidélité à la spec)

- **Scoring calibré, sans N appels Claude.** La spec prévoyait de scorer chaque idée via le moteur `predict-performance`. Raffinement retenu : le score /10 est produit DANS l'appel de découverte (Claude a les patterns gagnants sous les yeux), puis converti en fourchette d'impressions par `scoreToImpressions(score, impressionDistribution())` — la moitié « calibrée sur les vrais posts » du moteur de prédiction est donc réutilisée, sans un appel Claude supplémentaire par idée (coût et latence maîtrisés). Intention de la spec respectée : idées scorées et ancrées sur la distribution réelle.
- **Pas de planification** : le moteur ne tourne que sur `POST /api/ideas/generate` (clic bouton). Aucun cron, aucun appel au démarrage — conforme au choix « 100 % manuel ».
- **Robustesse** : un échec de recherche web conserve `data/ideas.json` et positionne `last_run_failed=true` ; l'UI affiche une note et montre les dernières idées.
- **Ne pas `git push`** ces commits sans accord explicite de Thomas.
