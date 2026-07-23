import { useState } from 'react';
import type { ImagePrompt } from '../utils/imagePrompts';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';

interface ImageVariant {
  id: string;
  url: string;
  prompt: string;
  archetype?: string;
}

interface GenerateImagesResult {
  results: Array<{ prompt: string; archetype?: string | null; url?: string; error?: string }>;
}

async function requestImages(prompts: ImagePrompt[], userImages?: string[]): Promise<GenerateImagesResult['results']> {
  try {
    const response = await fetch(`${SERVER_URL}/api/generate-images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompts,
        // Data URLs des logos/illustrations uploadés par l'utilisateur,
        // intégrés par Gemini dans chaque miniature
        ...(userImages && userImages.length > 0 ? { user_images: userImages } : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Erreur: ${response.status}`);
    }

    const data = (await response.json()) as GenerateImagesResult;
    return data.results;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Impossible de joindre le serveur (${SERVER_URL}). Assurez-vous qu'il est lancé.`);
    }
    throw error;
  }
}

export function useImageGeneration() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Étape direction artistique: Claude écrit un brief visuel par famille
  // de style (titre + scène + métaphore) à partir du post
  const generateBriefs = async (postText: string): Promise<import('../utils/imagePrompts').ImageBrief[]> => {
    // Le spinner couvre aussi l'étape brief; generateImages, toujours
    // appelé ensuite (brief ou fallback), le relâche dans son finally
    setLoading(true);
    const response = await fetch(`${SERVER_URL}/api/image-briefs`, {
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
    return data.briefs;
  };

  const generateImages = async (prompts: ImagePrompt[], userImages?: string[]): Promise<ImageVariant[]> => {
    setLoading(true);
    setError('');

    try {
      const results = await requestImages(prompts, userImages);

      const variants = results
        .filter((r): r is { prompt: string; archetype?: string; url: string } => Boolean(r.url))
        .map((r, i) => ({
          id: `variant-${Date.now()}-${i}`,
          url: r.url,
          prompt: r.prompt,
          archetype: r.archetype,
        }));

      const failures = results.filter((r) => r.error);
      if (failures.length > 0) {
        setError(`${failures.length} variante(s) n'ont pas pu être générées: ${failures[0].error}`);
      }

      return variants;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la génération des images';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Édition de l'image existante: on envoie l'image actuelle + l'instruction
  // (+ d'éventuelles images jointes: logo à insérer, illustration...),
  // Gemini modifie uniquement ce qui est demandé au lieu de régénérer de zéro
  const refineImage = async (
    imageDataUrl: string,
    refinementText: string,
    userImages: string[] = []
  ): Promise<string> => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${SERVER_URL}/api/refine-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instruction: refinementText,
          image_data_url: imageDataUrl,
          user_images: userImages.length > 0 ? userImages : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Erreur: ${response.status}`);
      }

      const data = await response.json();
      return data.url as string;
    } catch (err) {
      if (err instanceof TypeError) {
        const message = `Impossible de joindre le serveur (${SERVER_URL}). Assurez-vous qu'il est lancé.`;
        setError(message);
        throw new Error(message);
      }
      const message = err instanceof Error ? err.message : 'Erreur lors du refinement';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // Si le CDN bloque le fetch cross-origin, on ouvre l'image dans un nouvel onglet
      window.open(imageUrl, '_blank', 'noopener');
    }
  };

  return {
    generateBriefs,
    generateImages,
    refineImage,
    downloadImage,
    loading,
    error,
  };
}
