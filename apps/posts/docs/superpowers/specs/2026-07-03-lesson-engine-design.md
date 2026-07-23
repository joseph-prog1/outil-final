# Moteur de leçons : auto-apprentissage des corrections utilisateur

Date : 2026-07-03
Statut : implémenté

## Contexte

Pattern inspiré du système de mémoire d'Hermes Agent (NousResearch) : mémoire
curée par l'agent + consolidation périodique, sans ML ni infrastructure. Chaque
correction demandée sur une variante est distillée en règle réutilisable,
stockée localement, et réinjectée dans le prompt des générations suivantes.

## Architecture (4 briques)

1. **Raffinement de variante** — bouton "✏️ Affiner" sous chaque variante,
   endpoint `POST /api/refine-variant`. Modifie uniquement ce que demande
   l'instruction, préserve le reste mot pour mot, règles Charlie conservées
   (pas de tirets, pas de superlatifs, ≤ 700 caractères).

2. **Distillation** — après chaque raffinement réussi, appel silencieux à
   `POST /api/distill-lesson` : l'instruction est transformée en règle courte
   et impérative (ex. "adoucis ce hook" → "Préférer des hooks factuels plutôt
   qu'alarmistes"). Les corrections spécifiques au post (changement de chiffre,
   faute de frappe) sont rejetées (`generalizable: false`). Si une règle
   existante exprime la même idée, son compteur d'occurrences est incrémenté
   au lieu de créer un doublon (`matched_rule_id`).

3. **Consolidation** — au-delà de `CONSOLIDATION_THRESHOLD` (12) règles,
   appel à `POST /api/consolidate-lessons` : fusion des doublons (occurrences
   additionnées), résolution des contradictions (la plus fréquente gagne),
   maximum 10 règles conservées. Équivalent des "nudges" périodiques d'Hermes.

4. **Injection** — `generateLearningContext` ajoute la section
   `RÈGLES APPRISES DES CORRECTIONS DE L'UTILISATEUR` en tête du contexte
   (prioritaire sur les patterns statistiques), limitée aux
   `MAX_INJECTED_LESSONS` (8) règles les plus fortes (occurrences puis récence).

## Modèle de données

Store IndexedDB `lessons` (base `charlie-reformulator`, version 2) :

```ts
interface Lesson {
  id: string;
  rule_text: string;          // règle impérative, max ~140 caractères
  category: 'ton' | 'structure' | 'hook' | 'cta' | 'vocabulaire' | 'longueur' | 'autre';
  source_instruction: string; // dernière instruction à l'origine de la règle
  occurrences: number;        // nombre de fois que la préférence a été exprimée
  date_added: string;
  date_last_seen: string;
}
```

Migration v2 : les deux hooks (`useLearningDB`, `useIndexedDB`) ouvrent la même
base ; la migration crée désormais les quatre stores (`hooks`, `winning_posts`,
`hook_entries`, `lessons`) quel que soit le hook qui s'exécute en premier, ce
qui corrige aussi un conflit latent de la v1.

## Fichiers

- `server/index.js` — endpoints `refine-variant`, `distill-lesson`,
  `consolidate-lessons` + prompts dédiés + helper `callClaudeJSON`
- `client/src/utils/lessonEngine.ts` — tri, formatage, application de la
  distillation, reconstruction post-consolidation (helpers purs)
- `client/src/App.tsx` — orchestration : `handleRefineVariant` +
  `learnFromRefinement` (boucle d'apprentissage silencieuse, jamais bloquante)
- `client/src/components/RefinementModal.tsx` — modal générique (texte + images)
- `client/src/components/VariantsDisplay.tsx` — bouton Affiner par variante
- `client/src/components/LearningBooks.tsx` — section "🧭 Règles Apprises"
  (consultation + suppression manuelle)

## Non-objectifs

- Pas de SQLite/FTS5 ni de recherche cross-session (échelle inutile ici)
- Pas de modélisation utilisateur type Honcho (un seul utilisateur, style fixe)
- Pas de système de skills générique (une seule tâche : reformuler du Charlie)
- L'échec de l'apprentissage ne fait jamais échouer le raffinement (log console)
