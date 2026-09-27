# French Flashcards — Design

Date: 2026-09-27
Status: Draft for review

## Purpose

A kid-friendly, Anki-style spaced-repetition flashcard app to help Ben's daughter (~10, complete beginner) learn French vocabulary. It recreates Ben's Anki method: each word is learned via picture, French and English, then practised in several directions, plus a spelling mode — all scheduled with spaced repetition.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Platform | Static PWA (no build step), same pattern as `hangman` / `mathsprint`. Offline, installable, GitHub Pages. |
| Pictures | Emoji only. Words without a good emoji have no picture (picture card skipped). |
| Audio | Pre-generated MP3 per starter word (Replicate TTS) in `audio/`; browser `speechSynthesis` `fr-FR` fallback for custom words. French is spoken **automatically** whenever it is shown; 🔊 button replays. |
| Grading | Anki-style self-grading: **Again / Hard / Good / Easy**, each button shows its next interval. |
| Level | Complete beginner; playful look for ~10-year-old. |
| Articles & accents | Cards show the article (*le chien*). Spelling accepts the word with or without the article; accent-only mistakes = "almost" (graded Hard). |
| UI language | English, with an EN/SV toggle (like Math Sprint). |
| Storage | localStorage on the device, plus JSON export/import backup. |

## Words & lists

### Starter dictionary (`words.json`)

~400–500 curated beginner words, each entry:

```json
{ "id": "chien", "fr": "chien", "article": "le", "en": "dog", "emoji": "🐕", "unit": 3, "rank": 41 }
```

- `article`: one of `le`, `la`, `l'`, `les`; `null` for non-nouns (verbs, adjectives, greetings, numbers, colours).
- `emoji`: optional; omitted when no clear emoji exists.
- `rank`: overall usefulness order within the recommended path (1 = learn first).
- Display form = `article + fr` (with `l'` joined without space, e.g. *l'eau*).

Units, in recommended order:
1. Greetings & basics (bonjour, merci, oui, non…)
2. Family
3. Animals
4. Food & drink
5. Colours
6. Numbers 1–20
7. Body
8. Home
9. Clothes
10. School
11. Weather & time
12. Common verbs & adjectives

### Recommended path

By default new words are introduced in `rank` order — "the most useful words first". Words marked "already known" in the Words screen are skipped (their cards are not generated).

### My lists

- Ben creates a named list by pasting lines. Each line is either `chien` or `chien = dog` (also accepts `le chien = dog`).
- Parser: trim; split on first `=`; strip a leading article (`le `, `la `, `l'`, `les `) and remember it.
- Words found in the dictionary (matched on `fr`, case/accent-sensitive then accent-insensitive) inherit English/article/emoji.
- Unknown words: a review step before saving lets Ben fill in English (required), article and emoji (optional). They are saved as custom words (`id` prefixed `custom:`).
- A study session can be scoped to one list; only that list's words are introduced and reviewed.

## Cards

Each word generates up to four **graded cards**, each scheduled independently:

| Card | Front | Back |
|---|---|---|
| `pic` Picture → French | emoji (large) | French (spoken) + English |
| `fr2en` French → English | French (spoken automatically) | English + emoji |
| `en2fr` English → French | English | French (spoken) + emoji |
| `spell` Spelling | rotating prompt: emoji / English / audio-only (🔊) | typed answer checked |

- Words without an emoji get no `pic` card, and the spelling prompt never uses emoji for them.
- Settings let Ben toggle each card type on/off.

### Intro card (ungraded)

When a word is new, it is first shown as an **intro card**: emoji + French with article + English together, French spoken automatically. Single "Got it 👍" button, no grading. After the intro, the word's `pic` and `fr2en` cards enter learning in the same session; `en2fr` and `spell` unlock the next day (sibling spacing, so production is tested after recognition).

### Spelling check

Comparison normalises: trim, lower-case, collapse spaces, optional leading article stripped from both sides.

- Exact match (accents correct) → ✅ graded **Good** (she may tap Easy instead).
- Matches only when accents are removed → 🟠 "Almost!" shows correct spelling with the accented letters highlighted → graded **Hard**.
- Otherwise → ❌ letter-by-letter diff of her answer vs correct → graded **Again**.
- On-screen accent buttons: é è ê à â ç ô î û ë ï ù œ. Word is spoken after the answer is revealed.
- Spelling cards are auto-graded (no self-grade buttons); she taps "Next".

## Spaced repetition (`srs.js`)

SM-2 / Anki-style scheduler, pure functions, time passed in (testable).

Card state: `{ state: 'new'|'learning'|'review'|'relearning', step, ease, interval (days), due (ms), reps, lapses }`.

- **Learning steps**: 1 min, 10 min. Again → step 0; Good → next step; after last step graduate with interval 1 day. Easy in learning → graduate at 4 days. Hard → repeat current step (delay = avg of current and next step).
- **Review**: Again → lapse, ease −0.20, relearning step 10 min, then new interval = max(1, interval × 0.5). Hard → interval × 1.2, ease −0.15. Good → interval × ease. Easy → interval × ease × 1.3, ease +0.15.
- Ease starts 2.5, minimum 1.3. Intervals rounded to days, at least previous+1 for Good/Easy. Small fuzz (±5%) for intervals > 2 days.
- Button labels show the resulting interval ("<1m", "10m", "1d", "4d", "2mo").

### Daily session

- Queue = due learning cards + due review cards + up to **N new words/day** (default 10, setting 0–30).
- New-word count resets at local midnight. Learning cards due within the session are re-inserted when their time comes; if nothing else is left, the next learning card is shown early.
- Order: intro cards spread through reviews (not all at the start); learning cards take priority once due.
- Session ends with a summary (cards done, new words, accuracy) and "come back tomorrow" when empty.

## Screens

- **Home**: due today, new today, streak 🔥, big "Start" button; source picker: Recommended path / a unit / one of My lists.
- **Study**: card view, flip ("Show answer"), grade buttons with intervals, 🔊, progress bar.
- **My lists**: create (paste), edit, delete, study.
- **Words**: browse dictionary by unit with emoji; mark "already known"; see per-word progress.
- **Stats**: words learned (graduated), review forecast for next 7 days, streak; Settings (new/day, card types on/off, auto-audio on/off, EN/SV); Backup export/import (JSON file).

## Architecture

Folder `Bright Blue Project - Event/flashcards/` (own git repo, `main`):

- `index.html`, `style.css`, `manifest.json`, `icons/`, `sw.js` (cache-first `flashcards-v1`, bump on change)
- `words.json` — starter dictionary
- `srs.js` — pure scheduler (card state transitions, interval labels)
- `deck.js` — pure: builds cards from words, builds the daily queue, sibling unlocking
- `spell.js` — pure: normalisation, accent-insensitive compare, diff
- `lists.js` — pure: paste parser, dictionary matching
- `store.js` — localStorage load/save, export/import, schema version
- `speech.js` — `speechSynthesis` wrapper (pick `fr-FR` voice, graceful no-op if unavailable)
- `i18n.js`, `app.js` — UI
- `tests/*.test.js` — node:test for srs, deck, spell, lists
- `tools/validate-words.js` — checks words.json (unique ids, units 1–12, ranks unique, articles valid)

Storage keys: `flashcards.v1` (single JSON blob: cards, custom words, lists, known words, settings, stats/streak).

## Error handling

- No French voice available → hide 🔊, show a one-time note; everything else works.
- Corrupt localStorage / bad import → refuse import with a message; never overwrite existing data without confirmation.
- Unknown list words without English → cannot save until filled in.

## Testing

- Unit tests (node:test) for scheduler transitions and intervals, queue building and daily new-card limit, sibling unlocking, spelling compare/diff, list parsing.
- Word-data validator.
- Manual browser check via preview (port 4329): intro → pic/fr2en → next-day unlock (by faking time), spelling states, audio, lists, backup.

## Out of scope (YAGNI)

Cloud sync, accounts, user-uploaded images, AI images, sentences/grammar lessons, speech recognition.

## Deployment

Preview server entry `flashcards` on port 4329 in the parent `.claude/launch.json`. Publish as GitHub repo `bengibson1951-bit/flashcards` with Pages from `main` (only when Ben asks).
