import { useState } from 'react';
import { RefinementModal } from './RefinementModal';

interface ImageVariantCardProps {
  variantIndex: number;
  imageUrl: string;
  prompt: string;
  onDownload: () => void;
  onRefine: (refinementText: string, images?: string[]) => Promise<void>;
  isLoading?: boolean;
}

export function ImageVariantCard({
  variantIndex,
  imageUrl,
  prompt,
  onDownload,
  onRefine,
  isLoading = false,
}: ImageVariantCardProps) {
  const [isRefinementOpen, setIsRefinementOpen] = useState(false);
  const [refined, setRefined] = useState(false);

  const handleRefine = async (refinementText: string, images?: string[]) => {
    await onRefine(refinementText, images);
    setRefined(true);
  };

  return (
    <>
      <div className="bg-paper border border-line overflow-hidden">
        {/* Image Preview — ratio naturel (4:3 en général, vertical pour le
            mockup iPhone), jamais recadrée */}
        <div className="bg-cream/50 overflow-hidden border-b border-line">
          <img
            src={imageUrl}
            alt={`Variante ${variantIndex + 1}`}
            className="w-full h-auto"
          />
        </div>

        {/* Content */}
        <div className="p-5">
          <h3 className="text-xs uppercase tracking-caps text-muted mb-3">
            Variante {variantIndex + 1}
            {refined && <span className="ml-3 text-forest normal-case tracking-normal">Affinée</span>}
          </h3>

          {/* Prompt (optionnel, caché par défaut) */}
          <details className="mb-5">
            <summary className="text-xs text-muted cursor-pointer hover:text-ink">
              Voir le prompt
            </summary>
            <p className="text-xs text-muted mt-2 p-3 bg-cream/50 border border-line line-clamp-3">
              {prompt.substring(0, 150)}…
            </p>
          </details>

          {/* Boutons */}
          <div className="flex gap-2">
            <button
              onClick={onDownload}
              disabled={isLoading}
              className="flex-1 px-3 py-2.5 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-40"
            >
              Télécharger
            </button>
            <button
              onClick={() => setIsRefinementOpen(true)}
              disabled={isLoading}
              className="flex-1 px-3 py-2.5 border border-ink text-ink text-xs uppercase tracking-caps hover:bg-ink hover:text-cream transition disabled:opacity-40"
            >
              Affiner
            </button>
          </div>
        </div>
      </div>

      {/* Refinement Modal */}
      <RefinementModal
        isOpen={isRefinementOpen}
        variantLabel={`Variante ${variantIndex + 1}`}
        description="Décris comment tu aimerais modifier cette image, et joins si besoin un logo ou une illustration à y intégrer. Sois précis pour les meilleurs résultats."
        placeholder="Ex: 'Rendre le titre plus visible', 'Insère ce logo en bas à droite', 'Style plus épuré'..."
        allowImages
        onRefine={handleRefine}
        onClose={() => setIsRefinementOpen(false)}
        isLoading={isLoading}
      />
    </>
  );
}
