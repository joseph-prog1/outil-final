import { useState, useEffect, useRef } from 'react';
import { useLibraryDB } from '../hooks/useLibraryDB';
import { useBackup } from '../hooks/useBackup';
import { useClaudeAPI } from '../hooks/useClaudeAPI';
import { LeadMagnetPreview } from './LeadMagnetPreview';
import type { LibraryEntry, LeadMagnetDraft } from '../types/index';

export function LibraryView() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [magnetLoadingId, setMagnetLoadingId] = useState<string | null>(null);
  // Brouillon en cours de relecture dans l'aperçu (et l'entrée d'origine)
  const [magnetDraft, setMagnetDraft] = useState<{ entry: LibraryEntry; draft: LeadMagnetDraft } | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const library = useLibraryDB();
  const { exportAll, importAll } = useBackup();
  const { generateLeadMagnetDraft, pushLeadMagnet } = useClaudeAPI();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      setEntries(await library.getEntries());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette entrée de la bibliothèque ?')) return;
    await library.deleteEntry(id);
    await load();
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Texte copié dans le presse-papiers.');
      setTimeout(() => setMessage(''), 2500);
    } catch {
      setError('Impossible de copier.');
    }
  };

  const handleExport = async () => {
    setError('');
    try {
      await exportAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export impossible');
    }
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    setError('');
    try {
      const counts = await importAll(file);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      setMessage(`Sauvegarde importée : ${total} élément(s) fusionné(s), dont ${counts.library ?? 0} entrée(s) de bibliothèque.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import impossible');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Étape 1: Claude rédige le brouillon, affiché dans l'aperçu éditable.
  // Rien n'est poussé vers Notion à ce stade.
  const handleGenerateLeadMagnet = async (entry: LibraryEntry) => {
    const chosenText =
      entry.variants && entry.chosen_index !== null ? entry.variants[entry.chosen_index] : null;

    setError('');
    setMagnetLoadingId(entry.id);
    try {
      const draft = await generateLeadMagnetDraft({
        sourcePost: entry.source_post,
        chosenVariant: chosenText ?? entry.variants?.[0] ?? null,
        keyword: entry.keyword,
      });
      setMagnetDraft({ entry, draft });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la génération du lead magnet');
    } finally {
      setMagnetLoadingId(null);
    }
  };

  // Étape 2: publie la version relue/modifiée dans le Notion configuré,
  // puis mémorise l'URL sur l'entrée de bibliothèque
  const handlePushLeadMagnet = async (finalDraft: LeadMagnetDraft) => {
    if (!magnetDraft) return;
    const { entry } = magnetDraft;
    const chosenText =
      entry.variants && entry.chosen_index !== null ? entry.variants[entry.chosen_index] : null;

    setIsPushing(true);
    try {
      const result = await pushLeadMagnet({
        draft: finalDraft,
        keyword: entry.keyword,
        sourceExcerpt: chosenText ?? entry.variants?.[0] ?? entry.source_post,
      });

      await library.updateEntry(entry.id, {
        lead_magnet: {
          url: result.url,
          titre: result.titre,
          format: result.format,
          date: new Date().toISOString(),
        },
      });
      await load();
      setMagnetDraft(null);
      setMessage(
        `Lead magnet "${result.titre}" publié dans Notion. Thomas peut activer "Publier sur le web" sur la page pour obtenir le lien à partager en DM.`
      );
    } finally {
      setIsPushing(false);
    }
  };

  const downloadThumbnail = (url: string, entryId: string, index: number) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `charlie-miniature-${entryId}-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-8">
      {/* En-tête + sauvegarde */}
      <div className="bg-paper border border-line p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h2 className="font-serif text-3xl mb-3">Bibliothèque</h2>
            <p className="text-muted text-sm leading-relaxed max-w-xl">
              Chaque post reformulé est archivé ici automatiquement, avec ses variantes, la
              variante retenue et ses miniatures. La sauvegarde exporte aussi toute la base
              d'apprentissage — conservez le fichier pour changer de navigateur ou de machine.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExport}
              className="px-6 py-3 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition"
            >
              Exporter la sauvegarde
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 border border-ink text-ink text-xs uppercase tracking-caps hover:bg-ink hover:text-cream transition"
            >
              Importer
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => handleImportFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        {message && (
          <p className="mt-5 text-sm text-forest border-t border-line pt-4">{message}</p>
        )}
        {error && (
          <p className="mt-5 text-sm text-red-800 border-t border-line pt-4">{error}</p>
        )}
      </div>

      {/* Liste */}
      {entries.length === 0 ? (
        <div className="bg-paper border border-line p-8">
          <p className="text-sm text-muted italic">
            Aucune entrée pour le moment. Reformulez un post dans l'onglet Reformulateur :
            il sera archivé ici automatiquement.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {entries.map((entry) => {
            const isOpen = openId === entry.id;
            const chosenText =
              entry.variants && entry.chosen_index !== null
                ? entry.variants[entry.chosen_index]
                : null;
            return (
              <div key={entry.id} className="bg-paper border border-line">
                {/* Ligne de synthèse */}
                <div className="p-6 flex flex-wrap gap-6 items-start">
                  <div className="flex-1 min-w-64">
                    <div className="flex items-baseline gap-4 mb-3">
                      <span className="text-xs uppercase tracking-caps text-muted">
                        {formatDate(entry.date_creation)}
                      </span>
                      {entry.keyword && (
                        <span className="font-serif text-lg text-forest">{entry.keyword}</span>
                      )}
                      {chosenText !== null && (
                        <span className="text-xs uppercase tracking-caps text-forest">
                          Variante {entry.chosen_index! + 1} retenue
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink/80 leading-relaxed line-clamp-2 whitespace-pre-wrap">
                      {chosenText ?? entry.source_post}
                    </p>
                    {entry.angle && (
                      <p className="text-xs text-muted mt-2">
                        {entry.angle}
                        {entry.trigger_emotionnel && ` — ${entry.trigger_emotionnel}`}
                      </p>
                    )}
                  </div>

                  {entry.thumbnails.length > 0 && (
                    <div className="flex gap-2">
                      {entry.thumbnails.slice(0, 3).map((thumb, i) => (
                        <button
                          key={i}
                          onClick={() => downloadThumbnail(thumb.url, entry.id, i)}
                          title="Télécharger la miniature"
                          className="block w-24 border border-line hover:border-forest transition"
                        >
                          <img src={thumb.url} alt={`Miniature ${i + 1}`} className="w-full h-auto" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-6 pb-5 flex gap-4 text-xs uppercase tracking-caps">
                  {entry.variants && (
                    <button
                      onClick={() => setOpenId(isOpen ? null : entry.id)}
                      className="text-muted hover:text-ink"
                    >
                      {isOpen ? 'Replier' : 'Voir les variantes'}
                    </button>
                  )}
                  <button
                    onClick={() => handleCopy(chosenText ?? entry.variants?.[0] ?? entry.source_post)}
                    className="text-muted hover:text-ink"
                  >
                    Copier le texte
                  </button>
                  {entry.lead_magnet ? (
                    <>
                      <a
                        href={entry.lead_magnet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={entry.lead_magnet.titre}
                        className="text-forest hover:text-ink"
                      >
                        Lead magnet ({entry.lead_magnet.format}) ↗
                      </a>
                      <button
                        onClick={() => handleGenerateLeadMagnet(entry)}
                        disabled={magnetLoadingId !== null}
                        className="text-muted hover:text-ink disabled:opacity-50"
                        title="Regénérer un brouillon (la publication créera une nouvelle page Notion)"
                      >
                        {magnetLoadingId === entry.id ? 'Rédaction…' : 'Regénérer'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleGenerateLeadMagnet(entry)}
                      disabled={magnetLoadingId !== null}
                      className="text-forest hover:text-ink disabled:opacity-50"
                    >
                      {magnetLoadingId === entry.id ? 'Rédaction du brouillon…' : 'Générer le lead magnet'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="text-muted hover:text-red-700 ml-auto"
                  >
                    Supprimer
                  </button>
                </div>

                {/* Détail */}
                {isOpen && entry.variants && (
                  <div className="border-t border-line p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
                    {entry.variants.map((variant, i) => (
                      <div
                        key={i}
                        className={`border p-4 ${
                          entry.chosen_index === i ? 'border-forest bg-cream/60' : 'border-line bg-cream/30'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs uppercase tracking-caps text-muted">
                            Variante {i + 1}
                            {entry.chosen_index === i && (
                              <span className="text-forest ml-2">Retenue</span>
                            )}
                          </span>
                          <button
                            onClick={() => handleCopy(variant)}
                            className="text-xs uppercase tracking-caps text-muted hover:text-ink"
                          >
                            Copier
                          </button>
                        </div>
                        <p className="text-sm text-ink/85 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                          {variant}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Aperçu éditable du lead magnet avant publication vers Notion */}
      {magnetDraft && (
        <LeadMagnetPreview
          key={magnetDraft.entry.id}
          draft={magnetDraft.draft}
          onPush={handlePushLeadMagnet}
          onCancel={() => setMagnetDraft(null)}
          isPushing={isPushing}
        />
      )}
    </div>
  );
}
