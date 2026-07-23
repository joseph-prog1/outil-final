import type { StyleViolation } from '../types/index';

export const STYLE_RULES = {
  forbiddenChars: ['-', '—'],
  bannedWords: [
    'meilleur',
    'incroyable',
    'révolutionnaire',
    'magique',
    'miracle',
    'exceptionnel',
    'génial',
    'merveilleux',
    'formidable',
    'fantastique',
    'extraordinaire',
    'unique',
    'jamais vu',
    'prouver',
    'garantir',
    'certain',
  ],
  hook: { minLength: 10, maxLength: 200 },
  post: { maxLength: 700 }, // ✅ 700 caractères max pour LinkedIn
};

export function validateStyle(text: string): StyleViolation[] {
  const violations: StyleViolation[] = [];

  // Check for forbidden characters
  for (const char of STYLE_RULES.forbiddenChars) {
    if (text.includes(char)) {
      violations.push({
        rule: 'no-dashes',
        severity: 'error',
        message: `Contient caractère interdit "${char}"`,
        fix: `Retirez "${char}" et réécrivez en prose`,
      });
    }
  }

  // Check for banned words
  const lowerText = text.toLowerCase();
  for (const word of STYLE_RULES.bannedWords) {
    if (lowerText.includes(word)) {
      violations.push({
        rule: 'no-superlatives',
        severity: 'warning',
        message: `Contient mot banni "${word}"`,
        fix: `Remplacez par des données spécifiques ou un exemple`,
      });
    }
  }

  // Check length
  if (text.length > STYLE_RULES.post.maxLength) {
    violations.push({
      rule: 'post-length',
      severity: 'error',
      message: `Post trop long (${text.length} > ${STYLE_RULES.post.maxLength})`,
    });
  }

  return violations;
}
