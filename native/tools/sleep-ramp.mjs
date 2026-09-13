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
 * 1. CẢ HAI diện mạo: nông < REM < sâu về ĐỘ ĐẬM MỰC (tương phản với nền). Đây
 *    là quan hệ, không phải ba ngưỡng rời — một dải mã hoá độ sâu mà không đơn
 *    điệu thì không mã hoá gì cả. Ở bản sáng "đậm hơn" là tối hơn, ở bản tối là
 *    sáng hơn; phép đo tương phản nói cùng một câu cho cả hai.
 *
 * 2. Hai bậc cạnh nhau phải TÁCH ĐƯỢC: ≥1,4× tương phản với nhau. Đơn điệu
 *    thôi thì chưa đủ — ba màu xếp đúng thứ tự mà cách nhau 1,05× vẫn đọc ra
 *    một dải liền.
 *
 * 3. Không tệp nào ngoài `constants/palette.ts` được tự đặt màu giai đoạn ngủ.
 *    Đó là cách bản sao cũ ra đời: `#3f4048` ở `dashboard-cards.tsx` và
 *    `#565663` ở `app/sleep-insights.tsx` — cùng một khái niệm, hai màu.
 *
 * 4. Mỗi dải ≥3,0 với NỀN NÓ NẰM TRÊN, đo ở cả hai nền dải này thật sự gặp:
 *    mặt kính phủ wash (màn Chi tiết giấc ngủ, có `aura`) và mặt thẻ trần (thẻ
 *    Hôm nay, không aura). Xem chú thích của chính luật ấy bên dưới.
 *
 * 5. Cột "không rõ tầng" phải RỖNG RUỘT kèm viền, không phải một khối đặc.
 *
 * ── bản TỐI từng được miễn luật 1 và 2, và nay thì không ──
 *
 * Nó dùng hai token chỉ số (lơ và tím) mà độ sáng không xếp theo độ sâu, cộng
 * một màu xám `#3f4048` cho giấc nông. Miễn trừ ấy đứng được chừng nào chưa ai
 * đo dải với NỀN: đo rồi thì `#3f4048` chỉ cách nền 1,81:1, và hậu quả nhìn
 * thấy được trên ảnh — một đêm lấp đầy 100% cột trông như lấp 45%, vì giấc
 * nông là ~55% của mọi đêm.
 *
 * Chủ dự án đã cho mở riêng ba giá trị ấy sau khi xem ảnh đối chiếu hai diện
 * mạo. Nên luật 4 cũ (đóng băng ba giá trị tối) bỏ đi, và bản tối nay chịu
 * đúng những luật bản sáng chịu.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { codeMask } from './lib/code-mask.mjs';
import { NATIVE, faceFor, hex as hexOf, loadPalette, ratio, toHex } from './lib/stack.mjs';

const { palettes, sleepRamps } = loadPalette();

const contrast = (a, b) => ratio(typeof a === 'string' ? hexOf(a) : a, typeof b === 'string' ? hexOf(b) : b);
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Hai cái nền mà dải này thật sự gặp, và vì sao phải là HAI.
 *
 * Màn Chi tiết giấc ngủ bật `aura`, nên sau các cột là mặt kính `primary` phủ
 * lên wash: `#232433` ở bản tối, `#edeff8` ở bản sáng. Thẻ Hôm nay không có
 * aura, nên ở đó nền là mặt thẻ trần. Hai nền ấy nằm về hai phía của nhau —
 * wash làm nền tối SÁNG LÊN (khó hơn cho dải sáng) và nền sáng TỐI ĐI (khó hơn
 * cho dải tối) — nên đạt ở một nền không suy ra được nền kia.
 *
 * Phép chồng lấy từ `tools/lib/stack.mjs`, cùng một chỗ `glass-stack.mjs` lấy.
 * Chép lại ở đây thì hai luật cùng xanh trong khi đo hai cái nền khác nhau, và
 * không ai biết cái nào đúng.
 */
const AURA_TINTS = ['metricPurple', 'metricBlue'];
const grounds = (theme) => [
  { name: 'mặt kính trên wash (màn Chi tiết giấc ngủ)', rgb: faceFor(theme, AURA_TINTS, 'primary') },
  { name: 'mặt thẻ trần (thẻ Hôm nay)', rgb: hexOf(palettes[theme].card) },
];

const problems = [];

/* ── 1 + 2 + 4. cả hai diện mạo: đơn điệu, bậc tách được, và đủ trên NỀN ──── */
const NAMES = [['light', 'nông'], ['rem', 'REM'], ['deep', 'sâu']];
const FLOOR = 3.0;
const report = {};

for (const theme of ['dark', 'light']) {
  const ramp = sleepRamps[theme];
  report[theme] = {};

  for (const g of grounds(theme)) {
    const steps = NAMES.map(([key, name]) => ({ name, hex: ramp[key], cr: contrast(ramp[key], g.rgb) }));
    report[theme][g.name] = steps.map((s2) => r2(s2.cr));

    /* 4. sàn WCAG 1.4.11 cho một phần đồ hoạ cần để hiểu nội dung. Dải mờ nhất
       là dải hay hỏng, và nó cũng là dải LỚN NHẤT của mọi đêm (~55%), nên khi
       nó chìm thì cả cột đọc ra là một cột gần rỗng. */
    for (const s2 of steps) {
      if (s2.cr < FLOOR) {
        problems.push(
          `${theme}: dải \`${s2.name}\` (${s2.hex}) chỉ ${r2(s2.cr)}:1 trên ${g.name} ` +
            `(${toHex(g.rgb)}) — WCAG 1.4.11 đòi ${FLOOR} cho phần đồ hoạ cần để hiểu nội dung, và ` +
            'ranh giới giữa ĐÃ LẤP và CÒN TRỐNG đúng là phần ấy: một đêm lấp đầy cột sẽ trông như lấp một nửa',
        );
      }
    }

    /* 1. đơn điệu theo độ sâu. Đo trên TỪNG nền, vì một dải đơn điệu trên mặt
       thẻ trần vẫn có thể đảo thứ tự sau khi wash kéo nền đi. */
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1];
      const cur = steps[i];
      if (cur.cr <= prev.cr) {
        problems.push(
          `${theme} trên ${g.name}: \`${cur.name}\` (${cur.hex}, ${r2(cur.cr)}:1) KHÔNG đậm hơn ` +
            `\`${prev.name}\` (${prev.hex}, ${r2(prev.cr)}:1) — dải phải đậm dần theo độ sâu giấc ngủ`,
        );
      }
    }
  }

  /* 2. hai bậc cạnh nhau tách được. Đo GIỮA HAI DẢI, nên không phụ thuộc nền:
     hai màu cùng đo 5,0 và 6,0 trên giấy vẫn có thể gần như một màu với nhau.
     Cái mắt làm trong một thanh liền là so hai dải cạnh nhau. */
  for (let i = 1; i < NAMES.length; i++) {
    const [ka, na] = NAMES[i - 1];
    const [kb, nb] = NAMES[i];
    const gap = contrast(ramp[ka], ramp[kb]);
    if (gap < 1.4) {
      problems.push(
        `${theme}: \`${na}\` và \`${nb}\` chỉ cách nhau ${r2(gap)}× — ` +
          'hai dải cạnh nhau trong một thanh liền cần ≥1,4× mới đọc ra hai bậc',
      );
    }
  }
}

{
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

const line = (theme) => {
  const r = sleepRamps[theme];
  const parts = grounds(theme).map((g) => `${g.name.split(' (')[0]} ${report[theme][g.name].join('/')}`);
  return `${theme} (nông→sâu, ${parts.join(' · ')}), bậc ` +
    `${r2(contrast(r.light, r.rem))}× và ${r2(contrast(r.rem, r.deep))}×`;
};
console.log(
  'dải giai đoạn ngủ OK — một sắc, ba mật độ, đậm dần theo độ sâu ở CẢ HAI diện mạo, đo trên CẢ HAI nền ' +
    'dải này thật sự gặp (mặt kính phủ wash và mặt thẻ trần): ' +
    `${line('dark')}; ${line('light')}. ` +
    'Mọi dải ≥3,0 — WCAG 1.4.11 cho phần đồ hoạ cần để hiểu nội dung, tức ranh giới giữa ĐÃ LẤP và CÒN TRỐNG; ' +
    'hai bậc cạnh nhau ≥1,4×; cột "không rõ tầng" vẽ RỖNG RUỘT kèm viền nên không thể trùng diện mạo với một ' +
    'dải thật; và không tệp nào ngoài palette.ts tự đặt màu giai đoạn ngủ',
);
