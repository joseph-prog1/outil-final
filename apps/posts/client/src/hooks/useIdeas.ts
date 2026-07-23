import { useState, useCallback } from 'react';
import type { PostIdea, IdeasResponse, GenerateIdeasResult } from '../types/index';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';

export function useIdeas() {
  const [ideas, setIdeas] = useState<PostIdea[]>([]);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [lastRunFailed, setLastRunFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const fetchIdeas = useCallback(async (filters?: { theme?: string; statut?: string }) => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (filters?.theme) qs.set('theme', filters.theme);
      if (filters?.statut) qs.set('statut', filters.statut);
      const q = qs.toString();
      const res = await fetch(`${SERVER_URL}/api/ideas${q ? `?${q}` : ''}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Erreur: ${res.status}`);
      }
      const data = (await res.json()) as IdeasResponse;
      setIdeas(data.ideas);
      setLastRun(data.last_run);
      setLastRunFailed(data.last_run_failed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, []);

  const generateIdeas = useCallback(async (): Promise<GenerateIdeasResult> => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch(`${SERVER_URL}/api/ideas/generate`, { method: 'POST' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Erreur: ${res.status}`);
      }
      return (await res.json()) as GenerateIdeasResult;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      throw e;
    } finally {
      setGenerating(false);
    }
  }, []);

  // Optimiste: l'UI bouge d'abord, le PATCH suit.
  const setIdeaStatus = useCallback(async (id: string, statut: string) => {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, statut } : i)));
    try {
      await fetch(`${SERVER_URL}/api/ideas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      });
    } catch {
      /* l'UI a déjà été mise à jour de façon optimiste */
    }
  }, []);

  return { ideas, lastRun, lastRunFailed, loading, generating, error, fetchIdeas, generateIdeas, setIdeaStatus };
}
