import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

function loadSession(userId) {
  const sessionFile = path.join(process.cwd(), '.sessions', `${userId}.json`);
  if (!fs.existsSync(sessionFile)) {
    console.log(`[SESSION] Not found for user ${userId}`);
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    console.log(`[SESSION] Loaded for user ${userId}`);
    return data.storageState;
  } catch (error) {
    console.error(`[SESSION] Error loading session:`, error);
    return null;
  }
}

// Démarre un scrape en TÂCHE DE FOND et renvoie aussitôt un jobId.
// Le scrape (extraction des commentaires + visite systématique de chaque profil
// pour l'entreprise/effectif) peut durer très longtemps avec les temporisations
// anti-détection, donc on ne bloque pas la requête HTTP.
export async function POST(request) {
  try {
    const { postUrl, userId } = await request.json();

    if (!postUrl || !userId) {
      return NextResponse.json({ error: 'postUrl and userId required' }, { status: 400 });
    }

    const storageState = loadSession(userId);
    if (!storageState) {
      return NextResponse.json({ error: 'No session found. Please login first.' }, { status: 401 });
    }

    const jobId = `${userId}-${Date.now()}`;

    // Dossiers de travail
    const resultsDir = path.join(process.cwd(), 'data/scrape-results');
    const jobsDir = path.join(process.cwd(), 'data/jobs');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.mkdirSync(jobsDir, { recursive: true });

    // Cookies de session dans un fichier temporaire propre à ce job (supprimé par le scraper)
    const tempCookieFile = path.join(jobsDir, `.cookies-${jobId}.json`);
    fs.writeFileSync(tempCookieFile, JSON.stringify(storageState));

    const resultFile = path.join(resultsDir, `${jobId}.json`);
    const jobFile = path.join(jobsDir, `${jobId}.json`);
    const logFile = path.join(jobsDir, `${jobId}.log`);

    // Statut initial
    fs.writeFileSync(jobFile, JSON.stringify({
      jobId, postUrl, status: 'running', startedAt: new Date().toISOString(),
    }, null, 2));

    console.log(`[API] Background scrape ${jobId} for ${postUrl}`);

    // Lancement détaché : survit indépendamment de la requête HTTP.
    const scraperScript = path.join(process.cwd(), 'lib/run-scraper.mjs');
    const out = fs.openSync(logFile, 'a');
    const child = spawn('node', [scraperScript, postUrl, tempCookieFile, resultFile, jobFile], {
      detached: true,
      stdio: ['ignore', out, out],
      env: { ...process.env },
    });
    child.unref();

    return NextResponse.json({ jobId, status: 'running' });
  } catch (error) {
    console.error('[API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Statut d'un job : GET /api/scrape?jobId=...
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ message: 'POST /api/scrape with postUrl and userId → renvoie un jobId. GET ?jobId=... pour le statut.' });
  }

  // Empêche la traversée de chemin
  if (!/^[\w.-]+$/.test(jobId)) {
    return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 });
  }

  const jobFile = path.join(process.cwd(), 'data/jobs', `${jobId}.json`);
  if (!fs.existsSync(jobFile)) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  try {
    const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
    return NextResponse.json(job);
  } catch (e) {
    return NextResponse.json({ error: 'Cannot read job status' }, { status: 500 });
  }
}
