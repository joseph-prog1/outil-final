// Envoi d'un DM LinkedIn à un profil — port Node de la logique éprouvée de
// linkedin-comment-to-dm-bot/core/bot.py (_send_dm), avec les mêmes garde-fous :
//
//  - GARDE-FOU DESTINATAIRE : ne JAMAIS cliquer un bouton « Message <autre
//    personne> » (bulle de messagerie persistante, colonne « Autres profils
//    pour vous »…). Bug réel observé dans l'ancien outil : DM parti chez la
//    mauvaise personne.
//  - « A déjà répondu » : un message ENTRANT dans la conversation → relance
//    annulée (code 'replied'). Une conversation VIDE n'empêche PAS l'envoi
//    (première prise de contact depuis ce compte).
//  - Double-check du prénom dans le message AVANT toute frappe.
//  - Frappe humaine lettre à lettre, confirmation d'envoi via le thread.
//
// Codes retour : 'sent' | 'replied' | 'failed'
// (en dry-run : 'dry_run_ok' à la place de 'sent' — tout le flux sauf frappe+envoi)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);

// Frappe humaine : caractère par caractère avec délais variables et pauses
// « réfléchies » sur la ponctuation (version simplifiée du kit anti-ban).
async function humanType(page, text) {
  for (const char of text) {
    await page.keyboard.type(char, { delay: 0 });
    let delay = rand(40, 140);
    if ('.!?\n'.includes(char)) delay += rand(200, 600);
    else if (',;:'.includes(char)) delay += rand(100, 300);
    if (Math.random() < 0.04) delay += rand(400, 1200); // pause "réflexion"
    await sleep(delay);
  }
}

function accentStrip(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function nameTokens(name) {
  return (name || '')
    .split(/[\s\-]+/)
    .map((t) => accentStrip(t).replace(/[^a-z]/g, ''))
    .filter((t) => t.length >= 3);
}

/**
 * Envoie `message` à la personne `recipientName` via son profil `profileUrl`.
 * `context` : BrowserContext Playwright déjà connecté (storageState LinkedIn).
 * `opts.dryRun` : tout le flux (navigation, garde-fous, box) sans frapper ni envoyer.
 * `opts.log` : fonction de log (défaut console.error).
 */
export async function sendDm(context, profileUrl, message, recipientName, opts = {}) {
  const log = opts.log || ((...a) => console.error('[DM]', ...a));
  const dryRun = !!opts.dryRun;
  const page = await context.newPage();

  try {
    log(`📤 DM → ${recipientName} | ${profileUrl}${dryRun ? ' (DRY RUN)' : ''}`);

    // ── Navigation vers le profil (slug percent-encodé pour les accents) ────
    let navUrl = profileUrl;
    if (profileUrl.includes('/in/')) {
      const [base, slug] = profileUrl.split(/\/in\/(.+)/);
      navUrl = base + '/in/' + encodeURIComponent(decodeURIComponent(slug)).replace(/%2F/g, '/');
    }
    await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(4000);

    const currentUrl = page.url();
    if (/checkpoint|login|authwall/.test(currentUrl)) {
      log(`🚫 Redirect détecté — CAPTCHA ou session expirée : ${currentUrl}`);
      return 'failed';
    }
    // On DOIT être sur une page profil : ailleurs, le seul bouton « Message »
    // serait celui de la messagerie persistante (= une AUTRE personne).
    if (!currentUrl.includes('/in/')) {
      log(`🛑 Profil non chargé (URL=${currentUrl}) — abandon`);
      return 'failed';
    }

    // Supprime les bulles de messagerie résiduelles + remonte en haut.
    const killOverlays = () => page.evaluate(() => {
      ['.msg-overlay-conversation-bubble', '.msg-overlay-list-bubble', '[class*="msg-overlay"]']
        .forEach((sel) => document.querySelectorAll(sel).forEach((el) => el.remove()));
      window.scrollTo(0, 0);
    }).catch(() => {});
    await killOverlays();
    await sleep(6000); // LinkedIn a besoin de temps pour se stabiliser

    const rcptTokens = nameTokens(recipientName);

    // ── Clic sur le bouton « Message » avec garde-fou destinataire ──────────
    // 1) bouton nommant la cible ; 2) bouton générique ; 3) REFUS d'un bouton tiers.
    const btnJs = (tokens) => {
      const strip = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const nameFromLabel = (lbl) => {
        const l = strip(lbl).trim();
        return l.startsWith('message ') ? l.slice(8).trim() : '';
      };
      const matchTarget = (el) => {
        const nm = nameFromLabel(el.getAttribute('aria-label') || '') || nameFromLabel(el.textContent || '');
        if (!nm) return null; // générique
        return tokens.some((tok) => nm.includes(tok));
      };
      const inExcludedZone = (el) =>
        el.closest('.msg-overlay-conversation-bubble') || el.closest('.msg-overlay-list-bubble') ||
        el.closest('[class*="msg-overlay"]') || el.closest('[class*="typeahead"]') ||
        el.closest('.scaffold-layout__aside') || el.closest('aside') ||
        el.closest('[class*="browsemap"]') || el.closest('[class*="pymk"]') ||
        el.closest('[class*="people-also"]') || el.closest('[class*="similar"]') ||
        el.closest('[class*="aside"]');
      const isMsg = (el) => {
        const t = strip(el.textContent || '').trim();
        const aria = strip(el.getAttribute('aria-label') || '');
        const looks = t === 'message' || t.startsWith('message ') || aria === 'message' || aria.startsWith('message ');
        return looks && !inExcludedZone(el) && !el.disabled;
      };
      const all = Array.from(document.querySelectorAll('button, a[href]'))
        .filter(isMsg)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      let btn = all.find((b) => matchTarget(b) === true);
      if (!btn) btn = all.find((b) => matchTarget(b) === null);
      if (!btn) {
        const foreign = all.find((b) => matchTarget(b) === false);
        return {
          label: null,
          reason: foreign ? 'foreign_only' : 'not_found',
          foreign: foreign ? (foreign.getAttribute('aria-label') || foreign.textContent.trim()).slice(0, 40) : null,
        };
      }
      btn.scrollIntoView({ behavior: 'instant', block: 'center' });
      btn.click();
      return { label: (btn.getAttribute('aria-label') || btn.textContent.trim()).slice(0, 40), reason: 'ok' };
    };

    let clickRes = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      clickRes = await page.evaluate(btnJs, rcptTokens).catch(() => null);
      if (clickRes && clickRes.label) break;
      await killOverlays();
      await sleep(2000);
    }

    if (!clickRes || !clickRes.label) {
      if (clickRes && clickRes.reason === 'foreign_only') {
        log(`🛑 GARDE-FOU : seul un bouton « ${clickRes.foreign} » (autre personne) trouvé — abandon, AUCUN message envoyé`);
      } else {
        log(`❌ Bouton Message introuvable (profil hors réseau ou page non chargée)`);
      }
      return 'failed';
    }
    log(`✅ Bouton Message cliqué : « ${clickRes.label} »`);

    // Garde-fou redondant : le label du bouton cliqué, s'il nomme quelqu'un,
    // DOIT recouper la cible.
    const clbl = accentStrip(clickRes.label);
    if (clbl.startsWith('message ') && rcptTokens.length) {
      const named = clbl.slice(8).trim();
      if (named && !rcptTokens.some((tok) => named.includes(tok))) {
        log(`🛑 GARDE-FOU : bouton « ${clickRes.label} » ≠ cible « ${recipientName} » — abandon`);
        return 'failed';
      }
    }

    // ── Mauvais dialog « New message » (champ destinataire vide) ? ──────────
    await sleep(1500);
    const wrongDialog = await page.evaluate(() => !!document.querySelector(
      'input[placeholder*="name"], input[placeholder*="nom"], .msg-connections-typeahead__search-input'
    )).catch(() => false);
    if (wrongDialog) {
      log(`⚠️ Dialog « New message » sans destinataire — abandon`);
      await page.keyboard.press('Escape').catch(() => {});
      return 'failed';
    }

    // ── Attente de la zone de saisie (bulle flottante ou compositeur) ───────
    let box = null;
    for (let attempt = 0; attempt < 30 && !box; attempt++) {
      for (const sel of [
        '.msg-overlay-conversation-bubble [contenteditable="true"]',
        '.msg-form__contenteditable[contenteditable="true"]',
        'div.msg-form [contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]',
      ]) {
        const loc = page.locator(sel);
        if (await loc.count().catch(() => 0)) { box = loc.last(); break; }
      }
      if (!box) await sleep(800);
    }
    if (!box) {
      log(`❌ Zone de saisie introuvable`);
      return 'failed';
    }

    // ── La personne a-t-elle déjà RÉPONDU ? (annule la relance) ─────────────
    // Un message entrant ("--other") → 'replied'. Conversation vide → on envoie.
    let convo = { total: 0, incoming: 0 };
    for (let attempt = 0; attempt < 8; attempt++) {
      await page.evaluate(() => {
        ['.msg-s-message-list-content', '.msg-s-message-list', '[class*="message-list"]',
         '[class*="msg-overlay"] [class*="scrollable"]', '.msg-s-message-list__event-list']
          .forEach((s) => document.querySelectorAll(s).forEach((el) => { el.scrollTop = 0; }));
      }).catch(() => {});
      await sleep(1000);
      convo = await page.evaluate(() => {
        const roots = document.querySelectorAll(
          '.msg-overlay-conversation-bubble, [class*="msg-overlay-conversation"], ' +
          '.msg-s-message-list, .msg-s-message-list-content, .msg-s-message-list__event-list'
        );
        let total = 0, incoming = 0;
        const seen = new Set();
        for (const root of roots) {
          root.querySelectorAll('[class*="msg-s-event-listitem"]').forEach((it) => {
            if (seen.has(it)) return;
            seen.add(it);
            const body = it.querySelector('.msg-s-event-listitem__body, [class*="event-listitem__body"], p');
            if (!body || !(body.innerText || '').trim()) return;
            total++;
            const cls = String(it.className || '');
            if (cls.includes('--other') || it.querySelector('[class*="--other"]')) incoming++;
          });
        }
        return { total, incoming };
      }).catch(() => ({ total: 0, incoming: 0 }));
      if (convo.incoming > 0) break;
      if (attempt >= 5) break; // historique chargé ou conversation neuve : on tranche
    }
    if (convo.incoming > 0) {
      log(`🙅 ${recipientName} a déjà répondu (${convo.incoming} message(s) entrant(s)) — relance annulée`);
      return 'replied';
    }
    // Aucun historique = première prise de contact depuis ce compte : on envoie
    // quand même (demande explicite) — seul un message ENTRANT annule l'envoi.
    if (convo.total === 0) log(`✉️  Nouvelle conversation (aucun historique) → envoi`);
    else log(`✓ Pas de réponse (${convo.total} msg, 0 entrant) → envoi autorisé`);

    // ── Garde-fou destinataire sur l'en-tête du dialog ──────────────────────
    if (rcptTokens.length) {
      const headerName = await page.evaluate(() => {
        const sels = [
          '.msg-overlay-bubble-header__title', '.msg-overlay-conversation-bubble__participant-names',
          '[class*="overlay-bubble-header"] [class*="title"]', '.msg-compose__profile-link',
          '.msg-connections-typeahead__pill', '.artdeco-pill__text',
          '.msg-thread__link-to-profile', '.msg-entity-lockup__entity-title',
        ];
        for (const s of sels) {
          const el = document.querySelector(s);
          if (el && el.innerText && el.innerText.trim()) return el.innerText.trim();
        }
        return '';
      }).catch(() => '');
      const hl = accentStrip(headerName);
      if (headerName && !rcptTokens.some((tok) => hl.includes(tok))) {
        log(`🛑 GARDE-FOU : dialog adressé à « ${headerName} » ≠ cible « ${recipientName} » — abandon`);
        return 'failed';
      }
      if (headerName) log(`✓ Destinataire confirmé : « ${headerName} »`);
    }

    // ── Double-check du prénom dans le message AVANT toute frappe ───────────
    const normName = (s) => accentStrip(s).replace(/[^a-z]/g, '');
    const firstWord = (recipientName || '').split(/\s+/)[0] || '';
    const expectedFirst = normName(firstWord);
    const greetMatch = message.match(/bonjour\s+([^\s,!.\n]+)/i);
    const greeted = greetMatch ? normName(greetMatch[1]) : '';
    if (expectedFirst && greeted && greeted !== expectedFirst) {
      log(`🛑 DOUBLE-CHECK PRÉNOM : « ${greeted} » ≠ « ${recipientName} » — ABANDON`);
      return 'failed';
    }

    if (dryRun) {
      log(`🏁 DRY RUN OK — tout le flux validé jusqu'à la box (rien tapé, rien envoyé)`);
      return 'dry_run_ok';
    }

    // ── Frappe humaine du message ───────────────────────────────────────────
    await box.click({ force: true }).catch(() => {});
    await box.focus().catch(() => {});
    await sleep(500);
    await humanType(page, message);

    const content = await box.evaluate((el) => el.textContent || el.innerText || '').catch(() => '');
    if (!content.trim()) {
      log(`❌ Texte non capté dans la zone de saisie — abandon`);
      return 'failed';
    }
    await sleep(1500);

    // ── Clic sur Envoyer ────────────────────────────────────────────────────
    const sent = await page.evaluate(() => {
      const isSend = (b) => {
        const lbl = (b.getAttribute('aria-label') || '').toLowerCase();
        const txt = (b.textContent || '').trim().toLowerCase();
        return (lbl.includes('send') || lbl.includes('envo') || txt === 'send' || txt === 'envoyer') && !b.disabled;
      };
      const bubbles = document.querySelectorAll('.msg-overlay-conversation-bubble');
      const last = bubbles[bubbles.length - 1];
      if (last) {
        const btn = Array.from(last.querySelectorAll('button')).find(isSend);
        if (btn) { btn.click(); return 'bulle'; }
      }
      const form = document.querySelector('.msg-form, [class*="compose"]');
      if (form) {
        const btn = Array.from(form.querySelectorAll('button')).find(isSend);
        if (btn) { btn.click(); return 'form'; }
      }
      const all = Array.from(document.querySelectorAll('button')).filter(isSend);
      if (all.length) { all[all.length - 1].click(); return 'global'; }
      return null;
    }).catch(() => null);

    if (sent) {
      log(`✅ Send cliqué (${sent})`);
    } else {
      log(`⚠️ Bouton Send introuvable — fallback Meta+Enter`);
      await box.focus().catch(() => {});
      await page.keyboard.press('Meta+Enter').catch(() => {});
    }

    // ── Confirmation : le message apparaît dans le thread ───────────────────
    const flat = message.replace(/\s+/g, ' ').trim();
    const marker = (flat.length > 50 ? flat.slice(Math.floor(flat.length / 3), Math.floor(flat.length / 3) + 28) : flat)
      .replace(/\s+/g, '').toLowerCase();

    const threadHasMessage = () => page.evaluate((m) => {
      const flatten = (s) => (s || '').split(/\s+/).join('').toLowerCase();
      const roots = [];
      const bubbles = document.querySelectorAll('.msg-overlay-conversation-bubble');
      if (bubbles.length) roots.push(bubbles[bubbles.length - 1]);
      document.querySelectorAll('.msg-s-message-list-content, .msg-s-message-list, .msg-s-message-list__event-list')
        .forEach((e) => roots.push(e));
      return roots.some((root) => root && flatten(root.innerText).includes(m));
    }, marker).catch(() => false);

    const boxIsEmpty = async () => {
      try {
        const txt = await box.evaluate((el) => el.textContent || el.innerText || '');
        return !txt.trim();
      } catch {
        return true; // box détachée = LinkedIn a re-rendu après envoi
      }
    };

    await sleep(2000);
    for (let i = 0; i < 7; i++) {
      if (await threadHasMessage()) {
        log(`📨 DM envoyé et confirmé (thread) → ${recipientName}`);
        return 'sent';
      }
      await sleep(1000);
    }

    if (!(await boxIsEmpty())) {
      log(`⚠️ Textbox non vidée — retry Meta+Enter`);
      await box.focus().catch(() => {});
      await page.keyboard.press('Meta+Enter').catch(() => {});
      await sleep(2000);
      if (await threadHasMessage()) {
        log(`📨 DM envoyé et confirmé après retry → ${recipientName}`);
        return 'sent';
      }
    }
    if (await boxIsEmpty()) {
      log(`📨 DM envoyé → ${recipientName} (box vidée, thread non re-scanné)`);
      return 'sent';
    }

    log(`❌ DM non envoyé : textbox pleine, message absent du thread`);
    return 'failed';
  } catch (e) {
    log(`❌ Erreur sendDm: ${e.message}`);
    return 'failed';
  } finally {
    try { await page.close(); } catch {}
  }
}
