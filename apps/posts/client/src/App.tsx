import { useState, useEffect, useRef } from 'react';
import { ReformulationForm } from './components/ReformulationForm';
import { VariantsDisplay } from './components/VariantsDisplay';
import { RefinementModal } from './components/RefinementModal';
import { StyleLinter } from './components/StyleLinter';
import { LearningBooks } from './components/LearningBooks';
import { ImageGenerator } from './components/ImageGenerator';
import { LibraryView } from './components/LibraryView';
import { StatsView } from './components/StatsView';
import { IdeasView } from './components/IdeasView';
import { useIndexedDB } from './hooks/useIndexedDB';
import { useLearningDB } from './hooks/useLearningDB';
import { useLibraryDB } from './hooks/useLibraryDB';
import { useClaudeAPI } from './hooks/useClaudeAPI';
import { applyDistillation, rebuildFromConsolidation, CONSOLIDATION_THRESHOLD } from './utils/lessonEngine';
import type { ReformulationResponse, WinningPost, HookEntry, Lesson, LibraryEntry, LibraryThumbnail, PostIdea } from './types/index';

interface CurrentReformulation extends ReformulationResponse {}

const TABS = [
  { id: 'reformulator', label: 'Reformulateur' },
  { id: 'images', label: 'Miniatures' },
  { id: 'ideas', label: 'Idées' },
  { id: 'stats', label: 'Stats' },
  { id: 'learning', label: 'Apprentissage' },
  { id: 'library', label: 'Bibliothèque' },
] as const;

export function App() {
  const [currentResponse, setCurrentResponse] = useState<CurrentReformulation | null>(null);
  const [isSavingHook, setIsSavingHook] = useState(false);
  const [activeTab, setActiveTab] = useState<'reformulator' | 'library' | 'learning' | 'images' | 'stats' | 'ideas'>('reformulator');
  const [error, setError] = useState('');
  const [winningPosts, setWinningPosts] = useState<WinningPost[]>([]);
  const [hooks, setHooks] = useState<HookEntry[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [refineTarget, setRefineTarget] = useState<number | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  // Entrée de bibliothèque de la reformulation courante + variante retenue
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  // Texte envoyé au générateur de miniatures via « Créer la miniature »
  const [imageSourceText, setImageSourceText] = useState<string | null>(null);
  // Miniatures générées pour la reformulation courante (aperçu LinkedIn)
  const [sessionThumbnails, setSessionThumbnails] = useState<LibraryThumbnail[]>([]);
  // Texte envoyé au Reformulateur depuis l'onglet Idées
  const [reformulatorSeed, setReformulatorSeed] = useState<string | null>(null);
  // Sources de l'idée en cours de rédaction, jointes au contexte de reformulation
  const [reformulatorSources, setReformulatorSources] = useState<string | null>(null);
  // Entrées créées depuis le générateur de miniatures seul (par texte de post)
  const imageEntryIds = useRef<Record<string, string>>({});
  const db = useIndexedDB();
  const learningDb = useLearningDB();
  const libraryDb = useLibraryDB();
  const { refineVariant, distillLesson, consolidateLessons } = useClaudeAPI();

  useEffect(() => {
    loadLearningData();
  }, []);

  const loadLearningData = async () => {
    try {
      const posts = await learningDb.getWinningPosts();
      const hookList = await learningDb.getHooks();
      const lessonList = await learningDb.getLessons();
      setWinningPosts(posts);
      setHooks(hookList);
      setLessons(lessonList);
    } catch (err) {
      console.error('Erreur de chargement:', err);
    }
  };

  // Boucle d'apprentissage silencieuse: distille l'instruction en règle
  // réutilisable, la stocke, et consolide la mémoire quand elle grossit.
  // Ne doit jamais bloquer ni faire échouer le raffinement lui-même.
  const learnFromRefinement = async (instruction: string, before: string, after: string) => {
    try {
      const existing = await learningDb.getLessons();
      const distilled = await distillLesson({
        instruction,
        variantBefore: before,
        variantAfter: after,
        existingRules: existing.map((l) => ({ id: l.id, rule_text: l.rule_text })),
      });

      if (!distilled.generalizable) return;

      const lesson = applyDistillation(distilled, instruction, existing);
      await learningDb.putLesson(lesson);

      let updated = await learningDb.getLessons();
      if (updated.length >= CONSOLIDATION_THRESHOLD) {
        const consolidated = await consolidateLessons(updated);
        updated = rebuildFromConsolidation(consolidated);
        await learningDb.replaceLessons(updated);
      }
      setLessons(updated);
    } catch (err) {
      console.error('Apprentissage silencieux échoué:', err);
    }
  };

  const handleRefineVariant = async (instruction: string) => {
    if (refineTarget === null || !currentResponse) return;

    setIsRefining(true);
    try {
      const before = currentResponse.variants[refineTarget];
      const refined = await refineVariant(before, instruction, currentResponse.source_post);

      const variants = [...currentResponse.variants] as [string, string, string];
      variants[refineTarget] = refined;
      setCurrentResponse({ ...currentResponse, variants });

      // La bibliothèque reflète toujours la dernière version des variantes
      if (currentEntryId) {
        void libraryDb.updateEntry(currentEntryId, { variants });
      }

      void learnFromRefinement(instruction, before, refined);
    } finally {
      setIsRefining(false);
    }
  };

  // Chaque reformulation est archivée d'office dans la bibliothèque
  const handleReformulate = (response: CurrentReformulation) => {
    setCurrentResponse(response);
    setError('');
    setChosenIndex(null);
    setImageSourceText(null);
    setSessionThumbnails([]);

    const entry: LibraryEntry = {
      id: `lib-${Date.now()}`,
      date_creation: new Date().toISOString(),
      date_updated: new Date().toISOString(),
      source_post: response.source_post,
      variants: response.variants,
      chosen_index: null,
      angle: response.angle,
      trigger_emotionnel: response.trigger_emotionnel,
      keyword: response.keyword,
      thumbnails: [],
    };
    setCurrentEntryId(entry.id);
    void libraryDb.putEntry(entry).catch((err) => console.error('Archivage échoué:', err));
  };

  // « Créer la miniature » sur une variante: bascule vers l'onglet
  // Miniatures avec le texte de cette variante prérempli
  const handleCreateThumbnail = (index: number) => {
    if (!currentResponse) return;
    setImageSourceText(currentResponse.variants[index]);
    setActiveTab('images');
  };

  // Depuis l'onglet Idées: pré-remplit le Reformulateur (texte + sources) et bascule dessus.
  const handleWriteFromIdea = (idea: PostIdea) => {
    setReformulatorSeed(`${idea.titre}\n\n${idea.angle}`.trim());
    // Sources réelles de l'idée: titre + date + URL, pour appuyer le post
    const srcLines = (idea.sources || [])
      .map((s) => `- ${s.titre}${s.date ? ` (${s.date})` : ''} : ${s.url}`)
      .join('\n');
    const ctx = [idea.why_now, srcLines].filter((x) => x && x.trim()).join('\n');
    setReformulatorSources(ctx.trim() ? ctx : null);
    setActiveTab('reformulator');
  };

  const handleChooseVariant = (index: number) => {
    const next = chosenIndex === index ? null : index;
    setChosenIndex(next);
    if (currentEntryId) {
      void libraryDb.updateEntry(currentEntryId, { chosen_index: next });
    }
  };

  // Miniatures générées: rattachées à l'entrée de la reformulation courante
  // si le texte correspond, sinon à une entrée dédiée (une par texte de post)
  const handleThumbnailsGenerated = async (postText: string, thumbnails: LibraryThumbnail[]) => {
    try {
      const normalized = postText.trim();
      const matchesCurrent =
        currentResponse &&
        (normalized === currentResponse.source_post.trim() ||
          currentResponse.variants.some((v) => v.trim() === normalized));
      if (currentEntryId && matchesCurrent) {
        setSessionThumbnails(thumbnails);
        await libraryDb.updateEntry(currentEntryId, { thumbnails });
        return;
      }

      const existingId = imageEntryIds.current[normalized];
      if (existingId && (await libraryDb.getEntry(existingId))) {
        await libraryDb.updateEntry(existingId, { thumbnails });
        return;
      }

      const entry: LibraryEntry = {
        id: `lib-${Date.now()}`,
        date_creation: new Date().toISOString(),
        date_updated: new Date().toISOString(),
        source_post: postText,
        variants: null,
        chosen_index: null,
        angle: '',
        trigger_emotionnel: '',
        keyword: '',
        thumbnails,
      };
      imageEntryIds.current[normalized] = entry.id;
      await libraryDb.putEntry(entry);
    } catch (err) {
      console.error('Archivage des miniatures échoué:', err);
    }
  };

  const handleSaveHook = async (data: any) => {
    setIsSavingHook(true);
    setError('');

    try {
      // Utiliser le hook extrait de la première variante
      const hookDoc = {
        id: `local-${Date.now()}`,
        source_post: data.source_post,
        variants: data.variants,
        hook: data.angle, // Le "hook" stocké est l'angle identifié
        angle: data.angle,
        trigger_emotionnel: data.trigger_emotionnel,
        cta_generated: `Commentez "${data.keyword}" et recevez la ressource`,
        date_creation: new Date().toISOString(),
        status: 'draft' as const,
      };

      await db.saveHook(hookDoc);
      alert('Post original, analyse et variantes sauvegardés dans la banque.');
      setCurrentResponse(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setIsSavingHook(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Header */}
      <header className="bg-forest text-cream">
        <div className="max-w-6xl mx-auto px-6 pt-6 pb-12">
          <div className="flex justify-between items-baseline border-b border-cream/15 pb-5">
            <span className="text-sm font-medium tracking-caps uppercase">Charlie</span>
            <span className="text-xs text-cream/60 tracking-caps uppercase">Studio éditorial LinkedIn</span>
          </div>
          <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] mt-10 max-w-4xl">
            Générez vos posts LinkedIn.
            <br />
            <span className="italic text-cream/80">Créez vos miniatures.</span>
          </h1>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-cream border-b border-line sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 flex gap-10">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'reformulator') loadLearningData();
              }}
              className={`py-4 text-xs uppercase tracking-caps border-b transition -mb-px ${
                activeTab === tab.id
                  ? 'border-ink text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {tab.id === 'learning' && ` (${winningPosts.length + hooks.length})`}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3">
            {[
              { href: '/', label: 'Emailing' },
              { href: '/scraper', label: 'Scraper' },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="group flex items-center gap-2 border border-forest/30 bg-paper px-5 py-2.5 text-sm uppercase tracking-caps font-medium text-forest transition-all duration-300 hover:bg-forest hover:text-cream hover:border-forest hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_rgba(12,42,27,0.2)]"
              >
                <span>{item.label}</span>
                <span className="transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12 w-full flex-1">
        {activeTab === 'reformulator' ? (
          <>
            {(winningPosts.length > 0 || hooks.length > 0 || lessons.length > 0) && (
              <div className="border border-line bg-paper px-5 py-4 mb-8">
                <p className="text-xs text-muted tracking-wide">
                  <span className="text-ink font-medium">Apprentissage actif</span>
                  {' — '}
                  {winningPosts.length} post(s), {hooks.length} hook(s) et {lessons.length} règle(s) apprise(s) guident chaque reformulation.
                </p>
              </div>
            )}

            <ReformulationForm onReformulate={handleReformulate} winningPosts={winningPosts} hookEntries={hooks} lessons={lessons} seedText={reformulatorSeed} seedSources={reformulatorSources} />

            {currentResponse && (
              <>
                <VariantsDisplay
                  response={currentResponse}
                  onSave={handleSaveHook}
                  isSaving={isSavingHook}
                  onRefineRequest={setRefineTarget}
                  refiningIndex={isRefining ? refineTarget : null}
                  chosenIndex={chosenIndex}
                  onChoose={handleChooseVariant}
                  onCreateThumbnail={handleCreateThumbnail}
                  thumbnailUrls={sessionThumbnails.map((t) => t.url)}
                />

                <StyleLinter variants={currentResponse.variants} />

                <RefinementModal
                  isOpen={refineTarget !== null}
                  variantLabel={`Variante ${(refineTarget ?? 0) + 1}`}
                  variantText={refineTarget !== null ? currentResponse.variants[refineTarget] : ''}
                  onRefine={handleRefineVariant}
                  onClose={() => setRefineTarget(null)}
                  isLoading={isRefining}
                />
              </>
            )}

            {error && (
              <div className="border border-red-300 bg-paper text-red-800 px-5 py-4 text-sm">
                {error}
              </div>
            )}
          </>
        ) : activeTab === 'library' ? (
          <LibraryView />
        ) : activeTab === 'ideas' ? (
          <IdeasView onWritePost={handleWriteFromIdea} />
        ) : activeTab === 'stats' ? (
          <StatsView />
        ) : activeTab === 'learning' ? (
          <LearningBooks />
        ) : (
          <ImageGenerator
            selectedPostText={
              imageSourceText ??
              (currentResponse
                ? chosenIndex !== null
                  ? currentResponse.variants[chosenIndex]
                  : currentResponse.source_post
                : '')
            }
            onThumbnailsGenerated={handleThumbnailsGenerated}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-forest text-cream/50 py-8 mt-16">
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center text-xs tracking-caps uppercase">
          <span>Charlie</span>
          <span>Paris — {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
