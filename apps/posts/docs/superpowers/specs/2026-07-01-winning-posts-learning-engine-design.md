# Moteur d'apprentissage sur les posts gagnants — Design

## Contexte

Le tab "Apprentissage" de l'app permet déjà d'ajouter des "posts gagnants" (posts LinkedIn externes/internes performants) et des "hooks forts" isolés, stockés en local (IndexedDB, jamais envoyés au serveur). Ce contenu est ensuite injecté dans le prompt système à chaque reformulation via `generateLearningContext`.

Deux problèmes motivent ce travail :

1. **Le bouton "Analyser et ajouter" ne fait pas ce qu'il prétend faire.** Il appelle `useClaudeAPI.reformulate()` — la même fonction que pour reformuler un post normal — puis étiquette le résultat *reformulé en style Charlie* comme "analyse du post gagnant original". Aucune structure réelle (hook/corps/CTA) du post original n'est extraite.
2. **Il n'y a pas de mécanisme pour que la base grandisse sans dégrader le système.** Aujourd'hui, `generateLearningContext` prend simplement les 5 derniers posts ajoutés, sans notion de pertinence par rapport au sujet en cours, et sans vue d'ensemble des patterns qui reviennent.

## Objectif

Construire un pipeline qui : (1) analyse correctement chaque post gagnant ajouté en extrayant sa structure (hook/corps/CTA) selon une taxonomie fixe, (2) calcule des statistiques de fréquence sur l'ensemble de la base, (3) retrouve les posts gagnants les plus pertinents pour le sujet en cours de reformulation, et (4) injecte le tout — de taille bornée quel que soit le volume de données — dans le prompt de reformulation.

## Non-objectifs (hors scope)

- Pas d'entraînement de modèle ML réel : aucune métrique de performance (likes/commentaires) n'est disponible, uniquement du texte. Le "apprentissage" est de la classification + statistiques + retrieval, pas du ML au sens strict.
- Pas d'import en masse de posts (le flux reste un post à la fois, comme aujourd'hui).
- Pas de relecture/correction manuelle de la classification automatique avant sauvegarde.
- Pas de recherche sémantique par embeddings (matching par catégories + mots-clés uniquement, gratuit et instantané).
- Pas de stockage serveur des données d'apprentissage (IndexedDB reste la seule persistance, confidentialité préservée).
- Pas de classification des "Hooks Forts" (`HookEntry` reste du texte libre, ce sont des fragments isolés sans corps/CTA).
- Pas de migration automatique des `WinningPost` créés avant ce changement (ancien schéma).

## Architecture

Tout reste côté client (React + IndexedDB), à l'exception d'un unique nouvel endpoint serveur qui proxy l'appel Claude d'analyse (même modèle de sécurité que l'endpoint de reformulation existant : la clé API ne quitte jamais le serveur). Aucune nouvelle dépendance, aucune nouvelle infrastructure.

```
LearningBooks.tsx
   └─ analyzeWinningPost(postText) [useClaudeAPI]
         └─ POST /api/analyze-winning-post (server/index.js)
               └─ Claude (prompt d'analyse dédié, taxonomie fixe imposée)
   └─ sauvegarde WinningPost (nouveau schéma) dans IndexedDB (useLearningDB)

ReformulationForm.tsx (au clic "Reformuler")
   └─ generateLearningContext(postText, winningPosts, hookEntries)
         ├─ computeLearningStats(winningPosts)        [learningStats.ts]
         ├─ findClosestWinningPosts(postText, ...)    [learningRetrieval.ts]
         └─ formatage du contexte (bornée en taille)
   └─ reformulate(postText, learningContext) [useClaudeAPI]
         └─ POST /api/reformulate (avec learning_context enrichi)
```

## Taxonomie fixe

Définie une seule fois dans `client/src/utils/analysisTaxonomy.ts`, réutilisée par le prompt d'analyse serveur (liste énumérée + définitions) et par le moteur de stats.

- `hook_type` : `chiffre_choc`, `question`, `contre_intuitif`, `anecdote`, `citation`, `affirmation_directe`
- `corps_type` : `liste_numerotee`, `recit_narratif`, `donnees_comparatives`, `probleme_solution`, `etude_de_cas`
- `cta_type` : `question_miroir`, `invitation_commentaire`, `lien_direct`, `sondage`
- `trigger_emotionnel` : `curiosite`, `fomo`, `anxiete`, `confiance`, `fierte`, `urgence`
- `angle` : reste en texte libre (tags de sujet pour le matching par mots-clés, pas de stats dessus).

## Modèle de données

`client/src/types/index.ts`, interface `WinningPost` :

```ts
interface WinningPost {
  id: string;
  post_text: string;
  analysis: {
    hook_text: string;               // extrait verbatim du post original
    hook_type: HookType;             // enum
    corps_type: CorpsType;           // enum
    cta_type: CtaType;               // enum
    angle: string;                    // texte libre (sujet)
    trigger_emotionnel: TriggerType; // enum
    pourquoi_gagnant: string;         // explication libre courte
  };
  date_added: string;
}
```

Remplace les champs `hook` (première ligne de la variante reformulée) et `structure_clé` (texte libre redondant) du schéma actuel. `HookEntry` est inchangé.

**Compatibilité avec les données existantes** : les `WinningPost` créés avant ce changement n'ont pas les champs de la nouvelle taxonomie. Ils ne sont ni migrés ni supprimés automatiquement — `computeLearningStats` et `findClosestWinningPosts` les ignorent silencieusement (vérification de la présence et de la validité des champs enum avant de les compter/scorer).

## Pipeline d'analyse

Nouvel endpoint `POST /api/analyze-winning-post` dans `server/index.js`, sur le même modèle que `/api/reformulate` (proxy Claude, clé API côté serveur uniquement).

Nouveau prompt système dédié (`ANALYSIS_SYSTEM_PROMPT`, distinct du prompt de reformulation) demandant à Claude de :
1. Extraire `hook_text` verbatim (1-2 premières lignes du post original, non réécrites).
2. Choisir `hook_type`, `corps_type`, `cta_type`, `trigger_emotionnel` strictement dans la taxonomie fixe (liste + définitions incluses dans le prompt).
3. Identifier `angle` en texte libre (2-4 mots).
4. Expliquer `pourquoi_gagnant` en 1-2 phrases.
5. Répondre en JSON strict correspondant au schéma `WinningPost.analysis`.

Côté client, `useClaudeAPI` gagne une fonction `analyzeWinningPost(postText)` (nouvel endpoint, même hook). `LearningBooks.tsx` l'appelle à la place de l'actuel usage erroné de `reformulate()`.

**Validation stricte côté serveur** (aucune relecture humaine n'existe dans ce flux) : avant de renvoyer la réponse, le serveur vérifie que `hook_type`/`corps_type`/`cta_type`/`trigger_emotionnel` appartiennent à la taxonomie fixe et que le JSON est bien formé. En cas d'échec, aucune sauvegarde n'a lieu ; le client affiche une erreur claire dans le bandeau d'erreur déjà présent dans `LearningBooks.tsx` (aucune nouvelle UI d'erreur à construire).

## Moteur de statistiques et de retrieval

Trois fichiers focalisés et testables indépendamment :

**`client/src/utils/learningStats.ts`** — `computeLearningStats(winningPosts)` : fréquences de `hook_type`/`corps_type`/`cta_type`/`trigger_emotionnel` sur toute la base, triées par pourcentage décroissant. Coût constant en tokens quel que soit le volume de données (résumé compact, pas de liste exhaustive). **Seuil** : en dessous de 5 posts gagnants valides (nouveau schéma), la section stats est omise — les pourcentages n'ont pas de sens statistique sur un échantillon trop petit.

**`client/src/utils/learningRetrieval.ts`** — `findClosestWinningPosts(postText, winningPosts, topN=3)` : score par recouvrement de mots significatifs (minuscule, stopwords français filtrés) entre le texte à reformuler et `angle + post_text` de chaque post gagnant valide. Retourne jusqu'à 3 posts ; retourne un tableau vide si aucun post ne partage de mot significatif (pas de bruit aléatoire injecté).

**`client/src/utils/learningContext.ts`** (existant, réécrit) — orchestre : stats globales (si seuil atteint) + jusqu'à 3 exemples les plus proches du sujet (texte tronqué + hook_type/corps_type/cta_type/trigger + pourquoi_gagnant) + la liste "Hooks Forts" (mécanisme actuel inchangé, top 5). Signature modifiée pour prendre `postText` en paramètre :

```ts
generateLearningContext(postText: string, winningPosts: WinningPost[], hookEntries?: HookEntry[]): string
```

Le contexte injecté reste de taille bornée quel que soit le volume de la base (10 ou 1000 posts) : c'est ce qui permet à la base de grossir sans dégrader le coût/latence de chaque reformulation.

**Changement d'appel requis** : `generateLearningContext` doit être appelé avec le texte du post à reformuler, connu seulement au moment du clic sur "Reformuler" dans `ReformulationForm.tsx`. L'appel actuel dans `App.tsx` (avant que l'utilisateur ait tapé son texte) est déplacé vers `ReformulationForm.tsx`.

## Gestion d'erreurs

Réutilisation intégrale des mécanismes déjà en place : bandeau d'erreur dans `LearningBooks.tsx` et `ReformulationForm.tsx`, validation JSON/enum côté serveur avant renvoi de la réponse (même pattern que `/api/reformulate` existant). Aucun nouveau mécanisme d'erreur à construire.

## Tests

Aucun framework de test n'existe dans ce projet. `computeLearningStats` et `findClosestWinningPosts` sont les fonctions les plus à risque d'erreur silencieuse (mauvaises stats/mauvais matching sans crash visible) — elles seront vérifiées manuellement avec des jeux de données réalistes pendant l'implémentation, puis le flux complet sera testé dans le navigateur (ajout de plusieurs posts gagnants variés, vérification que les stats et les exemples injectés dans le prompt correspondent à ce qui est attendu).
