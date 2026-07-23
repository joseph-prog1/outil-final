import { chromium } from 'playwright';
import fs from 'fs';
import { createRequire } from 'module';

// Source unique pour l'analyse d'entreprise : mêmes fonctions que la lecture/UI.
const require = createRequire(import.meta.url);
const { parseCompany, namesMatch, parseCommentBlock } = require('./scraped-profiles.js');

// Bloc commentaire. LinkedIn sert DEUX variantes de DOM selon les sessions/jours :
//  - le nouveau rendu 2026 : classes obfusquées, seul le préfixe `componentkey` est stable ;
//  - le rendu classique (Voyager) : classes sémantiques `comments-comment-entity`.
// On matche les deux, sinon un compte servi en "classique" extrait 0 commentaire.
const COMMENT_BLOCK_SELECTOR = '[componentkey^="replaceableComment_"], .comments-comment-entity';

// Never let an unhandled rejection kill the process silently
process.on('unhandledRejection', (err) => {
  console.error('[SCRAPE] unhandledRejection:', err?.message || err);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Délai aléatoire entre les visites pour rester discret vis-à-vis de LinkedIn
const humanDelay = () => sleep(1500 + Math.floor(Math.random() * 2000));

// Convertit un effectif LinkedIn ("11-50 employés", "10 001+ employés") vers les tranches de l'app
function sizeBucket(lowerBound) {
  const n = lowerBound;
  if (n >= 5000) return '5000+';
  if (n >= 1000) return '1000-5000';
  if (n >= 500) return '500-1000';
  if (n >= 100) return '100-500';
  if (n >= 50) return '50-100';
  if (n >= 10) return '10-50';
  return '1-10';
}

// Un nom d'entreprise « réel » : ni vide, ni un texte d'interface LinkedIn
// (bandeau cookies/consentement, mur de connexion…). Si on tombe là-dessus,
// c'est qu'on n'est PAS sur la vraie page entreprise → on ne stocke rien.
const LINKEDIN_UI_JUNK = /linkedin respects|respecte votre vie|respecte votre confidentialité|votre vie privée|confidentialité|sign in|join now|s.identifier|se connecter|cookie|user agreement|privacy policy|conditions d.utilisation|page not found|cette page/i;
function isRealCompanyName(name) {
  const n = (name || '').trim();
  if (n.length < 2) return false;
  if (/^linkedin$/i.test(n)) return false;
  if (LINKEDIN_UI_JUNK.test(n)) return false;
  return true;
}

// Visite le profil de chaque prospect pour identifier son entreprise actuelle,
// puis la page d'accueil de l'entreprise pour lire le nombre d'employés.
// Les pages entreprise sont mises en cache : une seule visite par entreprise.
async function enrichProfiles(context, profiles) {
  const page = await context.newPage();
  const companyCache = new Map(); // url entreprise -> { name, companySize, companySizeRaw }

  // On enrichit TOUS les prospects (plus de plafond). C'est long, d'où le mode tâche de fond.
  const toVisit = profiles;

  for (let i = 0; i < toVisit.length; i++) {
    const p = toVisit[i];
    try {
      console.error(`[ENRICH] ${i + 1}/${toVisit.length} — ${p.name}`);
      await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
      await sleep(2500);

      // Entreprise annoncée dans le titre du commentateur (ex. "CEO Groupe Zebra").
      // C'est la référence : on cherche le lien d'expérience qui LUI correspond,
      // au lieu de prendre aveuglément le premier (qui peut être un ancien poste).
      const headlineCompany = parseCompany(p.title || '');
      const wanted = headlineCompany && headlineCompany !== 'N/A' ? headlineCompany : '';

      const companyLink = await page.evaluate((wantedName) => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

        // --- Entreprise ACTUELLE affichée dans la TOP CARD du profil (le bloc à
        // droite du nom, ex. "Louvre Banque Privée"). C'est ce qu'un humain lit en
        // un coup d'œil, et c'est le poste actuel selon LinkedIn — la source la
        // plus fiable, souvent absente de la section #experience (lazy-load).
        function topCardCompany() {
          // a) libellé explicite "Current company: X" (bouton ou lien de la top card)
          const labeled = Array.from(document.querySelectorAll('[aria-label]'));
          for (const el of labeled) {
            const m = (el.getAttribute('aria-label') || '').match(/current company:\s*(.+?)(?:\.\s|\.$|$)/i);
            if (!m) continue;
            const name = clean(m[1]).slice(0, 80);
            if (!name) continue;
            const link = el.matches('a[href*="/company/"]')
              ? el
              : (el.closest('a[href*="/company/"]') || el.querySelector('a[href*="/company/"]'));
            const url = link ? link.href.split('?')[0].replace(/\/$/, '') : '';
            return { name, url: url.includes('/company/') ? url : '' };
          }
          // b) repli : lien /company/ dans le panneau droit de la top card
          const panel = document.querySelector(
            '.pv-text-details__right-panel, .pv-top-card--experience-list, section.pv-top-card'
          );
          const link = panel ? panel.querySelector('a[href*="/company/"]') : null;
          if (link) {
            const name = (
              clean(link.querySelector('span[aria-hidden="true"]')?.textContent) ||
              clean(link.textContent).split('·')[0].trim()
            ).slice(0, 80);
            if (name) return { name, url: link.href.split('?')[0].replace(/\/$/, '') };
          }
          return null;
        }
        const top = topCardCompany();
        const topNameLc = top && top.name ? top.name.toLowerCase() : '';

        const exp = document.querySelector('#experience')?.closest('section');
        const root = exp || document;
        const links = Array.from(root.querySelectorAll('a[href*="/company/"]'));
        const entries = links.map((link) => {
          // Le texte de l'entrée d'expérience contient les dates : on détecte le
          // poste ACTUEL ("... - Present / aujourd'hui / Présent").
          const li = link.closest('li') || link.parentElement;
          const ctx = clean(li ? li.textContent : '');
          const isCurrent = /\bpresent\b|présent|aujourd.hui|en poste|current/i.test(ctx);
          const name = (
            clean(link.querySelector('span[aria-hidden="true"]')?.textContent) ||
            clean(link.textContent).split('·')[0].trim()
          ).slice(0, 80);
          return { name, url: link.href.split('?')[0].replace(/\/$/, ''), isCurrent };
        }).filter((e) => e.url.includes('/company/'));

        // 1. Si le titre annonce une entreprise → le lien d'expérience qui la contient.
        if (wantedName) {
          const w = wantedName.toLowerCase();
          const hit = entries.find(
            (e) => e.name && (e.name.toLowerCase().includes(w) || w.includes(e.name.toLowerCase()))
          );
          if (hit) return { ...hit, matchedHeadline: true };
          // 2. …ou la top card si elle correspond au titre.
          if (top && top.url && topNameLc && (topNameLc.includes(w) || w.includes(topNameLc))) {
            return { ...top, isCurrent: true, matchedHeadline: true };
          }
        }
        // 3. Pas d'entreprise dans le titre → l'entreprise actuelle de la top card.
        if (!wantedName && top && top.url) {
          return { ...top, isCurrent: true, matchedHeadline: false };
        }
        // 4. Sinon → l'expérience ACTUELLE (marquée "Present") de la section #experience.
        const current = entries.find((e) => e.isCurrent);
        if (current) return { ...current, matchedHeadline: false };
        // 5. Sinon, s'il n'y a qu'une seule expérience → c'est elle.
        if (entries.length === 1) return { ...entries[0], matchedHeadline: false };
        // 6. Top card sans lien cliquable (nom seul) → on remplit au moins le NOM.
        if (!wantedName && top && top.name) {
          return { name: top.name, url: '', isCurrent: true, matchedHeadline: false };
        }
        // 7. Ambigu (plusieurs postes passés, aucun actuel, rien dans le titre) :
        //    on N'INVENTE PAS d'entreprise. Mieux vaut "Non précisé".
        return null;
      }, wanted).catch(() => null);

      // Top card sans lien : on ne peut pas visiter la page entreprise (donc pas
      // d'effectif), mais on garde le NOM plutôt que de perdre l'info.
      if (companyLink && companyLink.name && !companyLink.url) {
        const nameOnly = isRealCompanyName(companyLink.name) ? companyLink.name : '';
        if (nameOnly && (!wanted || namesMatch(wanted, nameOnly))) {
          p.company = wanted || nameOnly;
          console.error(`[ENRICH]   ✓ ${p.company} — effectif inconnu (nom seul, top card)`);
        } else {
          console.error(`[ENRICH]   pas d'entreprise fiable détectée`);
        }
        await humanDelay();
        continue;
      }

      if (!companyLink || !companyLink.url) {
        console.error(`[ENRICH]   pas d'entreprise détectée`);
        await humanDelay();
        continue;
      }

      let pageData = companyCache.get(companyLink.url);
      if (!pageData) {
        await humanDelay();
        await page.goto(companyLink.url + '/', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
        await sleep(2500);

        pageData = await page.evaluate(() => {
          const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
          const name = clean(document.querySelector('h1')?.textContent);

          // Effectif lu UNIQUEMENT dans le bloc resume du haut (top card),
          // pour ne pas attraper les entreprises de la barre laterale
          // ("Pages people also viewed") qui affichent aussi "... employees".
          const scopes = [
            '.org-top-card-summary-info-list',
            '.org-top-card-summary__info-list',
            '.org-top-card__primary-content',
            '.org-top-card',
          ];
          let text = '';
          for (const sel of scopes) {
            const el = document.querySelector(sel);
            if (el && clean(el.innerText)) { text = el.innerText; break; }
          }
          if (!text) {
            const main = document.querySelector('main');
            text = main ? main.innerText : '';
          }

          const m = text.match(/([\d][\d\s .,]*)\s*(?:[-–]\s*([\d][\d\s .,]*))?\s*\+?\s*(?:employés|employees)/i);
          if (!m) return { name, lower: null, raw: null };
          const toInt = (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10);
          return { name, lower: toInt(m[1]), raw: clean(m[0]) };
        }).catch(() => ({ name: '', lower: null, raw: null }));

        companyCache.set(companyLink.url, pageData);
      }

      // VERIFICATION (le fallback demande) : le NOM du titre fait foi ; on ne garde
      // l'EFFECTIF que si la page visitee correspond bien a cette entreprise, sinon
      // on a visite la mauvaise boite (ancien poste, mauvais lien) -> effectif ignore.
      const linkName = isRealCompanyName(companyLink.name) ? companyLink.name : '';
      const pageName = isRealCompanyName(pageData.name) ? pageData.name : '';

      let finalName, sizeTrusted;
      if (wanted) {
        finalName = wanted;
        sizeTrusted =
          companyLink.matchedHeadline ||
          (pageName && namesMatch(wanted, pageName)) ||
          (linkName && namesMatch(wanted, linkName));
      } else {
        finalName = linkName || pageName;
        sizeTrusted = !!finalName;
      }

      const companyInfo = {
        name: finalName || null,
        companySize: sizeTrusted && pageData.lower ? sizeBucket(pageData.lower) : null,
        companySizeRaw: sizeTrusted ? pageData.raw : null,
      };

      if (companyInfo.name) p.company = companyInfo.name;
      if (companyInfo.companySize) {
        p.companySize = companyInfo.companySize;
        p.companySizeRaw = companyInfo.companySizeRaw;
      }
      if (!companyInfo.name) {
        console.error(`[ENRICH]   ⚠ page entreprise non fiable (consentement/login) — ignorée`);
      } else {
        console.error(`[ENRICH]   ✓ ${p.company} — ${companyInfo.companySizeRaw || 'effectif inconnu'}`);
      }
    } catch (e) {
      console.error(`[ENRICH]   erreur: ${e.message}`);
    }
    await humanDelay();
  }

  try { await page.close(); } catch (e) {}
}

async function scrapeComments(postUrl, cookieFile) {
  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    let storageState;
    if (cookieFile && fs.existsSync(cookieFile)) {
      const parsed = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
      // Accept both shapes: raw { cookies, origins } or wrapped { storageState: {...} }
      storageState = parsed.storageState ? parsed.storageState : parsed;
    }

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    console.error(`[SCRAPE] Loading post...`);
    await page.goto(postUrl, { waitUntil: 'load', timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(2000);

    // Charge TOUS les commentaires. La liste LinkedIn est une "lazy column" :
    // un simple window.scrollBy ne déclenche PAS le chargement des pages suivantes
    // (on tombe sur le pied de page sans jamais réveiller la liste). Il faut amener
    // le DERNIER commentaire rendu dans le viewport pour que LinkedIn charge la suite.
    // Sans ça, on ne récupère qu'une poignée de commentaires "les plus pertinents".
    console.error('[SCRAPE] Loading all comments...');
    let lastCount = 0;
    let stableRounds = 0;
    // Plafond haut : un gros post peut avoir des centaines de commentaires, chaque
    // itération n'en charge qu'une page. On s'arrête tôt dès que le total se stabilise.
    for (let i = 0; i < 300; i++) {
      await page.evaluate((sel) => {
        // DOM classique : la pagination passe par un bouton « Afficher plus de
        // commentaires » — le scroll seul ne charge JAMAIS la suite.
        const btn = Array.from(document.querySelectorAll('button')).find((b) =>
          /afficher plus de commentaires|voir plus de commentaires|load more comments|show more comments/i
            .test(b.innerText || ''));
        if (btn) btn.click();
        const els = document.querySelectorAll(sel);
        if (els.length) els[els.length - 1].scrollIntoView({ block: 'center' });
        else window.scrollBy(0, 1200);
      }, COMMENT_BLOCK_SELECTOR).catch(() => {});
      await page.waitForTimeout(900);

      const count = await page.locator(COMMENT_BLOCK_SELECTOR).count().catch(() => 0);
      if (count > 0 && count === lastCount) {
        stableRounds++;
        if (stableRounds >= 8) break;
      } else {
        stableRounds = 0;
      }
      if (count !== lastCount) {
        console.error(`[SCRAPE]   ...${count} comments loaded`);
        lastCount = count;
      }
    }

    console.error(`[SCRAPE] Done loading (${lastCount} comments). Extracting...`);

    // Extraction BRUTE dans le navigateur : on ne fait que remonter du texte et des
    // attributs stables (componentkey, alt d'avatar, href /in/). Tout le parsing
    // fragile (nom/titre/date) est fait ensuite en Node via parseCommentBlock(),
    // pour rester testable et survivre aux changements de classes CSS de LinkedIn.
    const extracted = await page.evaluate((blockSelector) => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

      // Sujet du post : le commentaire du post lui-même (componentkey stable),
      // avec repli sur les anciennes classes au cas où.
      let postText = '';
      const postEl =
        document.querySelector('[componentkey^="translatable-commentary"]') ||
        document.querySelector('.feed-shared-update-v2__description') ||
        document.querySelector('.update-components-text');
      if (postEl) postText = clean(postEl.innerText);

      const out = [];
      const blocks = Array.from(document.querySelectorAll(blockSelector));
      for (const b of blocks) {
        const link = b.querySelector('a[href*="/in/"]');
        if (!link) continue;
        const img = b.querySelector('img[alt]');
        const commentary = b.querySelector('[componentkey^="comment-commentary"]');
        const photo = img ? (img.getAttribute('src') || img.getAttribute('data-delayed-url') || '') : '';

        // DOM classique (Voyager) : nom/titre/corps portés par des classes sémantiques.
        // querySelector (premier match) = les métadonnées du commentateur LUI-MÊME,
        // les réponses imbriquées venant APRÈS dans le DOM (elles sont d'ailleurs
        // re-parcourues comme blocs à part entière par querySelectorAll).
        const nameEl = b.querySelector('.comments-comment-meta__description-title');
        const subEl = b.querySelector('.comments-comment-meta__description-subtitle');
        const mainEl = b.querySelector('.comments-comment-item__main-content');
        const metaEl = b.querySelector('.comments-comment-meta__container');
        const direct = nameEl
          ? { name: clean(nameEl.textContent), title: subEl ? clean(subEl.textContent) : '' }
          : null;

        out.push({
          href: link.getAttribute('href') || '',
          imgAlt: img ? (img.getAttribute('alt') || '') : '',
          photo: photo && photo.startsWith('http') ? photo : '',
          // En classique, on scope les lignes au bloc meta (nom/titre/date) pour ne
          // pas polluer la détection de date avec le texte des réponses imbriquées.
          shellLines: ((direct && metaEl ? metaEl.innerText : b.innerText) || '')
            .split('\n').map(clean).filter(Boolean),
          commentary: commentary
            ? clean(commentary.innerText).slice(0, 280)
            : (direct && mainEl ? clean(mainEl.innerText).slice(0, 280) : ''),
          direct,
        });
      }
      return { postText: postText.slice(0, 240), blocks: out };
    }, COMMENT_BLOCK_SELECTOR);

    // Parsing en Node (fonction pure testée) : chaque bloc brut -> {name,title,date,comment}
    // Les champs `direct` (DOM classique, classes sémantiques) priment sur le parsing
    // heuristique des lignes, qui reste le repli pour le nouveau DOM obfusqué.
    extracted.comments = (extracted.blocks || []).map((b) => {
      const parsed = parseCommentBlock(b);
      if (b.direct) {
        if (b.direct.name) parsed.name = b.direct.name;
        if (b.direct.title) parsed.title = b.direct.title;
      }
      return { ...parsed, href: b.href, photo: b.photo };
    });

    const postContext = extracted.postText || 'N/A';
    const raw = extracted.comments;
    console.error(`[SCRAPE] Found ${raw.length} comment blocks`);

    const results = [];
    const seenUrls = new Set();

    for (const c of raw) {
      // Normalize URL
      let url = c.href.split('?')[0].split('#')[0];
      url = url.replace(/https?:\/\/[a-z]{2}\.linkedin\.com/, 'https://www.linkedin.com');
      if (url.startsWith('/')) url = 'https://www.linkedin.com' + url;
      if (!url.includes('/in/')) continue;

      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      const name = (c.name || '').replace(/\s*Auteur\s*$/, '').trim();

      // Skip invalid / self / author (author excluded by name + url below)
      if (!name || name.length < 2) continue;
      if (/joseph|betolaud|thomas higadere/i.test(name)) continue;
      if (/thomas-higadere|joseph-betolaud/i.test(url)) continue;

      results.push({
        name,
        title: (c.title || 'N/A').slice(0, 200),
        company: 'N/A',
        url,
        photoUrl: c.photo || '',        // avatar LinkedIn (URL signée, expire au bout d'un moment)
        commentText: c.comment || '',
        commentDate: c.date || '',      // date relative affichée par LinkedIn (ex: "1 sem")
        postContext,                    // sujet du post où la personne a commenté
        timestamp: new Date().toISOString(),
      });
      console.error(`[SCRAPE] ✓ ${results.length}: ${name} — ${(c.date || '?')} — "${(c.comment || '').slice(0, 30)}"`);
    }

    // Enrichissement systématique : visite de chaque profil + page entreprise
    if (results.length > 0) {
      console.error(`[ENRICH] Enrichissement de ${results.length} profils...`);
      await enrichProfiles(context, results);
    }

    try { await context.close(); } catch (e) {}

    return { success: true, profiles: results, count: results.length };

  } catch (error) {
    console.error('[SCRAPE] Fatal:', error.message);
    return { success: false, error: error.message, profiles: [] };
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
  }
}

// Mode tâche de fond : le scraper écrit lui-même son résultat + son statut de job,
// puisqu'il tourne détaché du serveur Next (le POST n'attend pas la fin).
//   node run-scraper.mjs <postUrl> <cookieFile> <resultFile> <jobFile>
const [postUrl, cookieFile, resultFile, jobFile] = process.argv.slice(2);

function writeJob(obj) {
  if (!jobFile) return;
  try {
    const prev = fs.existsSync(jobFile) ? JSON.parse(fs.readFileSync(jobFile, 'utf8')) : {};
    fs.writeFileSync(jobFile, JSON.stringify({ ...prev, ...obj, updatedAt: new Date().toISOString() }, null, 2));
  } catch (e) { /* best effort */ }
}

if (!postUrl || !cookieFile) {
  writeJob({ status: 'error', error: 'Missing arguments' });
  process.exit(1);
}

writeJob({ status: 'running' });

const result = await scrapeComments(postUrl, cookieFile);

// Sauvegarde du résultat (lu ensuite par le dashboard via data/scrape-results)
if (resultFile) {
  try {
    fs.writeFileSync(resultFile, JSON.stringify({
      postUrl,
      timestamp: new Date().toISOString(),
      ...result,
    }, null, 2));
  } catch (e) {
    console.error('[SCRAPE] Erreur écriture résultat:', e.message);
  }
}

// Nettoyage des cookies temporaires
try { if (cookieFile && fs.existsSync(cookieFile)) fs.unlinkSync(cookieFile); } catch (e) {}

writeJob(
  result.success
    ? { status: 'done', count: result.count || 0, resultFile: resultFile || null }
    : { status: 'error', error: result.error || 'Scraping failed' }
);

process.exit(result.success ? 0 : 1);
