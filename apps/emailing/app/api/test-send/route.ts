import { NextRequest, NextResponse } from 'next/server';
import { getDb, getSetting } from '@/lib/db';
import { renderEmail, type ContactRow } from '@/lib/render';
import { sendMail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

// POST : envoie un email de test à l'adresse donnée, avec le tracking complet
// (pixel d'ouverture, liens traqués, désinscription) comme un vrai email de campagne.
// Le destinataire est enregistré comme contact « en pause » (source: test) pour
// que ses ouvertures/clics apparaissent dans le Dashboard et l'onglet Contacts.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const to = String(body.to || '').trim().toLowerCase();
  if (!to) return NextResponse.json({ error: 'Adresse destinataire manquante' }, { status: 400 });
  const step = Number(body.step) || 1;
  const persona = String(body.persona || 'cgp');

  const db = getDb();
  let contact = db.prepare('SELECT * FROM contacts WHERE email = ?').get(to) as unknown as ContactRow | undefined;
  if (!contact) {
    db.prepare(
      `INSERT INTO contacts (email, first_name, last_name, job_title, persona, source_slug, status)
       VALUES (?, ?, '', '', ?, 'test', 'paused')`
    ).run(to, String(body.firstName || 'Test'), persona);
    contact = db.prepare('SELECT * FROM contacts WHERE email = ?').get(to) as unknown as ContactRow;
  }

  const eventResult = db
    .prepare("INSERT INTO events (contact_id, type, step, meta) VALUES (?, 'sent', ?, 'test')")
    .run(contact.id, step);
  const eventId = Number(eventResult.lastInsertRowid);

  try {
    const rendered = renderEmail({ ...contact, persona }, step, eventId);
    const messageId = await sendMail({
      to,
      subject: `[TEST] ${rendered.subject}`,
      text: rendered.text,
      html: rendered.html,
    });
    return NextResponse.json({
      ok: true,
      messageId,
      tracking: {
        contactId: contact.id,
        eventId,
        baseUrl: getSetting('base_url'),
      },
    });
  } catch (err) {
    db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
