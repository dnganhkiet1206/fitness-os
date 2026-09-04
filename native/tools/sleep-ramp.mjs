/**
 * Ba giai đoạn ngủ phải ĐẬM DẦN theo độ sâu, và phải là MỘT nguồn.
 *
 *     node tools/sleep-ramp.mjs
 *
 * ── lỗi nó bắt được, và đã bắt được thật ──
 *
 * Bản sáng mã hoá NGƯỢC. Ba màu của thanh giai đoạn được chọn ở ba chỗ và bằng
 * ba cách khác nhau — hai token chỉ số cộng một mã màu viết thẳng — nên không
 * ai từng nhìn cả ba cạnh nhau trên nền giấy:
 *
 *     nông  #3f4048 (mã màu viết thẳng, giữ nguyên ở cả hai theme)  10,30:1
 *     REM   metricCyan                                               4,99:1
 *     sâu   metricPurple                                             4,96:1
 *
 * Giấc ngủ NÔNG là dải đậm nhất của cả ba, gấp đôi giấc ngủ SÂU. Một đêm ngủ
 * nông đọc ra nặng hơn một đêm ngủ sâu, tức biểu đồ nói ngược điều nó đo.
 *
 * `tsc` không thấy: ba chuỗi hợp lệ. `tools/palette.mjs` không thấy: `#3f4048`
 * không phải token nên nó không có trong bảng nào để mà đo. Và ở bản TỐI thì
 * thứ tự lại đúng, nên mọi ảnh chụp đều bình thường.
 *
 * ── luật ──
 *
 * 1. Bản SÁNG: nông < REM < sâu về ĐỘ ĐẬM MỰC (tương phản với mặt thẻ). Đây là
 *    quan hệ, không phải ba ngưỡng rời — một dải mã hoá độ sâu mà không đơn
 *    điệu thì không mã hoá gì cả.
 *
 * 2. Hai bậc cạnh nhau phải TÁCH ĐƯỢC: ≥1,4× tương phản với nhau. Đơn điệu
 *    thôi thì chưa đủ — ba màu xếp đúng thứ tự mà cách nhau 1,05× vẫn đọc ra
 *    một dải liền.
 *
 * 3. Không tệp nào ngoài `constants/palette.ts` được tự đặt màu giai đoạn ngủ.
 *    Đó là cách bản sao cũ ra đời: `#3f4048` ở `dashboard-cards.tsx` và
 *    `#565663` ở `app/sleep-insights.tsx` — cùng một khái niệm, hai màu.
 *
 * Bản TỐI cố ý KHÔNG bị luật 1 và 2 ràng: nó dùng hai token chỉ số (lơ và tím)
 * mà độ sáng của chúng không xếp theo độ sâu, và nó đã ship như thế. Ràng nó
 * bây giờ là đổi bản tối. Thứ bản tối phải giữ là ba giá trị hiện có, và
 * `tools/dark-frozen.mjs` không soi tới đây — nên luật 4 làm việc ấy.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { codeMask } from './lib/code-mask.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const out = mkdtempSync(path.join(tmpdir(), 'sleep-ramp-'));
execFileSync(
  'npx',
  ['tsc', 'src/constants/palette.ts', '--ignoreConfig', '--outDir', out,
   '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
);
const { palettes, sleepRamps } = await import(pathToFileURL(path.join(out, 'palette.js')).href);

const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function lum(hex) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map(lin);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const r2 = (v) => Math.round(v * 100) / 100;

const problems = [];

/* ── 1 + 2. bản SÁNG: đơn điệu, và các bậc tách được ───────────────────────── */
{
  const ramp = sleepRamps.light;
  const ground = palettes.light.card;
  const steps = [
    ['nông', ramp.light],
    ['REM', ramp.rem],
    ['sâu', ramp.deep],
  ].map(([name, hex]) => ({ name, hex, cr: contrast(hex, ground) }));

  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const cur = steps[i];
    if (cur.cr <= prev.cr) {
      problems.push(
        `bản sáng: \`${cur.name}\` (${cur.hex}, ${r2(cur.cr)}:1) KHÔNG đậm hơn \`${prev.name}\` ` +
          `(${prev.hex}, ${r2(prev.cr)}:1) — dải phải đậm dần theo độ sâu giấc ngủ`,
      );
      continue;
    }
    /* Tách hai bậc bằng tương phản GIỮA CHÚNG, không bằng hiệu hai con số trên
       nền: hai màu cùng đo 5,0 và 6,0 trên giấy vẫn có thể gần như một màu với
       nhau. Cái mắt làm trong một thanh liền là so hai dải cạnh nhau. */
    const gap = contrast(prev.hex, cur.hex);
    if (gap < 1.4) {
      problems.push(
        `bản sáng: \`${prev.name}\` và \`${cur.name}\` chỉ cách nhau ${r2(gap)}× — ` +
          'hai dải cạnh nhau trong một thanh liền cần ≥1,4× mới đọc ra hai bậc',
      );
    }
  }
}

/* ── 4. bản TỐI giữ đúng ba giá trị đã ship ────────────────────────────────── */
{
  const FROZEN = { light: '#3f4048', rem: '#22e3ff', deep: '#b45cff' };
  for (const [k, v] of Object.entries(FROZEN)) {
    if (sleepRamps.dark[k] !== v) {
      problems.push(
        `bản tối: \`sleepRamps.dark.${k}\` = ${sleepRamps.dark[k]}, đã ship là ${v} — ` +
          'bản tối không đổi trong giai đoạn này',
      );
    }
  }
}

/* ── 3. không tệp nào tự đặt màu giai đoạn ngủ ─────────────────────────────── */
const HOME = 'src/constants/palette.ts';
/**
 * Một mã màu đi cùng DỮ LIỆU giai đoạn ngủ, trên cùng một dòng.
 *
 * ── vì sao không phải `/\b(deep|rem|light)\b/i` ──
 *
 * Bản đầu viết đúng thế và báo 56 lỗi, không cái nào có thật: "light" là một
 * từ tiếng Anh bình thường, và `medal.tsx` với `vector-mascot.tsx` đặt tên
 * chặn gradient của chúng là `light`/`dark` theo nghĩa ÁNH SÁNG. Một luật kêu
 * ở 56 chỗ đúng là một luật sẽ bị tắt, và tắt rồi thì chỗ thứ 57 — chỗ thật —
 * đi qua cùng với chúng.
 *
 * Nên cái được tìm là hình dạng của DỮ LIỆU giấc ngủ, thứ chỉ xuất hiện ở nơi
 * ba giai đoạn thật sự được vẽ: `stages.deep`, `n.rem_h`, `deep_min`,
 * `avgDeep`, hoặc một hằng tên `DEEP`/`REM`/`LIGHT`.
 */
const STAGE_WORD = new RegExp(
  [
    /\bstages?\.(deep|rem|light)\b/.source,
    /\b(deep|rem|light)_(min|h|pct)\b/.source,
    /\bavg(Deep|Rem|Light)\b/.source,
    /\b(DEEP|REM|LIGHT)[_A-Z]*\s*=/.source,
  ].join('|'),
);

function tsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

for (const full of tsFiles(path.join(NATIVE, 'src'))) {
  const rel = path.relative(NATIVE, full);
  if (rel === HOME) continue;
  const src = readFileSync(full, 'utf8');
  const mask = codeMask(src);
  const lines = src.split('\n');
  let at = 0;
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    const start = at;
    at += line.length + 1;
    if (!STAGE_WORD.test(line)) continue;
    /*
      ── và ở đây `codeMask` được hỏi về CẢ DÒNG, không về chính mã màu ──

      Bản đầu viết `if (!mask[start + hit.index]) continue`, và phép thử ngược
      của nó XANH: dựng lại `color: '#3f4048'` trong `dashboard-cards.tsx` mà
      luật không kêu. Vì mã màu nằm BÊN TRONG một chuỗi, tức đúng thứ `codeMask`
      đánh dấu là KHÔNG phải mã. Cái lọc dựng ra để bỏ qua chú thích đã bỏ qua
      luôn cả thứ cần bắt — cùng một cái bẫy `tools/frozen-surface.mjs` đã dẫm
      phải và đã ghi lại.

      Câu hỏi đúng là "dòng này là MÃ hay là CHÚ THÍCH": một dòng mã luôn có ít
      nhất một ký tự ngoài chuỗi (`color:`, dấu phẩy, ngoặc), còn một dòng chú
      thích thì không có ký tự nào.
    */
    const isCode = [...line].some((_, i) => mask[start + i]);
    if (!isCode) continue;
    for (const hit of line.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      problems.push(
        `${rel}:${ln + 1}: mã màu ${hit[0]} nằm cạnh một nhãn giai đoạn ngủ — ` +
          'ba màu ấy chỉ có nghĩa CẠNH NHAU, nên chúng sống ở `sleepRamps` và đọc qua `useSleepRamp()`',
      );
    }
  }
}

if (problems.length) {
  console.log('dải giai đoạn ngủ CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

const L = sleepRamps.light;
const g = palettes.light.card;
console.log(
  'dải giai đoạn ngủ OK — bản sáng đậm dần theo độ sâu ' +
    `(nông ${r2(contrast(L.light, g))} < REM ${r2(contrast(L.rem, g))} < sâu ${r2(contrast(L.deep, g))} trên mặt thẻ), ` +
    `hai bậc cạnh nhau tách ${r2(contrast(L.light, L.rem))}× và ${r2(contrast(L.rem, L.deep))}×; ` +
    'bản tối giữ đúng ba giá trị đã ship; và không tệp nào tự đặt màu giai đoạn ngủ nữa',
);
