// Mapping métier (job_title du CSV) → persona
export function mapJobTitle(jobTitle: string): string {
  const t = (jobTitle || '').toLowerCase();
  if (!t || t.includes('non renseigné')) return 'autre';
  if (
    t.includes('gestion de patrimoine') ||
    t.includes('gestion de fortune') ||
    t.includes('investissements financiers') ||
    t.includes('cif')
  )
    return 'cgp';
  if (t.includes('banquier')) return 'banquier_prive';
  if (t.includes('family office')) return 'family_office';
  if (t.includes('gérant') || t.includes('gerant') || t.includes('portefeuille')) return 'gerant';
  if (
    t.includes('assur') ||
    t.includes('courtier') ||
    t.includes('protection sociale') ||
    t.includes('prévoyance') ||
    t.includes('prevoyance') ||
    t.includes('retraite')
  )
    return 'assureur';
  return 'autre';
}

// Mapping document_slug (lead magnet téléchargé) → thème lisible pour l'email 1
const SLUG_THEMES: Array<[RegExp, string]> = [
  [/prospect|lemlist|sourcing/, 'la prospection patrimoniale'],
  [/pappers|data|normaliser/, 'l’exploitation des données (Pappers, data.gouv)'],
  [/reporting|bilan|suiviclient/, 'le reporting client'],
  [/propale|proposal|proposition/, 'les propositions d’investissement'],
  [/agent|bot|mcp|claude|mistral|perplexity|fable|infra|ia|12skills|conseilleraugmente/, 'les agents IA pour la gestion de patrimoine'],
  [/rgpd/, 'le RGPD appliqué à la gestion de patrimoine'],
  [/holding|frais|sf/, 'l’optimisation patrimoniale'],
  [/pennylane|comptab/, 'les outils de gestion'],
];

export function slugTheme(slug: string): string {
  const s = (slug || '').toLowerCase();
  for (const [re, label] of SLUG_THEMES) if (re.test(s)) return label;
  return 'l’IA pour la gestion de patrimoine';
}
