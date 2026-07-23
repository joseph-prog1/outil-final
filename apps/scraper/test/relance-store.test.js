// Tests du store de relance (file d'attente, quota journalier, dédup).
// Le store résout ses chemins via process.cwd() AU MOMENT DU REQUIRE : on
// bascule dans un répertoire temporaire AVANT de le charger pour ne jamais
// toucher aux vraies données de data/relance/.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ORIGINAL_CWD = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'relance-test-'));

let store;

before(() => {
  process.chdir(TMP);
  store = require('../lib/relance-store.js');
});

after(() => {
  process.chdir(ORIGINAL_CWD);
  fs.rmSync(TMP, { recursive: true, force: true });
});

beforeEach(() => {
  // Repart d'un état vierge entre chaque test
  fs.rmSync(path.join(TMP, 'data'), { recursive: true, force: true });
});

const P1 = { profileUrl: 'https://www.linkedin.com/in/jean-dupont', name: 'Jean Dupont', firstName: 'Jean' };
const P2 = { profileUrl: 'https://www.linkedin.com/in/marie-curie', name: 'Marie Curie', firstName: 'Marie' };

test('enqueue ajoute à la file, dédoublonne par URL normalisée', () => {
  assert.strictEqual(store.enqueue(P1).ok, true);
  // Même profil avec une URL "sale" (query, slash final, majuscules) → refusé
  const dup = store.enqueue({ ...P1, profileUrl: 'https://www.linkedin.com/in/Jean-Dupont/?utm=x' });
  assert.strictEqual(dup.ok, false);
  assert.strictEqual(store.getQueue().length, 1);
});

test('dequeue retire par URL normalisée', () => {
  store.enqueue(P1);
  store.enqueue(P2);
  store.dequeue('https://www.linkedin.com/in/JEAN-DUPONT/');
  const queue = store.getQueue();
  assert.strictEqual(queue.length, 1);
  assert.strictEqual(queue[0].name, 'Marie Curie');
});

test('recordSend(sent) compte dans le quota du jour et sort de la file', () => {
  store.enqueue(P1);
  store.recordSend({ profileUrl: P1.profileUrl, name: P1.name, status: 'sent' });
  assert.strictEqual(store.countSentToday(), 1);
  assert.strictEqual(store.getQueue().length, 0);
  assert.strictEqual(store.hasBeenRelanced(P1.profileUrl), true);
});

test('recordSend(replied) sort de la file SANS consommer de quota', () => {
  store.enqueue(P1);
  store.recordSend({ profileUrl: P1.profileUrl, name: P1.name, status: 'replied' });
  assert.strictEqual(store.countSentToday(), 0);
  assert.strictEqual(store.getQueue().length, 0);
  // ...mais bloque quand même toute nouvelle relance
  assert.strictEqual(store.hasBeenRelanced(P1.profileUrl), true);
  assert.strictEqual(store.enqueue(P1).ok, false);
});

test('recordSend(failed) ne bloque pas un nouvel essai', () => {
  store.recordSend({ profileUrl: P1.profileUrl, name: P1.name, status: 'failed' });
  assert.strictEqual(store.countSentToday(), 0);
  assert.strictEqual(store.hasBeenRelanced(P1.profileUrl), false);
  assert.strictEqual(store.enqueue(P1).ok, true);
});

test('canSendNow respecte le quota journalier', () => {
  store.saveSettings({ dailyTarget: 2 });
  assert.strictEqual(store.canSendNow().allowed, true);
  store.recordSend({ profileUrl: P1.profileUrl, name: P1.name, status: 'sent' });
  store.recordSend({ profileUrl: P2.profileUrl, name: P2.name, status: 'sent' });
  const q = store.canSendNow();
  assert.strictEqual(q.allowed, false);
  assert.strictEqual(q.sent, 2);
});

test('les envois des jours précédents ne comptent pas dans le quota du jour', () => {
  store.recordSend({ profileUrl: P1.profileUrl, name: P1.name, status: 'sent' });
  // Antidate l'envoi à hier directement dans le fichier de log
  const log = store.getLog();
  log[0].sentAt = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  fs.writeFileSync(store._files.LOG_FILE, JSON.stringify(log));
  assert.strictEqual(store.countSentToday(), 0);
  // ...mais le profil reste marqué comme relancé (dédup à vie)
  assert.strictEqual(store.hasBeenRelanced(P1.profileUrl), true);
});

test('dailyTarget est borné à 15 (hard max anti-restriction)', () => {
  const s = store.saveSettings({ dailyTarget: 50 });
  assert.strictEqual(s.dailyTarget, 15);
  const s2 = store.saveSettings({ dailyTarget: 0 });
  assert.strictEqual(s2.dailyTarget, 1);
});

test('le template par défaut contient {first_name} et est substituable', () => {
  const { template } = store.getSettings();
  assert.ok(template.includes('{first_name}'));
  const msg = template.replace(/\{first_name\}/g, 'Jean');
  assert.ok(msg.startsWith('Bonjour Jean'));
});

test('buildMessage avec sujet utilise la variante « document sur {sujet} »', () => {
  const msg = store.buildMessage('Franck', "l'IA dans la gestion de patrimoine");
  assert.ok(msg.startsWith('Bonjour Franck'));
  assert.ok(msg.includes("le document sur l'IA dans la gestion de patrimoine ?"));
  assert.ok(msg.includes('ce serait avec plaisir'));
});

test('buildMessage sans sujet retombe sur la variante générique', () => {
  for (const sujet of ['', null, undefined, '   ']) {
    const msg = store.buildMessage('Franck', sujet);
    assert.ok(msg.includes('le document que je vous ai envoyé ?'), `sujet=${JSON.stringify(sujet)}`);
    assert.ok(!msg.includes('{sujet}'));
  }
});

test('buildMessage nettoie le sujet (espaces, ponctuation terminale)', () => {
  const msg = store.buildMessage('Franck', '  les agents IA pour CGP.  ');
  assert.ok(msg.includes('le document sur les agents IA pour CGP ?'));
});

test('getStatus expose relancedUrls / failedUrls cohérents', () => {
  store.recordSend({ profileUrl: P1.profileUrl, name: P1.name, status: 'sent' });
  store.recordSend({ profileUrl: P2.profileUrl, name: P2.name, status: 'failed' });
  const st = store.getStatus();
  assert.strictEqual(st.relancedUrls[store.normalizeUrl(P1.profileUrl)], 'sent');
  assert.strictEqual(st.failedUrls[store.normalizeUrl(P2.profileUrl)], true);
  assert.strictEqual(st.sentToday, 1);
});
