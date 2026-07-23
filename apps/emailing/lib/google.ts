import { getDb, getSetting, setSetting } from './db';

// Connexion Gmail par OAuth (bouton « Continuer avec Google ») :
// envoi via l'API Gmail + détection des réponses, sans mot de passe d'application.
// Gratuit — nécessite seulement une clé OAuth créée une fois sur console.cloud.google.com.

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function googleConnected(): boolean {
  return Boolean(getSetting('google_refresh_token'));
}

export function googleEmail(): string {
  return getSetting('google_email');
}

export function disconnectGoogle() {
  setSetting('google_refresh_token', '');
  setSetting('google_access_token', '');
  setSetting('google_token_expiry', '');
  setSetting('google_email', '');
}

export async function exchangeCode(code: string, redirectUri: string): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getSetting('google_client_id'),
      client_secret: getSetting('google_client_secret'),
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Échange du code OAuth impossible');
  }
  setSetting('google_access_token', data.access_token);
  setSetting('google_token_expiry', String(Date.now() + (data.expires_in || 3600) * 1000 - 60_000));
  if (data.refresh_token) setSetting('google_refresh_token', data.refresh_token);

  if (data.scope) setSetting('google_scopes', data.scope);
  const profile = await fetch(`${GMAIL_API}/profile`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  })
    .then((r) => r.json())
    .catch(() => ({}));
  if (profile.emailAddress) setSetting('google_email', profile.emailAddress);
}

// Récupère (et mémorise) l'adresse du compte connecté si elle manque encore
export async function ensureGoogleEmail(): Promise<string> {
  const known = googleEmail();
  if (known) return known;
  try {
    const token = await getAccessToken();
    const profile = await fetch(`${GMAIL_API}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    if (profile.emailAddress) {
      setSetting('google_email', profile.emailAddress);
      return profile.emailAddress;
    }
  } catch {
    /* le profil n'est pas accessible avec les autorisations accordées */
  }
  return '';
}

async function getAccessToken(): Promise<string> {
  const expiry = Number(getSetting('google_token_expiry') || '0');
  const current = getSetting('google_access_token');
  if (current && Date.now() < expiry) return current;

  const refreshToken = getSetting('google_refresh_token');
  if (!refreshToken) throw new Error('Compte Google non connecté');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getSetting('google_client_id'),
      client_secret: getSetting('google_client_secret'),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    if (data.error === 'invalid_grant') {
      disconnectGoogle();
      throw new Error('Connexion Google expirée — cliquez sur « Connecter mon compte Gmail » dans Réglages.');
    }
    throw new Error(data.error_description || data.error || 'Rafraîchissement du jeton Google impossible');
  }
  setSetting('google_access_token', data.access_token);
  setSetting('google_token_expiry', String(Date.now() + (data.expires_in || 3600) * 1000 - 60_000));
  return data.access_token;
}

// Envoie un message MIME brut (RFC 822) via l'API Gmail
export async function sendRawViaGmail(rawMime: Buffer): Promise<void> {
  const token = await getAccessToken();
  const raw = rawMime.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `Envoi Gmail refusé (HTTP ${res.status})`);
  }
}

// Détection des réponses via l'API Gmail : renvoie les adresses ayant écrit
// dans la boîte de réception sur les 7 derniers jours.
export async function recentInboxSenders(): Promise<Set<string>> {
  const token = await getAccessToken();
  const senders = new Set<string>();
  const list = await fetch(`${GMAIL_API}/messages?q=${encodeURIComponent('in:inbox newer_than:7d')}&maxResults=100`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  for (const m of list.messages || []) {
    const msg = await fetch(`${GMAIL_API}/messages/${m.id}?format=metadata&metadataHeaders=From`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    const from = (msg.payload?.headers || []).find((h: { name: string; value: string }) => h.name === 'From')?.value || '';
    const match = from.match(/<([^>]+)>/);
    const email = (match ? match[1] : from).trim().toLowerCase();
    if (email.includes('@')) senders.add(email);
  }
  return senders;
}

// Marque comme "répondu" les contacts en séquence dont l'adresse apparaît dans la boîte
export async function checkRepliesViaGmail(): Promise<number> {
  const db = getDb();
  const candidates = db
    .prepare("SELECT id, email FROM contacts WHERE status IN ('active', 'completed') AND current_step > 0")
    .all() as Array<{ id: number; email: string }>;
  if (candidates.length === 0) return 0;

  const senders = await recentInboxSenders();
  let replies = 0;
  for (const c of candidates) {
    if (!senders.has(c.email.toLowerCase())) continue;
    const already = db.prepare("SELECT 1 FROM events WHERE contact_id = ? AND type = 'reply' LIMIT 1").get(c.id);
    if (already) continue;
    db.prepare("UPDATE contacts SET status = 'replied', next_send_at = NULL WHERE id = ?").run(c.id);
    db.prepare("INSERT INTO events (contact_id, type, meta) VALUES (?, 'reply', 'API Gmail')").run(c.id);
    replies++;
  }
  return replies;
}
