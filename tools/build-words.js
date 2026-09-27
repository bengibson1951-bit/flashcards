// Emits words.json from tools/words-source.js. Run: node tools/build-words.js
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { UNITS, WORDS } from './words-source.js';
import { NO_IMAGE } from './image-prompts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function slug(s) {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const words = [];
const ids = new Set();
let rank = 1;
for (const unit of UNITS) {
  for (const [article, fr, en, emoji] of WORDS[unit.id] ?? []) {
    let id = slug(fr);
    if (ids.has(id)) id = `${id}-${slug(en)}`;
    if (ids.has(id)) throw new Error(`duplicate id ${id}`);
    ids.add(id);
    const w = { id, fr, article, en, unit: unit.id, rank: rank++ };
    // Abstract words are not pictured at all: emoji as a prompt confuses more than it helps.
    if (emoji && !NO_IMAGE.has(id)) w.emoji = emoji;
    if (existsSync(join(root, 'audio', `${id}.mp3`))) w.audio = true;
    if (existsSync(join(root, 'img', `${id}.webp`))) w.image = true;
    words.push(w);
  }
}

const out = { units: UNITS, words };
writeFileSync(join(root, 'words.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${words.length} words, ${words.filter((w) => w.audio).length} with audio, ${words.filter((w) => w.image).length} with images`);
