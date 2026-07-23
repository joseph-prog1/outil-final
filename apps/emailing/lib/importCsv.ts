import { getDb } from './db';
import { mapJobTitle } from './personas';

// Parseur CSV minimal (guillemets, virgules échappées, CRLF, BOM)
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

export interface ImportResult {
  total: number;
  imported: number;
  updated: number;
  unsubscribed: number;
  invalid: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Importe un CSV de contacts (format newsletter : email, first_name, last_name,
// job_title, document_slug, is_unsubscribed). Idempotent : ré-importer met à jour.
export function importCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { total: 0, imported: 0, updated: 0, unsubscribed: 0, invalid: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iEmail = col('email');
  if (iEmail === -1) throw new Error('Colonne "email" introuvable dans le CSV');
  const iFirst = col('first_name');
  const iLast = col('last_name');
  const iJob = col('job_title');
  const iSlug = col('document_slug');
  const iUnsub = col('is_unsubscribed');

  const db = getDb();
  const result: ImportResult = { total: rows.length - 1, imported: 0, updated: 0, unsubscribed: 0, invalid: 0 };
  const get = db.prepare('SELECT id, status FROM contacts WHERE email = ?');
  const insert = db.prepare(
    `INSERT INTO contacts (email, first_name, last_name, job_title, persona, source_slug, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const update = db.prepare(
    'UPDATE contacts SET first_name = ?, last_name = ?, job_title = ?, persona = ?, source_slug = ? WHERE id = ?'
  );
  const markUnsub = db.prepare("UPDATE contacts SET status = 'unsubscribed', next_send_at = NULL WHERE id = ?");

  db.exec('BEGIN');
  try {
    for (const r of rows.slice(1)) {
      const email = (r[iEmail] || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        result.invalid++;
        continue;
      }
      const val = (i: number) => (i >= 0 ? (r[i] || '').trim() : '');
      const jobTitle = val(iJob) === 'Non renseigné' ? '' : val(iJob);
      const persona = mapJobTitle(val(iJob));
      const isUnsub = val(iUnsub).toLowerCase() === 'oui';
      const existing = get.get(email) as { id: number; status: string } | undefined;
      if (existing) {
        update.run(val(iFirst), val(iLast), jobTitle, persona, val(iSlug), existing.id);
        if (isUnsub && existing.status !== 'unsubscribed') {
          markUnsub.run(existing.id);
          result.unsubscribed++;
        }
        result.updated++;
      } else {
        insert.run(email, val(iFirst), val(iLast), jobTitle, persona, val(iSlug), isUnsub ? 'unsubscribed' : 'pending');
        result.imported++;
        if (isUnsub) result.unsubscribed++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return result;
}
