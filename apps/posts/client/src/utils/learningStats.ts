import type { WinningPost } from '../types/index';
import {
  HOOK_TYPES,
  CORPS_TYPES,
  CTA_TYPES,
  TRIGGER_TYPES,
  type HookType,
  type CorpsType,
  type CtaType,
  type TriggerType,
} from './analysisTaxonomy';

const MIN_POSTS_FOR_STATS = 5;

export interface LearningStats {
  totalPosts: number;
  hookTypeFrequency: Array<{ value: HookType; percentage: number }>;
  corpsTypeFrequency: Array<{ value: CorpsType; percentage: number }>;
  ctaTypeFrequency: Array<{ value: CtaType; percentage: number }>;
  triggerFrequency: Array<{ value: TriggerType; percentage: number }>;
}

export function isValidWinningPost(post: WinningPost): boolean {
  return (
    !!post.analysis &&
    (HOOK_TYPES as readonly string[]).includes(post.analysis.hook_type) &&
    (CORPS_TYPES as readonly string[]).includes(post.analysis.corps_type) &&
    (CTA_TYPES as readonly string[]).includes(post.analysis.cta_type) &&
    (TRIGGER_TYPES as readonly string[]).includes(post.analysis.trigger_emotionnel)
  );
}

function frequencyOf<T extends string>(
  values: T[],
  allValues: readonly T[]
): Array<{ value: T; percentage: number }> {
  const total = values.length;
  return allValues
    .map((value) => ({
      value,
      percentage: total === 0 ? 0 : Math.round((values.filter((v) => v === value).length / total) * 100),
    }))
    .filter((entry) => entry.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage);
}

export function computeLearningStats(winningPosts: WinningPost[]): LearningStats | null {
  const validPosts = winningPosts.filter(isValidWinningPost);

  if (validPosts.length < MIN_POSTS_FOR_STATS) {
    return null;
  }

  return {
    totalPosts: validPosts.length,
    hookTypeFrequency: frequencyOf(validPosts.map((p) => p.analysis.hook_type), HOOK_TYPES),
    corpsTypeFrequency: frequencyOf(validPosts.map((p) => p.analysis.corps_type), CORPS_TYPES),
    ctaTypeFrequency: frequencyOf(validPosts.map((p) => p.analysis.cta_type), CTA_TYPES),
    triggerFrequency: frequencyOf(validPosts.map((p) => p.analysis.trigger_emotionnel), TRIGGER_TYPES),
  };
}
