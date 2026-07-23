import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyContactToken } from '@/lib/token';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const eventId = Number(params.get('e'));
  const contactId = verifyContactToken(params.get('t') || '');
  const url = params.get('u') || '';

  // Sécurité : uniquement des redirections http(s)
  if (!/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'URL invalide' }, { status: 400 });
  }

  if (eventId && contactId !== null) {
    const db = getDb();
    const sentEvent = db
      .prepare("SELECT step FROM events WHERE id = ? AND contact_id = ? AND type = 'sent'")
      .get(eventId, contactId) as { step: number } | undefined;
    if (sentEvent) {
      db.prepare("INSERT INTO events (contact_id, type, step, meta) VALUES (?, 'click', ?, ?)").run(
        contactId,
        sentEvent.step,
        url
      );
    }
  }

  return NextResponse.redirect(url, 302);
}
