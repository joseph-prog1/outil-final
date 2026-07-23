const { test } = require('node:test');
const assert = require('node:assert');
const {
  inferCompanySize,
  classifyCategory,
  parseCompany,
  relativeToDays,
  computeStats,
  isRealCompanyName,
  namesMatch,
  normalizeProfileUrl,
  isRelativeDateLine,
  nameFromAvatarAlt,
  parseCommentBlock,
} = require('../lib/scraped-profiles.js');

// --- Parsing des commentaires du nouveau DOM LinkedIn (2026) ---
// Les fixtures ci-dessous sont des blocs RÉELS capturés sur un post ; c'est
// exactement ce que le navigateur remonte. Si LinkedIn change encore sa structure,
// ces tests cassent et signalent qu'il faut re-capturer.

test('isRelativeDateLine : reconnaît les dates relatives, rejette les titres', () => {
  assert.ok(isRelativeDateLine('3d'));
  assert.ok(isRelativeDateLine('1 sem'));
  assert.ok(isRelativeDateLine('2 mois'));
  assert.ok(isRelativeDateLine('5h'));
  assert.ok(isRelativeDateLine('1w'));
  assert.strictEqual(isRelativeDateLine('Ardian I MIF emlyon'), false);
  assert.strictEqual(isRelativeDateLine('• 1st'), false);
  assert.strictEqual(isRelativeDateLine('Private Equity Associate - SIPAREX'), false);
});

test('nameFromAvatarAlt : extrait le nom, gère les deux apostrophes et les noms en « s »', () => {
  assert.strictEqual(nameFromAvatarAlt('View Nicolas BERNARD’s profile'), 'Nicolas BERNARD');
  assert.strictEqual(nameFromAvatarAlt("View Louis Picaud's profile"), 'Louis Picaud');
  assert.strictEqual(nameFromAvatarAlt('View Inès Moussous’ profile'), 'Inès Moussous');
  assert.strictEqual(nameFromAvatarAlt(''), '');
  assert.strictEqual(nameFromAvatarAlt('n’importe quoi'), '');
});

test('parseCommentBlock : bloc réel avec titre => nom/titre/date/commentaire corrects', () => {
  const block = {
    imgAlt: 'View Nicolas BERNARD’s profile',
    href: 'https://www.linkedin.com/in/nicolas-bernard-43a281207/',
    commentary: 'Slides',
    shellLines: [
      'Nicolas BERNARD Verified Profile 1st',
      'Nicolas BERNARD',
      '• 1st',
      'Ardian I MIF emlyon',
      '3d',
      'Slides',
      '1 reaction',
    ],
  };
  assert.deepStrictEqual(parseCommentBlock(block), {
    name: 'Nicolas BERNARD',
    title: 'Ardian I MIF emlyon',
    date: '3d',
    comment: 'Slides',
  });
});

test('parseCommentBlock : commentateur sans titre => titre vide, pas le degré ni le nom', () => {
  const block = {
    imgAlt: 'View Jean Dupont’s profile',
    commentary: 'Bravo',
    shellLines: ['Jean Dupont', '• 2nd', '1w', 'Bravo'],
  };
  const r = parseCommentBlock(block);
  assert.strictEqual(r.name, 'Jean Dupont');
  assert.strictEqual(r.title, ''); // la ligne avant la date est "• 2nd" -> rejetée
  assert.strictEqual(r.date, '1w');
});

test('parseCommentBlock : sans avatar, retombe sur la ligne nom du bloc', () => {
  const block = {
    imgAlt: '',
    commentary: 'Merci',
    shellLines: ['Marie Martin Verified Profile 1st', 'Marie Martin', '• 1st', 'CGP indépendante', '2 mois', 'Merci'],
  };
  const r = parseCommentBlock(block);
  assert.strictEqual(r.name, 'Marie Martin');
  assert.strictEqual(r.title, 'CGP indépendante');
  assert.strictEqual(r.date, '2 mois');
});

// --- normalizeProfileUrl : clé canonique pour l'agrégation ET la suppression ---
// Un profil supprimé doit rester exclu même si le re-scrape renvoie une URL
// avec query string, slash final ou casse différente.

test('normalizeProfileUrl : retire query, hash, slash final et met en minuscules', () => {
  assert.strictEqual(
    normalizeProfileUrl('https://www.linkedin.com/in/Jean-Dupont/?miniProfileUrn=abc#section'),
    'https://www.linkedin.com/in/jean-dupont'
  );
});

test('normalizeProfileUrl : deux variantes de la même URL donnent la même clé', () => {
  const a = normalizeProfileUrl('https://linkedin.com/in/jane-doe');
  const b = normalizeProfileUrl('https://linkedin.com/in/Jane-Doe/?utm=x');
  assert.strictEqual(a, b);
});

test('normalizeProfileUrl : vide/null => chaîne vide', () => {
  assert.strictEqual(normalizeProfileUrl(''), '');
  assert.strictEqual(normalizeProfileUrl(null), '');
});

// --- inferCompanySize : déduction d'effectif depuis le titre ---

test('inferCompanySize : titre sans effectif => Non précisé', () => {
  assert.strictEqual(inferCompanySize('CEO chez Acme'), 'Non précisé');
  assert.strictEqual(inferCompanySize(''), 'Non précisé');
});

test('inferCompanySize : mappe les effectifs vers les bonnes tranches', () => {
  assert.strictEqual(inferCompanySize('Dirigeant, 5 salariés'), '1-10');
  assert.strictEqual(inferCompanySize('Fondateur — 30 collaborateurs'), '10-50');
  assert.strictEqual(inferCompanySize('CEO, 60 consultants'), '50-100');
  assert.strictEqual(inferCompanySize('Cabinet de 200 employés'), '100-500');
  assert.strictEqual(inferCompanySize('Groupe de 8000 salariés'), '5000+');
});

// --- classifyCategory : règles métier basées sur titre + taille ---

test('classifyCategory : dirigeant + >= 10 employés => ultra_boss', () => {
  assert.strictEqual(classifyCategory('CEO', '10-50'), 'ultra_boss');
  assert.strictEqual(classifyCategory('Fondateur', '5000+'), 'ultra_boss');
});

test('classifyCategory : dirigeant + < 10 employés => boss', () => {
  assert.strictEqual(classifyCategory('CEO', '1-10'), 'boss');
});

test('classifyCategory : dirigeant + taille inconnue => boss', () => {
  assert.strictEqual(classifyCategory('Président', 'Non précisé'), 'boss');
});

test('classifyCategory : disqualifiants => out_of_scope', () => {
  assert.strictEqual(classifyCategory('Étudiant en école de commerce', '10-50'), 'out_of_scope');
  assert.strictEqual(classifyCategory('En reconversion professionnelle', 'Non précisé'), 'out_of_scope');
});

test('classifyCategory : métier du patrimoine => cgp', () => {
  assert.strictEqual(classifyCategory('Conseiller en gestion de patrimoine', 'Non précisé'), 'cgp');
  assert.strictEqual(classifyCategory('Banquier privé', 'Non précisé'), 'cgp');
});

test('classifyCategory : profil sans signal => out_of_scope', () => {
  assert.strictEqual(classifyCategory('Photographe indépendant', 'Non précisé'), 'out_of_scope');
});

// --- isRealCompanyName : rejet des textes d'UI LinkedIn ---

test('isRealCompanyName : rejette les bandeaux de consentement / UI LinkedIn', () => {
  assert.strictEqual(isRealCompanyName('LinkedIn respects your privacy'), false);
  assert.strictEqual(isRealCompanyName('Se connecter'), false);
  assert.strictEqual(isRealCompanyName('LinkedIn'), false);
  assert.strictEqual(isRealCompanyName(''), false);
  assert.strictEqual(isRealCompanyName('X'), false);
});

test('isRealCompanyName : accepte un vrai nom d\'entreprise', () => {
  assert.strictEqual(isRealCompanyName('Groupe Zebra'), true);
  assert.strictEqual(isRealCompanyName('RidgeRock'), true);
});

// --- namesMatch : cohérence entre entreprise enrichie et entreprise du titre ---

test('namesMatch : mêmes entreprises (tolérant aux mots vides/accents)', () => {
  assert.strictEqual(namesMatch('Groupe Zebra', 'Zebra'), true);
  assert.strictEqual(namesMatch('groupe zebra', 'Groupe Zébra'), true);
  assert.strictEqual(namesMatch('RidgeRock SAS', 'RidgeRock'), true);
});

test('namesMatch : entreprises différentes => false (le cas Bertrand)', () => {
  assert.strictEqual(namesMatch('Groupe Zebra', 'GO Sport'), false);
  assert.strictEqual(namesMatch('Acme', 'Globex'), false);
});

test('namesMatch : noms vides => false', () => {
  assert.strictEqual(namesMatch('', 'Zebra'), false);
  assert.strictEqual(namesMatch('Groupe', 'SAS'), false); // que des mots vides
});

// --- parseCompany : extraction du nom d'entreprise depuis le titre ---

test('parseCompany : détecte "chez X"', () => {
  assert.strictEqual(parseCompany('Associée chez RidgeRock'), 'RidgeRock');
});

test('parseCompany : titre sans société => N/A', () => {
  assert.strictEqual(parseCompany('Consultant indépendant'), 'N/A');
});

// --- relativeToDays : conversion des dates relatives LinkedIn ---

test('relativeToDays : convertit les unités (FR)', () => {
  assert.strictEqual(relativeToDays('3 j'), 3);
  assert.strictEqual(relativeToDays('2 sem'), 14);
  assert.strictEqual(relativeToDays('1 mois'), 30);
  assert.strictEqual(relativeToDays('5 h'), 0);
});

test('relativeToDays : formats anglais abrégés de LinkedIn (1mo, 3w, 2d…)', () => {
  assert.strictEqual(relativeToDays('1mo'), 30);
  assert.strictEqual(relativeToDays('2mo'), 60);
  assert.strictEqual(relativeToDays('3w'), 21);
  assert.strictEqual(relativeToDays('2d'), 2);
  assert.strictEqual(relativeToDays('5h'), 0);
  assert.strictEqual(relativeToDays('1yr'), 365);
  assert.strictEqual(relativeToDays('10m'), 0); // minutes
});

test('relativeToDays : inconnu => très ancien', () => {
  assert.strictEqual(relativeToDays(''), 99999);
  assert.strictEqual(relativeToDays(null), 99999);
});

// --- computeStats : agrégation ---

test('computeStats : compte les catégories et calcule la moyenne', () => {
  const profiles = [
    { category: 'ultra_boss', companySize: '10-50', company: 'Acme', jobTitle: 'CEO', score: 90 },
    { category: 'boss', companySize: '1-10', company: 'Beta', jobTitle: 'Founder', score: 70 },
    { category: 'cgp', companySize: 'Non précisé', company: 'N/A', jobTitle: 'Conseiller', score: 50 },
  ];
  const stats = computeStats(profiles);
  assert.strictEqual(stats.totalProfiles, 3);
  assert.strictEqual(stats.categoryCount.ultra_boss, 1);
  assert.strictEqual(stats.categoryCount.boss, 1);
  assert.strictEqual(stats.categoryCount.cgp, 1);
  assert.strictEqual(stats.averageScore, 70);
});

test('computeStats : liste vide ne casse pas', () => {
  const stats = computeStats([]);
  assert.strictEqual(stats.totalProfiles, 0);
  assert.strictEqual(stats.averageScore, 0);
});
