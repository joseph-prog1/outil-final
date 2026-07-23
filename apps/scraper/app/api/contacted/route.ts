import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Suivi manuel des prospects contactés : map { <profileUrl>: true }.
// Persisté dans un fichier JSON pour survivre aux rechargements et re-scrapes
// (les profils sont régénérés, mais l'état de contact reste attaché à l'URL).
const FILE = path.join(process.cwd(), 'data', 'contacted.json');

function readMap(): Record<string, boolean> {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, boolean>) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}

export async function GET() {
  return NextResponse.json(readMap());
}

export async function POST(request: NextRequest) {
  try {
    const { profileUrl, contacted } = await request.json();
    if (!profileUrl || typeof profileUrl !== 'string') {
      return NextResponse.json({ error: 'profileUrl requis' }, { status: 400 });
    }
    const map = readMap();
    if (contacted) {
      map[profileUrl] = true;
    } else {
      delete map[profileUrl]; // on ne garde que les "contactés" → fichier compact
    }
    writeMap(map);
    return NextResponse.json({ ok: true, profileUrl, contacted: !!contacted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
