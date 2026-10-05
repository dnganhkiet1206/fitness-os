/**
 * Fixture matrix gate — issue #370 (C-31).
 *
 *     node tools/fixture-matrix.mjs
 *
 * ── vì sao cổng này tồn tại ──
 *
 * PR #379 từng chỉ có một file Markdown liệt kê chuỗi mẫu: không có gì chạy,
 * không có gì đỏ được. Một ma trận fixture chỉ là chữ trong tài liệu thì không
 * "phát hiện clipping, truncation, pluralization sai, thiếu label trước khi
 * merge" — nó chỉ là lời hứa. Cổng này biến ma trận trong
 * `tools/fixture-matrix-data.mjs` thành assert chạy được:
 *
 *   1. Mọi khoá copy PHẢI tồn tại ở cả 3 locale (thiếu localization → đỏ).
 *   2. Render bằng đúng luật fillCopy của app (src/lib/copy-fill.ts): xong
 *      không được còn `{…}` sót lại (biến thiếu → đỏ, cùng luật BAD_TEXT).
 *   3. Fixture plural: template en PHẢI có bộ chọn `{n:một|nhiều}`; render
 *      n=1 và n=5 phải khác nhau đúng dạng (pluralization sai → đỏ).
 *   4. Fixture a11y: template PHẢI chứa placeholder động {…} (label VoiceOver
 *      tĩnh cho control có nội dung động → đỏ).
 *   5. Fixture "dài": chuỗi render ở cả 3 locale PHẢI ≥ ngưỡng minLen
 *      (fixture dài mà ngắn thì vô nghĩa — không đo được clip/tràn → đỏ).
 *   6. Fixture data: literal cố định, quét mã nguồn tệp data cấm
 *      Date()/Math.random/UUID (không deterministic → đỏ).
 *
 * ── và nó tự phá thử chính nó ──
 *
 * Cổng chạy lại toàn bộ assert trên BẢN SAO đã bị làm hỏng theo bốn cách, và
 * phải bắt được cả bốn ở đúng chỗ dự đoán:
 *   (a) xoá locale es của một khoá → thiếu localization;
 *   (b) lột bộ chọn plural khỏi template en → pluralization sai;
 *   (c) tĩnh hoá một label a11y (bỏ placeholder động) → thiếu nội dung động;
 *   (d) rút ngắn một fixture "dài" xuống dưới ngưỡng → fixture vô nghĩa.
 * Bốn phép thử chạy trên bản sao trong bộ nhớ; dữ liệu thật không bị đụng tới
 * (đây chính là "demo fixture cố tình sai rồi restore" của #370 — bản hỏng chỉ
 * tồn tại trong lần chạy này và bị vứt ngay sau khi bị bắt).
 *
 * Không đo được ở đây, nói thẳng: layout thật (có wrap hay clip trên màn hình)
 * và VoiceOver trên máy thật — vẫn NOT TESTED.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');

const { FIXTURES, SCREENS, LOCALES } = await import(
  path.join(NATIVE, 'tools', 'fixture-matrix-data.mjs')
);

/* ── luật render: cùng semantics với fillCopy trong src/lib/copy-fill.ts ── */
const SELECT = /\{(\w+):([^|{}]*)\|([^{}]*)\}/g;
const SLOT = /\{(\w+)\}/g;
const isOne = (v) => {
  if (v === undefined) return false;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
  return Math.abs(n) === 1;
};
const fill = (t, vars) =>
  t
    .replace(SELECT, (_m, k, one, other) => (isOne(vars[k]) ? one : other))
    .replace(SLOT, (m, k) => (k in vars ? String(vars[k]) : m));

/* ── đọc từ điển: es → en → vi trong native-strings.ts ── */
function parseDict(src, markers) {
  const out = {};
  for (const loc of LOCALES) {
    const i = src.indexOf(markers[loc].start);
    const j = src.indexOf(markers[loc].end, i);
    if (i < 0 || j < 0) throw new Error(`không tìm thấy block ${loc}`);
    const blk = src.slice(i, j);
    const d = {};
    for (const m of blk.matchAll(/^\s*([A-Za-z0-9_]+): '((?:[^'\\]|\\.)*)'/gm)) d[m[1]] = m[2];
    out[loc] = d;
  }
  return out;
}
const STR = read('src/lib/native-strings.ts');
const dict = parseDict(STR, {
  es: { start: 'const es: typeof en = {', end: 'const en = {' },
  en: { start: 'const en = {', end: 'const vi: typeof en' },
  vi: { start: 'const vi: typeof en', end: 'export const nativeStrings' },
});

const problems = [];
const fail = (id, msg) => problems.push(`${id}: ${msg}`);

function checkCopy(fx, D) {
  for (const loc of LOCALES) {
    if (!(fx.key in D[loc])) fail(fx.id, `thiếu localization — khoá '${fx.key}' không có ở locale ${loc}`);
  }
  if (problems.some((p) => p.startsWith(fx.id + ':'))) return; // thiếu khoá thì dừng ở entry này
  for (const vars of fx.varsList ?? [{}]) {
    const rendered = {};
    for (const loc of LOCALES) rendered[loc] = fill(D[loc][fx.key], vars);
    for (const loc of LOCALES) {
      if (/\{[^}]+\}/.test(rendered[loc]))
        fail(fx.id, `biến thiếu — render ${loc} còn sót placeholder: "${rendered[loc]}"`);
    }
    if (fx.minLen) {
      for (const loc of LOCALES) {
        if (rendered[loc].length < fx.minLen)
          fail(
            fx.id,
            `fixture "dài" mà ngắn — ${loc} chỉ ${rendered[loc].length} ký tự, cần ≥ ${fx.minLen}: "${rendered[loc]}"`,
          );
      }
    }
  }
  const tplEn = D.en[fx.key];
  if (fx.pluralVar) {
    const sel = new RegExp(`\\{${fx.pluralVar}:[^|{}]*\\|[^}]*\\}`);
    if (!sel.test(tplEn))
      fail(fx.id, `pluralization sai — template en thiếu bộ chọn {${fx.pluralVar}:một|nhiều}: "${tplEn}"`);
    else {
      const one = fill(tplEn, { [fx.pluralVar]: 1 });
      const many = fill(tplEn, { [fx.pluralVar]: 5 });
      if (one === many)
        fail(fx.id, `pluralization sai — n=1 và n=5 render giống nhau: "${one}"`);
    }
  }
  if (fx.a11y && !SLOT.test(tplEn.replace(SELECT, ''))) {
    // a11y:true đòi template có placeholder động — nhưng SELECT cũng là dạng
    // động ({n:một|nhiều} chứa n). Chỉ đỏ khi KHÔNG còn placeholder nào.
    const withoutSelectors = tplEn.replace(SELECT, '{$1}');
    if (!SLOT.test(withoutSelectors))
      fail(fx.id, `thiếu nội dung động — label a11y tĩnh hoàn toàn: "${tplEn}"`);
  }
}

function checkA11yPattern(fx, D) {
  if (!SLOT.test(fx.pattern))
    return fail(fx.id, `pattern a11y không có placeholder động: "${fx.pattern}"`);
  for (const k of fx.keys) {
    for (const loc of LOCALES) {
      if (!(k in D[loc])) fail(fx.id, `thiếu localization — khoá '${k}' không có ở locale ${loc}`);
    }
  }
  const example = fx.pattern.replace(SLOT, (m, k) => (k in fx.example ? String(fx.example[k]) : m));
  if (/\{[^}]+\}/.test(example))
    fail(fx.id, `ví dụ a11y thiếu giá trị cho placeholder: "${example}"`);
}

function checkData(fx) {
  // quét mã nguồn đã lược chú thích — nếu không, chính chữ "Date()" trong
  // comment của tệp data cũng bị tính là dùng Date().
  const src = read('tools/fixture-matrix-data.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const banned of ['Date(', 'Math.random', 'crypto.randomUUID', 'uuidv4']) {
    if (src.includes(banned)) fail(fx.id, `không deterministic — tệp data dùng ${banned}`);
  }
  const walk = (v) => {
    if (typeof v === 'string') {
      for (const loc of LOCALES) {
        /* tên dài đa locale: value là object {en,vi,es} */
      }
    }
    if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(fx.value);
  // tên dài: mọi chuỗi trong value có minLen phải đạt ngưỡng ở cả 3 locale
  if (fx.minLen) {
    const checkStr = (v, where) => {
      if (typeof v === 'string') {
        if (v.length < fx.minLen)
          fail(fx.id, `fixture "dài" mà ngắn — ${where} chỉ ${v.length} ký tự, cần ≥ ${fx.minLen}`);
      } else if (v && typeof v === 'object') {
        for (const [k2, v2] of Object.entries(v)) checkStr(v2, `${where}.${k2}`);
      }
    };
    // chỉ áp minLen cho các object locale {en,vi,es} hoặc chuỗi trực tiếp
    const v = fx.value;
    if (v && typeof v === 'object' && LOCALES.every((l) => typeof v[l] === 'string')) {
      for (const l of LOCALES) checkStr(v[l], l);
    } else if (v && typeof v === 'object') {
      for (const [k2, v2] of Object.entries(v)) {
        if (v2 && typeof v2 === 'object' && LOCALES.every((l) => typeof v2[l] === 'string')) {
          for (const l of LOCALES) checkStr(v2[l], `${k2}.${l}`);
        }
      }
    }
  }
}

function runAll(F, D) {
  const saved = problems.length;
  for (const fx of F) {
    if (fx.kind === 'copy') checkCopy(fx, D);
    else if (fx.kind === 'a11y-pattern') checkA11yPattern(fx, D);
    else if (fx.kind === 'data') checkData(fx);
    else fail(fx.id, `kind không rõ: ${fx.kind}`);
  }
  return problems.length - saved; // số lỗi mới trong lượt này
}

/* deep clone một fixture theo id để làm hỏng */
const clone = (id) => JSON.parse(JSON.stringify(FIXTURES.find((f) => f.id === id)));

const selfFail = [];
function expectFail(name, mutate, wantId, wantRe) {
  const F = FIXTURES.map((f) => (f.id === wantId ? mutate(clone(wantId)) : f));
  const D = JSON.parse(JSON.stringify(dict));
  const before = problems.length;
  const n = runAll(F, D);
  const hits = problems.slice(before).filter((p) => p.startsWith(wantId + ':') && wantRe.test(p));
  // vứt bản hỏng: problems chỉ giữ lỗi thật — cắt phần của phép thử này
  problems.length = before;
  if (n === 0 || hits.length === 0)
    selfFail.push(`${name}: KHÔNG đỏ như dự đoán (muốn /${wantRe.source}/ ở ${wantId})`);
}

/* (a) xoá locale es của một khoá → phải đỏ "thiếu localization" */
{
  const F = FIXTURES;
  const D = JSON.parse(JSON.stringify(dict));
  delete D.es['nRepsN'];
  const before = problems.length;
  runAll(F, D);
  const hits = problems.slice(before).filter((p) => /thiếu localization.*nRepsN.*es/.test(p));
  problems.length = before;
  if (!hits.length) selfFail.push('(a) xoá es của nRepsN: KHÔNG đỏ như dự đoán');
}
/* (b) lột bộ chọn plural khỏi template en → phải đỏ "pluralization sai" */
{
  // bản hỏng (b) cần sửa dict chứ không sửa fixture
  const D = JSON.parse(JSON.stringify(dict));
  D.en['nRepsN'] = '{n} reps'; // lột bộ chọn {n:rep|reps}
  const before = problems.length;
  runAll(FIXTURES, D);
  const hits = problems.slice(before).filter((p) => p.startsWith('workout-reps-plural:') && /pluralization sai/.test(p));
  problems.length = before;
  if (!hits.length) selfFail.push('(b) lột bộ chọn plural của nRepsN: KHÔNG đỏ như dự đoán');
}
/* (c) tĩnh hoá label a11y → phải đỏ "thiếu nội dung động" */
expectFail('(c) tĩnh hoá label a11y', (f) => ({ ...f, pattern: 'Set row' }), 'workout-set-a11y', /placeholder động/);
/* (d) rút ngắn fixture "dài" → phải đỏ "dài mà ngắn" */
expectFail(
  '(d) rút ngắn fixture dài',
  (f) => ({ ...f, value: { en: 'Ngắn', vi: 'Ngắn', es: 'Corto' } }),
  'today-long-template-name',
  /dài.*mà ngắn/,
);

const realErrors = runAll(FIXTURES, dict);

if (selfFail.length) {
  console.log('Tự kiểm (phép thử ngược) HỎNG — cổng không bắt được bản hỏng:\n');
  for (const s of selfFail) console.log(`  • ${s}`);
  process.exit(2);
}
if (realErrors) {
  console.log('Fixture matrix HỎNG:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `Fixture matrix OK — ${FIXTURES.length} fixture (${SCREENS.join('/')}) × ${LOCALES.length} locale: ` +
    'mọi khoá đủ 3 locale, plural có bộ chọn và render đúng dạng, label a11y mang nội dung động, ' +
    'fixture "dài" đạt ngưỡng ở cả 3 locale, data deterministic. 4 phép thử ngược đều đỏ đúng chỗ ' +
    'dự đoán trên bản hỏng trong bộ nhớ (đã vứt, dữ liệu thật nguyên vẹn). ' +
    'CHƯA ĐO: layout thật trên màn hình và VoiceOver máy thật.',
);
