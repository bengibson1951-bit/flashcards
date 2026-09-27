// Spelling checker: lenient on articles, "almost" on accent-only mistakes.

export const ACCENT_KEYS = ['é', 'è', 'ê', 'à', 'â', 'ç', 'ô', 'î', 'û', 'ë', 'ï', 'ù', 'œ'];

const ARTICLE_RE = /^(le|la|les|un|une|des)\s+|^l['’]\s*/i;

export function normalise(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/’/g, "'")
    .replace(ARTICLE_RE, '')
    .trim();
}

export function stripAccents(s) {
  return s
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Per-character diff of target against answer using LCS alignment.
// Returns one entry per target char: { ch, ok }.
function alignDiff(answer, target) {
  const a = [...answer];
  const t = [...target];
  const n = a.length;
  const m = t.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === t[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (j < m) {
    if (i < n && a[i] === t[j]) {
      out.push({ ch: t[j], ok: true });
      i++;
      j++;
    } else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) {
      i++; // extra char in answer
    } else {
      out.push({ ch: t[j], ok: false });
      j++;
    }
  }
  return out;
}

/**
 * @returns {{result:'correct'|'almost'|'wrong', grade:0|1|2, diff:{ch:string, ok:boolean}[]}}
 */
export function checkSpelling(answer, target) {
  const a = normalise(answer);
  const t = normalise(target);
  const tChars = [...t];
  if (a === t) {
    return { result: 'correct', grade: 2, diff: tChars.map((ch) => ({ ch, ok: true })) };
  }
  if (a && stripAccents(a) === stripAccents(t)) {
    const aChars = [...a];
    // Same length after stripping only if no œ/æ involved; fall back to alignment otherwise.
    const diff = aChars.length === tChars.length
      ? tChars.map((ch, k) => ({ ch, ok: ch === aChars[k] }))
      : alignDiff(a, t);
    return { result: 'almost', grade: 1, diff };
  }
  return { result: 'wrong', grade: 0, diff: alignDiff(a, t) };
}
