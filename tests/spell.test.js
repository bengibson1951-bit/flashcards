import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalise, stripAccents, checkSpelling, ACCENT_KEYS } from '../spell.js';

test('normalise trims, lowers, collapses spaces and strips articles', () => {
  assert.equal(normalise('  Le   Chien '), 'chien');
  assert.equal(normalise("L'eau"), 'eau');
  assert.equal(normalise('la maison'), 'maison');
  assert.equal(normalise('les yeux'), 'yeux');
  assert.equal(normalise('une pomme'), 'pomme');
  assert.equal(normalise('lecture'), 'lecture'); // "le" without space is not an article
});

test('stripAccents removes diacritics but keeps œ/ç mapping', () => {
  assert.equal(stripAccents('école'), 'ecole');
  assert.equal(stripAccents('garçon'), 'garcon');
  assert.equal(stripAccents('cœur'), 'coeur');
});

test('correct answer with or without article', () => {
  assert.equal(checkSpelling('le chien', 'chien').result, 'correct');
  assert.equal(checkSpelling('Chien ', 'chien').result, 'correct');
  assert.equal(checkSpelling("l'eau", 'eau').result, 'correct');
  assert.equal(checkSpelling('chien', 'chien').grade, 2);
});

test('accent-only mistake is almost, grade 1, marks accent positions', () => {
  const r = checkSpelling('ecole', 'école');
  assert.equal(r.result, 'almost');
  assert.equal(r.grade, 1);
  assert.deepEqual(r.diff.map((d) => d.ok), [false, true, true, true, true]);
  assert.equal(r.diff[0].ch, 'é');
});

test('wrong answer is wrong, grade 0, diff shows mismatches', () => {
  const r = checkSpelling('chat', 'chien');
  assert.equal(r.result, 'wrong');
  assert.equal(r.grade, 0);
  assert.equal(r.diff.map((d) => d.ch).join(''), 'chien');
  assert.deepEqual(r.diff.slice(0, 2).map((d) => d.ok), [true, true]);
  assert.ok(r.diff.some((d) => !d.ok));
});

test('empty answer is wrong', () => {
  assert.equal(checkSpelling('', 'chien').result, 'wrong');
});

test('accent keys include the common French ones', () => {
  for (const k of ['é', 'è', 'ç', 'à', 'ê', 'œ']) assert.ok(ACCENT_KEYS.includes(k));
});
