// Generates img/<id>.webp (200px) for every picturable word via Replicate flux-schnell.
// Usage: REPLICATE_API_TOKEN=r8_... node tools/gen-images.js [--only id1,id2] [--concurrency 4] [--force]
// Skips words in NO_IMAGE and words whose webp already exists (unless --force).
// Re-run tools/build-words.js afterwards to set `image: true`.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { STYLE, NO_IMAGE, OVERRIDES } from './image-prompts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.REPLICATE_API_TOKEN;
if (!token) { console.error('Set REPLICATE_API_TOKEN'); process.exit(1); }

const MODEL = 'black-forest-labs/flux-schnell';
const SIZE = 200;
const PYTHON = process.env.PYTHON ?? 'C:/Users/ben/AppData/Local/Python/pythoncore-3.14-64/python.exe';

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const concurrency = args.includes('--concurrency') ? Number(args[args.indexOf('--concurrency') + 1]) : 4;
const force = args.includes('--force');

const { words } = JSON.parse(readFileSync(join(root, 'words.json'), 'utf8'));
mkdirSync(join(root, 'img'), { recursive: true });
const raw = join(root, 'img', '_raw');
mkdirSync(raw, { recursive: true });

export function subjectFor(w) {
  if (OVERRIDES[w.id]) return OVERRIDES[w.id];
  return w.en.split(' / ')[0].replace(/\s*\(.*?\)\s*/g, '').trim();
}

const todo = words.filter((w) =>
  (!only || only.has(w.id)) && !NO_IMAGE.has(w.id) && (force || !existsSync(join(root, 'img', `${w.id}.webp`))));
console.log(`${todo.length} images to generate`);

const failures = [];
async function one(w) {
  const prompt = `${subjectFor(w)}, ${STYLE}`;
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait=60' },
    body: JSON.stringify({ input: { prompt, aspect_ratio: '1:1', megapixels: '0.25', output_format: 'webp', output_quality: 80, num_outputs: 1, disable_safety_checker: true } }),
  });
  let pred = await res.json();
  while (pred.status === 'starting' || pred.status === 'processing') {
    await new Promise((r) => setTimeout(r, 1500));
    pred = await (await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${token}` } })).json();
  }
  if (pred.status !== 'succeeded' || !pred.output?.[0]) throw new Error(pred.error ?? pred.status);
  const buf = Buffer.from(await (await fetch(pred.output[0])).arrayBuffer());
  const rawPath = join(raw, `${w.id}.webp`);
  writeFileSync(rawPath, buf);
  execFileSync(PYTHON, ['-c',
    `from PIL import Image; im=Image.open(r'${rawPath}').convert('RGB'); im.resize((${SIZE},${SIZE}), Image.LANCZOS).save(r'${join(root, 'img', `${w.id}.webp`)}', quality=78)`]);
  console.log(`✓ ${w.id} — ${subjectFor(w)}`);
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
