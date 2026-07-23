// Déduit un SUJET parlant à partir du texte du post sous lequel la personne a
// commenté (postContext, capté par le scraper). Le sujet est inséré dans le DM
// de relance : « Avez-vous eu l'occasion de consulter le document sur {sujet} ? »
// — il doit donc être une locution nominale naturelle, pas un extrait brut.
//
// Détection par règles thématiques (gratuit, local, déterministe) : les posts
// de Charlie tournent tous autour de l'IA pour les professionnels du patrimoine,
// la première règle qui matche gagne (de la plus spécifique à la plus générale).
// Module PUR (aucun accès disque) : importable côté serveur ET côté client
// (la page Profils l'utilise pour afficher le sujet avant confirmation).

function strip(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// [test(texte normalisé) -> bool, sujet]
const RULES = [
  // « voici les 4 process que nous pouvons automatiser… »
  [(t) => /automatis/.test(t) && /(patrimoine|patrimonia|cgp)/.test(t),
    "l'automatisation des process en gestion de patrimoine"],
  // « l'un des meilleurs modèles d'IA du marché… conseillers patrimoniaux »
  [(t) => /modele/.test(t) && /\bia\b|intelligence artificielle/.test(t),
    "les modèles d'IA pour les conseillers patrimoniaux"],
  // RGPD / conformité
  [(t) => /rgpd|conformite|reglement/.test(t),
    'la conformité RGPD pour les CGP'],
  // Agents IA
  [(t) => /agents? ia|agents? d.intelligence/.test(t) && /(patrimoine|cgp|cabinet)/.test(t),
    'les agents IA pour les cabinets de gestion de patrimoine'],
  // IA + patrimoine (générique)
  [(t) => /\bia\b|intelligence artificielle/.test(t) && /(patrimoine|patrimonia|cgp|conseiller|gestion)/.test(t),
    "l'IA dans la gestion de patrimoine"],
  // IA seule
  [(t) => /\bia\b|intelligence artificielle/.test(t),
    "l'IA pour votre cabinet"],
];

// Thème de repli : le cœur de métier de Charlie — toujours sensé pour cette
// audience, même si le texte du post est absent ou méconnaissable.
const FALLBACK = "l'IA dans la gestion de patrimoine";

function deriveSujet(postContext) {
  const t = strip(postContext);
  if (!t.trim()) return FALLBACK;
  for (const [test, sujet] of RULES) {
    if (test(t)) return sujet;
  }
  return FALLBACK;
}

module.exports = { deriveSujet, FALLBACK };
