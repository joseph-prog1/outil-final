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

export type LessonCategory = 'ton' | 'structure' | 'hook' | 'cta' | 'vocabulaire' | 'longueur' | 'autre';

export interface Lesson {
  id: string;
  rule_text: string;
  category: LessonCategory;
  source_instruction: string;
  occurrences: number;
  date_added: string;
  date_last_seen: string;
}

export interface DistilledLesson {
  generalizable: boolean;
  rule_text: string | null;
  category: LessonCategory | null;
  matched_rule_id: string | null;
}

export interface ConsolidatedLesson {
  rule_text: string;
  category: LessonCategory;
  occurrences: number;
}

// Hook candidat proposé avant reformulation (un biais cognitif
// différent par hook, intensité graduée de 1 doux à 5 agressif)
export interface HookProposal {
  text: string;
  biais: 'curiosite' | 'peur' | 'suspense' | 'preuve_sociale' | 'urgence' | 'contre_intuitif' | 'autorite' | string;
  // L'un des 8 désirs humains fondamentaux (LF8) que le hook active
  desir?: 'survie' | 'plaisir_de_vivre' | 'acceptation_sociale' | 'desirabilite' | 'liberation_peur' | 'confort_clarte' | 'statut_percu' | 'protection_clan' | string;
  desir_label?: string;
  intensite: number;
}

// Use case CGP concret proposé en amont: l'angle métier sur lequel
// ancrer les variantes (relation client, conformité, portefeuille...)
export interface UseCaseProposal {
  titre: string;
  description: string;
}

// Pré-brief complet généré automatiquement dès que le post est collé
export interface PreBrief {
  hooks: HookProposal[];
  useCases: UseCaseProposal[];
}

// ─── Bibliothèque ────────────────────────────────────────────
// Chaque post travaillé est archivé: original, variantes, variante
// retenue, miniatures générées. Persisté dans IndexedDB (store 'library').

export interface LibraryThumbnail {
  // Data URL de l'image (autonome: survit à l'export/import JSON)
  url: string;
  archetype?: string | null;
}

// Lead magnet généré dans Notion pour un post de la bibliothèque
export interface LeadMagnetRef {
  url: string;
  titre: string;
  format: 'guide' | 'checklist' | 'comparatif' | 'template' | string;
  date: string;
}

// Brouillon de lead magnet: généré par Claude, relu et modifié dans
// l'aperçu de l'application, puis poussé vers Notion
export interface LeadMagnetSection {
  titre: string;
  paragraphes: string[];
  puces: string[];
}

export interface LeadMagnetDraft {
  format: 'guide' | 'checklist' | 'comparatif' | 'template' | string;
  titre: string;
  accroche: string;
  sections: LeadMagnetSection[];
  conclusion: string;
  charlie_pitch: string;
}

export interface LibraryEntry {
  id: string;
  date_creation: string;
  date_updated: string;
  source_post: string;
  // null pour une entrée créée depuis le générateur de miniatures seul
  variants: [string, string, string] | null;
  chosen_index: number | null;
  angle: string;
  trigger_emotionnel: string;
  keyword: string;
  thumbnails: LibraryThumbnail[];
  lead_magnet?: LeadMagnetRef | null;
}

// Fichier de sauvegarde complet (bibliothèque + apprentissage)
export interface CharlieBackup {
  type: 'charlie-backup';
  version: 1;
  date: string;
  stores: Record<string, unknown[]>;
}

// ─── Stats LinkedIn ──────────────────────────────────────────
// Posts réels (scrapés ou importés depuis l'export analytics officiel),
// stockés côté serveur dans /data. Servent à détecter les patterns
// gagnants et à entraîner les générations.

export interface LinkedInPostStats {
  impressions?: number;
  engagements?: number;
  reactions?: number;
  comments?: number;
  reposts?: number;
  engagement_rate?: number;
}

export interface LinkedInPost {
  id: string;
  url: string;
  url_key: string;
  author: string;
  date: string | null;
  text: string;
  thumbnail_url: string | null;
  stats: LinkedInPostStats;
  sources: string[];
}

export interface PatternsReport {
  resume: string;
  patterns: { titre: string; detail: string }[];
  sujets_gagnants: string[];
  regles: { rule_text: string; category: string }[];
}

export interface VisualPatternsReport {
  resume: string;
  regles: string[];
  archetypes_gagnants: string[];
  analyzed?: number;
}

export interface ArchetypeScore {
  archetype: string;
  avg: number;
  count: number;
}

export interface MatchingReport {
  sample: number;
  topics: Record<string, ArchetypeScore[]>;
  overall: ArchetypeScore[];
}

// ─── Prédiction de performance ───────────────────────────────
// Score /10 par variante + fourchette d'impressions calibrée sur les
// vrais posts, calculé côté serveur avant publication.
export interface PerformancePrediction {
  index: number;
  score: number;
  sujet: string | null;
  breakdown: { hook?: number; sujet?: number; structure?: number; longueur?: number } | null;
  raison: string;
  leviers: string[];
  impressions: { low: number; high: number } | null;
}

export interface PredictionResponse {
  predictions: PerformancePrediction[];
  best_index: number | null;
  has_benchmark: boolean;
  sample_size: number;
}

export interface WeekdayPerf {
  weekday: string;
  avg_impressions: number;
  posts: number;
}

export interface AnalyticsDashboard {
  followers_total: number | null;
  followers_gained: number | null;
  summary: { impressions: number; members_reached: number };
  weekday_performance: WeekdayPerf[];
  best_day: WeekdayPerf | null;
  demographics: Record<string, { value: string; percentage: number }[]>;
  engagement_daily: { date: string; impressions: number; engagements: number }[];
  has_data: boolean;
}

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
