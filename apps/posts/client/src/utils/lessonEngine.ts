import type { Lesson, DistilledLesson, ConsolidatedLesson } from '../types/index';

// Au-delà de ce nombre de leçons, on déclenche une consolidation LLM
// (fusion des doublons, résolution des contradictions, max 10 règles)
export const CONSOLIDATION_THRESHOLD = 12;

// Nombre maximum de règles injectées dans le contexte d'apprentissage
export const MAX_INJECTED_LESSONS = 8;

export function sortLessonsByStrength(lessons: Lesson[]): Lesson[] {
  return [...lessons].sort(
    (a, b) =>
      b.occurrences - a.occurrences ||
      new Date(b.date_last_seen).getTime() - new Date(a.date_last_seen).getTime()
  );
}

export function formatLessonsSection(lessons: Lesson[]): string {
  if (lessons.length === 0) return '';

  const top = sortLessonsByStrength(lessons).slice(0, MAX_INJECTED_LESSONS);
  const lines = top
    .map(
      (lesson, idx) =>
        `${idx + 1}. ${lesson.rule_text}${lesson.occurrences > 1 ? ` (exprimé ${lesson.occurrences} fois)` : ''}`
    )
    .join('\n');

  return `RÈGLES APPRISES DES CORRECTIONS DE L'UTILISATEUR (à respecter en priorité):\n${lines}`;
}

// Transforme le résultat de la distillation en leçon à persister:
// incrémente la règle existante si Claude a reconnu la même idée,
// sinon crée une nouvelle leçon
export function applyDistillation(
  distilled: DistilledLesson,
  sourceInstruction: string,
  existingLessons: Lesson[]
): Lesson {
  const now = new Date().toISOString();

  if (distilled.matched_rule_id) {
    const match = existingLessons.find((l) => l.id === distilled.matched_rule_id);
    if (match) {
      return {
        ...match,
        rule_text: distilled.rule_text || match.rule_text,
        occurrences: match.occurrences + 1,
        source_instruction: sourceInstruction,
        date_last_seen: now,
      };
    }
  }

  return {
    id: `lesson-${Date.now()}`,
    rule_text: distilled.rule_text || sourceInstruction,
    category: distilled.category || 'autre',
    source_instruction: sourceInstruction,
    occurrences: 1,
    date_added: now,
    date_last_seen: now,
  };
}

// Reconstruit les leçons après consolidation LLM (nouveaux ids et dates)
export function rebuildFromConsolidation(consolidated: ConsolidatedLesson[]): Lesson[] {
  const now = new Date().toISOString();
  return consolidated.map((c, idx) => ({
    id: `lesson-${Date.now()}-${idx}`,
    rule_text: c.rule_text,
    category: c.category,
    source_instruction: '(consolidation automatique)',
    occurrences: c.occurrences,
    date_added: now,
    date_last_seen: now,
  }));
}
