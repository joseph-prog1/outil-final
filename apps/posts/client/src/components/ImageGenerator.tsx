import { useRef, useState } from 'react';
import { useImageGeneration } from '../hooks/useImageGeneration';
import { buildImagePrompts, generateImagePrompts } from '../utils/imagePrompts';
import { ImageVariantCard } from './ImageVariantCard';
import type { LibraryThumbnail } from '../types/index';

interface ImageGeneratorProps {
  selectedPostText?: string;
  // Archivage dans la bibliothèque: appelé avec la liste à jour des
  // miniatures après chaque génération ou affinage
  onThumbnailsGenerated?: (postText: string, thumbnails: LibraryThumbnail[]) => void;
}

// Logo/illustration uploadé par l'utilisateur, intégré aux miniatures
interface UserImage {
  name: string;
  dataUrl: string;
}

const MAX_USER_IMAGES = 3;
// Au-delà, la requête devient lourde (les images partent en base64)
const MAX_USER_IMAGE_BYTES = 4 * 1024 * 1024;

export function ImageGenerator({ selectedPostText = '', onThumbnailsGenerated }: ImageGeneratorProps) {
  const [postText, setPostText] = useState(selectedPostText);
  const [variants, setVariants] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [userImages, setUserImages] = useState<UserImage[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const { generateBriefs, generateImages, refineImage, downloadImage, loading } = useImageGeneration();

  const archiveThumbnails = (list: any[]) => {
    onThumbnailsGenerated?.(
      postText,
      list.map((v) => ({ url: v.url, archetype: v.archetype ?? null }))
    );
  };

  const handleAddUserImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError('');

    const additions: UserImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setError(`"${file.name}" n'est pas une image.`);
        continue;
      }
      if (file.size > MAX_USER_IMAGE_BYTES) {
        setError(`"${file.name}" dépasse 4 Mo: réduisez l'image avant de l'uploader.`);
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

    setUserImages((prev) => {
      const merged = [...prev, ...additions].slice(0, MAX_USER_IMAGES);
      if (prev.length + additions.length > MAX_USER_IMAGES) {
        setError(`${MAX_USER_IMAGES} images maximum: seules les ${MAX_USER_IMAGES} premières sont conservées.`);
      }
      return merged;
    });

    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  const removeUserImage = (index: number) => {
    setUserImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerateImages = async () => {
    if (!postText.trim()) {
      setError('Veuillez entrer le texte du post');
      return;
    }

    setError('');

    try {
      // Direction artistique par Claude (choix d'archétypes du catalogue de
      // références), puis exécution par Gemini avec logo + référence de style.
      // Si l'étape brief échoue, on retombe sur 3 archétypes sûrs.
      let prompts: import('../utils/imagePrompts').ImagePrompt[];
      try {
        const briefs = await generateBriefs(postText);
        prompts = buildImagePrompts(briefs);
      } catch (briefErr) {
        console.error('Briefs indisponibles, fallback interprétation directe:', briefErr);
        prompts = generateImagePrompts(postText);
      }

      const generatedVariants = await generateImages(
        prompts,
        userImages.map((img) => img.dataUrl)
      );
      setVariants(generatedVariants);
      if (generatedVariants.length > 0) archiveThumbnails(generatedVariants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la génération');
    }
  };

  const handleRefine = async (variantId: string, refinementText: string, images?: string[]) => {
    try {
      const variant = variants.find(v => v.id === variantId);
      if (!variant) return;

      const refinedImageUrl = await refineImage(variant.url, refinementText, images ?? []);

      setVariants(prev => {
        const updated = prev.map(v =>
          v.id === variantId ? { ...v, url: refinedImageUrl } : v
        );
        archiveThumbnails(updated);
        return updated;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du refinement');
    }
  };

  const handleDownload = (variantId: string) => {
    const variant = variants.find(v => v.id === variantId);
    if (!variant) return;

    downloadImage(variant.url, `charlie-miniature-${variantId}.png`);
  };

  return (
    <div className="space-y-8">
      {/* Input Section */}
      <div className="bg-paper border border-line p-8">
        <h2 className="font-serif text-3xl mb-3">Générateur de miniatures</h2>

        <p className="text-muted mb-6 text-sm leading-relaxed">
          Collez le texte du post reformulé et générez trois variantes de miniatures optimisées pour LinkedIn.
        </p>

        <textarea
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          placeholder="Collez ici le texte du post reformulé…"
          className="w-full h-40 p-4 bg-cream/50 border border-line text-sm leading-relaxed focus:outline-none focus:border-forest mb-5"
          disabled={loading}
        />

        {/* Images à intégrer (logo client, illustration...) */}
        <div className="mb-5 border border-line bg-cream/30 p-4">
          <div className="flex items-center justify-between gap-4 mb-2">
            <span className="text-xs uppercase tracking-caps text-muted">
              Images à intégrer — logo ou illustration ({userImages.length}/{MAX_USER_IMAGES})
            </span>
            <button
              onClick={() => uploadInputRef.current?.click()}
              disabled={loading || userImages.length >= MAX_USER_IMAGES}
              className="px-4 py-2 border border-ink text-ink text-xs uppercase tracking-caps hover:bg-ink hover:text-cream transition disabled:opacity-40"
            >
              Ajouter une image
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleAddUserImages(e.target.files)}
            />
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Optionnel. Chaque image uploadée (logo d'un partenaire, illustration…) sera intégrée
            telle quelle dans les miniatures générées, sans déformation.
          </p>
          {userImages.length > 0 && (
            <div className="flex gap-3 mt-3">
              {userImages.map((img, i) => (
                <div key={i} className="relative border border-line bg-paper p-1">
                  <img src={img.dataUrl} alt={img.name} title={img.name} className="h-16 w-auto max-w-32 object-contain" />
                  <button
                    onClick={() => removeUserImage(i)}
                    disabled={loading}
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

        {error && (
          <div className="border border-red-300 bg-paper text-red-800 px-4 py-3 mb-5 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleGenerateImages}
          disabled={loading || !postText.trim()}
          className="w-full px-6 py-3 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-40"
        >
          {loading ? 'Génération en cours…' : 'Générer trois variantes'}
        </button>
      </div>

      {/* Images Grid */}
      {variants.length > 0 && (
        <div>
          <h3 className="font-serif text-2xl mb-6">Vos miniatures</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {variants.map((variant, index) => (
              <ImageVariantCard
                key={variant.id}
                variantIndex={index}
                imageUrl={variant.url}
                prompt={variant.prompt}
                onDownload={() => handleDownload(variant.id)}
                onRefine={(refinementText, images) => handleRefine(variant.id, refinementText, images)}
                isLoading={loading}
              />
            ))}
          </div>

          {/* Info */}
          <p className="text-xs text-muted mt-8">
            Les images sont générées pour cette session et ne sont pas sauvegardées.
          </p>
        </div>
      )}
    </div>
  );
}
