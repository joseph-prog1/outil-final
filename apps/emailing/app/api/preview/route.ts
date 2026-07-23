import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { renderEmail, type ContactRow } from '@/lib/render';

export const dynamic = 'force-dynamic';

// POST : aperçu d'un email rendu — pour un vrai contact (contactId) ou un exemple (persona)
export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();
  const step = Number(body.step) || 1;

  let contact: ContactRow;
  if (body.contactId) {
    const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(Number(body.contactId)) as ContactRow | undefined;
    if (!row) return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 });
    contact = row;
  } else {
    contact = {
      id: 0,
      email: 'exemple@exemple.fr',
      first_name: 'Marie',
      last_name: 'Durand',
      job_title: '',
      persona: String(body.persona || 'cgp'),
      source_slug: 'prospection',
      status: 'pending',
      current_step: 0,
      next_send_at: null,
      last_message_id: null,
      thread_subject: null,
    };
  }

  try {
    const rendered = renderEmail(contact, step, null);
    return NextResponse.json({ rendered });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
