import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const db = getDb();
  const params = req.nextUrl.searchParams;
  const q = (params.get('q') || '').trim();
  const persona = params.get('persona') || '';
  const status = params.get('status') || '';
  const page = Math.max(1, Number(params.get('page') || '1'));

  const where: string[] = [];
  const args: string[] = [];
  if (q) {
    where.push('(email LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR job_title LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like);
  }
  if (persona) {
    where.push('persona = ?');
    args.push(persona);
  }
  if (status) {
    where.push('status = ?');
    args.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM contacts ${whereSql}`).get(...args) as { n: number }).n;
  const contacts = db
    .prepare(
      `SELECT c.*, p.label AS persona_label,
              (SELECT COUNT(*) FROM events e WHERE e.contact_id = c.id AND e.type = 'open') AS opens,
              (SELECT COUNT(*) FROM events e WHERE e.contact_id = c.id AND e.type = 'click') AS clicks
       FROM contacts c LEFT JOIN personas p ON p.key = c.persona
       ${whereSql} ORDER BY c.id ASC LIMIT ? OFFSET ?`
    )
    .all(...args, String(PAGE_SIZE), String((page - 1) * PAGE_SIZE));

  return NextResponse.json({ total, page, pageSize: PAGE_SIZE, contacts });
}
