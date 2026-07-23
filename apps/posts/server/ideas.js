// server/ideas.js
// Logique pure du générateur d'idées de posts (aucun effet de bord réseau).
// Isolé de index.js pour être testable via `node --test`.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const IDEA_THEMES = ['ia', 'reglementation', 'data_officielle', 'marche_patrimoine', 'tendances'];

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

// Beats de veille: un "sous-agent" par angle, façon veille parallèle. Chaque
// beat déclenche un appel web dédié (rapide car ciblé) plutôt qu'un seul appel
// géant qui couvre tout et dépasse le budget de temps (~5 min de l'API).
// 5 beats (fusionnés pour maîtriser le coût: chaque beat = 1 appel web search).
export const IDEA_BEATS = [
  { key: 'ia', theme: 'ia', label: 'IA', focus: "sorties et annonces des grands laboratoires d'IA (Anthropic/Claude, OpenAI, Google/Gemini, Mistral) ET IA appliquée à la gestion de patrimoine (wealthtech, agents IA pour conseillers, déploiements en banque privée / cabinets CGP, chiffres d'adoption)" },
  { key: 'reglementation', theme: 'reglementation', label: 'Régulation & conformité', focus: "régulateurs et conformité en France : AMF, ACPR, MiFID II, DDA, LCB-FT/KYC, AI Act côté finance, sanctions et positions récentes qui touchent les CGP" },
  { key: 'data_officielle', theme: 'data_officielle', label: 'Data officielle', focus: "data publique et sources officielles françaises : data.gouv, INSEE, Pappers, SIRENE, BODACC, INPI, DVF — nouveaux jeux de données, API, ouvertures, exploitables pour la due diligence, le KYC ou la prospection patrimoniale" },
  { key: 'marche_patrimoine', theme: 'marche_patrimoine', label: 'Marché & patrimoine', focus: "fiscalité et enveloppes patrimoniales françaises (assurance-vie, PER, loi de finances, immobilier SCPI/LMNP/IFI, donation/succession) ET marchés/macro pertinents pour le patrimoine (taux BCE, actions, or, private equity, produits structurés, crypto)" },
  // "Tendances": fusion de l'ancienne veille X + Financial Times + fintech intl.
  // Restreint à une allow-list de sources bien indexées (on retire ft.com, bloqué
  // par le crawler d'Anthropic, et x.com, mal indexé) pour une recherche fiable.
  {
    key: 'tendances',
    theme: 'tendances',
    label: 'Tendances tech & finance',
    allowedDomains: ['sifted.eu', 'finextra.com', 'tech.eu', 'anthropic.com', 'openai.com', 'mistral.ai'],
    focus: "tendances et actus marquantes en tech, IA, fintech, wealthtech, startups et marchés à l'international, transposables au patrimoine : levées et lancements (Sifted, Tech.eu), infrastructure et data financière (Finextra), nouveaux modèles des labos (Anthropic, OpenAI, Mistral)",
    extra: "Appuie-toi sur Sifted, Finextra, Tech.eu et les blogs officiels des labos. Pour chaque idée, mets en source l'URL de l'article/annonce avec sa date de publication.",
  },
];

// Prompt d'UN beat: veille ciblée sur un seul angle, fenêtre datée, quelques
// idées. Appelé une fois par beat, en parallèle (voir generateIdeaDigest).
// Le thème n'est PAS demandé au modèle: il est imposé côté serveur par le beat.
export function buildBeatPrompt({ beat, winningTopics, seenTitles, todayISO, sinceISO, days = 14, perBeat = 3 }) {
  const topics = (winningTopics || []).slice(0, 10).map((t) => `- ${t}`).join('\n') || '- (aucun pattern encore)';
  const seen = (seenTitles || []).slice(0, 50).map((t) => `- ${t}`).join('\n') || '(aucun)';
  // Ancre temporelle: sans la date du jour, Claude juge la fraîcheur d'après sa
  // mémoire interne (cutoff ~janvier 2026) et remonte de vieux articles.
  const dateBloc = todayISO
    ? `Nous sommes aujourd'hui le ${todayISO} — sers-toi de cette date (jamais de ta mémoire) pour juger la fraîcheur. Cherche en priorité des actualités des ${days} derniers jours (depuis le ${sinceISO}), et donne pour chaque idée la date de publication réelle de sa source.`
    : `Actualités récentes uniquement, datées, via la recherche web — jamais de mémoire.`;
  const system = `Tu es un veilleur growth LinkedIn pour un compte B2B en gestion de patrimoine (CGP, banquiers privés, asset managers). Sur UN angle précis, tu trouves via la recherche web des actualités fraîches et tu en fais des idées de posts qui ont des chances de performer.

ANGLE DE CE BEAT: ${beat.focus}.
${beat.extra ? `\n${beat.extra}\n` : ''}
${dateBloc}

SUJETS QUI SURPERFORMENT chez ce compte (rapproche-t'en quand c'est pertinent):
${topics}

Fais 1 à 2 recherches web ciblées sur cet angle, puis propose ${perBeat} idées MAXIMUM (moins si l'actu est calme — ne force pas, n'invente jamais de source ni de date). Pour chaque idée: une actu RÉELLE et VÉRIFIABLE (source web avec URL fonctionnelle + date de publication), un angle concret pour un CGP, une accroche.

NE PROPOSE PAS ces sujets déjà remontés récemment:
${seen}

SORTIE JSON STRICTE (rien d'autre, pas de markdown, pas de backticks):
{"ideas": [
  {"titre": "idée de post en 1 ligne", "why_now": "1 phrase", "sources": [{"titre": "titre article", "url": "https://...", "date": "AAAA-MM-JJ"}], "angle": "angle CGP concret", "suggested_hook": "accroche ~140 caracteres", "suggested_archetype": "un de: versus,partenariat,workflow,diagramme_produit,mockup_iphone,bar_chart,typo_geante,icone_3d", "score": 8}
]}`;
  const user = `${todayISO ? `Nous sommes le ${todayISO}. ` : ''}Trouve jusqu'à ${perBeat} idées de posts sur cet angle (${beat.label}), publiées ces ${days} derniers jours si possible. Fais de vraies recherches web datées. Réponds UNIQUEMENT avec du JSON valide.`;
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
