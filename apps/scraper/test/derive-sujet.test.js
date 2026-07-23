// La déduction du sujet doit produire une locution NATURELLE qui a du sens dans
// « Avez-vous eu l'occasion de consulter le document sur {sujet} ? » — testée
// sur les textes RÉELS des posts scrapés (data/scrape-results).

const { test } = require('node:test');
const assert = require('node:assert');
const { deriveSujet, FALLBACK } = require('../lib/derive-sujet.js');

const POST_AUTOMATISATION =
  "L'IA transforme la gestion de patrimoine : voici les 4 process que nous pouvons " +
  "automatiser pour vous ...Certains CGP libèrent déjà 10 à 15 heures par semaine." +
  "D'autres passent encore leurs soirées sur Excel.La différence : des agents IA con";

const POST_MODELES =
  "Conseillers patrimoniaux. Sociétés de gestion. L'un des meilleurs modèles d'IA " +
  "du marché vient de devenir inaccessible. Pas pour raison technique. Sur";

test('post « 4 process à automatiser » → sujet automatisation', () => {
  assert.strictEqual(deriveSujet(POST_AUTOMATISATION), "l'automatisation des process en gestion de patrimoine");
});

test('post « meilleurs modèles d\'IA » → sujet modèles d\'IA', () => {
  assert.strictEqual(deriveSujet(POST_MODELES), "les modèles d'IA pour les conseillers patrimoniaux");
});

test('post IA générique patrimoine → sujet IA gestion de patrimoine', () => {
  assert.strictEqual(
    deriveSujet("Pourquoi l'IA va changer le métier de conseiller en 2026"),
    "l'IA dans la gestion de patrimoine"
  );
});

test('texte vide ou inconnu → repli parlant (jamais de sujet vide/brut)', () => {
  for (const txt of ['', null, undefined, 'Bonne année à tous !']) {
    const s = deriveSujet(txt);
    assert.strictEqual(s, FALLBACK);
    assert.ok(s.length > 10);
  }
});

test('le sujet s\'insère naturellement dans la phrase du DM', () => {
  for (const post of [POST_AUTOMATISATION, POST_MODELES, '']) {
    const sujet = deriveSujet(post);
    const phrase = `Avez-vous eu l'occasion de consulter le document sur ${sujet} ?`;
    // Une locution nominale : commence par un article, pas de majuscule brute,
    // pas de ponctuation résiduelle du post.
    assert.match(sujet, /^(l'|les |la |le )/);
    assert.ok(!/[.!?…]/.test(sujet), phrase);
  }
});
