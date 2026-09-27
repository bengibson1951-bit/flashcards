import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListText, matchWords } from '../lists.js';

const dict = [
  { id: 'chien', fr: 'chien', article: 'le', en: 'dog', emoji: '🐕', unit: 3, rank: 1 },
  { id: 'ecole', fr: 'école', article: "l'", en: 'school', emoji: '🏫', unit: 10, rank: 2 },
  { id: 'rouge', fr: 'rouge', article: null, en: 'red', emoji: '🔴', unit: 5, rank: 3 },
];

test('parses plain words, "fr = en" and articles, ignoring blank lines', () => {
  const out = parseListText('chien\n\nle chat = cat\n  rouge=red  \n');
  assert.deepEqual(out, [
    { fr: 'chien', article: null, en: null },
    { fr: 'chat', article: 'le', en: 'cat' },
    { fr: 'rouge', article: null, en: 'red' },
  ]);
});

test("parses l' article", () => {
  assert.deepEqual(parseListText("l'eau = water"), [{ fr: 'eau', article: "l'", en: 'water' }]);
});

test('matchWords finds exact and accent-insensitive matches', () => {
  const { matched, unknown } = matchWords(parseListText('Chien\necole\nchat = cat'), dict);
  assert.deepEqual(matched.map((w) => w.id), ['chien', 'ecole']);
  assert.deepEqual(unknown, [{ fr: 'chat', article: null, en: 'cat' }]);
});

test('matchWords deduplicates', () => {
  const { matched } = matchWords(parseListText('chien\nle chien'), dict);
  assert.equal(matched.length, 1);
});
