import { getDb, getSettings } from './db';
import { renderEmail, type ContactRow } from './render';
import { sendMail } from './mailer';
import { checkReplies } from './imap';

const MAX_STEP = 4;
const BATCH_PER_TICK = 5;

export interface TickResult {
  ran: boolean;
  reason?: string;
  sent: number;
  errors: number;
  replies: number;
  capRemaining: number;
}

function inSendWindow(s: Record<string, string>): boolean {
  const now = new Date();
  const days = (s.send_days || '1,2,3,4,5').split(',').map(Number);
  if (!days.includes(now.getDay())) return false;
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= toMin(s.send_start || '08:30') && cur <= toMin(s.send_end || '18:30');
}

export function sentToday(): number {
  const startLocal = new Date();
  startLocal.setHours(0, 0, 0, 0);
  const iso = startLocal.toISOString().slice(0, 19).replace('T', ' ');
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'sent' AND created_at >= ?")
    .get(iso) as { n: number };
  return row.n;
}

// Un "tick" : vérifie les réponses, puis envoie les emails dus (dans la limite
// du quota journalier et de la fenêtre d'envoi).
export async function processTick(): Promise<TickResult> {
  const db = getDb();
  const s = getSettings();

  const replyResult = await checkReplies().catch(() => ({ replies: 0 }));
  const replies = replyResult.replies ?? 0;

  if (s.sending_enabled !== '1') {
    return { ran: false, reason: 'Campagne en pause', sent: 0, errors: 0, replies, capRemaining: 0 };
  }
  if (!inSendWindow(s)) {
    return { ran: false, reason: 'Hors fenêtre d’envoi', sent: 0, errors: 0, replies, capRemaining: 0 };
  }

  const cap = Number(s.daily_cap || '40');
  let capRemaining = Math.max(0, cap - sentToday());
  if (capRemaining === 0) {
    return { ran: false, reason: 'Quota journalier atteint', sent: 0, errors: 0, replies, capRemaining };
  }

  const nowIso = new Date().toISOString();
  const due = db
    .prepare(
      `SELECT * FROM contacts
       WHERE status = 'active' AND next_send_at IS NOT NULL AND next_send_at <= ?
       ORDER BY next_send_at ASC LIMIT ?`
    )
    .all(nowIso, Math.min(BATCH_PER_TICK, capRemaining)) as unknown as ContactRow[];

  let sent = 0;
  let errors = 0;

  for (const contact of due) {
    const step = contact.current_step + 1;
    if (step > MAX_STEP) {
      db.prepare("UPDATE contacts SET status = 'completed', next_send_at = NULL WHERE id = ?").run(contact.id);
      continue;
    }
    const eventResult = db
      .prepare("INSERT INTO events (contact_id, type, step) VALUES (?, 'sent', ?)")
      .run(contact.id, step);
    const eventId = Number(eventResult.lastInsertRowid);
    try {
      const rendered = renderEmail(contact, step, eventId);
      const messageId = await sendMail({
        to: contact.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        inReplyTo: step > 1 ? contact.last_message_id : null,
      });

      const nextTemplate = db.prepare('SELECT delay_days FROM templates WHERE step = ?').get(step + 1) as
        | { delay_days: number }
        | undefined;
      if (step >= MAX_STEP || !nextTemplate) {
        db.prepare(
          "UPDATE contacts SET current_step = ?, status = 'completed', next_send_at = NULL, last_message_id = ?, thread_subject = COALESCE(thread_subject, ?) WHERE id = ?"
        ).run(step, messageId, rendered.subject.replace(/^Re:\s*/i, ''), contact.id);
      } else {
        const next = new Date(Date.now() + nextTemplate.delay_days * 24 * 60 * 60 * 1000);
        db.prepare(
          'UPDATE contacts SET current_step = ?, next_send_at = ?, last_message_id = ?, thread_subject = COALESCE(thread_subject, ?) WHERE id = ?'
        ).run(step, next.toISOString(), messageId, rendered.subject.replace(/^Re:\s*/i, ''), contact.id);
      }
      sent++;
      capRemaining--;
    } catch (err) {
      // Échec d'envoi : on retire l'événement "sent", on journalise l'erreur et on met le contact en erreur
      db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
      db.prepare("INSERT INTO events (contact_id, type, step, meta) VALUES (?, 'error', ?, ?)").run(
        contact.id,
        step,
        err instanceof Error ? err.message : String(err)
      );
      db.prepare("UPDATE contacts SET status = 'error' WHERE id = ?").run(contact.id);
      errors++;
    }
    // Espacement anti-spam entre deux envois (jitter 2-6 s)
    if (due.indexOf(contact) < due.length - 1) {
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 4000));
    }
  }

  return { ran: true, sent, errors, replies, capRemaining };
}
