/**
 * Every pill is made of the same material, and it is not a drop shadow.
 *
 * ── what a shadow cannot do here ──
 *
 * The page is `#070708`. The obvious way to lift a control off it is a drop
 * shadow, and that is what I reached for first: black under a dark pill on a
 * nearly black page. Measured on a rendered screenshot, the pixels immediately
 * outside a pill came back `[9,9,9]` — identical to the page. Black on black
 * separates nothing, and the four `shadow*` props were not even drawn on web,
 * so the harness could not have told me either way.
 *
 * ── what does work is the material ──
 *
 * The assistant's state pill — the one that says "waiting for today's data" —
 * is a `LiquidGlass`: a dark blur, a lit top edge, and a shade falling to the
 * bottom right. That is what makes a surface read as raised on a dark page, and
 * it is a *material*, not a shadow. Every pill in the app now uses it, tinted
 * by the thing it contains: its glyph's colour, or the colour of the service it
 * opens.
 *
 * ── what this rule is actually protecting ──
 *
 * Two failures, and neither one looks like a bug in review.
 *
 * Somebody replaces the glass with a flat fill and a border, because that is
 * cheaper and looks nearly the same in a diff — and the pills go back to lying
 * flat on the page. Or somebody adds a `shadow*` recipe on top, because pills
 * should have shadows, and it costs a compositing pass to draw nothing.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

/** Every screen with pills, and how many glass ones it should have. */
const USERS = [
  ['src/app/(tabs)/index.tsx', 1, 'bốn nút log trên Today (một chỗ render, lặp qua danh sách)'],
  ['src/app/(tabs)/workouts.tsx', 3, 'lịch tập tuần, bài tập, ghi buổi tập'],
  ['src/components/ascnd/music-launch.tsx', 1, 'hai chip nhạc (một chỗ render)'],
];

for (const [file, want, what] of USERS) {
  const code = strip(read(file));

  /* ── 1. it is made of the material, not of a fill and a border ── */
  const glasses = [...code.matchAll(/<LiquidGlass\b/g)].length;
  if (glasses < want) {
    problems.push(
      `${file} chỉ còn ${glasses} pill dùng <LiquidGlass>, chờ ${want} (${what}). Thay kính bằng một nền ` +
        'phẳng cộng viền trông gần như y hệt trong diff, và pill quay lại nằm bẹt trên nền — trên trang ' +
        '#070708 thì chất liệu mới là thứ nhấc được, không phải bóng đổ',
    );
  }

  /* ── 2. and each one is lit by what it holds ── */
  const tinted = [...code.matchAll(/<LiquidGlass[^>]*\btint=/g)].length;
  if (glasses > 0 && tinted < glasses) {
    problems.push(
      `${file}: ${glasses - tinted} pill kính không truyền \`tint\`. Kính không màu là kính xám — mỗi ` +
        'pill phải được thắp bằng chính thứ nó chứa: màu glyph của nó, hoặc màu dịch vụ nó mở',
    );
  }

  /* ── 3. nobody bolts a shadow back on ── */
  if (/shadowOpacity|shadowRadius|shadowOffset|boxShadow/.test(code)) {
    problems.push(
      `${file} thêm bóng đổ lên pill. Đo trên ảnh chụp: bóng đen dưới pill tối trên trang #070708 vẽ ra ` +
        'ĐÚNG KHÔNG GÌ — điểm ảnh ngay ngoài pill là [9,9,9], y hệt nền — nên đó là một lượt ghép hình ' +
        'để không được gì. Chiều sâu ở đây đến từ chất liệu kính: mép trên sáng và bóng đổ về góc dưới-phải',
    );
  }
}

/* ── 4. and the glass keeps its own recipe in one place ── */
{
  const lg = strip(read('src/components/ascnd/liquid-glass.tsx'));
  for (const [what, re] of [
    ['lớp blur', /<BlurView\b/],
    ['mép sáng', /lgEdge|lgLit/],
    ['bóng trong lòng kính', /lgShade/],
  ]) {
    if (!re.test(lg)) {
      problems.push(
        `LiquidGlass mất ${what} — đó là thứ làm mặt phẳng đọc ra là được nhấc lên, và mọi pill trong ` +
          'app giờ dựa vào nó',
      );
    }
  }
}

if (problems.length) {
  console.log('pill nổi CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

const total = USERS.reduce((n, u) => n + u[1], 0);
console.log(
  `pill nổi OK — ${total} pill trên ${USERS.length} màn đều dùng <LiquidGlass>, cùng chất liệu với pill ` +
    '"đang chờ dữ liệu hôm nay" bên trợ lý: blur tối, mép trên sáng, bóng đổ về góc dưới-phải. Mỗi cái ' +
    'truyền `tint` nên được thắp bằng chính thứ nó chứa — màu glyph, hoặc màu dịch vụ với hai chip nhạc. ' +
    'Không pill nào gắn thêm bóng đổ: đo trên ảnh chụp thì bóng đen dưới pill tối trên trang #070708 vẽ ' +
    'ra đúng không gì (điểm ảnh ngay ngoài pill là [9,9,9], y hệt nền), nên chiều sâu ở đây là việc của ' +
    'chất liệu chứ không phải của shadow',
);
