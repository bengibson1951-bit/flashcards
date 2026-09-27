// Builds cards from words and the daily study queue. Pure.

export const CARD_TYPES = ['pic', 'fr2en', 'en2fr', 'spell'];
// Production cards unlock the day after a word was introduced.
const LATER_TYPES = new Set(['en2fr', 'spell']);

export function cardId(wordId, type) {
  return `${wordId}|${type}`;
}

export function todayKey(now) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function cardsForWord(word, settings) {
  const toggles = settings?.cardTypes ?? {};
  return CARD_TYPES.filter((t) => {
    if (toggles[t] === false) return false;
    if (t === 'pic' && !word.emoji && !word.image) return false;
    return true;
  });
}

function wordsInScope(words, scope) {
  if (!scope || scope.type === 'all') return [...words].sort((a, b) => a.rank - b.rank);
  if (scope.type === 'unit') return words.filter((w) => w.unit === scope.id).sort((a, b) => a.rank - b.rank);
  if (scope.type === 'list') {
    const byId = new Map(words.map((w) => [w.id, w]));
    return scope.wordIds.map((id) => byId.get(id)).filter(Boolean);
  }
  return [];
}

function interleave(reviews, intros) {
  if (!intros.length) return reviews;
  if (!reviews.length) return intros;
  const out = [];
  const gap = (reviews.length + 1) / (intros.length + 1);
  let next = gap;
  let k = 0;
  for (let i = 0; i < reviews.length; i++) {
    while (k < intros.length && i + 1 >= Math.round(next)) {
      out.push(intros[k++]);
      next += gap;
    }
    out.push(reviews[i]);
  }
  while (k < intros.length) out.push(intros[k++]);
  return out;
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * mode 'due' (default): due cards + up to settings.newPerDay new words for this session.
 * mode 'practice': every card of every word already introduced in scope, ignoring due dates
 * and the next-day unlock, shuffled; no new words.
 * @returns {{items: Array<{kind:'intro'|'card', wordId:string, type?:string}>, newToday:number}}
 */
export function buildQueue({ words, cards, settings, progress, now, scope, mode = 'due', rng = Math.random }) {
  const today = todayKey(now);
  const scoped = wordsInScope(words, scope);
  const introduced = progress.newIntroducedDates ?? {};
  const known = progress.known ?? {};
  const usedToday = progress.newCountByDay?.[today] ?? 0;

  if (mode === 'practice') {
    const items = [];
    for (const w of scoped) {
      if (!introduced[w.id]) continue;
      for (const t of cardsForWord(w, settings)) items.push({ kind: 'card', wordId: w.id, type: t });
    }
    return { items: shuffle(items, rng), newToday: usedToday };
  }

  const reviews = [];
  for (const w of scoped) {
    const day = introduced[w.id];
    if (!day) continue;
    for (const t of cardsForWord(w, settings)) {
      if (LATER_TYPES.has(t) && day >= today) continue;
      // A missing card state (e.g. card type toggled on later) counts as due.
      const c = cards[cardId(w.id, t)];
      if (!c || c.due <= now) reviews.push({ kind: 'card', wordId: w.id, type: t });
    }
  }
  reviews.sort((a, b) => (cards[cardId(a.wordId, a.type)]?.due ?? 0) - (cards[cardId(b.wordId, b.type)]?.due ?? 0));

  // newPerDay is a per-session batch size, not a daily cap: another session brings the next batch.
  const room = Math.max(0, settings.newPerDay ?? 10);
  const intros = scoped
    .filter((w) => !introduced[w.id] && !known[w.id])
    .slice(0, room)
    .map((w) => ({ kind: 'intro', wordId: w.id }));

  return { items: interleave(reviews, intros), newToday: usedToday };
}

export function nextDue(cards, now) {
  let best = null;
  for (const c of Object.values(cards)) {
    if (c.due > now && (best === null || c.due < best)) best = c.due;
  }
  return best;
}
