import { createHmac } from 'node:crypto';
import { getSetting } from './db';

// Jeton signé pour les liens publics (désinscription) : "<contactId>.<signature>"
export function signContact(contactId: number): string {
  const sig = createHmac('sha256', getSetting('track_secret')).update(String(contactId)).digest('hex').slice(0, 16);
  return `${contactId}.${sig}`;
}

export function verifyContactToken(token: string): number | null {
  const [id, sig] = (token || '').split('.');
  if (!id || !sig) return null;
  const expected = createHmac('sha256', getSetting('track_secret')).update(id).digest('hex').slice(0, 16);
  return sig === expected ? Number(id) : null;
}
