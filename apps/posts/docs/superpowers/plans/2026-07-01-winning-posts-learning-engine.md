# Moteur d'apprentissage sur les posts gagnants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'analyse de posts gagnants actuellement erronée (qui reformule le post au lieu de l'analyser) par un vrai pipeline de classification à taxonomie fixe, et faire en sorte que les statistiques + exemples les plus pertinents de la base de posts gagnants nourrissent chaque reformulation, sans jamais faire grossir le prompt au-delà d'une taille bornée.

**Architecture:** Un nouvel endpoint serveur `/api/analyze-winning-post` (même modèle de sécurité que `/api/reformulate` existant) classe chaque post gagnant ajouté selon une taxonomie fixe. Côté client, deux modules purs (`learningStats.ts`, `learningRetrieval.ts`) calculent respectivement des statistiques de fréquence et les posts gagnants les plus proches du sujet en cours, sans appel réseau ni dépendance externe. `learningContext.ts` orchestre les deux pour produire le texte injecté dans le prompt de reformulation.

**Tech Stack:** React 18 + TypeScript (client), Express + fetch natif (server), IndexedDB (persistance client, inchangée). Aucune nouvelle dépendance npm.

## Global Constraints

- Taxonomie fixe imposée : `hook_type`, `corps_type`, `cta_type`, `trigger_emotionnel` doivent toujours être une valeur des enums définis dans `analysisTaxonomy.ts` — jamais de texte libre pour ces quatre champs (seul `angle` reste libre).
- Le contexte d'apprentissage injecté dans le prompt de reformulation doit rester de taille bornée quel que soit le volume de posts gagnants stockés (résumé statistique + jusqu'à 3 exemples proches + jusqu'à 5 hooks forts — jamais un dump complet de la base).
- Seuil minimum de 5 posts gagnants valides (nouveau schéma) avant d'afficher une section statistique — en dessous, les pourcentages n'ont pas de sens.
- Les `WinningPost` créés avant ce changement (ancien schéma, sans champs de taxonomie) ne sont ni migrés ni supprimés : ils sont simplement ignorés par `computeLearningStats` et `findClosestWinningPosts`.
- Aucune donnée d'apprentissage n'est stockée côté serveur (IndexedDB reste la seule persistance) ; seul le texte du post à analyser/reformuler transite vers le serveur pour l'appel Claude.
- Aucune nouvelle dépendance npm ajoutée à `client/package.json` ou `server/package.json`.
- `npx tsc --noEmit` dans `client/` a des erreurs préexistantes sans rapport avec cette feature (`App.tsx:145` propriété `source` manquante sur `VariantsDisplay`, variables inutilisées dans `StyleLinter.tsx`/`VariantsDisplay.tsx`, extension d'import dans `main.tsx`). Ne pas s'en servir comme gate de vérification globale — seule l'erreur `import.meta.env` de `useClaudeAPI.ts` sera corrigée (Task 7) car elle est sur une ligne modifiée par ce plan. Chaque tâche se vérifie via un script `npx tsx` ciblé (logique pure) ou un test dans le navigateur (câblage UI).
- Pas de framework de test introduit (décision utilisateur). Les scripts de vérification sont des fichiers temporaires `__verify_tmp.ts` créés puis supprimés à chaque tâche, jamais commités.

---

### Task 1: Taxonomie fixe

**Files:**
- Create: `client/src/utils/analysisTaxonomy.ts`

**Interfaces:**
- Produces: `HOOK_TYPES: readonly string[]`, `type HookType`, `CORPS_TYPES: readonly string[]`, `type CorpsType`, `CTA_TYPES: readonly string[]`, `type CtaType`, `TRIGGER_TYPES: readonly string[]`, `type TriggerType`

- [ ] **Step 1: Créer le fichier de taxonomie**

```ts
// client/src/utils/analysisTaxonomy.ts
export const HOOK_TYPES = [
  'chiffre_choc',
  'question',
  'contre_intuitif',
  'anecdote',
  'citation',
  'affirmation_directe',
] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export const CORPS_TYPES = [
  'liste_numerotee',
  'recit_narratif',
  'donnees_comparatives',
  'probleme_solution',
  'etude_de_cas',
] as const;
export type CorpsType = (typeof CORPS_TYPES)[number];

export const CTA_TYPES = [
  'question_miroir',
  'invitation_commentaire',
  'lien_direct',
  'sondage',
] as const;
export type CtaType = (typeof CTA_TYPES)[number];

export const TRIGGER_TYPES = [
  'curiosite',
  'fomo',
  'anxiete',
  'confiance',
  'fierte',
  'urgence',
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];
```

- [ ] **Step 2: Vérifier avec un script temporaire**

Créer `client/src/utils/__verify_tmp.ts` :

```ts
import { HOOK_TYPES, CORPS_TYPES, CTA_TYPES, TRIGGER_TYPES } from './analysisTaxonomy';

if (HOOK_TYPES.length !== 6) throw new Error(`HOOK_TYPES: attendu 6, reçu ${HOOK_TYPES.length}`);
if (CORPS_TYPES.length !== 5) throw new Error(`CORPS_TYPES: attendu 5, reçu ${CORPS_TYPES.length}`);
if (CTA_TYPES.length !== 4) throw new Error(`CTA_TYPES: attendu 4, reçu ${CTA_TYPES.length}`);
if (TRIGGER_TYPES.length !== 6) throw new Error(`TRIGGER_TYPES: attendu 6, reçu ${TRIGGER_TYPES.length}`);
console.log('PASS');
```

Run: `npx tsx client/src/utils/__verify_tmp.ts`
Expected: `PASS`

- [ ] **Step 3: Supprimer le script temporaire**

Run: `rm client/src/utils/__verify_tmp.ts`

- [ ] **Step 4: Commit**

```bash
git add client/src/utils/analysisTaxonomy.ts
git commit -m "feat: add fixed taxonomy for winning post analysis"
```

---

### Task 2: Schéma de données `WinningPost`

**Files:**
- Modify: `client/src/types/index.ts` (réécriture complète)

**Interfaces:**
- Consumes: `HookType`, `CorpsType`, `CtaType`, `TriggerType` (Task 1, `./analysisTaxonomy`)
- Produces: `interface WinningPostAnalysis`, `interface WinningPost { id: string; post_text: string; analysis: WinningPostAnalysis; date_added: string }`

- [ ] **Step 1: Réécrire le fichier**

```ts
// client/src/types/index.ts
import type { HookType, CorpsType, CtaType, TriggerType } from '../utils/analysisTaxonomy';

export interface ReformulationResponse {
  source_post: string;
  variants: [string, string, string];
  angle: string;
  trigger_emotionnel: string;
  keyword: string;
}

export interface HookDocument {
  id: string;
  source_post: string;
  variants: [string, string, string];
  hook: string;
  angle: string;
  trigger_emotionnel: string;
  cta_generated?: string;
  date_creation: string;
  status: 'draft' | 'published';
  metadata?: Record<string, unknown>;
}

export interface SaveHookRequest {
  source_post: string;
  variants: [string, string, string];
  hook: string;
  angle: string;
  trigger_emotionnel: string;
  cta_generated?: string;
}

export type StyleViolation = {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  fix?: string;
};

export interface WinningPostAnalysis {
  hook_text: string;
  hook_type: HookType;
  corps_type: CorpsType;
  cta_type: CtaType;
  trigger_emotionnel: TriggerType;
  angle: string;
  pourquoi_gagnant: string;
}

export interface WinningPost {
  id: string;
  post_text: string;
  analysis: WinningPostAnalysis;
  date_added: string;
}

export interface HookEntry {
  id: string;
  hook_text: string;
  date_added: string;
}
```

- [ ] **Step 2: Vérifier avec un script temporaire**

Créer `client/src/utils/__verify_tmp.ts` :

```ts
import type { WinningPost, WinningPostAnalysis } from '../types/index';

const analysis: WinningPostAnalysis = {
  hook_text: 'Les CGP perdent 3h par semaine.',
  hook_type: 'chiffre_choc',
  corps_type: 'liste_numerotee',
  cta_type: 'question_miroir',
  trigger_emotionnel: 'fomo',
  angle: 'reporting client',
  pourquoi_gagnant: 'Chiffre concret et douleur reconnaissable.',
};

const post: WinningPost = {
  id: 'test-1',
  post_text: 'texte du post',
  analysis,
  date_added: new Date().toISOString(),
};

console.log('PASS', post.id, post.analysis.hook_type);
```

Run: `npx tsx client/src/utils/__verify_tmp.ts`
Expected: `PASS test-1 chiffre_choc`

- [ ] **Step 3: Supprimer le script temporaire**

Run: `rm client/src/utils/__verify_tmp.ts`

- [ ] **Step 4: Commit**

```bash
git add client/src/types/index.ts
git commit -m "feat: replace WinningPost.analysis with fixed-taxonomy schema"
```

---

### Task 3: Endpoint serveur `/api/analyze-winning-post`

**Files:**
- Modify: `server/index.js`

**Interfaces:**
- Produces: `POST /api/analyze-winning-post` — body `{ post_text: string }` → réponse `{ hook_text, hook_type, corps_type, cta_type, trigger_emotionnel, angle, pourquoi_gagnant }` (200) ou `{ error: string }` (400/500)

- [ ] **Step 1: Ajouter les listes de validation et le prompt d'analyse**

Insérer après la ligne 88 (`SI UNE VARIANTE NE RESPECTE PAS CES CRITÈRES: génère une nouvelle.\`;`) et avant `app.post('/api/reformulate', ...)` (ligne 90) :

```js
const VALID_HOOK_TYPES = ['chiffre_choc', 'question', 'contre_intuitif', 'anecdote', 'citation', 'affirmation_directe'];
const VALID_CORPS_TYPES = ['liste_numerotee', 'recit_narratif', 'donnees_comparatives', 'probleme_solution', 'etude_de_cas'];
const VALID_CTA_TYPES = ['question_miroir', 'invitation_commentaire', 'lien_direct', 'sondage'];
const VALID_TRIGGERS = ['curiosite', 'fomo', 'anxiete', 'confiance', 'fierte', 'urgence'];

const ANALYSIS_SYSTEM_PROMPT = `Tu es un expert en analyse structurelle de posts LinkedIn pour l'audience CGP, banque privée et asset management.

Ta tâche: analyser un post gagnant (performant) et en extraire la structure EXACTE, sans le reformuler ni le modifier.

RÈGLES:
1. hook_text: copie VERBATIM les 1 à 2 premières lignes du post original (aucune reformulation).
2. hook_type: classe le hook dans EXACTEMENT une de ces catégories:
   - chiffre_choc: un chiffre ou une statistique frappante
   - question: une question qui interpelle directement le lecteur
   - contre_intuitif: une affirmation qui va à l'encontre de l'idée reçue
   - anecdote: un récit personnel ou une situation vécue
   - citation: une citation ou parole rapportée
   - affirmation_directe: une déclaration factuelle sans détour
3. corps_type: classe la structure du corps du texte dans EXACTEMENT une de ces catégories:
   - liste_numerotee: étapes ou points numérotés
   - recit_narratif: une histoire racontée de façon linéaire
   - donnees_comparatives: comparaison de chiffres ou de situations
   - probleme_solution: un problème posé puis résolu
   - etude_de_cas: un exemple concret détaillé (client, entreprise)
4. cta_type: classe l'appel à l'action final dans EXACTEMENT une de ces catégories:
   - question_miroir: une question qui renvoie le lecteur à sa propre situation
   - invitation_commentaire: invite à commenter ou répondre
   - lien_direct: renvoie vers un lien externe
   - sondage: propose un choix ou un sondage
5. trigger_emotionnel: identifie EXACTEMENT une émotion dominante parmi:
   curiosite, fomo, anxiete, confiance, fierte, urgence
6. angle: identifie le sujet central en 2 à 4 mots (texte libre, ex: "reporting client", "compliance IA").
7. pourquoi_gagnant: explique en 1 à 2 phrases courtes pourquoi ce post fonctionne.

SORTIE JSON STRICTE (rien d'autre, pas de markdown, pas de backticks):
{
  "hook_text": "...",
  "hook_type": "...",
  "corps_type": "...",
  "cta_type": "...",
  "trigger_emotionnel": "...",
  "angle": "...",
  "pourquoi_gagnant": "..."
}`;
```

- [ ] **Step 2: Ajouter la route, juste avant `app.get('/api/health', ...)`**

Insérer avant la ligne `app.get('/api/health', (req, res) => {` :

```js
app.post('/api/analyze-winning-post', async (req, res) => {
  try {
    const { post_text } = req.body;

    if (!post_text?.trim()) {
      return res.status(400).json({ error: 'Le texte du post est vide' });
    }

    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Analyse la structure de ce post gagnant:\n\n${post_text}\n\nRéponds UNIQUEMENT avec du JSON valide, rien d'autre.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      const message = error.error?.message || `Erreur Claude: ${response.status}`;
      return res.status(response.status).json({ error: message });
    }

    const data = await response.json();
    let content = data.content[0]?.text || '';
    content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '');

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.error('Erreur parsing JSON (analyze-winning-post):', err.message);
      return res.status(500).json({ error: 'Réponse Claude invalide (JSON mal formé)', details: content.substring(0, 200) });
    }

    if (!parsed.hook_text || typeof parsed.hook_text !== 'string') {
      return res.status(500).json({ error: 'Analyse invalide: hook_text manquant' });
    }
    if (!VALID_HOOK_TYPES.includes(parsed.hook_type)) {
      return res.status(500).json({ error: `Analyse invalide: hook_type "${parsed.hook_type}" hors taxonomie` });
    }
    if (!VALID_CORPS_TYPES.includes(parsed.corps_type)) {
      return res.status(500).json({ error: `Analyse invalide: corps_type "${parsed.corps_type}" hors taxonomie` });
    }
    if (!VALID_CTA_TYPES.includes(parsed.cta_type)) {
      return res.status(500).json({ error: `Analyse invalide: cta_type "${parsed.cta_type}" hors taxonomie` });
    }
    if (!VALID_TRIGGERS.includes(parsed.trigger_emotionnel)) {
      return res.status(500).json({ error: `Analyse invalide: trigger_emotionnel "${parsed.trigger_emotionnel}" hors taxonomie` });
    }
    if (!parsed.angle || typeof parsed.angle !== 'string') {
      return res.status(500).json({ error: 'Analyse invalide: angle manquant' });
    }
    if (!parsed.pourquoi_gagnant || typeof parsed.pourquoi_gagnant !== 'string') {
      return res.status(500).json({ error: 'Analyse invalide: pourquoi_gagnant manquant' });
    }

    res.json({
      hook_text: parsed.hook_text,
      hook_type: parsed.hook_type,
      corps_type: parsed.corps_type,
      cta_type: parsed.cta_type,
      trigger_emotionnel: parsed.trigger_emotionnel,
      angle: parsed.angle,
      pourquoi_gagnant: parsed.pourquoi_gagnant,
    });
  } catch (error) {
    console.error('Erreur serveur (analyze-winning-post):', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

```

- [ ] **Step 3: Redémarrer le serveur**

```bash
pkill -f "node index.js" || true
cd server && node index.js &
sleep 1
curl -s http://localhost:5001/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 4: Vérifier le cas d'erreur (texte vide)**

```bash
curl -s -X POST http://localhost:5001/api/analyze-winning-post \
  -H "Content-Type: application/json" \
  -d '{"post_text": ""}'
```

Expected: `{"error":"Le texte du post est vide"}`

- [ ] **Step 5: Vérifier le cas nominal (appel Claude réel)**

```bash
curl -s -X POST http://localhost:5001/api/analyze-winning-post \
  -H "Content-Type: application/json" \
  -d '{"post_text": "Les CGP perdent 3 heures par semaine a chercher des documents clients eparpilles dans 4 outils differents. Nous avons teste une solution avec 40 cabinets. Resultat: 12 heures economisees par conseiller chaque semaine. Vous voulez savoir comment ? Commentez GUIDE et je vous envoie le retour experience en DM."}'
```

Expected: réponse JSON 200 avec les 7 clés `hook_text`, `hook_type`, `corps_type`, `cta_type`, `trigger_emotionnel`, `angle`, `pourquoi_gagnant`. Le texte exact varie (appel LLM réel non déterministe) — vérifier que `hook_type` ∈ `VALID_HOOK_TYPES`, `corps_type` ∈ `VALID_CORPS_TYPES`, `cta_type` ∈ `VALID_CTA_TYPES`, `trigger_emotionnel` ∈ `VALID_TRIGGERS`.

- [ ] **Step 6: Commit**

```bash
git add server/index.js
git commit -m "feat: add /api/analyze-winning-post endpoint with taxonomy validation"
```

---

### Task 4: Moteur de statistiques (`learningStats.ts`)

**Files:**
- Create: `client/src/utils/learningStats.ts`

**Interfaces:**
- Consumes: `WinningPost` (Task 2, `../types/index`), `HOOK_TYPES`/`CORPS_TYPES`/`CTA_TYPES`/`TRIGGER_TYPES`/`HookType`/`CorpsType`/`CtaType`/`TriggerType` (Task 1, `./analysisTaxonomy`)
- Produces: `isValidWinningPost(post: WinningPost): boolean`, `interface LearningStats`, `computeLearningStats(winningPosts: WinningPost[]): LearningStats | null`

- [ ] **Step 1: Créer le fichier**

```ts
// client/src/utils/learningStats.ts
import type { WinningPost } from '../types/index';
import {
  HOOK_TYPES,
  CORPS_TYPES,
  CTA_TYPES,
  TRIGGER_TYPES,
  type HookType,
  type CorpsType,
  type CtaType,
  type TriggerType,
} from './analysisTaxonomy';

const MIN_POSTS_FOR_STATS = 5;

export interface LearningStats {
  totalPosts: number;
  hookTypeFrequency: Array<{ value: HookType; percentage: number }>;
  corpsTypeFrequency: Array<{ value: CorpsType; percentage: number }>;
  ctaTypeFrequency: Array<{ value: CtaType; percentage: number }>;
  triggerFrequency: Array<{ value: TriggerType; percentage: number }>;
}

export function isValidWinningPost(post: WinningPost): boolean {
  return (
    !!post.analysis &&
    (HOOK_TYPES as readonly string[]).includes(post.analysis.hook_type) &&
    (CORPS_TYPES as readonly string[]).includes(post.analysis.corps_type) &&
    (CTA_TYPES as readonly string[]).includes(post.analysis.cta_type) &&
    (TRIGGER_TYPES as readonly string[]).includes(post.analysis.trigger_emotionnel)
  );
}

function frequencyOf<T extends string>(
  values: T[],
  allValues: readonly T[]
): Array<{ value: T; percentage: number }> {
  const total = values.length;
  return allValues
    .map((value) => ({
      value,
      percentage: total === 0 ? 0 : Math.round((values.filter((v) => v === value).length / total) * 100),
    }))
    .filter((entry) => entry.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage);
}

export function computeLearningStats(winningPosts: WinningPost[]): LearningStats | null {
  const validPosts = winningPosts.filter(isValidWinningPost);

  if (validPosts.length < MIN_POSTS_FOR_STATS) {
    return null;
  }

  return {
    totalPosts: validPosts.length,
    hookTypeFrequency: frequencyOf(validPosts.map((p) => p.analysis.hook_type), HOOK_TYPES),
    corpsTypeFrequency: frequencyOf(validPosts.map((p) => p.analysis.corps_type), CORPS_TYPES),
    ctaTypeFrequency: frequencyOf(validPosts.map((p) => p.analysis.cta_type), CTA_TYPES),
    triggerFrequency: frequencyOf(validPosts.map((p) => p.analysis.trigger_emotionnel), TRIGGER_TYPES),
  };
}
```

- [ ] **Step 2: Vérifier avec un script temporaire**

Créer `client/src/utils/__verify_tmp.ts` :

```ts
import type { WinningPost } from '../types/index';
import { computeLearningStats } from './learningStats';

function assertDeepEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}\n  attendu: ${e}\n  reçu:    ${a}`);
  }
}

const makePost = (id: string, hook_type: any, corps_type: any, cta_type: any, trigger_emotionnel: any): WinningPost => ({
  id,
  post_text: `Post ${id}`,
  analysis: { hook_text: `H${id}`, hook_type, corps_type, cta_type, trigger_emotionnel, angle: 'test', pourquoi_gagnant: 'x' },
  date_added: '2026-01-01',
});

const posts: WinningPost[] = [
  makePost('1', 'chiffre_choc', 'liste_numerotee', 'question_miroir', 'fomo'),
  makePost('2', 'chiffre_choc', 'recit_narratif', 'question_miroir', 'curiosite'),
  makePost('3', 'question', 'probleme_solution', 'invitation_commentaire', 'fomo'),
  makePost('4', 'chiffre_choc', 'liste_numerotee', 'question_miroir', 'fomo'),
  makePost('5', 'anecdote', 'etude_de_cas', 'lien_direct', 'confiance'),
  // Post au format legacy (avant taxonomie) : doit être ignoré
  { id: '6', post_text: 'legacy', analysis: { hook: 'old' } as any, date_added: '2026-01-06' },
];

const stats = computeLearningStats(posts);
if (!stats) throw new Error('computeLearningStats a retourné null alors que 5 posts valides sont fournis');

assertDeepEqual(stats.totalPosts, 5, 'totalPosts');
assertDeepEqual(
  stats.hookTypeFrequency,
  [{ value: 'chiffre_choc', percentage: 60 }, { value: 'question', percentage: 20 }, { value: 'anecdote', percentage: 20 }],
  'hookTypeFrequency'
);
assertDeepEqual(
  stats.corpsTypeFrequency,
  [
    { value: 'liste_numerotee', percentage: 40 },
    { value: 'recit_narratif', percentage: 20 },
    { value: 'probleme_solution', percentage: 20 },
    { value: 'etude_de_cas', percentage: 20 },
  ],
  'corpsTypeFrequency'
);
assertDeepEqual(
  stats.ctaTypeFrequency,
  [{ value: 'question_miroir', percentage: 60 }, { value: 'invitation_commentaire', percentage: 20 }, { value: 'lien_direct', percentage: 20 }],
  'ctaTypeFrequency'
);
assertDeepEqual(
  stats.triggerFrequency,
  [{ value: 'fomo', percentage: 60 }, { value: 'curiosite', percentage: 20 }, { value: 'confiance', percentage: 20 }],
  'triggerFrequency'
);

// Sous le seuil (4 posts valides) -> null
const belowThreshold = computeLearningStats(posts.slice(0, 4));
if (belowThreshold !== null) throw new Error('computeLearningStats aurait dû retourner null sous le seuil de 5 posts valides');

console.log('PASS');
```

Run: `npx tsx client/src/utils/__verify_tmp.ts`
Expected: `PASS`

- [ ] **Step 3: Supprimer le script temporaire**

Run: `rm client/src/utils/__verify_tmp.ts`

- [ ] **Step 4: Commit**

```bash
git add client/src/utils/learningStats.ts
git commit -m "feat: add learning stats engine over winning posts"
```

---

### Task 5: Moteur de retrieval par mots-clés (`learningRetrieval.ts`)

**Files:**
- Create: `client/src/utils/learningRetrieval.ts`

**Interfaces:**
- Consumes: `WinningPost` (Task 2, `../types/index`), `isValidWinningPost` (Task 4, `./learningStats`)
- Produces: `findClosestWinningPosts(postText: string, winningPosts: WinningPost[], topN?: number): WinningPost[]`

- [ ] **Step 1: Créer le fichier**

```ts
// client/src/utils/learningRetrieval.ts
import type { WinningPost } from '../types/index';
import { isValidWinningPost } from './learningStats';

const STOPWORDS_FR = new Set([
  'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'a', 'au', 'aux',
  'en', 'pour', 'par', 'sur', 'dans', 'avec', 'sans', 'ce', 'ces', 'cette',
  'qui', 'que', 'quoi', 'dont', 'ou', 'est', 'sont', 'etre', 'avoir',
  'ont', 'plus', 'moins', 'tres', 'pas', 'ne', 'se', 'sa', 'son', 'ses',
  'nous', 'vous', 'ils', 'elles', 'il', 'elle', 'on', 'je', 'tu', 'mais',
  'donc', 'or', 'ni', 'car', 'comme', 'si', 'tout', 'tous', 'toute', 'toutes',
]);

function extractSignificantWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]+/g) || [];

  return new Set(words.filter((word) => word.length > 3 && !STOPWORDS_FR.has(word)));
}

export function findClosestWinningPosts(
  postText: string,
  winningPosts: WinningPost[],
  topN: number = 3
): WinningPost[] {
  const targetWords = extractSignificantWords(postText);

  if (targetWords.size === 0) {
    return [];
  }

  const scored = winningPosts
    .filter(isValidWinningPost)
    .map((post) => {
      const postWords = extractSignificantWords(`${post.analysis.angle} ${post.post_text}`);
      const overlap = [...targetWords].filter((word) => postWords.has(word)).length;
      return { post, overlap };
    })
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);

  return scored.slice(0, topN).map((entry) => entry.post);
}
```

- [ ] **Step 2: Vérifier avec un script temporaire**

Créer `client/src/utils/__verify_tmp.ts` :

```ts
import type { WinningPost } from '../types/index';
import { findClosestWinningPosts } from './learningRetrieval';

const makePost = (id: string, angle: string, post_text: string): WinningPost => ({
  id,
  post_text,
  analysis: {
    hook_text: 'H',
    hook_type: 'chiffre_choc',
    corps_type: 'liste_numerotee',
    cta_type: 'question_miroir',
    trigger_emotionnel: 'fomo',
    angle,
    pourquoi_gagnant: 'x',
  },
  date_added: '2026-01-01',
});

const posts: WinningPost[] = [
  makePost('1', 'reporting client', 'Les CGP passent trois heures par semaine sur le reporting client eparpille.'),
  makePost('2', 'compliance rgpd', 'La compliance RGPD coute cher aux cabinets de gestion de patrimoine.'),
  makePost('3', 'fiscalite', 'Optimiser la fiscalite des clients fortunes demande des outils specialises.'),
];

const target = 'Comment automatiser le reporting client dans un cabinet de gestion de patrimoine ?';
const result = findClosestWinningPosts(target, posts, 3);

if (result.length === 0) throw new Error('Aucun résultat retourné alors que "reporting" et "client" et "gestion" et "patrimoine" sont partagés');
if (result[0].id !== '1') throw new Error(`Premier résultat attendu: post '1' (reporting client), reçu: post '${result[0].id}'`);

// Texte sans aucun mot significatif partagé -> tableau vide
const noMatch = findClosestWinningPosts('xyz', posts, 3);
if (noMatch.length !== 0) throw new Error(`Attendu tableau vide pour texte sans mot significatif, reçu ${noMatch.length} résultat(s)`);

console.log('PASS');
```

Run: `npx tsx client/src/utils/__verify_tmp.ts`
Expected: `PASS`

- [ ] **Step 3: Supprimer le script temporaire**

Run: `rm client/src/utils/__verify_tmp.ts`

- [ ] **Step 4: Commit**

```bash
git add client/src/utils/learningRetrieval.ts
git commit -m "feat: add keyword-based retrieval of closest winning posts"
```

---

### Task 6: Réécriture de `generateLearningContext`

**Files:**
- Modify: `client/src/utils/learningContext.ts` (réécriture complète)

**Interfaces:**
- Consumes: `computeLearningStats` (Task 4, `./learningStats`), `findClosestWinningPosts` (Task 5, `./learningRetrieval`), `WinningPost`/`HookEntry` (Task 2, `../types/index`)
- Produces: `generateLearningContext(postText: string, winningPosts: WinningPost[], hookEntries?: HookEntry[]): string`

- [ ] **Step 1: Réécrire le fichier**

```ts
// client/src/utils/learningContext.ts
import type { WinningPost, HookEntry } from '../types/index';
import { computeLearningStats, type LearningStats } from './learningStats';
import { findClosestWinningPosts } from './learningRetrieval';

function formatStats(stats: LearningStats | null): string {
  if (!stats) return '';

  const formatFrequency = (label: string, frequency: Array<{ value: string; percentage: number }>) =>
    `${label}: ${frequency.map((f) => `${f.value} (${f.percentage}%)`).join(', ')}`;

  return `PATTERNS DOMINANTS (sur ${stats.totalPosts} posts gagnants analysés):
${formatFrequency('Types de hook', stats.hookTypeFrequency)}
${formatFrequency('Types de corps', stats.corpsTypeFrequency)}
${formatFrequency('Types de CTA', stats.ctaTypeFrequency)}
${formatFrequency('Triggers émotionnels', stats.triggerFrequency)}`;
}

function formatClosestExamples(examples: WinningPost[]): string {
  if (examples.length === 0) return '';

  const formatted = examples
    .map(
      (post, idx) => `
EXEMPLE ${idx + 1} - Post gagnant proche du sujet:
Post original (extrait): "${post.post_text.substring(0, 150)}${post.post_text.length > 150 ? '...' : ''}"
Hook: "${post.analysis.hook_text}" (type: ${post.analysis.hook_type})
Corps: ${post.analysis.corps_type}
CTA: ${post.analysis.cta_type}
Trigger: ${post.analysis.trigger_emotionnel}
Pourquoi ça marche: ${post.analysis.pourquoi_gagnant}`
    )
    .join('\n');

  return `EXEMPLES LES PLUS PERTINENTS POUR CE SUJET:${formatted}`;
}

export function generateLearningContext(
  postText: string,
  winningPosts: WinningPost[],
  hookEntries?: HookEntry[]
): string {
  const parts: string[] = [];

  const statsText = formatStats(computeLearningStats(winningPosts));
  if (statsText) {
    parts.push(statsText);
  }

  const examplesText = formatClosestExamples(findClosestWinningPosts(postText, winningPosts, 3));
  if (examplesText) {
    parts.push(examplesText);
  }

  if (hookEntries && hookEntries.length > 0) {
    const hooksList = hookEntries
      .slice(0, 5)
      .map((hook, idx) => `${idx + 1}. ${hook.hook_text}`)
      .join('\n');

    parts.push(`HOOKS FORTS À IMITER:\n${hooksList}`);
  }

  if (parts.length === 0) {
    return '';
  }

  return `
${parts.join('\n\n')}

Instructions: Utilise ces éléments comme référence pour comprendre ce qui marche. Applique les mêmes patterns (types de hook/corps/CTA dominants, triggers émotionnels) aux reformulations.
`;
}
```

- [ ] **Step 2: Vérifier avec un script temporaire**

Créer `client/src/utils/__verify_tmp.ts` :

```ts
import type { WinningPost, HookEntry } from '../types/index';
import { generateLearningContext } from './learningContext';

// Cas 1: base vide -> chaîne vide
const empty = generateLearningContext('un post quelconque', [], []);
if (empty !== '') throw new Error(`Attendu chaîne vide pour base vide, reçu: "${empty}"`);

const makePost = (id: string, angle: string, post_text: string): WinningPost => ({
  id,
  post_text,
  analysis: {
    hook_text: `Hook ${id}`,
    hook_type: 'chiffre_choc',
    corps_type: 'liste_numerotee',
    cta_type: 'question_miroir',
    trigger_emotionnel: 'fomo',
    angle,
    pourquoi_gagnant: `Raison ${id}`,
  },
  date_added: '2026-01-01',
});

const posts: WinningPost[] = [
  makePost('1', 'reporting client', 'Les CGP passent trois heures par semaine sur le reporting client.'),
  makePost('2', 'compliance rgpd', 'La compliance RGPD coute cher aux cabinets.'),
  makePost('3', 'fiscalite', 'Optimiser la fiscalite des clients fortunes.'),
  makePost('4', 'audit patrimonial', 'Un audit patrimonial mal fait coute cher au client.'),
  makePost('5', 'gestion dynamique', 'La gestion dynamique bat la gestion passive sur 10 ans.'),
];

const hooks: HookEntry[] = [{ id: 'h1', hook_text: 'Cette base de données gratuite mérite votre attention', date_added: '2026-01-01' }];

const context = generateLearningContext('Comment automatiser le reporting client en cabinet de gestion ?', posts, hooks);

if (!context.includes('PATTERNS DOMINANTS')) throw new Error('Contexte attendu avec section PATTERNS DOMINANTS (5 posts valides = seuil atteint)');
if (!context.includes('EXEMPLES LES PLUS PERTINENTS')) throw new Error('Contexte attendu avec section EXEMPLES LES PLUS PERTINENTS (post "reporting client" doit matcher)');
if (!context.includes('HOOKS FORTS')) throw new Error('Contexte attendu avec section HOOKS FORTS');
if (!context.includes('reporting client')) throw new Error('Le post le plus pertinent (reporting client) devrait apparaître dans le contexte');

console.log('PASS');
```

Run: `npx tsx client/src/utils/__verify_tmp.ts`
Expected: `PASS`

- [ ] **Step 3: Supprimer le script temporaire**

Run: `rm client/src/utils/__verify_tmp.ts`

- [ ] **Step 4: Commit**

```bash
git add client/src/utils/learningContext.ts
git commit -m "feat: rewrite generateLearningContext with bounded stats+retrieval"
```

---

### Task 7: `useClaudeAPI` — nouvelle fonction d'analyse + signature `reformulate`

**Files:**
- Modify: `client/src/hooks/useClaudeAPI.ts` (réécriture complète)
- Create: `client/src/vite-env.d.ts`

**Interfaces:**
- Consumes: `WinningPostAnalysis`, `ReformulationResponse` (Task 2, `../types/index`)
- Produces: `useClaudeAPI(apiKey: string) => { reformulate(postText: string, learningContext?: string): Promise<ReformulationResponse>, analyzeWinningPost(postText: string): Promise<WinningPostAnalysis> }`

- [ ] **Step 1: Créer `vite-env.d.ts` (corrige l'erreur `import.meta.env` introduite plus tôt dans la session)**

```ts
// client/src/vite-env.d.ts
/// <reference types="vite/client" />
```

- [ ] **Step 2: Réécrire `useClaudeAPI.ts`**

```ts
// client/src/hooks/useClaudeAPI.ts
import type { ReformulationResponse, WinningPostAnalysis } from '../types/index';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';

export function useClaudeAPI(apiKey: string) {
  const reformulate = async (postText: string, learningContext?: string): Promise<ReformulationResponse> => {
    if (!postText.trim()) {
      throw new Error('Le texte du post est vide');
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/reformulate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_text: postText,
          learning_context: learningContext,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        const message = error.error || `Erreur: ${response.status}`;
        throw new Error(message);
      }

      const data = await response.json();

      return {
        source_post: postText,
        variants: data.variants as [string, string, string],
        angle: data.angle,
        trigger_emotionnel: data.trigger_emotionnel,
        keyword: data.hook,
      };
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Impossible de joindre le serveur (${SERVER_URL}). Assurez-vous qu'il est lancé.`);
      }
      throw error;
    }
  };

  const analyzeWinningPost = async (postText: string): Promise<WinningPostAnalysis> => {
    if (!postText.trim()) {
      throw new Error('Le texte du post est vide');
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/analyze-winning-post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_text: postText,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        const message = error.error || `Erreur: ${response.status}`;
        throw new Error(message);
      }

      return (await response.json()) as WinningPostAnalysis;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Impossible de joindre le serveur (${SERVER_URL}). Assurez-vous qu'il est lancé.`);
      }
      throw error;
    }
  };

  return { reformulate, analyzeWinningPost };
}
```

Cette fonction n'utilise ni React state ni React hooks internes (`useState`/`useEffect`) — elle peut donc être appelée directement hors composant React pour la vérification.

- [ ] **Step 3: Vérifier avec un script temporaire (appel réel au serveur, doit tourner sur le port 5001)**

```bash
curl -s http://localhost:5001/api/health
```

Expected: `{"status":"ok"}` (sinon, démarrer le serveur : `cd server && node index.js &`)

Créer `client/src/hooks/__verify_tmp.ts` :

```ts
import { useClaudeAPI } from './useClaudeAPI';

const api = useClaudeAPI('unused-key');

const result = await api.analyzeWinningPost(
  "Les CGP perdent 3 heures par semaine a chercher des documents clients eparpilles dans 4 outils differents. Nous avons teste une solution avec 40 cabinets. Resultat: 12 heures economisees par conseiller chaque semaine. Vous voulez savoir comment ? Commentez GUIDE et je vous envoie le retour experience en DM."
);

const VALID_HOOK_TYPES = ['chiffre_choc', 'question', 'contre_intuitif', 'anecdote', 'citation', 'affirmation_directe'];
if (!VALID_HOOK_TYPES.includes(result.hook_type)) {
  throw new Error(`hook_type hors taxonomie: ${result.hook_type}`);
}

console.log('PASS', result.hook_type, result.corps_type, result.cta_type, result.trigger_emotionnel);
```

Run: `npx tsx client/src/hooks/__verify_tmp.ts`
Expected: `PASS <hook_type> <corps_type> <cta_type> <trigger_emotionnel>` (valeurs exactes non déterministes, mais toutes issues de la taxonomie)

- [ ] **Step 4: Supprimer le script temporaire**

Run: `rm client/src/hooks/__verify_tmp.ts`

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useClaudeAPI.ts client/src/vite-env.d.ts
git commit -m "feat: add analyzeWinningPost to useClaudeAPI, move learningContext to call-time param"
```

---

### Task 8: Câbler `LearningBooks.tsx` sur la vraie analyse

**Files:**
- Modify: `client/src/components/LearningBooks.tsx:17-18,44-58`

**Interfaces:**
- Consumes: `analyzeWinningPost` (Task 7, `../hooks/useClaudeAPI`), `WinningPost` (Task 2, `../types/index`)

- [ ] **Step 1: Remplacer l'utilisation du hook (ligne 18)**

Old:
```tsx
  const { reformulate: analyzePost } = useClaudeAPI(apiKey);
```

New:
```tsx
  const { analyzeWinningPost } = useClaudeAPI(apiKey);
```

- [ ] **Step 2: Remplacer le corps de `handleAddWinningPost` (lignes 44-58)**

Old:
```tsx
    try {
      const analysis = await analyzePost(postText);

      const winningPost: WinningPost = {
        id: `winning-${Date.now()}`,
        post_text: postText,
        analysis: {
          hook: analysis.variants[0].split('\n')[0],
          angle: analysis.angle,
          trigger_emotionnel: analysis.trigger_emotionnel,
          structure_clé: `Hook + Angle: ${analysis.angle} + Trigger: ${analysis.trigger_emotionnel}`,
          pourquoi_gagnant: `Ce post active le trigger "${analysis.trigger_emotionnel}" avec un angle "${analysis.angle}". Le hook capture l'attention immédiatement.`,
        },
        date_added: new Date().toISOString(),
      };

      await db.addWinningPost(winningPost);
```

New:
```tsx
    try {
      const analysis = await analyzeWinningPost(postText);

      const winningPost: WinningPost = {
        id: `winning-${Date.now()}`,
        post_text: postText,
        analysis,
        date_added: new Date().toISOString(),
      };

      await db.addWinningPost(winningPost);
```

- [ ] **Step 3: Vérifier dans le navigateur**

```bash
cd server && (node index.js &)
cd ../client && npm run dev &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`

Ouvrir `http://localhost:5173` dans le navigateur, entrer une clé API (n'importe quelle chaîne commençant par `sk-ant-`, elle n'est jamais transmise), aller dans l'onglet "🧠 Apprentissage", section "Posts Gagnants", coller un post réel et cliquer "🧠 Analyser et ajouter". Vérifier :
1. L'alerte "✓ Post gagnant ajouté!" s'affiche sans erreur console.
2. Dans les DevTools → Application → IndexedDB → `charlie-reformulator` → `winning_posts`, l'entrée créée a bien `analysis.hook_type`, `analysis.corps_type`, `analysis.cta_type`, `analysis.trigger_emotionnel` remplis avec des valeurs de la taxonomie (pas de champ `hook` ni `structure_clé`).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/LearningBooks.tsx
git commit -m "fix: LearningBooks now calls the dedicated analysis endpoint instead of reformulate"
```

---

### Task 9: Relier `App.tsx` et `ReformulationForm.tsx` au nouveau contexte d'apprentissage

**Files:**
- Modify: `client/src/App.tsx:9,140`
- Modify: `client/src/components/ReformulationForm.tsx` (réécriture complète)

**Interfaces:**
- Consumes: `generateLearningContext` (Task 6, `../utils/learningContext`), `reformulate` (Task 7, `../hooks/useClaudeAPI`), `WinningPost`/`HookEntry` (Task 2, `../types/index`)

- [ ] **Step 1: `App.tsx` — retirer l'import devenu inutile (ligne 9)**

Old:
```tsx
import { useIndexedDB } from './hooks/useIndexedDB';
import { useLearningDB } from './hooks/useLearningDB';
import { generateLearningContext } from './utils/learningContext';
import type { ReformulationResponse, WinningPost, HookEntry } from './types/index';
```

New:
```tsx
import { useIndexedDB } from './hooks/useIndexedDB';
import { useLearningDB } from './hooks/useLearningDB';
import type { ReformulationResponse, WinningPost, HookEntry } from './types/index';
```

- [ ] **Step 2: `App.tsx` — passer `winningPosts`/`hookEntries` au lieu d'un `learningContext` précalculé (ligne 140)**

Old:
```tsx
            <ReformulationForm apiKey={apiKey} onReformulate={handleReformulate} learningContext={generateLearningContext(winningPosts, hooks)} />
```

New:
```tsx
            <ReformulationForm apiKey={apiKey} onReformulate={handleReformulate} winningPosts={winningPosts} hookEntries={hooks} />
```

- [ ] **Step 3: Réécrire `ReformulationForm.tsx`**

```tsx
// client/src/components/ReformulationForm.tsx
import { useState } from 'react';
import { useClaudeAPI } from '../hooks/useClaudeAPI';
import { generateLearningContext } from '../utils/learningContext';
import type { ReformulationResponse, WinningPost, HookEntry } from '../types/index';

interface Props {
  apiKey: string;
  onReformulate: (response: ReformulationResponse) => void;
  isLoading?: boolean;
  winningPosts: WinningPost[];
  hookEntries: HookEntry[];
}

export function ReformulationForm({ apiKey, onReformulate, isLoading = false, winningPosts, hookEntries }: Props) {
  const [postText, setPostText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { reformulate } = useClaudeAPI(apiKey);

  const handleReformulate = async () => {
    if (!postText.trim()) {
      setError('Veuillez entrer le texte du post');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const learningContext = generateLearningContext(postText, winningPosts, hookEntries);
      const response = await reformulate(postText, learningContext);
      onReformulate(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPostText(text);
    } catch (err) {
      setError('Impossible de lire le presse-papiers');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-2xl font-bold mb-4">Reformuler un post</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Coller le texte du post LinkedIn ou Twitter
        </label>
        <textarea
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          placeholder="Collez ici le texte du post..."
          className="w-full h-40 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-charlie-accent"
          disabled={loading || isLoading}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handlePaste}
          disabled={loading || isLoading}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50"
        >
          📋 Coller
        </button>
        <button
          onClick={handleReformulate}
          disabled={loading || isLoading || !postText.trim()}
          className="flex-1 px-4 py-2 bg-charlie-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium"
        >
          {loading || isLoading ? '⏳ Reformulation...' : '✨ Reformuler'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Vérifier dans le navigateur**

Avec les deux serveurs lancés (`server/index.js` sur 5001, `client` `npm run dev` sur 5173) et au moins 1 post gagnant déjà présent en base (Task 8) :

1. Ouvrir `http://localhost:5173`, onglet "✨ Reformulateur".
2. Ouvrir DevTools → Network, coller un post lié au même sujet que le post gagnant sauvegardé, cliquer "✨ Reformuler".
3. Cliquer sur la requête `POST /api/reformulate` dans Network → onglet "Payload"/"Request" → vérifier que le champ `learning_context` est non vide et contient soit `HOOKS FORTS À IMITER` (s'il y a des hooks) soit `EXEMPLES LES PLUS PERTINENTS` (si le post gagnant correspond au sujet).
4. Vérifier que les 3 variantes s'affichent normalement, sans erreur console.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/components/ReformulationForm.tsx
git commit -m "feat: compute learning context at reformulate-time with the actual post text"
```

---

### Task 10: Vérification end-to-end

**Files:** aucun (validation manuelle uniquement)

- [ ] **Step 1: Redémarrer proprement les deux serveurs**

```bash
pkill -f "node index.js" || true
pkill -f "vite" || true
cd server && node index.js &
cd ../client && npm run dev &
sleep 2
curl -s http://localhost:5001/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `{"status":"ok"}` puis `200`

- [ ] **Step 2: Constituer une base d'au moins 5 posts gagnants variés**

Dans l'onglet "🧠 Apprentissage", ajouter 5 posts gagnants couvrant des sujets et structures différents (reporting, compliance, fiscalité, audit, gestion) via "🧠 Analyser et ajouter". Vérifier qu'aucune erreur n'apparaît et que chaque ajout incrémente le compteur de l'onglet "🧠 Apprentissage (N)".

- [ ] **Step 3: Vérifier l'apparition des statistiques**

Retourner dans l'onglet "✨ Reformulateur", coller un post sur un des sujets couverts, cliquer "✨ Reformuler", inspecter le payload de la requête réseau `POST /api/reformulate` (comme en Task 9 Step 4) : la section `PATTERNS DOMINANTS` doit maintenant apparaître dans `learning_context` (seuil de 5 posts valides atteint).

- [ ] **Step 4: Vérifier que les règles de style existantes ne sont pas cassées**

Sur le résultat de reformulation obtenu, cliquer "🔍 Vérifier style" : confirmer qu'aucune violation `no-dashes` n'apparaît à tort et que le compteur de caractères par variante reste cohérent (< 700 signalé en vert). Ceci confirme que l'ajout du `learning_context` dans le system prompt (Task 6) n'a pas perturbé les règles de style déjà en place côté serveur.

- [ ] **Step 5: Commit final (si des ajustements ont eu lieu pendant la vérification)**

```bash
git status --short
```

S'il n'y a aucun changement non commité, ne rien committer. Sinon, committer les ajustements avec un message décrivant précisément la correction apportée.
