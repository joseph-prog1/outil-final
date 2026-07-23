import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { importCsv } from '@/lib/importCsv';

export const dynamic = 'force-dynamic';

// POST : importe un CSV — soit un fichier uploadé (multipart), soit un CSV
// présent dans le dossier du projet ({ localFile: "nom.csv" }).
export async function POST(req: NextRequest) {
  try {
    let text: string;
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Aucun fichier reçu' }, { status: 400 });
      }
      text = Buffer.from(await file.arrayBuffer()).toString('utf-8');
    } else {
      const body = await req.json();
      const name = path.basename(String(body.localFile || ''));
      if (!name.endsWith('.csv')) {
        return NextResponse.json({ error: 'localFile doit être un .csv du dossier du projet' }, { status: 400 });
      }
      text = fs.readFileSync(path.join(process.cwd(), name), 'utf-8');
    }
    const result = importCsv(text);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// GET : liste les CSV disponibles dans le dossier du projet
export async function GET() {
  const files = fs
    .readdirSync(process.cwd())
    .filter((f) => f.endsWith('.csv'))
    .map((f) => ({ name: f, size: fs.statSync(path.join(process.cwd(), f)).size }));
  return NextResponse.json({ files });
}
