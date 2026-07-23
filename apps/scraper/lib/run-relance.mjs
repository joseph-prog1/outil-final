// Processus détaché de relance (spawné par /api/relance, comme run-scraper.mjs) :
//
//   node lib/run-relance.mjs once <profileUrl> <name>   → un envoi immédiat
//   node lib/run-relance.mjs once <url> <name> --dry-run → flux complet sans envoi
//   node lib/run-relance.mjs worker                      → vide la file au rythme
//                                                          du quota, étalé sur la journée
//
// Le worker respecte : quota journalier (réglable, max 15), heures ouvrées
// (8h-22h, comme l'ancien outil), délais anti-ban 10-15 min entre envois avec
// pauses longues (25-45 min) toutes les 2 relances. Il écrit son statut dans
// data/relance/worker.json (lu par l'UI) et s'arrête tout seul quand la file
// est vide ou le quota atteint.

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { sendDm } from './send-dm.mjs';

const require = createRequire(import.meta.url);
const store = require('./relance-store.js');

process.on('unhandledRejection', (err) => {
  console.error('[RELANCE] unhandledRejection:', err?.message || err);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);

// Mêmes bornes que l'ancien outil (kit anti-ban) :
const WORK_HOUR_START = 8;
const WORK_HOUR_END = 22;
const DELAY_MIN_S = 600;   // 10 min entre deux relances
const DELAY_MAX_S = 900;   // 15 min
const PAUSE_EVERY = 2;     // pause longue toutes les 2 relances
const PAUSE_MIN_S = 1500;  // 25 min
const PAUSE_MAX_S = 2700;  // 45 min

function loadStorageState() {
  const file = path.join(process.cwd(), '.sessions', 'default.json');
  if (!fs.existsSync(file)) throw new Error('Session LinkedIn introuvable (.sessions/default.json) — connectez-vous depuis le dashboard');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return parsed.storageState ? parsed.storageState : parsed;
}

// Envoie UNE relance à un contact ; enregistre le résultat dans le log/quota.
// Retourne le code sendDm.
async function sendOne(context, { profileUrl, name, firstName, sujet }, dryRun = false) {
  const first = firstName || (name || '').split(' ')[0];
  const message = store.buildMessage(first, sujet);
  const result = await sendDm(context, profileUrl, message, name, { dryRun });

  if (dryRun) return result;

  if (result === 'sent') {
    store.recordSend({ profileUrl, name, status: 'sent', message });
  } else if (result === 'replied') {
    // A déjà répondu : sort de la file, ne consomme pas de quota.
    store.recordSend({ profileUrl, name, status: 'replied' });
  } else if (result === 'failed') {
    store.recordSend({ profileUrl, name, status: 'failed' });
  }
  return result;
}

async function withBrowser(fn) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: loadStorageState() });
    return await fn(context);
  } finally {
    try { await browser.close(); } catch {}
  }
}

// ── Mode « once » : envoi immédiat d'une relance ──────────────────────────────

async function runOnce(profileUrl, name, sujet, dryRun) {
  if (!dryRun) {
    if (store.hasBeenRelanced(profileUrl)) {
      console.error(`[RELANCE] ${name} a déjà été relancé — abandon`);
      process.exit(2);
    }
    const quota = store.canSendNow();
    if (!quota.allowed) {
      console.error(`[RELANCE] Quota journalier atteint (${quota.sent}/${quota.dailyTarget}) — abandon`);
      process.exit(3);
    }
  }
  const result = await withBrowser((context) =>
    sendOne(context, { profileUrl, name, sujet }, dryRun)
  );
  console.error(`[RELANCE] Résultat : ${result}`);
  process.exit(result === 'sent' || result === 'dry_run_ok' ? 0 : 1);
}

// ── Mode « worker » : vide la file, étalé sur la journée ─────────────────────

async function runWorker() {
  const existing = store.readWorkerState();
  if (existing.running && existing.pid !== process.pid) {
    console.error(`[WORKER] Un worker tourne déjà (pid ${existing.pid}) — abandon`);
    process.exit(1);
  }
  store.writeWorkerState({ pid: process.pid, status: 'running', startedAt: new Date().toISOString() });

  // Arrêt propre sur SIGTERM (bouton « Arrêter » de l'UI).
  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; });

  console.error(`[WORKER] Démarré (pid ${process.pid})`);
  let sentThisSession = 0;

  while (!stopping) {
    const hour = new Date().getHours();
    if (hour < WORK_HOUR_START || hour >= WORK_HOUR_END) {
      // Hors heures ouvrées : le worker s'arrête — il sera relancé le lendemain.
      console.error(`[WORKER] Hors heures ouvrées (${hour}h) — arrêt`);
      break;
    }

    const quota = store.canSendNow();
    if (!quota.allowed) {
      console.error(`[WORKER] Objectif du jour atteint (${quota.sent}/${quota.dailyTarget}) — arrêt`);
      break;
    }

    const next = store.peekQueue();
    if (!next) {
      console.error(`[WORKER] File vide — arrêt`);
      break;
    }

    // Profil déjà relancé entre-temps (envoi manuel) → on l'enlève et on continue.
    if (store.hasBeenRelanced(next.profileUrl)) {
      console.error(`[WORKER] ${next.name} déjà relancé — retiré de la file`);
      store.dequeue(next.profileUrl);
      continue;
    }

    store.writeWorkerState({ status: 'running', current: next.name });
    console.error(`[WORKER] Relance ${quota.sent + 1}/${quota.dailyTarget} → ${next.name}`);

    let result;
    try {
      result = await withBrowser((context) => sendOne(context, next));
    } catch (e) {
      console.error(`[WORKER] Erreur : ${e.message}`);
      result = 'failed';
    }

    if (result === 'failed') {
      // Échec technique : retiré de la file (tracé dans le log → ⚠ dans l'UI)
      // pour ne pas bloquer les suivants ni boucler indéfiniment. L'utilisateur
      // peut re-mettre en file à la main.
      store.dequeue(next.profileUrl);
    }

    if (result === 'sent') {
      sentThisSession++;
      // Délais anti-ban : pause longue toutes les PAUSE_EVERY relances.
      const remaining = store.getQueue().length;
      if (remaining > 0 && store.canSendNow().allowed) {
        const pauseS = sentThisSession % PAUSE_EVERY === 0
          ? rand(PAUSE_MIN_S, PAUSE_MAX_S)
          : rand(DELAY_MIN_S, DELAY_MAX_S);
        const resume = new Date(Date.now() + pauseS * 1000);
        console.error(`[WORKER] Pause anti-ban ${(pauseS / 60).toFixed(1)} min — reprise à ${resume.toLocaleTimeString('fr-FR')}`);
        store.writeWorkerState({ status: 'pausing', resumeAt: resume.toISOString(), current: null });
        // Sommeil par tranches pour réagir au SIGTERM.
        let left = pauseS * 1000;
        while (left > 0 && !stopping) {
          const chunk = Math.min(30000, left);
          await sleep(chunk);
          left -= chunk;
        }
      }
    } else {
      await sleep(rand(15000, 40000)); // petit délai même après un échec/skip
    }
  }

  store.writeWorkerState({ status: 'stopped', pid: null, current: null });
  console.error(`[WORKER] Terminé — ${sentThisSession} relance(s) envoyée(s) cette session`);
  process.exit(0);
}

// ── Entrée CLI ────────────────────────────────────────────────────────────────

const [mode, ...args] = process.argv.slice(2);

if (mode === 'once') {
  const dryRun = args.includes('--dry-run');
  const [profileUrl, name, sujet] = args.filter((a) => a !== '--dry-run');
  if (!profileUrl || !name) {
    console.error('Usage: node lib/run-relance.mjs once <profileUrl> <name> [sujet] [--dry-run]');
    process.exit(1);
  }
  await runOnce(profileUrl, name, sujet || '', dryRun);
} else if (mode === 'worker') {
  await runWorker();
} else {
  console.error('Usage: node lib/run-relance.mjs once|worker …');
  process.exit(1);
}
