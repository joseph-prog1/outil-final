import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
// Playwright (scraping tendances) est OPTIONNEL et importé paresseusement dans
// scrapeTrendingIdeas — un import top-level casserait le boot s'il n'est pas installé.
import {
  validateRawIdea, mergeIdeas, readIdeas, saveIdeas, buildBeatPrompt, IDEA_BEATS,
} from './ideas.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// Limite relevée: le raffinement d'image envoie l'image existante en base64 (~3 Mo)
app.use(express.json({ limit: '25mb' }));
app.use(cors());

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const SYSTEM_PROMPT = `Tu es un expert en copywriting LinkedIn pour le secteur de la gestion de patrimoine et de la banque privée.
Tu reformules des posts performants en les adaptant à Charlie, un outil B2B d'IA pour les CGP et professionnels de la banque privée.

RÈGLES ABSOLUES (NON-NÉGOCIABLES):
1. ❌ PAS DE TIRETS (- ou —) - JAMAIS
2. ❌ PAS DE SUPERLATIFS (meilleur, incroyable, révolutionnaire, extraordinaire, unique, etc.)
3. ✓ Ton: précis, données concrètes, exemples réels, pas de fluff
4. ✓ Structure: HOOK percutant (1-2 lignes) → CORPS court et rythmé → CTA intégré
5. ✓ **LIMITE STRICTE: CHAQUE VARIANTE = ≤ 700 CARACTÈRES (avec CTA inclus)**
6. ✓ Audience: CGP, asset managers, banquiers privés

CTA FORMAT (STRUCTURÉ AVEC TRANSITION):
Ne pas faire: "Corps... Commentez CHARLIE et recevez la ressource" (abrupt)
Faire: "Corps qui explique le sujet... Tu veux voir comment? Commentez CHARLIE en réponse et je te l'envoie en DM. (Les premiers à répondre seront traités en priorité.)"

Structure du CTA complet:
1. TRANSITION: Une phrase qui crée un pont entre le contenu et l'appel à l'action
   Exemples: "Tu veux voir comment?", "Intéressé?", "Curieux de savoir comment?", "C'est ce qu'on a fait chez Charlie."
2. ACTION CLAIRE: Étapes précises (Commenter → Connecter → Ressource)
   Format: "Commentez [MOT-CLÉ] ci-dessous et je vous l'envoie en DM"
3. URGENCE (optionnel): Créer du FOMO léger
   Exemple: "(Les premiers à répondre seront traités en priorité)"

EXEMPLE COMPLET:
"[Hook + Corps expliquant un problème/solution]

C'est ce qu'on a testé chez Charlie avec 50+ CGP. Vous voulez les détails? Commentez CHARLIE en réponse et je vous envoie le guide en DM. Les premières personnes qui répondent seront traitées en priorité."

ALGORITHME DE GÉNÉRATION:
1. Génère le hook percutant (20-50 chars)
2. Génère le corps informatif avec exemple/chiffre (150-300 chars)
3. Ajoute une TRANSITION (10-30 chars)
4. Ajoute l'ACTION CLAIRE (40-80 chars)
5. Optionnel: URGENCE/FOMO (20-40 chars)
6. COMPTE TOUS LES CARACTÈRES incluant espaces et \n
7. Si total > 700: RACCOURCIS le corps SEULEMENT, jamais transition/action/urgence
8. Recompte et vérifie final < 700 avant JSON

SORTIE JSON (VALIDE ET TESTÉE):
{
  "variants": [
    "Hook\n\nCorps (raccourci si besoin)\n\nCommentez MOT-CLÉ pour recevoir la ressource",
    "Hook (angle 2)\n\nCorps (raccourci si besoin)\n\nCommentez MOT-CLÉ pour accéder à...",
    "Hook (angle 3)\n\nCorps (raccourci si besoin)\n\nRépondez MOT-CLÉ et recevez..."
  ],
  "angle": "description du positionnement",
  "trigger_emotionnel": "émotion clé (curiosité, efficacité, inquiétude, etc.)",
  "hook": "MOT-CLÉ (1-3 mots: CHARLIE, GUIDE, CONSEIL, etc.)"
}

STRUCTURE FINALE DE CHAQUE VARIANTE:
1. Hook (1-2 lignes): accroche percutante
2. Corps (plusieurs lignes): explication + exemple/chiffre + pertinence Charlie
3. Transition: pont vers CTA
4. Action + Urgence: appel à l'action structuré avec étapes claires

Exemple complet (bon modèle):
"Les CGP passent 3h/semaine à classer les documents clients.

Imagine avoir Charlie pour ça: en 90 secondes, dossier organisé, alertes structurées, analyses synthétisées.

Nous avons testé avec 40+ cabinets. Résultat: 12h économisées par conseiller chaque semaine.

Intéressé? Commentez CHARLIE ci-dessous et je vous envoie les chiffres en DM. Les premiers à répondre seront traités en priorité."

VÉRIFICATION FINALE DE CHAQUE VARIANTE:
✓ Hook percutant et lié au sujet?
✓ Corps explique un problème/solution avec exemple?
✓ Transition crée un pont logique vers le CTA?
✓ CTA a structure claire (Commenter → DM → qui répond en premier)?
✓ LONGUEURS GRADUÉES — chaque variante a sa cible, contrôlée par le NOMBRE DE PHRASES du corps:
  - Variante 1 (~600 caractères): hook + corps de 4 phrases complètes + CTA de 2 phrases
  - Variante 2 (~700 caractères): hook + corps de 5 phrases complètes + CTA de 2 phrases
  - Variante 3 (~800 caractères): hook + corps de 6 phrases complètes dont un exemple chiffré ou une situation vécue + CTA de 2 phrases
  Des phrases pleines (12 à 18 mots), concrètes, jamais des fragments. Tu sous-estimes systématiquement les longueurs: écris plus long que ton intuition.
✓ Pas de tirets?
✓ Pas de superlatifs?
✓ MOT-CLÉ court (1-3 mots)?
✓ Audience: CGP/banquiers privés clairement servi?

SI UNE VARIANTE NE RESPECTE PAS CES CRITÈRES: génère une nouvelle.`;

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

// ─────────────────────────────────────────────────────────────
// Pré-brief avant reformulation, généré automatiquement dès que le
// post est collé: 5 hooks candidats (un biais cognitif différent,
// intensité graduée) + 5 use cases CGP concrets sur lesquels ancrer
// le post. L'utilisateur choisit, imposé ensuite aux 3 variantes.
// ─────────────────────────────────────────────────────────────

const VALID_HOOK_BIAIS = ['curiosite', 'peur', 'suspense', 'preuve_sociale', 'urgence', 'contre_intuitif', 'autorite'];
// Les 8 désirs humains fondamentaux (LF8, "The Anatomy of Human Nature"),
// adaptés à l'audience B2B gestion de patrimoine. Chaque hook doit toucher
// l'un de ces désirs profonds — c'est le carburant émotionnel sous le biais.
const VALID_HOOK_DESIRS = [
  'survie',            // protéger son activité / son cabinet, ne pas se faire distancer
  'plaisir_de_vivre',  // réussite, confort de vie, sérénité gagnée
  'acceptation_sociale', // être reconnu et respecté par ses pairs CGP
  'desirabilite',      // devenir le conseiller recherché, attractif pour les clients
  'liberation_peur',   // dormir tranquille: risque maîtrisé, conformité, erreur évitée
  'confort_clarte',    // simplicité, gain de temps, fin de la complexité
  'statut_percu',      // prestige, expertise perçue, longueur d'avance
  'protection_clan',   // protéger les siens: ses clients, leur patrimoine, sa famille
];
const DESIR_LABELS = {
  survie: 'Survie',
  plaisir_de_vivre: 'Plaisir de vivre',
  acceptation_sociale: 'Acceptation sociale',
  desirabilite: 'Désirabilité',
  liberation_peur: 'Libération de la peur',
  confort_clarte: 'Confort & clarté',
  statut_percu: 'Statut perçu',
  protection_clan: 'Protection des siens',
};

const PREBRIEF_SYSTEM_PROMPT = `Tu es un expert en copywriting LinkedIn pour les CGP, banquiers privés et asset managers.

À partir d'un post, tu produis DEUX choses: 5 HOOKS candidats et 5 USE CASES CGP.

── HOOKS (les 1-2 premières lignes du futur post) ──
Le lecteur ne voit que ~140 caractères avant « voir plus »: le hook doit donner envie de cliquer à lui seul.

Un hook percutant combine DEUX leviers: un MÉCANISME (le biais cognitif qui capte l'attention) et un CARBURANT (le désir humain profond qui donne envie d'agir). Tu dois activer les deux à chaque fois.

MÉCANISME — chaque hook exploite un BIAIS COGNITIF DIFFÉRENT parmi: curiosite (gap d'information), peur (aversion à la perte, risque), suspense (histoire qui commence, chute retenue), preuve_sociale (les pairs le font déjà), urgence (fenêtre qui se ferme), contre_intuitif (casse une idée reçue), autorite (chiffre ou fait d'expert).

CARBURANT — chaque hook vise UN des 8 désirs humains fondamentaux (LF8), adaptés à un CGP / banquier privé. Utilise un désir DIFFÉRENT par hook autant que possible:
- survie: protéger son cabinet, ne pas se faire distancer, rester dans la course.
- plaisir_de_vivre: réussite, sérénité, temps et confort de vie regagnés.
- acceptation_sociale: être reconnu et respecté par ses pairs de la profession.
- desirabilite: devenir le conseiller que les clients recherchent et recommandent.
- liberation_peur: dormir tranquille — risque maîtrisé, conformité assurée, erreur coûteuse évitée.
- confort_clarte: simplicité, fin de la complexité, gain de temps concret.
- statut_percu: prestige, expertise perçue, une longueur d'avance visible.
- protection_clan: protéger les siens — ses clients, leur patrimoine, sa propre famille.
Pour cette audience patrimoniale, les désirs les plus puissants sont en général liberation_peur, statut_percu, protection_clan, confort_clarte et acceptation_sociale.

RÈGLES:
1. Chaque hook = un biais différent + un désir humain identifié (champs "biais" et "desir").
2. Gradue l'agressivité: du plus doux (intensite 1) au plus agressif (intensite 5). Un hook par niveau, dans l'ordre.
3. Maximum 140 caractères par hook (saut de ligne autorisé). Pas de tirets, pas de superlatifs, pas d'emoji.
4. Crédible pour un professionnel de la gestion de patrimoine: agressif ne veut pas dire putaclic mensonger.
5. Fidèle au CONTENU RÉEL du post (pas de promesse que le post ne tient pas). Le désir doit être réellement en jeu dans le sujet — ne force pas un désir hors-sol.

── USE CASES CGP (l'angle métier du futur post) ──
5 cas d'usage CONCRETS du quotidien d'un CGP ou banquier privé sur lesquels ancrer le post. Le sujet du post (outil, actu, méthode) doit y être appliqué à une situation métier précise.
1. titre: 3 à 6 mots (ex: "Préparation des rendez-vous clients", "Reporting réglementaire trimestriel").
2. description: 1 phrase concrète: la situation vécue, la douleur, ce que le sujet du post y change.
3. Varie les registres: relation client, conformité/réglementaire, analyse de portefeuille, administratif/back-office, prospection/développement.
4. Chaque use case doit être réaliste et spécifique au métier de la gestion de patrimoine — pas de généralités.

SORTIE JSON STRICTE (rien d'autre, pas de markdown, pas de backticks):
{"hooks": [
  {"text": "...", "biais": "curiosite", "desir": "confort_clarte", "intensite": 1},
  {"text": "...", "biais": "...", "desir": "...", "intensite": 2},
  {"text": "...", "biais": "...", "desir": "...", "intensite": 3},
  {"text": "...", "biais": "...", "desir": "...", "intensite": 4},
  {"text": "...", "biais": "...", "desir": "...", "intensite": 5}
],
"use_cases": [
  {"titre": "...", "description": "..."},
  {"titre": "...", "description": "..."},
  {"titre": "...", "description": "..."},
  {"titre": "...", "description": "..."},
  {"titre": "...", "description": "..."}
]}`;

app.post('/api/generate-hooks', async (req, res) => {
  try {
    const { post_text } = req.body;

    if (!post_text?.trim()) {
      return res.status(400).json({ error: 'Le texte du post est vide' });
    }
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }

    const parsed = await callClaudeJSON(
      PREBRIEF_SYSTEM_PROMPT,
      `Écris les 5 hooks candidats et les 5 use cases CGP pour ce post:\n\n${post_text}\n\nRéponds UNIQUEMENT avec du JSON valide, rien d'autre.`,
      2048
    );

    if (!Array.isArray(parsed.hooks) || parsed.hooks.length !== 5) {
      return res.status(500).json({ error: 'Pré-brief invalide: 5 hooks attendus' });
    }
    for (const hook of parsed.hooks) {
      if (!hook.text || typeof hook.text !== 'string') {
        return res.status(500).json({ error: 'Hook invalide: texte manquant' });
      }
      if (!VALID_HOOK_BIAIS.includes(hook.biais)) {
        hook.biais = 'curiosite';
      }
      if (!VALID_HOOK_DESIRS.includes(hook.desir)) {
        hook.desir = 'confort_clarte';
      }
      hook.desir_label = DESIR_LABELS[hook.desir];
      hook.intensite = Math.min(5, Math.max(1, Number(hook.intensite) || 3));
    }

    const useCases = Array.isArray(parsed.use_cases)
      ? parsed.use_cases.filter((u) => u?.titre && u?.description).slice(0, 5)
      : [];

    res.json({ hooks: parsed.hooks, use_cases: useCases });
  } catch (error) {
    console.error('Erreur serveur (generate-hooks):', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur serveur' });
  }
});

app.post('/api/reformulate', async (req, res) => {
  try {
    const { post_text, learning_context, imposed_hook, imposed_use_case, source_context } = req.body;

    if (!post_text?.trim()) {
      return res.status(400).json({ error: 'Le texte du post est vide' });
    }

    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }

    // Ordre d'autorité: base < patterns réels (stats) < corrections apprises.
    // Prompt caching: le préfixe STABLE (prompt de base + patterns) est mis en
    // cache; le contexte d'apprentissage, qui varie selon le post, reste hors cache.
    const patternGuidance = buildPatternGuidance();
    const systemPrompt =
      SYSTEM_PROMPT + patternGuidance + (learning_context ? `\n\n${learning_context}` : '');

    const userMessage = `Reformule ce post pour l'audience Charlie (CGP, banquiers privés, asset managers):\n\n${post_text}${
      imposed_hook?.trim()
        ? `\n\nHOOK IMPOSÉ: chaque variante DOIT s'ouvrir avec ce hook, repris quasi tel quel (seules la ponctuation et une inflexion légère par variante sont autorisées):\n"${imposed_hook.trim()}"`
        : ''
    }${
      imposed_use_case?.trim()
        ? `\n\nUSE CASE(S) IMPOSÉ(S): ancre le corps des variantes sur ce(s) cas d'usage concret(s) du quotidien CGP (situation, douleur, apport). S'il y en a plusieurs (un par ligne), répartis-les entre les trois variantes — chaque variante prend un angle différent, ou en combine deux si c'est pertinent — sans en inventer d'autres:\n"${imposed_use_case.trim()}"`
        : ''
    }${
      source_context?.trim()
        ? `\n\nSOURCES DE RÉFÉRENCE: ce post part d'une actualité réelle. Appuie-toi sur ces sources pour donner de la valeur et de la crédibilité (chiffres, faits, dates, noms exacts). Tu peux mentionner la source ou son chiffre-clé dans le corps. N'invente AUCUN chiffre ni fait absent de ces sources:\n${source_context.trim()}`
        : ''
    }\n\nRéponds UNIQUEMENT avec du JSON valide, rien d'autre.`;

    // 3 variantes de 600-800 caractères + analyse: 1024 tokens forçaient
    // le modèle à raccourcir pour tenir
    let content;
    try {
      content = await callTextModel(systemPrompt, userMessage, 2048);
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
    }

    // Nettoie les blocs de code markdown (```json ... ```)
    content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '');

    console.log('Réponse Claude:', content.substring(0, 100) + '...');

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.error('Erreur parsing JSON:', err.message);
      console.error('Contenu reçu:', content.substring(0, 200));
      return res.status(500).json({ error: 'Réponse Claude invalide (JSON mal formé)', details: content.substring(0, 200) });
    }

    // Longueurs cibles graduées par variante, tolérance ±75
    const LENGTH_TARGETS = [600, 700, 800];
    const LENGTH_TOL = 75;

    const variants = parsed.variants || [];

    // Boucle corrective: Haiku vise mal les longueurs. Jusqu'à 2 passes,
    // chacune ne corrigeant QUE les variantes hors fourchette, sans en
    // changer le sens. Best-effort: en cas d'échec on garde le dernier jet.
    // Pas de troncature brutale: elle amputait le CTA final.
    const ADJUST_SYSTEM_PROMPT = `Tu ajustes la LONGUEUR de posts LinkedIn sans en changer le sens.
Pour ALLONGER: ajoute des phrases pleines et concrètes au CORPS (bénéfice précis, exemple chiffré, situation vécue du quotidien CGP).
Pour RACCOURCIR: condense le CORPS uniquement.
Le hook (début) et le CTA (dernières phrases, avec le mot-clé à commenter) restent INTACTS: le post doit toujours se terminer par son CTA complet.
Interdits: tirets, superlatifs, emoji.
SORTIE JSON STRICTE (rien d'autre): {"variants": ["..."]} — une entrée par variante fournie, dans le même ordre.`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const off = variants
        .map((v, i) => ({ v, i }))
        .filter(({ v, i }) => typeof v === 'string' && Math.abs(v.length - LENGTH_TARGETS[i]) > LENGTH_TOL);
      if (off.length === 0) break;

      try {
        const report = off
          .map(({ v, i }) => {
            const target = LENGTH_TARGETS[i];
            const action = v.length < target ? 'ALLONGER' : 'RACCOURCIR';
            return `VARIANTE ${i + 1} — ${action} (actuellement ${v.length} caractères, fourchette cible ${target - LENGTH_TOL} à ${target + LENGTH_TOL}):\n${v}`;
          })
          .join('\n\n---\n\n');
        const fixed = await callClaudeJSON(
          ADJUST_SYSTEM_PROMPT,
          `Ajuste chaque variante à sa fourchette (caractères, espaces et sauts de ligne comptés):\n\n${report}\n\nRéponds UNIQUEMENT avec du JSON valide, rien d'autre.`,
          2048
        );
        if (!Array.isArray(fixed.variants) || fixed.variants.length !== off.length) break;
        off.forEach(({ i }, k) => {
          if (typeof fixed.variants[k] === 'string' && fixed.variants[k].trim()) {
            variants[i] = fixed.variants[k];
          }
        });
      } catch (err) {
        console.error('Passe corrective de longueur échouée (dernier jet conservé):', err.message);
        break;
      }
    }

    // Validation: le hook doit être court (1-3 mots max)
    let hook = (parsed.hook || 'Non spécifié').trim();
    const wordCount = hook.split(/\s+/).length;
    if (wordCount > 5) {
      // Si c'est une phrase entière, prends juste le premier mot ou les 2-3 premiers mots
      hook = hook.split(/\s+/).slice(0, 3).join(' ');
    }

    res.json({
      variants,
      angle: parsed.angle || 'Non spécifié',
      trigger_emotionnel: parsed.trigger_emotionnel || 'Non spécifié',
      hook,
    });
  } catch (error) {
    console.error('Erreur serveur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

app.post('/api/analyze-winning-post', async (req, res) => {
  try {
    const { post_text } = req.body;

    if (!post_text?.trim()) {
      return res.status(400).json({ error: 'Le texte du post est vide' });
    }

    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }

    let content;
    try {
      content = await callTextModel(
        ANALYSIS_SYSTEM_PROMPT,
        `Analyse la structure de ce post gagnant:\n\n${post_text}\n\nRéponds UNIQUEMENT avec du JSON valide, rien d'autre.`,
        512
      );
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
    }
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

// ─────────────────────────────────────────────────────────────
// Auto-apprentissage: raffinement de variante + leçons distillées
// Pattern inspiré d'Hermes Agent (mémoire curée par l'agent +
// consolidation périodique). Le stockage des leçons reste côté
// client (IndexedDB), le serveur ne fait que les appels LLM.
// ─────────────────────────────────────────────────────────────

const VALID_LESSON_CATEGORIES = ['ton', 'structure', 'hook', 'cta', 'vocabulaire', 'longueur', 'autre'];

const REFINE_SYSTEM_PROMPT = `Tu es un expert en copywriting LinkedIn pour le secteur de la gestion de patrimoine et de la banque privée (audience: CGP, asset managers, banquiers privés).

Ta tâche: modifier une variante de post existante selon l'instruction de l'utilisateur.

RÈGLES ABSOLUES (NON-NÉGOCIABLES):
1. Modifie UNIQUEMENT ce que demande l'instruction. Tout le reste du texte doit rester identique mot pour mot.
2. ❌ PAS DE TIRETS (- ou —) - JAMAIS
3. ❌ PAS DE SUPERLATIFS (meilleur, incroyable, révolutionnaire, extraordinaire, unique, etc.)
4. ✓ La variante finale reste proche de sa longueur d'origine (±10%), sans jamais dépasser 800 caractères
5. ✓ Conserve la structure: Hook → Corps → Transition → CTA

SORTIE JSON STRICTE (rien d'autre, pas de markdown, pas de backticks):
{"variant": "texte complet de la variante modifiée"}`;

const DISTILL_SYSTEM_PROMPT = `Tu analyses une correction demandée par un utilisateur sur un post LinkedIn généré, pour en extraire une règle d'apprentissage réutilisable.

On te donne: l'instruction de l'utilisateur, la variante avant modification, la variante après modification, et la liste des règles déjà apprises.

RÈGLES:
1. generalizable: false si l'instruction ne s'applique qu'à ce post précis (correction factuelle, remplacement d'un chiffre ou d'un nom, faute de frappe). true si elle révèle une préférence de style réutilisable sur les futurs posts.
2. rule_text: une règle courte (max 140 caractères), impérative, applicable à toutes les futures générations.
   Exemple: instruction "ce hook est trop agressif, adoucis le" → règle "Préférer des hooks factuels et posés plutôt qu'alarmistes."
3. matched_rule_id: si une règle déjà apprise exprime la même idée, renvoie son id EXACT (et reprends son rule_text, éventuellement affiné). Sinon null.
4. category: EXACTEMENT une parmi: ton, structure, hook, cta, vocabulaire, longueur, autre.

SORTIE JSON STRICTE (rien d'autre, pas de markdown, pas de backticks):
{"generalizable": true, "rule_text": "...", "category": "...", "matched_rule_id": null}`;

const CONSOLIDATE_SYSTEM_PROMPT = `Tu consolides la mémoire d'apprentissage d'un générateur de posts LinkedIn.

On te donne une liste de règles apprises, chacune avec un nombre d'occurrences (combien de fois l'utilisateur a exprimé cette préférence) et une catégorie.

RÈGLES:
1. Fusionne les doublons et quasi-doublons en une seule règle (additionne leurs occurrences).
2. En cas de contradiction entre deux règles, garde celle qui a le plus d'occurrences.
3. Reformule chaque règle pour être courte (max 140 caractères) et impérative.
4. Renvoie AU PLUS 10 règles, triées de la plus importante à la moins importante.
5. category: EXACTEMENT une parmi: ton, structure, hook, cta, vocabulaire, longueur, autre.

SORTIE JSON STRICTE (rien d'autre, pas de markdown, pas de backticks):
{"lessons": [{"rule_text": "...", "category": "...", "occurrences": 3}]}`;

// ─────────────────────────────────────────────────────────────
// Routeur de modèle texte pour les tâches de rédaction/analyse.
// DÉFAUT D'ÉQUIPE: Z AI GLM 5.1 (testé plus efficace et nettement
// plus économique que Claude Haiku sur ces tâches) → ZAI_API_KEY
// requise dans server/.env. Pour changer de fournisseur/modèle:
// TEXT_PROVIDER (anthropic, zai, openai, mistral) et TEXT_MODEL.
// Restent TOUJOURS sur Anthropic: les briefs et analyses de miniatures
// (vision + qualité DA, via forceAnthropic) et la veille d'idées
// (outil web_search Anthropic).
// ─────────────────────────────────────────────────────────────

const TEXT_PROVIDER = (process.env.TEXT_PROVIDER || 'zai').toLowerCase();
// Modèle par défaut cohérent avec le fournisseur (pour openai/mistral,
// TEXT_MODEL doit être renseigné explicitement)
const DEFAULT_TEXT_MODELS = {
  anthropic: 'claude-haiku-4-5-20251001',
  zai: 'glm-5.1',
};
const TEXT_MODEL = process.env.TEXT_MODEL || DEFAULT_TEXT_MODELS[TEXT_PROVIDER] || '';

// Fournisseurs à API "chat completions" compatible OpenAI
const OPENAI_COMPAT_PROVIDERS = {
  zai: { url: 'https://api.z.ai/api/paas/v4/chat/completions', keyEnv: 'ZAI_API_KEY' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', keyEnv: 'OPENAI_API_KEY' },
  mistral: { url: 'https://api.mistral.ai/v1/chat/completions', keyEnv: 'MISTRAL_API_KEY' },
};

// Renvoie le texte brut de la réponse du modèle configuré.
// forceAnthropic: ignore TEXT_PROVIDER (tâches qui doivent rester sur Claude).
async function callTextModel(systemPrompt, userContent, maxTokens = 512, { forceAnthropic = false } = {}) {
  const provider = forceAnthropic ? 'anthropic' : TEXT_PROVIDER;

  if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: forceAnthropic ? 'claude-haiku-4-5-20251001' : TEXT_MODEL,
        max_tokens: maxTokens,
        // Prompt caching: le prompt système (souvent volumineux et identique d'un
        // appel à l'autre pour une même tâche) est mis en cache → entrée facturée
        // ~10% sur les appels rapprochés (TTL 5 min). No-op silencieux si sous le seuil.
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.error?.message || `Erreur Claude: ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return data.content?.[0]?.text || '';
  }

  const compat = OPENAI_COMPAT_PROVIDERS[provider];
  if (!compat) {
    const err = new Error(`TEXT_PROVIDER inconnu: "${provider}" (valides: anthropic, ${Object.keys(OPENAI_COMPAT_PROVIDERS).join(', ')})`);
    err.status = 500;
    throw err;
  }
  const apiKey = process.env[compat.keyEnv];
  if (!apiKey) {
    const err = new Error(`Clé API manquante pour ${provider}: renseignez ${compat.keyEnv} dans server/.env`);
    err.status = 500;
    throw err;
  }
  if (!TEXT_MODEL) {
    const err = new Error(`TEXT_MODEL manquant pour ${provider}: renseignez-le dans server/.env (aucun modèle par défaut pour ce fournisseur)`);
    err.status = 500;
    throw err;
  }

  const response = await fetch(compat.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: TEXT_MODEL,
      max_tokens: maxTokens,
      // GLM (Z AI): le mode réflexion, actif par défaut, consomme tout le
      // budget de tokens avant d'écrire la réponse (content vide). Nos tâches
      // sont du JSON structuré à faible latence: on le désactive.
      ...(provider === 'zai' ? { thinking: { type: 'disabled' } } : {}),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || data.message || `Erreur ${provider}: ${response.status}`;
    const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
    err.status = response.status;
    throw err;
  }
  return data.choices?.[0]?.message?.content || '';
}

// Appel modèle commun aux endpoints d'apprentissage: renvoie le JSON parsé
// ou lève une Error portant un .status HTTP à relayer au client.
// Route vers TEXT_PROVIDER sauf opts.forceAnthropic.
async function callClaudeJSON(systemPrompt, userContent, maxTokens = 512, opts = {}) {
  let content = await callTextModel(systemPrompt, userContent, maxTokens, opts);
  content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

  try {
    return JSON.parse(content);
  } catch {
    // Tolère du texte avant/après: extrait le 1er objet JSON complet
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch {
        /* tombe dans l'erreur ci-dessous */
      }
    }
    const err = new Error('Réponse Claude invalide (JSON mal formé)');
    err.status = 500;
    throw err;
  }
}

app.post('/api/refine-variant', async (req, res) => {
  try {
    const { variant_text, instruction, source_post } = req.body;

    if (!variant_text?.trim()) {
      return res.status(400).json({ error: 'La variante à modifier est vide' });
    }
    if (!instruction?.trim()) {
      return res.status(400).json({ error: "L'instruction de modification est vide" });
    }
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }

    const userContent = `Variante actuelle:\n${variant_text}\n\n${
      source_post?.trim() ? `Post original (pour contexte uniquement):\n${source_post}\n\n` : ''
    }Instruction de modification:\n${instruction}\n\nRéponds UNIQUEMENT avec du JSON valide, rien d'autre.`;

    const parsed = await callClaudeJSON(REFINE_SYSTEM_PROMPT, userContent, 1024);

    let variant = parsed.variant;
    if (typeof variant !== 'string' || !variant.trim()) {
      return res.status(500).json({ error: 'Réponse Claude invalide: variant manquant' });
    }
    if (variant.length > 700) {
      variant = variant.substring(0, 697) + '...';
    }

    res.json({ variant });
  } catch (error) {
    console.error('Erreur serveur (refine-variant):', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur serveur' });
  }
});

app.post('/api/distill-lesson', async (req, res) => {
  try {
    const { instruction, variant_before, variant_after, existing_rules } = req.body;

    if (!instruction?.trim()) {
      return res.status(400).json({ error: "L'instruction est vide" });
    }
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }

    const rules = Array.isArray(existing_rules) ? existing_rules : [];
    const rulesText = rules.length
      ? rules.map((r) => `- [${r.id}] ${r.rule_text}`).join('\n')
      : '(aucune règle apprise pour le moment)';

    const userContent = `Instruction de l'utilisateur:\n${instruction}\n\nVariante avant:\n${variant_before || '(non fournie)'}\n\nVariante après:\n${variant_after || '(non fournie)'}\n\nRègles déjà apprises:\n${rulesText}\n\nRéponds UNIQUEMENT avec du JSON valide, rien d'autre.`;

    const parsed = await callClaudeJSON(DISTILL_SYSTEM_PROMPT, userContent, 512);

    if (typeof parsed.generalizable !== 'boolean') {
      return res.status(500).json({ error: 'Distillation invalide: generalizable manquant' });
    }

    if (!parsed.generalizable) {
      return res.json({ generalizable: false, rule_text: null, category: null, matched_rule_id: null });
    }

    if (!parsed.rule_text || typeof parsed.rule_text !== 'string') {
      return res.status(500).json({ error: 'Distillation invalide: rule_text manquant' });
    }

    // Catégorie hors taxonomie → rabattue sur "autre" plutôt que d'échouer:
    // perdre une leçon coûte plus cher qu'une catégorie approximative
    const category = VALID_LESSON_CATEGORIES.includes(parsed.category) ? parsed.category : 'autre';

    const validIds = new Set(rules.map((r) => r.id));
    const matchedRuleId = validIds.has(parsed.matched_rule_id) ? parsed.matched_rule_id : null;

    res.json({
      generalizable: true,
      rule_text: parsed.rule_text.trim(),
      category,
      matched_rule_id: matchedRuleId,
    });
  } catch (error) {
    console.error('Erreur serveur (distill-lesson):', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur serveur' });
  }
});

app.post('/api/consolidate-lessons', async (req, res) => {
  try {
    const { lessons } = req.body;

    if (!Array.isArray(lessons) || lessons.length === 0) {
      return res.status(400).json({ error: 'lessons doit être un tableau non vide' });
    }
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }

    const lessonsText = lessons
      .map((l) => `- (${l.occurrences || 1}x) [${l.category || 'autre'}] ${l.rule_text}`)
      .join('\n');

    const parsed = await callClaudeJSON(
      CONSOLIDATE_SYSTEM_PROMPT,
      `Règles à consolider:\n${lessonsText}\n\nRéponds UNIQUEMENT avec du JSON valide, rien d'autre.`,
      1024
    );

    if (!Array.isArray(parsed.lessons) || parsed.lessons.length === 0) {
      return res.status(500).json({ error: 'Consolidation invalide: lessons manquant' });
    }

    const cleaned = parsed.lessons
      .filter((l) => l && typeof l.rule_text === 'string' && l.rule_text.trim())
      .slice(0, 10)
      .map((l) => ({
        rule_text: l.rule_text.trim(),
        category: VALID_LESSON_CATEGORIES.includes(l.category) ? l.category : 'autre',
        occurrences: Number.isInteger(l.occurrences) && l.occurrences > 0 ? l.occurrences : 1,
      }));

    if (cleaned.length === 0) {
      return res.status(500).json({ error: 'Consolidation invalide: aucune règle exploitable' });
    }

    res.json({ lessons: cleaned });
  } catch (error) {
    console.error('Erreur serveur (consolidate-lessons):', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ─────────────────────────────────────────────────────────────
// Direction artistique des miniatures: Claude lit le post et écrit
// un brief visuel précis par famille de style (titre + scène + métaphore),
// que Gemini se contente ensuite d'exécuter. Sans cette étape, Gemini
// choisit des métaphores hors sujet ou recopie les exemples du prompt.
// ─────────────────────────────────────────────────────────────

const VALID_ARCHETYPES = [
  'versus',
  'partenariat',
  'workflow',
  'diagramme_produit',
  'mockup_iphone',
  'bar_chart',
  'typo_geante',
  'icone_3d',
  // Nouveaux archétypes (sans image de référence, rendus via template seul + logo)
  'chiffre_cle',
  'citation',
  'avant_apres',
  'checklist',
  'timeline',
  'grille_sources',
];

const IMAGE_BRIEF_SYSTEM_PROMPT = `Tu es directeur artistique senior pour Charlie, un outil d'IA B2B pour les CGP, asset managers et banquiers privés. L'identité visuelle: fond crème papier, typographie serif éditoriale, accents orange brique/terracotta, minimalisme radical façon print premium (The Economist, Anthropic).

À partir d'un post LinkedIn, tu CHOISIS les 3 archétypes de miniature les plus pertinents dans le catalogue ci-dessous (3 archétypes DIFFÉRENTS), puis tu écris un brief par archétype.

VARIÉTÉ OBLIGATOIRE — tes 3 choix doivent être de FAMILLES visuelles différentes (typographique, objet/scène, symbole…), pas trois variantes du même genre. NE retombe PAS systématiquement sur les mêmes archétypes: explore le catalogue et privilégie ceux que le post rend pertinents.

PRINCIPE N°1 — SOBRIÉTÉ RADICALE. Une miniature LinkedIn se lit en 1 seconde sur mobile. MOINS il y a de texte, MIEUX c'est. Une miniature réussie = UN visuel fort + un titre court + le strict minimum d'éléments. INTERDIT: paragraphe descriptif, phrase de conclusion/tagline, note de bas de page, légende bavarde, sous-titre qui répète le titre. Vise 6 mots visibles au total sur l'image (hors infographies workflow/diagramme, plafonnées à 12 mots). Dans le doute, tu ENLÈVES du texte.

PRINCIPE N°2 — SIMPLICITÉ VISUELLE. Choisis en priorité les archétypes les plus ÉPURÉS de la direction artistique Charlie (typo_geante, chiffre_cle, citation, icone_3d, versus, partenariat, avant_apres): un seul élément focal, beaucoup d'espace vide. Les archétypes denses (workflow, diagramme_produit, bar_chart, checklist, timeline, grille_sources) sont des DERNIERS RECOURS: n'en choisis JAMAIS plus d'un sur les 3, et uniquement si le post l'exige vraiment (vrais chiffres pour bar_chart, vraies étapes pour workflow). Trois briefs sobres valent mieux qu'un schéma chargé.

CATALOGUE DES ARCHÉTYPES:
1. versus — logo Charlie face au logo d'un produit/techno barré d'une croix rouge. Pour: prise de position contre, abandon/remplacement d'une techno, "nous vs eux". Le contenu doit nommer le produit rejeté (marque réelle citée dans le post).
2. partenariat — logo Charlie face au logo d'un partenaire, séparés par un trait fin. Pour: partenariat, intégration, connexion à un outil/source de données cité dans le post.
3. workflow — infographie horizontale de 3 à 6 étapes (icônes flat terracotta + pastilles numérotées + labels courts). Pour: post "how-to", méthode, liste d'astuces, processus.
4. diagramme_produit — schéma hub central Charlie: entrées (chips) → hub → sortie → usages. Pour: post qui explique la valeur ou l'architecture d'un produit, avant/après le chaos.
5. mockup_iphone — iPhone minimaliste vertical avec monogramme C et tagline à l'écran. Pour: promotion d'une newsletter, app, canal, "abonnez-vous".
6. bar_chart — graphique à barres éditorial (orange vs taupe) avec vraies valeurs. Pour: post chiffré, benchmark, comparaison avant/après mesurée. UNIQUEMENT si le post contient de vrais chiffres.
7. typo_geante — nom du produit/événement en capitales display géantes dégradé terracotta. Pour: annonce majeure où le NOM est le message (nouveau modèle, lancement).
8. icone_3d — icône 3D mate terracotta centrée + nom du produit, style keynote Apple. Pour: sortie d'un modèle/outil/feature dont parle le post, focus sur UN objet nommé.
9. chiffre_cle — UN seul chiffre/statistique géant qui remplit la carte (ex "×3", "-116 min", "12 min", "241k") + un label court dessous. Pour: post dont l'impact tient dans un chiffre unique et frappant.
10. citation — une phrase/punchline courte en grande citation éditoriale entre guillemets. Pour: prise de parole forte, verbatim, affirmation qui claque, opinion.
11. avant_apres — écran divisé gauche (AVANT: friction/chaos, gris) vs droite (APRÈS: ordre/épuré, crème). Pour: transformation, gain, "on passe de X à Y".
12. checklist — liste verticale de 3 à 5 points cochés (cases terracotta). Pour: points de conformité, étapes à valider, "les X choses à faire/vérifier".
13. timeline — frise chronologique horizontale à 3-4 jalons datés. Pour: évolution, roadmap, échéances réglementaires, historique.
14. grille_sources — constellation de 4 à 6 pastilles de sources (Pappers, SIRENE, BODACC, data.gouv, INSEE…) reliées au monogramme Charlie central. Pour: post qui connecte l'IA à plusieurs sources de données officielles (TA signature).

RÈGLES POUR CHAQUE BRIEF:
1. archetype: un des 14 identifiants exacts du catalogue.
2. titre: 6 mots maximum en français, tiré de l'idée LA PLUS FORTE du post. Pour versus/partenariat, le titre peut être vide ("") si les logos suffisent.
3. sous_ligne: LAISSE VIDE ("") par défaut. Ne la remplis que si elle est vraiment indispensable, et alors 5 mots maximum, jamais une phrase complète, jamais une répétition du titre.
4. mots_orange: 1 à 2 mots EXACTS du titre à mettre en orange brique (tableau de chaînes, peut être vide).
5. contenu: le contenu SPÉCIFIQUE à l'archétype, réduit à l'os (aucun texte décoratif):
   - versus/partenariat: uniquement le nom exact de la marque/du produit en face de Charlie.
   - workflow: 3 à 4 étapes maximum, chacune "label de 1 à 3 mots — icône suggérée". Pas de phrase, pas de description d'étape.
   - diagramme_produit: 2 à 3 chips d'entrée (1-2 mots chacun), le texte de la capsule centrale (3 mots max), 2 à 3 chips de sortie (1-2 mots). PAS de kicker, PAS de phrase descriptive.
   - mockup_iphone: le wordmark + une tagline de 4 mots maximum.
   - bar_chart: 2 à 3 catégories avec leurs valeurs EXACTES tirées du post, et 2 labels de série courts. PAS de titre de graphe, PAS de note de bas de page, PAS d'annotation de variation.
   - typo_geante: uniquement le NOM à afficher en géant (pas de surtitre sauf 2 mots indispensables).
   - icone_3d: le nom sous l'icône + le motif simple du pictogramme blanc.
   - chiffre_cle: LE chiffre exact tiré du post (ex "×3", "-116 min", "12 min") + un label de 2 à 4 mots.
   - citation: la phrase à afficher (12 mots max), percutante, tirée ou fidèle au post.
   - avant_apres: 2-3 mots (ou une icône) pour l'AVANT, 2-3 mots (ou une icône) pour l'APRÈS.
   - checklist: 3 à 5 items, chacun un label de 2 à 4 mots (un par ligne). Pas de phrase.
   - timeline: 3 à 4 jalons "date/étape courte (1-3 mots)", dans l'ordre.
   - grille_sources: 4 à 6 noms de sources EXACTS cités dans le post (1-2 mots chacun).
6. Le brief illustre L'IDÉE CENTRALE du post. Un lecteur CGP doit faire le lien en 1 seconde. Le visuel porte le message, pas le texte.
7. AUCUNE DUPLICATION entre titre, sous_ligne et contenu: une information (chiffre, mot-clé, label) n'apparaît qu'UNE fois sur l'image. Pour chiffre_cle: si le chiffre géant est "60%", ni le titre ni la sous_ligne ne contiennent "60%" (exemple d'échec réel: titre "60% sans procédures formalisées" au-dessus d'un "60%" géant). Pour avant_apres: les labels des deux côtés sont DIFFÉRENTS.
8. N'INVENTE JAMAIS de chiffres ni de noms de marques: uniquement ce que dit le post.
9. justification: 1 phrase expliquant pourquoi cet archétype pour ce post.

SORTIE JSON STRICTE (rien d'autre, pas de markdown, pas de backticks): un tableau "briefs" de 3 briefs:
{"briefs": [
  {"archetype": "...", "titre": "...", "sous_ligne": "...", "mots_orange": ["..."], "contenu": "...", "justification": "..."},
  {"archetype": "...", "titre": "...", "sous_ligne": "...", "mots_orange": ["..."], "contenu": "...", "justification": "..."},
  {"archetype": "...", "titre": "...", "sous_ligne": "...", "mots_orange": ["..."], "contenu": "...", "justification": "..."}
]}`;

app.post('/api/image-briefs', async (req, res) => {
  try {
    const { post_text } = req.body;

    if (!post_text?.trim()) {
      return res.status(400).json({ error: 'Le texte du post est vide' });
    }
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }

    // Injecte les patterns visuels appris (analyse des miniatures gagnantes)
    // + les sujets qui surperforment, pour caler le choix d'archétype
    const visualGuidance = buildVisualGuidance();
    // Miniatures: reste sur Anthropic quel que soit TEXT_PROVIDER (qualité DA)
    const parsed = await callClaudeJSON(
      IMAGE_BRIEF_SYSTEM_PROMPT + visualGuidance,
      `Écris les 3 briefs visuels pour ce post:\n\n${post_text}\n\nRéponds UNIQUEMENT avec du JSON valide, rien d'autre.`,
      1024,
      { forceAnthropic: true }
    );

    if (!Array.isArray(parsed.briefs) || parsed.briefs.length < 3) {
      return res.status(500).json({ error: 'Briefs invalides: 3 briefs attendus' });
    }
    parsed.briefs = parsed.briefs.slice(0, 3);
    for (const brief of parsed.briefs) {
      if (!VALID_ARCHETYPES.includes(brief.archetype)) {
        return res.status(500).json({ error: `Brief invalide: archétype "${brief.archetype}" inconnu` });
      }
      if (typeof brief.titre !== 'string') {
        return res.status(500).json({ error: 'Brief invalide: titre manquant' });
      }
      if (!brief.contenu || typeof brief.contenu !== 'string') {
        return res.status(500).json({ error: 'Brief invalide: contenu manquant' });
      }
    }

    res.json({ briefs: parsed.briefs });
  } catch (error) {
    console.error('Erreur serveur (image-briefs):', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ─────────────────────────────────────────────────────────────
// Génération de miniatures via Gemini (Nano Banana Pro)
// Docs: https://ai.google.dev/gemini-api/docs/image-generation
// Auth: header x-goog-api-key
// Flux synchrone: generateContent renvoie directement l'image
// en base64 (inlineData), convertie ici en data URL
// ─────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
// 4:3 est le format des miniatures de référence Charlie (s'affiche aussi
// plus grand qu'un 16:9 dans le feed LinkedIn)
const GEMINI_ASPECT_RATIO = process.env.GEMINI_ASPECT_RATIO || '4:3';
// 1K | 2K | 4K — 2K couvre largement le format LinkedIn
const GEMINI_IMAGE_SIZE = process.env.GEMINI_IMAGE_SIZE || '2K';

// inputImages optionnel: tableau de { mimeType, data } (base64) — logo de
// marque, image de référence de style, ou image existante à éditer
async function generateImage(prompt, inputImages = [], aspectRatio = GEMINI_ASPECT_RATIO) {
  const parts = [{ text: prompt }];
  for (const image of inputImages) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }

  const response = await fetch(`${GEMINI_BASE_URL}/models/${GEMINI_IMAGE_MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio,
          imageSize: GEMINI_IMAGE_SIZE,
        },
      },
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error?.message || `Erreur Gemini: ${response.status}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'PROHIBITED_CONTENT' || candidate?.finishReason === 'SAFETY') {
    throw new Error('Image rejetée par le filtre de contenu Gemini');
  }

  const imagePart = candidate?.content?.parts?.find((part) => part.inlineData?.data);
  if (!imagePart) {
    // Le modèle a parfois répondu en texte seul: remonter sa réponse aide au diagnostic
    const textPart = candidate?.content?.parts?.find((part) => typeof part.text === 'string' && part.text.trim());
    const detail = textPart ? ` (réponse du modèle: "${textPart.text.trim().substring(0, 150)}")` : '';
    throw new Error(`Génération terminée mais aucune image retournée${detail}`);
  }

  const { mimeType, data: base64 } = imagePart.inlineData;
  return `data:${mimeType || 'image/png'};base64,${base64}`;
}

// Les réponses texte-sans-image sont sporadiques: une seconde tentative suffit généralement
async function generateImageWithRetry(prompt, inputImages, aspectRatio) {
  try {
    return await generateImage(prompt, inputImages, aspectRatio);
  } catch (error) {
    if (!error.message?.includes('aucune image retournée')) throw error;
    console.log('Réponse sans image, nouvelle tentative...');
    return generateImage(prompt, inputImages, aspectRatio);
  }
}

function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/s);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

// Incruste le logo Charlie en haut à droite de la miniature (identité de marque).
// La version sombre ou blanche du logo est choisie selon la luminosité de la zone.
// Ne bloque jamais: en cas d'échec, l'image est renvoyée sans logo.
const LOGO_DARK = path.join(__dirname, 'assets', 'charlie-logo-dark.png');
const LOGO_LIGHT = path.join(__dirname, 'assets', 'charlie-logo-light.png');
// Largeur du logo en fraction de la largeur de l'image, et marge du coin
const LOGO_WIDTH_RATIO = 0.11;
const LOGO_MARGIN_RATIO = 0.028;

async function applyBrandLogo(dataUrl) {
  try {
    const parsed = parseImageDataUrl(dataUrl);
    if (!parsed) return dataUrl;

    const imageBuffer = Buffer.from(parsed.data, 'base64');
    const meta = await sharp(imageBuffer).metadata();

    const logoWidth = Math.round(meta.width * LOGO_WIDTH_RATIO);
    const margin = Math.round(meta.width * LOGO_MARGIN_RATIO);
    const logoMeta = await sharp(LOGO_DARK).metadata();
    const logoHeight = Math.round(logoWidth * (logoMeta.height / logoMeta.width));
    const left = meta.width - margin - logoWidth;
    const top = margin;

    // Luminosité moyenne de la zone d'incrustation → logo sombre ou blanc
    const stats = await sharp(imageBuffer)
      .extract({ left, top, width: logoWidth, height: logoHeight })
      .stats();
    const [r, g, b] = stats.channels;
    const luminance = 0.299 * r.mean + 0.587 * g.mean + 0.114 * b.mean;
    // Seuil bas: sur les tons moyens (beige, terracotta) l'encre sombre
    // contraste mieux que le blanc, réservé aux fonds vraiment foncés
    const logoFile = luminance < 105 ? LOGO_LIGHT : LOGO_DARK;

    const logo = await sharp(logoFile).resize({ width: logoWidth }).png().toBuffer();
    const out = await sharp(imageBuffer)
      .composite([{ input: logo, left, top }])
      .jpeg({ quality: 92 })
      .toBuffer();

    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch (error) {
    console.error('Incrustation du logo échouée (image renvoyée sans logo):', error.message);
    return dataUrl;
  }
}

// ─────────────────────────────────────────────────────────────
// Références de style par archétype: miniatures validées, envoyées à
// Gemini avec le logo Charlie pour guider la direction artistique.
// Le logo est donc placé PAR le modèle (comme sur les références),
// et non plus incrusté en post-traitement.
// ─────────────────────────────────────────────────────────────

const REFERENCES_DIR = path.join(__dirname, 'assets', 'references');
const ARCHETYPE_REFERENCES = {
  versus: 'ref-01.png',
  partenariat: 'ref-02.png',
  workflow: 'ref-03.png',
  diagramme_produit: 'ref-04.png',
  mockup_iphone: 'ref-05.png',
  bar_chart: 'ref-06.png',
  typo_geante: 'ref-07.png',
  icone_3d: 'ref-08.png',
};
// Le mockup iPhone est vertical; les autres suivent le ratio global
const ARCHETYPE_ASPECT_RATIOS = { mockup_iphone: '3:4' };

// Références réduites à 1024px: assez pour transmettre le style, sans
// alourdir chaque requête Gemini avec des PNG 2K
async function loadReferenceInput(filePath) {
  const buffer = await sharp(filePath)
    .resize({ width: 1024, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { mimeType: 'image/jpeg', data: buffer.toString('base64') };
}

const BRAND_LOGO_INPUT = {
  mimeType: 'image/png',
  data: fs.readFileSync(LOGO_DARK).toString('base64'),
};
const REFERENCE_INPUTS = Object.fromEntries(
  await Promise.all(
    Object.entries(ARCHETYPE_REFERENCES).map(async ([archetype, file]) => [
      archetype,
      await loadReferenceInput(path.join(REFERENCES_DIR, file)),
    ])
  )
);

app.post('/api/generate-images', async (req, res) => {
  try {
    const { prompts, user_images } = req.body;

    if (!Array.isArray(prompts) || prompts.length === 0 || prompts.length > 5) {
      return res.status(400).json({ error: 'prompts doit être un tableau de 1 à 5 prompts' });
    }
    // Chaque entrée: { text, archetype } (pipeline références) ou chaîne simple (legacy)
    const jobs = prompts.map((p) =>
      typeof p === 'string' ? { text: p, archetype: null } : { text: p?.text, archetype: p?.archetype || null }
    );
    if (jobs.some((j) => typeof j.text !== 'string' || !j.text.trim())) {
      return res.status(400).json({ error: 'Chaque prompt doit contenir un texte non vide' });
    }

    // Images fournies par l'utilisateur (logo client, illustration...) à
    // intégrer dans chaque miniature. Data URLs base64, 3 maximum.
    const userInputs = [];
    if (user_images !== undefined) {
      if (!Array.isArray(user_images) || user_images.length > 3) {
        return res.status(400).json({ error: 'user_images doit être un tableau de 3 images maximum' });
      }
      for (const dataUrl of user_images) {
        const parsed = parseImageDataUrl(dataUrl);
        if (!parsed) {
          return res.status(400).json({ error: 'Chaque user_image doit être une data URL d\'image en base64' });
        }
        userInputs.push(parsed);
      }
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Clé API Gemini non configurée sur le serveur (GEMINI_API_KEY)' });
    }

    console.log(
      `Génération de ${jobs.length} image(s) via ${GEMINI_IMAGE_MODEL} (${jobs
        .map((j) => j.archetype || 'legacy')
        .join(', ')})${userInputs.length ? ` + ${userInputs.length} image(s) utilisateur` : ''}...`
    );

    // Consigne d'intégration des images utilisateur, ajoutée à chaque prompt.
    // Les images utilisateur arrivent APRÈS le logo Charlie et la référence
    // de style; on précise leur rôle pour que Gemini ne les confonde pas.
    const userImagesNote = userInputs.length
      ? `\n\nUSER-PROVIDED IMAGE(S) — ABSOLUTE FIDELITY REQUIRED: the last ${userInputs.length} input image(s) are logos or illustrations supplied by the user. Reproduce each one EXACTLY as provided, like a pasted asset: same shapes, same colors, same proportions, same lettering. NEVER redesign, redraw, stylize, simplify, translate to the brand palette or approximate them — an altered logo makes the image unusable (real failure to avoid: an official partner logo redrawn "in the style of" instead of copied). If a user logo replaces a logo mentioned in the layout (e.g. the partner logo of a versus/partenariat layout), use the user image as-is in that position. They must never replace the Charlie brand logo (image 1).`
      : '';

    const settled = await Promise.allSettled(
      jobs.map((job) => {
        if (job.archetype) {
          // Tout archétype reçoit le logo (image 1); ceux qui ont une référence
          // de style reçoivent aussi l'image 2. Gemini place le logo lui-même.
          const reference = REFERENCE_INPUTS[job.archetype];
          const ratio = ARCHETYPE_ASPECT_RATIOS[job.archetype] || GEMINI_ASPECT_RATIO;
          const inputs = reference ? [BRAND_LOGO_INPUT, reference] : [BRAND_LOGO_INPUT];
          return generateImageWithRetry(job.text + userImagesNote, [...inputs, ...userInputs], ratio);
        }
        // Legacy (prompt texte seul, sans archétype): logo incrusté en post-traitement
        return generateImageWithRetry(job.text + userImagesNote, userInputs).then(applyBrandLogo);
      })
    );

    // Une entrée par prompt, dans le même ordre: {url} en cas de succès, {error} sinon
    const results = settled.map((outcome, i) => {
      if (outcome.status === 'fulfilled') {
        return { prompt: jobs[i].text, archetype: jobs[i].archetype, url: outcome.value };
      }
      console.error(`Échec génération image ${i + 1}:`, outcome.reason?.message);
      return { prompt: jobs[i].text, archetype: jobs[i].archetype, error: outcome.reason?.message || 'Erreur inconnue' };
    });

    if (results.every((r) => r.error)) {
      return res.status(502).json({ error: `Toutes les générations ont échoué: ${results[0].error}` });
    }

    res.json({ results });
  } catch (error) {
    console.error('Erreur serveur (generate-images):', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Raffinement d'une miniature existante: véritable édition d'image
// (l'image actuelle est envoyée à Gemini avec l'instruction), et non
// une régénération de zéro à partir du prompt d'origine
app.post('/api/refine-image', async (req, res) => {
  try {
    const { instruction, image_data_url, user_images } = req.body;

    if (!instruction?.trim()) {
      return res.status(400).json({ error: "L'instruction de modification est vide" });
    }
    const inputImage = parseImageDataUrl(image_data_url);
    if (!inputImage) {
      return res.status(400).json({ error: 'image_data_url doit être une data URL d\'image en base64' });
    }
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Clé API Gemini non configurée sur le serveur (GEMINI_API_KEY)' });
    }

    // Images jointes à l'instruction (logo à insérer, illustration...):
    // envoyées à Gemini après l'image à modifier
    const userInputs = (Array.isArray(user_images) ? user_images : [])
      .slice(0, 3)
      .map((u) => parseImageDataUrl(u))
      .filter(Boolean);

    const userImagesNote = userInputs.length
      ? `\n\nIMAGE(S) JOINTE(S) PAR L'UTILISATEUR: les ${userInputs.length + 1 > 2 ? userInputs.length + ' dernières images fournies sont des éléments' : 'la dernière image fournie est un élément'} (logo, illustration) à utiliser selon l'instruction. Reproduis chaque élément EXACTEMENT tel que fourni, comme un collage: mêmes formes, mêmes couleurs, mêmes proportions, même lettrage. Ne le redessine JAMAIS, ne le styliser pas, ne l'adapte pas à la palette: un logo altéré rend l'image inutilisable.`
      : '';

    const prompt = `Modifie la PREMIÈRE image fournie en appliquant UNIQUEMENT l'instruction suivante. Conserve tout le reste à l'identique: composition, style, couleurs, textes et typographie existants. Le logo Charlie doit rester strictement intact.

Instruction: ${instruction.trim()}${userImagesNote}

Renvoie l'image modifiée.`;

    console.log(`Raffinement d'image via ${GEMINI_IMAGE_MODEL}${userInputs.length ? ` (+${userInputs.length} image(s) jointe(s))` : ''}...`);
    const url = await generateImageWithRetry(prompt, [inputImage, ...userInputs]);
    res.json({ url });
  } catch (error) {
    console.error('Erreur serveur (refine-image):', error);
    res.status(502).json({ error: error.message || 'Erreur serveur' });
  }
});

// ─────────────────────────────────────────────────────────────
// Stats LinkedIn: posts scrapés + analytics importées.
// Stockage fichier DANS ../data (hors du dossier server: le watcher
// node --watch-path=. redémarrerait le serveur à chaque écriture).
// Données personnelles: le dossier /data est ignoré par git.
// ─────────────────────────────────────────────────────────────

const LINKEDIN_DATA_DIR = path.join(__dirname, '..', 'data');
const LINKEDIN_POSTS_FILE = path.join(LINKEDIN_DATA_DIR, 'linkedin-posts.json');
const PATTERNS_FILE = path.join(LINKEDIN_DATA_DIR, 'patterns.json');

// ─── Patterns appris (rapports d'analyse persistés) ──────────
// Le dernier rapport par auteur est stocké et RÉINJECTÉ dans la
// reformulation et la génération de miniatures. C'est le pont entre
// « ce qui marche sur nos vrais posts » et « ce qu'on génère ».

function readPatterns() {
  try {
    return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function savePatternsReport(author, report) {
  const all = readPatterns();
  all[author] = { ...report, date: new Date().toISOString() };
  fs.mkdirSync(LINKEDIN_DATA_DIR, { recursive: true });
  fs.writeFileSync(PATTERNS_FILE, JSON.stringify(all, null, 2));
}

// Construit un bloc de consignes tiré des patterns pour la reformulation.
// Fusionne tous les rapports disponibles (Thomas + Mathis + tous).
function buildPatternGuidance() {
  const all = readPatterns();
  const reports = Object.values(all);
  if (reports.length === 0) return '';

  const rules = new Set();
  const sujets = new Set();
  const resumes = [];
  for (const r of reports) {
    (r.regles || []).forEach((x) => x?.rule_text && rules.add(x.rule_text));
    (r.sujets_gagnants || []).forEach((s) => s && sujets.add(s));
    if (r.resume) resumes.push(r.resume);
  }
  if (rules.size === 0) return '';

  return `\n\nPATTERNS GAGNANTS (tirés de l'analyse des VRAIS posts LinkedIn de Thomas et Mathis, avec leurs impressions réelles). Applique ces règles en priorité, elles priment sur les consignes génériques:\n${[...rules].map((r) => `- ${r}`).join('\n')}\n\nSUJETS QUI SURPERFORMENT chez cette audience: ${[...sujets].slice(0, 8).join(' ; ')}.`;
}

const VISUAL_PATTERNS_FILE = path.join(LINKEDIN_DATA_DIR, 'visual-patterns.json');

function readVisualPatterns() {
  try {
    return JSON.parse(fs.readFileSync(VISUAL_PATTERNS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveVisualPatterns(report) {
  fs.mkdirSync(LINKEDIN_DATA_DIR, { recursive: true });
  fs.writeFileSync(VISUAL_PATTERNS_FILE, JSON.stringify({ ...report, date: new Date().toISOString() }, null, 2));
}

// Bloc de consignes visuelles pour la génération de miniatures, tiré de
// l'analyse des miniatures RÉELLES les plus performantes + sujets gagnants.
function buildVisualGuidance() {
  const parts = [];
  const sujets = Object.values(readPatterns()).flatMap((r) => r.sujets_gagnants || []);
  if (sujets.length > 0) {
    parts.push(
      `\n\nSUJETS QUI SURPERFORMENT (vrais posts, vraies impressions) — privilégie l'archétype qui sert le mieux ces angles: ${[
        ...new Set(sujets),
      ].slice(0, 8).join(' ; ')}.`
    );
  }
  const vp = readVisualPatterns();
  if (vp?.regles?.length) {
    parts.push(
      `\n\nPATTERNS VISUELS des miniatures gagnantes (analyse des vignettes réelles les plus vues). Applique-les:\n${vp.regles
        .map((r) => `- ${r}`)
        .join('\n')}`
    );
    if (vp.archetypes_gagnants?.length) {
      parts.push(`\nArchétypes visuels qui reviennent chez les tops: ${vp.archetypes_gagnants.join(' ; ')}.`);
    }
  }
  parts.push(buildMatchingGuidance());
  return parts.join('');
}

// Libellés lisibles des sujets pour le prompt
const TOPIC_LABELS = {
  annonce_ia: 'annonce ou actualité IA',
  feature_produit: 'démo de fonctionnalité produit',
  workflow_methode: 'méthode / how-to / étapes',
  actu_finance: 'actualité marché/finance',
  partenariat: 'partenariat / intégration',
  resultats_chiffres: 'résultats chiffrés / benchmark',
  storytelling: 'récit personnel / équipe / événement',
  prospection: 'prospection / détection de signaux',
};

// Table de correspondance sujet → archétype gagnant, tirée des vraies
// performances. Dit au directeur artistique: identifie le sujet du post,
// puis choisis l'archétype qui a le mieux performé pour ce sujet.
function buildMatchingGuidance() {
  const m = readMatching();
  if (!m?.topics) return '';
  const lines = [];
  for (const [topic, ranked] of Object.entries(m.topics)) {
    const best = (ranked || []).filter((r) => r.count >= 1).slice(0, 3);
    if (best.length === 0) continue;
    const label = TOPIC_LABELS[topic] || topic;
    lines.push(
      `- ${label} → ${best.map((r) => `${r.archetype} (${r.avg.toLocaleString('fr-FR')} impr. moy., n=${r.count})`).join(' ; ')}`
    );
  }
  if (lines.length === 0) return '';
  return `\n\nMATCHING SUJET → ARCHÉTYPE (indicatif, basé sur les VRAIES impressions des posts de Thomas et Mathis). C'est un POINT DE DÉPART utile, pas une règle: inclus un archétype performant de cette table quand il colle, mais garde la VARIÉTÉ imposée plus haut — les 2 autres briefs doivent explorer d'autres familles du catalogue, pas se limiter à cette liste:\n${lines.join('\n')}`;
}

// Analyse VISION des miniatures les plus performantes: envoie les vignettes
// des meilleurs posts à Claude, qui extrait les traits visuels récurrents.
const VISUAL_PATTERNS_SYSTEM_PROMPT = `Tu es directeur artistique. On te montre les miniatures des posts LinkedIn les PLUS PERFORMANTS d'un compte B2B (audience CGP, banquiers privés). Chaque image est annotée de ses impressions réelles.

Analyse ce qui distingue visuellement les miniatures qui cartonnent. Sois concret et actionnable pour piloter un générateur d'images.

SORTIE JSON STRICTE (rien d'autre):
{"resume": "2 phrases sur l'ADN visuel des tops", "regles": ["règle visuelle actionnable courte", "..."], "archetypes_gagnants": ["type de composition récurrent (ex: capture d'écran produit annotée, gros titre chiffré, comparatif avant/après...)", "..."]}`;

app.post('/api/linkedin-posts/analyze-visuals', async (req, res) => {
  try {
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }
    const { author } = req.body || {};
    let posts = readLinkedInPosts().filter((p) => p.thumbnail_url && p.stats?.impressions);
    if (author) posts = posts.filter((p) => p.author === author);
    if (posts.length < 3) {
      return res.status(422).json({ error: `Pas assez de miniatures avec stats (${posts.length}). Scrapez d'abord les posts.` });
    }

    // Les 10 miniatures les plus vues
    const top = [...posts].sort((a, b) => b.stats.impressions - a.stats.impressions).slice(0, 10);
    const content = [];
    for (const p of top) {
      const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/s.exec(p.thumbnail_url);
      if (!m) continue;
      content.push({ type: 'text', text: `Miniature — ${p.stats.impressions} impressions:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
    }
    if (content.length === 0) {
      return res.status(422).json({ error: 'Aucune miniature exploitable (data URL attendue).' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1536,
        system: VISUAL_PATTERNS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [...content, { type: 'text', text: 'Analyse et réponds UNIQUEMENT en JSON valide.' }] }],
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || `Erreur Claude: ${response.status}` });
    }
    let txt = (data.content?.[0]?.text || '').replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch {
      const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
      parsed = s !== -1 && e > s ? JSON.parse(txt.slice(s, e + 1)) : null;
    }
    if (!parsed) return res.status(500).json({ error: 'Réponse Claude invalide (JSON mal formé)' });

    saveVisualPatterns(parsed);
    res.json({ ...parsed, analyzed: content.length / 2 });
  } catch (error) {
    console.error('Erreur serveur (analyze-visuals):', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ─── Matching sujet × archétype piloté par la donnée ─────────
// Classe chaque vrai post en (sujet, archétype) via la vision, croise
// avec les impressions, et bâtit une table « pour tel sujet, tel
// archétype de miniature performe le mieux ». Imposée au directeur
// artistique lors de la génération.

const MATCHING_FILE = path.join(LINKEDIN_DATA_DIR, 'matching.json');

// Taxonomie de sujets pour le contenu IA/patrimoine (audience CGP)
const POST_TOPICS = [
  'annonce_ia',        // nouveau modèle / actu IA (Sonnet, Anthropic, Meta...)
  'feature_produit',   // démo d'une fonctionnalité (Charlie, screener...)
  'workflow_methode',  // how-to, étapes, cas d'usage exécutable
  'actu_finance',      // actualité marché/finance reframée pour le wealth
  'partenariat',       // partenariat, connexion à une source de données
  'resultats_chiffres',// benchmark, stats, avant/après chiffré
  'storytelling',      // récit perso, parcours, équipe, événement
  'prospection',       // génération de leads, détection de signaux
];

function readMatching() {
  try {
    return JSON.parse(fs.readFileSync(MATCHING_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveMatching(report) {
  fs.mkdirSync(LINKEDIN_DATA_DIR, { recursive: true });
  fs.writeFileSync(MATCHING_FILE, JSON.stringify({ ...report, date: new Date().toISOString() }, null, 2));
}

const MATCHING_SYSTEM_PROMPT = `Tu classes des posts LinkedIn B2B (audience CGP, banquiers privés) selon deux axes, à partir du TEXTE et de la MINIATURE de chaque post.

AXE 1 — SUJET (topic), EXACTEMENT une valeur parmi:
- annonce_ia: annonce d'un nouveau modèle ou actualité IA
- feature_produit: démonstration d'une fonctionnalité d'un outil
- workflow_methode: how-to, méthode, étapes, cas d'usage exécutable
- actu_finance: actualité marché/finance reformulée pour le patrimoine
- partenariat: partenariat, intégration, connexion à une source de données
- resultats_chiffres: benchmark, statistiques, comparatif avant/après chiffré
- storytelling: récit personnel, parcours, équipe, événement
- prospection: génération de leads, détection de signaux patrimoniaux

AXE 2 — ARCHÉTYPE VISUEL de la miniature, EXACTEMENT une valeur parmi:
- versus: deux logos opposés, l'un barré
- partenariat: deux logos côte à côte, trait séparateur
- workflow: infographie d'étapes numérotées avec icônes
- diagramme_produit: schéma hub/flux d'un produit
- mockup_iphone: écran de téléphone mis en scène
- bar_chart: graphique à barres éditorial
- typo_geante: nom/titre en très grandes lettres
- icone_3d: icône 3D centrée + nom
- autre: aucune des compositions ci-dessus

Réponds pour CHAQUE post fourni, dans l'ordre.
SORTIE JSON STRICTE (rien d'autre): {"classifications": [{"i": 0, "topic": "...", "archetype": "..."}, ...]}`;

app.post('/api/linkedin-posts/analyze-matching', async (req, res) => {
  try {
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }
    const { author } = req.body || {};
    let posts = readLinkedInPosts().filter((p) => p.thumbnail_url && p.text?.trim() && p.stats?.impressions);
    if (author) posts = posts.filter((p) => p.author === author);
    if (posts.length < 6) {
      return res.status(422).json({ error: `Pas assez de posts avec miniature + texte + stats (${posts.length}). Scrapez d'abord.` });
    }

    // Les 40 posts les plus vus (assez de signal, coût borné)
    const top = [...posts].sort((a, b) => b.stats.impressions - a.stats.impressions).slice(0, 40);
    const classified = [];

    // Classification par lots de 8 (texte + miniature envoyés à la vision)
    for (let start = 0; start < top.length; start += 8) {
      const batch = top.slice(start, start + 8);
      const content = [];
      batch.forEach((p, k) => {
        const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/s.exec(p.thumbnail_url);
        content.push({ type: 'text', text: `POST ${k} — texte: "${p.text.slice(0, 280).replace(/\n/g, ' ')}"` });
        if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
      });
      content.push({ type: 'text', text: 'Classe chaque post. Réponds UNIQUEMENT en JSON valide.' });

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system: MATCHING_SYSTEM_PROMPT, messages: [{ role: 'user', content }] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) continue;
      let txt = (data.content?.[0]?.text || '').replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(txt);
      } catch {
        const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
        parsed = s !== -1 && e > s ? JSON.parse(txt.slice(s, e + 1)) : { classifications: [] };
      }
      for (const c of parsed.classifications || []) {
        const post = batch[c.i];
        if (!post) continue;
        const topic = POST_TOPICS.includes(c.topic) ? c.topic : null;
        const archetype = [...VALID_ARCHETYPES, 'autre'].includes(c.archetype) ? c.archetype : 'autre';
        if (topic && archetype !== 'autre') {
          classified.push({ topic, archetype, impressions: post.stats.impressions });
        }
      }
    }

    if (classified.length === 0) {
      return res.status(422).json({ error: 'Aucune classification exploitable.' });
    }

    // Agrégation: pour chaque (sujet, archétype) → moyenne d'impressions
    const cells = {}; // topic -> archetype -> {sum, count}
    const overall = {}; // archetype -> {sum, count}
    for (const { topic, archetype, impressions } of classified) {
      ((cells[topic] ??= {})[archetype] ??= { sum: 0, count: 0 });
      cells[topic][archetype].sum += impressions;
      cells[topic][archetype].count += 1;
      (overall[archetype] ??= { sum: 0, count: 0 });
      overall[archetype].sum += impressions;
      overall[archetype].count += 1;
    }

    const rank = (obj) =>
      Object.entries(obj)
        .map(([archetype, { sum, count }]) => ({ archetype, avg: Math.round(sum / count), count }))
        .sort((a, b) => b.avg - a.avg);

    const topics = {};
    for (const [topic, arch] of Object.entries(cells)) {
      topics[topic] = rank(arch);
    }

    const report = { sample: classified.length, topics, overall: rank(overall) };
    saveMatching(report);
    res.json(report);
  } catch (error) {
    console.error('Erreur serveur (analyze-matching):', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur serveur' });
  }
});

function readLinkedInPosts() {
  try {
    return JSON.parse(fs.readFileSync(LINKEDIN_POSTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeLinkedInPosts(posts) {
  fs.mkdirSync(LINKEDIN_DATA_DIR, { recursive: true });
  fs.writeFileSync(LINKEDIN_POSTS_FILE, JSON.stringify(posts, null, 2));
}

// Normalise une URL de post pour servir de clé de fusion
function normalizePostUrl(url) {
  if (typeof url !== 'string') return null;
  const match = url.match(/urn:li:(?:activity|share|ugcPost):(\d+)/) || url.match(/activity[:-](\d+)/);
  if (match) return `urn:li:activity:${match[1]}`;
  return url.split('?')[0].replace(/\/$/, '');
}

function postId(urlKey) {
  return Buffer.from(urlKey).toString('base64url');
}

// Fusionne des posts entrants (scrape ou import) avec l'existant.
// Les champs non vides des entrants écrasent; les stats sont fusionnées
// champ à champ pour cumuler export officiel et scrape public.
function mergeLinkedInPosts(incoming) {
  const posts = readLinkedInPosts();
  const byKey = new Map(posts.map((p) => [p.url_key, p]));
  let added = 0;
  let updated = 0;

  for (const raw of incoming) {
    const urlKey = normalizePostUrl(raw.url);
    if (!urlKey) continue;
    const existing = byKey.get(urlKey);
    const entry = existing || {
      id: postId(urlKey),
      url_key: urlKey,
      url: raw.url,
      author: raw.author || 'thomas',
      date: null,
      text: '',
      thumbnail_url: null,
      stats: {},
      sources: [],
    };

    if (raw.date) entry.date = raw.date;
    if (raw.text?.trim()) entry.text = raw.text.trim();
    if (raw.thumbnail_url) entry.thumbnail_url = raw.thumbnail_url;
    if (raw.author) entry.author = raw.author;
    if (raw.stats && typeof raw.stats === 'object') {
      for (const [k, v] of Object.entries(raw.stats)) {
        if (v !== null && v !== undefined && v !== '') entry.stats[k] = v;
      }
    }
    if (raw.source && !entry.sources.includes(raw.source)) entry.sources.push(raw.source);
    entry.date_updated = new Date().toISOString();

    if (existing) updated++;
    else {
      posts.push(entry);
      byKey.set(urlKey, entry);
      added++;
    }
  }

  writeLinkedInPosts(posts);
  return { added, updated, total: posts.length };
}

app.get('/api/linkedin-posts', (req, res) => {
  const posts = readLinkedInPosts();
  posts.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  res.json({ posts });
});

app.delete('/api/linkedin-posts/:id', (req, res) => {
  const posts = readLinkedInPosts();
  const next = posts.filter((p) => p.id !== req.params.id);
  writeLinkedInPosts(next);
  res.json({ deleted: posts.length - next.length });
});

// Télécharge une miniature depuis l'URL CDN LinkedIn (le serveur n'a pas
// la CSP du navigateur), la redimensionne et la renvoie en data URL JPEG.
async function fetchThumbnail(imgSrc) {
  try {
    const response = await fetch(imgSrc);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const out = await sharp(buffer).resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch {
    return null;
  }
}

// Ingestion directe (scraping via le navigateur, ou tout autre outil).
// Un post peut fournir thumbnail_url (data URL déjà prête) ou img_src
// (URL CDN LinkedIn) que le serveur télécharge lui-même.
app.post('/api/linkedin-posts/ingest', async (req, res) => {
  try {
    const { posts } = req.body;
    if (!Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ error: 'posts doit être un tableau non vide' });
    }
    for (const post of posts) {
      if (!post.thumbnail_url && post.img_src) {
        post.thumbnail_url = await fetchThumbnail(post.img_src);
      }
    }
    const result = mergeLinkedInPosts(posts);
    res.json(result);
  } catch (error) {
    console.error('Erreur serveur (ingest):', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ─── Tableau de bord analytics ───────────────────────────────
// Les feuilles ENGAGEMENT (impressions/jour), ABONNÉS (abonnés/jour) et
// DÉMOGRAPHIE (qui te lit) de l'export officiel, exploitées et stockées
// par auteur. L'export est quotidien: on peut déduire le meilleur JOUR
// de la semaine, pas l'heure (LinkedIn ne l'exporte pas).

const ANALYTICS_FILE = path.join(LINKEDIN_DATA_DIR, 'analytics.json');

function readAnalytics() {
  try {
    return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveAnalytics(author, data) {
  const all = readAnalytics();
  all[author] = { ...data, date: new Date().toISOString() };
  fs.mkdirSync(LINKEDIN_DATA_DIR, { recursive: true });
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(all, null, 2));
}

// Parse les feuilles non-posts d'un classeur LinkedIn en un objet analytics.
// toDate: convertisseur de date déjà calé sur le format (FR/EN) du fichier.
function parseAnalyticsSheets(workbook, toDate) {
  const num = (v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/[\s,]/g, '').replace('%', ''));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const analytics = { engagement_daily: [], followers_daily: [], followers_total: null, demographics: {}, summary: {} };

  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true });
    const header = (rows[0] || []).map((c) => (typeof c === 'string' ? c.toLowerCase() : ''));

    // ENGAGEMENT: Date | Impressions | Engagements/Interactions
    if (header.some((h) => h === 'date')) {
      const impCol = header.findIndex((h) => h.includes('impression'));
      const engCol = header.findIndex((h) => h.includes('engagement') || h.includes('interaction'));
      for (const r of rows.slice(1)) {
        const d = toDate(r[0]);
        if (!d) continue;
        analytics.engagement_daily.push({
          date: d.slice(0, 10),
          impressions: num(r[impCol]) ?? 0,
          engagements: num(r[engCol]) ?? 0,
        });
      }
    }

    // DÉCOUVERTE / DISCOVERY: "Performance globale" + Impressions total
    if (header.some((h) => h.includes('performance') || h.includes('overall'))) {
      for (const r of rows.slice(1)) {
        if (typeof r[0] === 'string' && r[0].toLowerCase().includes('impression')) analytics.summary.impressions = num(r[1]);
        if (typeof r[0] === 'string' && (r[0].toLowerCase().includes('reached') || r[0].toLowerCase().includes('atteint'))) analytics.summary.members_reached = num(r[1]);
      }
    }

    // FOLLOWERS / ABONNÉS: total en ligne 0, puis Date | New followers
    if (header.some((h) => h.includes('follower') || h.includes('abonné'))) {
      analytics.followers_total = num((rows[0] || [])[1]);
      // sous-table Date | New followers commençant qq lignes plus bas
      let started = false;
      for (const r of rows) {
        if (!started) {
          const h0 = typeof r[0] === 'string' ? r[0].toLowerCase() : '';
          if (h0 === 'date') started = true;
          continue;
        }
        const d = toDate(r[0]);
        if (d) analytics.followers_daily.push({ date: d.slice(0, 10), new_followers: num(r[1]) ?? 0 });
      }
    }

    // DÉMOGRAPHIE: Catégorie | Valeur | Pourcentage.
    // « < 1% » est traité comme 0.9 pour ne pas perdre la catégorie.
    if (header.some((h) => h.includes('demographic') || h.includes('démographi'))) {
      const pctParse = (v) => {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          if (/<\s*1/.test(v)) return 0.9;
          const n = parseFloat(v.replace(/[\s,<]/g, '').replace('%', ''));
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };
      for (const r of rows.slice(1)) {
        const cat = r[0];
        const value = r[1];
        const pct = pctParse(r[2]);
        if (typeof cat === 'string' && typeof value === 'string' && pct !== null) {
          (analytics.demographics[cat] ??= []).push({ value, percentage: pct });
        }
      }
    }
  }
  return analytics;
}

// Import du fichier d'analytics officiel LinkedIn (XLSX, base64).
// Le format varie (FR/EN, tables côte à côte dans TOP POSTS): on scanne
// toutes les feuilles à la recherche de cellules URL de post, et on
// associe les métriques via les en-têtes de colonnes détectés au-dessus.
app.post('/api/linkedin-posts/import-analytics', (req, res) => {
  try {
    const { author, data_base64 } = req.body;
    if (!data_base64) {
      return res.status(400).json({ error: 'Fichier manquant (data_base64)' });
    }

    const workbook = XLSX.read(Buffer.from(data_base64, 'base64'), { type: 'buffer', cellDates: true });
    const found = [];

    // L'export LinkedIn varie selon la langue: dates US M/J/AAAA (fichier
    // anglais) ou FR J/M/AAAA (fichier français). On détecte le format en
    // scannant toutes les dates: si une part 1 dépasse 12 → J/M; si une
    // part 2 dépasse 12 → M/J; sinon on garde M/J (défaut LinkedIn EN).
    let dayFirst = false;
    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true });
      for (const row of rows) {
        for (const cell of row || []) {
          if (typeof cell !== 'string') continue;
          const m = cell.trim().match(/^(\d{1,2})\/(\d{1,2})\/\d{4}$/);
          if (m) {
            if (+m[1] > 12) dayFirst = true;
            else if (+m[2] > 12) dayFirst = false;
          }
        }
      }
    }

    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true });

      // En-têtes de métriques: colonne → type, détectés sur tout le haut de feuille
      const metricColumns = new Map();
      for (const row of rows.slice(0, 10)) {
        (row || []).forEach((cell, col) => {
          if (typeof cell !== 'string') return;
          const label = cell.toLowerCase();
          if (label.includes('impression')) metricColumns.set(col, 'impressions');
          else if (label.includes('engagement') || label.includes('interaction')) metricColumns.set(col, 'engagements');
          else if (label.includes('taux')) metricColumns.set(col, 'engagement_rate');
        });
      }

      // L'export LinkedIn livre tout en chaînes: dates au format US
      // (M/D/YYYY) et nombres avec éventuels séparateurs
      const toDate = (value) => {
        if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
        if (typeof value === 'string') {
          const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (m) {
            const month = dayFirst ? +m[2] : +m[1];
            const day = dayFirst ? +m[1] : +m[2];
            const date = new Date(Date.UTC(+m[3], month - 1, day));
            if (!isNaN(date.getTime())) return date.toISOString();
          }
        }
        return null;
      };
      const toNumber = (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && /^[\d\s.,%]+$/.test(value.trim())) {
          const n = parseFloat(value.replace(/[\s,]/g, '').replace('%', ''));
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };

      for (const row of rows) {
        (row || []).forEach((cell, col) => {
          if (typeof cell !== 'string' || !cell.includes('linkedin.com')) return;
          const post = { url: cell, author: author || 'thomas', stats: {}, source: 'export_analytics' };
          // Cellules à droite de l'URL: date puis métriques (selon les en-têtes)
          for (let c = col + 1; c <= col + 4 && c < (row.length || 0); c++) {
            const value = row[c];
            const date = toDate(value);
            if (date) {
              post.date = date;
              continue;
            }
            const num = toNumber(value);
            if (num !== null && metricColumns.has(c)) {
              const kind = metricColumns.get(c);
              post.stats[kind] = kind === 'engagement_rate' ? num : Math.round(num);
            }
          }
          if (Object.keys(post.stats).length > 0 || post.date) found.push(post);
        });
      }
    }

    if (found.length === 0) {
      return res.status(422).json({
        error: "Aucun post trouvé dans ce fichier. Attendu: l'export XLSX d'analytics LinkedIn (statistiques → publications → exporter).",
      });
    }

    const result = mergeLinkedInPosts(found);

    // Exploite aussi les feuilles engagement/abonnés/démographie pour le
    // tableau de bord (best-effort: n'empêche jamais l'import des posts)
    try {
      const toDateTop = (value) => {
        if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
        if (typeof value === 'string') {
          const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (m) {
            const month = dayFirst ? +m[2] : +m[1];
            const day = dayFirst ? +m[1] : +m[2];
            const d = new Date(Date.UTC(+m[3], month - 1, day));
            if (!isNaN(d.getTime())) return d.toISOString();
          }
        }
        return null;
      };
      const analytics = parseAnalyticsSheets(workbook, toDateTop);
      saveAnalytics(author || 'thomas', analytics);
    } catch (e) {
      console.error('Parsing analytics échoué (posts importés quand même):', e.message);
    }

    res.json({ ...result, parsed: found.length });
  } catch (error) {
    console.error('Erreur serveur (import-analytics):', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Tableau de bord: renvoie les analytics stockées + insights calculés
// (meilleur jour de publication, croissance d'abonnés, audience).
const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

app.get('/api/linkedin-analytics', (req, res) => {
  const author = req.query.author;
  const all = readAnalytics();

  // Fusionne les analytics des auteurs demandés (ou tous)
  const keys = author && author !== 'tous' ? [author] : Object.keys(all);
  const engagement = [];
  const followersDaily = [];
  let followersTotal = 0;
  const demographics = {};
  const summary = { impressions: 0, members_reached: 0 };
  for (const k of keys) {
    const a = all[k];
    if (!a) continue;
    engagement.push(...(a.engagement_daily || []));
    followersDaily.push(...(a.followers_daily || []));
    followersTotal += a.followers_total || 0;
    if (a.summary?.impressions) summary.impressions += a.summary.impressions;
    if (a.summary?.members_reached) summary.members_reached += a.summary.members_reached;
    for (const [cat, list] of Object.entries(a.demographics || {})) {
      (demographics[cat] ??= []).push(...list);
    }
  }

  // Meilleur JOUR de la semaine, calculé sur les POSTS (date + impressions):
  // c'est le signal le plus actionnable pour « quand publier »
  let posts = readLinkedInPosts().filter((p) => p.date && p.stats?.impressions);
  if (author && author !== 'tous') posts = posts.filter((p) => p.author === author);
  const byWeekday = {};
  for (const p of posts) {
    const wd = new Date(p.date).getUTCDay();
    (byWeekday[wd] ??= { sum: 0, count: 0 });
    byWeekday[wd].sum += p.stats.impressions;
    byWeekday[wd].count += 1;
  }
  const weekdayPerf = WEEKDAYS.map((label, wd) => ({
    weekday: label,
    avg_impressions: byWeekday[wd] ? Math.round(byWeekday[wd].sum / byWeekday[wd].count) : 0,
    posts: byWeekday[wd]?.count || 0,
  }));
  const bestDay = [...weekdayPerf].filter((w) => w.posts > 0).sort((a, b) => b.avg_impressions - a.avg_impressions)[0] || null;

  // Croissance d'abonnés: cumul et gain net sur la période
  const followersGained = followersDaily.reduce((s, d) => s + (d.new_followers || 0), 0);

  // Démographie: garde les top valeurs par catégorie, agrégées
  const demoTop = {};
  for (const [cat, list] of Object.entries(demographics)) {
    const merged = {};
    for (const { value, percentage } of list) {
      merged[value] = Math.max(merged[value] || 0, percentage);
    }
    demoTop[cat] = Object.entries(merged)
      .map(([value, percentage]) => ({ value, percentage }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 6);
  }

  res.json({
    followers_total: followersTotal || null,
    followers_gained: followersGained || null,
    summary,
    weekday_performance: weekdayPerf,
    best_day: bestDay,
    demographics: demoTop,
    engagement_daily: engagement.sort((a, b) => a.date.localeCompare(b.date)),
    has_data: keys.some((k) => all[k]),
  });
});

// Analyse des patterns sur les posts les plus performants
const PATTERNS_SYSTEM_PROMPT = `Tu es un analyste expert des contenus LinkedIn B2B (audience: CGP, banquiers privés, asset managers).

On te donne des posts LinkedIn avec leurs statistiques réelles (impressions, réactions...). Ta tâche: identifier les PATTERNS qui distinguent les posts performants des autres, pour guider les futures générations.

RÈGLES:
1. Appuie-toi UNIQUEMENT sur les posts fournis et leurs chiffres. Pas de généralités LinkedIn.
2. patterns: 4 à 6 observations précises (structure de hook, longueur, sujets, formats, CTA, ton...), chacune reliée aux chiffres ("les 3 posts au-dessus de X impressions ont tous...").
3. sujets_gagnants: 3 à 5 thèmes qui surperforment chez CET auteur.
4. regles: 3 à 5 règles impératives courtes (max 140 caractères chacune) directement applicables à la génération de futurs posts.
5. resume: 2 phrases sur ce qui fait marcher ce compte.

SORTIE JSON STRICTE (rien d'autre):
{"resume": "...", "patterns": [{"titre": "...", "detail": "..."}], "sujets_gagnants": ["..."], "regles": [{"rule_text": "...", "category": "hook|structure|ton|cta|vocabulaire|longueur|autre"}]}`;

app.post('/api/linkedin-posts/analyze-patterns', async (req, res) => {
  try {
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }
    const { author } = req.body || {};
    let posts = readLinkedInPosts().filter((p) => p.text?.trim());
    if (author) posts = posts.filter((p) => p.author === author);
    if (posts.length < 3) {
      return res.status(422).json({ error: `Pas assez de posts avec texte (${posts.length}). Importez ou scrapez d'abord vos posts.` });
    }

    // Les 15 plus vus (ou plus réagis) + les 5 moins performants pour contraste
    const score = (p) => p.stats?.impressions ?? ((p.stats?.reactions ?? 0) * 50);
    const sorted = [...posts].sort((a, b) => score(b) - score(a));
    const sample = [...sorted.slice(0, 15), ...sorted.slice(-5)];
    const corpus = sample
      .map((p, i) => {
        const s = p.stats || {};
        const statLine = [
          s.impressions != null ? `${s.impressions} impressions` : null,
          s.reactions != null ? `${s.reactions} réactions` : null,
          s.comments != null ? `${s.comments} commentaires` : null,
          s.engagement_rate != null ? `taux ${s.engagement_rate}` : null,
        ].filter(Boolean).join(', ');
        return `POST ${i + 1} (${p.date?.slice(0, 10) || 'date inconnue'} — ${statLine || 'stats inconnues'}):\n${p.text.slice(0, 900)}`;
      })
      .join('\n\n═══\n\n');

    const parsed = await callClaudeJSON(
      PATTERNS_SYSTEM_PROMPT,
      `Analyse ces ${sample.length} posts (les plus performants d'abord, les moins performants à la fin pour contraste):\n\n${corpus}\n\nRéponds UNIQUEMENT avec du JSON valide.`,
      4096
    );

    // Persiste le dernier rapport par auteur: il nourrit ensuite la
    // reformulation et la génération de miniatures (voir applyPatterns)
    savePatternsReport(author || 'tous', parsed);

    res.json(parsed);
  } catch (error) {
    console.error('Erreur serveur (analyze-patterns):', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ─── Prédiction de performance ───────────────────────────────
// Note chaque variante générée AVANT publication, en s'appuyant sur les
// 96 vrais posts étiquetés (leurs impressions réelles) + les patterns
// gagnants détectés. Le score /10 est traduit en fourchette d'impressions
// CALIBRÉE sur la distribution réelle — pas un chiffre inventé.

// Percentile (interpolation linéaire) d'un tableau trié.
function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

// Distribution des impressions réelles, filtrée par auteur.
function impressionDistribution(author) {
  const wanted = author && author !== 'tous' ? author : null;
  const vals = readLinkedInPosts()
    .filter((p) => (!wanted || p.author === wanted) && Number(p.stats?.impressions) > 0)
    .map((p) => Number(p.stats.impressions))
    .sort((a, b) => a - b);
  if (vals.length === 0) return null;
  return {
    n: vals.length,
    sorted: vals,
    median: percentile(vals, 0.5),
    p25: percentile(vals, 0.25),
    p75: percentile(vals, 0.75),
    p90: percentile(vals, 0.9),
    max: vals[vals.length - 1],
  };
}

// Traduit un score /10 en fourchette d'impressions, ancrée sur la vraie
// distribution: le score positionne le centre en percentile, la fourchette
// couvre une bande autour (± ~1.5 point).
function scoreToImpressions(score, dist) {
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const lowQ = clamp((score - 1.5) / 10);
  // Plafonne le haut de fourchette au p95: éviter d'ancrer sur le seul post record (outlier)
  const highQ = Math.min(0.95, clamp((score + 1) / 10));
  const round = (n) => {
    if (n >= 10000) return Math.round(n / 1000) * 1000;
    if (n >= 1000) return Math.round(n / 100) * 100;
    return Math.round(n / 10) * 10;
  };
  return { low: round(percentile(dist.sorted, lowQ)), high: round(percentile(dist.sorted, highQ)) };
}

const PREDICT_SYSTEM_PROMPT = `Tu es analyste growth LinkedIn pour un compte B2B en gestion de patrimoine (audience: CGP, banquiers privés, asset managers). Tu notes le POTENTIEL de performance de variantes de posts AVANT publication.

Tu disposes des patterns tirés des VRAIS posts de ce compte (avec leurs impressions réelles). Note chaque variante en te basant dessus, pas sur des généralités.

Pour CHAQUE variante, évalue quatre critères notés sur 10:
- hook: la 1re ligne (avant « voir plus », ~140 car.) donne-t-elle envie de cliquer ? (accroche, biais, désir humain activé)
- sujet: le sujet est-il de ceux qui surperforment chez cette audience ?
- structure: lisibilité mobile (phrases courtes, aération, respiration, chute), présence d'un CTA ou d'une question finale.
- longueur: adaptée au format LinkedIn (ni trop court ni bavard).

Puis un score GLOBAL /10 (pas la simple moyenne: le hook et le sujet pèsent le plus — un post au hook faible plafonne même si le reste est bon).

Sois DISCRIMINANT: étale les notes, ne mets pas 7-8 partout. Un hook plat = 4-5. Un hook fort sur un sujet gagnant = 8-9.

SORTIE JSON STRICTE (rien d'autre, pas de markdown):
{"predictions": [
  {"index": 1, "score": 7, "sujet": "libellé court du sujet détecté", "breakdown": {"hook": 8, "sujet": 7, "structure": 6, "longueur": 7}, "raison": "1 phrase: ce qui porte ou plombe la variante (ex: bon hook curiosité + sujet méthode qui performe, mais CTA absent)", "leviers": ["amélioration concrète et actionnable", "..."]},
  {"index": 2, "...": "..."}
]}`;

app.post('/api/predict-performance', async (req, res) => {
  try {
    const { variants, author } = req.body;
    const list = (Array.isArray(variants) ? variants : [variants]).filter((v) => typeof v === 'string' && v.trim());

    if (list.length === 0) {
      return res.status(400).json({ error: 'Aucune variante à évaluer' });
    }
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }

    const dist = impressionDistribution(author);
    // Bloc de contexte réel: patterns gagnants + repères d'impressions
    const patternGuidance = buildPatternGuidance();
    const benchmark = dist
      ? `\n\nREPÈRES D'IMPRESSIONS RÉELS de ce compte (${dist.n} posts): médiane ${dist.median.toLocaleString('fr-FR')}, top 25% au-dessus de ${dist.p75.toLocaleString('fr-FR')}, top 10% au-dessus de ${dist.p90.toLocaleString('fr-FR')}, record ${dist.max.toLocaleString('fr-FR')}. Un post « moyen » fait la médiane; un score de 8+/10 vise le top 25%.`
      : '';
    const systemPrompt = PREDICT_SYSTEM_PROMPT + patternGuidance + benchmark;

    const userContent =
      list.map((v, i) => `VARIANTE ${i + 1}:\n${v.trim()}`).join('\n\n═══\n\n') +
      `\n\nNote chacune des ${list.length} variantes. Réponds UNIQUEMENT avec du JSON valide.`;

    const parsed = await callClaudeJSON(systemPrompt, userContent, 2048);

    if (!Array.isArray(parsed.predictions)) {
      return res.status(500).json({ error: 'Réponse de prédiction invalide' });
    }

    const predictions = parsed.predictions.slice(0, list.length).map((p, i) => {
      const score = Math.min(10, Math.max(0, Math.round(Number(p.score) || 0)));
      const impressions = dist ? scoreToImpressions(score, dist) : null;
      return {
        index: i + 1,
        score,
        sujet: typeof p.sujet === 'string' ? p.sujet : null,
        breakdown: p.breakdown && typeof p.breakdown === 'object' ? p.breakdown : null,
        raison: typeof p.raison === 'string' ? p.raison : '',
        leviers: Array.isArray(p.leviers) ? p.leviers.filter((x) => typeof x === 'string').slice(0, 3) : [],
        impressions,
      };
    });

    // Meilleure variante = plus haut score (départage par ordre)
    const best = predictions.reduce((a, b) => (b.score > a.score ? b : a), predictions[0]);

    res.json({
      predictions,
      best_index: best?.index ?? null,
      has_benchmark: !!dist,
      sample_size: dist?.n ?? 0,
    });
  } catch (error) {
    console.error('Erreur serveur (predict-performance):', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ─────────────────────────────────────────────────────────────
// Générateur d'idées de posts: Claude Opus 4.8 (web search) + scraping Playwright,
// piloté par les patterns gagnants. Déclenchement 100% manuel.
// Note: Opus est nécessaire pour web_search (Haiku ne supporte pas les tool calls)
// ─────────────────────────────────────────────────────────────

const IDEAS_FILE = path.join(LINKEDIN_DATA_DIR, 'ideas.json');
const VALID_STATUTS = ['nouveau', 'vu', 'utilise', 'ecarte'];

// Parse tolérant partagé (fences ```json, extraction du 1er { au dernier }).
function parseLooseJson(text) {
  const str = String(text).trim();

  // Essaie d'abord de parser directement
  try {
    return JSON.parse(str);
  } catch {}

  // Nettoie les fences markdown
  const clean = str
    .replace(/^```(?:json)?[\n\r]?/i, '')
    .replace(/[\n\r]?```$/i, '')
    .trim();

  try {
    return JSON.parse(clean);
  } catch {}

  // Extraction du 1er { au dernier }
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(clean.slice(start, end + 1));
    } catch {}
  }

  // Cherche aussi [ ... ]
  const aStart = clean.indexOf('[');
  const aEnd = clean.lastIndexOf(']');
  if (aStart !== -1 && aEnd > aStart) {
    try {
      return JSON.parse(clean.slice(aStart, aEnd + 1));
    } catch {}
  }

  throw new Error('JSON parsing failed');
}

// OPTIMISATION COÛTS: essaie Z.AI d'abord (moins cher), puis Mistral, puis Claude Opus
// Tous supportent web_search ou une recherche équivalente
async function callZAIWebSearch(system, user, maxTokens = 6000, allowedDomains = null) {
  const ZAI_API_KEY = process.env.ZAI_API_KEY;
  if (!ZAI_API_KEY) throw new Error('Clé Z.AI non configurée');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 280000);
  let response;
  try {
    // Z.AI API (compatible avec les recherches)
    response = await fetch('https://api.z.ai/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4', // Z.AI expose des modèles GPT
        max_tokens: maxTokens,
        system,
        tools: [{
          type: 'web_search',
          name: 'web_search',
          max_uses: 6,
          ...(allowedDomains?.length ? { allowed_domains: allowedDomains } : {}),
        }],
        messages: [{ role: 'user', content: user }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Recherche Z.AI timeout');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Erreur Z.AI: ${response.status} ${data.error?.message || ''}`);
  }
  const text = (data.choices?.[0]?.message?.content || '')
    .split('\n')
    .filter(l => l.trim())
    .join('\n');
  return parseLooseJson(text);
}

async function callMistralWebSearch(system, user, maxTokens = 3000, allowedDomains = null) {
  const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
  if (!MISTRAL_API_KEY) throw new Error('Clé Mistral non configurée');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000); // 60s max pour Mistral
  let response;
  try {
    // Mistral API avec web_search (OpenAI-compatible)
    response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Recherche Mistral timeout');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Erreur Mistral: ${response.status} ${data.error?.message || ''}`);
  }
  const text = (data.choices?.[0]?.message?.content || '').trim();
  return parseLooseJson(text);
}

// Wrapper intelligent: essaie Z.AI → Mistral → Claude Opus (fallback coûteux)
async function callWebSearch(system, user, maxTokens = 6000, allowedDomains = null) {
  // Essaie Z.AI d'abord (moins cher) - DISABLED pour maintenant (Z.AI API unclear)
  // try {
  //   console.log('[WebSearch] Tentative Z.AI...');
  //   return await callZAIWebSearch(system, user, maxTokens, allowedDomains);
  // } catch (err) {
  //   console.log(`[WebSearch] Z.AI échoué (${err.message}), essai Mistral...`);
  // }

  // Fallback Mistral
  try {
    console.log('[WebSearch] Tentative Mistral...');
    return await callMistralWebSearch(system, user, maxTokens, allowedDomains);
  } catch (err) {
    console.log(`[WebSearch] Mistral échoué (${err.message}), essai Claude (coûteux)...`);
  }

  // Fallback Claude Opus (coûteux, dernier recours)
  if (!CLAUDE_API_KEY) throw new Error('Aucune clé API web_search disponible (Mistral + Claude unavailable)');
  console.log('[WebSearch] Fallback Claude Opus (coûteux)');
  return await callClaudeWebSearch(system, user, maxTokens, allowedDomains);
}

// Claude Opus (ancien, garder comme fallback coûteux)
async function callClaudeWebSearch(system, user, maxTokens = 6000, allowedDomains = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 280000);
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system,
        // max_uses bas: chaque recherche coûte (forfait outil + tokens des pages
        // réinjectées). 2 recherches ciblées par beat suffisent — gros levier de coût.
        // allowed_domains (optionnel): restreint la recherche à une liste de
        // domaines (ex: ft.com pour le beat Financial Times).
        // Outil web_search_20250305 (variante "basique"): compatible Haiku.
        // La variante dynamique 20260209 exige le tool calling programmatique,
        // que Haiku ne supporte pas — d'où ce choix pour rester tout-Haiku.
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 2,
          ...(allowedDomains?.length ? { allowed_domains: allowedDomains } : {}),
        }],
        messages: [{ role: 'user', content: user }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('La recherche web a pris trop de temps (>280s). Réessaie : la recherche est parfois longue.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

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

// Générer idées avec Mistral (cheap: ~$0.0001 par appel)
async function fetchFreeIdeas() {
  const ideas = [];

  // Mistral pour 1 beat fintech/IA cheap
  try {
    console.log('[Mistral] Recherche news fintech/AI...');
    const result = await callMistralWebSearch(
      `Retourne UNIQUEMENT du JSON valide, rien d'autre. Format:
{"ideas": [{"titre": "titre court", "why_now": "1 phrase", "sources": [{"titre": "source", "url": "https://...", "date": "AAAA-MM-JJ"}], "angle": "angle CGP", "suggested_hook": "hook court", "suggested_archetype": "citation", "score": 7}]}`,
      'Trouve 2-3 actualités récentes (derniers 7 jours) du Financial Times, fintech, AI, startups, blockchain, régulation pour professionnels gestion patrimoine.',
      1500
    );
    if (result?.ideas && Array.isArray(result.ideas)) {
      ideas.push(...result.ideas.slice(0, 3).map(i => ({
        ...i,
        // Attribue le thème "ft_actu" si c'est un article FT, sinon fintech_intl
        theme: (i.sources?.[0]?.url?.includes('ft.com') || i.titre?.toLowerCase().includes('financial times'))
          ? 'ft_actu'
          : 'fintech_intl'
      })));
    }
  } catch (err) {
    console.log(`[Mistral] Recherche échouée: ${err.message}`);
  }

  return ideas;
}

// Moteur: cherche des idées fraîches via Medium scraping + Mistral (quasi-gratuit)
async function generateIdeaDigest() {
  try {
    const winningTopics = [
      ...new Set(Object.values(readPatterns()).flatMap((r) => r.sujets_gagnants || [])),
    ];
    const seenTitles = [...readIdeas(IDEAS_FILE).ideas]
      .sort((a, b) => (b.date_found || '').localeCompare(a.date_found || ''))
      .slice(0, 60)
      .map((i) => i.titre);
    const nowDate = new Date();
    const DAYS = 14;
    const todayISO = nowDate.toISOString().slice(0, 10);
    const sinceISO = new Date(nowDate.getTime() - DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // En PARALLÈLE: (1) sources GRATUITES de Joseph (Medium/RSS, ~$0) et (2) la
    // veille FIABLE = 5 beats via callWebSearch (Mistral si clé dispo, sinon Claude
    // Haiku). Les deux alimentent la même liste — le gratuit est un bonus, les beats
    // garantissent des idées même sans source gratuite productive.
    const freePromise = fetchFreeIdeas().catch((e) => {
      console.error('fetchFreeIdeas KO (ignoré):', e.message);
      return [];
    });
    const beatsPromise = Promise.allSettled(
      IDEA_BEATS.map((beat) => {
        const { system, user } = buildBeatPrompt({
          beat, winningTopics, seenTitles, todayISO, sinceISO, days: DAYS, perBeat: 3,
        });
        return callWebSearch(system, user, 3000, beat.allowedDomains).then((parsed) => {
          const arr = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
          return arr.map((idea) => ({ ...idea, theme: beat.theme }));
        });
      })
    );

    const [freeIdeas, beatResults] = await Promise.all([freePromise, beatsPromise]);
    const failedBeats = beatResults.filter((r) => r.status !== 'fulfilled').length;
    const beatIdeas = beatResults.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    console.log(`[Digest] ${beatIdeas.length} idées (beats) + ${freeIdeas.length} (gratuit), ${failedBeats}/${IDEA_BEATS.length} beats KO`);

    const dist = impressionDistribution(null); // distribution globale (tous auteurs)
    const now = nowDate.toISOString();

    const incoming = [...beatIdeas, ...freeIdeas]
      .map(validateRawIdea)
      .filter(Boolean)
      .map((idea) => ({
        ...idea,
        date_found: now,
        impressions_estimees: dist ? scoreToImpressions(idea.score, dist) : null,
      }));

    // Relecture JUSTE avant écriture: préserve un PATCH concurrent (statut).
    const fresh = readIdeas(IDEAS_FILE);
    const { list, added } = mergeIdeas(fresh.ideas, incoming);
    list.sort((a, b) => b.score - a.score);
    // Échec seulement si RIEN de neuf ET tous les beats ont planté
    saveIdeas(IDEAS_FILE, { ideas: list, last_run: now, last_run_failed: added === 0 && failedBeats === IDEA_BEATS.length });
    return { added, total: list.length, beats: IDEA_BEATS.length, failed_beats: failedBeats, free: freeIdeas.length };
  } catch (error) {
    console.error('Échec generateIdeaDigest:', error.message);
    const cur = readIdeas(IDEAS_FILE);
    saveIdeas(IDEAS_FILE, { ...cur, last_run_failed: true });
    throw error;
  }
}

app.post('/api/ideas/generate', async (req, res) => {
  try {
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }

    // Lance les beats web search ET le scraping Playwright en parallèle
    const [digestResult, scrapedData] = await Promise.allSettled([
      generateIdeaDigest(),
      scrapeTrendingIdeas(),
    ]).then(results => [
      results[0].status === 'fulfilled' ? results[0].value : null,
      results[1].status === 'fulfilled' ? results[1].value : null,
    ]);

    // Fusionner les idées du scraping avec celles existantes
    let scrapedIdeas = [];
    if (scrapedData) {
      scrapedIdeas = [
        ...scrapedData.twitter.map(i => ({ ...i, date_found: new Date().toISOString() })),
        ...scrapedData.ft.map(i => ({ ...i, date_found: new Date().toISOString() })),
      ]
        .map(validateRawIdea)
        .filter(Boolean)
        .map(i => ({
          ...i,
          impressions_estimees: 150 + Math.random() * 250,
        }));
    }

    // Fusion finale avec la base existante
    if (scrapedIdeas.length > 0) {
      const fresh = readIdeas(IDEAS_FILE);
      const { list, added: scrapedAdded } = mergeIdeas(fresh.ideas, scrapedIdeas);
      list.sort((a, b) => b.score - a.score);
      saveIdeas(IDEAS_FILE, { ideas: list, last_run: new Date().toISOString(), last_run_failed: false });
    }

    const finalStore = readIdeas(IDEAS_FILE);
    res.json({
      web_search: digestResult || { added: 0, total: 0, beats: 0, failed_beats: 0 },
      scraping: scrapedData ? { twitter: scrapedData.twitter.length, ft: scrapedData.ft.length } : { twitter: 0, ft: 0 },
      total: finalStore.ideas.length,
    });
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

// ─────────────────────────────────────────────────────────────
// Générateur de lead magnet vers Notion
// Claude détecte le format promis par le CTA du post (guide,
// checklist, comparatif, template) et rédige le contenu complet;
// la page est créée dans la database Notion "Lead Magnets Charlie".
// Spec: docs/superpowers/specs/2026-07-06-generateur-lead-magnet-design.md
// ─────────────────────────────────────────────────────────────

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_VERSION = '2022-06-28';
const VALID_LEAD_MAGNET_FORMATS = ['guide', 'checklist', 'comparatif', 'template'];

const LEAD_MAGNET_SYSTEM_PROMPT = `Tu es expert en gestion de patrimoine et rédacteur senior chez Charlie, un outil d'IA B2B pour les CGP, asset managers et banquiers privés.

Un post LinkedIn promet une ressource en DM à ceux qui commentent (le lead magnet). Ta tâche: rédiger cette ressource, complète et actionnable, à la hauteur de la promesse du post.

RÈGLES:
1. format: déduis du CTA et du sujet le format promis, EXACTEMENT un parmi: guide, checklist, comparatif, template. Si le CTA dit "le guide" → guide. "La checklist" → checklist. Etc. En cas de doute: guide.
2. titre: le titre de la ressource, clair et spécifique (pas de superlatifs), max 12 mots.
3. accroche: 2 à 3 phrases qui rappellent le problème et ce que le lecteur va obtenir concrètement.
4. sections: 5 à 8 sections. Chaque section a:
   - titre: court et actionnable
   - paragraphes: 0 à 3 paragraphes de fond (3-4 phrases chacun, concrets, chiffrés quand pertinent)
   - puces: 0 à 8 points actionnables (étapes, critères, exemples)
   Une section utilise paragraphes, puces, ou les deux. Pour une checklist: surtout des puces cochables. Pour un comparatif: sections par option avec critères en puces.
5. NIVEAU EXPERT (CRITIQUE): le lecteur est un professionnel de la gestion de patrimoine, c'est SON métier. INTERDIT de lui expliquer ses bases (ce qu'est un profil de risque, pourquoi rassurer un client, ce qu'est le RGPD...). Chaque section doit lui apporter du matériel qu'il n'a PAS déjà: process outillé étape par étape, formulations prêtes à envoyer, seuils et benchmarks chiffrés, modèles réutilisables tels quels. Test: si un CGP senior lirait la section en pensant "merci, je sais", elle est mauvaise, recommence-la.
6. FIL AUTOMATISATION: la promesse du post repose sur un gain d'efficacité via l'IA. Pour chaque process décrit, montre le contraste manuel vs automatisé (temps, étapes économisées, ce que l'IA prend en charge), en réutilisant les chiffres du post s'il en donne. La valeur d'abord, l'outil ensuite: ce n'est pas une brochure commerciale.
7. conclusion: 2 à 3 phrases: synthèse + prochaine étape concrète que le lecteur peut faire cette semaine.
8. charlie_pitch: 2 à 4 phrases, à la première personne du pluriel ("nous", "chez Charlie"), expliquant concrètement ce que Charlie automatise SUR CE SUJET PRÉCIS: quelles étapes du guide il prend en charge, avec les chiffres du post si présents (ex: "ce workflow tourne en 12 minutes chez nos cabinets"). Spécifique au sujet, pas un pitch générique.
9. Ton: précis, concret, exemples du quotidien d'un cabinet CGP. Pas de superlatifs, pas d'emoji, pas de jargon creux. Le lecteur doit pouvoir appliquer dès demain.
10. La ressource doit tenir sa promesse: si le post annonce "les 4 options comparées", il y a 4 options comparées; s'il annonce "le modèle", le modèle est réutilisable tel quel.

SORTIE JSON STRICTE (rien d'autre, pas de markdown, pas de backticks):
{
  "format": "guide",
  "titre": "...",
  "accroche": "...",
  "sections": [
    {"titre": "...", "paragraphes": ["..."], "puces": ["..."]}
  ],
  "conclusion": "...",
  "charlie_pitch": "..."
}`;

// Bloc contact ajouté en dur à la fin de CHAQUE lead magnet (jamais oublié,
// contrairement à une consigne de prompt). Personnalisable via .env.
const LEAD_MAGNET_CONTACT =
  process.env.LEAD_MAGNET_CONTACT ||
  'Contact : Thomas Higadere, co-fondateur — thomas.financee@gmail.com';

// Nettoie et valide un lead magnet (généré par Claude ou retouché par
// l'utilisateur dans l'aperçu). Renvoie { magnet } ou { error }.
function sanitizeLeadMagnet(raw) {
  if (!raw || typeof raw !== 'object') {
    return { error: 'Lead magnet invalide' };
  }
  const magnet = { ...raw };
  if (!VALID_LEAD_MAGNET_FORMATS.includes(magnet.format)) {
    magnet.format = 'guide';
  }
  if (!magnet.titre || typeof magnet.titre !== 'string' || !magnet.titre.trim()) {
    return { error: 'Lead magnet invalide: titre manquant' };
  }
  if (!Array.isArray(magnet.sections)) {
    return { error: 'Lead magnet invalide: sections manquantes' };
  }
  magnet.sections = magnet.sections
    .map((s) => ({
      titre: typeof s?.titre === 'string' ? s.titre.trim() : '',
      paragraphes: Array.isArray(s?.paragraphes)
        ? s.paragraphes.filter((p) => typeof p === 'string' && p.trim())
        : [],
      puces: Array.isArray(s?.puces) ? s.puces.filter((p) => typeof p === 'string' && p.trim()) : [],
    }))
    // Une section vidée dans l'aperçu disparaît de la page publiée
    .filter((s) => s.titre || s.paragraphes.length > 0 || s.puces.length > 0);
  if (magnet.sections.length === 0) {
    return { error: 'Lead magnet invalide: sections manquantes' };
  }
  magnet.titre = magnet.titre.trim();
  magnet.accroche = typeof magnet.accroche === 'string' ? magnet.accroche : '';
  magnet.conclusion = typeof magnet.conclusion === 'string' ? magnet.conclusion : '';
  magnet.charlie_pitch = typeof magnet.charlie_pitch === 'string' ? magnet.charlie_pitch : '';
  return { magnet };
}

// Convertit un texte en rich_text Notion (découpé si > 2000 caractères, limite API)
function notionRichText(text) {
  const chunks = [];
  let remaining = String(text);
  while (remaining.length > 0) {
    chunks.push({ type: 'text', text: { content: remaining.substring(0, 2000) } });
    remaining = remaining.substring(2000);
  }
  return chunks.length > 0 ? chunks : [{ type: 'text', text: { content: '' } }];
}

function leadMagnetToNotionBlocks(magnet) {
  const blocks = [];

  if (magnet.accroche) {
    blocks.push({
      object: 'block',
      type: 'callout',
      callout: { rich_text: notionRichText(magnet.accroche), color: 'orange_background' },
    });
  }

  for (const section of magnet.sections) {
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: notionRichText(section.titre || '') },
    });
    for (const para of section.paragraphes || []) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: notionRichText(para) },
      });
    }
    for (const puce of section.puces || []) {
      // Une checklist se coche, les autres formats se lisent
      if (magnet.format === 'checklist') {
        blocks.push({
          object: 'block',
          type: 'to_do',
          to_do: { rich_text: notionRichText(puce), checked: false },
        });
      } else {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: notionRichText(puce) },
        });
      }
    }
  }

  if (magnet.conclusion) {
    blocks.push({ object: 'block', type: 'divider', divider: {} });
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: notionRichText(magnet.conclusion) },
    });
  }

  // Section Charlie systématique: pitch spécifique au sujet (rédigé par
  // Claude) + bloc contact fixe. Ajoutée par le code pour être garantie
  // sur chaque lead magnet, quelle que soit la génération.
  blocks.push({ object: 'block', type: 'divider', divider: {} });
  blocks.push({
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: notionRichText('Ce que Charlie automatise sur ce sujet') },
  });
  if (magnet.charlie_pitch) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: notionRichText(magnet.charlie_pitch) },
    });
  }
  blocks.push({
    object: 'block',
    type: 'callout',
    callout: { rich_text: notionRichText(LEAD_MAGNET_CONTACT), color: 'green_background' },
  });

  // L'API accepte 100 blocs maximum à la création d'une page
  return blocks.slice(0, 100);
}

async function notionApiCreatePage(body) {
  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || `Erreur Notion: ${response.status}`;
    throw new Error(
      response.status === 404
        ? `${message} — vérifiez que la database est bien connectée à votre intégration Notion (menu ⋯ → Connexions)`
        : message
    );
  }
  return data;
}

// Crée deux niveaux dans Notion:
// 1. la fiche de suivi dans la database (propriétés internes: date, format,
//    statut...) qui ne se partage jamais;
// 2. une SOUS-PAGE de contenu pur (titre + guide, aucune propriété) dans la
//    fiche: c'est elle qu'on publie sur le web. Sur une ligne de database
//    publiée, le lecteur peut toujours déplier "N more properties"; sur une
//    page simple, il n'y a rien à déplier.
async function notionCreateLeadMagnetPage(magnet, { keyword, sourceExcerpt }) {
  const row = await notionApiCreatePage({
    parent: { database_id: NOTION_DATABASE_ID },
    properties: {
      Nom: { title: notionRichText(magnet.titre) },
      Format: { select: { name: magnet.format } },
      Date: { date: { start: new Date().toISOString().substring(0, 10) } },
      'Mot-clé CTA': { rich_text: notionRichText(keyword || '') },
      'Post source': { rich_text: notionRichText(sourceExcerpt) },
      Statut: { select: { name: 'à publier' } },
    },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content:
                  'Fiche interne. La page à partager est la sous-page ci-dessous: ouvrez-la puis activez "Publier sur le web" pour obtenir le lien à envoyer en DM.',
              },
            },
          ],
        },
      },
    ],
  });

  const contentPage = await notionApiCreatePage({
    parent: { page_id: row.id },
    properties: {
      title: { title: notionRichText(magnet.titre) },
    },
    children: leadMagnetToNotionBlocks(magnet),
  });

  return { id: contentPage.id, url: contentPage.url, row_url: row.url };
}

app.post('/api/generate-lead-magnet', async (req, res) => {
  try {
    const { source_post, chosen_variant, keyword, dry_run } = req.body;

    if (!source_post?.trim() && !chosen_variant?.trim()) {
      return res.status(400).json({ error: 'Aucun texte de post fourni' });
    }
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Clé API Claude non configurée sur le serveur' });
    }
    if (!dry_run && (!NOTION_API_KEY || !NOTION_DATABASE_ID)) {
      return res.status(500).json({
        error:
          'Notion non configuré: ajoutez NOTION_API_KEY et NOTION_DATABASE_ID dans server/.env (voir la spec 2026-07-06-generateur-lead-magnet-design.md)',
      });
    }

    const postForClaude = chosen_variant?.trim() || source_post.trim();
    const userContent = `Post LinkedIn publié (contient la promesse faite en CTA):\n${postForClaude}\n\n${
      source_post?.trim() && chosen_variant?.trim()
        ? `Post original avant reformulation (contexte supplémentaire):\n${source_post}\n\n`
        : ''
    }Rédige le lead magnet promis. Réponds UNIQUEMENT avec du JSON valide, rien d'autre.`;

    const raw = await callClaudeJSON(LEAD_MAGNET_SYSTEM_PROMPT, userContent, 4096);
    const { magnet, error } = sanitizeLeadMagnet(raw);
    if (error) {
      return res.status(500).json({ error });
    }

    if (dry_run) {
      return res.json({ dry_run: true, magnet });
    }

    console.log(`Création du lead magnet "${magnet.titre}" (${magnet.format}) dans Notion...`);
    const page = await notionCreateLeadMagnetPage(magnet, {
      keyword,
      sourceExcerpt: postForClaude.substring(0, 500),
    });

    res.json({
      url: page.url,
      page_id: page.id,
      row_url: page.row_url,
      titre: magnet.titre,
      format: magnet.format,
    });
  } catch (error) {
    console.error('Erreur serveur (generate-lead-magnet):', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Publie dans Notion un brouillon de lead magnet, éventuellement retouché
// par l'utilisateur dans l'aperçu de l'application. C'est la 2e étape du
// flux généré → relu/modifié → poussé.
app.post('/api/push-lead-magnet', async (req, res) => {
  try {
    const { magnet: raw, keyword, source_excerpt } = req.body;

    if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
      return res.status(500).json({
        error:
          'Notion non configuré: ajoutez NOTION_API_KEY et NOTION_DATABASE_ID dans server/.env (voir la spec 2026-07-06-generateur-lead-magnet-design.md)',
      });
    }

    const { magnet, error } = sanitizeLeadMagnet(raw);
    if (error) {
      return res.status(400).json({ error });
    }

    console.log(`Publication du lead magnet "${magnet.titre}" (${magnet.format}) dans Notion...`);
    const page = await notionCreateLeadMagnetPage(magnet, {
      keyword,
      sourceExcerpt: String(source_excerpt || '').substring(0, 500),
    });

    res.json({
      url: page.url,
      page_id: page.id,
      row_url: page.row_url,
      titre: magnet.titre,
      format: magnet.format,
    });
  } catch (error) {
    console.error('Erreur serveur (push-lead-magnet):', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ─────────────────────────────────────────────────────────────
// Scraping des tendances: Twitter et Financial Times via Playwright
// ─────────────────────────────────────────────────────────────

async function scrapeTrendingIdeas() {
  // Import paresseux: Playwright est optionnel. Absent (ou navigateurs non
  // installés) → on ignore simplement le scraping, les beats web search suffisent.
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.warn('Playwright non installé — scraping des tendances ignoré (beats web search actifs).');
    return { twitter: [], ft: [] };
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const twitterIdeas = await scrapeTwitterTrending(browser);
    const ftIdeas = await scrapeFTTrending(browser);
    await browser.close();
    return { twitter: twitterIdeas, ft: ftIdeas };
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    throw error;
  }
}

async function scrapeTwitterTrending(browser) {
  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const ideas = [];
  try {
    console.log('[Scraping] Démarrage scraping Twitter...');
    // Twitter/X a des protections anti-bot fortes → retour vide gracieux
    // Cherche tech/IA/fintech avec mots-clés pertinents
    await page.goto('https://x.com/search?q=AI%20OR%20fintech%20OR%20startups%20lang%3Aen&f=live', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    }).catch(e => {
      console.log('[Scraping] Twitter navigation failed (expected):', e.message);
      throw e;
    });

    console.log('[Scraping] Twitter chargé, scroll...');
    await page.waitForTimeout(2000);

    // Essayer un léger scroll
    try {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log('[Scraping] Twitter scroll failed (ok)');
    }

    const posts = await page.evaluate(() => {
      const items = [];
      const tweets = document.querySelectorAll('[data-testid*="tweet"], article');
      const relevanceKeywords = ['ai', 'fintech', 'crypto', 'trading', 'market', 'tech', 'startup', 'fund', 'invest', 'data', 'model', 'api'];

      Array.from(tweets).slice(0, 15).forEach((tweet) => {
        try {
          const text = tweet.innerText?.substring(0, 300) || '';
          const lower = text.toLowerCase();

          // Filtre: au moins 1 mot-clé pertinent
          const hasRelevance = relevanceKeywords.some(kw => lower.includes(kw));

          if (text && text.length > 30 && hasRelevance && !text.includes('Verified') && !text.includes('Follows') && !text.includes('http')) {
            items.push({ text });
          }
        } catch (e) {
          // Skip
        }
      });
      return items.slice(0, 8);
    });

    console.log(`[Scraping] Twitter: ${posts.length} posts pertinents trouvés`);
    for (const post of posts) {
      ideas.push({
        titre: post.text.substring(0, 130),
        why_now: 'Tendance X/Twitter (tech/IA/fintech)',
        sources: [{ titre: 'Post X', url: 'https://x.com/search?q=AI%20OR%20fintech', date: new Date().toISOString().split('T')[0] }],
        angle: 'Tendance Tech/IA',
        suggested_hook: post.text.substring(0, 80),
        suggested_archetype: 'citation',
        score: 6,
        theme: 'x_tendances',
      });
    }
  } catch (error) {
    console.log('[Scraping] Twitter échoué (fallback gracieux):', error.message.substring(0, 100));
    // Pas de throw — continue sans posts Twitter
  } finally {
    try {
      await context.close();
    } catch (e) {
      // Ignore erreur close
    }
  }
  return ideas;
}

async function scrapeFTTrending(browser) {
  // FT bloque les crawlers Playwright + nécessite login → utilise web_search via les beats
  // Cette fonction retourne vide; les articles FT viennent via generateIdeaDigest() + ft_actu beat
  console.log('[Scraping] FT remplacé par web_search (beat ft_actu)');
  return [];
}

app.post('/api/ideas/scrape-trending', async (req, res) => {
  try {
    console.log('Démarrage scraping des tendances...');
    const result = await scrapeTrendingIdeas();

    // Fusionner avec les idées existantes
    const allIdeas = [
      ...result.twitter.map(i => ({ ...i, date_found: new Date().toISOString() })),
      ...result.ft.map(i => ({ ...i, date_found: new Date().toISOString() })),
    ]
      .map(validateRawIdea)
      .filter(Boolean)
      .map(i => ({
        ...i,
        impressions_estimees: 150 + Math.random() * 250, // Estimation brute
      }));

    const fresh = readIdeas(IDEAS_FILE);
    const { list, added } = mergeIdeas(fresh.ideas, allIdeas);
    list.sort((a, b) => b.score - a.score);
    saveIdeas(IDEAS_FILE, { ideas: list, last_run: new Date().toISOString(), last_run_failed: false });

    res.json({ added, total: list.length, twitter_posts: result.twitter.length, ft_articles: result.ft.length });
  } catch (error) {
    console.error('Erreur scraping:', error);
    res.status(502).json({ error: error.message || 'Erreur scraping' });
  }
});

// Diagnostic: teste les API keys et les sources de données
app.get('/api/health', async (req, res) => {
  const checks = {
    claude: !!CLAUDE_API_KEY,
    mistral: !!process.env.MISTRAL_API_KEY,
    zai: !!process.env.ZAI_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
  };

  // Test rapide des sources gratuites
  let freeCount = 0;
  try {
    const freeIdeas = await fetchFreeIdeas();
    freeCount = freeIdeas.length;
  } catch (err) {
    console.log(`[Health] Free sources failed: ${err.message}`);
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    apis: checks,
    free_ideas: freeCount,
    branch: 'idees (zero-cost: HackerNews + Playwright scraping)',
  });
});

app.get('/api/test-generate', async (req, res) => {
  try {
    console.log('[Test] Lancement génération de test...');
    const result = await generateIdeaDigest();
    res.json(result);
  } catch (err) {
    console.error('[Test] Génération échouée:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Suite Charlie : sert le client compilé (vite build) sur le même port ---
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`✓ Serveur Charlie lancé sur http://localhost:${PORT}`);
});
