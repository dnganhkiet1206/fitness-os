/**
 * Chữ mờ phải đọc được trên MỌI mặt nó thật sự đứng lên.
 *
 *     node tools/muted-ground.mjs
 *
 * ── lỗi nó sinh ra để sửa ──
 *
 * `mutedForeground` được chọn khi chữ mờ đứng trên TRANG hoặc trên MẶT THẺ. Đo
 * cả bốn mặt thật của bản tối thì tầng thứ ba trượt:
 *
 *     trang            #070708   5,24:1  ✓
 *     mặt thẻ          #161617   4,71:1  ✓
 *     khối trên trang  #161617   4,71:1  ✓
 *     ô lõm trong thẻ  #242425   4,04:1  ✗
 *
 * Bản tối dựng mặt bằng cách CỘNG DỒN lớp phủ trắng — trang, rồi thẻ +6%, rồi
 * ô lõm +6% nữa — nên tầng ba sáng hơn hẳn và ăn hết biên của chữ mờ. Bản sáng
 * không có vấn đề ấy: ô lõm trên giấy đi XUỐNG khỏi mặt thẻ trắng.
 *
 * Nhãn ô macro ("PROTEIN") là chỗ chủ dự án nhìn thấy nó. Lỗi ấy có từ lâu và
 * chưa cửa nào bắt được.
 *
 * ── vì sao không cửa nào bắt được ──
 *
 *   `palette.mjs`     đo TOKEN trên trang và mặt thẻ — hai mặt đầu, cả hai xanh
 *   `text-color`      hỏi chữ CÓ màu không
 *   `same-color`      hỏi chữ có TRÙNG nền không — 4,04 thì không trùng
 *   `ink-alpha`       chỉ có thẩm quyền với `alpha(m.ink, x)`
 *   `live.mjs`        chụp được, nhưng 4,04 và 4,6 trông y hệt nhau
 *
 * Chỗ hổng là TẦNG THỨ BA: mọi luật màu của kho đo chữ trên trang hoặc trên
 * thẻ, và không luật nào hỏi "còn khi nó nằm trong một ô lõm TRONG thẻ thì
 * sao". Một chồng ba tầng chỉ tồn tại ở bản tối, và chỉ ở đó nó mới đủ sáng để
 * thành vấn đề.
 *
 * ── luật ──
 *
 * Chồng mặt được DỰNG LẠI từ bảng màu đang ship, không gõ lại con số nào: trang
 * → mặt thẻ → ô lõm, mỗi tầng composite bằng chính giá trị material của theme
 * ấy. Rồi hỏi từng vai chữ mờ xem nó qua sàn 4,5 (WCAG 1.4.3) trên những mặt
 * nó ĐƯỢC PHÉP đứng lên:
 *
 *     mutedForeground   trang · mặt thẻ · khối trên trang
 *     mutedOnInset      ô lõm trong thẻ
 *
 * Và vế thứ hai, quan trọng ngang vế đầu: `mutedForeground` KHÔNG được qua sàn
 * trên ô lõm. Nghe ngược đời, nhưng nó là thứ giữ cho token thứ hai có lý do
 * tồn tại — nếu một ngày chồng mặt đổi và `mutedForeground` tự qua được, thì
 * `mutedOnInset` thành một bản sao thừa và luật này phải nói ra thay vì để nó
 * nằm đó mãi.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NATIVE, hex, loadPalette, overC, ratio, toHex } from './lib/stack.mjs';

const FLOOR = 4.5;
const problems = [];
const { palettes, materials } = loadPalette();

/** Một giá trị material (`'#hex'` hoặc `'rgba(…)'`) phủ lên một nền. */
const over = (v, ground) => {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(v);
  if (!m) return hex(v);
  return overC([+m[1], +m[2], +m[3]], ground, m[4] === undefined ? 1 : +m[4]);
};

/**
 * Bốn mặt THẬT của một theme, dựng lại từ bảng màu chứ không gõ lại.
 *
 * `m.bg` là mặt thẻ và `m.inset.bg` là ô con; ở bản tối cả hai là lớp phủ mờ
 * nên chúng CỘNG DỒN, ở bản sáng cả hai là màu đục nên tầng sau thay hẳn tầng
 * trước. Một phép `over` duy nhất diễn tả được cả hai, và đó chính là lý do
 * chồng này phải được tính chứ không được liệt kê.
 */
function stackOf(theme) {
  const p = palettes[theme];
  const m = materials[theme];
  const page = hex(p.background);
  const card = over(m.bg, page);
  return {
    'trang': page,
    'mặt thẻ': card,
    'khối trên trang': over(m.onPage, page),
    'ô lõm trong thẻ': over(m.inset.bg, card),
  };
}

/** Vai nào được đứng trên mặt nào. */
const ROLES = {
  mutedForeground: ['trang', 'mặt thẻ', 'khối trên trang'],
  mutedOnInset: ['ô lõm trong thẻ'],
};

const lines = [];
for (const theme of ['light', 'dark']) {
  const stack = stackOf(theme);
  for (const [role, grounds] of Object.entries(ROLES)) {
    const colour = palettes[theme][role];
    if (!colour) {
      problems.push(`bảng ${theme} không còn token \`${role}\` — luật này đang canh một vai không tồn tại`);
      continue;
    }
    for (const g of grounds) {
      const r = ratio(hex(colour), stack[g]);
      lines.push(`${theme}/${role} trên ${g} ${r.toFixed(2)}`);
      if (r >= FLOOR) continue;
      problems.push(
        `${theme}: \`${role}\` (${colour}) trên ${g} (${toHex(stack[g])}) chỉ ${r.toFixed(2)}:1, dưới sàn ` +
          `${FLOOR} của chữ nhỏ (WCAG 1.4.3). Mặt ấy được dựng lại từ chính bảng màu đang ship, nên con ` +
          'số này là thứ người dùng thật sự nhìn thấy, không phải một ước lượng',
      );
    }
  }
}

/*
  Vế thứ hai: `mutedOnInset` phải còn LÝ DO tồn tại.

  Nếu `mutedForeground` tự qua được sàn trên ô lõm thì token thứ hai chỉ còn là
  một bản sao — và một bản sao không ai biết là thừa sẽ ở lại mãi. Cùng phép
  gác mà `motion.mjs` đặt cho `COMPOSED` và `empty-writer.mjs` cho `DELIBERATE`:
  một ngoại lệ phải chết khi lý do của nó chết.
*/
const darkInset = stackOf('dark')['ô lõm trong thẻ'];
const plain = ratio(hex(palettes.dark.mutedForeground), darkInset);
if (plain >= FLOOR) {
  problems.push(
    `\`mutedForeground\` của bản tối nay đạt ${plain.toFixed(2)}:1 trên ô lõm — qua sàn. Chồng mặt đã ` +
      'đổi, nên `mutedOnInset` thành một bản sao thừa: gộp hai vai lại và xoá token kia đi, đừng để nó ' +
      'nằm đó với một lý do đã hết hiệu lực',
  );
}

/* Và chỗ chủ dự án nhìn thấy lỗi phải THẬT SỰ dùng vai mới. */
const CARD = 'src/components/ascnd/dashboard-cards.tsx';
const src = readFileSync(path.join(NATIVE, CARD), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
for (const name of ['macroLabel', 'macroTarget', 'macroNote']) {
  const m = new RegExp(`${name}:\\s*\\{[^{}]*color:\\s*c\\.(\\w+)`).exec(src);
  if (!m) {
    problems.push(`${CARD}: không còn style \`${name}\` — ô macro đã viết lại, đọc lại luật này bằng mắt`);
  } else if (m[1] !== 'mutedOnInset') {
    problems.push(
      `${CARD}: \`${name}\` dùng \`c.${m[1]}\` — ba dòng chữ ấy nằm trên \`macroTile\`, một ô LÕM trong ` +
        'một thẻ, nơi `mutedForeground` chỉ còn 4,04:1 ở bản tối. Đây đúng chỗ chủ dự án nhìn thấy lỗi',
    );
  }
}

if (problems.length) {
  console.error('chữ mờ không đọc được trên mặt nó đứng:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `nền của chữ mờ OK — dựng lại chồng mặt THẬT từ bảng màu đang ship (trang → mặt thẻ → ô lõm, mỗi tầng ` +
    `composite bằng chính giá trị material của theme ấy) rồi đo ${lines.length} cặp vai-trên-mặt, tất cả ` +
    `≥${FLOOR}: ${lines.join(' · ')}. Chỗ hổng nó lấp là TẦNG THỨ BA — mọi luật màu khác đo chữ trên ` +
    'trang hoặc trên thẻ, không luật nào hỏi "còn khi nó nằm trong một ô lõm TRONG thẻ thì sao", và một ' +
    'chồng ba tầng chỉ đủ sáng để thành vấn đề ở bản tối. Luật cũng bắt `mutedOnInset` phải còn lý do ' +
    `tồn tại: \`mutedForeground\` trên ô lõm tối vẫn là ${plain.toFixed(2)}:1, tức vẫn dưới sàn`,
);
