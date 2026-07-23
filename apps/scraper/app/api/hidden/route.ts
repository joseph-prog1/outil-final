import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normalizeProfileUrl } = require('../../../lib/scraped-profiles.js');

export const dynamic = 'force-dynamic';

// Profils supprimés à la main : map { <profileUrl normalisée>: true }.
// Persisté dans un fichier JSON : un profil supprimé n'est plus jamais présenté,
// même si un re-scrape le retrouve (l'exclusion est attachée à l'URL).
// Pour restaurer un profil, retirer sa ligne de ce fichier.
const FILE = path.join(process.cwd(), 'data', 'hidden-profiles.json');

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
    const { profileUrl, hidden } = await request.json();
    if (!profileUrl || typeof profileUrl !== 'string') {
      return NextResponse.json({ error: 'profileUrl requis' }, { status: 400 });
    }
    const key = normalizeProfileUrl(profileUrl);
    const map = readMap();
    if (hidden === false) {
      delete map[key]; // restauration : le profil réapparaîtra au prochain chargement
    } else {
      map[key] = true;
    }
    writeMap(map);
    return NextResponse.json({ ok: true, profileUrl: key, hidden: hidden !== false });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
