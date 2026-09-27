# French Flashcards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Anki-style French vocabulary PWA described in `docs/superpowers/specs/2026-09-27-french-flashcards-design.md`.

**Architecture:** Static PWA, no build step. Pure-logic modules (`srs.js`, `deck.js`, `spell.js`, `lists.js`) are ES modules tested with `node:test`; `app.js` wires them to the DOM; `store.js` persists one JSON blob in localStorage. Starter-word audio is pre-generated as MP3 (Replicate TTS) under `audio/`, with `speechSynthesis` fallback for custom words.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules), node:test, `npx serve` for preview (port 4329), GitHub Pages.

## Global Constraints

- No build step; every file served as-is.
- All logic modules are pure and importable from Node (no DOM access).
- Storage key `flashcards.v1`, single JSON blob.
- Service worker cache name `flashcards-v1`; bump on every shipped change. Audio files are cached lazily, not precached.
- Cards show the article with the noun; spelling accepts with or without article; accent-only errors grade Hard.
- Grades: 0=Again, 1=Hard, 2=Good, 3=Easy.
- UI strings go through `i18n.js` (EN default, SV toggle).
- Commit after each task with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: Scaffold + scheduler (`srs.js`)

**Files:** Create `package.json` (`"type":"module"`, `"test":"node --test tests/"`), `srs.js`, `tests/srs.test.js`, `.gitignore` (`node_modules`).

**Produces:**
- `newCard() → {state:'new', step:0, ease:2.5, interval:0, due:0, reps:0, lapses:0}`
- `schedule(card, grade, now) → card'` (pure, returns new object)
- `previewIntervals(card, now) → [labelAgain, labelHard, labelGood, labelEasy]`
- `formatInterval(ms) → "<1m" | "10m" | "1d" | "4d" | "2mo" | "1y"`
- Constants `LEARNING_STEPS = [60e3, 600e3]`, `GRADUATE_DAYS=1`, `EASY_DAYS=4`.

**Tests (node:test):** new+Good → learning step 1, due now+10m; learning last step + Good → review, interval 1d; new + Easy → review 4d; review 10d + Good (ease 2.5) → 25d; review + Again → relearning, lapses+1, ease 2.3, interval max(1, 5d); review + Hard → ×1.2, ease 2.35; ease never below 1.3; Good/Easy interval ≥ previous+1; `previewIntervals` labels for a new card are `["<1m","<1m"|"5m","10m","4d"]`. Fuzz: seedable via optional `rng` param, default deterministic (`() => 0.5`) for tests.

- [ ] Write tests → run (fail) → implement → run (pass) → commit `feat: scaffold project and SM-2 scheduler`.

### Task 2: Spelling checker (`spell.js`)

**Files:** `spell.js`, `tests/spell.test.js`.

**Produces:**
- `normalise(s) → string` (trim, lower, collapse spaces, strip leading `le |la |l'|les |un |une `)
- `stripAccents(s)`
- `checkSpelling(answer, target) → {result:'correct'|'almost'|'wrong', grade:2|1|0, diff:[{ch, ok}]}` — `diff` is char-by-char against normalised target using a simple LCS alignment; for `almost`, marks accent positions.
- `ACCENT_KEYS = ['é','è','ê','à','â','ç','ô','î','û','ë','ï','ù','œ']`

**Tests:** `"le chien"` vs target `chien` → correct; `"Chien "` → correct; `"ecole"` vs `école` → almost, grade 1; `"chat"` vs `chien` → wrong, grade 0, diff has `ok:false` entries; `"l'eau"` vs `eau` → correct.

- [ ] TDD cycle → commit `feat: spelling checker with accent leniency`.

### Task 3: List parser (`lists.js`)

**Files:** `lists.js`, `tests/lists.test.js`.

**Produces:**
- `parseListText(text) → [{fr, article|null, en|null}]` (lines `chien`, `chien = dog`, `le chien = dog`; blank lines ignored)
- `matchWords(parsed, dictionary) → {matched:[word], unknown:[{fr, article, en}]}` — exact `fr` match first, then accent-insensitive lower-case.

**Tests:** three-line input parses; `le chien = dog` → article `le`, fr `chien`; `ecole` matches dictionary `école`; unknown word returned in `unknown`.

- [ ] TDD cycle → commit `feat: paste-list parser and dictionary matching`.

### Task 4: Deck building + daily queue (`deck.js`)

**Files:** `deck.js`, `tests/deck.test.js`.

**Produces:**
- `CARD_TYPES = ['pic','fr2en','en2fr','spell']`
- `cardId(wordId, type) → "wordId|type"`
- `cardsForWord(word, settings) → [type]` (no `pic` without emoji; honours `settings.cardTypes` toggles)
- `buildQueue({words, cards, settings, progress, now, scope}) → {items:[{kind:'intro'|'card', wordId, type?}], newToday}` where `progress = {newIntroducedDates: {wordId: dateStr}, newCountByDay: {dateStr: n}, known: {wordId:true}}`, `scope = {type:'all'|'unit'|'list', id?}`.
  - Due = card.due ≤ now among `learning|relearning|review`; new cards for a word are included only if the word was introduced (`newIntroducedDates[wordId]` set). `en2fr`/`spell` cards are eligible only if introduced date < today's date string (sibling unlock).
  - Intro items: words in scope, not known, not introduced, in `rank` order (list scope: list order), up to `settings.newPerDay − newCountByDay[today]`.
  - Intro items spread evenly among review items.
- `todayKey(now) → "YYYY-MM-DD"` (local).
- `nextDue(cards, now)` → earliest future due ms or null.

**Tests:** word without emoji yields 3 types; toggling `spell` off removes it; queue limits intros to newPerDay minus already introduced today; `en2fr` excluded on introduction day, included next day; unit scope filters words; intros interleaved (not all at index 0).

- [ ] TDD cycle → commit `feat: deck building and daily queue`.

### Task 5: Starter dictionary (`words.json`) + validator

**Files:** `words.json`, `tools/validate-words.js`, add `"validate": "node tools/validate-words.js"` script.

- ~450 words across 12 units (Greetings & basics, Family, Animals, Food & drink, Colours, Numbers 1–20, Body, Home, Clothes, School, Weather & time, Common verbs & adjectives). Fields `id, fr, article, en, emoji?, unit, rank`. Articles `le|la|l'|les|null`. Emoji only where unambiguous.
- Validator: unique ids, unique ranks, unit 1–12, article valid, `fr`/`en` non-empty, prints count per unit. Exit 1 on error.

- [ ] Write words.json → run validator (pass) → commit `feat: starter dictionary (~450 words)`.

### Task 6: Audio files via Replicate + `speech.js`

**Files:** `tools/gen-audio.md` (how the files were made), `audio/<id>.mp3` for every starter word, `speech.js`.

- Use Replicate MCP: pick a TTS model with French support (e.g. a multilingual model such as `minimax/speech-02-turbo` or `jaaari/kokoro-82b` fr voice; check `search`). Generate the display form (`article + fr`) per word, download to `audio/<id>.mp3`. Batch and track failures; regenerate failures. Record model + voice in `tools/gen-audio.md`.
- `speech.js`: `speak(word, {auto})` → if `audio/<id>.mp3` exists (word has `audio:true`, set at generation into words.json), play `<audio>`; else `speechSynthesis` with `fr-FR` voice; `hasVoice()`; `setEnabled(bool)`.

- [ ] Generate, verify count == word count, commit `feat: pre-generated French audio and speech wrapper`.

### Task 7: Store + i18n + app shell

**Files:** `store.js`, `i18n.js`, `index.html`, `style.css`, `app.js`, `manifest.json`, `icons/icon-192.png`, `icons/icon-512.png`, `sw.js`, parent `.claude/launch.json` entry `flashcards` (port 4329).

- `store.js`: `load() → state` (default shape: `{version:1, cards:{}, customWords:[], lists:[], progress:{newIntroducedDates:{},newCountByDay:{},known:{}}, settings:{newPerDay:10, cardTypes:{pic:true,fr2en:true,en2fr:true,spell:true}, autoAudio:true, lang:'en'}, stats:{streak:0,lastStudyDay:null,reviews:0}}`), `save(state)`, `exportJSON(state) → string`, `importJSON(string) → state|throws`.
- `i18n.js`: `t(key)`, `setLang`, EN + SV strings for all UI text.
- Screens: Home, Study, Lists, Words, Stats/Settings. Bottom nav. Playful style (rounded cards, big emoji, blue/yellow palette), matches hangman/mathsprint feel.
- Study flow: intro card ("Got it 👍") → sets `newIntroducedDates`, increments `newCountByDay`, creates card states via `newCard()`. Graded cards: front → "Show answer" → back + 4 grade buttons labelled by `previewIntervals`. Spelling card: input + accent keys + Check → result view (✅/🟠/❌ + diff) → Next, auto-grade via `schedule`. Auto-audio on French reveal; 🔊 replays. Session summary at end. Learning cards re-queued when due; if queue empty but learning cards pending, show next early.
- Lists screen: textarea paste → review unknown words (en required) → save; study list; delete.
- Words screen: units with emoji, tap to toggle "known", progress badge (new/learning/review).
- Stats: learned count (review-state cards ≥1), 7-day forecast, streak; settings controls; export (download JSON) / import (file input, confirm overwrite).
- `sw.js`: precache shell + words.json; runtime cache-first for `audio/`.

- [ ] Build → preview on 4329 → check console clean, full flow works → commit `feat: app UI, storage, PWA shell`.

### Task 8: Verification + README

- Run `npm test`, `npm run validate`.
- Browser: intro → grades → spelling states (correct/almost/wrong) → audio plays → list paste with unknown word → export/import → SV toggle → mobile viewport.
- `README.md`: what it is, how to run, how to deploy, how audio was generated.
- Commit `docs: README`.
