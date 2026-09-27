import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newCard, schedule, previewIntervals, formatInterval,
  AGAIN, HARD, GOOD, EASY, DAY, LEARNING_STEPS,
} from '../srs.js';

const NOW = Date.UTC(2026, 8, 27, 10, 0, 0);
const noFuzz = { rng: () => 0.5 };

test('newCard has expected defaults', () => {
  assert.deepEqual(newCard(), { state: 'new', step: 0, ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0 });
});

test('new + Good -> learning step 1 due in 10 minutes', () => {
  const c = schedule(newCard(), GOOD, NOW, noFuzz);
  assert.equal(c.state, 'learning');
  assert.equal(c.step, 1);
  assert.equal(c.due, NOW + LEARNING_STEPS[1]);
  assert.equal(c.reps, 1);
});

test('new + Again -> learning step 0 due in 1 minute', () => {
  const c = schedule(newCard(), AGAIN, NOW, noFuzz);
  assert.equal(c.state, 'learning');
  assert.equal(c.step, 0);
  assert.equal(c.due, NOW + LEARNING_STEPS[0]);
});

test('last learning step + Good -> review 1 day', () => {
  const c = schedule({ ...newCard(), state: 'learning', step: 1 }, GOOD, NOW, noFuzz);
  assert.equal(c.state, 'review');
  assert.equal(c.interval, 1);
  assert.equal(c.due, NOW + DAY);
});

test('new + Easy -> review 4 days', () => {
  const c = schedule(newCard(), EASY, NOW, noFuzz);
  assert.equal(c.state, 'review');
  assert.equal(c.interval, 4);
  assert.equal(c.due, NOW + 4 * DAY);
});

test('learning + Hard repeats step with in-between delay', () => {
  const c = schedule({ ...newCard(), state: 'learning', step: 0 }, HARD, NOW, noFuzz);
  assert.equal(c.state, 'learning');
  assert.equal(c.step, 0);
  assert.equal(c.due, NOW + (LEARNING_STEPS[0] + LEARNING_STEPS[1]) / 2);
});

const review10 = () => ({ ...newCard(), state: 'review', step: 0, interval: 10, due: NOW, reps: 5 });

test('review 10d + Good -> 25d', () => {
  const c = schedule(review10(), GOOD, NOW, noFuzz);
  assert.equal(c.interval, 25);
  assert.equal(c.ease, 2.5);
  assert.equal(c.due, NOW + 25 * DAY);
});

test('review 10d + Easy -> 10*2.5*1.3 = 33d (rounded), ease +0.15', () => {
  const c = schedule(review10(), EASY, NOW, noFuzz);
  assert.equal(c.interval, 33);
  assert.equal(c.ease, 2.65);
});

test('review 10d + Hard -> 12d, ease 2.35', () => {
  const c = schedule(review10(), HARD, NOW, noFuzz);
  assert.equal(c.interval, 12);
  assert.equal(c.ease, 2.35);
});

test('review + Again -> relearning, lapse, ease -0.2, interval halved (min 1)', () => {
  const c = schedule(review10(), AGAIN, NOW, noFuzz);
  assert.equal(c.state, 'relearning');
  assert.equal(c.lapses, 1);
  assert.equal(c.ease, 2.3);
  assert.equal(c.interval, 5);
  assert.equal(c.due, NOW + LEARNING_STEPS[1]);
  const c2 = schedule({ ...review10(), interval: 1 }, AGAIN, NOW, noFuzz);
  assert.equal(c2.interval, 1);
});

test('relearning + Good -> back to review with stored interval', () => {
  const c = schedule({ ...review10(), state: 'relearning', interval: 5 }, GOOD, NOW, noFuzz);
  assert.equal(c.state, 'review');
  assert.equal(c.interval, 5);
  assert.equal(c.due, NOW + 5 * DAY);
});

test('ease never drops below 1.3', () => {
  let c = review10();
  for (let i = 0; i < 10; i++) c = schedule({ ...c, state: 'review', due: NOW }, HARD, NOW, noFuzz);
  assert.equal(c.ease, 1.3);
});

test('Good/Easy interval is at least previous + 1', () => {
  const c = schedule({ ...review10(), interval: 1, ease: 1.3 }, GOOD, NOW, noFuzz);
  assert.ok(c.interval >= 2);
});

test('fuzz stays within ±5% for intervals > 2 days', () => {
  const hi = schedule(review10(), GOOD, NOW, { rng: () => 1 });
  const lo = schedule(review10(), GOOD, NOW, { rng: () => 0 });
  assert.ok(hi.interval <= 27 && hi.interval >= 25);
  assert.ok(lo.interval >= 23 && lo.interval <= 25);
});

test('formatInterval labels', () => {
  assert.equal(formatInterval(30e3), '<1m');
  assert.equal(formatInterval(600e3), '10m');
  assert.equal(formatInterval(DAY), '1d');
  assert.equal(formatInterval(4 * DAY), '4d');
  assert.equal(formatInterval(60 * DAY), '2mo');
  assert.equal(formatInterval(400 * DAY), '1.1y');
});

test('previewIntervals for a new card', () => {
  assert.deepEqual(previewIntervals(newCard(), NOW), ['1m', '6m', '10m', '4d']);
});
