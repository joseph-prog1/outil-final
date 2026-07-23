import { useState, useEffect, useRef } from 'react';
import { useLearningDB } from '../hooks/useLearningDB';
import { useClaudeAPI } from '../hooks/useClaudeAPI';
import type { LinkedInPost, PatternsReport, VisualPatternsReport, MatchingReport, AnalyticsDashboard, WinningPost, Lesson, LessonCategory } from '../types/index';

const DEMO_LABELS: Record<string, string> = {
  'Job title': 'Postes',
  'Company': 'Entreprises',
  'Industry': 'Secteurs',
  'Location': 'Localisation',
  'Seniority': 'Séniorité',
  'Company size': "Taille d'entreprise",
  'Poste': 'Postes',
  'Entreprise': 'Entreprises',
  'Secteur': 'Secteurs',
  'Localisation': 'Localisation',
  'Ancienneté': 'Séniorité',
};

const TOPIC_LABELS: Record<string, string> = {
  annonce_ia: 'Annonce / actu IA',
  feature_produit: 'Démo de fonctionnalité',
  workflow_methode: 'Méthode / how-to',
  actu_finance: 'Actualité finance',
  partenariat: 'Partenariat',
  resultats_chiffres: 'Résultats chiffrés',
  storytelling: 'Récit / équipe',
  prospection: 'Prospection / signaux',
};

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';

const AUTHORS = [
  { id: 'thomas', label: 'Thomas' },
  { id: 'mathis', label: 'Mathis' },
];

const VALID_CATEGORIES: LessonCategory[] = ['ton', 'structure', 'hook', 'cta', 'vocabulaire', 'longueur', 'autre'];

function formatNumber(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR');
}

export function StatsView() {
  const [posts, setPosts] = useState<LinkedInPost[]>([]);
  const [authorFilter, setAuthorFilter] = useState<string>('tous');
  const [sortBy, setSortBy] = useState<'impressions' | 'date'>('impressions');
  const [importAuthor, setImportAuthor] = useState('thomas');
  const [importing, setImporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingVisuals, setAnalyzingVisuals] = useState(false);
  const [analyzingMatching, setAnalyzingMatching] = useState(false);
  const [report, setReport] = useState<PatternsReport | null>(null);
  const [visualReport, setVisualReport] = useState<VisualPatternsReport | null>(null);
  const [matchingReport, setMatchingReport] = useState<MatchingReport | null>(null);
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [addingWinner, setAddingWinner] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const learningDb = useLearningDB();
  const { analyzeWinningPost } = useClaudeAPI();

  useEffect(() => {
    load();
  }, []);

  // Recharge le tableau de bord quand le filtre auteur change
  useEffect(() => {
    loadDashboard();
  }, [authorFilter]);

  const loadDashboard = async () => {
    try {
      const q = authorFilter === 'tous' ? '' : `?author=${authorFilter}`;
      const response = await fetch(`${SERVER_URL}/api/linkedin-analytics${q}`);
      if (!response.ok) return;
      const data = await response.json();
      setDashboard(data.has_data ? data : null);
    } catch {
      /* silencieux: le tableau de bord est optionnel */
    }
  };

  const load = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/linkedin-posts`);
      if (!response.ok) throw new Error(`Erreur: ${response.status}`);
      const data = await response.json();
      setPosts(data.posts);
    } catch (err) {
      setError(err instanceof TypeError ? `Impossible de joindre le serveur (${SERVER_URL}).` : err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setError('');
    setMessage('');
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(Array.from(new Uint8Array(buffer), (b) => String.fromCharCode(b)).join(''));
      const response = await fetch(`${SERVER_URL}/api/linkedin-posts/import-analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: importAuthor, data_base64: base64 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Erreur: ${response.status}`);
      setMessage(`Import réussi : ${data.parsed} post(s) lus, ${data.added} ajouté(s), ${data.updated} mis à jour.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'import");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError('');
    setReport(null);
    try {
      const response = await fetch(`${SERVER_URL}/api/linkedin-posts/analyze-patterns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authorFilter === 'tous' ? {} : { author: authorFilter }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Erreur: ${response.status}`);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'analyse");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzeVisuals = async () => {
    setAnalyzingVisuals(true);
    setError('');
    setVisualReport(null);
    try {
      const response = await fetch(`${SERVER_URL}/api/linkedin-posts/analyze-visuals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authorFilter === 'tous' ? {} : { author: authorFilter }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Erreur: ${response.status}`);
      setVisualReport(data);
      setMessage('Patterns visuels analysés — ils guident désormais la génération de miniatures.');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'analyse visuelle");
    } finally {
      setAnalyzingVisuals(false);
    }
  };

  const handleAnalyzeMatching = async () => {
    setAnalyzingMatching(true);
    setError('');
    setMatchingReport(null);
    try {
      const response = await fetch(`${SERVER_URL}/api/linkedin-posts/analyze-matching`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authorFilter === 'tous' ? {} : { author: authorFilter }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Erreur: ${response.status}`);
      setMatchingReport(data);
      setMessage('Matching sujet → archétype calculé — il pilote désormais le choix de miniature.');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'analyse de matching");
    } finally {
      setAnalyzingMatching(false);
    }
  };

  // Injecte les règles du rapport dans la mémoire d'apprentissage
  const handleAdoptRules = async () => {
    if (!report?.regles?.length) return;
    try {
      for (const regle of report.regles) {
        const category = (VALID_CATEGORIES as string[]).includes(regle.category)
          ? (regle.category as LessonCategory)
          : 'autre';
        const lesson: Lesson = {
          id: `stats-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          rule_text: regle.rule_text,
          category,
          source_instruction: 'Analyse des patterns sur les stats LinkedIn',
          occurrences: 1,
          date_added: new Date().toISOString(),
          date_last_seen: new Date().toISOString(),
        };
        await learningDb.putLesson(lesson);
      }
      setMessage(`${report.regles.length} règle(s) ajoutée(s) à l'apprentissage.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  // Ajoute un post performant aux posts gagnants (analyse structurelle incluse)
  const handleAddWinner = async (post: LinkedInPost) => {
    if (!post.text?.trim()) return;
    setAddingWinner(post.id);
    setError('');
    try {
      const analysis = await analyzeWinningPost(post.text);
      const winner: WinningPost = {
        id: `stats-${post.id}`,
        post_text: post.text,
        analysis,
        date_added: new Date().toISOString(),
      };
      await learningDb.addWinningPost(winner);
      setMessage('Post ajouté aux posts gagnants.');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'ajout");
    } finally {
      setAddingWinner(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce post des stats ?')) return;
    await fetch(`${SERVER_URL}/api/linkedin-posts/${id}`, { method: 'DELETE' });
    await load();
  };

  const filtered = posts.filter((p) => authorFilter === 'tous' || p.author === authorFilter);
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'impressions') return (b.stats.impressions ?? -1) - (a.stats.impressions ?? -1);
    return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
  });

  const withImpressions = filtered.filter((p) => p.stats.impressions != null);
  const totalImpressions = withImpressions.reduce((sum, p) => sum + (p.stats.impressions ?? 0), 0);
  const best = withImpressions[0]
    ? withImpressions.reduce((max, p) => ((p.stats.impressions ?? 0) > (max.stats.impressions ?? 0) ? p : max))
    : null;

  return (
    <div className="space-y-8">
      {/* En-tête + import */}
      <div className="bg-paper border border-line p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl">
            <h2 className="font-serif text-3xl mb-3">Stats LinkedIn</h2>
            <p className="text-muted text-sm leading-relaxed">
              Vos posts réels et leurs performances. Deux sources : l'export officiel d'analytics
              LinkedIn (statistiques complètes) et le scraping de vos profils (texte, miniatures,
              réactions publiques). L'analyse des patterns en tire des règles qui nourrissent
              directement les prochaines générations.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={importAuthor}
              onChange={(e) => setImportAuthor(e.target.value)}
              className="px-3 py-3 bg-cream/50 border border-line text-xs uppercase tracking-caps focus:outline-none focus:border-forest"
            >
              {AUTHORS.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="px-6 py-3 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-40"
            >
              {importing ? 'Import…' : "Importer l'export analytics"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => handleImportFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        {message && <p className="mt-5 text-sm text-forest border-t border-line pt-4">{message}</p>}
        {error && <p className="mt-5 text-sm text-red-800 border-t border-line pt-4">{error}</p>}
      </div>

      {/* Synthèse + filtres */}
      {posts.length > 0 && (
        <div className="bg-paper border border-line p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-line">
            <div>
              <p className="text-xs uppercase tracking-caps text-muted mb-2">Posts suivis</p>
              <p className="font-serif text-3xl">{filtered.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-caps text-muted mb-2">Impressions totales</p>
              <p className="font-serif text-3xl">{formatNumber(totalImpressions || undefined)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-caps text-muted mb-2">Moyenne / post</p>
              <p className="font-serif text-3xl">
                {withImpressions.length > 0 ? formatNumber(Math.round(totalImpressions / withImpressions.length)) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-caps text-muted mb-2">Meilleur post</p>
              <p className="font-serif text-3xl">{formatNumber(best?.stats.impressions)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-2">
              {['tous', ...AUTHORS.map((a) => a.id)].map((author) => (
                <button
                  key={author}
                  onClick={() => setAuthorFilter(author)}
                  className={`px-4 py-2 text-xs uppercase tracking-caps border transition ${
                    authorFilter === author
                      ? 'border-forest text-forest'
                      : 'border-line text-muted hover:text-ink'
                  }`}
                >
                  {author === 'tous' ? 'Tous' : AUTHORS.find((a) => a.id === author)?.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSortBy(sortBy === 'impressions' ? 'date' : 'impressions')}
                className="text-xs uppercase tracking-caps text-muted hover:text-ink"
              >
                Tri : {sortBy === 'impressions' ? 'impressions' : 'date'}
              </button>
              <button
                onClick={handleAnalyze}
                disabled={analyzing || filtered.length < 3}
                className="px-6 py-3 border border-forest text-forest text-xs uppercase tracking-caps hover:bg-forest hover:text-cream transition disabled:opacity-40"
              >
                {analyzing ? 'Analyse…' : 'Analyser le texte'}
              </button>
              <button
                onClick={handleAnalyzeVisuals}
                disabled={analyzingVisuals}
                className="px-6 py-3 border border-forest text-forest text-xs uppercase tracking-caps hover:bg-forest hover:text-cream transition disabled:opacity-40"
              >
                {analyzingVisuals ? 'Analyse…' : 'Analyser les miniatures'}
              </button>
              <button
                onClick={handleAnalyzeMatching}
                disabled={analyzingMatching}
                className="px-6 py-3 border border-forest text-forest text-xs uppercase tracking-caps hover:bg-forest hover:text-cream transition disabled:opacity-40"
              >
                {analyzingMatching ? 'Analyse…' : 'Matching texte ↔ miniature'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tableau de bord: quand publier / qui te suit */}
      {dashboard && (
        <div className="bg-paper border border-line p-8">
          <h3 className="font-serif text-2xl mb-6">Tableau de bord</h3>

          {/* KPIs audience */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-8 pb-8 border-b border-line">
            <div>
              <p className="text-xs uppercase tracking-caps text-muted mb-2">Abonnés</p>
              <p className="font-serif text-3xl">{formatNumber(dashboard.followers_total ?? undefined)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-caps text-muted mb-2">Gagnés (période)</p>
              <p className="font-serif text-3xl">
                {dashboard.followers_gained != null ? `+${formatNumber(dashboard.followers_gained)}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-caps text-muted mb-2">Meilleur jour</p>
              <p className="font-serif text-3xl">{dashboard.best_day?.weekday ?? '—'}</p>
              {dashboard.best_day && (
                <p className="text-xs text-muted mt-1">{formatNumber(dashboard.best_day.avg_impressions)} impr./post</p>
              )}
            </div>
          </div>

          {/* Quand publier: impressions moyennes par jour de la semaine */}
          <div className="mb-8">
            <p className="text-xs uppercase tracking-caps text-muted mb-4">Quand publier — impressions moyennes par jour</p>
            <div className="space-y-2">
              {(() => {
                const max = Math.max(...dashboard.weekday_performance.map((w) => w.avg_impressions), 1);
                return dashboard.weekday_performance.map((w) => (
                  <div key={w.weekday} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-ink/80">{w.weekday}</span>
                    <div className="flex-1 h-6 bg-cream/50 relative">
                      <div
                        className={`h-full ${w.weekday === dashboard.best_day?.weekday ? 'bg-forest' : 'bg-forest/40'}`}
                        style={{ width: `${w.posts ? (w.avg_impressions / max) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-32 text-xs text-muted text-right">
                      {w.posts ? `${formatNumber(w.avg_impressions)} · ${w.posts} posts` : 'aucun post'}
                    </span>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Qui te suit: démographie */}
          {Object.keys(dashboard.demographics).length > 0 && (
            <div className="pt-2">
              <p className="text-xs uppercase tracking-caps text-muted mb-4">Qui te lit</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {['Job title', 'Poste', 'Seniority', 'Ancienneté', 'Industry', 'Secteur', 'Company', 'Entreprise', 'Company size', 'Location', 'Localisation']
                  .filter((cat, i, arr) => dashboard.demographics[cat] && arr.indexOf(cat) === i)
                  .slice(0, 6)
                  .map((cat) => (
                    <div key={cat}>
                      <p className="text-xs uppercase tracking-caps text-forest mb-2">{DEMO_LABELS[cat] ?? cat}</p>
                      <ul className="space-y-1">
                        {dashboard.demographics[cat].slice(0, 5).map((d, i) => (
                          <li key={i} className="flex justify-between text-sm text-ink/80">
                            <span className="truncate pr-2">{d.value}</span>
                            <span className="text-muted flex-shrink-0">{d.percentage}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rapport de patterns */}
      {report && (
        <div className="bg-paper border border-forest p-8">
          <h3 className="font-serif text-2xl mb-4">Patterns détectés</h3>
          <p className="text-sm text-ink/85 leading-relaxed mb-6">{report.resume}</p>

          <div className="space-y-4 mb-6">
            {report.patterns.map((pattern, i) => (
              <div key={i} className="border-l-2 border-forest pl-4">
                <p className="text-sm font-medium text-ink">{pattern.titre}</p>
                <p className="text-sm text-muted leading-relaxed mt-1">{pattern.detail}</p>
              </div>
            ))}
          </div>

          <div className="mb-6">
            <p className="text-xs uppercase tracking-caps text-muted mb-3">Sujets gagnants</p>
            <div className="flex flex-wrap gap-2">
              {report.sujets_gagnants.map((sujet, i) => (
                <span key={i} className="px-3 py-1.5 border border-line text-sm text-ink/85">{sujet}</span>
              ))}
            </div>
          </div>

          <div className="pt-5 border-t border-line">
            <p className="text-xs uppercase tracking-caps text-muted mb-3">
              Règles proposées ({report.regles.length})
            </p>
            <ul className="space-y-2 mb-5">
              {report.regles.map((regle, i) => (
                <li key={i} className="text-sm text-ink/85">
                  {regle.rule_text}
                  <span className="text-xs text-muted ml-2">({regle.category})</span>
                </li>
              ))}
            </ul>
            <button
              onClick={handleAdoptRules}
              className="px-6 py-3 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition"
            >
              Ajouter ces règles à l'apprentissage
            </button>
            <p className="text-xs text-muted mt-3">
              Ces règles alimentent déjà automatiquement la reformulation. Le bouton les ajoute
              aussi à la mémoire d'apprentissage éditable.
            </p>
          </div>
        </div>
      )}

      {/* Rapport visuel des miniatures */}
      {visualReport && (
        <div className="bg-paper border border-forest p-8">
          <h3 className="font-serif text-2xl mb-4">Patterns visuels des miniatures gagnantes</h3>
          <p className="text-sm text-ink/85 leading-relaxed mb-6">{visualReport.resume}</p>

          {visualReport.archetypes_gagnants?.length > 0 && (
            <div className="mb-6">
              <p className="text-xs uppercase tracking-caps text-muted mb-3">
                Compositions qui performent (corrélées aux impressions)
              </p>
              <div className="space-y-2">
                {visualReport.archetypes_gagnants.map((a, i) => (
                  <div key={i} className="border-l-2 border-forest pl-4 text-sm text-ink/85">{a}</div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-5 border-t border-line">
            <p className="text-xs uppercase tracking-caps text-muted mb-3">
              Règles visuelles ({visualReport.regles.length})
            </p>
            <ul className="space-y-2">
              {visualReport.regles.map((r, i) => (
                <li key={i} className="text-sm text-ink/85">{r}</li>
              ))}
            </ul>
            <p className="text-xs text-muted mt-4">
              Appliquées automatiquement à chaque génération de miniatures.
            </p>
          </div>
        </div>
      )}

      {/* Table de matching sujet → archétype */}
      {matchingReport && (
        <div className="bg-paper border border-forest p-8">
          <h3 className="font-serif text-2xl mb-2">Matching texte ↔ miniature</h3>
          <p className="text-sm text-muted leading-relaxed mb-6">
            Pour chaque type de sujet, l'archétype de miniature qui a le mieux performé sur vos
            vrais posts ({matchingReport.sample} posts croisés). Le générateur choisit désormais
            l'archétype en fonction du sujet du texte.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-caps text-muted border-b border-line">
                  <th className="text-left py-2 pr-4 font-normal">Sujet du post</th>
                  <th className="text-left py-2 pr-4 font-normal">Archétype gagnant</th>
                  <th className="text-left py-2 font-normal">Alternatives</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(matchingReport.topics)
                  .sort((a, b) => (b[1][0]?.avg ?? 0) - (a[1][0]?.avg ?? 0))
                  .map(([topic, ranked]) => (
                    <tr key={topic} className="border-b border-line/60">
                      <td className="py-3 pr-4 text-ink">{TOPIC_LABELS[topic] ?? topic}</td>
                      <td className="py-3 pr-4">
                        <span className="text-forest font-medium">{ranked[0]?.archetype}</span>
                        <span className="text-muted text-xs ml-2">
                          {ranked[0]?.avg.toLocaleString('fr-FR')} impr. moy. · n={ranked[0]?.count}
                        </span>
                      </td>
                      <td className="py-3 text-muted text-xs">
                        {ranked.slice(1, 3).map((r) => `${r.archetype} (${r.avg.toLocaleString('fr-FR')})`).join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted mt-5 pt-4 border-t border-line">
            Imposé automatiquement au directeur artistique à chaque génération de miniatures.
          </p>
        </div>
      )}

      {/* Liste des posts */}
      {posts.length === 0 ? (
        <div className="bg-paper border border-line p-8">
          <p className="text-sm text-muted italic">
            Aucun post pour le moment. Importez votre export d'analytics LinkedIn ci-dessus, ou
            demandez à Claude de scraper vos profils.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((post) => (
            <div key={post.id} className="bg-paper border border-line p-6 flex flex-wrap gap-6">
              {post.thumbnail_url && (
                <img src={post.thumbnail_url} alt="Miniature" className="w-28 h-auto self-start border border-line" />
              )}
              <div className="flex-1 min-w-64">
                <div className="flex flex-wrap items-baseline gap-4 mb-2 text-xs uppercase tracking-caps text-muted">
                  <span>{AUTHORS.find((a) => a.id === post.author)?.label ?? post.author}</span>
                  {post.date && <span>{new Date(post.date).toLocaleDateString('fr-FR')}</span>}
                  <span className="normal-case tracking-normal">
                    {formatNumber(post.stats.impressions)} impressions
                    {post.stats.reactions != null && ` · ${formatNumber(post.stats.reactions)} réactions`}
                    {post.stats.comments != null && ` · ${formatNumber(post.stats.comments)} commentaires`}
                    {post.stats.engagement_rate != null && ` · ${(post.stats.engagement_rate * 100).toFixed(1)} % eng.`}
                  </span>
                </div>
                {post.text ? (
                  <p className="text-sm text-ink/85 leading-relaxed line-clamp-3 whitespace-pre-wrap">{post.text}</p>
                ) : (
                  <p className="text-sm text-muted italic">
                    Texte non récupéré — le scraping le complètera.{' '}
                    <a href={post.url} target="_blank" rel="noreferrer" className="underline hover:text-ink">Voir sur LinkedIn</a>
                  </p>
                )}
                <div className="flex gap-4 mt-3 text-xs uppercase tracking-caps">
                  {post.text && (
                    <button
                      onClick={() => handleAddWinner(post)}
                      disabled={addingWinner === post.id}
                      className="text-forest hover:underline disabled:opacity-40"
                    >
                      {addingWinner === post.id ? 'Analyse…' : 'Ajouter aux posts gagnants'}
                    </button>
                  )}
                  <a href={post.url} target="_blank" rel="noreferrer" className="text-muted hover:text-ink">
                    Ouvrir
                  </a>
                  <button onClick={() => handleDelete(post.id)} className="text-muted hover:text-red-700 ml-auto">
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
