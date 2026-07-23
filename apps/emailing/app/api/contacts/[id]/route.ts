import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// PATCH : changer le statut d'un contact (pause, reprise, RDV pris, désinscription…)
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
