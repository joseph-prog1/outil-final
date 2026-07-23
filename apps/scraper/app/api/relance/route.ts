import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';

// API de la fonctionnalité « relance » (DM de suivi LinkedIn).
// L'état vit dans data/relance/ via lib/relance-store.js, partagé avec le
// processus détaché lib/run-relance.mjs (envoi unitaire ou worker de file).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const store = require('../../../lib/relance-store.js');

const LOG_FILE = path.join(process.cwd(), 'data', 'relance', 'relance.log');

function spawnDetached(args: string[]) {
  const script = path.join(process.cwd(), 'lib', 'run-relance.mjs');
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  const out = fs.openSync(LOG_FILE, 'a');
  const child = spawn('node', [script, ...args], {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env },
  });
  child.unref();
  return child.pid;
}

function hasSession(): boolean {
  return fs.existsSync(path.join(process.cwd(), '.sessions', 'default.json'));
}

export async function GET() {
  return NextResponse.json(store.getStatus());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'queue') {
      const { profileUrl, name, firstName, sujet } = body;
      const res = store.enqueue({ profileUrl, name, firstName, sujet });
      return NextResponse.json({ ...res, status: store.getStatus() });
    }

    if (action === 'unqueue') {
      store.dequeue(body.profileUrl);
      return NextResponse.json({ ok: true, status: store.getStatus() });
    }

    if (action === 'send') {
      const { profileUrl, name } = body;
      if (!profileUrl || !name) {
        return NextResponse.json({ error: 'profileUrl et name requis' }, { status: 400 });
      }
      if (!hasSession()) {
        return NextResponse.json({ error: 'Aucune session LinkedIn — connectez-vous depuis le dashboard Scraper' }, { status: 401 });
      }
      if (store.hasBeenRelanced(profileUrl)) {
        return NextResponse.json({ error: 'Ce profil a déjà été relancé' }, { status: 409 });
      }
      const quota = store.canSendNow();
      if (!quota.allowed) {
        return NextResponse.json(
          { error: `Quota journalier atteint (${quota.sent}/${quota.dailyTarget})` },
          { status: 429 }
        );
      }
      const pid = spawnDetached(['once', profileUrl, name, body.sujet || '']);
      return NextResponse.json({ ok: true, pid, message: `Relance lancée pour ${name} (résultat dans ~1 min)` });
    }

    if (action === 'start-worker') {
      if (!hasSession()) {
        return NextResponse.json({ error: 'Aucune session LinkedIn — connectez-vous depuis le dashboard Scraper' }, { status: 401 });
      }
      const worker = store.readWorkerState();
      if (worker.running) {
        return NextResponse.json({ error: 'Le worker tourne déjà' }, { status: 409 });
      }
      if (store.getQueue().length === 0) {
        return NextResponse.json({ error: 'La file est vide' }, { status: 400 });
      }
      const pid = spawnDetached(['worker']);
      return NextResponse.json({ ok: true, pid, message: 'Worker de file démarré' });
    }

    if (action === 'stop-worker') {
      const worker = store.readWorkerState();
      if (!worker.running || !worker.pid) {
        return NextResponse.json({ error: 'Aucun worker actif' }, { status: 400 });
      }
      try {
        process.kill(worker.pid, 'SIGTERM');
      } catch {
        /* déjà mort */
      }
      store.writeWorkerState({ status: 'stopped', pid: null });
      return NextResponse.json({ ok: true, message: 'Worker arrêté' });
    }

    if (action === 'settings') {
      const next = store.saveSettings({ dailyTarget: body.dailyTarget, template: body.template });
      return NextResponse.json({ ok: true, settings: next });
    }

    return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
