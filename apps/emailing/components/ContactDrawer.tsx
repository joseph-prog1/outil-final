'use client';

import { useEffect, useState } from 'react';
import { STATUS_LABELS, STATUS_COLORS, EVENT_LABELS } from '../lib/labels';

interface Contact {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  job_title: string;
  persona: string;
  persona_label: string;
  source_slug: string;
  status: string;
  current_step: number;
  next_send_at: string | null;
  thread_subject: string | null;
  created_at: string;
}

interface EventRow {
  id: number;
  type: string;
  step: number;
  meta: string;
  created_at: string;
  template_name: string | null;
  template_subject: string | null;
}

interface Metrics {
  sent: number;
  opened: number;
  clicked: number;
  replied: boolean;
  hasRdv: boolean;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

interface Detail {
  contact: Contact;
  events: EventRow[];
  metrics: Metrics;
}

const EVENT_COLORS: Record<string, string> = {
  sent: '#1A3D2A',
  open: '#B7791F',
  click: '#0C2A1B',
  reply: '#1A3D2A',
  rdv: '#1A3D2A',
  unsubscribe: '#9B2C2C',
  error: '#9B2C2C',
};

function formatDate(iso: string): string {
  // Les dates SQLite arrivent en UTC (« YYYY-MM-DD HH:MM:SS »), on les affiche en local
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function ContactDrawer({
  contactId,
  onClose,
  onChanged,
}: {
  contactId: number | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (contactId == null) return;
    setLoading(true);
    fetch(`/api/contacts/${contactId}`)
      .then((r) => r.json())
      .then((d) => {
        setDetail(d.error ? null : d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    setDetail(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  // Fermeture au clavier (Échap)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (action: string) => {
    if (contactId == null) return;
    setBusy(true);
    await fetch(`/api/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    load();
    onChanged();
  };

  if (contactId == null) return null;

  const c = detail?.contact;
  const m = detail?.metrics;
  const name = c && (c.first_name || c.last_name) ? `${c.first_name} ${c.last_name}`.trim() : c?.email;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Fond cliquable pour fermer */}
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />

      <aside className="relative w-full max-w-xl bg-cream border-l border-line h-full overflow-y-auto shadow-2xl fade-in">
        <div className="sticky top-0 bg-cream border-b border-line px-6 py-4 flex items-start justify-between">
          <div>
            <h2 className="font-serif text-2xl text-ink leading-tight">{name || '-'}</h2>
            {c && <p className="text-xs text-muted mt-1">{c.email}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink text-xl leading-none px-2"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {loading && !detail ? (
          <div className="text-center py-16 text-muted tracking-caps uppercase text-xs">Chargement…</div>
        ) : !c || !m ? (
          <div className="text-center py-16 text-muted text-sm">Contact introuvable.</div>
        ) : (
          <div className="px-6 py-6 space-y-8">
            {/* Profil */}
            <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-caps text-muted">Statut</div>
                <div style={{ color: STATUS_COLORS[c.status] || '#6F6A5C' }} className="uppercase tracking-caps text-xs mt-1">
                  {STATUS_LABELS[c.status] || c.status}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-caps text-muted">Étape séquence</div>
                <div className="mt-1">{c.current_step} / 4</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-caps text-muted">Persona</div>
                <div className="mt-1">{c.persona_label || c.persona}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-caps text-muted">Métier</div>
                <div className="mt-1">{c.job_title || '-'}</div>
              </div>
            </div>

            {/* Taux */}
            <div className="grid grid-cols-4 gap-3">
              <Stat label="Envoyés" value={String(m.sent)} />
              <Stat label="Ouverture" value={m.sent ? pct(m.openRate) : '-'} sub={`${m.opened}/${m.sent}`} />
              <Stat label="Clic" value={m.sent ? pct(m.clickRate) : '-'} sub={`${m.clicked}/${m.sent}`} />
              <Stat label="Réponse" value={m.replied ? 'Oui' : m.sent ? 'Non' : '-'} />
            </div>

            {/* Prise de RDV : gestion */}
            {c.status === 'rdv' && (
              <div className="border border-forest/40 bg-forest/5 p-4 flex items-center justify-between gap-4">
                <div className="text-sm">
                  <div className="font-serif text-lg text-ink">Rendez-vous marqué</div>
                  <div className="text-xs text-muted mt-0.5">
                    La séquence est arrêtée pour ce contact. Vous pouvez annuler si c’est une erreur.
                  </div>
                </div>
                <button
                  onClick={() => act('cancel_rdv')}
                  disabled={busy}
                  className="shrink-0 border border-red-800 text-red-800 px-4 py-2 text-xs uppercase tracking-caps hover:bg-red-800 hover:text-cream transition disabled:opacity-50"
                >
                  Annuler le RDV
                </button>
              </div>
            )}

            {/* Actions */}
            <div>
              <div className="text-[10px] uppercase tracking-caps text-muted mb-2">Gérer ce contact</div>
              <div className="flex flex-wrap gap-2">
                {(c.status === 'active' || c.status === 'pending') && (
                  <Btn onClick={() => act('pause')} disabled={busy}>Mettre en pause</Btn>
                )}
                {(c.status === 'paused' || c.status === 'error') && (
                  <Btn onClick={() => act('resume')} disabled={busy}>Reprendre</Btn>
                )}
                {c.status !== 'rdv' && c.status !== 'unsubscribed' && (
                  <Btn onClick={() => act('rdv')} disabled={busy}>Marquer RDV pris</Btn>
                )}
                {c.status !== 'replied' && c.status !== 'unsubscribed' && (
                  <Btn onClick={() => act('replied')} disabled={busy}>Marquer « a répondu »</Btn>
                )}
                {c.status !== 'unsubscribed' && (
                  <Btn onClick={() => act('unsubscribe')} disabled={busy} danger>Exclure</Btn>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div>
              <div className="text-[10px] uppercase tracking-caps text-muted mb-3">Activité</div>
              {detail!.events.length === 0 ? (
                <p className="text-sm text-muted">Aucune activité pour l’instant : aucun email envoyé.</p>
              ) : (
                <ol className="space-y-0">
                  {[...detail!.events].reverse().map((e) => (
                    <li key={e.id} className="flex gap-3 border-l-2 pl-4 pb-4 last:pb-0" style={{ borderColor: EVENT_COLORS[e.type] || '#DDD8CC' }}>
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm text-ink">
                            {EVENT_LABELS[e.type] || e.type}
                            {e.type === 'sent' && e.template_name ? ` : ${e.template_name}` : ''}
                            {e.step ? ` (étape ${e.step})` : ''}
                          </span>
                          <span className="text-[10px] uppercase tracking-caps text-muted whitespace-nowrap">
                            {formatDate(e.created_at)}
                          </span>
                        </div>
                        {e.type === 'sent' && e.template_subject && (
                          <div className="text-xs text-muted mt-0.5">Objet : {e.template_subject}</div>
                        )}
                        {e.meta && e.type !== 'sent' && (
                          <div className="text-xs text-muted mt-0.5 break-all">{e.meta}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-line bg-paper px-3 py-3 text-center">
      <div className="font-serif text-2xl text-ink leading-none">{value}</div>
      {sub && <div className="text-[10px] text-muted mt-1">{sub}</div>}
      <div className="text-[10px] uppercase tracking-caps text-muted mt-1">{label}</div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`border px-3 py-2 uppercase tracking-caps text-[10px] transition disabled:opacity-50 ${
        danger
          ? 'border-red-800 text-red-800 hover:bg-red-800 hover:text-cream'
          : 'border-line text-forest hover:border-forest'
      }`}
    >
      {children}
    </button>
  );
}
