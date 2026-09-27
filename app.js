import { newCard, schedule, previewIntervals, formatInterval, AGAIN, HARD, GOOD, EASY, DAY } from './srs.js';
import { cardId, cardsForWord, buildQueue, todayKey, nextDue, CARD_TYPES } from './deck.js';
import { checkSpelling, ACCENT_KEYS } from './spell.js';
import { parseListText, matchWords } from './lists.js';
import { load, save, exportJSON, importJSON, defaultState } from './store.js';
import { speak, setEnabled as setAudio, displayForm, stop as stopAudio } from './speech.js';
import { t, setLang, getLang, applyStatic } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let state = load();
let dict = { units: [], words: [] };
let allWords = [];          // dictionary + custom words
let wordById = new Map();
let source = { type: 'all' };
let session = null;         // { items, index, done, newCount, correct, graded, learningWait: [] }
let pendingList = null;     // list being reviewed before save

const HERO = ['🥐', '🗼', '🐕', '🎨', '🧀', '🚲', '🌈', '🦋'];

// ---------- boot ----------
async function boot() {
  const res = await fetch('words.json');
  dict = await res.json();
  rebuildWords();
  setLang(state.settings.lang);
  setAudio(state.settings.autoAudio);
  applyStatic();
  bindNav();
  bindHome();
  bindStudy();
  bindLists();
  bindStats();
  renderHome();
  showScreen('home');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function rebuildWords() {
  allWords = [...dict.words, ...state.customWords];
  wordById = new Map(allWords.map((w) => [w.id, w]));
}

function persist() {
  save(state);
}

// ---------- navigation ----------
function showScreen(name) {
  $$('section[data-screen]').forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
  $$('.bottom-nav button').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
  document.body.classList.toggle('studying', name === 'study');
  window.scrollTo(0, 0);
  if (name === 'home') renderHome();
  if (name === 'lists') renderLists();
  if (name === 'words') renderWords();
  if (name === 'stats') renderStats();
}

function bindNav() {
  $$('.bottom-nav button').forEach((b) => b.addEventListener('click', () => showScreen(b.dataset.nav)));
  $$('.lang button').forEach((b) => {
    b.addEventListener('click', () => {
      state.settings.lang = b.dataset.lang;
      persist();
      setLang(b.dataset.lang);
      applyStatic();
      renderHome();
    });
  });
}

// ---------- home ----------
function scopeFor(src) {
  if (src.type === 'unit') return { type: 'unit', id: Number(src.id) };
  if (src.type === 'list') {
    const list = state.lists.find((l) => l.id === src.id);
    return { type: 'list', wordIds: list ? list.wordIds : [] };
  }
  return { type: 'all' };
}

function queueNow() {
  return buildQueue({
    words: allWords, cards: state.cards, settings: state.settings,
    progress: state.progress, now: Date.now(), scope: scopeFor(source),
  });
}

function bindHome() {
  $$('.lang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === getLang()));
  $$('[data-source]').forEach((b) => {
    b.addEventListener('click', () => {
      $$('[data-source]').forEach((x) => x.classList.toggle('active', x === b));
      const type = b.dataset.source;
      $('#source-unit').hidden = type !== 'unit';
      $('#source-list').hidden = type !== 'list';
      updateSource();
    });
  });
  $('#source-unit').addEventListener('change', updateSource);
  $('#source-list').addEventListener('change', updateSource);
  $('#btn-start').addEventListener('click', startSession);
}

function updateSource() {
  const type = $('[data-source].active').dataset.source;
  if (type === 'unit') source = { type, id: $('#source-unit').value };
  else if (type === 'list') source = { type, id: $('#source-list').value };
  else source = { type: 'all' };
  renderHome();
}

function renderHome() {
  $$('.lang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === getLang()));
  const unitSel = $('#source-unit');
  const sv = getLang() === 'sv';
  unitSel.innerHTML = dict.units.map((u) => `<option value="${u.id}">${u.emoji} ${sv ? u.sv : u.name}</option>`).join('');
  if (source.type === 'unit') unitSel.value = source.id;
  const listSel = $('#source-list');
  listSel.innerHTML = state.lists.length
    ? state.lists.map((l) => `<option value="${l.id}">${esc(l.name)} (${l.wordIds.length})</option>`).join('')
    : `<option value="">${t('noLists')}</option>`;
  if (source.type === 'list') listSel.value = source.id;
  if (source.type === 'unit' && !source.id) source.id = unitSel.value;
  if (source.type === 'list' && !source.id) source.id = listSel.value;

  const q = queueNow();
  const dueCards = q.items.filter((i) => i.kind === 'card').length;
  const intros = q.items.filter((i) => i.kind === 'intro').length;
  $('#home-due').textContent = dueCards;
  $('#home-new').textContent = intros;
  $('#home-streak').textContent = currentStreak();
  $('#hero-emoji').textContent = HERO[new Date().getDate() % HERO.length];
  const empty = q.items.length === 0;
  $('#btn-start').disabled = empty;
  const emptyEl = $('#home-empty');
  emptyEl.hidden = !empty;
  if (empty) {
    const nd = nextDue(state.cards, Date.now());
    emptyEl.textContent = nd ? `${t('nothingDue')} ${t('nextIn', { t: formatInterval(nd - Date.now()) })}` : t('nothingDue');
  }
}

function currentStreak() {
  const today = todayKey(Date.now());
  const yesterday = todayKey(Date.now() - DAY);
  const last = state.stats.lastStudyDay;
  if (last === today || last === yesterday) return state.stats.streak;
  return 0;
}

function touchStreak() {
  const today = todayKey(Date.now());
  if (state.stats.lastStudyDay === today) return;
  const yesterday = todayKey(Date.now() - DAY);
  state.stats.streak = state.stats.lastStudyDay === yesterday ? state.stats.streak + 1 : 1;
  state.stats.lastStudyDay = today;
}

// ---------- study ----------
function startSession() {
  const q = queueNow();
  if (!q.items.length) return;
  session = { items: q.items, index: 0, done: 0, newCount: 0, correct: 0, graded: 0, spellPrompt: 0 };
  showScreen('study');
  showCurrent();
}

function bindStudy() {
  $('#btn-quit').addEventListener('click', () => { stopAudio(); endSession(); });
  $('#btn-summary-home').addEventListener('click', () => showScreen('home'));
  $('#btn-speak').addEventListener('click', () => {
    const w = currentWord();
    if (w) speak(w, { force: true });
  });
  const keys = $('#accent-keys');
  keys.innerHTML = ACCENT_KEYS.map((k) => `<button type="button" data-k="${k}">${k}</button>`).join('');
  keys.addEventListener('click', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    const inp = $('#spell-input');
    const s = inp.selectionStart ?? inp.value.length;
    inp.value = inp.value.slice(0, s) + k + inp.value.slice(inp.selectionEnd ?? s);
    inp.focus();
    inp.setSelectionRange(s + 1, s + 1);
  });
  $('#spell-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#btn-check')?.click(); }
  });
}

function currentItem() {
  return session?.items[session.index] ?? null;
}
function currentWord() {
  const it = currentItem();
  return it ? wordById.get(it.wordId) : null;
}

/** Re-inserts learning cards that became due during the session. */
function pullDueLearning() {
  // Cards answered earlier this session that are due again (learning steps) get appended once due,
  // or shown early if nothing else is left.
  const now = Date.now();
  const pending = session.relearn ?? [];
  const ready = pending.filter((p) => state.cards[cardId(p.wordId, p.type)].due <= now);
  const notReady = pending.filter((p) => !ready.includes(p));
  session.relearn = notReady;
  session.items.push(...ready);
  if (session.index >= session.items.length && notReady.length) {
    notReady.sort((a, b) => state.cards[cardId(a.wordId, a.type)].due - state.cards[cardId(b.wordId, b.type)].due);
    session.items.push(notReady.shift());
    session.relearn = notReady;
  }
}

function showCurrent() {
  pullDueLearning();
  const it = currentItem();
  if (!it) { finishSession(); return; }
  const w = wordById.get(it.wordId);
  if (!w) { session.index++; showCurrent(); return; }

  const total = session.items.length + (session.relearn?.length ?? 0);
  $('#progress-bar').style.width = `${Math.round((session.index / total) * 100)}%`;
  $('#remaining').textContent = t('remaining', { n: total - session.index });

  const fc = $('#flashcard');
  fc.classList.remove('pop');
  void fc.offsetWidth;
  fc.classList.add('pop');
  $('#fc-back').hidden = true;
  $('#fc-back').innerHTML = '';
  $('#fc-spell').hidden = true;
  $('#btn-speak').hidden = false;
  const actions = $('#actions');
  actions.className = 'actions';
  actions.innerHTML = '';

  if (it.kind === 'intro') return showIntro(w);
  if (it.type === 'spell') return showSpell(w);
  return showRecall(w, it.type);
}

function frHtml(w) {
  return `<div class="fc-fr">${esc(displayForm(w))}</div>`;
}

/** Picture for a word: generated image if present, else emoji, else ''. */
function picHtml(w, small = false) {
  if (w.image) return `<img class="fc-img${small ? ' small' : ''}" src="img/${w.id}.webp" alt="" />`;
  if (w.emoji) return `<div class="fc-emoji${small ? ' small' : ''}">${w.emoji}</div>`;
  return '';
}
function hasPic(w) {
  return !!(w.image || w.emoji);
}

function showIntro(w) {
  $('#fc-kind').textContent = `✨ ${t('intro')}`;
  $('#fc-front').innerHTML = `
    ${picHtml(w)}
    ${frHtml(w)}
    <div class="fc-en">${esc(w.en)}</div>`;
  speak(w);
  const b = button('mint', t('gotIt'));
  b.addEventListener('click', () => {
    const today = todayKey(Date.now());
    state.progress.newIntroducedDates[w.id] = today;
    state.progress.newCountByDay[today] = (state.progress.newCountByDay[today] ?? 0) + 1;
    for (const type of cardsForWord(w, state.settings)) {
      const id = cardId(w.id, type);
      if (!state.cards[id]) state.cards[id] = newCard();
    }
    // Recognition cards go straight into this session.
    session.items.splice(session.index + 1 + Math.min(2, session.items.length - session.index - 1), 0,
      ...['pic', 'fr2en'].filter((tp) => cardsForWord(w, state.settings).includes(tp)).map((type) => ({ kind: 'card', wordId: w.id, type })));
    session.newCount++;
    touchStreak();
    persist();
    session.index++;
    showCurrent();
  });
  $('#actions').append(b);
}

function showRecall(w, type) {
  $('#fc-kind').textContent = t(`prompt.${type}`);
  let front = '';
  if (type === 'pic') front = picHtml(w);
  if (type === 'fr2en') front = frHtml(w);
  if (type === 'en2fr') front = `<div class="fc-en">${esc(w.en)}</div>`;
  $('#fc-front').innerHTML = front;
  $('#btn-speak').hidden = type !== 'fr2en';
  if (type === 'fr2en') speak(w);

  const show = button('sky', t('showAnswer'));
  show.addEventListener('click', () => {
    let back = '';
    if (type === 'pic') back = `${frHtml(w)}<div class="fc-en">${esc(w.en)}</div>`;
    if (type === 'fr2en') back = `<div class="fc-en">${esc(w.en)}</div>${picHtml(w, true)}`;
    if (type === 'en2fr') back = `${frHtml(w)}${picHtml(w, true)}`;
    $('#fc-back').innerHTML = back;
    $('#fc-back').hidden = false;
    $('#btn-speak').hidden = false;
    if (type !== 'fr2en') speak(w);
    showGradeButtons(w, type);
  });
  $('#actions').append(show);
}

function showGradeButtons(w, type) {
  const id = cardId(w.id, type);
  const card = state.cards[id] ?? newCard();
  const labels = previewIntervals(card, Date.now());
  const actions = $('#actions');
  actions.className = 'actions grades';
  actions.innerHTML = '';
  const defs = [[AGAIN, 'coral', 'again'], [HARD, 'sunny', 'hard'], [GOOD, 'mint', 'good'], [EASY, 'sky', 'easy']];
  for (const [g, color, key] of defs) {
    const b = button(color, t(key), labels[g]);
    b.addEventListener('click', () => grade(w, type, g));
    actions.append(b);
  }
}

function grade(w, type, g) {
  const id = cardId(w.id, type);
  const before = state.cards[id] ?? newCard();
  const after = schedule(before, g, Date.now());
  state.cards[id] = after;
  state.stats.reviews++;
  session.graded++;
  if (g >= GOOD) session.correct++;
  touchStreak();
  persist();
  // Still in a learning step → come back later this session.
  if (after.state === 'learning' || after.state === 'relearning') {
    session.relearn = session.relearn ?? [];
    session.relearn.push({ kind: 'card', wordId: w.id, type });
  }
  session.done++;
  session.index++;
  showCurrent();
}

function showSpell(w) {
  const prompts = [];
  if (hasPic(w)) prompts.push('pic');
  prompts.push('en', 'audio');
  const mode = prompts[session.spellPrompt++ % prompts.length];
  $('#fc-kind').textContent = mode === 'audio' ? t('prompt.audio') : t('prompt.spell');
  let front = '';
  if (mode === 'pic') front = picHtml(w);
  if (mode === 'en') front = `<div class="fc-en">${esc(w.en)}</div>`;
  if (mode === 'audio') { front = `<div class="fc-audio-only">👂</div>`; }
  $('#fc-front').innerHTML = front;
  $('#btn-speak').hidden = mode !== 'audio';
  if (mode === 'audio') speak(w, { force: true });

  const box = $('#fc-spell');
  box.hidden = false;
  const inp = $('#spell-input');
  inp.value = '';
  inp.disabled = false;
  setTimeout(() => inp.focus(), 50);

  const check = button('sky', t('check'));
  check.id = 'btn-check';
  check.addEventListener('click', () => {
    const r = checkSpelling(inp.value, w.fr);
    inp.disabled = true;
    box.hidden = true;
    const diff = r.diff.map((d) => `<span class="${d.ok ? 'ok' : 'bad'}">${esc(d.ch)}</span>`).join('');
    const yours = r.result === 'wrong' && inp.value.trim() ? `<div class="your-answer">${esc(inp.value.trim())}</div>` : '';
    $('#fc-back').innerHTML = `
      <div class="result ${r.result}">${t(r.result)}</div>
      ${yours}
      <div class="diff ${r.result}">${diff}</div>
      <div class="fc-hint">${esc(displayForm(w))} · ${esc(w.en)}</div>`;
    $('#fc-back').hidden = false;
    $('#btn-speak').hidden = false;
    speak(w);
    const next = button(r.result === 'correct' ? 'mint' : r.result === 'almost' ? 'sunny' : 'coral', t('next'));
    next.addEventListener('click', () => grade(w, 'spell', r.grade));
    const actions = $('#actions');
    actions.innerHTML = '';
    actions.append(next);
    next.focus();
  });
  $('#actions').append(check);
}

function finishSession() {
  stopAudio();
  $('#sum-cards').textContent = t('cardsDone', { n: session.done });
  $('#sum-new').textContent = t('wordsNew', { n: session.newCount });
  const pct = session.graded ? Math.round((session.correct / session.graded) * 100) : 100;
  $('#sum-acc').textContent = session.graded ? t('accuracy', { p: pct }) : '';
  session = null;
  showScreen('summary');
}

function endSession() {
  if (session && session.done + session.newCount > 0) finishSession();
  else { session = null; showScreen('home'); }
}

// ---------- lists ----------
function bindLists() {
  $('#btn-list-review').addEventListener('click', reviewList);
  $('#btn-list-cancel').addEventListener('click', () => { pendingList = null; $('#list-unknown').hidden = true; $('#list-editor').hidden = false; });
  $('#btn-list-save').addEventListener('click', saveList);
}

function reviewList() {
  const name = $('#list-name').value.trim();
  const parsed = parseListText($('#list-text').value);
  if (!parsed.length) return;
  const { matched, unknown } = matchWords(parsed, allWords);
  pendingList = { name: name || `${t('lists')} ${state.lists.length + 1}`, matched, unknown, order: parsed };
  if (!unknown.length) { saveList(); return; }
  $('#unknown-rows').innerHTML = unknown.map((u, i) => `
    <div class="unknown-row" data-i="${i}">
      <b>${esc(u.fr)}</b>
      <input class="u-en" placeholder="${t('english')}" value="${esc(u.en ?? '')}" />
      <select class="u-art">
        ${['', 'le', 'la', "l'", 'les'].map((a) => `<option value="${a}" ${a === (u.article ?? '') ? 'selected' : ''}>${a || '–'}</option>`).join('')}
      </select>
      <input class="u-emoji" placeholder="🙂" maxlength="4" />
    </div>`).join('');
  $('#list-editor').hidden = true;
  $('#list-unknown').hidden = false;
}

function saveList() {
  if (!pendingList) return;
  const customs = [];
  let missing = false;
  $$('#unknown-rows .unknown-row').forEach((row, i) => {
    const u = pendingList.unknown[i];
    const en = $('.u-en', row).value.trim();
    if (!en) { missing = true; $('.u-en', row).style.borderColor = 'var(--wrong)'; return; }
    const art = $('.u-art', row).value || null;
    const emoji = $('.u-emoji', row).value.trim();
    const id = 'custom:' + u.fr.toLowerCase().replace(/\s+/g, '-');
    const w = { id, fr: u.fr, article: art, en, unit: 0, rank: 100000 + state.customWords.length + customs.length };
    if (emoji) w.emoji = emoji;
    customs.push(w);
  });
  if (missing) return;
  for (const c of customs) {
    if (!state.customWords.some((w) => w.id === c.id)) state.customWords.push(c);
  }
  rebuildWords();
  // Keep the pasted order.
  const wordIds = [];
  for (const p of pendingList.order) {
    const m = pendingList.matched.find((w) => w.fr.toLowerCase() === p.fr.toLowerCase())
      ?? pendingList.matched.find((w) => stripLoose(w.fr) === stripLoose(p.fr))
      ?? allWords.find((w) => w.id === 'custom:' + p.fr.toLowerCase().replace(/\s+/g, '-'));
    if (m && !wordIds.includes(m.id)) wordIds.push(m.id);
  }
  state.lists.push({ id: 'list:' + Date.now(), name: pendingList.name, wordIds });
  persist();
  pendingList = null;
  $('#list-name').value = '';
  $('#list-text').value = '';
  $('#list-unknown').hidden = true;
  $('#list-editor').hidden = false;
  renderLists();
}

function stripLoose(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function renderLists() {
  const c = $('#lists-container');
  if (!state.lists.length) { c.innerHTML = `<div class="card muted">${t('noLists')}</div>`; return; }
  c.innerHTML = '';
  for (const l of state.lists) {
    const el = document.createElement('div');
    el.className = 'card list-item';
    el.innerHTML = `<div><div class="name">${esc(l.name)}</div><div class="meta">${t('wordsCount', { n: l.wordIds.length })}</div></div>
      <div class="buttons"><button class="small-btn mint">${t('study')}</button><button class="small-btn coral">🗑️</button></div>`;
    $('.mint', el).addEventListener('click', () => {
      source = { type: 'list', id: l.id };
      $$('[data-source]').forEach((x) => x.classList.toggle('active', x.dataset.source === 'list'));
      $('#source-unit').hidden = true;
      $('#source-list').hidden = false;
      showScreen('home');
    });
    $('.coral', el).addEventListener('click', () => {
      if (!confirm(t('deleteConfirm'))) return;
      state.lists = state.lists.filter((x) => x.id !== l.id);
      if (source.type === 'list' && source.id === l.id) source = { type: 'all' };
      persist();
      renderLists();
    });
    c.append(el);
  }
}

// ---------- words ----------
function wordStatus(w) {
  const types = cardsForWord(w, state.settings);
  const states = types.map((tp) => state.cards[cardId(w.id, tp)]?.state).filter(Boolean);
  if (!states.length) return 'new';
  if (states.every((s) => s === 'review')) return 'review';
  return 'learning';
}

function renderWords() {
  const c = $('#words-container');
  c.innerHTML = '';
  const sv = getLang() === 'sv';
  const groups = [...dict.units.map((u) => ({ u, words: dict.words.filter((w) => w.unit === u.id) }))];
  if (state.customWords.length) groups.push({ u: { id: 0, name: t('lists'), sv: t('lists'), emoji: '📋' }, words: state.customWords });
  for (const { u, words } of groups) {
    const head = document.createElement('button');
    head.className = 'unit-head';
    const knownN = words.filter((w) => state.progress.known[w.id] || wordStatus(w) === 'review').length;
    head.innerHTML = `<span>${u.emoji} ${esc(sv ? u.sv : u.name)}</span><span class="meta">${knownN}/${words.length}</span>`;
    const grid = document.createElement('div');
    grid.className = 'word-grid';
    grid.hidden = true;
    head.addEventListener('click', () => {
      if (grid.hidden) fillGrid(grid, words);
      grid.hidden = !grid.hidden;
    });
    c.append(head, grid);
  }
}

function fillGrid(grid, words) {
  grid.innerHTML = '';
  for (const w of words) {
    const tile = document.createElement('button');
    const st = wordStatus(w);
    tile.className = 'word-tile' + (state.progress.known[w.id] ? ' known' : '');
    tile.innerHTML = `<span class="e">${w.image ? `<img src="img/${w.id}.webp" alt="" />` : (w.emoji ?? '·')}</span><span><span class="fr">${esc(displayForm(w))}</span><span class="en">${esc(w.en)}</span></span>
      <span class="st ${st}">${state.progress.known[w.id] ? t('known') : t('state.' + st)}</span>`;
    tile.addEventListener('click', () => {
      if (state.progress.known[w.id]) delete state.progress.known[w.id];
      else state.progress.known[w.id] = true;
      persist();
      fillGrid(grid, words);
      speak(w);
    });
    grid.append(tile);
  }
}

// ---------- stats & settings ----------
function bindStats() {
  $('#set-newperday').addEventListener('change', (e) => {
    state.settings.newPerDay = Math.max(0, Math.min(30, Number(e.target.value) || 0));
    e.target.value = state.settings.newPerDay;
    persist();
  });
  $$('input[data-type]').forEach((cb) => cb.addEventListener('change', () => {
    state.settings.cardTypes[cb.dataset.type] = cb.checked;
    if (!CARD_TYPES.some((tp) => state.settings.cardTypes[tp])) { state.settings.cardTypes.fr2en = true; }
    persist();
    renderStats();
  }));
  $('#set-autoaudio').addEventListener('change', (e) => {
    state.settings.autoAudio = e.target.checked;
    setAudio(e.target.checked);
    persist();
  });
  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([exportJSON(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `french-flashcards-${todayKey(Date.now())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const next = importJSON(await f.text());
      if (!confirm(t('importConfirm'))) return;
      state = next;
      rebuildWords();
      setLang(state.settings.lang);
      setAudio(state.settings.autoAudio);
      applyStatic();
      persist();
      renderStats();
    } catch {
      alert(t('importBad'));
    }
  });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm(t('resetConfirm'))) return;
    state = defaultState();
    rebuildWords();
    persist();
    renderStats();
  });
}

function renderStats() {
  const words = allWords;
  let learned = 0;
  let learning = 0;
  for (const w of words) {
    const st = wordStatus(w);
    if (st === 'review') learned++;
    else if (st === 'learning') learning++;
  }
  $('#stat-learned').textContent = learned;
  $('#stat-learning').textContent = learning;
  $('#stat-streak').textContent = currentStreak();

  const now = Date.now();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const counts = new Array(7).fill(0);
  for (const c of Object.values(state.cards)) {
    if (c.state === 'new') continue;
    const d = Math.floor((c.due - startOfToday.getTime()) / DAY);
    if (d <= 0) counts[0]++;
    else if (d < 7) counts[d]++;
  }
  const max = Math.max(1, ...counts);
  const dayNames = getLang() === 'sv' ? ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  $('#forecast').innerHTML = counts.map((n, i) => {
    const d = new Date(startOfToday.getTime() + i * DAY);
    const label = i === 0 ? t('today') : dayNames[d.getDay()];
    return `<div class="bar"><b>${n}</b><i style="height:${Math.round((n / max) * 60)}px"></i><span>${label}</span></div>`;
  }).join('');

  $('#set-newperday').value = state.settings.newPerDay;
  $$('input[data-type]').forEach((cb) => { cb.checked = state.settings.cardTypes[cb.dataset.type] !== false; });
  $('#set-autoaudio').checked = state.settings.autoAudio;
}

// ---------- helpers ----------
function button(color, label, sub) {
  const b = document.createElement('button');
  b.className = `big-btn ${color}`;
  b.innerHTML = esc(label) + (sub ? `<small>${esc(sub)}</small>` : '');
  return b;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

boot();
