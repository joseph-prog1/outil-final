import type { WinningPost } from '../types/index';
import { isValidWinningPost } from './learningStats';

const STOPWORDS_FR = new Set([
  'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'a', 'au', 'aux',
  'en', 'pour', 'par', 'sur', 'dans', 'avec', 'sans', 'ce', 'ces', 'cette',
  'qui', 'que', 'quoi', 'dont', 'ou', 'est', 'sont', 'etre', 'avoir',
  'ont', 'plus', 'moins', 'tres', 'pas', 'ne', 'se', 'sa', 'son', 'ses',
  'nous', 'vous', 'ils', 'elles', 'il', 'elle', 'on', 'je', 'tu', 'mais',
  'donc', 'or', 'ni', 'car', 'comme', 'si', 'tout', 'tous', 'toute', 'toutes',
]);

function extractSignificantWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]+/g) || [];

  return new Set(words.filter((word) => word.length > 3 && !STOPWORDS_FR.has(word)));
}

export function findClosestWinningPosts(
  postText: string,
  winningPosts: WinningPost[],
  topN: number = 3
): WinningPost[] {
  const targetWords = extractSignificantWords(postText);

  if (targetWords.size === 0) {
    return [];
  }

  const scored = winningPosts
    .filter(isValidWinningPost)
    .map((post) => {
      const postWords = extractSignificantWords(`${post.analysis.angle} ${post.post_text}`);
      const overlap = [...targetWords].filter((word) => postWords.has(word)).length;
      return { post, overlap };
    })
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);

  return scored.slice(0, topN).map((entry) => entry.post);
}
