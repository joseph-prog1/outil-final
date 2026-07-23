import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sentToday } from '@/lib/sequencer';
import { ensureScheduler } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';

export async function GET() {
  ensureScheduler();
  const db = getDb();

  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

  const byStatus = Object.fromEntries(
    (db.prepare('SELECT status, COUNT(*) AS n FROM contacts GROUP BY status').all() as Array<{ status: string; n: number }>).map(
      (r) => [r.status, r.n]
    )
  );

  const totalSent = count("SELECT COUNT(*) AS n FROM events WHERE type = 'sent'");
  const uniqueOpens = count("SELECT COUNT(DISTINCT contact_id) AS n FROM events WHERE type = 'open'");
  const uniqueClicks = count("SELECT COUNT(DISTINCT contact_id) AS n FROM events WHERE type = 'click'");
  const contactsContacted = count("SELECT COUNT(DISTINCT contact_id) AS n FROM events WHERE type = 'sent'");
  const replies = count("SELECT COUNT(*) AS n FROM contacts WHERE status = 'replied'");
  const rdv = count("SELECT COUNT(*) AS n FROM contacts WHERE status = 'rdv'");

  const byStep = db
    .prepare(
      `SELECT e.step,
              COUNT(*) AS sent,
              COUNT(DISTINCT o.contact_id) AS opens,
              COUNT(DISTINCT c2.contact_id) AS clicks
       FROM events e
       LEFT JOIN events o ON o.type = 'open' AND o.step = e.step AND o.contact_id = e.contact_id
       LEFT JOIN events c2 ON c2.type = 'click' AND c2.step = e.step AND c2.contact_id = e.contact_id
       WHERE e.type = 'sent'
       GROUP BY e.step ORDER BY e.step`
    )
    .all();

  const byPersona = db
    .prepare(
      `SELECT p.label AS persona, COUNT(*) AS total,
              SUM(CASE WHEN c.status = 'replied' THEN 1 ELSE 0 END) AS replied,
              SUM(CASE WHEN c.status = 'rdv' THEN 1 ELSE 0 END) AS rdv
       FROM contacts c LEFT JOIN personas p ON p.key = c.persona
       GROUP BY c.persona ORDER BY total DESC`
    )
    .all();

  const recentEvents = db
    .prepare(
      `SELECT e.id, e.type, e.step, e.meta, e.created_at, c.email, c.first_name, c.last_name
       FROM events e LEFT JOIN contacts c ON c.id = e.contact_id
       ORDER BY e.id DESC LIMIT 25`
    )
    .all();

  return NextResponse.json({
    totalContacts: count('SELECT COUNT(*) AS n FROM contacts'),
    byStatus,
    totalSent,
    sentToday: sentToday(),
    contactsContacted,
    uniqueOpens,
    uniqueClicks,
    replies,
    rdv,
    openRate: contactsContacted ? uniqueOpens / contactsContacted : 0,
    clickRate: contactsContacted ? uniqueClicks / contactsContacted : 0,
    replyRate: contactsContacted ? replies / contactsContacted : 0,
    byStep,
    byPersona,
    recentEvents,
  });
}
