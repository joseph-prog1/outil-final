'use client';

import { useEffect, useState } from 'react';

interface Settings {
  google_client_id: string;
  google_client_secret: string;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  from_email: string;
  gmail_user: string;
  gmail_app_password: string;
  sender_name: string;
  calendly_url: string;
  daily_cap: string;
  base_url: string;
  send_start: string;
  send_end: string;
  send_days: string;
}

const DAYS: Array<[string, string]> = [
  ['1', 'Lun'],
  ['2', 'Mar'],
  ['3', 'Mer'],
  ['4', 'Jeu'],
  ['5', 'Ven'],
  ['6', 'Sam'],
  ['0', 'Dim'],
];

export default function ReglagesPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');
  const [googleMessage, setGoogleMessage] = useState('');
  const [showGoogleGuide, setShowGoogleGuide] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testStep, setTestStep] = useState('1');
  const [testPersona, setTestPersona] = useState('cgp');
  const [testMessage, setTestMessage] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings);
        setGoogleConnected(Boolean(d.googleConnected));
        setGoogleEmail(d.googleEmail || '');
      });
    const params = new URLSearchParams(window.location.search);
    const g = params.get('google');
    if (g === 'ok') setGoogleMessage('Compte Google connecté — envoi et détection des réponses activés.');
    else if (g === 'refused') setGoogleMessage('Connexion refusée côté Google.');
    else if (g === 'missing_client') setGoogleMessage('Renseignez d’abord l’ID client et le secret, puis enregistrez.');
    else if (g === 'error') setGoogleMessage(`Erreur : ${params.get('detail') || 'échec de la connexion Google.'}`);
  }, []);

  const disconnectGoogle = async () => {
    await fetch('/api/google/disconnect', { method: 'POST' });
    setGoogleConnected(false);
    setGoogleEmail('');
    setGoogleMessage('Compte Google déconnecté.');
  };

  if (!settings) {
    return <div className="text-center py-12 text-muted tracking-caps uppercase text-xs">Chargement…</div>;
  }

  const update = (patch: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const save = async () => {
    setSaving(true);
    setMessage('');
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setMessage(res.ok ? 'Réglages enregistrés.' : 'Erreur à l’enregistrement.');
  };

  const sendTest = async () => {
    setTesting(true);
    setTestMessage('');
    const res = await fetch('/api/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: testTo, step: Number(testStep), persona: testPersona }),
    });
    const data = await res.json();
    setTesting(false);
    setTestMessage(data.error ? `Erreur : ${data.error}` : `Email de test envoyé à ${testTo}.`);
  };

  const selectedDays = settings.send_days.split(',').filter(Boolean);
  const toggleDay = (d: string) => {
    const next = selectedDays.includes(d) ? selectedDays.filter((x) => x !== d) : [...selectedDays, d];
    update({ send_days: next.join(',') });
  };

  return (
    <div className="space-y-8 fade-in max-w-4xl">
      {/* Connexion Google */}
      <div className="bg-paper border border-line p-6 space-y-4">
        <h3 className="font-serif text-2xl text-ink">
          Connexion Google <span className="text-sm text-muted">(recommandé)</span>
        </h3>
        <p className="text-sm text-muted leading-relaxed">
          Envoi depuis votre Gmail et détection automatique des réponses, directement depuis le site — sans mot de passe
          d’application ni service tiers. Une seule préparation, à faire une fois : créer une clé OAuth gratuite chez
          Google (~5 min).
        </p>
        {googleConnected ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="border border-forest bg-cream px-4 py-2 text-xs uppercase tracking-caps text-forest">
              Connecté — {googleEmail}
            </span>
            <button
              onClick={disconnectGoogle}
              className="border border-line text-muted px-4 py-2 text-xs uppercase tracking-caps hover:border-st-stop hover:text-st-stop transition"
            >
              Déconnecter
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowGoogleGuide((v) => !v)}
              className="text-xs uppercase tracking-caps text-forest underline"
            >
              {showGoogleGuide ? 'Masquer le guide' : 'Afficher le guide pas à pas'}
            </button>
            {showGoogleGuide && (
              <ol className="text-sm text-muted leading-relaxed list-decimal ml-5 space-y-2">
                <li>
                  Ouvrez{' '}
                  <a
                    href="https://console.cloud.google.com/projectcreate"
                    target="_blank"
                    rel="noreferrer"
                    className="text-forest underline"
                  >
                    console.cloud.google.com
                  </a>{' '}
                  (connexion avec votre compte Gmail habituel) et créez un projet, nom libre (ex. « Charlie Emailing »).
                </li>
                <li>
                  Menu <em>API et services → Bibliothèque</em> : cherchez « Gmail API » et cliquez sur <em>Activer</em>.
                </li>
                <li>
                  <em>API et services → Écran de consentement OAuth</em> : type <em>Externe</em>, remplissez le nom de
                  l’app et votre email, puis dans <em>Audience / Utilisateurs test</em>, ajoutez votre propre adresse
                  Gmail.
                </li>
                <li>
                  <em>API et services → Identifiants → Créer des identifiants → ID client OAuth</em> : type{' '}
                  <em>Application Web</em>, et dans « URI de redirection autorisés » ajoutez exactement :{' '}
                  <code className="bg-cream border border-line px-1">http://localhost:3005/api/google/callback</code>
                </li>
                <li>Copiez l’ID client et le code secret ci-dessous, enregistrez, puis cliquez sur le bouton vert.</li>
              </ol>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="ID client OAuth">
                <input
                  value={settings.google_client_id}
                  onChange={(e) => update({ google_client_id: e.target.value })}
                  placeholder="…apps.googleusercontent.com"
                  className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
                />
              </Field>
              <Field label="Code secret du client">
                <input
                  type="password"
                  value={settings.google_client_secret}
                  onChange={(e) => update({ google_client_secret: e.target.value })}
                  className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={async () => {
                  await save();
                  window.location.href = '/api/google/auth';
                }}
                disabled={!settings.google_client_id}
                className="bg-forest text-cream px-6 py-2 text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-50"
              >
                Connecter mon compte Gmail
              </button>
              <span className="text-xs text-muted">Enregistre les réglages puis ouvre l’écran Google.</span>
            </div>
          </>
        )}
        {googleMessage && <p className="text-sm text-forest">{googleMessage}</p>}
        <p className="text-xs text-muted leading-relaxed">
          Note : tant que la clé OAuth reste en mode « test » chez Google, la connexion expire au bout de 7 jours — un
          clic sur le bouton suffit pour la renouveler.
        </p>
      </div>

      {/* Compte d'envoi */}
      <div className="bg-paper border border-line p-6 space-y-4">
        <h3 className="font-serif text-2xl text-ink">
          Relais SMTP <span className="text-sm text-muted">(alternative sans compte Google Cloud)</span>
        </h3>
        <p className="text-sm text-muted leading-relaxed">
          Envoi via un relais SMTP gratuit, sans toucher à votre compte Google. Recommandé :{' '}
          <a href="https://www.brevo.com/fr/" target="_blank" className="text-forest underline" rel="noreferrer">
            Brevo
          </a>{' '}
          (300 emails/jour gratuits) — créez un compte, vérifiez votre adresse d’expéditeur (Expéditeurs → Ajouter), puis
          récupérez vos identifiants dans <em>SMTP &amp; API → SMTP</em> et collez-les ici.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Serveur SMTP">
            <input
              value={settings.smtp_host}
              onChange={(e) => update({ smtp_host: e.target.value })}
              placeholder="smtp-relay.brevo.com"
              className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
          <Field label="Port">
            <input
              value={settings.smtp_port}
              onChange={(e) => update({ smtp_port: e.target.value })}
              placeholder="587"
              className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
          <Field label="Identifiant SMTP (login)">
            <input
              value={settings.smtp_user}
              onChange={(e) => update({ smtp_user: e.target.value })}
              placeholder="ex. 8a2f4b001@smtp-brevo.com"
              className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
          <Field label="Clé / mot de passe SMTP">
            <input
              type="password"
              value={settings.smtp_pass}
              onChange={(e) => update({ smtp_pass: e.target.value })}
              className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
          <Field label="Adresse d’expéditeur (vérifiée chez le relais)">
            <input
              value={settings.from_email}
              onChange={(e) => update({ from_email: e.target.value })}
              placeholder="betolaud.joseph@gmail.com"
              className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
          <Field label="Nom de l’expéditeur">
            <input
              value={settings.sender_name}
              onChange={(e) => update({ sender_name: e.target.value })}
              className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Les réponses des prospects arrivent normalement dans votre boîte Gmail (l’adresse d’expéditeur sert de
          Reply-To). Alternative sans relais : remplir la section Gmail ci-dessous à la place.
        </p>
      </div>

      {/* Gmail (optionnel) */}
      <div className="bg-paper border border-line p-6 space-y-4">
        <h3 className="font-serif text-2xl text-ink">
          Gmail direct &amp; détection des réponses <span className="text-sm text-muted">(optionnel)</span>
        </h3>
        <p className="text-sm text-muted leading-relaxed">
          Avec un{' '}
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            className="text-forest underline"
            rel="noreferrer"
          >
            mot de passe d’application Google
          </a>{' '}
          (nécessite la validation en deux étapes), l’outil peut : 1) envoyer directement depuis Gmail (sans relais,
          meilleure délivrabilité) et 2) <strong>détecter automatiquement les réponses</strong> pour arrêter les
          séquences. Sans ces identifiants, marquez les réponses à la main dans l’onglet Contacts (bouton « A répondu »).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Adresse Gmail">
            <input
              value={settings.gmail_user}
              onChange={(e) => update({ gmail_user: e.target.value })}
              placeholder="betolaud.joseph@gmail.com"
              className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
          <Field label="Mot de passe d’application (16 lettres)">
            <input
              type="password"
              value={settings.gmail_app_password}
              onChange={(e) => update({ gmail_app_password: e.target.value })}
              placeholder="xxxx xxxx xxxx xxxx"
              className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
        </div>
      </div>

      {/* Rendez-vous & tracking */}
      <div className="bg-paper border border-line p-6 space-y-4">
        <h3 className="font-serif text-2xl text-ink">Rendez-vous & tracking</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Lien de prise de RDV (Calendly, Google Agenda…)">
            <input
              value={settings.calendly_url}
              onChange={(e) => update({ calendly_url: e.target.value })}
              placeholder="https://calendly.com/…/demo-charlie"
              className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
          <Field label="URL publique de l’app (tracking ouvertures/clics)">
            <input
              value={settings.base_url}
              onChange={(e) => update({ base_url: e.target.value })}
              className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Le tracking des ouvertures et des clics ne fonctionne que si cette URL est accessible depuis Internet
          (déploiement, ou tunnel type <code>cloudflared tunnel --url http://localhost:3005</code>, gratuit). En local
          pur, les envois, les réponses et les statistiques d’envoi fonctionnent quand même.
        </p>
      </div>

      {/* Rythme d'envoi */}
      <div className="bg-paper border border-line p-6 space-y-4">
        <h3 className="font-serif text-2xl text-ink">Rythme d’envoi</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Quota journalier">
            <input
              type="number"
              min={1}
              value={settings.daily_cap}
              onChange={(e) => update({ daily_cap: e.target.value })}
              className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
          <Field label="Début (heure)">
            <input
              value={settings.send_start}
              onChange={(e) => update({ send_start: e.target.value })}
              placeholder="08:30"
              className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
          <Field label="Fin (heure)">
            <input
              value={settings.send_end}
              onChange={(e) => update({ send_end: e.target.value })}
              placeholder="18:30"
              className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
          <Field label="Jours d’envoi">
            <div className="flex flex-wrap gap-1">
              {DAYS.map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => toggleDay(v)}
                  className={`px-2 py-1.5 text-xs uppercase tracking-caps border transition ${
                    selectedDays.includes(v)
                      ? 'bg-forest text-cream border-forest'
                      : 'border-line text-forest hover:border-forest'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <p className="text-xs text-muted">
          Restez sous 40-50 emails/jour avec un compte Gmail classique pour préserver la délivrabilité.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={save}
          disabled={saving}
          className="bg-forest text-cream px-8 py-3 text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer les réglages'}
        </button>
        {message && <span className="text-sm text-forest">{message}</span>}
      </div>

      {/* Test */}
      <div className="bg-paper border border-line p-6 space-y-4">
        <h3 className="font-serif text-2xl text-ink">Envoyer un email de test</h3>
        <p className="text-sm text-muted">
          Vérifiez le rendu réel dans votre boîte avant de lancer la campagne (enregistrez d’abord vos réglages).
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Destinataire">
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="vous@gmail.com"
              className="w-64 border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            />
          </Field>
          <Field label="Email">
            <select
              value={testStep}
              onChange={(e) => setTestStep(e.target.value)}
              className="border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            >
              {[1, 2, 3, 4].map((s) => (
                <option key={s} value={s}>
                  Email {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Persona">
            <select
              value={testPersona}
              onChange={(e) => setTestPersona(e.target.value)}
              className="border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
            >
              <option value="cgp">CGP / CIF</option>
              <option value="banquier_prive">Banquier privé</option>
              <option value="family_office">Family office</option>
              <option value="gerant">Gérant / gestionnaire</option>
              <option value="assureur">Assurance / courtage</option>
              <option value="autre">Autre</option>
            </select>
          </Field>
          <button
            onClick={sendTest}
            disabled={testing || !testTo}
            className="border border-forest text-forest px-6 py-2 text-xs uppercase tracking-caps hover:bg-forest hover:text-cream transition disabled:opacity-50"
          >
            {testing ? 'Envoi…' : 'Envoyer le test'}
          </button>
        </div>
        {testMessage && <p className="text-sm text-forest">{testMessage}</p>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-caps text-muted block mb-1">{label}</span>
      {children}
    </label>
  );
}
