import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyContactToken } from '@/lib/token';

export const dynamic = 'force-dynamic';

// Pixel invisible 1x1 (GIF transparent)
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const eventId = Number(params.get('e'));
  const contactId = verifyContactToken(params.get('t') || '');

  if (eventId && contactId !== null) {
    const db = getDb();
    const sentEvent = db
      .prepare("SELECT step FROM events WHERE id = ? AND contact_id = ? AND type = 'sent'")
      .get(eventId, contactId) as { step: number } | undefined;
    if (sentEvent) {
      const already = db
        .prepare("SELECT 1 FROM events WHERE contact_id = ? AND type = 'open' AND step = ? LIMIT 1")
        .get(contactId, sentEvent.step);
      if (!already) {
        db.prepare("INSERT INTO events (contact_id, type, step) VALUES (?, 'open', ?)").run(contactId, sentEvent.step);
      }
    }
  }

  return new NextResponse(PIXEL, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' },
  });
}
