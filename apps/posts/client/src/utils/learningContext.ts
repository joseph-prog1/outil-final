import type { WinningPost, HookEntry, Lesson } from '../types/index';
import { computeLearningStats, type LearningStats } from './learningStats';
import { findClosestWinningPosts } from './learningRetrieval';
import { formatLessonsSection } from './lessonEngine';

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
  hookEntries?: HookEntry[],
  lessons?: Lesson[]
): string {
  const parts: string[] = [];

  // Les règles apprises passent en premier: ce sont des préférences
  // explicites de l'utilisateur, prioritaires sur les patterns statistiques
  if (lessons && lessons.length > 0) {
    const lessonsText = formatLessonsSection(lessons);
    if (lessonsText) {
      parts.push(lessonsText);
    }
  }

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

Instructions: Utilise ces éléments comme référence pour comprendre ce qui marche. Applique les mêmes patterns (types de hook/corps/CTA dominants, triggers émotionnels) aux reformulations. Respecte en priorité les règles apprises des corrections de l'utilisateur si elles sont présentes.
`;
}
