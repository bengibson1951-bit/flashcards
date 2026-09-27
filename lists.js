// Paste-list parsing and dictionary matching.
import { stripAccents } from './spell.js';

const ARTICLE_RE = /^(le|la|les)\s+|^(l)['’]\s*/i;

/** Parses lines like `chien`, `chien = dog`, `le chien = dog`. */
export function parseListText(text) {
  const out = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.indexOf('=');
    let fr = eq >= 0 ? line.slice(0, eq).trim() : line;
    const en = eq >= 0 ? line.slice(eq + 1).trim() || null : null;
    let article = null;
    const m = fr.match(ARTICLE_RE);
    if (m) {
      article = m[1] ? m[1].toLowerCase() : "l'";
      fr = fr.slice(m[0].length).trim();
    }
    if (!fr) continue;
    out.push({ fr, article, en });
  }
  return out;
}

const key = (s) => stripAccents(s.toLowerCase().trim());

/** Splits parsed entries into dictionary matches and unknown words. */
export function matchWords(parsed, dictionary) {
  const exact = new Map(dictionary.map((w) => [w.fr.toLowerCase(), w]));
  const loose = new Map(dictionary.map((w) => [key(w.fr), w]));
  const matched = [];
  const seen = new Set();
  const unknown = [];
  for (const p of parsed) {
    const w = exact.get(p.fr.toLowerCase()) ?? loose.get(key(p.fr));
    if (w) {
      if (!seen.has(w.id)) {
        seen.add(w.id);
        matched.push(w);
      }
    } else if (!seen.has('custom:' + key(p.fr))) {
      seen.add('custom:' + key(p.fr));
      unknown.push(p);
    }
  }
  return { matched, unknown };
}
