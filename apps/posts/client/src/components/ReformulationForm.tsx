// client/src/components/ReformulationForm.tsx
import { useState, useEffect, useRef } from 'react';
import { useClaudeAPI } from '../hooks/useClaudeAPI';
import { generateLearningContext } from '../utils/learningContext';
import type { ReformulationResponse, WinningPost, HookEntry, Lesson, HookProposal, UseCaseProposal } from '../types/index';

const BIAIS_LABELS: Record<string, string> = {
  curiosite: 'Curiosité',
  peur: 'Peur',
  suspense: 'Suspense',
  preuve_sociale: 'Preuve sociale',
  urgence: 'Urgence',
  contre_intuitif: 'Contre-intuitif',
  autorite: 'Autorité',
};

interface Props {
  onReformulate: (response: ReformulationResponse) => void;
  isLoading?: boolean;
  winningPosts: WinningPost[];
  hookEntries: HookEntry[];
  lessons?: Lesson[];
  // Texte injecté depuis l'onglet Idées: pré-remplit le champ et déclenche le pré-brief
  seedText?: string | null;
  // Sources de l'idée (titres + liens + dates): jointes au contexte de reformulation
  // pour appuyer le post sur de vrais chiffres/faits. Change en même temps que seedText.
  seedSources?: string | null;
}

export function ReformulationForm({ onReformulate, isLoading = false, winningPosts, hookEntries, lessons, seedText, seedSources }: Props) {
  const [postText, setPostText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hooks, setHooks] = useState<HookProposal[] | null>(null);
  const [useCases, setUseCases] = useState<UseCaseProposal[] | null>(null);
  const [selectedHook, setSelectedHook] = useState<number | null>(null);
  // Plusieurs use cases sélectionnables: les variantes s'appuieront sur tous
  const [selectedUseCases, setSelectedUseCases] = useState<number[]>([]);
  // Contexte de sources (venu d'une idée): injecté dans la reformulation
  const [sourceContext, setSourceContext] = useState<string | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);
  // Dernier texte pour lequel le pré-brief a été généré (évite les doublons)
  const briefedText = useRef('');
  const { reformulate, generatePreBrief } = useClaudeAPI();

  const runPreBrief = async (text: string) => {
    setLoadingBrief(true);
    setError('');
    try {
      const brief = await generatePreBrief(text);
      setHooks(brief.hooks);
      setUseCases(brief.useCases.length > 0 ? brief.useCases : null);
      setSelectedHook(null);
      setSelectedUseCases([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la génération du pré-brief');
    } finally {
      setLoadingBrief(false);
    }
  };

  // Pré-brief automatique: dès que le post est collé (ou modifié), les
  // hooks et use cases se génèrent seuls, 1,2 s après la fin de la saisie
  useEffect(() => {
    const text = postText.trim();
    if (text.length < 80 || text === briefedText.current) return;
    const timer = setTimeout(() => {
      briefedText.current = text;
      void runPreBrief(text);
    }, 1200);
    return () => clearTimeout(timer);
  }, [postText]);

  // Pré-remplissage depuis l'onglet Idées: pose le texte, le pré-brief se
  // déclenche ensuite tout seul via l'effet ci-dessus.
  useEffect(() => {
    if (seedText && seedText.trim()) {
      setPostText(seedText);
      // Les sources de l'idée deviennent le contexte de reformulation
      setSourceContext(seedSources && seedSources.trim() ? seedSources : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedText]);

  const handleReformulate = async () => {
    if (!postText.trim()) {
      setError('Veuillez entrer le texte du post');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const learningContext = generateLearningContext(postText, winningPosts, hookEntries, lessons);
      const imposedHook = hooks && selectedHook !== null ? hooks[selectedHook].text : undefined;
      const imposedUseCase =
        useCases && selectedUseCases.length > 0
          ? selectedUseCases
              .map((i) => `${useCases[i].titre} — ${useCases[i].description}`)
              .join('\n')
          : undefined;
      const response = await reformulate(
        postText,
        learningContext,
        imposedHook,
        imposedUseCase,
        sourceContext ?? undefined
      );
      onReformulate(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPostText(text);
      // Nouveau post collé à la main: les sources de l'idée précédente ne valent plus
      setSourceContext(null);
    } catch (err) {
      setError('Impossible de lire le presse-papiers');
    }
  };

  return (
    <div className="bg-paper border border-line p-8 mb-8">
      <h2 className="font-serif text-3xl mb-6">Reformuler un post</h2>

      <div className="mb-5">
        <label className="block text-xs uppercase tracking-caps text-muted mb-3">
          Texte du post LinkedIn ou Twitter
        </label>
        <textarea
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          placeholder="Collez ici le texte du post…"
          className="w-full h-40 p-4 bg-cream/50 border border-line text-sm leading-relaxed focus:outline-none focus:border-forest"
          disabled={loading || isLoading}
        />
        {sourceContext && (
          <div className="mt-2 flex items-start gap-2 text-xs text-forest">
            <span className="uppercase tracking-caps">Sources jointes</span>
            <span className="text-muted">
              — les variantes s'appuieront sur les articles de l'idée (chiffres, faits, dates).
            </span>
          </div>
        )}
      </div>

      {/* Pré-brief automatique: hooks + use cases dès que le post est collé */}
      {(loadingBrief || hooks || useCases) && (
        <div className="border border-line bg-cream/40 p-5 mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs uppercase tracking-caps text-ink">Hook du post</h3>
              <p className="text-xs text-muted mt-1">
                Cinq accroches, chacune sur un biais cognitif et un désir humain différent,
                de la plus douce à la plus agressive. Choisissez-en une : les trois variantes s'ouvriront avec.
              </p>
            </div>
            {loadingBrief && (
              <span className="text-xs uppercase tracking-caps text-muted">Génération du pré-brief…</span>
            )}
            {!loadingBrief && hooks && (
              <button
                onClick={() => runPreBrief(postText.trim())}
                disabled={loading || isLoading || !postText.trim()}
                className="px-5 py-2.5 border border-forest text-forest text-xs uppercase tracking-caps hover:bg-forest hover:text-cream transition disabled:opacity-40"
              >
                Régénérer
              </button>
            )}
          </div>

          {hooks && (
            <div className="mt-4 space-y-2">
              {hooks.map((hook, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedHook(selectedHook === index ? null : index)}
                  className={`w-full text-left p-4 border transition ${
                    selectedHook === index
                      ? 'border-forest bg-paper'
                      : 'border-line bg-paper/60 hover:border-muted'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-xs uppercase tracking-caps text-forest">
                      {BIAIS_LABELS[hook.biais] ?? hook.biais}
                    </span>
                    {(hook.desir_label || hook.desir) && (
                      <span className="text-xs text-muted border border-line px-1.5 py-0.5 rounded-sm">
                        {hook.desir_label ?? hook.desir}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      Intensité {hook.intensite}/5
                    </span>
                    {selectedHook === index && (
                      <span className="text-xs uppercase tracking-caps text-forest ml-auto">Choisi</span>
                    )}
                  </div>
                  <p className="text-sm text-ink/90 leading-snug whitespace-pre-wrap">{hook.text}</p>
                </button>
              ))}
            </div>
          )}

          {useCases && (
            <div className="mt-6 pt-5 border-t border-line">
              <h3 className="text-xs uppercase tracking-caps text-ink">Use case CGP</h3>
              <p className="text-xs text-muted mt-1 mb-4">
                L'angle métier du post : la situation concrète du quotidien CGP sur laquelle
                les trois variantes s'appuieront. Vous pouvez en choisir plusieurs.
              </p>
              <div className="space-y-2">
                {useCases.map((useCase, index) => {
                  const chosen = selectedUseCases.includes(index);
                  return (
                    <button
                      key={index}
                      onClick={() =>
                        setSelectedUseCases((prev) =>
                          prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
                        )
                      }
                      className={`w-full text-left p-4 border transition ${
                        chosen
                          ? 'border-forest bg-paper'
                          : 'border-line bg-paper/60 hover:border-muted'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm font-medium text-ink">{useCase.titre}</span>
                        {chosen && (
                          <span className="text-xs uppercase tracking-caps text-forest ml-auto">Choisi</span>
                        )}
                      </div>
                      <p className="text-xs text-muted leading-relaxed">{useCase.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(hooks || useCases) && (
            <p className="text-xs text-muted pt-4">
              Sans sélection, Claude choisit librement le hook et l'angle de chaque variante.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="border border-red-300 bg-paper text-red-800 px-4 py-3 mb-5 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handlePaste}
          disabled={loading || isLoading}
          className="px-6 py-3 border border-ink text-ink text-xs uppercase tracking-caps hover:bg-ink hover:text-cream transition disabled:opacity-40"
        >
          Coller
        </button>
        <button
          onClick={handleReformulate}
          disabled={loading || isLoading || !postText.trim()}
          className="flex-1 px-6 py-3 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-40"
        >
          {loading || isLoading ? 'Reformulation en cours…' : 'Reformuler'}
        </button>
      </div>
    </div>
  );
}
