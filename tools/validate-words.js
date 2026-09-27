// Validates words.json. Exit 1 on any error.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { units, words } = JSON.parse(readFileSync(join(root, 'words.json'), 'utf8'));

const errors = [];
const ids = new Set();
const ranks = new Set();
const unitIds = new Set(units.map((u) => u.id));
const ARTICLES = new Set(['le', 'la', "l'", 'les', null]);
const perUnit = {};

for (const w of words) {
  if (ids.has(w.id)) errors.push(`duplicate id ${w.id}`);
  ids.add(w.id);
  if (ranks.has(w.rank)) errors.push(`duplicate rank ${w.rank} (${w.id})`);
  ranks.add(w.rank);
  if (!unitIds.has(w.unit)) errors.push(`bad unit ${w.unit} (${w.id})`);
  if (!ARTICLES.has(w.article)) errors.push(`bad article ${w.article} (${w.id})`);
  if (!w.fr || !w.en) errors.push(`missing fr/en (${w.id})`);
  if ('emoji' in w && !w.emoji) errors.push(`empty emoji (${w.id})`);
  perUnit[w.unit] = (perUnit[w.unit] ?? 0) + 1;
}

for (const u of units) console.log(`${String(u.id).padStart(2)} ${u.name.padEnd(26)} ${perUnit[u.id] ?? 0}`);
console.log(`total ${words.length}, with emoji ${words.filter((w) => w.emoji).length}, with audio ${words.filter((w) => w.audio).length}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
