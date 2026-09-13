/**
 * Chữ hạng hai phải đọc được qua CẢ CHỒNG, không phải qua một lớp.
 *
 * ── điều tôi tưởng đã biết, và đo ra thì ngược ──
 *
 * Bảng màu đo `mutedForeground` trên một MẶT THẺ — "a dark, still surface",
 * đúng chữ trong chú thích của nó. Phép đo ấy đúng cho app hiện tại, nơi trang
 * phẳng và thẻ đặc.
 *
 * Redesign đổi cả hai vế cùng lúc: trang có lớp sáng (`Screen aura`), và thẻ
 * trở nên trong suốt (bốn tầng `Material.glass`). Chữ giờ ngồi trên
 *
 *     trang → wash → lớp dập → mặt kính → (có thể một mặt kính nữa)
 *
 * và không phép đo nào trong repo tính chồng ấy. Đo ra:
 *
 *     `mutedForeground` trên kính primary phủ wash tím   4,37:1  ✗
 *     cùng chỗ, kính elevated                            3,53:1  ✗
 *     kính floating ĐẶT TRÊN một thẻ primary             3,25:1  ✗
 *
 * Hai diện mạo hỏng theo hai chiều NGƯỢC nhau, và đó là phần dễ đoán sai nhất:
 * trong phòng tối kính là ánh sáng cộng thêm nên tầng càng cao mặt càng sáng,
 * tiến lại gần chữ xám; trên giấy kính là độ đục nên tầng càng cao càng CHE
 * wash đi, và chữ lại dễ đọc hơn. Một người sửa bản tối cho đẹp rồi suy ra bản
 * sáng cũng thế sẽ suy ngược.
 *
 * ── đáp án đã có sẵn trong repo ──
 *
 * `glassMuted` (#c8ccd4 tối / #5c564b sáng) sinh ra đúng cho tình huống này ở
 * hai màn trợ lý, nơi `#828282` đo được 2,57:1 trên kính-trên-aura. Ở mọi chỗ
 * trên nó cho 6,77–11,21. Nên luật không đòi đổi token nào; nó đòi màn có wash
 * phải DÙNG token đúng — `useMuted()` trong `hooks/use-wash.tsx`.
 *
 * ── luật, một câu ──
 *
 * Với mỗi màn bật `aura`, mọi tầng kính nó có thể dùng phải giữ chữ hạng hai
 * ≥ 4,5:1 ở điểm xấu nhất. Nếu không thì hoặc hạ tầng, hoặc hạ wash, hoặc dùng
 * `glassMuted` — và luật nói ra cả ba lối.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

/* Phép chồng "trang → hai vũng → lớp dập → mặt kính" và các hằng thật của nó
   sống ở `lib/stack.mjs`, vì `sleep-ramp.mjs` cũng đo trên đúng cái nền ấy —
   cho MÀU CỘT thay vì cho CHỮ. Hai bản chép sẽ cùng xanh trong khi đo hai cái
   nền khác nhau, và đó là hạng lỗi kho này đã ghi lại bằng chữ của nó. */
import {
  AURA_ALPHA, AURA_DIM, NATIVE, PAPER_ALPHA,
  auraScreens, faceFor, hex, loadPalette, ratio, rgba, strip,
} from './lib/stack.mjs';

const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const problems = [];
const screens = auraScreens();
const { palettes, materials } = loadPalette();

const FLOOR = 4.5;
let checked = 0;

for (const { file, tints } of screens) {
  for (const theme of ['dark', 'light']) {
    const p = palettes[theme];
    const m = materials[theme];

    for (const tier of ['secondary', 'primary', 'floating', 'elevated']) {
      if (!rgba(m.glass[tier].bg)) {
        problems.push(`${theme}.glass.${tier}.bg không phải rgba(): "${m.glass[tier].bg}"`);
        continue;
      }
      /* Điểm xấu nhất của tầng NỔI — trên một thẻ `primary` chứ không trên
         trang trần — nằm trong `faceFor`; xem chú thích của nó. */
      const face = faceFor(theme, tints, tier);
      const asHex = '#' + face.map((v) => v.toString(16).padStart(2, '0')).join('');
      const rMuted = ratio(hex(p.mutedForeground), face);
      const rGlass = ratio(hex(p.glassMuted), face);
      checked += 2;
      if (rMuted < FLOOR && rGlass < FLOOR) {
        problems.push(
          `${file} · ${theme} · tầng \`${tier}\` trên wash ${tints.join('+')}: mặt ra ${asHex}, ` +
            `CẢ HAI token chữ phụ đều trượt (mutedForeground ${rMuted.toFixed(2)}, glassMuted ${rGlass.toFixed(2)}, ` +
            `sàn ${FLOOR}). Hạ độ mờ của tầng, hạ wash, hoặc thôi đặt chữ phụ lên tầng ấy`,
        );
      } else if (rGlass < FLOOR) {
        problems.push(
          `${file} · ${theme} · tầng \`${tier}\`: \`glassMuted\` chỉ còn ${rGlass.toFixed(2)}:1 trên ${asHex}. ` +
            'Token dành riêng cho kính-trên-wash mà không đủ trên chính chỗ ấy thì nó thôi có nghĩa',
        );
      }
    }
  }
}

/* Màn có wash phải THẬT SỰ dùng token đúng — nếu không, phép đo ở trên chứng
   minh một thứ màn ấy không dùng. */
for (const { file } of screens) {
  const s = strip(read(file));
  if (!/useMuted\s*\(/.test(s)) {
    problems.push(
      `${file}: bật \`aura\` nhưng không gọi \`useMuted()\` — chữ hạng hai vẫn đang là ` +
        '`mutedForeground`, thứ chỉ được đo trên một mặt thẻ phẳng không wash',
    );
  }
}

if (!screens.length) {
  problems.push('không màn nào bật `aura` — bộ quét lạc mục tiêu, hoặc lớp sáng lại mất hết chỗ gọi');
}

if (problems.length) {
  console.error('chồng kính ăn chữ:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `chồng kính OK — ${screens.length} màn bật lớp sáng, ${checked} phép đo trên bảng màu THẬT (biên dịch ` +
    `rồi gọi) và trên đúng ba hằng đọc ra khỏi nguồn (AURA_ALPHA ${AURA_ALPHA} · PAPER_ALPHA ${PAPER_ALPHA} ` +
    `· AURA_DIM ${AURA_DIM}). Chồng được tính đủ: trang → hai vũng ở đỉnh → lớp dập → mặt kính, và tầng nổi ` +
    'còn cộng thêm một thẻ primary dưới nó. Hai diện mạo hỏng NGƯỢC chiều nhau — tối thì tầng càng cao mặt ' +
    'càng sáng lại gần chữ xám, sáng thì tầng càng cao càng che wash đi — nên không suy bên này ra bên kia được',
);
