import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_TYPES, cardId, cardsForWord, buildQueue, todayKey, nextDue } from '../deck.js';
import { newCard, DAY } from '../srs.js';

const words = [
  { id: 'a', fr: 'a', article: null, en: 'a', emoji: '🅰️', unit: 1, rank: 1 },
  { id: 'b', fr: 'b', article: null, en: 'b', unit: 1, rank: 2 }, // no emoji
  { id: 'c', fr: 'c', article: null, en: 'c', emoji: '©️', unit: 2, rank: 3 },
  { id: 'd', fr: 'd', article: null, en: 'd', emoji: '🇩🇪', unit: 2, rank: 4 },
];
const allTypes = { pic: true, fr2en: true, en2fr: true, spell: true };
const settings = { newPerDay: 2, cardTypes: allTypes };
const NOW = new Date(2026, 8, 27, 10).getTime();
const TODAY = todayKey(NOW);
const YESTERDAY = todayKey(NOW - DAY);
const emptyProgress = () => ({ newIntroducedDates: {}, newCountByDay: {}, known: {} });

test('CARD_TYPES and cardId', () => {
  assert.deepEqual(CARD_TYPES, ['pic', 'fr2en', 'en2fr', 'spell']);
  assert.equal(cardId('chien', 'pic'), 'chien|pic');
});

test('word without emoji has no pic card; toggles respected', () => {
  assert.deepEqual(cardsForWord(words[0], settings), ['pic', 'fr2en', 'en2fr', 'spell']);
  assert.deepEqual(cardsForWord(words[1], settings), ['fr2en', 'en2fr', 'spell']);
  assert.deepEqual(cardsForWord(words[0], { cardTypes: { ...allTypes, spell: false } }), ['pic', 'fr2en', 'en2fr']);
});

test('intros limited to newPerDay per session (not per day), in rank order', () => {
  const progress = emptyProgress();
  progress.newCountByDay[TODAY] = 1;
  const q = buildQueue({ words, cards: {}, settings, progress, now: NOW, scope: { type: 'all' } });
  const intros = q.items.filter((i) => i.kind === 'intro');
  assert.deepEqual(intros.map((i) => i.wordId), ['a', 'b']);
  assert.equal(q.newToday, 1);
});

test('practice mode: all cards of introduced words, ignoring due dates and next-day unlock, no intros', () => {
  const cards = { 'a|pic': { ...newCard(), state: 'review', due: NOW + 10 * DAY } };
  const progress = emptyProgress();
  progress.newIntroducedDates.a = TODAY;
  progress.newIntroducedDates.b = TODAY;
  const q = buildQueue({ words, cards, settings, progress, now: NOW, scope: { type: 'all' }, mode: 'practice', rng: () => 0.5 });
  assert.ok(q.items.every((i) => i.kind === 'card'));
  assert.deepEqual(q.items.map((i) => cardId(i.wordId, i.type)).sort(),
    ['a|en2fr', 'a|fr2en', 'a|pic', 'a|spell', 'b|en2fr', 'b|fr2en', 'b|spell']);
});

test('practice mode with nothing introduced is empty', () => {
  const q = buildQueue({ words, cards: {}, settings, progress: emptyProgress(), now: NOW, scope: { type: 'all' }, mode: 'practice' });
  assert.deepEqual(q.items, []);
});

test('known words are skipped for intros', () => {
  const progress = emptyProgress();
  progress.known.a = true;
  const q = buildQueue({ words, cards: {}, settings, progress, now: NOW, scope: { type: 'all' } });
  assert.deepEqual(q.items.filter((i) => i.kind === 'intro').map((i) => i.wordId), ['b', 'c']);
});

test('unit scope filters words', () => {
  const q = buildQueue({ words, cards: {}, settings, progress: emptyProgress(), now: NOW, scope: { type: 'unit', id: 2 } });
  assert.deepEqual(q.items.map((i) => i.wordId), ['c', 'd']);
});

test('list scope uses list order', () => {
  const q = buildQueue({ words, cards: {}, settings, progress: emptyProgress(), now: NOW, scope: { type: 'list', wordIds: ['d', 'a'] } });
  assert.deepEqual(q.items.map((i) => i.wordId), ['d', 'a']);
});

test('en2fr/spell excluded on introduction day, included next day', () => {
  const due = { ...newCard(), due: NOW - 1000 };
  const cards = {
    'a|pic': due, 'a|fr2en': due, 'a|en2fr': due, 'a|spell': due,
  };
  const progress = emptyProgress();
  progress.newIntroducedDates.a = TODAY;
  const noNew = { ...settings, newPerDay: 0 };
  let q = buildQueue({ words, cards, settings: noNew, progress, now: NOW, scope: { type: 'all' } });
  assert.deepEqual(q.items.map((i) => i.type).sort(), ['fr2en', 'pic']);

  progress.newIntroducedDates.a = YESTERDAY;
  q = buildQueue({ words, cards, settings: noNew, progress, now: NOW, scope: { type: 'all' } });
  assert.deepEqual(q.items.map((i) => i.type).sort(), ['en2fr', 'fr2en', 'pic', 'spell']);
});

test('only due cards are included', () => {
  const cards = {
    'a|pic': { ...newCard(), state: 'review', due: NOW + DAY },
    'a|fr2en': { ...newCard(), state: 'review', due: NOW - 1 },
    'a|en2fr': { ...newCard(), state: 'review', due: NOW + DAY },
    'a|spell': { ...newCard(), state: 'review', due: NOW + DAY },
  };
  const progress = emptyProgress();
  progress.newIntroducedDates.a = YESTERDAY;
  const q = buildQueue({ words, cards, settings: { ...settings, newPerDay: 0 }, progress, now: NOW, scope: { type: 'all' } });
  assert.deepEqual(q.items.map((i) => cardId(i.wordId, i.type)), ['a|fr2en']);
});

test('intros are interleaved among reviews, not all first', () => {
  const cards = {};
  const progress = emptyProgress();
  progress.newIntroducedDates.a = YESTERDAY;
  for (const t of CARD_TYPES) cards[cardId('a', t)] = { ...newCard(), state: 'review', due: NOW - 1 };
  const q = buildQueue({ words, cards, settings, progress, now: NOW, scope: { type: 'all' } });
  const kinds = q.items.map((i) => i.kind);
  assert.equal(kinds.filter((k) => k === 'intro').length, 2);
  assert.notEqual(kinds[0] + kinds[1], 'introintro');
});

test('todayKey uses local date', () => {
  assert.equal(todayKey(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05');
});

test('nextDue returns earliest future due or null', () => {
  assert.equal(nextDue({ x: { due: NOW + 5 }, y: { due: NOW + 2 } }, NOW), NOW + 2);
  assert.equal(nextDue({}, NOW), null);
});
