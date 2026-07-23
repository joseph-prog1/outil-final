import { useState } from 'react';
import { LinkedInPreview } from './LinkedInPreview';
import { useClaudeAPI } from '../hooks/useClaudeAPI';
import type { ReformulationResponse, PerformancePrediction, PredictionResponse } from '../types/index';

interface Props {
  response: ReformulationResponse;
  onSave?: (data: any) => Promise<void>;
  isSaving?: boolean;
  onRefineRequest?: (index: number) => void;
  refiningIndex?: number | null;
  chosenIndex?: number | null;
  onChoose?: (index: number) => void;
  // Enchaîne vers l'onglet Miniatures avec le texte de cette variante
  onCreateThumbnail?: (index: number) => void;
  // Miniatures de la session, affichées dans l'aperçu LinkedIn (une par variante)
  thumbnailUrls?: string[];
}

// Longueurs cibles graduées: concise, développée, complète
const LENGTH_TARGETS = [600, 700, 800];
const LENGTH_TOLERANCE = 75;

// Couleur du score selon le potentiel (rouge faible → vert fort)
function scoreTone(score: number): string {
  if (score >= 8) return 'text-forest';
  if (score >= 6) return 'text-ink';
  if (score >= 4) return 'text-amber-700';
  return 'text-red-700';
}

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '')}k` : `${n}`;

export function VariantsDisplay({ response, onSave, isSaving = false, onRefineRequest, refiningIndex = null, chosenIndex = null, onChoose, onCreateThumbnail, thumbnailUrls = [] }: Props) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { predictPerformance } = useClaudeAPI();
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [predictError, setPredictError] = useState('');

  const runPrediction = async () => {
    setPredicting(true);
    setPredictError('');
    try {
      const result = await predictPerformance([...response.variants]);
      setPrediction(result);
    } catch (err) {
      setPredictError(err instanceof Error ? err.message : 'Erreur de prédiction');
    } finally {
      setPredicting(false);
    }
  };

  const predFor = (index: number): PerformancePrediction | undefined =>
    prediction?.predictions.find((p) => p.index === index + 1);

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleSaveAll = async () => {
    if (!onSave) return;

    try {
      await onSave({
        source_post: response.source_post,
        variants: response.variants,
        angle: response.angle,
        trigger_emotionnel: response.trigger_emotionnel,
        keyword: response.keyword,
      });
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  return (
    <div className="bg-paper border border-line p-8 mb-8">
      {/* Post Original */}
      <div className="mb-10 pb-8 border-b border-line">
        <h2 className="text-xs uppercase tracking-caps text-muted mb-4">Post original — inchangé</h2>
        <p className="text-sm text-ink/80 leading-relaxed whitespace-pre-wrap">{response.source_post}</p>
      </div>

      {/* Analyse */}
      <div className="mb-10 pb-8 border-b border-line">
        <h3 className="font-serif text-2xl mb-6">Analyse</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <h4 className="text-xs uppercase tracking-caps text-muted mb-2">Angle</h4>
            <p className="text-sm text-ink">{response.angle}</p>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-caps text-muted mb-2">Trigger</h4>
            <p className="text-sm text-ink">{response.trigger_emotionnel}</p>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-caps text-muted mb-2">Mot-clé CTA</h4>
            <p className="font-serif text-xl text-forest">{response.keyword}</p>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-caps text-muted mb-2">Format</h4>
            <p className="text-xs text-ink/70 leading-relaxed">Commentez «&nbsp;{response.keyword}&nbsp;» et recevez la ressource</p>
          </div>
        </div>
      </div>

      {/* Variantes */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <h2 className="font-serif text-3xl">Trois variantes reformulées</h2>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={runPrediction}
            disabled={predicting}
            className="px-5 py-2.5 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-40"
          >
            {predicting ? 'Analyse…' : prediction ? 'Re-prédire la performance' : 'Prédire la performance'}
          </button>
          {predictError && <span className="text-xs text-red-700">{predictError}</span>}
          {prediction && !predictError && (
            <span className="text-xs text-muted">
              Calibré sur {prediction.sample_size} vrais posts
              {prediction.best_index ? ` · meilleure : variante ${prediction.best_index}` : ''}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-2">
        {response.variants.map((variant, index) => (
          <div
            key={index}
            className={`border bg-cream/40 p-5 flex flex-col ${
              prediction && prediction.best_index === index + 1
                ? 'border-forest ring-1 ring-forest'
                : 'border-line'
            }`}
          >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-line">
              <span className="text-xs uppercase tracking-caps text-muted">Variante {index + 1}</span>
              <span
                className={`text-xs ${
                  Math.abs(variant.length - LENGTH_TARGETS[index]) > LENGTH_TOLERANCE
                    ? 'text-red-700'
                    : 'text-muted'
                }`}
              >
                {variant.length} car. — cible {LENGTH_TARGETS[index]}
              </span>
            </div>

            {/* Prédiction de performance */}
            {(() => {
              const pred = predFor(index);
              if (!pred) return null;
              return (
                <div className="mb-4 pb-4 border-b border-line">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="flex items-baseline gap-1.5">
                      <span className={`font-serif text-2xl ${scoreTone(pred.score)}`}>{pred.score}</span>
                      <span className="text-xs text-muted">/10</span>
                      {prediction?.best_index === index + 1 && (
                        <span className="text-xs uppercase tracking-caps text-forest ml-1">Meilleure</span>
                      )}
                    </span>
                    {pred.impressions && (
                      <span className="text-xs text-ink/80">
                        ~{fmt(pred.impressions.low)}–{fmt(pred.impressions.high)} impressions
                      </span>
                    )}
                  </div>
                  {pred.sujet && (
                    <p className="text-xs text-muted mb-1.5">Sujet détecté : {pred.sujet}</p>
                  )}
                  <p className="text-xs text-ink/80 leading-snug mb-2">{pred.raison}</p>
                  {pred.leviers.length > 0 && (
                    <ul className="space-y-1">
                      {pred.leviers.map((lev, i) => (
                        <li key={i} className="text-xs text-muted leading-snug pl-3 relative">
                          <span className="absolute left-0 text-forest">+</span>
                          {lev}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            {onChoose && (
              <button
                onClick={() => onChoose(index)}
                className={`mb-4 self-start text-xs uppercase tracking-caps transition ${
                  chosenIndex === index
                    ? 'text-forest border-b border-forest'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {chosenIndex === index ? 'Variante retenue' : 'Retenir cette variante'}
              </button>
            )}

            {/* Aperçu tel qu'il apparaîtra dans le feed LinkedIn */}
            <div className="mb-5 flex-1">
              <LinkedInPreview
                text={variant}
                thumbnailUrl={thumbnailUrls[index] ?? thumbnailUrls[0] ?? null}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopy(variant, index)}
                  className="flex-1 px-3 py-2.5 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition"
                >
                  {copiedIndex === index ? 'Copié' : 'Copier'}
                </button>
                {onRefineRequest && (
                  <button
                    onClick={() => onRefineRequest(index)}
                    disabled={refiningIndex !== null}
                    className="flex-1 px-3 py-2.5 border border-ink text-ink text-xs uppercase tracking-caps hover:bg-ink hover:text-cream transition disabled:opacity-40"
                  >
                    {refiningIndex === index ? 'En cours…' : 'Affiner'}
                  </button>
                )}
              </div>
              {onCreateThumbnail && (
                <button
                  onClick={() => onCreateThumbnail(index)}
                  className="w-full px-3 py-2.5 border border-forest text-forest text-xs uppercase tracking-caps hover:bg-forest hover:text-cream transition"
                >
                  Créer la miniature
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
