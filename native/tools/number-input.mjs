/**
 * Ô nhập số không được nối thẳng `onChangeText` vào state.
 *
 * ── lỗi ──
 *
 * Xem `src/lib/number-input.ts`: gõ "00040" rồi chạm 0 vài lần thì ô hiện
 * "00040"/"000005" (đã bị chụp lại ở thẻ cân nặng), và máy tiếng Việt gõ
 * `71,5` thì `parseFloat` đọc thành **71** — nửa lạng biến mất im lặng.
 * `decText`/`intText` là lời giải tập trung: cắt số 0 thừa, hoá `,` thành
 * `.`, giữ đúng một dấu chấm, không biến rỗng thành "0".
 *
 * ── luật ──
 *
 * Trong `src/app` và `src/components`, mọi `TextInput` có `keyboardType` số
 * (`numeric`/`decimal-pad`/`number-pad`) phải đưa chuỗi gõ qua `decText(`,
 * `intText(` hoặc `digits(` (bản gốc trong `food-editor.tsx`, logic ≡
 * `intText`) trước khi vào state. Ba ngoại lệ có chủ ý, mỗi cái ghi lý do ở
 * `ALLOWLIST` dưới và bắt buộc giữ một dấu vết trong code:
 *
 *   - `log-workout.tsx` ô reps: nhận `45s` (giữ plank) — `parseRepEntry`
 *     kiểm lúc đọc, lọc lúc gõ sẽ giết mất chữ `s`.
 *   - `water.tsx`: lọc riêng `[^0-9.,]`, giữ dấu phẩy để chuẩn hoá lúc parse
 *     (quyết định có ghi chú ở water.tsx:285).
 *   - `workout-set-sheet.tsx`: stepper giữ chuỗi thô khi đang gõ, commit số
 *     đã clamp, format lại ở `onEndEditing`.
 *
 * ── hành vi ──
 *
 * Gate còn chạy THẬT `decText`/`intText` từ `src/lib/number-input.ts` trên
 * các ca biên ("00040", "71,5", ".", "0.5") — import trực tiếp file TS qua
 * type-stripping của Node, không copy lại logic (hai bản copy là hai thứ
 * trôi khỏi nhau).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/** Bóc chú thích, giữ nguyên độ dài (#164). */
const strip = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (c, p) => p + ' '.repeat(c.length - p.length));

/* ── 1. chạy thật decText/intText trên ca biên ── */
const { decText, intText } = await import(
  pathToFileURL(path.join(NATIVE, 'src/lib/number-input.ts')).href
);
if (typeof decText !== 'function' || typeof intText !== 'function') {
  problems.push('src/lib/number-input.ts: thiếu export decText/intText — gate mù?');
}
const cases = [
  // [hàm, vào, ra mong đợi, vì sao ca này tồn tại]
  [decText, '00040', '40', 'số 0 thừa đầu (thẻ cân nặng đã bị chụp "000005")'],
  [decText, '71,5', '71.5', 'máy tiếng Việt gõ dấu phẩy — parseFloat("71,5") ra 71'],
  [decText, '.', '0.', 'dấu chấm mồ côi thành "0." để gõ tiếp được'],
  [decText, '0.5', '0.5', 'số 0 trước dấu chấm phải giữ'],
  [decText, '12.34.56', '12.3456', 'dấu chấm thứ hai bị bỏ, đuôi sau nó được giữ'],
  [decText, '', '', 'rỗng vẫn là rỗng — không biến thành "0"'],
  [intText, '00040', '40', 'số 0 thừa đầu (kcal/macro)'],
  [intText, '000005', '5', 'ca đã bị chụp thật'],
  [intText, '12a3', '123', 'dán từ number-pad vẫn lọt chữ — lọc hết'],
  [intText, '7.5', '75', 'ô nguyên không có thập phân'],
];
let behavior = 0;
for (const [fn, input, want, why] of cases) {
  behavior++;
  const got = fn(input);
  if (got !== want) {
    problems.push(
      `${fn.name}(${JSON.stringify(input)}) = ${JSON.stringify(got)}, muốn ${JSON.stringify(want)} — ${why}`,
    );
  }
}

/* ── 2. quét mọi TextInput số ── */
const ALLOWLIST = [
  {
    file: 'src/app/log-workout.tsx',
    marker: "'reps'",
    why: 'ô reps nhận "45s" (giữ plank) — parseRepEntry kiểm lúc đọc, lọc lúc gõ sẽ giết chữ s',
  },
  {
    file: 'src/app/water.tsx',
    marker: '[^0-9.,]',
    why: 'lọc riêng có chủ ý: giữ dấu phẩy để chuẩn hoá lúc parse (ghi chú ở water.tsx:285)',
  },
  {
    file: 'src/components/ascnd/workout-set-sheet.tsx',
    marker: 'onEndEditing',
    why: 'stepper: giữ chuỗi thô khi đang gõ, commit số đã clamp, format lại khi rời ô',
  },
];

const NUMERIC_KB = /keyboardType\s*=\s*("(?:numeric|decimal-pad|number-pad|phone-pad)"|\{[^}]*\})/;

/**
 * Toàn bộ thẻ `<TextInput …>` bắt đầu ở `from`: quét ký tự, đếm ngoặc `{}`
 * (qua string), thẻ kết thúc ở `>` đầu tiên khi không ở trong ngoặc — vì
 * `onChangeText={(v) => …}` chứa `>` của arrow function.
 */
function textInputSpan(code, from) {
  let brace = 0;
  let quote = null;
  for (let i = from; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === quote && code[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') brace++;
    else if (ch === '}') brace--;
    else if (ch === '>' && brace === 0) return code.slice(from, i + 1);
  }
  return null;
}

/** Thân `onChangeText={…}` trong thẻ, cắt bằng đếm ngoặc. */
function handlerOf(span) {
  const at = span.indexOf('onChangeText={');
  if (at === -1) return null;
  let brace = 0;
  for (let i = at + 'onChangeText='.length; i < span.length; i++) {
    const ch = span[i];
    if (ch === '{') brace++;
    else if (ch === '}') {
      brace--;
      if (brace === 0) return span.slice(at, i + 1);
    }
  }
  return null;
}

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });

let numericInputs = 0;
for (const abs of [...walk(path.join(NATIVE, 'src/app')), ...walk(path.join(NATIVE, 'src/components'))]) {
  const src = strip(readFileSync(abs, 'utf8'));
  const rel = path.relative(NATIVE, abs);
  for (const m of src.matchAll(/<TextInput[\s>]/g)) {
    const span = textInputSpan(src, m.index);
    if (!span || !NUMERIC_KB.test(span)) continue;
    numericInputs++;
    const handler = handlerOf(span);
    if (handler == null) continue; // không có onChangeText (ô chỉ hiển thị) — không bypass
    if (/\b(decText|intText|digits)\s*\(/.test(handler)) continue;
    const allow = ALLOWLIST.find((a) => rel === a.file && span.includes(a.marker));
    if (allow) continue;
    const line = src.slice(0, m.index).split('\n').length;
    problems.push(
      `${rel}:${line}: TextInput số nối thẳng onChangeText vào state — qua decText/intText ` +
        `(src/lib/number-input.ts), hoặc ghi ngoại lệ có lý do vào ALLOWLIST của tools/number-input.mjs`,
    );
  }
}
if (numericInputs < 10) problems.push(`tự kiểm: chỉ ${numericInputs} ô số — bộ quét đã mù?`);

if (problems.length) {
  console.error(`ô nhập số HỎNG\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `ô nhập số OK — ${behavior} ca biên decText/intText xanh, ${numericInputs} ô số: mọi ô qua ` +
    `decText/intText/digits, 3 ngoại lệ có chủ ý (reps "45s", water, stepper)`,
);
