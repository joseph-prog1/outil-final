'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { STATUS_LABELS, STATUS_COLORS } from '../../lib/labels';

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
  opens: number;
  clicks: number;
}

const PERSONA_OPTIONS = [
  ['', 'Tous les personas'],
  ['cgp', 'CGP / CIF'],
  ['banquier_prive', 'Banquier privé'],
  ['family_office', 'Family office'],
  ['gerant', 'Gérant / gestionnaire'],
  ['assureur', 'Assurance / courtage'],
  ['autre', 'Autre'],
] as const;

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [persona, setPersona] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [localFiles, setLocalFiles] = useState<Array<{ name: string; size: number }>>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set('q', q);
    if (persona) params.set('persona', persona);
    if (status) params.set('status', status);
    fetch(`/api/contacts?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setContacts(data.contacts || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, q, persona, status]);

  useEffect(load, [load]);
  useEffect(() => {
    fetch('/api/contacts/import')
      .then((r) => r.json())
      .then((d) => setLocalFiles(d.files || []));
  }, []);

  const importLocal = async (name: string) => {
    setImporting(true);
    setMessage('');
    const res = await fetch('/api/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localFile: name }),
    });
    const data = await res.json();
    setImporting(false);
    setMessage(
      data.error
        ? `Erreur : ${data.error}`
        : `Import terminé — ${data.imported} nouveaux, ${data.updated} mis à jour, ${data.unsubscribed} désinscrits, ${data.invalid} emails invalides.`
    );
    load();
  };

  const importUpload = async (file: File) => {
    setImporting(true);
    setMessage('');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/contacts/import', { method: 'POST', body: form });
    const data = await res.json();
    setImporting(false);
    setMessage(
      data.error
        ? `Erreur : ${data.error}`
        : `Import terminé — ${data.imported} nouveaux, ${data.updated} mis à jour, ${data.unsubscribed} désinscrits, ${data.invalid} emails invalides.`
    );
    load();
  };

  const patchContact = async (id: number, action: string) => {
    await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    load();
  };

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="space-y-8 fade-in">
      {/* Import */}
      <div className="bg-paper border border-line p-6">
        <h3 className="font-serif text-2xl text-ink mb-4">Importer des contacts</h3>
        <div className="flex flex-wrap items-center gap-3">
          {localFiles.map((f) => (
            <button
              key={f.name}
              onClick={() => importLocal(f.name)}
              disabled={importing}
              className="border border-forest bg-forest text-cream px-4 py-2 text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-50"
            >
              Importer {f.name}
            </button>
          ))}
          <button
            onClick={() => fileInput.current?.click()}
            disabled={importing}
            className="border border-forest text-forest px-4 py-2 text-xs uppercase tracking-caps hover:bg-forest hover:text-cream transition disabled:opacity-50"
          >
            Choisir un autre CSV…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importUpload(e.target.files[0])}
          />
          {importing && <span className="text-xs uppercase tracking-caps text-muted">Import en cours…</span>}
        </div>
        {message && <p className="text-sm text-forest mt-4">{message}</p>}
        <p className="text-xs text-muted mt-3">
          Format attendu : colonnes email, first_name, last_name, job_title, document_slug, is_unsubscribed.
          L’import est idempotent — ré-importer met simplement à jour.
        </p>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Rechercher (nom, email, métier)…"
          className="border border-line bg-paper px-4 py-2 text-sm w-72 focus:outline-none focus:border-forest"
        />
        <select
          value={persona}
          onChange={(e) => {
            setPersona(e.target.value);
            setPage(1);
          }}
          className="border border-line bg-paper px-3 py-2 text-sm focus:outline-none focus:border-forest"
        >
          {PERSONA_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="border border-line bg-paper px-3 py-2 text-sm focus:outline-none focus:border-forest"
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <span className="text-xs uppercase tracking-caps text-muted ml-auto">
          {total} contact{total > 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-paper border border-line overflow-x-auto">
        {loading ? (
          <div className="text-center py-12 text-muted tracking-caps uppercase text-xs">Chargement…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-caps text-muted border-b border-line">
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Métier</th>
                <th className="py-3 px-4">Persona</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4">Étape</th>
                <th className="py-3 px-4">Ouv. / Clics</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-line/60 hover:bg-cream/60">
                  <td className="py-3 px-4">
                    <div>{c.first_name || c.last_name ? `${c.first_name} ${c.last_name}` : '—'}</div>
                    <div className="text-xs text-muted">{c.email}</div>
                  </td>
                  <td className="py-3 px-4 text-muted">{c.job_title || '—'}</td>
                  <td className="py-3 px-4">{c.persona_label || c.persona}</td>
                  <td className="py-3 px-4">
                    <span
                      className="text-xs uppercase tracking-caps"
                      style={{ color: STATUS_COLORS[c.status] || '#6F6A5C' }}
                    >
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-muted">{c.current_step} / 4</td>
                  <td className="py-3 px-4 text-muted">
                    {c.opens} / {c.clicks}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2 text-xs">
                      {(c.status === 'active' || c.status === 'pending') && (
                        <ActionBtn onClick={() => patchContact(c.id, 'pause')}>Pause</ActionBtn>
                      )}
                      {(c.status === 'paused' || c.status === 'error') && (
                        <ActionBtn onClick={() => patchContact(c.id, 'resume')}>Reprendre</ActionBtn>
                      )}
                      {(c.status === 'active' || c.status === 'completed') && (
                        <ActionBtn onClick={() => patchContact(c.id, 'replied')}>A répondu</ActionBtn>
                      )}
                      {c.status !== 'rdv' && c.status !== 'unsubscribed' && (
                        <ActionBtn onClick={() => patchContact(c.id, 'rdv')}>RDV pris</ActionBtn>
                      )}
                      {c.status !== 'unsubscribed' && (
                        <ActionBtn onClick={() => patchContact(c.id, 'unsubscribe')}>Exclure</ActionBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted text-sm">
                    Aucun contact — importez votre CSV ci-dessus.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="border border-line px-4 py-2 text-xs uppercase tracking-caps text-forest disabled:opacity-40 hover:border-forest transition"
          >
            Précédent
          </button>
          <span className="text-xs uppercase tracking-caps text-muted">
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="border border-line px-4 py-2 text-xs uppercase tracking-caps text-forest disabled:opacity-40 hover:border-forest transition"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}

function ActionBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="border border-line px-2 py-1 uppercase tracking-caps text-[10px] text-forest hover:border-forest transition"
    >
      {children}
    </button>
  );
}
