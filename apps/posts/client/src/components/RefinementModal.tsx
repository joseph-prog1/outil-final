import { useRef, useState } from 'react';

// Modal de raffinement partagé: variantes texte du Reformulateur (texte
// seul) et miniatures (allowImages: instructions + images jointes, ex.
// "insère ce logo").

const MAX_ATTACHED_IMAGES = 3;
// Au-delà, la requête devient lourde (les images partent en base64)
const MAX_ATTACHED_IMAGE_BYTES = 4 * 1024 * 1024;

interface AttachedImage {
  name: string;
  dataUrl: string;
}

interface RefinementModalProps {
  isOpen: boolean;
  variantLabel: string;
  variantText?: string;
  description?: string;
  placeholder?: string;
  // Autorise à joindre des images à l'instruction (raffinement de miniatures)
  allowImages?: boolean;
  onRefine: (refinementText: string, images?: string[]) => Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
}

export function RefinementModal({
  isOpen,
  variantLabel,
  variantText,
  description = 'Décrivez la modification souhaitée. Seule la partie mentionnée sera modifiée, le reste du texte est conservé. Vos corrections sont mémorisées pour améliorer les prochaines générations.',
  placeholder = 'Ex: "Adoucis le hook, trop agressif", "Remplace l\'exemple par un cas CGP concret", "Raccourcis le corps"...',
  allowImages = false,
  onRefine,
  onClose,
  isLoading = false,
}: RefinementModalProps) {
  const [refinementText, setRefinementText] = useState('');
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [error, setError] = useState('');
  const uploadInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleAddImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError('');

    const additions: AttachedImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setError(`"${file.name}" n'est pas une image.`);
        continue;
      }
      if (file.size > MAX_ATTACHED_IMAGE_BYTES) {
        setError(`"${file.name}" dépasse 4 Mo: réduisez l'image avant de la joindre.`);
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      additions.push({ name: file.name, dataUrl });
    }

    setAttachedImages((prev) => {
      const merged = [...prev, ...additions].slice(0, MAX_ATTACHED_IMAGES);
      if (prev.length + additions.length > MAX_ATTACHED_IMAGES) {
        setError(`${MAX_ATTACHED_IMAGES} images maximum: seules les ${MAX_ATTACHED_IMAGES} premières sont conservées.`);
      }
      return merged;
    });

    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRefine = async () => {
    if (!refinementText.trim()) {
      setError('Veuillez entrer des instructions');
      return;
    }

    try {
      setError('');
      await onRefine(
        refinementText,
        allowImages && attachedImages.length > 0 ? attachedImages.map((img) => img.dataUrl) : undefined
      );
      setRefinementText('');
      setAttachedImages([]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du raffinement');
    }
  };

  return (
    <div className="fixed inset-0 bg-forest-deep/70 flex items-center justify-center z-50">
      <div className="bg-paper border border-line p-8 max-w-lg w-full mx-4">
        <h2 className="font-serif text-2xl mb-5">Affiner la {variantLabel.toLowerCase()}</h2>

        {variantText && (
          <div className="mb-5 p-4 bg-cream/50 border border-line max-h-32 overflow-y-auto">
            <p className="text-xs text-muted whitespace-pre-wrap leading-relaxed">{variantText}</p>
          </div>
        )}

        <p className="text-sm text-muted mb-5 leading-relaxed">{description}</p>

        <textarea
          value={refinementText}
          onChange={(e) => setRefinementText(e.target.value)}
          placeholder={placeholder}
          className="w-full h-24 p-4 bg-cream/50 border border-line text-sm leading-relaxed focus:outline-none focus:border-forest mb-5"
          disabled={isLoading}
        />

        {allowImages && (
          <div className="mb-5 border border-line bg-cream/30 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs uppercase tracking-caps text-muted">
                Images jointes ({attachedImages.length}/{MAX_ATTACHED_IMAGES})
              </span>
              <button
                onClick={() => uploadInputRef.current?.click()}
                disabled={isLoading || attachedImages.length >= MAX_ATTACHED_IMAGES}
                className="px-4 py-2 border border-ink text-ink text-xs uppercase tracking-caps hover:bg-ink hover:text-cream transition disabled:opacity-40"
              >
                Joindre une image
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleAddImages(e.target.files)}
              />
            </div>
            <p className="text-xs text-muted leading-relaxed mt-2">
              Optionnel. Ex: joindre un logo puis écrire « insère ce logo en bas à droite ».
              Chaque image jointe sera reproduite telle quelle, sans déformation.
            </p>
            {attachedImages.length > 0 && (
              <div className="flex gap-3 mt-3">
                {attachedImages.map((img, i) => (
                  <div key={i} className="relative border border-line bg-paper p-1">
                    <img
                      src={img.dataUrl}
                      alt={img.name}
                      title={img.name}
                      className="h-14 w-auto max-w-28 object-contain"
                    />
                    <button
                      onClick={() => removeImage(i)}
                      disabled={isLoading}
                      title={`Retirer ${img.name}`}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-ink text-cream text-xs leading-none hover:bg-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="border border-red-300 text-red-800 px-4 py-3 mb-5 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-3 border border-ink text-ink text-xs uppercase tracking-caps hover:bg-ink hover:text-cream transition disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            onClick={handleRefine}
            disabled={isLoading || !refinementText.trim()}
            className="flex-1 px-4 py-3 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-40"
          >
            {isLoading ? 'En cours…' : 'Affiner'}
          </button>
        </div>
      </div>
    </div>
  );
}
