import { useState } from 'react';
import { validateStyle } from '../utils/styleRules';
import type { StyleViolation } from '../types/index';

export function useStyleLinter() {
  const [violations, setViolations] = useState<StyleViolation[]>([]);

  const lint = (variants: [string, string, string]) => {
    const results: StyleViolation[] = [];

    // Valide chaque variante séparément
    variants.forEach((text, index) => {
      const variantViolations = validateStyle(text);
      // Ajoute l'index de la variante au message pour clarifier
      variantViolations.forEach(v => {
        results.push({
          ...v,
          message: `Variante ${index + 1}: ${v.message}`,
        });
      });
    });

    setViolations(results);
    return results;
  };

  const clear = () => {
    setViolations([]);
  };

  const hasErrors = violations.some(v => v.severity === 'error');

  return { violations, lint, clear, hasErrors };
}
