import { getDb, getSettings } from './db';
import { slugTheme } from './personas';
import { signContact } from './token';

export interface ContactRow {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  job_title: string;
  persona: string;
  source_slug: string;
  status: string;
  current_step: number;
  next_send_at: string | null;
  last_message_id: string | null;
  thread_subject: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const URL_RE = /https?:\/\/[^\s<>"')]+/g;

// Rend un email pour un contact donné. eventId non nul → liens et pixel de tracking injectés.
export function renderEmail(contact: ContactRow, step: number, eventId: number | null): RenderedEmail {
  const db = getDb();
  const settings = getSettings();
  const template = db.prepare('SELECT * FROM templates WHERE step = ?').get(step) as
    | { step: number; subject: string; body: string }
    | undefined;
  if (!template) throw new Error(`Template introuvable pour l'étape ${step}`);
  const persona = (db.prepare('SELECT * FROM personas WHERE key = ?').get(contact.persona) ??
    db.prepare("SELECT * FROM personas WHERE key = 'autre'").get()) as Record<string, string>;

  const calendly = settings.calendly_url || '[LIEN CALENDLY À CONFIGURER DANS RÉGLAGES]';
  const vars: Record<string, string> = {
    prenom: (contact.first_name || '').trim(),
    nom: (contact.last_name || '').trim(),
    email: contact.email,
    metier: contact.job_title || '',
    source_theme: slugTheme(contact.source_slug),
    calendly,
    expediteur: settings.sender_name || 'Thomas',
    label: persona.label,
    label_pluriel: persona.label_pluriel,
    accroche: persona.accroche,
    cas_usage: persona.cas_usage,
    fonctionnalite: persona.fonctionnalite,
    objection: persona.objection,
    sujet_court: persona.sujet_court,
    probleme: persona.probleme || '',
  };

  const substitute = (input: string) =>
    input.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');

  // Sujet : les étapes 2-4 sans sujet propre continuent le fil ("Re: …")
  let subject = substitute(template.subject || '').trim();
  if (!subject) {
    const base = contact.thread_subject || substitute(
      (db.prepare('SELECT subject FROM templates WHERE step = 1').get() as { subject: string }).subject
    );
    subject = `Re: ${base}`;
  }

  let body = substitute(template.body).trim();
  // "Bonjour ," si le prénom manque → "Bonjour,"
  body = body.replace(/Bonjour\s+,/g, 'Bonjour,');

  const baseUrl = (settings.base_url || '').replace(/\/$/, '');
  const token = signContact(contact.id);
  const unsubUrl = `${baseUrl}/api/unsubscribe?t=${token}`;

  // Version texte : liens bruts + mention de désinscription
  const text = `${body}\n\nPour ne plus recevoir mes emails : ${unsubUrl}`;

  // Version HTML : paragraphes, liens (traqués si eventId), pixel, pied de désinscription
  const trackLink = (url: string) =>
    eventId !== null && baseUrl
      ? `${baseUrl}/api/track/click?e=${eventId}&t=${token}&u=${encodeURIComponent(url)}`
      : url;

  const paragraphs = body
    .split(/\n\n+/)
    .map((p) => {
      const withLinks = escapeHtml(p).replace(URL_RE, (url) => {
        const clean = url.replace(/&amp;/g, '&');
        return `<a href="${trackLink(clean)}" style="color:#0C2A1B;">${clean}</a>`;
      });
      return `<p style="margin:0 0 16px 0;">${withLinks.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  const pixel =
    eventId !== null && baseUrl
      ? `<img src="${baseUrl}/api/track/open?e=${eventId}&t=${token}" width="1" height="1" alt="" style="display:block;"/>`
      : '';

  const html = `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#17150F;max-width:620px;">
${paragraphs}
<p style="margin:28px 0 0 0;"><img src="cid:charlie-logo" width="24" height="21" alt="Charlie" style="display:block;"/></p>
<p style="margin:12px 0 0 0;font-size:12px;color:#6F6A5C;">Pour ne plus recevoir mes emails, <a href="${unsubUrl}" style="color:#6F6A5C;">cliquez ici</a>.</p>
${pixel}
</div>`;

  return { subject, text, html };
}
