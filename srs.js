// SM-2 / Anki-style scheduler. Pure functions; time is always passed in.

export const AGAIN = 0;
export const HARD = 1;
export const GOOD = 2;
export const EASY = 3;

export const MINUTE = 60e3;
export const DAY = 86400e3;

export const LEARNING_STEPS = [1 * MINUTE, 10 * MINUTE];
export const RELEARN_STEPS = [10 * MINUTE];
export const GRADUATE_DAYS = 1;
export const EASY_DAYS = 4;
export const MIN_EASE = 1.3;
export const START_EASE = 2.5;

export function newCard() {
  return { state: 'new', step: 0, ease: START_EASE, interval: 0, due: 0, reps: 0, lapses: 0 };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function fuzz(days, rng) {
  if (days <= 2) return days;
  const f = 1 + (rng() * 2 - 1) * 0.05;
  return Math.max(1, Math.round(days * f));
}

function stepDelay(steps, step, grade) {
  if (grade === HARD) {
    const next = steps[step + 1] ?? steps[step] * 2;
    return (steps[step] + next) / 2;
  }
  return steps[step];
}

/** Returns a new card state after answering `grade` at time `now`. */
export function schedule(card, grade, now, opts = {}) {
  const rng = opts.rng ?? Math.random;
  const c = { ...card, reps: card.reps + 1 };

  if (c.state === 'new' || c.state === 'learning') {
    c.state = 'learning';
    if (grade === EASY) {
      c.state = 'review';
      c.step = 0;
      c.interval = EASY_DAYS;
      c.due = now + c.interval * DAY;
      return c;
    }
    if (grade === AGAIN) c.step = 0;
    else if (grade === GOOD) c.step = card.state === 'new' ? 1 : card.step + 1;
    // HARD keeps the step

    if (c.step >= LEARNING_STEPS.length) {
      c.state = 'review';
      c.step = 0;
      c.interval = GRADUATE_DAYS;
      c.due = now + c.interval * DAY;
      return c;
    }
    c.due = now + stepDelay(LEARNING_STEPS, c.step, grade);
    return c;
  }

  if (c.state === 'relearning') {
    if (grade === AGAIN) {
      c.step = 0;
      c.due = now + RELEARN_STEPS[0];
      return c;
    }
    if (grade === HARD) {
      c.due = now + stepDelay(RELEARN_STEPS, c.step, grade);
      return c;
    }
    // GOOD / EASY: back to review with the stored (halved) interval
    c.state = 'review';
    c.step = 0;
    c.due = now + c.interval * DAY;
    return c;
  }

  // review
  if (grade === AGAIN) {
    c.state = 'relearning';
    c.step = 0;
    c.lapses = card.lapses + 1;
    c.ease = round2(Math.max(MIN_EASE, card.ease - 0.2));
    c.interval = Math.max(1, Math.round(card.interval * 0.5));
    c.due = now + RELEARN_STEPS[0];
    return c;
  }
  let days;
  if (grade === HARD) {
    c.ease = round2(Math.max(MIN_EASE, card.ease - 0.15));
    days = Math.max(card.interval + 1, Math.round(card.interval * 1.2));
  } else if (grade === GOOD) {
    days = Math.max(card.interval + 1, Math.round(card.interval * card.ease));
  } else {
    c.ease = round2(card.ease + 0.15);
    days = Math.max(card.interval + 1, Math.round(card.interval * card.ease * 1.3));
  }
  c.interval = fuzz(days, rng);
  c.due = now + c.interval * DAY;
  return c;
}

export function formatInterval(ms) {
  if (ms < MINUTE) return '<1m';
  if (ms < 60 * MINUTE) return `${Math.round(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))}h`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(Math.round(days / 36.5) / 10)}y`;
}

/** Labels for the four grade buttons: what interval each would produce. */
export function previewIntervals(card, now) {
  return [AGAIN, HARD, GOOD, EASY].map((g) => {
    const c = schedule(card, g, now, { rng: () => 0.5 });
    return formatInterval(c.due - now);
  });
}
