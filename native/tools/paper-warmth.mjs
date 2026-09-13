/**
 * Giấy phải còn là GIẤY sau khi app vẽ xong mọi lớp lên nó.
 *
 *     node tools/paper-warmth.mjs
 *
 * ── lỗi nó sinh ra để sửa, và ai tìm ra nó ──
 *
 * Lớp nền trải hết chiều cao của `readiness-aura.tsx` tô `tint2` lên giấy ở độ
 * mờ 0,10, kèm một câu KHẲNG ĐỊNH chứ không đo: "ở độ mờ thấp một sắc tint
 * không nhuộm". Không công cụ nào đỏ. Chủ dự án nhìn ảnh và hỏi "sao app mất
 * màu be cũ rồi".
 *
 * Đo trên chính ảnh đã dựng:
 *
 *     giấy khai trong bảng  #f7f4ef   hue  38°   bão hoà 33,3%
 *     đáy trang, sau lớp    #eceeed   hue 150°   bão hoà  5,6%
 *
 * Hue LẬT từ hổ phách sang lục-lam, bão hoà còn một phần sáu. Một sắc lạnh
 * phủ lên nền ấm không làm nó sâu hơn — nó TRUNG HOÀ nền ấy.
 *
 * ── vì sao không luật nào có sẵn bắt được ──
 *
 * Vì tất cả đều đo ĐỘ TƯƠNG PHẢN, và tương phản không biết gì về sắc:
 *
 *     chữ chính trên đáy cũ   15,2:1   ✓
 *     chữ phụ  trên đáy cũ     5,0:1   ✓
 *     `dark-frozen`, `palette`         ✓  (không token nào đổi giá trị)
 *     `glass-stack`, `sleep-ramp`      ✓  (mọi sàn vẫn đạt)
 *
 * Năm phép đo xanh trong khi màu nhận diện của app biến mất. Đó là lỗ hổng
 * luật này lấp: **sắc là một đại lượng riêng, phải đo riêng.**
 *
 * ── luật ──
 *
 * Lấy nền trang bản SÁNG tại đáy — nơi mọi lớp cộng lại dày nhất — rồi so với
 * `lightPalette.background`:
 *
 *   1. hue lệch ≤ HUE_TOL độ. Giấy ở 38°; 150° là một màu khác hẳn.
 *   2. bão hoà còn ≥ SAT_KEEP phần so với giấy. Sâu đi thì được, nhạt màu đi
 *      thì không — một nền xám là một nền đã mất nhận diện.
 *   3. và nó phải THẬT SỰ sâu đi: nếu đáy bằng đúng đỉnh thì lớp nền không
 *      vẽ gì, và cả cơ chế ấy chỉ là mã chết.
 *
 * Không soi bản TỐI: `#070708` gần như không có sắc (bão hoà ~8% ở mức gần
 * đen), nên "giữ nguyên sắc" không phải một câu có nghĩa ở đó — nhuộm nền tối
 * CHÍNH LÀ việc lớp ấy sinh ra để làm.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NATIVE, hex, loadPalette, over, strip, toHex } from './lib/stack.mjs';

const { palettes } = loadPalette();
const problems = [];

/** Đọc một hằng số thật ra khỏi nguồn, không gõ lại. */
const auraSrc = strip(readFileSync(path.join(NATIVE, 'src/components/ascnd/readiness-aura.tsx'), 'utf8'));
const num = (name) => {
  const m = auraSrc.match(new RegExp(`const ${name}\\s*=\\s*([\\d.]+)`));
  if (m) return Number(m[1]);
  problems.push(`readiness-aura.tsx: không đọc được \`${name}\` — luật này đang canh một cơ chế đã đổi tên`);
  return null;
};
const FLOOR_ALPHA_PAPER = num('FLOOR_ALPHA_PAPER');

/**
 * Màu lớp nền trên giấy, ĐỌC RA khỏi nguồn.
 *
 * Gõ lại `c.accent` ở đây thì đổi nó sang một sắc lạnh trong component vẫn
 * xanh — tức luật canh một thế giới không còn tồn tại, đúng cái bẫy
 * `resting-aura.mjs` đã ghi khi neo của nó lạc lần thứ hai.
 */
const paintExpr = /const floorPaint = paper \? c\.(\w+) :/.exec(auraSrc)?.[1];
if (!paintExpr) {
  problems.push('readiness-aura.tsx: không đọc được màu lớp nền của nhánh giấy (`floorPaint`) — luật dưới không kiểm được gì');
}

const hsl = (c) => {
  const [r, g, b] = c.map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return { h: 0, s: 0, l };
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
};
const lin = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const r1 = (v) => Math.round(v * 10) / 10;

/** Lệch hue lớn nhất còn chấp nhận, tính theo độ trên vòng tròn màu. */
const HUE_TOL = 18;
/** Bão hoà còn lại tối thiểu, theo tỉ lệ so với giấy. */
const SAT_KEEP = 0.75;

if (paintExpr && FLOOR_ALPHA_PAPER !== null) {
  const p = palettes.light;
  const paper = hex(p.background);
  const paint = p[paintExpr];
  if (!paint) {
    problems.push(`readiness-aura.tsx dùng \`c.${paintExpr}\` cho lớp nền giấy, mà bảng màu sáng không có khoá ấy`);
  } else {
    const bottom = over(paint, paper, FLOOR_ALPHA_PAPER);
    const a = hsl(paper);
    const b = hsl(bottom);
    /* Vòng tròn: lệch 350° và lệch 10° là cùng một lệch. */
    const dh = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));

    if (dh > HUE_TOL) {
      problems.push(
        `đáy trang bản sáng ra ${toHex(bottom)} — hue ${r1(b.h)}° so với giấy ${r1(a.h)}°, lệch ${r1(dh)}° ` +
          `(trần ${HUE_TOL}°). Lớp nền đang tô \`c.${paintExpr}\`, một sắc ngoài họ màu của giấy: nó không ` +
          'làm nền sâu hơn, nó TRUNG HOÀ nền — và app mất màu nhận diện mà mọi phép đo tương phản vẫn xanh',
      );
    }
    if (b.s < a.s * SAT_KEEP) {
      problems.push(
        `đáy trang bản sáng bão hoà ${r1(b.s * 100)}% so với giấy ${r1(a.s * 100)}% — còn ` +
          `${r1((b.s / a.s) * 100)}% (sàn ${r1(SAT_KEEP * 100)}%). Sâu đi thì được, NHẠT MÀU đi thì không: ` +
          'một nền xám là một nền đã thôi là giấy',
      );
    }
    /* 3. và lớp ấy phải thật sự làm được việc của nó. */
    if (lum(bottom) >= lum(paper)) {
      problems.push(
        `đáy trang bản sáng KHÔNG sâu hơn đỉnh (${toHex(bottom)} so với ${p.background}) — ` +
          'lớp nền không vẽ ra quãng nào, tức cả cơ chế ấy là mã chết',
      );
    }

    if (!problems.length) {
      console.log(
        `giấy còn là giấy OK — đáy trang bản sáng ra ${toHex(bottom)} sau lớp nền \`c.${paintExpr}\` ở ` +
          `${FLOOR_ALPHA_PAPER} (cả hai đọc ra khỏi readiness-aura.tsx): hue ${r1(b.h)}° so với giấy ` +
          `${r1(a.h)}° — lệch ${r1(dh)}°, trần ${HUE_TOL}°; bão hoà giữ ${r1((b.s / a.s) * 100)}% ` +
          `(sàn ${r1(SAT_KEEP * 100)}%); và nó THẬT SỰ sâu hơn đỉnh. Luật này đo SẮC, thứ mà năm phép đo ` +
          'tương phản quanh nó không nhìn thấy — lần đầu nó đỏ là một lỗi do người dùng tìm ra, không phải công cụ',
      );
    }
  }
}

if (problems.length) {
  console.error('giấy thôi là giấy:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
