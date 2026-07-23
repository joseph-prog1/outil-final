'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
// Module pur partagé avec le serveur : déduit un sujet parlant du texte du post
// (« l'IA dans la gestion de patrimoine »…) pour le DM de relance.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { deriveSujet } = require('../../lib/derive-sujet.js');

interface Profile {
  firstName: string;
  lastName: string;
  jobTitle: string;
  company: string;
  companySize: string;
  industry: string;
  location: string;
  profileUrl: string;
  photoUrl: string;
  commentCount: number;
  lastCommentDate: string;
  lastCommentText: string;
  postContext: string;
  dateAdded: string;
  score: number;
  category: string;
}

// Options de tri : chaque clé encode le champ ET le sens (le « bon » ordre diffère
// selon le champ — score décroissant, date d'ajout récente en premier, etc.).
const SORT_OPTIONS: Record<string, { label: string; sortBy: string; sortOrder: string }> = {
  'score-desc': { label: 'Score (élevé → faible)', sortBy: 'score', sortOrder: 'desc' },
  'date-desc': { label: "Date d'ajout (récent → ancien)", sortBy: 'dateAdded', sortOrder: 'desc' },
  'date-asc': { label: "Date d'ajout (ancien → récent)", sortBy: 'dateAdded', sortOrder: 'asc' },
  'comment-recent': { label: 'Dernier commentaire (récent → ancien)', sortBy: 'daysAgo', sortOrder: 'asc' },
};

// ISO -> date lisible (jj/mm/aaaa). Vide/invalide -> tiret.
function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR');
}

const categoryBadges = {
  ultra_boss: { color: '#9B2C2C', label: 'Ultra Boss' },
  boss: { color: '#B7791F', label: 'Boss' },
  cgp: { color: '#1A3D2A', label: 'CGP' },
  out_of_scope: { color: '#6F6A5C', label: 'Hors cadre' },
};

const inputClass =
  'px-3 py-2 bg-cream border border-line text-ink text-sm placeholder-muted focus:border-forest focus:outline-none';

// Même canonicalisation d'URL que côté serveur (lib/relance-store.js) pour que
// l'état relance (file, relancés) matche les profils quelle que soit l'URL.
function normUrl(url: string): string {
  return (url || '').split('?')[0].split('#')[0].trim().replace(/\/+$/, '').toLowerCase();
}

interface RelanceStatus {
  sentToday: number;
  dailyTarget: number;
  queue: Array<{ profileUrl: string; name: string; key: string }>;
  relancedUrls: Record<string, string>; // key -> 'sent' | 'replied'
  failedUrls: Record<string, boolean>;
  worker: { running: boolean; status: string | null };
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Suivi des prospects contactés : map { profileUrl: true }, persistée côté serveur
  const [contacted, setContacted] = useState<Record<string, boolean>>({});
  // Catégories forcées à la main : map { profileUrl: category }
  const [catOverrides, setCatOverrides] = useState<Record<string, string>>({});
  // État relance : quota du jour, file d'attente, profils déjà relancés, worker
  const [relance, setRelance] = useState<RelanceStatus | null>(null);
  const [relanceMsg, setRelanceMsg] = useState('');

  const fetchRelance = useCallback(() => {
    fetch('/scraper/api/relance')
      .then((r) => r.json())
      .then((s) => setRelance(s))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/scraper/api/contacted')
      .then((r) => r.json())
      .then((m) => setContacted(m || {}))
      .catch(() => {});
    fetch('/scraper/api/category')
      .then((r) => r.json())
      .then((m) => setCatOverrides(m || {}))
      .catch(() => {});
    fetchRelance();
    // Le worker et les envois détachés font évoluer l'état en arrière-plan.
    const t = setInterval(fetchRelance, 30000);
    return () => clearInterval(t);
  }, [fetchRelance]);

  const relanceAction = async (payload: Record<string, unknown>) => {
    try {
      const res = await fetch('/scraper/api/relance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setRelanceMsg(data.message || data.error || '');
    } catch (e: any) {
      setRelanceMsg(e.message || 'Erreur réseau');
    } finally {
      fetchRelance();
    }
  };

  const sendRelanceNow = (profile: Profile) => {
    const name = `${profile.firstName} ${profile.lastName}`.trim();
    // Sujet déduit automatiquement du post sous lequel la personne a commenté.
    const sujet = deriveSujet(profile.postContext);
    const ok = window.confirm(
      `Envoyer maintenant ce DM à ${name} ?\n\n` +
      `« Bonjour ${profile.firstName},\n\n` +
      `Avez-vous eu l'occasion de consulter le document sur ${sujet} ?\n\n` +
      `Si l'IA représente un enjeu pour votre cabinet, ce serait avec plaisir que j'échangerais avec vous pour en discuter. »`
    );
    if (!ok) return;
    setRelanceMsg(`Envoi de la relance à ${name}…`);
    relanceAction({ action: 'send', profileUrl: profile.profileUrl, name, sujet });
    // L'envoi détaché prend ~1 min : on re-vérifie l'état après coup.
    setTimeout(fetchRelance, 75000);
  };

  const toggleRelanceQueue = (profile: Profile, inQueue: boolean) => {
    const name = `${profile.firstName} ${profile.lastName}`.trim();
    if (inQueue) {
      relanceAction({ action: 'unqueue', profileUrl: profile.profileUrl });
      return;
    }
    relanceAction({
      action: 'queue',
      profileUrl: profile.profileUrl,
      name,
      firstName: profile.firstName,
      sujet: deriveSujet(profile.postContext),
    });
  };

  const changeCategory = async (profileUrl: string, category: string) => {
    if (!profileUrl) return;
    // 'auto' => on retire l'override et on revient au calcul automatique
    setCatOverrides((prev) => {
      const next = { ...prev };
      if (category === 'auto') delete next[profileUrl];
      else next[profileUrl] = category;
      return next;
    });
    // Reflète tout de suite dans le tableau (sera reconfirmé par le refetch)
    if (category !== 'auto') {
      setProfiles((prev) => prev.map((p) => (p.profileUrl === profileUrl ? { ...p, category } : p)));
    }
    try {
      await fetch('/scraper/api/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl, category }),
      });
      // Refetch pour récupérer la vraie catégorie (surtout après un retour "auto")
      fetchProfiles();
    } catch {
      /* en cas d'échec, le prochain chargement remettra l'état serveur */
    }
  };

  // Suppression définitive côté UI : le profil part dans data/hidden-profiles.json
  // et ne sera plus présenté, même re-scrapé. Restauration possible en éditant ce fichier.
  const deleteProfile = async (profile: Profile) => {
    if (!profile.profileUrl) return;
    const name = `${profile.firstName} ${profile.lastName}`.trim();
    if (!window.confirm(`Supprimer ${name} ? Ce profil ne sera plus présenté, même après un re-scrape.`)) {
      return;
    }
    setProfiles((prev) => prev.filter((p) => p.profileUrl !== profile.profileUrl)); // optimiste
    try {
      await fetch('/scraper/api/hidden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl: profile.profileUrl, hidden: true }),
      });
    } finally {
      fetchProfiles(); // resynchronise total + pagination (ou restaure si échec)
    }
  };

  const toggleContacted = async (profileUrl: string) => {
    if (!profileUrl) return;
    const next = !contacted[profileUrl];
    setContacted((prev) => ({ ...prev, [profileUrl]: next })); // optimiste
    try {
      await fetch('/scraper/api/contacted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl, contacted: next }),
      });
    } catch {
      setContacted((prev) => ({ ...prev, [profileUrl]: !next })); // rollback si échec
    }
  };

  // Filters
  const [minScore, setMinScore] = useState('0');
  const [category, setCategory] = useState('all');
  const [company, setCompany] = useState('');
  const [companySize, setCompanySize] = useState('all');
  const [jobTitle, setJobTitle] = useState('');
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');
  // Filtre « Ajouté le » : bornes YYYY-MM-DD incluses (vides = pas de borne)
  const [addedFrom, setAddedFrom] = useState('');
  const [addedTo, setAddedTo] = useState('');
  const [sortKey, setSortKey] = useState('score-desc');
  const { sortBy, sortOrder } = SORT_OPTIONS[sortKey];

  // Valeurs texte debouncées : évite une requête réseau à chaque frappe
  const [debounced, setDebounced] = useState({ company: '', jobTitle: '', industry: '', location: '', search: '' });
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced({ company, jobTitle, industry, location, search });
    }, 300);
    return () => clearTimeout(t);
  }, [company, jobTitle, industry, location, search]);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        minScore,
        category,
        ...(debounced.company && { company: debounced.company }),
        companySize,
        ...(debounced.jobTitle && { jobTitle: debounced.jobTitle }),
        ...(debounced.industry && { industry: debounced.industry }),
        ...(debounced.location && { location: debounced.location }),
        ...(debounced.search && { search: debounced.search }),
        ...(addedFrom && { addedFrom }),
        ...(addedTo && { addedTo }),
        sortBy,
        sortOrder,
      });

      const res = await fetch(`/scraper/api/profiles?${params}`);
      const data = await res.json();
      setProfiles(data.profiles || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error fetching profiles:', error);
    } finally {
      setLoading(false);
    }
  }, [page, minScore, category, companySize, sortBy, sortOrder, addedFrom, addedTo,
      debounced.company, debounced.jobTitle, debounced.industry, debounced.location, debounced.search]);

  useEffect(() => {
    setPage(1);
  }, [minScore, category, companySize, sortKey, addedFrom, addedTo,
      debounced.company, debounced.jobTitle, debounced.industry, debounced.location, debounced.search]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleResetFilters = () => {
    setMinScore('0');
    setCategory('all');
    setCompany('');
    setCompanySize('all');
    setJobTitle('');
    setIndustry('');
    setLocation('');
    setSearch('');
    setAddedFrom('');
    setAddedTo('');
    setPage(1);
  };

  return (
    // Full-bleed : la page Profils déborde volontairement du conteneur max-w-7xl
    // du layout pour laisser de la place aux 9 colonnes du tableau.
    <div className="space-y-8 w-[95vw] max-w-[1600px] relative left-1/2 -translate-x-1/2">
      <div className="flex justify-between items-baseline">
        <h2 className="font-serif text-4xl text-ink">Profils</h2>
        <Link href="/" className="text-xs tracking-caps uppercase text-muted hover:text-ink transition">
          ← Retour au dashboard
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-paper border border-line p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs tracking-caps uppercase text-muted">Filtres</h3>
          <button
            onClick={handleResetFilters}
            className="text-xs tracking-caps uppercase text-muted hover:text-ink transition"
          >
            Réinitialiser
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={inputClass}
          />

          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className={inputClass}
          >
            <option value="all">Toutes les catégories</option>
            <option value="ultra_boss">Ultra Boss</option>
            <option value="boss">Boss</option>
            <option value="cgp">CGP</option>
            <option value="out_of_scope">Hors cadre</option>
          </select>

          <select
            value={companySize}
            onChange={e => setCompanySize(e.target.value)}
            className={inputClass}
          >
            <option value="all">Toutes les tailles</option>
            <option value="1-10">1-10</option>
            <option value="10-50">10-50</option>
            <option value="1-50">1-50</option>
            <option value="50-100">50-100</option>
            <option value="100-500">100-500</option>
            <option value="500-1000">500-1000</option>
            <option value="1000-5000">1000-5000</option>
            <option value="5000+">5000+</option>
          </select>

          <input
            type="range"
            min="0"
            max="100"
            value={minScore}
            onChange={e => setMinScore(e.target.value)}
            className="w-full accent-forest"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Entreprise…"
            value={company}
            onChange={e => setCompany(e.target.value)}
            className={inputClass}
          />

          <input
            type="text"
            placeholder="Fonction…"
            value={jobTitle}
            onChange={e => setJobTitle(e.target.value)}
            className={inputClass}
          />

          <input
            type="text"
            placeholder="Secteur…"
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            className={inputClass}
          />

          <input
            type="text"
            placeholder="Localisation…"
            value={location}
            onChange={e => setLocation(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Filtre par date d'ajout (colonne « Ajouté le ») */}
        <div className="flex flex-wrap items-center gap-3 text-xs tracking-caps uppercase text-muted">
          <span>Ajouté le</span>
          <label className="flex items-center gap-2">
            du
            <input
              type="date"
              value={addedFrom}
              onChange={(e) => setAddedFrom(e.target.value)}
              max={addedTo || undefined}
              className={inputClass + ' normal-case tracking-normal'}
            />
          </label>
          <label className="flex items-center gap-2">
            au
            <input
              type="date"
              value={addedTo}
              onChange={(e) => setAddedTo(e.target.value)}
              min={addedFrom || undefined}
              className={inputClass + ' normal-case tracking-normal'}
            />
          </label>
          {(addedFrom || addedTo) && (
            <button
              onClick={() => { setAddedFrom(''); setAddedTo(''); }}
              className="text-muted hover:text-ink transition"
              title="Effacer le filtre de date"
            >
              ✕ Effacer
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs tracking-caps uppercase text-muted">
          <label className="flex items-center gap-2">
            <span>Trier par</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="px-2 py-1 bg-cream border border-line text-ink text-xs tracking-normal normal-case focus:border-forest focus:outline-none"
            >
              {Object.entries(SORT_OPTIONS).map(([key, opt]) => (
                <option key={key} value={key}>{opt.label}</option>
              ))}
            </select>
          </label>
          <span>Score minimum : <strong className="text-ink">{minScore}</strong></span>
          <span>Résultats : <strong className="text-ink">{total}</strong> profils</span>
        </div>
      </div>

      {/* Relance : quota du jour, file d'attente, worker */}
      {relance && (
        <div className="bg-paper border border-line p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
          <h3 className="text-xs tracking-caps uppercase text-muted">Relances</h3>
          <span className="text-sm text-ink">
            Aujourd&apos;hui : <strong>{relance.sentToday}/{relance.dailyTarget}</strong>
          </span>
          <label className="flex items-center gap-2 text-xs text-muted">
            Objectif/jour
            <input
              type="number"
              min={1}
              max={15}
              defaultValue={relance.dailyTarget}
              key={`target-${relance.dailyTarget}`}
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v && v !== relance.dailyTarget) relanceAction({ action: 'settings', dailyTarget: v });
              }}
              className="w-14 px-2 py-1 bg-cream border border-line text-ink text-sm focus:border-forest focus:outline-none"
              title="Maximum 15 par jour (anti-restriction LinkedIn)"
            />
          </label>
          <span className="text-sm text-ink">
            File d&apos;attente : <strong>{relance.queue.length}</strong>
          </span>
          {relance.queue.length > 0 && !relance.worker.running && (
            <button
              onClick={() => relanceAction({ action: 'start-worker' })}
              className="px-4 py-1.5 text-xs tracking-caps uppercase bg-forest text-cream border border-forest hover:bg-forest-soft transition"
              title="Vide la file au rythme de l'objectif journalier, avec délais anti-ban (10-15 min entre envois)"
            >
              ▶ Lancer la file
            </button>
          )}
          {relance.worker.running && (
            <>
              <span className="text-xs text-forest tracking-caps uppercase">
                ● Worker actif{relance.worker.status === 'pausing' ? ' (pause anti-ban)' : ''}
              </span>
              <button
                onClick={() => relanceAction({ action: 'stop-worker' })}
                className="px-4 py-1.5 text-xs tracking-caps uppercase border border-line text-muted hover:border-ultra-boss hover:text-ultra-boss transition"
              >
                ■ Arrêter
              </button>
            </>
          )}
          {relanceMsg && <span className="text-xs text-muted italic">{relanceMsg}</span>}
        </div>
      )}

      {/* Table */}
      <div className="bg-paper border border-line overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted tracking-caps uppercase text-xs">Chargement…</div>
        ) : profiles.length === 0 ? (
          <div className="p-12 text-center text-muted">Aucun profil trouvé</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-cream border-b border-line">
                <tr>
                  {['Profil', 'Fonction', 'Entreprise', 'Catégorie', 'Ajouté le', 'Sujet & commentaire', 'Action', 'Contacté', 'Relance', ''].map((h) => (
                    <th key={h} className="px-1.5 py-3 text-left text-xs font-medium text-muted uppercase tracking-caps">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {profiles.map((profile, idx) => {
                  const badgeInfo = categoryBadges[profile.category as keyof typeof categoryBadges];
                  return (
                    <tr key={idx} className="hover:bg-cream/60 transition">
                      <td className="px-1.5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {/* Initiales en fond ; la photo LinkedIn passe par-dessus.
                              Si l'URL a expiré, onError masque la photo et révèle les initiales. */}
                          <div className="relative w-10 h-10 shrink-0">
                            <div className="absolute inset-0 rounded-full bg-forest text-cream flex items-center justify-center text-xs font-medium">
                              {`${(profile.firstName || '').charAt(0)}${(profile.lastName || '').charAt(0)}`.toUpperCase() || '?'}
                            </div>
                            {profile.photoUrl && (
                              <img
                                src={profile.photoUrl}
                                alt={`${profile.firstName} ${profile.lastName}`}
                                referrerPolicy="no-referrer"
                                className="absolute inset-0 w-10 h-10 rounded-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            )}
                          </div>
                          <div className="max-w-[130px]">
                            <p className="font-medium text-ink text-sm truncate" title={`${profile.firstName} ${profile.lastName}`}>
                              {profile.firstName} {profile.lastName}
                            </p>
                            <p className="text-xs text-muted truncate">{profile.location}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-1.5 py-4 max-w-[120px]">
                        <p className="text-sm text-ink line-clamp-2" title={profile.jobTitle}>{profile.jobTitle}</p>
                      </td>
                      <td className="px-1.5 py-4 max-w-[100px]">
                        <p className="text-sm font-medium text-ink truncate" title={profile.company}>{profile.company}</p>
                      </td>
                      <td className="px-1.5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <select
                            value={profile.category}
                            onChange={(e) => changeCategory(profile.profileUrl, e.target.value)}
                            className="px-1 py-1 text-[11px] font-medium uppercase tracking-tight border bg-paper cursor-pointer focus:outline-none"
                            style={{ color: badgeInfo.color, borderColor: badgeInfo.color }}
                            title={catOverrides[profile.profileUrl] ? 'Catégorie forcée à la main — choisir « Auto » pour revenir au calcul' : 'Catégorie automatique — vous pouvez la forcer'}
                          >
                            <option value="ultra_boss">Ultra Boss</option>
                            <option value="boss">Boss</option>
                            <option value="cgp">CGP</option>
                            <option value="out_of_scope">Hors cadre</option>
                            {catOverrides[profile.profileUrl] && <option value="auto">↺ Auto</option>}
                          </select>
                          {catOverrides[profile.profileUrl] && (
                            <span title="Catégorie forcée à la main" className="text-xs text-muted">✎</span>
                          )}
                        </div>
                      </td>
                      <td className="px-1.5 py-4 whitespace-nowrap">
                        <p className="text-sm text-ink">{formatDate(profile.dateAdded)}</p>
                      </td>
                      <td className="px-1.5 py-4 max-w-[130px]">
                        {profile.lastCommentText || profile.postContext ? (
                          <div title={`Sujet du post : ${profile.postContext || 'N/A'}\n\nCommentaire : ${profile.lastCommentText || 'N/A'}`}>
                            {profile.lastCommentText && (
                              <p className="text-sm text-ink italic truncate">« {profile.lastCommentText} »</p>
                            )}
                            {profile.postContext && (
                              <p className="text-xs text-muted truncate">Sur : {profile.postContext}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-1.5 py-4 whitespace-nowrap">
                        <a
                          href={profile.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs tracking-caps uppercase text-forest hover:text-forest-soft font-medium"
                        >
                          LinkedIn →
                        </a>
                      </td>
                      <td className="px-1.5 py-4 whitespace-nowrap">
                        {(() => {
                          const isContacted = !!contacted[profile.profileUrl];
                          return (
                            <button
                              onClick={() => toggleContacted(profile.profileUrl)}
                              title={isContacted ? 'Marquer comme non contacté' : 'Marquer comme contacté'}
                              className={
                                'px-3 py-1 text-xs tracking-caps uppercase border transition ' +
                                (isContacted
                                  ? 'bg-forest text-cream border-forest hover:bg-forest-soft'
                                  : 'bg-cream text-muted border-line hover:border-forest hover:text-ink')
                              }
                            >
                              {isContacted ? 'Oui ✓' : 'Non'}
                            </button>
                          );
                        })()}
                      </td>
                      <td className="px-1.5 py-4 whitespace-nowrap">
                        {(() => {
                          if (!relance) return <span className="text-xs text-muted">—</span>;
                          const key = normUrl(profile.profileUrl);
                          const done = relance.relancedUrls[key];
                          if (done === 'replied') {
                            return <span className="text-xs text-forest" title="La personne a répondu au DM initial — pas de relance nécessaire">A répondu 💬</span>;
                          }
                          if (done === 'sent') {
                            return <span className="text-xs text-forest" title="Relance déjà envoyée">Relancé ✓</span>;
                          }
                          const inQueue = relance.queue.some((e) => e.key === key);
                          const failed = relance.failedUrls[key];
                          return (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => sendRelanceNow(profile)}
                                title="Envoyer le DM de relance maintenant"
                                className="px-2 py-1 text-xs border border-forest text-forest hover:bg-forest hover:text-cream transition"
                              >
                                Relancer
                              </button>
                              <button
                                onClick={() => toggleRelanceQueue(profile, inQueue)}
                                title={inQueue ? 'Retirer de la file d\'attente' : 'Ajouter à la file d\'attente (envoi étalé sur la journée)'}
                                className={
                                  'px-2 py-1 text-xs border transition ' +
                                  (inQueue
                                    ? 'bg-boss/10 border-boss text-boss'
                                    : 'border-line text-muted hover:border-forest hover:text-ink')
                                }
                              >
                                {inQueue ? 'En file ✕' : '+ File'}
                              </button>
                              {failed && <span className="text-xs text-ultra-boss" title="Le dernier essai a échoué — vous pouvez réessayer">⚠</span>}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-1.5 py-4 whitespace-nowrap">
                        <button
                          onClick={() => deleteProfile(profile)}
                          title="Supprimer ce profil (ne sera plus présenté, même après un re-scrape)"
                          className="px-2 py-1 text-xs border border-line text-muted hover:border-ultra-boss hover:text-ultra-boss transition"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && profiles.length > 0 && (
        <div className="flex justify-between items-center">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-5 py-2 border border-line text-xs tracking-caps uppercase text-ink disabled:opacity-40 hover:bg-cream transition"
          >
            Précédent
          </button>
          <span className="text-xs tracking-caps uppercase text-muted">
            Page {page} / {Math.ceil(total / 20)}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= Math.ceil(total / 20)}
            className="px-5 py-2 border border-line text-xs tracking-caps uppercase text-ink disabled:opacity-40 hover:bg-cream transition"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
