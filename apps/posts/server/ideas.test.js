// server/ideas.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import {
  normalizeSignature, ideaId, validateRawIdea, mergeIdeas,
  buildBeatPrompt, IDEA_BEATS, IDEA_THEMES, readIdeas,
} from './ideas.js';

test('normalizeSignature strips accents, punctuation and case', () => {
  assert.strictEqual(
    normalizeSignature('L\'État OUVRE data.gouv !', 'data_officielle'),
    'data officielle l etat ouvre data gouv'
  );
});

test('ideaId is deterministic and 16 chars', () => {
  const a = ideaId('Titre X', 'ia');
  const b = ideaId('Titre X', 'ia');
  assert.strictEqual(a, b);
  assert.strictEqual(a.length, 16);
});

test('validateRawIdea rejects empty titre', () => {
  assert.strictEqual(validateRawIdea({ titre: '   ' }), null);
});

test('validateRawIdea normalizes theme, archetype, score and sources', () => {
  const idea = validateRawIdea({
    titre: 'Sujet',
    theme: 'bogus',
    score: 42,
    suggested_archetype: 'nope',
    sources: [{ url: 'ftp://x' }, { titre: 'A', url: 'https://a.com' }],
  });
  assert.strictEqual(idea.theme, 'ia');
  assert.strictEqual(idea.suggested_archetype, 'typo_geante');
  assert.strictEqual(idea.score, 10);
  assert.deepStrictEqual(idea.sources, [{ titre: 'A', url: 'https://a.com', date: undefined }]);
  assert.strictEqual(idea.statut, 'nouveau');
});

test('mergeIdeas preserves existing status and counts only new', () => {
  const existing = [{ id: 'x', titre: 'A', statut: 'utilise' }];
  const incoming = [
    { id: 'x', titre: 'A', statut: 'nouveau' },
    { id: 'y', titre: 'B', statut: 'nouveau' },
  ];
  const { list, added } = mergeIdeas(existing, incoming);
  assert.strictEqual(added, 1);
  assert.strictEqual(list.find((i) => i.id === 'x').statut, 'utilise');
  assert.strictEqual(list.length, 2);
});

test('buildBeatPrompt embeds the beat focus, winning topics and seen titles', () => {
  const { system, user } = buildBeatPrompt({
    beat: IDEA_BEATS[0],
    winningTopics: ['IA + data officielle Pappers'],
    seenTitles: ['Ancien sujet déjà posté'],
    todayISO: '2026-07-05',
    sinceISO: '2026-06-21',
  });
  assert.match(system, /IA \+ data officielle Pappers/);
  assert.match(system, /Ancien sujet déjà posté/);
  assert.match(system, /Anthropic/); // texte du focus du 1er beat
  assert.match(system, /2026-07-05/); // ancre de date injectée
  assert.match(user, /JSON/);
});

test('IDEA_BEATS all map to a theme declared in IDEA_THEMES', () => {
  assert.ok(IDEA_BEATS.length >= 4);
  for (const b of IDEA_BEATS) assert.ok(IDEA_THEMES.includes(b.theme), `beat ${b.key} thème invalide`);
});

test('readIdeas returns an empty store for a missing file', () => {
  const store = readIdeas('/nonexistent/path/ideas.json');
  assert.deepStrictEqual(store, { ideas: [], last_run: null, last_run_failed: false });
});
