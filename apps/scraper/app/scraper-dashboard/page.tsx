'use client';

import { useState, useEffect, useRef } from 'react';

const USER_ID = 'default';

export default function ScraperDashboard() {
  const [step, setStep] = useState<'login' | 'scrape'>('login');
  const [sessionSaved, setSessionSaved] = useState(false);
  const [postUrl, setPostUrl] = useState('');
  const [isScraperRunning, setIsScraperRunning] = useState(false);
  const [job, setJob] = useState<any>(null); // { jobId, status, count, error }
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (localStorage.getItem('linkedInSessionSaved')) {
      setSessionSaved(true);
      setStep('scrape');
    }
    // Reprend le suivi d'un job en cours si on recharge la page
    const savedJob = localStorage.getItem('linkedInScrapeJob');
    if (savedJob) {
      setJob({ jobId: savedJob, status: 'running' });
      setIsScraperRunning(true);
      startPolling(savedJob);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPolling = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/scraper/api/scrape?jobId=${encodeURIComponent(jobId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Statut indisponible');
        setJob(data);
        if (data.status === 'done' || data.status === 'error') {
          if (pollRef.current) clearInterval(pollRef.current);
          setIsScraperRunning(false);
          localStorage.removeItem('linkedInScrapeJob');
          if (data.status === 'error') setError(data.error || 'Le scrape a échoué');
        }
      } catch (err: any) {
        // On garde le polling actif : une erreur réseau ponctuelle ne doit pas tuer le suivi
        console.error('poll error', err);
      }
    }, 5000);
  };

  const handleLogin = async () => {
    setError('');
    setIsScraperRunning(true);

    try {
      // Le backend ouvre une fenêtre de navigateur sur linkedin.com/login
      // et attend que la connexion soit terminée pour enregistrer la session.
      const response = await fetch('/scraper/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      localStorage.setItem('linkedInSessionSaved', '1');
      setSessionSaved(true);
      setStep('scrape');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsScraperRunning(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('linkedInSessionSaved');
    setSessionSaved(false);
    setStep('login');
    setJob(null);
    setError('Session effacée. Veuillez vous reconnecter.');
  };

  const handleScrape = async () => {
    if (!postUrl.trim()) {
      setError('Veuillez saisir une URL de post');
      return;
    }

    if (!postUrl.includes('linkedin.com')) {
      setError('Veuillez saisir une URL LinkedIn valide');
      return;
    }

    setError('');
    setIsScraperRunning(true);
    setJob(null);

    try {
      const response = await fetch('/scraper/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postUrl, userId: USER_ID }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Scraping failed');
      }

      // Le scrape tourne en tâche de fond : on suit son statut par polling.
      setJob({ jobId: data.jobId, status: 'running' });
      localStorage.setItem('linkedInScrapeJob', data.jobId);
      startPolling(data.jobId);
    } catch (err: any) {
      setError(err.message);
      setIsScraperRunning(false);
    }
  };

  const inputClass =
    'w-full px-4 py-2 bg-cream border border-line text-ink placeholder-muted focus:border-forest focus:outline-none';
  const labelClass = 'block text-xs tracking-caps uppercase text-muted mb-2';

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex justify-between items-baseline">
        <h2 className="font-serif text-4xl text-ink">Scraper</h2>
        <span className="text-xs tracking-caps uppercase text-muted">
          Extraction des commentateurs
        </span>
      </div>

      {/* Step Indicator */}
      <div className="flex gap-px bg-line border border-line">
        <div className={`flex-1 p-4 ${step === 'login' ? 'bg-forest text-cream' : 'bg-paper text-muted'}`}>
          <div className="text-xs tracking-caps uppercase">Étape 1 — Connexion</div>
          <div className="text-sm mt-1">{sessionSaved ? '✓ Terminé' : 'En attente'}</div>
        </div>
        <div className={`flex-1 p-4 ${step === 'scrape' ? 'bg-forest text-cream' : 'bg-paper text-muted'}`}>
          <div className="text-xs tracking-caps uppercase">Étape 2 — Scrape</div>
          <div className="text-sm mt-1">{job?.status === 'done' ? '✓ Terminé' : job?.status === 'running' ? 'En cours…' : 'En attente'}</div>
        </div>
      </div>

      {/* Login Section */}
      {step === 'login' && (
        <div className="bg-paper border border-line p-8">
          <h3 className="font-serif text-2xl text-ink mb-6">Connexion LinkedIn</h3>

          <div className="border-l-2 border-boss bg-cream px-4 py-3 mb-6">
            <p className="text-sm text-muted">
              Une fenêtre de navigateur va s&apos;ouvrir sur la page de connexion LinkedIn.
              Connectez-vous avec vos identifiants (et le code 2FA si demandé) — la session
              est ensuite enregistrée localement, rien n&apos;est saisi ici.
            </p>
          </div>

          {error && (
            <div className="border-l-2 border-ultra-boss bg-cream px-4 py-3 mb-6">
              <p className="text-sm text-ultra-boss">{error}</p>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={isScraperRunning}
            className="w-full px-6 py-3 bg-forest text-cream text-xs tracking-caps uppercase disabled:opacity-50 hover:bg-forest-soft transition"
          >
            {isScraperRunning
              ? 'Connectez-vous dans la fenêtre ouverte…'
              : 'Se connecter à LinkedIn'}
          </button>
        </div>
      )}

      {/* Scrape Section */}
      {step === 'scrape' && (
        <div className="bg-paper border border-line p-8">
          <h3 className="font-serif text-2xl text-ink mb-6">Scraper les commentaires</h3>

          <div className="border-l-2 border-cgp bg-cream px-4 py-3 mb-6">
            <p className="text-sm text-ink">Session LinkedIn enregistrée ✓</p>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className={labelClass}>URL du post LinkedIn</label>
              <input
                type="text"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://www.linkedin.com/posts/..."
                className={inputClass}
              />
            </div>
            <div className="border-l-2 border-boss bg-cream px-4 py-3">
              <p className="text-sm text-muted">
                Le scrape extrait <strong>tous</strong> les commentateurs, puis visite
                chaque profil pour récupérer l&apos;entreprise et son nombre d&apos;employés.
                Il tourne <strong>en tâche de fond</strong> : vous pouvez quitter cette page,
                le traitement continue et les profils apparaissent au fur et à mesure dans
                l&apos;onglet Profils. Comptez plusieurs minutes à plusieurs dizaines de
                minutes selon le nombre de commentaires.
              </p>
            </div>
          </div>

          {error && (
            <div className="border-l-2 border-ultra-boss bg-cream px-4 py-3 mb-6">
              <p className="text-sm text-ultra-boss">{error}</p>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={handleScrape}
              disabled={isScraperRunning}
              className="flex-1 px-6 py-3 bg-forest text-cream text-xs tracking-caps uppercase disabled:opacity-50 hover:bg-forest-soft transition flex items-center justify-center gap-2"
            >
              {isScraperRunning ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Scrape en cours…
                </>
              ) : (
                'Lancer le scrape'
              )}
            </button>
            <button
              onClick={handleLogout}
              className="px-6 py-3 border border-line text-xs tracking-caps uppercase text-ink hover:bg-cream transition"
            >
              Renouveler la session
            </button>
          </div>
        </div>
      )}

      {/* Suivi du job en tâche de fond */}
      {job && (
        <div className="bg-paper border border-line p-8">
          <h3 className="font-serif text-2xl text-ink mb-6">Scrape en tâche de fond</h3>

          {job.status === 'running' && (
            <div className="border-l-2 border-boss bg-cream px-4 py-3">
              <p className="text-sm text-ink flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                En cours… extraction des commentaires puis visite des profils.
              </p>
              <p className="text-xs text-muted mt-1">
                Vous pouvez fermer cette page. Les profils remontent dans l&apos;onglet
                Profils au fur et à mesure.
              </p>
            </div>
          )}

          {job.status === 'done' && (
            <div className="border-l-2 border-cgp bg-cream px-4 py-3">
              <p className="text-sm text-ink">
                ✓ Terminé — <strong>{job.count ?? 0}</strong> profil(s) extrait(s).
              </p>
              <a
                href="/profiles"
                className="inline-block mt-3 text-xs tracking-caps uppercase text-forest hover:text-forest-soft font-medium"
              >
                Voir les profils →
              </a>
            </div>
          )}

          {job.status === 'error' && (
            <div className="border-l-2 border-ultra-boss bg-cream px-4 py-3">
              <p className="text-sm text-ultra-boss">Erreur : {job.error || 'inconnue'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
