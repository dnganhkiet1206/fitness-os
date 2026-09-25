/**
 * Câu đếm tiếng Anh có dạng số ít (#67).
 *
 * ── lỗi nó sinh ra để sửa ──
 *
 * Chuỗi tiếng Anh chỉ có MỘT dạng, nên ở n = 1 sai ngữ pháp: "1 days left",
 * "Claim 1 coins", "and 1 others liked your post". Tiếng Việt không có số nhiều
 * nên không bị — và `live.mjs` chạy tiếng Anh theo mặc định, nên chính bộ chạy
 * cũng đọc những câu ấy mỗi lượt mà không ai thấy.
 *
 * ── luật ──
 *
 *   1. Trong khối `en` của `src/lib/native-strings.ts` và `src/lib/i18n.ts`, một
 *      `{x}` đứng ngay trước một danh từ số nhiều ("{n} days", "{v} reps", kể cả
 *      "{n} more days") phải có bộ chọn cho CHÍNH `x`: `{x:day|days}`. Ngoại lệ
 *      ghi trong `EXEMPT`, mỗi cái một lý do.
 *   2. Một khoá mà chuỗi tiếng Anh có bộ chọn KHÔNG được đọc bằng `.replace(`
 *      ở bất kỳ đâu trong `src/`: `.replace('{n}', …)` để bộ chọn lọt ra màn
 *      nguyên văn. Đọc bằng `fillCopy` (`src/lib/copy-fill.ts`).
 *   3. `fillCopy` chọn đúng dạng — chạy hàm THẬT trên các ca biên.
 *   4. Lượt quét hẹp của `live.mjs` vẫn nhận ra chuỗi có bộ chọn, ĐÃ ĐIỀN, là
 *      chữ của app: nó so chữ trên màn với mẫu sinh từ `native-strings.ts`, và
 *      một mẫu coi `{n:coin|coins}` là chữ cố định thì "Claim 100 coins" bị cắt
 *      thành chuyện của người dùng — im lặng.
 *
 * Bộ chọn chỉ nằm trong tiếng Anh; câu tiếng Việt giữ nguyên. Một bộ chọn lọt
 * ra màn (khoá thiếu biến, hay một lời gọi `.replace` luật 2 không thấy) thì
 * `live.mjs` đỏ: `BAD_TEXT` coi mọi `{…}` còn trên màn là chữ lọt ra ngoài.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = [
  { file: 'src/lib/native-strings.ts', start: /^const en = \{$/m, end: /^const vi: typeof en = \{$/m },
  { file: 'src/lib/i18n.ts', start: /^const en: Translations = \{$/m, end: /^const translations: /m },
];

/* Chữ tận cùng bằng -s mà không phải danh từ số nhiều. */
const NOT_PLURAL = new Set(['is', 'was', 'has', 'this', 'its', 'plus', 'less', 'across', 'us', 'yes', 'bonus', 'lbs', 'kcals']);
const IRREGULAR = new Set(['people', 'children']);
/* Chữ có thể chen giữa số và danh từ: "{n} more days", "{n} other posts". */
const BETWEEN = new Set(['more', 'new', 'other', 'extra', 'total', 'straight', 'full', 'logged', 'past']);
/*
  Ngoại lệ — mỗi cái một lý do. Một chuỗi ở đây KHÔNG được sửa bằng bộ chọn vì
  giá trị không bao giờ là 1, hoặc vì chữ sau số không phải danh từ đếm.
*/
const EXEMPT = new Map([
  ['nPrTitleMany', 'chỉ dùng khi records.length > 1 (record-celebration.tsx); một kỷ lục là câu khác hẳn — nPrTitle "New personal record"'],
  ['nDiaryEntries', 'chỉ hiện khi g.entries > 1 (today-meals.tsx: "only worth saying when breakfast was logged more than once")'],
  ['nFreezeSavedPlural', 'chỉ dùng khi freezeUsed ≠ 1 (mascot-room.tsx); số ít là câu khác hẳn — nFreezeSaved "A freeze covered {n} day"'],
]);

const isPluralNoun = (w) => IRREGULAR.has(w) || (w.length >= 3 && /s$/.test(w) && !/ss$/.test(w) && !NOT_PLURAL.has(w));

/** Các chuỗi tiếng Anh của một tệp: [{ key, text, line }]. */
export function englishCopy(src, start, end) {
  const a = src.search(start);
  const b = src.search(end);
  if (a < 0 || b < 0 || b <= a) throw new Error('không tìm thấy khối en');
  const block = src.slice(a, b);
  const base = src.slice(0, a).split('\n').length - 1;
  const out = [];
  for (const m of block.matchAll(/^\s+(\w+):\s*\n?\s*(['"])((?:\\.|(?!\2)[^\\\n])*)\2/gm)) {
    out.push({ key: m[1], text: m[3].replace(/\\(.)/g, '$1'), line: base + block.slice(0, m.index).split('\n').length });
  }
  return out;
}

/** Các `{x} <danh từ số nhiều>` mà `x` chưa có bộ chọn. */
export function missingPlurals(text) {
  const selected = new Set([...text.matchAll(/\{(\w+):[^|{}]*\|[^{}]*\}/g)].map((m) => m[1]));
  const bare = text.replace(/\{\w+:[^|{}]*\|[^{}]*\}/g, ' ');
  const out = [];
  for (const m of bare.matchAll(/\{(\w+)\}\s+([A-Za-z]+)(?:\s+([A-Za-z]+))?/g)) {
    const [, x, w1, w2] = m;
    const noun = isPluralNoun(w1.toLowerCase()) ? w1 : BETWEEN.has(w1.toLowerCase()) && w2 && isPluralNoun(w2.toLowerCase()) ? w2 : null;
    if (noun && !selected.has(x)) out.push(`{${x}} ${noun}`);
  }
  return out;
}

const problems = [];
let fill = null;

/* ── 3 trước: hàm thật ──────────────────────────────────────────────────── */
{
  const dir = mkdtempSync(path.join(tmpdir(), 'plural-'));
  try {
    writeFileSync(path.join(dir, 'copy-fill.ts'), readFileSync(path.join(NATIVE, 'src/lib/copy-fill.ts'), 'utf8'));
    try {
      execFileSync('npx', ['tsc', 'copy-fill.ts', '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { /* bản phát ra mới là thứ cần */ }
    const { fillCopy } = createRequire(import.meta.url)(path.join(dir, 'copy-fill.js'));
    if (typeof fillCopy !== 'function') throw new Error('không nạp được fillCopy thật');
    fill = fillCopy;
    const FILL_CASES = [
      ['{n} {n:day|days} left', { n: 1 }, '1 day left'],
      ['{n} {n:day|days} left', { n: 3 }, '3 days left'],
      ['{n} {n:day|days} left', { n: 0 }, '0 days left'],
      ['{n} {n:day|days} left', { n: 1.5 }, '1.5 days left'],
      ['{n} {n:coin|coins}', { n: '+1' }, '+1 coin'],
      ['{n} {n:coin|coins}', { n: '1,240' }, '1,240 coins'],
      ['{d} {d:day|days} · {m} {m:meal|meals} a day', { d: 7, m: 1 }, '7 days · 1 meal a day'],
      ['{a} / {b} {b:day|days}', { a: 1, b: 1 }, '1 / 1 day'],
      ['{n} {n:ngày|ngày}', { n: 1 }, '1 ngày'],
      ['Còn {n} ngày', { n: 1 }, 'Còn 1 ngày'],
      ['{n} {n:day|days}', {}, '{n} days'],
    ];
    for (const [tpl, vars, want] of FILL_CASES) {
      const got = fillCopy(tpl, vars);
      if (got !== want) problems.push(`fillCopy("${tpl}", ${JSON.stringify(vars)}) ra "${got}", phải là "${want}"`);
    }
    globalThis.__fill = FILL_CASES.length;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ── tự kiểm luật 1 ──────────────────────────────────────────────────────── */
const RULE_CASES = [
  ['{n} days left', ['{n} days']],
  ['{n} {n:day|days} left', []],
  ['{n} more days to go', ['{n} days']],
  ['{a} / {b} days', ['{b} days']],
  ['{a} / {b} {b:day|days}', []],
  ['{n} left', []],
  ['{n} joined', []],
  ['{name} and {n} others liked your post', ['{n} others']],
  ['{title} is ready', []],
  ['{n} kg', []],
  ['{d} {d:day|days} · {m} meals a day', ['{m} meals']],
];
for (const [text, want] of RULE_CASES) {
  const got = missingPlurals(text);
  if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`luật 1 tự kiểm sai: "${text}" ra ${JSON.stringify(got)}, phải là ${JSON.stringify(want)}`);
}

/* ── luật 1 trên chuỗi thật ─────────────────────────────────────────────── */
const selectorKeys = new Set();
let scanned = 0;
for (const s of SOURCES) {
  const src = readFileSync(path.join(NATIVE, s.file), 'utf8');
  for (const { key, text, line } of englishCopy(src, s.start, s.end)) {
    scanned++;
    if (/\{\w+:[^|{}]*\|[^{}]*\}/.test(text)) selectorKeys.add(key);
    if (EXEMPT.has(key)) continue;
    for (const miss of missingPlurals(text)) {
      problems.push(`${s.file}:${line} ${key}: "${text}" — "${miss}" không có dạng số ít; ở ${miss.split('}')[0]}} = 1 tiếng Anh sẽ đọc sai. Viết ${miss.replace(/\{(\w+)\} (\w+)/, (_m, x, w) => `{${x}} {${x}:${(/ies$/.test(w) ? w.replace(/ies$/, 'y') : w.replace(/s$/, ''))}|${w}}`)} và đọc bằng fillCopy`);
    }
  }
}

/* ── luật 2: khoá có bộ chọn không được đọc bằng .replace( ─────────────── */
/*
  Ba đường một mẫu tới được `.replace(`, và mỗi đường đã có thật trong app:
    2a  thẳng        `i18n.nChEndsIn.replace('{n}', …)`
    2b  qua biến     `const tpl = … t.nRmLeft …; tpl.replace(…)`     (claimLine)
    2c  qua hàm      `sleepNoteText(i18n, key).replace('{short}', …)` (hàm trả khoá)
  Chú thích bị bỏ trước khi tìm: một đoạn giải thích nhắc `.replace(` không
  phải một lời gọi.
*/
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const f = path.join(d, n);
    if (statSync(f).isDirectory()) walk(f);
    else if (/\.(ts|tsx)$/.test(n) && !/native-strings\.ts$|lib\/i18n\.ts$/.test(f)) files.push(f);
  }
})(path.join(NATIVE, 'src'));
const keyAlt = [...selectorKeys].join('|');
const mentions = (t) => keyAlt && new RegExp(`\\.(${keyAlt})\\b`).test(t);
const srcs = files.map((f) => ({ f, rel: path.relative(NATIVE, f), src: stripComments(readFileSync(f, 'utf8')) }));
const lineOf = (src, i) => src.slice(0, i).split('\n').length;
/* 2c: hàm export mà thân nhắc một khoá có bộ chọn. */
const taintedFns = new Set();
for (const { src } of srcs) {
  for (const m of src.matchAll(/export function (\w+)\s*\([\s\S]*?\n\}/g)) if (mentions(m[0])) taintedFns.add(m[1]);
}
let flows = 0;
for (const { rel, src } of srcs) {
  const hits = [];
  if (keyAlt) {
    for (const m of src.matchAll(new RegExp(`\\.(${keyAlt})\\b\\s*\\)?\\s*\\n?\\s*\\.replace\\(`, 'g'))) hits.push([m.index, `\`${m[1]}\` được đọc bằng .replace(`]);
    for (const m of src.matchAll(new RegExp(`\\(\\s*[^()]*\\.(${keyAlt})\\b[^()]*\\)\\s*\\n?\\s*\\.replace\\(`, 'g'))) hits.push([m.index, `\`${m[1]}\` (trong một biểu thức chọn) được đọc bằng .replace(`]);
  }
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*([^;]*);/g)) {
    if (!mentions(m[2])) continue;
    for (const r of src.slice(m.index).matchAll(new RegExp(`\\b${m[1]}\\s*\\n?\\s*\\.replace\\(`, 'g'))) hits.push([m.index + r.index, `biến \`${m[1]}\` giữ một khoá có bộ chọn và được đọc bằng .replace(`]);
  }
  for (const fn of taintedFns) {
    for (const m of src.matchAll(new RegExp(`\\b${fn}\\([^()]*(?:\\([^()]*\\)[^()]*)*\\)\\s*\\n?\\s*\\.replace\\(`, 'g'))) hits.push([m.index, `\`${fn}(…)\` trả một khoá có bộ chọn và được đọc bằng .replace(`]);
  }
  const seenLine = new Set();
  for (const [i, why] of hits) {
    const ln = lineOf(src, i);
    if (seenLine.has(ln)) continue;
    seenLine.add(ln);
    flows++;
    problems.push(`${rel}:${ln}: ${why} — bộ chọn số ít/số nhiều sẽ lọt ra màn nguyên văn; đọc bằng fillCopy(…, { … })`);
  }
}

/* ── luật 4: lượt quét hẹp nhận ra chuỗi đã điền ─────────────────────────── */
let narrowChecked = 0;
{
  const { appCopy, copyPatterns, fixedLetters } = await import('./live-narrow.mjs');
  const copy = appCopy();
  const full = copyPatterns(copy).map((r) => new RegExp(r));
  const withSel = copy.filter((t) => /\{\w+:[^|{}]*\|[^{}]*\}/.test(t) && fixedLetters(t) >= 4);
  for (const t of withSel) {
    const keys = [...new Set([...t.matchAll(/\{(\w+)(?::[^{}]*)?\}/g)].map((m) => m[1]))];
    for (const n of [1, 3]) {
      const text = fill ? fill(t, Object.fromEntries(keys.map((k) => [k, n]))) : t;
      narrowChecked++;
      if (!full.some((re) => re.test(text))) problems.push(`luật 4: "${t}" điền n = ${n} thành "${text}", mà lượt quét hẹp không nhận ra đó là chữ của app — cắt nó thành "…" sẽ không bị báo (live-narrow.mjs copyPatterns)`);
    }
  }
}

if (problems.length) {
  console.error('câu đếm tiếng Anh sai ở n = 1:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `câu đếm OK — ${scanned} chuỗi tiếng Anh (native-strings + i18n): mọi "{x} <danh từ số nhiều>" đều có bộ chọn {x:một|nhiều} ` +
    `(${selectorKeys.size} khoá, ${EXEMPT.size} ngoại lệ có lý do), không khoá nào có bộ chọn tới được .replace( — thẳng, qua biến, hay qua hàm (${taintedFns.size} hàm trả khoá) — ở ${files.length} tệp; ` +
    `fillCopy thật đúng ${globalThis.__fill} ca biên (1, 0, 1.5, "+1", "1,240", hai số một câu, thiếu biến giữ nguyên); luật tự kiểm ${RULE_CASES.length} ca; ` +
    `lượt quét hẹp nhận ra ${narrowChecked} bản đã điền (n = 1 và 3) của mọi chuỗi có bộ chọn là chữ của app`,
);
