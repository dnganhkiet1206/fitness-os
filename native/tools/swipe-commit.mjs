/**
 * Số học của cú vuốt: hàng đi ĐÚNG quãng ngón tay, và ngưỡng cam kết là hai
 * phần ba quãng mở THẬT.
 *
 *     node tools/swipe-commit.mjs
 *
 * ── phạm vi, và vì sao nó hẹp ──
 *
 * Luật này KHÔNG có ý kiến gì về phần trình bày — parallax, cái nảy lúc mở
 * xong, nút nở, màu, hình. Những thứ ấy đang được lặp theo phản hồi trực tiếp
 * của chủ dự án, và một luật viết quanh chúng sẽ đỏ ở ngay lượt sửa sau.
 *
 * Nó canh hai con số mà cả hai đều đã từng sai theo cách không ai nhìn thấy:
 *
 *   1. `friction`. Trong `ReanimatedSwipeable` nó là số CHIA
 *      (`offsetDrag = userDrag / friction`), nên `friction: 2` — giá trị tệp
 *      này từng mang — làm hàng đi NỬA quãng ngón tay. Không khung hình nào
 *      rơi, `tsc` xanh, ảnh chụp tĩnh không thấy gì; thứ duy nhất lộ ra là cảm
 *      giác, và chủ dự án gọi nó là *"card bị kéo theo sau"*.
 *
 *   2. Ngưỡng cam kết. Chú thích ở chỗ khai nó nói "two thirds of the open
 *      width" và giá trị là một HẰNG SỐ ĐƠN, trong khi quãng mở là
 *      `OPEN_W × số nút` (tấm nút rộng đúng thế). Nên câu ấy chỉ đúng ở hàng
 *      MỘT nút:
 *
 *          1 nút   47,5 / 72   = 66%   ← đúng câu chú thích
 *          2 nút   47,5 / 144  = 33%
 *          3 nút   47,5 / 216  = 22%
 *
 *      Hàng càng nhiều nút càng dễ mở nhầm, mà nó lại là hàng mở ra xa nhất —
 *      và thẻ "Cần làm hôm nay" có cả hai loại trên cùng một màn.
 *
 * Hai vế ấy bền: chúng là số học của cử chỉ, không phải thị hiếu.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NATIVE } from './lib/stack.mjs';

const ROW = 'src/components/ascnd/swipe-row.tsx';
const LIB = 'node_modules/react-native-gesture-handler/src/components/ReanimatedSwipeable/ReanimatedSwipeable.tsx';

const problems = [];
const notes = [];

/* Chú thích bỏ đi TRƯỚC khi tìm: đoạn giải thích ngay trên mỗi chỗ sửa trích
   nguyên văn giá trị CŨ (`friction: 2`, và cả bảng 47,5/72 ở trên), và một cái
   neo bắt được chính lời giải thích về nó thì không phải một cái neo. */
const code = readFileSync(path.join(NATIVE, ROW), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

/* ── 1. hàng đi đúng quãng ngón tay ── */
const fr = /friction=\{(\d+(?:\.\d+)?)\}/.exec(code);
if (!fr) {
  problems.push(
    `${ROW}: không còn khai \`friction\`. Bỏ trống là rơi về \`DEFAULT_FRICTION\` của thư viện — hôm nay `
      + 'nó là 1, nhưng đó là một mặc định có thể đổi ở lần nâng gói sau, và CẢ cảm giác lẫn ngưỡng cam kết '
      + 'đều treo vào nó. Khai ra',
  );
} else if (Number(fr[1]) !== 1) {
  problems.push(
    `${ROW}: \`friction={${fr[1]}}\` — hàng đi ${(1 / Number(fr[1])).toFixed(2)} lần quãng ngón tay. `
      + '`friction` là số CHIA trong `ReanimatedSwipeable` (`offsetDrag = userDrag / friction`), nên mọi giá '
      + 'trị khác 1 đều là "hàng chạy sau ngón tay". Tệp này đã mang 2 một lần và không gì bắt được',
  );
} else {
  notes.push('friction 1 (đo trên bản dựng: hệ số bám 1,000)');
}

/* Và mặc định của thư viện phải VẪN là 1 — nếu không, dòng "bỏ trống thì vẫn
   1:1" ở trên thành một lời trấn an sai. */
const libDefault = /const DEFAULT_FRICTION = (\d+)/.exec(readFileSync(path.join(NATIVE, LIB), 'utf8'));
if (libDefault && Number(libDefault[1]) !== 1) {
  problems.push(
    `${LIB}: \`DEFAULT_FRICTION\` nay là ${libDefault[1]}, không phải 1. Khai tường minh ở app vẫn đúng, `
      + 'nhưng mọi chú thích nói "mặc định là 1:1" đã hết hiệu lực — đọc lại chúng',
  );
}

/* ── 2. ngưỡng cam kết theo số nút ── */
const openW = /const OPEN_W = (\d+)/.exec(code);
const frac = /const COMMIT_FRACTION = ([\d.]+)/.exec(code);
if (!openW || !frac) {
  problems.push(
    `${ROW}: không đọc được \`OPEN_W\` hoặc \`COMMIT_FRACTION\`. Hình học nút đã được viết lại — mở ra đọc `
      + 'bằng mắt rồi sửa luật, đừng để nó xanh suông',
  );
} else if (!/const commitAt = \(count: number\) =>/.test(code)) {
  problems.push(
    `${ROW}: không còn \`commitAt(count)\`. Ngưỡng cam kết quay về một hằng số đơn, nên "hai phần ba quãng `
      + 'mở" chỉ còn đúng ở hàng MỘT nút — hàng ba nút sẽ cam kết ở 22% và mở nhầm ở một cú lướt',
  );
} else {
  for (const [side, prop] of [['phải', 'rightThreshold'], ['trái', 'leftThreshold']]) {
    const re = new RegExp(`${prop}[:=]\\s*\\{?commitAt\\((right|left)Set\\.length\\)`);
    if (!re.test(code)) {
      problems.push(
        `${ROW}: \`${prop}\` (mép ${side}) không gọi \`commitAt(…Set.length)\`. Một ngưỡng không đếm nút là `
          + 'một ngưỡng chỉ đúng ở hàng một nút',
      );
    }
  }
  const W = Number(openW[1]);
  const F = Number(frac[1]);
  if (!(F > 0.5 && F < 0.9)) {
    problems.push(
      `${ROW}: \`COMMIT_FRACTION\` là ${F}. Dưới 0,5 thì một cú lướt ngang trong lúc cuộn để lại hàng mở; `
        + 'trên 0,9 thì gần như phải kéo hết quãng mới tính là mở, và khoảnh khắc "đã quyết nhưng chưa xong" '
        + '— chỗ cái haptic nổ — biến mất',
    );
  }
  notes.push(
    `ngưỡng ${[1, 2, 3].map((n) => `${n} nút ${Math.round(W * n * F)}đ`).join(' · ')} (đều là ${Math.round(F * 100)}% quãng mở)`,
  );
}

if (problems.length) {
  console.error('số học cú vuốt sai:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `số học cú vuốt OK — ${notes.join(' · ')}. Luật này CỐ Ý hẹp: nó không có ý kiến về parallax, cái nảy lúc `
    + 'mở xong, nút nở hay màu — những thứ đang được lặp theo phản hồi trực tiếp, và một luật viết quanh '
    + 'chúng sẽ đỏ ngay lượt sửa sau. Nó canh hai con số đã từng sai mà không ai nhìn thấy: `friction` là số '
    + 'CHIA nên 2 làm hàng đi nửa quãng ngón tay (tệp này đã mang 2 một lần), và ngưỡng cam kết phải nhân '
    + 'theo số nút vì quãng mở là `OPEN_W × số nút` — một hằng số đơn khiến hàng ba nút cam kết ở 22% trong '
    + 'khi chú thích ngay trên nó nói "hai phần ba". Kèm một chốt ở thư viện: `DEFAULT_FRICTION` phải vẫn là '
    + '1, không thì mọi câu "mặc định là 1:1" trong tệp đã hết hiệu lực',
);
