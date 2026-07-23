import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface EventRow {
  id: number;
  type: string;
  step: number;
  meta: string;
  created_at: string;
  template_name: string | null;
  template_subject: string | null;
}

// GET : fiche détaillée d'un contact : profil, timeline d'activité et taux calculés
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const contact = db
    .prepare(
      `SELECT c.*, p.label AS persona_label
       FROM contacts c LEFT JOIN personas p ON p.key = c.persona
       WHERE c.id = ?`
    )
    .get(Number(id));
  if (!contact) return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 });

  const events = db
    .prepare(
      `SELECT e.id, e.type, e.step, e.meta, e.created_at,
              t.name AS template_name, t.subject AS template_subject
       FROM events e
       LEFT JOIN templates t ON t.step = e.step AND e.type = 'sent'
       WHERE e.contact_id = ?
       ORDER BY e.id ASC`
    )
    .all(Number(id)) as unknown as EventRow[];

  // Taux calculés par contact : ouverture/clic rapportés au nombre d'emails envoyés
  const sentSteps = new Set(events.filter((e) => e.type === 'sent').map((e) => e.step));
  const openedSteps = new Set(events.filter((e) => e.type === 'open').map((e) => e.step));
  const clickedSteps = new Set(events.filter((e) => e.type === 'click').map((e) => e.step));
  const sent = sentSteps.size;
  const opened = [...openedSteps].filter((s) => sentSteps.has(s)).length;
  const clicked = [...clickedSteps].filter((s) => sentSteps.has(s)).length;
  const replied = events.some((e) => e.type === 'reply');
  const hasRdv = events.some((e) => e.type === 'rdv');

  const metrics = {
    sent,
    opened,
    clicked,
    replied,
    hasRdv,
    openRate: sent ? opened / sent : 0,
    clickRate: sent ? clicked / sent : 0,
    replyRate: sent ? (replied ? 1 : 0) : 0,
  };

  return NextResponse.json({ contact, events, metrics });
}

// PATCH : changer le statut d'un contact (pause, reprise, RDV pris, annulation RDV, désinscription…)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(Number(id)) as
    | { id: number; status: string; current_step: number }
    | undefined;
  if (!contact) return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 });

  const body = await req.json();
  const action = String(body.action || '');

  if (action === 'pause') {
    db.prepare("UPDATE contacts SET status = 'paused' WHERE id = ?").run(contact.id);
  } else if (action === 'resume') {
    const next = contact.current_step === 0 ? new Date().toISOString() : null;
    if (next) {
      db.prepare("UPDATE contacts SET status = 'active', next_send_at = ? WHERE id = ?").run(next, contact.id);
    } else {
      db.prepare(
        "UPDATE contacts SET status = 'active', next_send_at = COALESCE(next_send_at, ?) WHERE id = ?"
      ).run(new Date().toISOString(), contact.id);
    }
  } else if (action === 'rdv') {
    db.prepare("UPDATE contacts SET status = 'rdv', next_send_at = NULL WHERE id = ?").run(contact.id);
    db.prepare("INSERT INTO events (contact_id, type, meta) VALUES (?, 'rdv', 'marqué manuellement')").run(contact.id);
  } else if (action === 'cancel_rdv') {
    // Annuler une prise de RDV : on efface l'événement RDV et on rend le contact à
    // son état de séquence (en attente si rien n'a été envoyé, sinon réactivé).
    const restored = contact.current_step === 0 ? 'pending' : 'active';
    const next = contact.current_step === 0 ? null : new Date().toISOString();
    db.prepare('UPDATE contacts SET status = ?, next_send_at = ? WHERE id = ?').run(restored, next, contact.id);
    db.prepare("DELETE FROM events WHERE contact_id = ? AND type = 'rdv'").run(contact.id);
  } else if (action === 'unsubscribe') {
    db.prepare("UPDATE contacts SET status = 'unsubscribed', next_send_at = NULL WHERE id = ?").run(contact.id);
    db.prepare("INSERT INTO events (contact_id, type, meta) VALUES (?, 'unsubscribe', 'manuel')").run(contact.id);
  } else if (action === 'replied') {
    db.prepare("UPDATE contacts SET status = 'replied', next_send_at = NULL WHERE id = ?").run(contact.id);
    db.prepare("INSERT INTO events (contact_id, type, meta) VALUES (?, 'reply', 'marqué manuellement')").run(contact.id);
  } else {
    return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 });
  }

  const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact.id);
  return NextResponse.json({ contact: updated });
}
