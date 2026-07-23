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
