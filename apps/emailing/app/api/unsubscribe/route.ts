import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyContactToken } from '@/lib/token';

export const dynamic = 'force-dynamic';

const page = (title: string, message: string) => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #F2EFE7; color: #17150F;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: #FBFAF5; border: 1px solid #DCD6C8; padding: 48px; max-width: 480px; text-align: center; }
  h1 { font-family: Georgia, serif; font-weight: normal; font-size: 28px; margin: 0 0 16px; }
  p { color: #6F6A5C; font-size: 15px; line-height: 1.5; margin: 0; }
  .brand { text-transform: uppercase; letter-spacing: 0.14em; font-size: 11px; color: #0C2A1B; margin-bottom: 24px; }
</style></head>
<body><div class="card"><div class="brand">Charlie</div><h1>${title}</h1><p>${message}</p></div></body></html>`;

export async function GET(req: NextRequest) {
  const contactId = verifyContactToken(req.nextUrl.searchParams.get('t') || '');
  if (contactId === null) {
    return new NextResponse(page('Lien invalide', 'Ce lien de désinscription n’est pas valide.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  const db = getDb();
  const contact = db.prepare('SELECT id, status FROM contacts WHERE id = ?').get(contactId) as
    | { id: number; status: string }
    | undefined;
  if (contact && contact.status !== 'unsubscribed') {
    db.prepare("UPDATE contacts SET status = 'unsubscribed', next_send_at = NULL WHERE id = ?").run(contactId);
    db.prepare("INSERT INTO events (contact_id, type, meta) VALUES (?, 'unsubscribe', 'lien email')").run(contactId);
  }
  return new NextResponse(
    page('Désinscription confirmée', 'Vous ne recevrez plus d’emails de notre part. Bonne continuation.'),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
