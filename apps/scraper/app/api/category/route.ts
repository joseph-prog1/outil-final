import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Catégories forcées à la main : map { <profileUrl>: category }.
// Persisté dans un fichier JSON, attaché à l'URL du profil (survit aux re-scrapes).
// Une entrée ici prime sur la catégorie calculée automatiquement.
const FILE = path.join(process.cwd(), 'data', 'category-overrides.json');
const VALID = new Set(['ultra_boss', 'boss', 'cgp', 'out_of_scope']);

function readMap(): Record<string, string> {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}

export async function GET() {
  return NextResponse.json(readMap());
}

export async function POST(request: NextRequest) {
  try {
    const { profileUrl, category } = await request.json();
    if (!profileUrl || typeof profileUrl !== 'string') {
      return NextResponse.json({ error: 'profileUrl requis' }, { status: 400 });
    }
    const map = readMap();
    // category vide / "auto" → on retire l'override (retour au calcul automatique)
    if (!category || category === 'auto') {
      delete map[profileUrl];
    } else if (VALID.has(category)) {
      map[profileUrl] = category;
    } else {
      return NextResponse.json({ error: 'category invalide' }, { status: 400 });
    }
    writeMap(map);
    return NextResponse.json({ ok: true, profileUrl, category: map[profileUrl] || null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
