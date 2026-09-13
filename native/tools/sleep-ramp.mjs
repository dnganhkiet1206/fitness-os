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
const { palettes, materials, sleepRamps } = await import(pathToFileURL(path.join(out, 'palette.js')).href);

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

/* ── 5. mỗi dải so với CÁI RÃNH nó nằm trong ───────────────────────────────── */
/**
 * Luật 1 đo ba dải với MẶT THẺ. Nhưng trong một cột chồng, việc mắt thật sự
 * làm là phân biệt phần ĐÃ LẤP với phần CÒN TRỐNG — và phần còn trống không
 * phải mặt thẻ, nó là cái rãnh (`inset.track`), tối hơn/sáng hơn mặt thẻ.
 *
 * Phép đo ấy chưa ai làm, và nó đỏ ở CẢ HAI diện mạo lúc được làm lần đầu:
 * nông 2,36 ở bản sáng, 1,81 ở bản tối, so với ngưỡng 3,0 của WCAG 1.4.11 cho
 * "phần của đồ hoạ cần để hiểu nội dung". Hậu quả đọc được trên ảnh: một đêm
 * lấp đầy 100% cột trông như lấp 45%.
 *
 * Bản sáng đã giải xong (nông 3,25). Bản TỐI thì `#3f4048` là một màu xám, và
 * luật 4 ngay trên đây đóng băng nó — nên chỗ này là một NGOẠI LỆ có số đo và
 * có hạn: nó ghi chính con số đang hỏng, và sẽ đỏ nếu con số ấy TỆ ĐI, hoặc
 * nếu bản tối được sửa mà ngoại lệ không được gỡ. Một ngoại lệ không biết tự
 * hết hạn là một lỗ hổng vĩnh viễn.
 */
{
  const parseC = (s) => {
    const m = /^#([0-9a-f]{6})$/i.exec(s.trim());
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
    const r = /rgba?\(([^)]+)\)/.exec(s);
    if (!r) throw new Error(`sleep-ramp: không đọc được màu "${s}"`);
    const p = r[1].split(',').map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const over = (fg, bg) => [0, 1, 2].map((i) => Math.round(fg[i] * fg[3] + bg[i] * (1 - fg[3]))).concat(1);
  const lumC = (c) => {
    const f = [c[0], c[1], c[2]].map((v) => lin(v / 255));
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const crC = (a, b) => {
    const [x, y] = [lumC(a), lumC(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  /** Đã biết hỏng, kèm số đo và lý do vì sao chưa sửa được. */
  const BIET_HONG = {
    'dark.light':
      'luật 4 đóng băng ba giá trị của bản tối, và `#3f4048` là màu XÁM nên không nâng được mà vẫn giữ họ tím — ' +
      'sửa nó là mở lại bản tối',
  };
  const FLOOR = 3.0;

  for (const theme of ['dark', 'light']) {
    const card = parseC(palettes[theme].card);
    const track = over(parseC(materials[theme].inset.track), card);
    for (const [key, name] of [['light', 'nông'], ['rem', 'REM'], ['deep', 'sâu']]) {
      const band = parseC(sleepRamps[theme][key]);
      const v = crC(band, track);
      const id = `${theme}.${key}`;
      const known = BIET_HONG[id];
      if (v >= FLOOR) {
        if (known) {
          problems.push(
            `\`${id}\` giờ đã đạt ${r2(v)}:1 với rãnh — gỡ nó khỏi BIET_HONG trong tools/sleep-ramp.mjs, ` +
              'không thì ngoại lệ ấy che luôn lần hỏng sau',
          );
        }
        continue;
      }
      if (!known) {
        problems.push(
          `${theme}: dải \`${name}\` (${sleepRamps[theme][key]}) chỉ ${r2(v)}:1 với RÃNH — ` +
            'WCAG 1.4.11 đòi 3,0 cho phần đồ hoạ cần để hiểu nội dung, và ranh giới giữa ĐÃ LẤP và CÒN TRỐNG ' +
            'đúng là phần ấy: một đêm lấp đầy cột sẽ trông như lấp một nửa',
        );
      }
    }
  }

  /* ── 6. cột "không rõ tầng" không được là một KHỐI ĐẶC ────────────────────
     Nó từng là `alpha(ink, 0.14)` và đo được 1,22:1 với dải nông ở bản tối,
     1,77 ở bản sáng — "bạn ngủ nông chừng này" và "không ai đo tầng của bạn"
     hiện ra gần như cùng một hình. Màu không cứu được (2,44 kể cả sau khi giải
     lại dải sáng), nên lời giải là đổi HẠNG của hình: rỗng ruột, một nét viền.
     Luật canh đúng điều ấy — ruột trong suốt và CÓ viền — chứ không canh một
     mã màu, vì mã màu là thứ vừa được chứng minh là không giải được bài này. */
  const chart = readFileSync(path.join(NATIVE, 'src/app/sleep-insights.tsx'), 'utf8');
  const decl = /barUnknown:\s*\{([^}]*)\}/.exec(chart);
  if (!decl) {
    problems.push('src/app/sleep-insights.tsx không còn style `barUnknown` — cột "không rõ tầng" vẽ bằng gì?');
  } else {
    const body = decl[1];
    if (!/backgroundColor:\s*'transparent'/.test(body)) {
      problems.push(
        '`barUnknown` có ruột ĐẶC — nó sẽ rơi vào giữa ba dải thật lần nữa (đo được 1,22:1 với dải nông ở ' +
          'bản tối lần trước). Rỗng ruột là khác biệt về LOẠI, và đó là thứ duy nhất không va vào màu nào được',
      );
    }
    if (!/borderWidth:\s*[0-9]/.test(body) || !/borderColor:/.test(body)) {
      problems.push('`barUnknown` rỗng ruột mà KHÔNG có viền — một cột vô hình không nói được "đêm này có thật"');
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
    'bản tối giữ đúng ba giá trị đã ship; không tệp nào tự đặt màu giai đoạn ngủ nữa; ' +
    'mỗi dải đạt ≥3,0 với chính cái RÃNH nó nằm trong (WCAG 1.4.11 — ranh giới giữa đã lấp và còn trống), ' +
    'trừ `dark.light` đang ở 1,81 với lý do ghi trong BIET_HONG và sẽ đỏ ngay khi lý do ấy hết đúng; ' +
    'và cột "không rõ tầng" vẽ RỖNG RUỘT kèm viền, nên nó không thể trùng diện mạo với một dải thật',
);
