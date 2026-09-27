// localStorage persistence: one JSON blob under flashcards.v1.

export const KEY = 'flashcards.v1';

export function defaultState() {
  return {
    version: 1,
    cards: {},
    customWords: [],
    lists: [],
    progress: { newIntroducedDates: {}, newCountByDay: {}, known: {} },
    settings: {
      newPerDay: 10,
      cardTypes: { pic: true, fr2en: true, en2fr: true, spell: true },
      autoAudio: true,
      lang: 'en',
    },
    stats: { streak: 0, lastStudyDay: null, reviews: 0 },
  };
}

function merge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) && v && typeof v === 'object' && !Array.isArray(v)
      ? merge(base[k], v)
      : v;
  }
  return out;
}

export function validateState(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('not an object');
  if (obj.version !== 1) throw new Error('unsupported version');
  if (typeof obj.cards !== 'object') throw new Error('missing cards');
  return merge(defaultState(), obj);
}

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return defaultState();
    return validateState(JSON.parse(raw));
  } catch (e) {
    console.warn('flashcards: could not load saved data', e);
    return defaultState();
  }
}

export function save(state, storage = globalThis.localStorage) {
  storage?.setItem(KEY, JSON.stringify(state));
}

export function exportJSON(state) {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 1);
}

export function importJSON(text) {
  const obj = JSON.parse(text);
  delete obj.exportedAt;
  return validateState(obj);
}
