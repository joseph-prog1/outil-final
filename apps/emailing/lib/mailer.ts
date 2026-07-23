import nodemailer from 'nodemailer';
import { getSettings } from './db';
import { ensureGoogleEmail, googleConnected, googleEmail, sendRawViaGmail } from './google';

// Trois modes d'envoi, par ordre de priorité :
// 1. Connexion Google (OAuth) : bouton « Connecter mon compte Gmail » dans Réglages
// 2. Relais SMTP (Brevo, SMTP2GO…)
// 3. Gmail direct (mot de passe d'application)
export function getTransport() {
  const s = getSettings();
  if (s.smtp_user && s.smtp_pass) {
    const port = Number(s.smtp_port || '587');
    return nodemailer.createTransport({
      host: s.smtp_host || 'smtp-relay.brevo.com',
      port,
      secure: port === 465,
      auth: { user: s.smtp_user, pass: s.smtp_pass },
    });
  }
  if (s.gmail_user && s.gmail_app_password) {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: s.gmail_user, pass: s.gmail_app_password.replace(/\s+/g, '') },
    });
  }
  throw new Error(
    'Aucun compte d’envoi configuré : connectez votre compte Google (ou un relais SMTP) dans Réglages.'
  );
}

export function getFromEmail(): string {
  const s = getSettings();
  if (googleConnected()) return googleEmail() || s.from_email || s.gmail_user;
  return s.from_email || s.gmail_user;
}

export interface SendArgs {
  to: string;
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string | null;
}

// Envoie un email et retourne le Message-ID (pour le fil de discussion des relances)
export async function sendMail(args: SendArgs): Promise<string> {
  const s = getSettings();
  let from = getFromEmail();
  if (!from && googleConnected()) from = await ensureGoogleEmail();
  if (!from) {
    throw new Error('Adresse d’expéditeur manquante : connectez votre compte Google ou renseignez Réglages.');
  }
  const mail = {
    from: `"${s.sender_name || 'Thomas'}" <${from}>`,
    to: args.to,
    replyTo: from,
    subject: args.subject,
    text: args.text,
    html: args.html,
    ...(args.inReplyTo ? { inReplyTo: args.inReplyTo, references: args.inReplyTo } : {}),
  };

  if (googleConnected()) {
    // Construit le message MIME avec nodemailer puis l'envoie via l'API Gmail
    const builder = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    const built = await builder.sendMail(mail);
    await sendRawViaGmail(built.message as Buffer);
    return built.messageId;
  }

  const info = await getTransport().sendMail(mail);
  return info.messageId;
}
