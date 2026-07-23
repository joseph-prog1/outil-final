'use client';

import { useCallback, useEffect, useState } from 'react';
import { STATUS_LABELS } from '../../lib/labels';

interface CampaignStatus {
  sendingEnabled: boolean;
  dailyCap: number;
  sentToday: number;
  byStatus: Record<string, number>;
  nextDue: Array<{
    email: string;
    first_name: string;
    last_name: string;
    current_step: number;
    next_send_at: string;
    persona_label: string;
  }>;
  gmailConfigured: boolean;
  replyDetection: boolean;
  calendlyConfigured: boolean;
}

const PERSONAS = [
  ['cgp', 'CGP / CIF'],
  ['banquier_prive', 'Banquier privé'],
  ['family_office', 'Family office'],
  ['gerant', 'Gérant / gestionnaire'],
  ['assureur', 'Assurance / courtage'],
  ['autre', 'Autre'],
] as const;

export default function CampagnePage() {
  const [status, setStatus] = useState<CampaignStatus | null>(null);
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [limit, setLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    fetch('/api/campaign')
      .then((r) => r.json())
      .then(setStatus);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const post = async (body: Record<string, unknown>, doneMessage?: (d: any) => string) => {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) setMessage(`Erreur : ${data.error}`);
      else if (doneMessage) setMessage(doneMessage(data));
    } finally {
      setBusy(false);
      load();
    }
  };

  if (!status) {
    return <div className="text-center py-12 text-muted tracking-caps uppercase text-xs">Chargement…</div>;
  }

  const pending = status.byStatus.pending || 0;
  const active = status.byStatus.active || 0;

  return (
    <div className="space-y-8 fade-in">
      {/* Alerte configuration */}
      {(!status.gmailConfigured || !status.calendlyConfigured) && (
        <div className="border border-st-stop bg-paper px-6 py-4 text-sm">
          <span className="text-xs uppercase tracking-caps text-st-stop font-medium">Configuration incomplète — </span>
          {!status.gmailConfigured && 'aucun compte d’envoi n’est configuré'}
          {!status.gmailConfigured && !status.calendlyConfigured && ' et '}
          {!status.calendlyConfigured && 'le lien Calendly est manquant'}
          {'. Rendez-vous dans l’onglet Réglages avant de lancer la campagne.'}
        </div>
      )}
      {status.gmailConfigured && !status.replyDetection && (
        <div className="border border-line bg-paper px-6 py-4 text-sm text-muted">
          <span className="text-xs uppercase tracking-caps text-forest font-medium">Détection des réponses inactive — </span>
          sans identifiants Gmail IMAP (Réglages, section optionnelle), les séquences ne s’arrêtent pas toutes seules
          quand un prospect répond. Surveillez votre boîte et utilisez le bouton « A répondu » dans l’onglet Contacts.
        </div>
      )}

      {/* État */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line">
        <Card label="Campagne" value={status.sendingEnabled ? 'Active' : 'En pause'} accent={status.sendingEnabled ? '#1A3D2A' : '#B7791F'} />
        <Card label="Envoyés aujourd'hui" value={`${status.sentToday} / ${status.dailyCap}`} />
        <Card label="En séquence" value={active} />
        <Card label="En attente d'activation" value={pending} />
      </div>

      {/* Contrôles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-paper border border-line p-6 space-y-5">
          <h3 className="font-serif text-2xl text-ink">Contrôle de la campagne</h3>
          <p className="text-sm text-muted leading-relaxed">
            La campagne active envoie automatiquement les emails dus, toutes les 5 minutes, dans la limite du quota
            journalier et de la fenêtre d’envoi (jours ouvrés, heures de bureau). L’application doit rester lancée.
          </p>
          <div className="flex flex-wrap gap-3">
            {status.sendingEnabled ? (
              <button
                onClick={() => post({ action: 'pause' })}
                disabled={busy}
                className="border border-st-stop text-st-stop px-6 py-2 text-xs uppercase tracking-caps hover:bg-st-stop hover:text-cream transition disabled:opacity-50"
              >
                Mettre en pause
              </button>
            ) : (
              <button
                onClick={() => post({ action: 'start' })}
                disabled={busy || !status.gmailConfigured}
                className="bg-forest text-cream px-6 py-2 text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-50"
              >
                Démarrer la campagne
              </button>
            )}
            <button
              onClick={() =>
                post({ action: 'tick' }, (d) => {
                  const r = d.result;
                  return r.ran
                    ? `Tick exécuté — ${r.sent} envoyé(s), ${r.errors} erreur(s), ${r.replies} réponse(s) détectée(s).`
                    : `Rien envoyé : ${r.reason}${r.replies ? ` — ${r.replies} réponse(s) détectée(s)` : ''}.`;
                })
              }
              disabled={busy}
              className="border border-forest text-forest px-6 py-2 text-xs uppercase tracking-caps hover:bg-forest hover:text-cream transition disabled:opacity-50"
            >
              Envoyer maintenant
            </button>
            <button
              onClick={() =>
                post({ action: 'check-replies' }, (d) =>
                  d.result.error
                    ? `Vérification impossible : ${d.result.error}`
                    : `${d.result.replies} nouvelle(s) réponse(s) détectée(s).`
                )
              }
              disabled={busy}
              className="border border-line text-forest px-6 py-2 text-xs uppercase tracking-caps hover:border-forest transition disabled:opacity-50"
            >
              Vérifier les réponses
            </button>
          </div>
          {message && <p className="text-sm text-forest">{message}</p>}
        </div>

        {/* Activation */}
        <div className="bg-paper border border-line p-6 space-y-5">
          <h3 className="font-serif text-2xl text-ink">Activer des contacts</h3>
          <p className="text-sm text-muted leading-relaxed">
            Fait entrer les contacts « en attente » dans la séquence. Commencez petit (20-50 contacts) pour valider vos
            messages avant d’élargir.
          </p>
          <div>
            <span className="text-xs uppercase tracking-caps text-muted block mb-2">Personas (aucun = tous)</span>
            <div className="flex flex-wrap gap-2">
              {PERSONAS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() =>
                    setSelectedPersonas((sel) =>
                      sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key]
                    )
                  }
                  className={`px-3 py-1.5 text-xs uppercase tracking-caps border transition ${
                    selectedPersonas.includes(key)
                      ? 'bg-forest text-cream border-forest'
                      : 'border-line text-forest hover:border-forest'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-caps text-muted block mb-1">Limite (vide = tous)</span>
              <input
                type="number"
                min={1}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="ex. 50"
                className="w-32 border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
              />
            </label>
            <button
              onClick={() =>
                post(
                  { action: 'activate', personas: selectedPersonas, limit: limit ? Number(limit) : undefined },
                  (d) => `${d.activated} contact(s) activé(s).`
                )
              }
              disabled={busy || pending === 0}
              className="bg-forest text-cream px-6 py-2 text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-50"
            >
              Activer
            </button>
            <button
              onClick={() => post({ action: 'deactivate' }, (d) => `${d.paused} contact(s) mis en pause.`)}
              disabled={busy || active === 0}
              className="border border-line text-forest px-4 py-2 text-xs uppercase tracking-caps hover:border-forest transition disabled:opacity-50"
            >
              Tout mettre en pause
            </button>
          </div>
        </div>
      </div>

      {/* Prochains envois */}
      <div className="bg-paper border border-line p-6">
        <h3 className="font-serif text-2xl text-ink mb-6">Prochains envois</h3>
        {status.nextDue.length === 0 ? (
          <p className="text-sm text-muted">Aucun envoi programmé — activez des contacts ci-dessus.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-caps text-muted border-b border-line">
                <th className="py-2 pr-4">Contact</th>
                <th className="py-2 pr-4">Persona</th>
                <th className="py-2 pr-4">Prochain email</th>
                <th className="py-2">Prévu pour</th>
              </tr>
            </thead>
            <tbody>
              {status.nextDue.map((c, i) => (
                <tr key={i} className="border-b border-line/60">
                  <td className="py-2 pr-4">
                    {c.first_name || c.last_name ? `${c.first_name} ${c.last_name}` : c.email}
                    <span className="text-xs text-muted ml-2">{c.email}</span>
                  </td>
                  <td className="py-2 pr-4 text-muted">{c.persona_label}</td>
                  <td className="py-2 pr-4">Email {c.current_step + 1}</td>
                  <td className="py-2 text-muted">
                    {new Date(c.next_send_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Statuts détaillés */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(status.byStatus).map(([s, n]) => (
          <span key={s} className="border border-line bg-paper px-4 py-2 text-xs uppercase tracking-caps text-forest">
            {STATUS_LABELS[s] || s} — <strong>{n}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="bg-paper px-6 py-5">
      <p className="text-xs uppercase tracking-caps text-muted">{label}</p>
      <p className="font-serif text-4xl mt-2" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
    </div>
  );
}
