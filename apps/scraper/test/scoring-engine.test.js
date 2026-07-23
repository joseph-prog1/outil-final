const { test } = require('node:test');
const assert = require('node:assert');
const ScoringEngine = require('../lib/scoring-engine.js');

const engine = new ScoringEngine();

test('score : base 40 pour un titre neutre sans signal', () => {
  const s = engine.calculateTotalScore({ jobTitle: 'Photographe', companySize: '1-10', commentCount: 0 });
  assert.strictEqual(s, 40);
});

test('score : les mots-clés dirigeant augmentent le score', () => {
  const founder = engine.calculateTotalScore({ jobTitle: 'Founder', companySize: '1-10', commentCount: 0 });
  assert.ok(founder > 40, `founder devrait dépasser 40, obtenu ${founder}`);
});

test('score : étudiant est fortement pénalisé', () => {
  const s = engine.calculateTotalScore({ jobTitle: 'Étudiant en finance', companySize: '1-10', commentCount: 0 });
  assert.ok(s < 40, `étudiant devrait être sous 40, obtenu ${s}`);
});

test('score : borné entre 0 et 100', () => {
  const low = engine.calculateTotalScore({ jobTitle: 'Étudiant stagiaire alternant junior', companySize: '1-10', commentCount: 0 });
  assert.ok(low >= 0, `score plancher 0, obtenu ${low}`);
  const high = engine.calculateTotalScore({ jobTitle: 'Founder CEO President Owner Chairman', companySize: '5000+', commentCount: 50 });
  assert.ok(high <= 100, `score plafond 100, obtenu ${high}`);
});

test('score : bonus de taille d\'entreprise', () => {
  const small = engine.calculateCompanySizeScore('1-10');
  const big = engine.calculateCompanySizeScore('5000+');
  assert.ok(big > small, 'une grosse entreprise doit rapporter plus qu\'une petite');
});

// --- Règle métier centrale : seuil des 10 employés ---

test('catégorie : dirigeant + entreprise >= 10 employés => ultra_boss', () => {
  assert.strictEqual(engine.getCategory(90, 'CEO', '10-50'), 'ultra_boss');
  assert.strictEqual(engine.getCategory(90, 'Founder', '5000+'), 'ultra_boss');
});

test('catégorie : dirigeant + entreprise < 10 employés => boss', () => {
  assert.strictEqual(engine.getCategory(90, 'CEO', '1-10'), 'boss');
  assert.strictEqual(engine.getCategory(90, 'Founder', '1-10'), 'boss');
});

test('catégorie : dirigeant + taille inconnue => boss (pas ultra_boss)', () => {
  assert.strictEqual(engine.getCategory(90, 'CEO', 'Non précisé'), 'boss');
});

test('catégorie : métier du patrimoine => cgp', () => {
  assert.strictEqual(engine.getCategory(50, 'Consultant en gestion de patrimoine', '100-500'), 'cgp');
});

test('catégorie : étudiant => out_of_scope', () => {
  assert.strictEqual(engine.getCategory(20, 'Étudiant', '1-10'), 'out_of_scope');
});

test('scoreProfile : renvoie score + catégorie cohérents', () => {
  const r = engine.scoreProfile({ jobTitle: 'CEO', companySize: '10-50', commentCount: 3 });
  assert.strictEqual(r.category, 'ultra_boss');
  assert.ok(typeof r.score === 'number');
  assert.ok(r.scoredAt, 'un timestamp scoredAt doit être présent');
});
