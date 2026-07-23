import { useState, useEffect } from 'react';
import { useLearningDB } from '../hooks/useLearningDB';
import { useClaudeAPI } from '../hooks/useClaudeAPI';
import { sortLessonsByStrength } from '../utils/lessonEngine';
import type { WinningPost, HookEntry, Lesson } from '../types/index';

export function LearningBooks() {
  const [postText, setPostText] = useState('');
  const [hookText, setHookText] = useState('');
  const [winningPosts, setWinningPosts] = useState<WinningPost[]>([]);
  const [hooks, setHooks] = useState<HookEntry[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const db = useLearningDB();
  const { analyzeWinningPost } = useClaudeAPI();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const posts = await db.getWinningPosts();
      const hookList = await db.getHooks();
      const lessonList = await db.getLessons();
      setWinningPosts(posts);
      setHooks(hookList);
      setLessons(lessonList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  };

  const handleAddWinningPost = async () => {
    if (!postText.trim()) {
      setError('Veuillez entrer un post gagnant');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const analysis = await analyzeWinningPost(postText);

      const winningPost: WinningPost = {
        id: `winning-${Date.now()}`,
        post_text: postText,
        analysis,
        date_added: new Date().toISOString(),
      };

      await db.addWinningPost(winningPost);
      setPostText('');
      await loadData();
      alert('Post gagnant ajouté.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'analyse');
    } finally {
      setLoading(false);
    }
  };

  const handleAddHook = async () => {
    if (!hookText.trim()) {
      setError('Veuillez entrer un hook');
      return;
    }

    try {
      const hook: HookEntry = {
        id: `hook-${Date.now()}`,
        hook_text: hookText,
        date_added: new Date().toISOString(),
      };

      await db.addHook(hook);
      setHookText('');
      await loadData();
      alert('Hook ajouté.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'ajout');
    }
  };

  const handleDeletePost = async (id: string) => {
    if (!confirm('Supprimer ce post?')) return;
    try {
      await db.deleteWinningPost(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de suppression');
    }
  };

  const handleDeleteHook = async (id: string) => {
    if (!confirm('Supprimer ce hook?')) return;
    try {
      await db.deleteHook(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de suppression');
    }
  };

  const handleDeleteLesson = async (id: string) => {
    if (!confirm('Supprimer cette règle apprise?')) return;
    try {
      await db.deleteLesson(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de suppression');
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="border border-red-300 bg-paper text-red-800 px-5 py-4 text-sm">
          {error}
        </div>
      )}

      {/* Section Posts Gagnants */}
      <div className="bg-paper border border-line p-8">
        <h2 className="font-serif text-3xl mb-3">Posts gagnants</h2>
        <p className="text-muted mb-6 text-sm leading-relaxed">
          Collez un post performant, externe ou interne. Claude analyse automatiquement pourquoi il fonctionne.
        </p>

        <textarea
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          placeholder="Collez ici un post LinkedIn gagnant…"
          className="w-full h-32 p-4 bg-cream/50 border border-line text-sm leading-relaxed focus:outline-none focus:border-forest mb-5"
          disabled={loading}
        />

        <button
          onClick={handleAddWinningPost}
          disabled={loading || !postText.trim()}
          className="w-full px-6 py-3 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-40"
        >
          {loading ? 'Analyse en cours…' : 'Analyser et ajouter'}
        </button>

        {winningPosts.length > 0 && (
          <div className="mt-8 space-y-3">
            <h3 className="text-xs uppercase tracking-caps text-muted mb-4">Posts sauvegardés ({winningPosts.length})</h3>
            {winningPosts.map((post) => (
              <div key={post.id} className="border border-line bg-cream/40 p-4 text-sm">
                <p className="text-ink/85 mb-3 line-clamp-2 leading-relaxed">{post.post_text}</p>
                <div className="flex justify-between items-center text-xs text-muted">
                  <span>{post.analysis.angle} — {post.analysis.trigger_emotionnel}</span>
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    className="uppercase tracking-caps hover:text-red-700"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section Hooks */}
      <div className="bg-paper border border-line p-8">
        <h2 className="font-serif text-3xl mb-3">Hooks forts</h2>
        <p className="text-muted mb-6 text-sm leading-relaxed">
          Ajoutez des accroches excellentes, d'où qu'elles viennent. Elles enrichissent l'apprentissage du modèle.
        </p>

        <textarea
          value={hookText}
          onChange={(e) => setHookText(e.target.value)}
          placeholder="Entrez un hook fort (ex. « Cette base de données gratuite mérite votre attention »)…"
          className="w-full h-20 p-4 bg-cream/50 border border-line text-sm leading-relaxed focus:outline-none focus:border-forest mb-5"
          disabled={loading}
        />

        <button
          onClick={handleAddHook}
          disabled={!hookText.trim()}
          className="w-full px-6 py-3 border border-ink text-ink text-xs uppercase tracking-caps hover:bg-ink hover:text-cream transition disabled:opacity-40"
        >
          Ajouter le hook
        </button>

        {hooks.length > 0 && (
          <div className="mt-8 space-y-3">
            <h3 className="text-xs uppercase tracking-caps text-muted mb-4">Hooks sauvegardés ({hooks.length})</h3>
            {hooks.map((hook) => (
              <div key={hook.id} className="border border-line bg-cream/40 p-4 text-sm">
                <div className="flex justify-between items-start gap-3">
                  <p className="text-ink/85 flex-1 leading-relaxed">«&nbsp;{hook.hook_text}&nbsp;»</p>
                  <button
                    onClick={() => handleDeleteHook(hook.id)}
                    className="text-xs uppercase tracking-caps text-muted hover:text-red-700 flex-shrink-0"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section Règles apprises */}
      <div className="bg-paper border border-line p-8">
        <h2 className="font-serif text-3xl mb-3">Règles apprises</h2>
        <p className="text-muted mb-6 text-sm leading-relaxed">
          Créées automatiquement quand vous affinez une variante : chaque correction est distillée en règle réutilisable, appliquée aux prochaines générations. La mémoire se consolide seule au-delà de 12 règles.
        </p>

        {lessons.length === 0 ? (
          <p className="text-sm text-muted italic">
            Aucune règle pour le moment. Affinez une variante dans l'onglet Reformulateur pour commencer l'apprentissage.
          </p>
        ) : (
          <div className="space-y-3">
            {sortLessonsByStrength(lessons).map((lesson) => (
              <div key={lesson.id} className="border border-line bg-cream/40 p-4 text-sm">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <p className="text-ink/85 leading-relaxed">{lesson.rule_text}</p>
                    <p className="text-xs text-muted mt-2">
                      {lesson.category} — exprimé {lesson.occurrences} fois — dernière fois le {new Date(lesson.date_last_seen).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteLesson(lesson.id)}
                    className="text-xs uppercase tracking-caps text-muted hover:text-red-700 flex-shrink-0"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status */}
      {(winningPosts.length > 0 || hooks.length > 0 || lessons.length > 0) && (
        <div className="border border-line bg-paper px-5 py-4">
          <p className="text-xs text-muted tracking-wide">
            <span className="text-ink font-medium">Apprentissage actif</span>
            {' — '}
            {winningPosts.length} post(s), {hooks.length} hook(s) et {lessons.length} règle(s) apprise(s) utilisés pour améliorer chaque reformulation.
          </p>
        </div>
      )}
    </div>
  );
}
