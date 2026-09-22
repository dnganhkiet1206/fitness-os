/**
 * Glyph của Health Assistant phải có màu cho CẢ HAI diện mạo.
 *
 *     node tools/glyph-theme.mjs
 *
 * ── lỗi nó sinh ra để sửa ──
 *
 * Chủ dự án: *"sửa lại màu trong health assistant bản sáng"*.
 *
 * `GLYPH_TINT` là bảng tint THỨ TÁM của kho. Bảy bảng kia đã chuyển sang khoá
 * bảng màu ở đợt hạ tầng GĐ1 để mỗi theme tự trả lời; bảng này bị bỏ sót và giữ
 * hai mã màu NEON của bản tối cho mỗi glyph. Đo cả bảng trên kính trắng:
 *
 *     16/20 glyph có màu nhận diện dưới sàn 3:1 của WCAG 1.4.11
 *     đầu NHẠT của gradient nằm ở 1,00–1,55
 *     `arrow`, `chevron`, `plus` bắt đầu từ đúng #ffffff trên mặt trắng
 *
 * ── vì sao không cửa nào bắt được ──
 *
 * `liquid-glass.tsx` đã ghi lại một NỬA lỗi này và chữa nửa ấy — nó tắt lớp
 * wash trên giấy, vì một vùng neon phủ 100% mặt thẻ là "thẻ hồng / thẻ oải
 * hương / thẻ đào" mà bản QA máy thật liệt kê. Chú thích ấy cũng nói vì sao
 * `tint-area.mjs` mù với nó: *"nó đọc `backgroundColor` trong các style và so
 * với token bảng màu. Ở đây màu là `GLYPH_TINT` — mã màu neon viết cứng, KHÔNG
 * có nhánh theme — và nó vào qua `fill` của một `<Rect>` SVG."*
 *
 * Và câu kết của nó nói rõ nửa còn lại được CỐ Ý để nguyên: *"Màu giữ nguyên
 * vai của nó ở những dấu nhỏ — ô tròn sau glyph, viền của tấm đang chọn, chấm
 * trạng thái."* Nửa ấy chưa ai đo, và nó là nửa chủ dự án nhìn thấy.
 *
 * ── luật, ba vế ──
 *
 * 1. Mỗi ô của bảng là một KHOÁ bảng màu, không phải một mã màu. Một mã màu
 *    viết thẳng không lật được theo theme, và đó chính xác là lỗi này.
 * 2. Giá trị SÁNG của mỗi khoá qua sàn 3:1 trên kính trắng.
 * 3. Giá trị TỐI của mỗi khoá bằng ĐÚNG mã màu mà nó thay thế. Đây là vế giữ
 *    cho việc chuyển bảng này là một phép ĐỔI TÊN chứ không phải một lần đổi
 *    thiết kế lén: bản tối không được xê dịch một điểm ảnh nào. Bảng ghim bên
 *    dưới là bản chụp mã màu cũ, chép từ `git show` chứ không gõ lại theo trí
 *    nhớ.
 *
 * Cộng một vế gác: `DARK_HILITE` phải phủ đủ mọi glyph. Thiếu một ô thì điểm
 * dừng đầu của gradient là `undefined`, và `<Stop stopColor={undefined}>` không
 * ném — nó vẽ ra ĐEN.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NATIVE, hex, loadPalette, overC, ratio, toHex } from './lib/stack.mjs';

const GRAPHIC = 3;
const ICONS = 'src/components/ascnd/assistant-icons.tsx';
const problems = [];
const { palettes, materials } = loadPalette();

/**
 * Mã màu NHẬN DIỆN của từng glyph trước khi bảng chuyển sang khoá.
 *
 * Ghim ở đây để vế 3 có thứ đối chiếu. Nếu một ngày bản tối thật sự cần đổi
 * màu một glyph thì sửa ô tương ứng ở đây KÈM lý do — chứ không phải để luật
 * xanh suông trong khi hai bên đã trôi khỏi nhau.
 */
/*
  ── SÁU GIÁ TRỊ DỜI MỐC, 22/09 ──

  `heart`, `trash` (readinessRed) · `bolt`, `alert` (readinessYellow) ·
  `leaf`, `gauge` (readinessGreen) đọc màu qua khoá bảng màu, và ba khoá ấy vừa
  được đổi theo một quyết định của chủ dự án: bộ ba sẵn sàng ở bản tối trải
  2,53× trong khi bản sáng trải 1,01×, nên cả ba về cùng CR 9,1. Lý do đầy đủ
  nằm ở chỗ khai chúng trong `palette.ts` và ở `tools/dark-frozen.mjs`.

  Sáu glyph này đi theo, và đó là ĐÚNG hệ quả của việc chúng đọc khoá chứ không
  gõ mã màu — nếu chúng không đi theo thì phép chuyển sang khoá đã là một lời
  nói dối. Cả sáu vẫn thừa sàn 3:1 của đồ hoạ: đỏ 9,09 · vàng 9,11 · lục 9,12
  trên trang, so với 5,78 / 14,62 / 14,12 trước đây.

  ── một câu hỏi CHƯA được trả lời, ghi ra để không ai tưởng là đã ──

  `trash` và `alert` mượn bộ ba sẵn sàng làm sắc chung chứ không mang nghĩa
  "trạng thái hôm nay" — chúng là hành động xoá và một cảnh báo. Trước lượt này
  `readinessRed` tình cờ trùng đúng `destructive` (#ff3b5c), nên không ai phải
  chọn. Nay hai giá trị ấy tách ra, và `trash` mềm đi một bậc. Chỉ về
  `destructive`/`readinessYellow` là một quyết định THIẾT KẾ riêng, không phải
  hệ quả của lượt này, nên nó không được làm ở đây.
*/
const FROZEN_DARK = {
  heart: '#ff8d92', moon: '#8b5cff', flame: '#ff9130', bolt: '#cdac00',
  leaf: '#00c785', pulse: '#3ba6ff', spark: '#b45cff', gauge: '#00c785',
  sliders: '#a8afbd', arrow: '#c8ccd4', camera: '#ff9130', calendar: '#22e3ff',
  home: '#a8afbd', chevron: '#c8ccd4', plus: '#c8ccd4', clock: '#a8afbd',
  trash: '#ff8d92', user: '#a8afbd', alert: '#cdac00', dumbbell: '#7f9cc4',
};

const src = readFileSync(path.join(NATIVE, ICONS), 'utf8');
const slice = (marker) => {
  const i = src.indexOf(marker);
  return i < 0 ? null : src.slice(i, src.indexOf('\n};', i));
};

const tintSrc = slice('export const GLYPH_TINT');
const hiliteSrc = slice('const DARK_HILITE');
if (!tintSrc || !hiliteSrc) {
  console.error('không tìm được bảng tint của glyph:');
  console.error(
    `  ✗ ${ICONS}: thiếu \`GLYPH_TINT\` hoặc \`DARK_HILITE\` — bảng đã được viết lại. Đọc lại bằng mắt `
      + 'rồi sửa luật, đừng để nó xanh suông',
  );
  process.exit(1);
}

/* Vế 1: mỗi ô là một KHOÁ. Một mã màu lọt vào đây là lỗi cũ quay lại. */
for (const m of tintSrc.matchAll(/(\w+):\s*'(#[0-9a-fA-F]{3,8})'/g)) {
  problems.push(
    `${ICONS}: \`${m[1]}\` khai một mã màu viết thẳng (\`${m[2]}\`) thay vì một khoá bảng màu. Một mã màu `
      + 'không lật được theo theme — đó chính xác là cách 16/20 glyph thành neon của bản tối trên kính trắng',
  );
}

const keys = [...tintSrc.matchAll(/(\w+):\s*'([A-Za-z]\w*)'/g)].map((m) => ({ g: m[1], k: m[2] }));
const hilite = new Set([...hiliteSrc.matchAll(/(\w+):\s*'#[0-9a-fA-F]{6}'/g)].map((m) => m[1]));

/* Kính TRẮNG của màn ấy: `materials.light.primary.bg` phủ lên trang. */
const glassOf = (t) => {
  const bg = materials[t].glass.primary.bg;
  const mm = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(bg);
  const ground = hex(palettes[t].background);
  return mm ? overC([+mm[1], +mm[2], +mm[3]], ground, mm[4] === undefined ? 1 : +mm[4]) : hex(bg);
};
const lightGlass = glassOf('light');

const lines = [];
for (const { g, k } of keys) {
  const L = palettes.light[k];
  const D = palettes.dark[k];
  if (!L || !D) {
    problems.push(`${ICONS}: \`${g}\` trỏ tới khoá \`${k}\`, thứ không có trong bảng màu`);
    continue;
  }
  /* Vế 2 — bản sáng phải đọc được. */
  const r = ratio(hex(L), lightGlass);
  lines.push(`${g} ${r.toFixed(2)}`);
  if (r < GRAPHIC) {
    problems.push(
      `bản sáng: glyph \`${g}\` (\`c.${k}\` = ${L}) chỉ ${r.toFixed(2)}:1 trên kính trắng `
        + `(${toHex(lightGlass)}), dưới sàn ${GRAPHIC} của WCAG 1.4.11 cho một hình mang nghĩa`,
    );
  }
  /* Vế 3 — bản tối không được xê dịch. */
  const was = FROZEN_DARK[g];
  if (!was) {
    problems.push(
      `${ICONS}: glyph \`${g}\` không có trong bảng ghim của luật — nó là glyph MỚI. Thêm nó vào `
        + '`FROZEN_DARK` bằng chính mã màu bản tối của nó, để vế "đổi tên chứ không đổi thiết kế" còn hiệu lực',
    );
  } else if (D.toLowerCase() !== was) {
    problems.push(
      `bản tối: glyph \`${g}\` nay là ${D} qua \`c.${k}\`, nhưng nó vốn là ${was}. Việc chuyển bảng này `
        + 'sang khoá phải là một phép ĐỔI TÊN — bản tối không được xê dịch một điểm ảnh. Nếu đây là một lần '
        + 'đổi thiết kế có chủ ý thì sửa `FROZEN_DARK` kèm lý do',
    );
  }
  /* Vế gác — thiếu một đầu nhạt thì `<Stop>` vẽ ra ĐEN, không ném. */
  if (!hilite.has(g)) {
    problems.push(
      `${ICONS}: \`DARK_HILITE\` không có \`${g}\`. Điểm dừng đầu sẽ là \`undefined\`, và `
        + '`<Stop stopColor={undefined}>` không ném — nó vẽ ra ĐEN, chỉ ở bản tối, chỉ ở một glyph',
    );
  }
}

/*
  Và bản SÁNG không được có đầu nhạt.

  Nhạt hơn màu nhận diện nghĩa là gần mặt kính trắng hơn — đúng con số đã hỏng
  (1,00 cho `arrow`). `glyphStops` phải trả cùng một màu cho cả hai điểm dừng
  trên giấy; nếu một ngày ai đó dựng một gradient cho bản sáng thì nó phải đi
  theo hướng ĐẬM hơn, và đó là một quyết định cần đo lại chứ không phải một dòng
  sửa nhanh.
*/
const stops = slice('export function glyphStops');
if (!stops || !/lit \?\s*\[DARK_HILITE\[name\], ink\]\s*:\s*\[ink, ink\]/.test(stops)) {
  problems.push(
    `${ICONS}: \`glyphStops\` không còn trả \`[ink, ink]\` trên giấy. Bản sáng có một đầu nhạt nghĩa là `
      + 'một điểm dừng gần mặt kính trắng hơn màu nhận diện — đúng hình dạng của lỗi vừa sửa',
  );
}

if (problems.length) {
  console.error('glyph của Health Assistant chỉ biết một diện mạo:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `màu glyph OK — ${keys.length} glyph, mỗi cái là một KHOÁ bảng màu chứ không phải mã màu, và cả ${keys.length} `
    + `đều qua sàn ${GRAPHIC}:1 trên kính trắng ${toHex(lightGlass)} (thấp nhất ${Math.min(...lines.map((l) => +l.split(' ')[1])).toFixed(2)}). `
    + 'Trước đó 16/20 dưới sàn, và đầu nhạt của gradient nằm ở 1,00–1,55 — `arrow`, `chevron`, `plus` bắt đầu '
    + 'từ đúng #ffffff trên một mặt trắng. Vế thứ ba giữ cho phép chuyển này là một lần ĐỔI TÊN: mọi giá trị '
    + 'bản tối vẫn khớp từng byte với mã màu nó thay thế, đối chiếu bằng một bảng ghim. Chỗ hổng nó lấp đã '
    + 'được `liquid-glass.tsx` ghi ra một nửa — nửa ấy tắt lớp wash trên giấy, và câu kết của nó nói rõ nửa '
    + 'còn lại được cố ý để nguyên ở "những dấu nhỏ". Nửa còn lại là nửa này',
);
