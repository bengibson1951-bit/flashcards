# French Flashcards

Anki-style French vocabulary app for kids: picture + French + English intro cards, four practice directions (picture → French, French → English, English → French, spelling), automatic French audio, and SM-2 spaced repetition. Static PWA — no build step, works offline, progress stored on the device.

## Run locally

```bash
npx -y serve . -l 4329
```

Then open http://localhost:4329. (From the parent folder the `flashcards` entry in `.claude/launch.json` does the same.)

## Tests

```bash
npm test
npm run validate
```

## Words

`tools/words-source.js` is the source of truth (12 units, ~500 words). Edit it, then:

```bash
node tools/build-words.js
```

## Audio

Starter-word audio is pre-generated with MiniMax `speech-02-turbo` on Replicate (voice `French_Female_News Anchor`, French language boost, speed 0.9):

```bash
REPLICATE_API_TOKEN=r8_xxx node tools/gen-audio.js
node tools/build-words.js   # marks words that have an mp3 with audio: true
```

Words without an mp3 (and words you add in *My lists*) fall back to the browser's built-in French voice.

## Deploy

Push `main` to GitHub and enable Pages from the `main` branch. Bump `CACHE` in `sw.js` whenever you ship changes so installed copies refresh.
