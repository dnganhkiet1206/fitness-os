/**
 * The travelling highlight, checked as geometry rather than as prose.
 *
 * ── what this is guarding ──
 *
 * `pick-row.tsx` draws a moving highlight in three pieces — a half-disc at each
 * end and a rectangle stretched between them — because the alternatives were
 * both already rejected in this repository: animating `width` re-runs layout
 * every frame (`tools/motion.mjs`), and `scaleX` on a single rounded pill
 * squashes its caps (`progress-bar.tsx`, which rendered both at 6× before
 * deciding).
 *
 * Three pieces that have to add up is arithmetic, and arithmetic goes wrong
 * quietly. It already did: the first version made each cap a full stadium `2r`
 * wide with the middle running underneath both. Every piece was in the right
 * place, the union was the right shape, and on an opaque fill it was perfect.
 * On `edit-profile`, whose highlight is `rgba(168,178,196,0.12)`, the overlaps
 * painted their alpha twice and drew two brighter discs at the ends of the
 * selected chip. Nothing threw. `tsc` was clean. Every other rule was green. It
 * took a screenshot of a screen the harness had never opened.
 *
 * So the pieces are pulled back out of the source and made to TILE: together
 * they must cover the chip exactly once — no gap, no double-paint — at every
 * width, including the degenerate one where the chip is barely wider than its
 * own corners.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = 'src/components/ascnd/pick-row.tsx';
const src = readFileSync(path.join(NATIVE, COMPONENT), 'utf8');
const problems = [];

/* ── 1. the three pieces tile the chip exactly ── */
{
  const grab = (name) => {
    const m = src.match(new RegExp(`const ${name} = useAnimatedStyle[\\s\\S]*?\\}\\)\\);`));
    if (!m) return null;
    const tx = m[0].match(/translateX:\s*(.+?)\s*\}/);
    /* `}` as the terminator, not `,` — the middle's scale is
       `Math.max(0, w.value - r * 2)`, and cutting at the first comma left
       `Math.max(0`, which is not a syntax error until it is evaluated. */
    const sx = m[0].match(/scaleX:\s*(.+?)\s*\}/);
    return tx ? { tx: tx[1].trim(), sx: sx ? sx[1].trim() : null } : null;
  };
  /* Widths live in JSX, on their own line each, next to the piece they size. */
  const widths = [...src.matchAll(/^\s*width: (r|1),$/gm)].map((m) => m[1]);

  const L = grab('left');
  const M = grab('mid');
  const R = grab('right');

  if (!L || !M || !R || widths.length < 3) {
    problems.push(
      'không lấy được hình học ba mảnh ra khỏi pick-row.tsx (left / mid / right và bề rộng của chúng). ' +
        'Cấu trúc đã đổi, nên luật này đang không kiểm gì cả — sửa luật trước khi tin nó',
    );
  } else {
    const ev = (expr, x, w, r) =>
      Function('x', 'w', 'r', 'Math', `return ${expr.replace(/x\.value/g, 'x').replace(/w\.value/g, 'w')}`)(
        x, w, r, Math,
      );
    /* Widths in source order: left, mid, right. `1` is the mid's unscaled unit. */
    const wid = (t, w, r) => (t === 'r' ? r : t === '1' ? 1 : w);
    const CASES = [
      [0, 120, 17], [40, 70, 17], [0, 34, 17], [0, 35, 17], [0, 200, 3], [0, 64, 16],
    ];
    for (const [x, w, r] of CASES) {
      let spans;
      try {
        spans = [
          [ev(L.tx, x, w, r), wid(widths[0], w, r)],
          [ev(M.tx, x, w, r), wid(widths[1], w, r) * ev(M.sx ?? '1', x, w, r)],
          [ev(R.tx, x, w, r), wid(widths[2], w, r)],
        ];
      } catch (e) {
        problems.push(`không tính được hình học ở (w=${w}, r=${r}): ${e.message}`);
        break;
      }
      const [a, b, c] = spans;
      const end = (s) => s[0] + s[1];
      if (Math.abs(a[0] - x) > 0.001) {
        problems.push(`w=${w} r=${r}: mảnh trái bắt đầu ở ${a[0]} chứ không phải mép chip ${x}`);
      }
      if (Math.abs(end(c) - (x + w)) > 0.001) {
        problems.push(`w=${w} r=${r}: mảnh phải kết thúc ở ${end(c)} chứ không phải mép chip ${x + w}`);
      }
      if (Math.abs(b[0] - end(a)) > 0.001) {
        problems.push(
          `w=${w} r=${r}: mảnh giữa bắt đầu ở ${b[0]} trong khi mảnh trái kết thúc ở ${end(a)} — ` +
            (b[0] < end(a)
              ? 'CHỒNG LÊN NHAU. Nền trong suốt bị tô hai lần sẽ ra một màu khác, đúng lỗi đã vẽ hai đĩa sáng ở hai đầu chip trong edit-profile'
              : 'HỞ MỘT KHE. Nền trang sẽ lọt qua giữa thân pill'),
        );
      }
      if (Math.abs(c[0] - end(b)) > 0.001) {
        problems.push(
          `w=${w} r=${r}: mảnh phải bắt đầu ở ${c[0]} trong khi mảnh giữa kết thúc ở ${end(b)} — ` +
            (c[0] < end(b) ? 'CHỒNG LÊN NHAU' : 'HỞ MỘT KHE'),
        );
      }
    }
  }
}

/* ── 2. only the outer corners are round ──

   A cap that rounds all four corners is a stadium, and a stadium `r` wide is a
   circle: the inner edge would curve away from the middle and leave two notches
   where they meet. Only the outside of the pill is round. */
{
  for (const [side, keep, drop] of [
    ['trái', ['borderTopLeftRadius', 'borderBottomLeftRadius'], 'borderTopRightRadius'],
    ['phải', ['borderTopRightRadius', 'borderBottomRightRadius'], 'borderTopLeftRadius'],
  ]) {
    for (const k of keep) {
      if (!new RegExp(`${k}: r`).test(src)) {
        problems.push(`mảnh ${side} không còn bo góc ngoài (${k}) — pill sẽ có góc vuông ở đầu`);
      }
    }
    void drop;
  }
  if (/\bborderRadius: r,\n\s*backgroundColor: fill/.test(src)) {
    problems.push(
      'một mảnh đầu đang bo CẢ BỐN góc — mảnh rộng r mà bo tròn hết là một hình tròn, và cạnh trong ' +
        'của nó sẽ cong ra khỏi thân pill để lại hai vết khuyết ở chỗ ghép',
    );
  }
}

/* ── 3. nothing is mounted before it has been measured ──

   `progress-bar.tsx` paid for this one: `useAnimatedStyle` freezes the style it
   computes on its first render, so a worklet mounted while the measurement is
   still 0 freezes at 0 and only corrects itself if the value later moves. There
   it was a bar drawn full on an empty day. Here it would be a highlight parked
   at the left edge with no width. */
{
  if (!/!here \? null/.test(src) && !/here \?/.test(src)) {
    problems.push(
      'pick-row.tsx không còn hoãn việc gắn dấu chọn cho tới khi ĐO XONG — useAnimatedStyle đóng băng ' +
        'style của lần render đầu, nên gắn lúc số đo còn 0 là đóng băng ở 0',
    );
  }
}

/* ── 4. the fill is not optional-and-forgettable ──

   While it was optional, a caller who passed nothing got
   `backgroundColor: undefined`: a highlight travelling perfectly and invisibly.
   Required means the compiler catches it. */
{
  if (!/^  fill: string;$/m.test(src)) {
    problems.push(
      '`fill` của PickRow không còn là prop BẮT BUỘC — để nó tuỳ chọn thì một chỗ gọi quên truyền sẽ ' +
        'nhận backgroundColor: undefined, tức một dấu chọn chạy đúng và VÔ HÌNH',
    );
  }
}

if (problems.length) {
  console.log('dấu chọn di chuyển CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'dấu chọn di chuyển OK — hình học ba mảnh được LẤY RA khỏi source và CHẠY THẬT ở 6 kích thước, kể cả ' +
    'chip vừa đúng bằng hai góc bo của nó: ba mảnh lát kín chip đúng một lần, không hở khe và không ' +
    'chồng nhau (bản đầu chồng nhau, và trên nền rgba(...,0.12) của edit-profile nó tô hai lần thành ' +
    'hai đĩa sáng ở hai đầu — tsc sạch, mọi luật khác xanh, chỉ ảnh chụp mới thấy); mỗi đầu chỉ bo góc ' +
    'NGOÀI; dấu chọn không được gắn trước khi đo xong (useAnimatedStyle đóng băng style của lần render ' +
    'đầu — progress-bar.tsx đã trả giá bằng một thanh đầy trong ngày trống); và `fill` là prop BẮT ' +
    'BUỘC, vì lúc nó còn tuỳ chọn thì quên truyền là được một dấu chọn chạy đúng và vô hình',
);
