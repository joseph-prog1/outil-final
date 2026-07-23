// Charge les profils réellement scrapés (data/scrape-results/*.json),
// les transforme au format attendu par le moteur de scoring + l'UI,
// puis les score. Aucune écriture, lecture seule.

const fs = require('fs');
const path = require('path');
const ScoringEngine = require('./scoring-engine.js');

const engine = new ScoringEngine();

function splitName(full) {
  const parts = (full || '').replace(/\s+/g, ' ').trim().split(' ');
  if (parts.length === 0 || parts[0] === '') return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function clean(s) {
  return (s || '').replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '').slice(0, 60);
}

// Devine la société à partir du titre LinkedIn ("Associée chez X", "CEO Mon Chasseur Immo"…)
function parseCompany(title) {
  if (!title) return 'N/A';
  const t = title.replace(/\s+/g, ' ').trim();
  let m;
  if ((m = t.match(/\bchez\s+([^|/,–\-]+)/i))) return clean(m[1]) || 'N/A';
  if ((m = t.match(/@\s*([^|/,–\-]+)/))) return clean(m[1]) || 'N/A';
  if ((m = t.match(/\bat\s+([^|/,–\-]+)/i))) return clean(m[1]) || 'N/A';
  if ((m = t.match(/\b(?:fondateur|founder|dirigeant|ceo|pdg|pr[ée]sident|g[ée]rant)\s+(?:de\s+|of\s+|associ[ée]\s+)?([A-ZÉÈÀ][^|/,–\-]{1,40})/i))) {
    return clean(m[1]) || 'N/A';
  }
  return 'N/A';
}

// Estime la taille d'entreprise si le titre mentionne un effectif ("60 consultants", "1350 clients"…)
// Sinon 'Non précisé' — on ne prétend pas connaître une donnée qu'on n'a pas.
function inferCompanySize(title) {
  if (!title) return 'Non précisé';
  const m = title.match(/(\d[\d\s.]*)\s*(consultants?|salari[ée]s?|employ[ée]s?|collaborateurs?|effectifs?)/i);
  if (m) {
    const n = parseInt(m[1].replace(/[^\d]/g, ''), 10);
    if (n >= 5000) return '5000+';
    if (n >= 1000) return '1000-5000';
    if (n >= 500) return '500-1000';
    if (n >= 100) return '100-500';
    if (n >= 50) return '50-100';
    if (n >= 10) return '10-50';
    return '1-10';
  }
  return 'Non précisé';
}

// Convertit une date relative LinkedIn en nb de jours. Gère le FR ("3 j", "1 sem",
// "2 mois", "5 h") ET l'anglais abrégé réellement renvoyé par LinkedIn ("1mo", "3w",
// "2d", "5h", "1yr"). Sert à retenir le commentaire le plus récent. Inconnu = très ancien.
// Alternation ordonnée du plus long au plus court pour lever les ambiguïtés
// ("mo" mois vs "m" minute, "mois" avant "mo").
function relativeToDays(rel) {
  if (!rel) return 99999;
  const m = String(rel).match(/(\d+)\s*(semaines?|months?|weeks?|years?|hours?|days?|jours?|mois|min|wk|mo|yr|ans?|sem|h|d|j|w|m|y)\b/i);
  if (!m) return 99999;
  const n = parseInt(m[1], 10);
  const u = m[2].toLowerCase();
  if (u === 'min' || u === 'm' || u === 'h' || u.startsWith('hour')) return 0;          // minutes/heures → aujourd'hui
  if (u === 'j' || u === 'd' || u.startsWith('jour') || u.startsWith('day')) return n;   // jours
  if (u === 'sem' || u === 'w' || u === 'wk' || u.startsWith('semaine') || u.startsWith('week')) return n * 7;
  if (u === 'mo' || u === 'mois') return n * 30;
  if (u === 'an' || u === 'ans' || u === 'y' || u === 'yr' || u.startsWith('year')) return n * 365;
  return 99999;
}

// Une ligne de texte est-elle une date relative LinkedIn ("3d", "1 sem", "2 mois", "5h") ?
// Ancrée (^…$) pour ne pas confondre avec un titre qui contiendrait un chiffre.
// LinkedIn suffixe parfois la date par un point médian et "Edited"/"Modifié" ; on tolère.
const RELATIVE_DATE_LINE = /^(?:(?:edited|modifi[ée])\s*·?\s*)?(\d+)\s*(min|mins|h|hr|hrs|d|j|w|wk|sem|mo|mois|yr|yrs|an|ans|hour|hours|day|days|week|weeks|month|months|year|years)\.?(?:\s*·?\s*(?:edited|modifi[ée]))?$/i;
function isRelativeDateLine(line) {
  return RELATIVE_DATE_LINE.test((line || '').trim());
}

// Nom du commentateur depuis l'alt de son avatar LinkedIn.
// LinkedIn rend "View <Nom>'s profile" (apostrophe droite ou courbe), et
// "View <Nom>' profile" quand le nom finit déjà par « s » (ex. "Inès Moussous").
function nameFromAvatarAlt(alt) {
  const m = (alt || '').trim().match(/^View\s+(.+?)['’]s?\s+profile$/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

// Parse un bloc de commentaire BRUT extrait du DOM (nouveau LinkedIn 2026) :
//   { imgAlt, href, photo, shellLines[], commentary }
// vers { name, title, date, comment }. Fonction pure : toute la logique fragile
// (choix de la ligne titre/date) est ici, hors du navigateur, donc testable.
// Structure observée des lignes d'un bloc :
//   [nom+badges, nom, "• 1er/1st", <titre?>, <date>, <corps du commentaire>, "N réactions"...]
function parseCommentBlock(block) {
  const lines = Array.isArray(block.shellLines) ? block.shellLines : [];
  const name = nameFromAvatarAlt(block.imgAlt) || (lines[1] || lines[0] || '').trim();

  const dateIdx = lines.findIndex(isRelativeDateLine);
  const date = dateIdx >= 0 ? lines[dateIdx].trim() : '';

  // Titre = ligne juste avant la date, si ce n'est ni le degré de relation
  // ("• 1st"), ni le nom, ni un badge ("Verified profile"/"Author").
  let title = '';
  if (dateIdx > 0) {
    const cand = (lines[dateIdx - 1] || '').trim();
    const isDegree = /^•/.test(cand);
    const isBadge = /^(verified profile|author|auteur|following|abonné)/i.test(cand);
    if (cand && !isDegree && isBadge === false && cand !== name) title = cand;
  }

  return { name, title, date, comment: (block.commentary || '').trim() };
}

// Normalise pour matcher les mots-clés (minuscule, sans accents)
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Nom d'entreprise « réel » : rejette les textes d'interface LinkedIn (bandeau
// consentement/cookies, mur de connexion) que l'enrichissement a pu capturer par erreur.
const LINKEDIN_UI_JUNK = /linkedin respects|respecte votre vie|respecte votre confidentialité|votre vie privée|confidentialité|sign in|join now|s.identifier|se connecter|cookie|user agreement|privacy policy|conditions d.utilisation|page not found|cette page/i;
function isRealCompanyName(name) {
  const n = (name || '').trim();
  if (n.length < 2) return false;
  if (/^linkedin$/i.test(n)) return false;
  if (LINKEDIN_UI_JUNK.test(n)) return false;
  return true;
}

// Deux noms d'entreprise désignent-ils la même boîte ? Comparaison tolérante :
// minuscules, sans accents, sans mots vides (groupe, sas, the…), puis chevauchement
// de mots significatifs ou inclusion. Sert à VÉRIFIER que l'entreprise enrichie
// (issue d'un clic sur le profil) correspond bien à celle écrite dans le titre.
const COMPANY_STOPWORDS = new Set([
  'groupe', 'group', 'grp', 'sas', 'sa', 'sarl', 'sasu', 'eurl', 'the', 'co', 'company',
  'cie', 'et', 'and', 'consulting', 'conseil', 'partners', 'partner', 'associes', 'associ',
]);
function companyTokens(name) {
  return normalize(name)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !COMPANY_STOPWORDS.has(w));
}
function namesMatch(a, b) {
  const ta = companyTokens(a);
  const tb = companyTokens(b);
  if (!ta.length || !tb.length) return false;
  // Inclusion de la chaîne normalisée (ex. "zebra" ⊂ "groupe zebra")
  const na = ta.join(' ');
  const nb = tb.join(' ');
  if (na.includes(nb) || nb.includes(na)) return true;
  // Sinon, au moins un mot significatif en commun
  return ta.some((w) => tb.includes(w));
}

// URL de profil canonique : sans query/hash, sans slash final, en minuscules.
// Sert de clé partout (agrégation, suppression) pour qu'un même profil re-scrapé
// avec une URL légèrement différente reste reconnu.
function normalizeProfileUrl(url) {
  return (url || '').split('?')[0].split('#')[0].trim().replace(/\/+$/, '').toLowerCase();
}

// Profils supprimés à la main depuis l'UI : map { <url normalisée>: true } dans
// data/hidden-profiles.json. Un profil supprimé est exclu de toutes les vues,
// même s'il est re-scrapé plus tard (l'exclusion est attachée à l'URL).
function readHiddenUrls() {
  try {
    const file = path.join(process.cwd(), 'data', 'hidden-profiles.json');
    if (!fs.existsSync(file)) return new Set();
    const map = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
    return new Set(Object.keys(map).map(normalizeProfileUrl));
  } catch {
    return new Set();
  }
}

// Ultra boss = effectif détecté >= 10. En dessous de 10 (ou inconnu), le dirigeant reste "boss".
function isBigCompany(companySize) {
  return ['10-50', '50-100', '100-500', '500-1000', '1000-5000', '5000+'].includes(companySize);
}

// Catégorisation selon les règles métier explicites (basées sur le titre) :
//  ultra_boss = dirigeant + entreprise de 10 employés ou plus,
//  boss = dirigeant avec moins de 10 employés (ou effectif inconnu) / Directeur/PDG/DG/Président associé/Fondateur,
//  cgp = métier du patrimoine,  out_of_scope = étudiant/reconversion/etc.
function classifyCategory(title, companySize) {
  const t = normalize(title);

  // Disqualifiants -> hors cadre
  if (/(etudiant|alternant|stagiaire|en reconversion|recherche d.?emploi|sans emploi|junior\b)/.test(t)) {
    return 'out_of_scope';
  }

  const isTopExec = /(president|pdg|p-dg|directeur general|direction generale|dirigeant|ceo|chief executive|co-?founder|cofondateur|founder|fondateur|fondatrice|owner|proprietaire|chairman|managing partner|managing director|gerant|associe gerant)/.test(t);
  const isDecision = /(directeur|directrice|director|\bdg\b|\bdaf\b|\bdrh\b|head of|responsable|associe|associee|partner|president associe)/.test(t);

  if (isTopExec && isBigCompany(companySize)) return 'ultra_boss';
  if (isTopExec || isDecision) return 'boss';

  const isCGP = /(gestion de patrimoine|patrimonial|patrimoniale|\bcgp\b|conseil en investissement|conseiller en investissement|wealth|conseil en gestion|family office|banquier prive|banque privee|courtier|expert-?comptable|avocat|notaire|assurance)/.test(t);
  if (isCGP) return 'cgp';

  return 'out_of_scope';
}

function getScoredProfiles() {
  const dir = path.join(process.cwd(), 'data/scrape-results');
  const map = new Map(); // url normalisée -> profil agrégé
  const hidden = readHiddenUrls();

  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      let data;
      try {
        data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      } catch (e) {
        continue;
      }
      const list = Array.isArray(data.profiles) ? data.profiles : [];
      // Horodatage du profil (scrape) ; à défaut, celui du fichier de résultats.
      const fileTs = data.timestamp || '';
      for (const p of list) {
        const url = (p.url || '').split('?')[0].split('#')[0];
        if (!url || !p.name) continue;
        const key = normalizeProfileUrl(url);
        if (hidden.has(key)) continue; // profil supprimé à la main : ignoré partout
        const days = relativeToDays(p.commentDate);
        const addedAt = p.timestamp || fileTs || '';
        if (map.has(key)) {
          const ex = map.get(key);
          ex.commentCount += 1; // même personne vue sur plusieurs posts/commentaires
          if ((p.title || '').length > (ex.rawTitle || '').length) ex.rawTitle = p.title;
          // Date d'ajout : on retient la plus RÉCENTE (un profil re-vu remonte en tête).
          if (addedAt > ex.dateAdded) ex.dateAdded = addedAt;
          // Données enrichies (visite du profil) : on les garde si présentes
          if (p.company && p.company !== 'N/A') ex.company = p.company;
          if (p.companySize) ex.companySize = p.companySize;
          if (!ex.photoUrl && p.photoUrl) ex.photoUrl = p.photoUrl;
          // On garde le commentaire le PLUS RÉCENT (plus petit nb de jours)
          if (days <= ex.daysAgo) {
            ex.daysAgo = days;
            ex.lastCommentDate = p.commentDate || '';
            ex.lastCommentText = p.commentText || '';
            ex.postContext = p.postContext || ex.postContext || '';
          }
        } else {
          map.set(key, {
            name: p.name,
            rawTitle: p.title || '',
            company: p.company && p.company !== 'N/A' ? p.company : '',
            companySize: p.companySize || '',
            photoUrl: p.photoUrl || '',
            url,
            dateAdded: addedAt,
            commentCount: 1,
            daysAgo: days,
            lastCommentDate: p.commentDate || '',
            lastCommentText: p.commentText || '',
            postContext: p.postContext || '',
          });
        }
      }
    }
  }

  const profiles = [];
  for (const v of map.values()) {
    const { firstName, lastName } = splitName(v.name);
    const jobTitle = clean(v.rawTitle) || 'N/A';
    // Entreprise annoncée dans le titre LinkedIn (source de vérité pour le NOM).
    const titleCompany = parseCompany(jobTitle);
    const hasTitleCompany = titleCompany && titleCompany !== 'N/A';

    // On ne fait confiance aux données enrichies (nom + taille, issues d'un clic sur
    // le profil) que si :
    //   1. le nom capté est réel (pas un texte d'UI LinkedIn), ET
    //   2. il est cohérent avec l'entreprise du titre — sinon l'enrichissement a
    //      visité la MAUVAISE entreprise (ex. un ancien poste), on le rejette.
    let company, companySize;
    const enrichedReal = isRealCompanyName(v.company);
    if (enrichedReal && (!hasTitleCompany || namesMatch(v.company, titleCompany))) {
      company = v.company;
      companySize = v.companySize || inferCompanySize(jobTitle);
    } else if (hasTitleCompany) {
      // Titre fiable mais enrichissement incohérent/absent → on garde le titre,
      // et on n'invente pas de taille (l'effectif enrichi venait de la mauvaise boîte).
      company = titleCompany;
      companySize = inferCompanySize(jobTitle);
    } else {
      company = parseCompany(jobTitle);
      companySize = inferCompanySize(jobTitle);
    }

    const base = {
      firstName,
      lastName,
      jobTitle,
      company,
      companySize,
      industry: 'N/A',
      location: '',
      profileUrl: v.url,
      photoUrl: v.photoUrl || '',
      dateAdded: v.dateAdded || '',
      daysAgo: v.daysAgo,
      commentCount: v.commentCount,
      lastCommentDate: v.lastCommentDate,
      lastCommentText: v.lastCommentText || '',
      postContext: v.postContext || '',
    };
    const scored = engine.scoreProfile(base);
    // La catégorie suit les règles métier explicites (le moteur exige une taille
    // d'entreprise qu'on n'a presque jamais → on classe sur le titre).
    scored.category = classifyCategory(base.jobTitle, base.companySize);
    profiles.push(scored);
  }

  profiles.sort((a, b) => b.score - a.score);
  return profiles;
}

function computeStats(profiles) {
  const categoryCount = { ultra_boss: 0, boss: 0, cgp: 0, out_of_scope: 0 };
  const companySizeDistribution = {};
  const companyCount = {};
  const titleCount = {};
  let ceoCount = 0, founderCount = 0, presidentCount = 0, directorCount = 0, scoreSum = 0;

  for (const p of profiles) {
    categoryCount[p.category] = (categoryCount[p.category] || 0) + 1;
    companySizeDistribution[p.companySize] = (companySizeDistribution[p.companySize] || 0) + 1;
    if (p.company && p.company !== 'N/A') companyCount[p.company] = (companyCount[p.company] || 0) + 1;

    const t = (p.jobTitle || '').toLowerCase();
    if (t.includes('ceo') || t.includes('pdg')) ceoCount++;
    if (t.includes('founder') || t.includes('fondateur') || t.includes('fondatrice')) founderCount++;
    if (t.includes('président') || t.includes('president') || t.includes('présidente')) presidentCount++;
    if (t.includes('directeur') || t.includes('directrice') || t.includes('director') || /\bdg\b/.test(t)) directorCount++;

    scoreSum += p.score;
    const key = p.jobTitle || 'N/A';
    titleCount[key] = (titleCount[key] || 0) + 1;
  }

  const topCompanies = Object.entries(companyCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, count]) => ({ name, count }));
  const topJobTitles = Object.entries(titleCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([title, count]) => ({ title, count }));

  return {
    totalProfiles: profiles.length,
    categoryCount,
    averageScore: profiles.length ? scoreSum / profiles.length : 0,
    ceoCount,
    founderCount,
    presidentCount,
    directorCount,
    companySizeDistribution,
    topCompanies,
    topJobTitles,
  };
}

module.exports = {
  getScoredProfiles,
  computeStats,
  // Exposées pour les tests unitaires (fonctions pures, sans effet de bord)
  inferCompanySize,
  classifyCategory,
  parseCompany,
  relativeToDays,
  isRealCompanyName,
  namesMatch,
  normalizeProfileUrl,
  isRelativeDateLine,
  nameFromAvatarAlt,
  parseCommentBlock,
};
