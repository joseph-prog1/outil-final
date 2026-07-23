import { NextRequest, NextResponse } from 'next/server';
import { getDb, getSettings, setSetting } from '@/lib/db';
import { processTick, sentToday } from '@/lib/sequencer';
import { checkReplies } from '@/lib/imap';
import { googleConnected } from '@/lib/google';
import { ensureScheduler } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';

export async function GET() {
  ensureScheduler();
  const db = getDb();
  const s = getSettings();
  const byStatus = Object.fromEntries(
    (db.prepare('SELECT status, COUNT(*) AS n FROM contacts GROUP BY status').all() as Array<{ status: string; n: number }>).map(
      (r) => [r.status, r.n]
    )
  );
  const nextDue = db
    .prepare(
      `SELECT c.email, c.first_name, c.last_name, c.current_step, c.next_send_at, p.label AS persona_label
       FROM contacts c LEFT JOIN personas p ON p.key = c.persona
       WHERE c.status = 'active' AND c.next_send_at IS NOT NULL
       ORDER BY c.next_send_at ASC LIMIT 10`
    )
    .all();
  return NextResponse.json({
    sendingEnabled: s.sending_enabled === '1',
    dailyCap: Number(s.daily_cap || '40'),
    sentToday: sentToday(),
    byStatus,
    nextDue,
    gmailConfigured: Boolean(
      googleConnected() ||
        (s.smtp_user && s.smtp_pass && (s.from_email || s.gmail_user)) ||
        (s.gmail_user && s.gmail_app_password)
    ),
    replyDetection: Boolean(googleConnected() || (s.gmail_user && s.gmail_app_password)),
    calendlyConfigured: Boolean(s.calendly_url),
  });
}

export async function POST(req: NextRequest) {
  ensureScheduler();
  const db = getDb();
  const body = await req.json();
  const action = String(body.action || '');

  if (action === 'start') {
    setSetting('sending_enabled', '1');
    return NextResponse.json({ ok: true, sendingEnabled: true });
  }
  if (action === 'pause') {
    setSetting('sending_enabled', '0');
    return NextResponse.json({ ok: true, sendingEnabled: false });
  }
  if (action === 'activate') {
    // Fait entrer les contacts "pending" dans la séquence (optionnellement filtrés par persona, avec limite)
    const personas: string[] = Array.isArray(body.personas) ? body.personas : [];
    const limit = Number(body.limit) || 100000;
    const nowIso = new Date().toISOString();
    const where = personas.length
      ? `status = 'pending' AND persona IN (${personas.map(() => '?').join(',')})`
      : "status = 'pending'";
    const ids = db
      .prepare(`SELECT id FROM contacts WHERE ${where} ORDER BY id LIMIT ?`)
      .all(...personas, String(limit)) as Array<{ id: number }>;
    const upd = db.prepare("UPDATE contacts SET status = 'active', next_send_at = ? WHERE id = ?");
    for (const { id } of ids) upd.run(nowIso, id);
    return NextResponse.json({ ok: true, activated: ids.length });
  }
  if (action === 'deactivate') {
    const n = db.prepare("UPDATE contacts SET status = 'paused' WHERE status = 'active'").run();
    return NextResponse.json({ ok: true, paused: Number(n.changes) });
  }
  if (action === 'tick') {
    const result = await processTick();
    return NextResponse.json({ ok: true, result });
  }
  if (action === 'check-replies') {
    const result = await checkReplies(true);
    return NextResponse.json({ ok: true, result });
  }
  return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 });
}
