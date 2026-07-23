import { useEffect, useState } from 'react';
import { useIdeas } from '../hooks/useIdeas';
import type { PostIdea } from '../types/index';

interface Props {
  onWritePost: (idea: PostIdea) => void;
}

const THEME_LABELS: Record<string, string> = {
  ia: 'IA',
  reglementation: 'Réglementation',
  data_officielle: 'Data officielle',
  marche_patrimoine: 'Marché & patrimoine',
  tendances: 'Tendances',
};

const THEMES = ['ia', 'reglementation', 'data_officielle', 'marche_patrimoine', 'tendances'];

function scoreTone(score: number): string {
  if (score >= 8) return 'text-forest';
  if (score >= 6) return 'text-ink';
  if (score >= 4) return 'text-amber-700';
  return 'text-red-700';
}

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '')}k` : `${n}`;

export function IdeasView({ onWritePost }: Props) {
  const { ideas, lastRun, lastRunFailed, loading, generating, error, fetchIdeas, generateIdeas, setIdeaStatus } = useIdeas();
  const [themeFilter, setThemeFilter] = useState<string | null>(null);

  useEffect(() => {
    void fetchIdeas();
  }, [fetchIdeas]);

  const handleGenerate = async () => {
    try {
      await generateIdeas();
      await fetchIdeas();
    } catch {
      /* l'erreur est déjà exposée par le hook */
    }
  };

  const visible = ideas
    .filter((i) => i.statut !== 'ecarte')
    .filter((i) => !themeFilter || i.theme === themeFilter);

  return (
    <div>
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="font-serif text-3xl">Idées de posts</h2>
          <p className="text-xs text-muted mt-1">
            {lastRun
              ? `Dernière recherche : ${new Date(lastRun).toLocaleString('fr-FR')}`
              : 'Aucune recherche encore lancée.'}
            {lastRunFailed && ' — la dernière recherche a échoué, voici les dernières idées trouvées.'}
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-6 py-3 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-40"
        >
          {generating ? 'Recherche en cours…' : 'Trouve-moi des sujets'}
        </button>
      </div>

      {/* Filtres thème */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setThemeFilter(null)}
          className={`text-xs uppercase tracking-caps px-3 py-1.5 border transition ${
            themeFilter === null ? 'border-forest text-forest' : 'border-line text-muted hover:text-ink'
          }`}
        >
          Tous
        </button>
        {THEMES.map((t) => (
          <button
            key={t}
            onClick={() => setThemeFilter(t)}
            className={`text-xs uppercase tracking-caps px-3 py-1.5 border transition ${
              themeFilter === t ? 'border-forest text-forest' : 'border-line text-muted hover:text-ink'
            }`}
          >
            {THEME_LABELS[t]}
          </button>
        ))}
      </div>

      {error && (
        <div className="border border-red-300 bg-paper text-red-800 px-5 py-4 text-sm mb-6">{error}</div>
      )}

      {!loading && visible.length === 0 && (
        <div className="border border-line bg-paper px-5 py-8 text-center text-sm text-muted">
          Aucune idée pour le moment. Cliquez sur « Trouve-moi des sujets » pour lancer une recherche.
        </div>
      )}

      {/* Liste */}
      <div className="space-y-4">
        {visible.map((idea) => (
          <div key={idea.id} className="border border-line bg-paper p-6">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex items-baseline gap-3">
                <span className={`font-serif text-2xl ${scoreTone(idea.score)}`}>{idea.score}</span>
                <span className="text-xs text-muted">/10</span>
                <span className="text-xs uppercase tracking-caps text-muted border border-line px-2 py-0.5">
                  {THEME_LABELS[idea.theme] ?? idea.theme}
                </span>
                {idea.statut === 'utilise' && (
                  <span className="text-xs uppercase tracking-caps text-forest">Utilisée</span>
                )}
              </div>
              {idea.impressions_estimees && (
                <span className="text-xs text-ink/80 whitespace-nowrap">
                  ~{fmt(idea.impressions_estimees.low)}–{fmt(idea.impressions_estimees.high)} impressions
                </span>
              )}
            </div>

            <h3 className="font-serif text-xl text-ink mb-2">{idea.titre}</h3>
            {idea.why_now && <p className="text-sm text-ink/80 mb-3">{idea.why_now}</p>}

            {idea.sources.length > 0 && (
              <div className="mb-3">
                <h4 className="text-xs uppercase tracking-caps text-muted mb-1">Sources</h4>
                <ul className="space-y-1">
                  {idea.sources.map((s, i) => (
                    <li key={i} className="text-sm">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-forest underline underline-offset-2 hover:text-ink break-all"
                      >
                        {s.titre}
                      </a>
                      {s.date && <span className="text-xs text-muted"> — {s.date}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {idea.angle && (
              <p className="text-sm text-ink/70 mb-4">
                <span className="text-xs uppercase tracking-caps text-muted">Angle CGP</span>
                <br />
                {idea.angle}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  onWritePost(idea);
                  void setIdeaStatus(idea.id, 'utilise');
                }}
                className="px-4 py-2.5 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition"
              >
                Rédiger ce post
              </button>
              <button
                onClick={() => void setIdeaStatus(idea.id, 'ecarte')}
                className="px-4 py-2.5 border border-line text-muted text-xs uppercase tracking-caps hover:text-ink hover:border-ink transition"
              >
                Écarter
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
