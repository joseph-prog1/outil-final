import type {
  ReformulationResponse,
  WinningPostAnalysis,
  Lesson,
  DistilledLesson,
  ConsolidatedLesson,
} from '../types/index';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';

export function useClaudeAPI() {
  const reformulate = async (
    postText: string,
    learningContext?: string,
    imposedHook?: string,
    imposedUseCase?: string,
    sourceContext?: string
  ): Promise<ReformulationResponse> => {
    if (!postText.trim()) {
      throw new Error('Le texte du post est vide');
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/reformulate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_text: postText,
          learning_context: learningContext,
          imposed_hook: imposedHook,
          imposed_use_case: imposedUseCase,
          source_context: sourceContext,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        const message = error.error || `Erreur: ${response.status}`;
        throw new Error(message);
      }

      const data = await response.json();

      return {
        source_post: postText,
        variants: data.variants as [string, string, string],
        angle: data.angle,
        trigger_emotionnel: data.trigger_emotionnel,
        keyword: data.hook,
      };
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Impossible de joindre le serveur (${SERVER_URL}). Assurez-vous qu'il est lancé.`);
      }
      throw error;
    }
  };

  // Pré-brief: 5 hooks (biais cognitifs, intensité graduée) + 5 use
  // cases CGP, générés en un seul appel avant la reformulation
  const generatePreBrief = async (postText: string): Promise<import('../types/index').PreBrief> => {
    if (!postText.trim()) {
      throw new Error('Le texte du post est vide');
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/generate-hooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ post_text: postText }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Erreur: ${response.status}`);
      }

      const data = await response.json();
      return { hooks: data.hooks, useCases: data.use_cases ?? [] };
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Impossible de joindre le serveur (${SERVER_URL}). Assurez-vous qu'il est lancé.`);
      }
      throw error;
    }
  };

  const analyzeWinningPost = async (postText: string): Promise<WinningPostAnalysis> => {
    if (!postText.trim()) {
      throw new Error('Le texte du post est vide');
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/analyze-winning-post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_text: postText,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        const message = error.error || `Erreur: ${response.status}`;
        throw new Error(message);
      }

      return (await response.json()) as WinningPostAnalysis;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Impossible de joindre le serveur (${SERVER_URL}). Assurez-vous qu'il est lancé.`);
      }
      throw error;
    }
  };

  const refineVariant = async (
    variantText: string,
    instruction: string,
    sourcePost?: string
  ): Promise<string> => {
    if (!variantText.trim()) {
      throw new Error('La variante à modifier est vide');
    }
    if (!instruction.trim()) {
      throw new Error("L'instruction de modification est vide");
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/refine-variant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_text: variantText,
          instruction,
          source_post: sourcePost,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Erreur: ${response.status}`);
      }

      const data = await response.json();
      return data.variant as string;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Impossible de joindre le serveur (${SERVER_URL}). Assurez-vous qu'il est lancé.`);
      }
      throw error;
    }
  };

  // Prédit la performance de variantes: score /10 + fourchette
  // d'impressions calibrée sur les vrais posts + leviers d'amélioration.
  const predictPerformance = async (
    variants: string[],
    author?: string
  ): Promise<import('../types/index').PredictionResponse> => {
    const list = variants.filter((v) => v && v.trim());
    if (list.length === 0) {
      throw new Error('Aucune variante à évaluer');
    }
    try {
      const response = await fetch(`${SERVER_URL}/api/predict-performance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variants: list, author }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Erreur: ${response.status}`);
      }

      return (await response.json()) as import('../types/index').PredictionResponse;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Impossible de joindre le serveur (${SERVER_URL}). Assurez-vous qu'il est lancé.`);
      }
      throw error;
    }
  };

  const distillLesson = async (params: {
    instruction: string;
    variantBefore: string;
    variantAfter: string;
    existingRules: Array<{ id: string; rule_text: string }>;
  }): Promise<DistilledLesson> => {
    const response = await fetch(`${SERVER_URL}/api/distill-lesson`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instruction: params.instruction,
        variant_before: params.variantBefore,
        variant_after: params.variantAfter,
        existing_rules: params.existingRules,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Erreur: ${response.status}`);
    }

    return (await response.json()) as DistilledLesson;
  };

  const consolidateLessons = async (lessons: Lesson[]): Promise<ConsolidatedLesson[]> => {
    const response = await fetch(`${SERVER_URL}/api/consolidate-lessons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lessons: lessons.map((l) => ({
          rule_text: l.rule_text,
          category: l.category,
          occurrences: l.occurrences,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Erreur: ${response.status}`);
    }

    const data = await response.json();
    return data.lessons as ConsolidatedLesson[];
  };

  // Étape 1 du flux lead magnet: Claude rédige un brouillon structuré
  // (rien n'est encore poussé vers Notion), affiché dans l'aperçu éditable
  const generateLeadMagnetDraft = async (params: {
    sourcePost: string;
    chosenVariant?: string | null;
    keyword?: string;
  }): Promise<import('../types/index').LeadMagnetDraft> => {
    try {
      const response = await fetch(`${SERVER_URL}/api/generate-lead-magnet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_post: params.sourcePost,
          chosen_variant: params.chosenVariant ?? undefined,
          keyword: params.keyword,
          dry_run: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Erreur: ${response.status}`);
      }

      const data = await response.json();
      return data.magnet as import('../types/index').LeadMagnetDraft;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Impossible de joindre le serveur (${SERVER_URL}). Assurez-vous qu'il est lancé.`);
      }
      throw error;
    }
  };

  // Étape 2: publie le brouillon (éventuellement modifié) dans la database
  // Notion configurée côté serveur (celle de Thomas)
  const pushLeadMagnet = async (params: {
    draft: import('../types/index').LeadMagnetDraft;
    keyword?: string;
    sourceExcerpt?: string;
  }): Promise<{ url: string; titre: string; format: string }> => {
    try {
      const response = await fetch(`${SERVER_URL}/api/push-lead-magnet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          magnet: params.draft,
          keyword: params.keyword,
          source_excerpt: params.sourceExcerpt,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Erreur: ${response.status}`);
      }

      return (await response.json()) as { url: string; titre: string; format: string };
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Impossible de joindre le serveur (${SERVER_URL}). Assurez-vous qu'il est lancé.`);
      }
      throw error;
    }
  };

  return { reformulate, generatePreBrief, analyzeWinningPost, refineVariant, predictPerformance, distillLesson, consolidateLessons, generateLeadMagnetDraft, pushLeadMagnet };
}
