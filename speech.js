// French audio: pre-generated MP3 when available, speechSynthesis fallback.

let enabled = true;
let current = null;
let frVoice = null;

function pickVoice() {
  if (!('speechSynthesis' in globalThis)) return null;
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => /^fr[-_]FR/i.test(v.lang)) ||
    voices.find((v) => /^fr/i.test(v.lang)) ||
    null
  );
}

if ('speechSynthesis' in globalThis) {
  frVoice = pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', () => { frVoice = pickVoice(); });
}

export function setEnabled(on) {
  enabled = !!on;
  if (!enabled) stop();
}

export function hasVoice() {
  return !!frVoice || 'speechSynthesis' in globalThis;
}

export function stop() {
  if (current) { current.pause(); current = null; }
  if ('speechSynthesis' in globalThis) speechSynthesis.cancel();
}

/** Speaks a word: uses audio/<id>.mp3 if word.audio, else synthesis. */
export function speak(word, { force = false } = {}) {
  if (!enabled && !force) return;
  stop();
  const text = displayForm(word);
  if (word.audio) {
    const a = new Audio(`audio/${word.id}.mp3`);
    current = a;
    a.play().catch(() => synth(text));
    return;
  }
  synth(text);
}

function synth(text) {
  if (!('speechSynthesis' in globalThis)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  if (frVoice) u.voice = frVoice;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

export function displayForm(word) {
  if (!word.article) return word.fr;
  return word.article.endsWith("'") ? word.article + word.fr : `${word.article} ${word.fr}`;
}
