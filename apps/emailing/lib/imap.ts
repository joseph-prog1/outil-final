import { ImapFlow } from 'imapflow';
import { getDb, getSetting, getSettings, setSetting } from './db';
import { checkRepliesViaGmail, googleConnected } from './google';

// Détection des réponses : via l'API Gmail (connexion Google) si disponible,
// sinon via IMAP (mot de passe d'application). Arrête la séquence des contacts qui ont répondu.
export async function checkReplies(force = false): Promise<{ checked: boolean; replies: number; error?: string }> {
  const s = getSettings();
  if (!googleConnected() && (!s.gmail_user || !s.gmail_app_password)) {
    return { checked: false, replies: 0, error: 'Détection des réponses non configurée (connexion Google requise)' };
  }

  // Au plus une vérification toutes les 10 minutes (sauf demande manuelle)
  const last = getSetting('last_reply_check');
  if (!force && last && Date.now() - Date.parse(last) < 10 * 60 * 1000) {
    return { checked: false, replies: 0 };
  }
  setSetting('last_reply_check', new Date().toISOString());

  if (googleConnected()) {
    try {
      const replies = await checkRepliesViaGmail();
      return { checked: true, replies };
    } catch (err) {
      return { checked: false, replies: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const db = getDb();
  const candidates = db
    .prepare("SELECT id, email FROM contacts WHERE status IN ('active', 'completed') AND current_step > 0")
    .all() as Array<{ id: number; email: string }>;
  if (candidates.length === 0) return { checked: true, replies: 0 };
  const byEmail = new Map(candidates.map((c) => [c.email.toLowerCase(), c.id]));

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: s.gmail_user, pass: s.gmail_app_password.replace(/\s+/g, '') },
    logger: false,
  });

  let replies = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      for await (const msg of client.fetch({ since }, { envelope: true })) {
        const from = msg.envelope?.from?.[0]?.address?.toLowerCase();
        if (!from) continue;
        const contactId = byEmail.get(from);
        if (contactId === undefined) continue;
        const already = db
          .prepare("SELECT 1 FROM events WHERE contact_id = ? AND type = 'reply' LIMIT 1")
          .get(contactId);
        if (already) continue;
        db.prepare("UPDATE contacts SET status = 'replied', next_send_at = NULL WHERE id = ?").run(contactId);
        db.prepare("INSERT INTO events (contact_id, type, meta) VALUES (?, 'reply', ?)").run(
          contactId,
          msg.envelope?.subject || ''
        );
        replies++;
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return { checked: true, replies };
  } catch (err) {
    try {
      await client.logout();
    } catch {
      /* déjà déconnecté */
    }
    return { checked: false, replies, error: err instanceof Error ? err.message : String(err) };
  }
}
