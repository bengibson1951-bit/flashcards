// Generates audio/<id>.mp3 for every word in words.json via Replicate (MiniMax speech-02-turbo).
// Usage: REPLICATE_API_TOKEN=r8_... node tools/gen-audio.js [--only id1,id2] [--concurrency 4]
// Skips words whose mp3 already exists. Re-run tools/build-words.js afterwards to set `audio: true`.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.REPLICATE_API_TOKEN;
if (!token) { console.error('Set REPLICATE_API_TOKEN'); process.exit(1); }

const MODEL = 'minimax/speech-02-turbo';
const VOICE = 'French_Female_News Anchor';

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const concurrency = args.includes('--concurrency') ? Number(args[args.indexOf('--concurrency') + 1]) : 4;

const { words } = JSON.parse(readFileSync(join(root, 'words.json'), 'utf8'));
mkdirSync(join(root, 'audio'), { recursive: true });

const display = (w) => (!w.article ? w.fr : w.article.endsWith("'") ? w.article + w.fr : `${w.article} ${w.fr}`);

const todo = words.filter((w) => (!only || only.has(w.id)) && !existsSync(join(root, 'audio', `${w.id}.mp3`)));
console.log(`${todo.length} words to generate`);

const failures = [];
async function one(w) {
  const text = display(w);
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait=60' },
    body: JSON.stringify({ input: { text, voice_id: VOICE, language_boost: 'French', speed: 0.9 } }),
  });
  let pred = await res.json();
  while (pred.status === 'starting' || pred.status === 'processing') {
    await new Promise((r) => setTimeout(r, 1500));
    pred = await (await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${token}` } })).json();
  }
  if (pred.status !== 'succeeded' || !pred.output) throw new Error(pred.error ?? pred.status);
  const mp3 = await (await fetch(pred.output)).arrayBuffer();
  writeFileSync(join(root, 'audio', `${w.id}.mp3`), Buffer.from(mp3));
  console.log(`✓ ${w.id} (${text})`);
}

let i = 0;
async function worker() {
  while (i < todo.length) {
    const w = todo[i++];
    try { await one(w); } catch (e) { failures.push(w.id); console.error(`✗ ${w.id}: ${e.message}`); }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
if (failures.length) console.log(`\nFailed: ${failures.join(',')}\nRe-run with --only ${failures.join(',')}`);
else console.log('\nAll done. Now run: node tools/build-words.js');
