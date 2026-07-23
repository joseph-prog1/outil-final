import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  return NextResponse.json({
    templates: db.prepare('SELECT * FROM templates ORDER BY step').all(),
    personas: db.prepare('SELECT * FROM personas ORDER BY key').all(),
  });
}

export async function PUT(req: NextRequest) {
  const db = getDb();
  const body = await req.json();
  if (Array.isArray(body.templates)) {
    const upd = db.prepare('UPDATE templates SET name = ?, delay_days = ?, subject = ?, body = ? WHERE step = ?');
    for (const t of body.templates) {
      upd.run(String(t.name || ''), Number(t.delay_days) || 0, String(t.subject || ''), String(t.body || ''), Number(t.step));
    }
  }
  if (Array.isArray(body.personas)) {
    const upd = db.prepare(
      `UPDATE personas SET label = ?, label_pluriel = ?, accroche = ?, cas_usage = ?,
       fonctionnalite = ?, objection = ?, sujet_court = ?, probleme = ? WHERE key = ?`
    );
    for (const p of body.personas) {
      upd.run(
        String(p.label || ''),
        String(p.label_pluriel || ''),
        String(p.accroche || ''),
        String(p.cas_usage || ''),
        String(p.fonctionnalite || ''),
        String(p.objection || ''),
        String(p.sujet_court || ''),
        String(p.probleme || ''),
        String(p.key)
      );
    }
  }
  return NextResponse.json({ ok: true });
}
