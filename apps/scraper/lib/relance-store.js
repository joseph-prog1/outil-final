// Persistance de la fonctionnalité « relance » : file d'attente, journal des
// envois (quota journalier) et réglages. Tout est en JSON sous data/relance/,
// partagé entre l'API Next et le worker détaché (lib/run-relance.mjs).
//
// Quota : HARD_MAX_PER_DAY = 15 (fourchette 10-15 demandée) — le réglage
// dailyTarget est borné à cette valeur quoi qu'il arrive.

const fs = require('fs');
const path = require('path');

const RELANCE_DIR = path.join(process.cwd(), 'data', 'relance');
const QUEUE_FILE = path.join(RELANCE_DIR, 'queue.json');
const LOG_FILE = path.join(RELANCE_DIR, 'log.json');
const SETTINGS_FILE = path.join(RELANCE_DIR, 'settings.json');
const WORKER_FILE = path.join(RELANCE_DIR, 'worker.json');

const HARD_MAX_PER_DAY = 15;
const DEFAULT_DAILY_TARGET = 12;

// Templates repris de l'outil précédent (linkedin-comment-to-dm-bot, « message
// Joseph, 20/07/2026 »). {first_name} et {sujet} sont remplacés à l'envoi :
// {sujet} = le sujet du post sous lequel la personne a commenté (éditable au
// moment de la mise en file / de l'envoi). Sans sujet → variante générique.
const DEFAULT_TEMPLATE_SUJET =
  'Bonjour {first_name},\n\n' +
  "Avez-vous eu l'occasion de consulter le document sur {sujet} ?\n\n" +
  "Si l'IA représente un enjeu pour votre cabinet, ce serait avec plaisir " +
  "que j'échangerais avec vous pour en discuter.";
const DEFAULT_TEMPLATE =
  'Bonjour {first_name},\n\n' +
  "Avez-vous eu l'occasion de consulter le document que je vous ai envoyé ?\n\n" +
  "Si l'IA représente un enjeu pour votre cabinet, ce serait avec plaisir " +
  "que j'échangerais avec vous pour en discuter.";

// Construit le message final. Le sujet est nettoyé (espaces, ponctuation
// terminale) ; vide → variante générique sans sujet.
function buildMessage(firstName, sujet, settings) {
  const s = (sujet || '').replace(/\s+/g, ' ').trim().replace(/[.!?\s]+$/, '');
  const conf = settings || getSettings();
  const tpl = s ? conf.templateSujet : conf.template;
  return tpl.replace(/\{first_name\}/g, firstName || '').replace(/\{sujet\}/g, s);
}

function ensureDir() {
  fs.mkdirSync(RELANCE_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// URL de profil canonique — même clé que scraped-profiles.js pour que la file,
// le log et l'UI parlent du même profil quelle que soit la variante d'URL.
function normalizeUrl(url) {
  return (url || '').split('?')[0].split('#')[0].trim().replace(/\/+$/, '').toLowerCase();
}

// ── Réglages ──────────────────────────────────────────────────────────────────

function getSettings() {
  const s = readJson(SETTINGS_FILE, {});
  const target = parseInt(s.dailyTarget, 10);
  return {
    dailyTarget: Math.min(HARD_MAX_PER_DAY, Math.max(1, isNaN(target) ? DEFAULT_DAILY_TARGET : target)),
    template: typeof s.template === 'string' && s.template.trim() ? s.template : DEFAULT_TEMPLATE,
    templateSujet: typeof s.templateSujet === 'string' && s.templateSujet.trim() ? s.templateSujet : DEFAULT_TEMPLATE_SUJET,
  };
}

function saveSettings({ dailyTarget, template }) {
  const cur = getSettings();
  const parsed = parseInt(dailyTarget, 10);
  const next = {
    dailyTarget: dailyTarget != null && !isNaN(parsed)
      ? Math.min(HARD_MAX_PER_DAY, Math.max(1, parsed))
      : cur.dailyTarget,
    template: typeof template === 'string' && template.trim() ? template : cur.template,
  };
  writeJson(SETTINGS_FILE, next);
  return next;
}

// ── File d'attente ────────────────────────────────────────────────────────────
// Entrée : { profileUrl, name, firstName, queuedAt }

function getQueue() {
  const q = readJson(QUEUE_FILE, []);
  return Array.isArray(q) ? q : [];
}

function enqueue({ profileUrl, name, firstName, sujet }) {
  const key = normalizeUrl(profileUrl);
  if (!key || !name) return { ok: false, error: 'profileUrl et name requis' };
  if (hasBeenRelanced(profileUrl)) return { ok: false, error: 'Déjà relancé' };
  const queue = getQueue();
  if (queue.some((e) => normalizeUrl(e.profileUrl) === key)) {
    return { ok: false, error: 'Déjà en file' };
  }
  queue.push({
    profileUrl,
    name,
    firstName: firstName || name.split(' ')[0],
    sujet: sujet || '',
    queuedAt: new Date().toISOString(),
  });
  writeJson(QUEUE_FILE, queue);
  return { ok: true, queue };
}

function dequeue(profileUrl) {
  const key = normalizeUrl(profileUrl);
  const queue = getQueue().filter((e) => normalizeUrl(e.profileUrl) !== key);
  writeJson(QUEUE_FILE, queue);
  return queue;
}

// Prochaine entrée à traiter (FIFO).
function peekQueue() {
  return getQueue()[0] || null;
}

// ── Journal des envois ────────────────────────────────────────────────────────
// Entrée : { profileUrl, name, sentAt, status: 'sent'|'replied'|'failed', message? }
// Seuls les 'sent' comptent dans le quota. 'replied' (personne a répondu, relance
// annulée) sort le profil de la file sans consommer de quota.

function getLog() {
  const l = readJson(LOG_FILE, []);
  return Array.isArray(l) ? l : [];
}

function recordSend({ profileUrl, name, status, message }) {
  const log = getLog();
  log.push({
    profileUrl,
    name,
    status,
    message: message ? String(message).slice(0, 300) : undefined,
    sentAt: new Date().toISOString(),
  });
  writeJson(LOG_FILE, log);
  // Un envoi réussi (ou une réponse détectée) sort le profil de la file.
  if (status === 'sent' || status === 'replied') dequeue(profileUrl);
  return log;
}

function isSameLocalDay(iso, ref = new Date()) {
  const d = new Date(iso);
  return !isNaN(d.getTime()) &&
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate();
}

function countSentToday() {
  return getLog().filter((e) => e.status === 'sent' && isSameLocalDay(e.sentAt)).length;
}

// Un profil déjà relancé avec succès ne doit jamais l'être une seconde fois.
function hasBeenRelanced(profileUrl) {
  const key = normalizeUrl(profileUrl);
  return getLog().some(
    (e) => (e.status === 'sent' || e.status === 'replied') && normalizeUrl(e.profileUrl) === key
  );
}

// Le quota du jour permet-il un envoi maintenant ?
function canSendNow() {
  const { dailyTarget } = getSettings();
  const sent = countSentToday();
  return { allowed: sent < dailyTarget, sent, dailyTarget };
}

// ── Statut worker ─────────────────────────────────────────────────────────────
// Le worker détaché écrit { pid, status, updatedAt } ; l'API lit ce fichier et
// vérifie que le pid est encore vivant pour afficher « worker actif ».

function readWorkerState() {
  const w = readJson(WORKER_FILE, null);
  if (!w || !w.pid) return { running: false };
  try {
    process.kill(w.pid, 0); // signal 0 = test d'existence
    return { running: w.status !== 'stopped', ...w };
  } catch {
    return { running: false, ...w, status: 'dead' };
  }
}

function writeWorkerState(state) {
  const prev = readJson(WORKER_FILE, {});
  writeJson(WORKER_FILE, { ...prev, ...state, updatedAt: new Date().toISOString() });
}

// ── Vue d'ensemble pour l'UI ──────────────────────────────────────────────────

function getStatus() {
  const settings = getSettings();
  const queue = getQueue();
  const log = getLog();
  const worker = readWorkerState();
  const relancedUrls = {};
  const failedUrls = {};
  for (const e of log) {
    const key = normalizeUrl(e.profileUrl);
    if (e.status === 'sent' || e.status === 'replied') relancedUrls[key] = e.status;
    else if (!(key in relancedUrls)) failedUrls[key] = true;
  }
  return {
    sentToday: countSentToday(),
    dailyTarget: settings.dailyTarget,
    template: settings.template,
    queue: queue.map((e) => ({ ...e, key: normalizeUrl(e.profileUrl) })),
    relancedUrls,
    failedUrls,
    worker: { running: worker.running, status: worker.status || null, updatedAt: worker.updatedAt || null },
    recentLog: log.slice(-20).reverse(),
  };
}

module.exports = {
  HARD_MAX_PER_DAY,
  DEFAULT_TEMPLATE,
  DEFAULT_TEMPLATE_SUJET,
  buildMessage,
  normalizeUrl,
  getSettings,
  saveSettings,
  getQueue,
  enqueue,
  dequeue,
  peekQueue,
  getLog,
  recordSend,
  countSentToday,
  hasBeenRelanced,
  canSendNow,
  readWorkerState,
  writeWorkerState,
  getStatus,
  // exposé pour les tests
  _files: { RELANCE_DIR, QUEUE_FILE, LOG_FILE, SETTINGS_FILE, WORKER_FILE },
};
