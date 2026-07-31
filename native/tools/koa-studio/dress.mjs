/**
 * The dressing pose, checked rather than watched.
 *
 *   node tools/koa-studio/dress.mjs
 *
 * The pose animates through `matrix` on an animated group, which is the only
 * transform `RNSVGGroup` drives natively — and which `react-native-svg`'s web
 * renderer drops on the floor. So a browser screenshot shows its t=0 frame and
 * nothing else, and **the motion cannot be looked at on the machine this was
 * written on**. It is measured instead, the same way the glance and the weather
 * are.
 *
 * Three things are checked, each a way the pose could be wrong while every
 * screenshot of it looked fine:
 *
 * - **The `ARMS` group still has the shape the pose assumes.** `koa-dress.ts`
 *   reaches the two arm-shading paths by their *position* inside that group,
 *   because the export gives them no `id`. That is a fact about a generated
 *   file. If a re-import reorders it, the arms rise and two grey streaks stay
 *   hanging in the air where the arms were — and nothing else in the codebase
 *   would notice.
 * - **Everything moves, and nothing runs away.** A part whose matrix never
 *   changes across the cycle is a part that is not animating; a part that
 *   travels absurdly far is one whose pivot is wrong.
 * - **The head stays inside the frame.** The figure's viewBox has clipped this
 *   character twice — the ears on a head tilt, and the shadow on a widened
 *   spread — so a new pose that rotates the head gets the clearance measured
 *   before it ships, not after somebody notices a flat edge on an ear.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(path.join(tmpdir(), 'koadress-'));
const entry = path.join(dir, 'e.ts');
writeFileSync(
  entry,
  `export * from '@/components/ascnd/koa/koa-dress';\n` +
    `export { NODES } from '@/components/ascnd/koa/koa-scene';\n` +
    `export * from '@/components/ascnd/koa/koa-frame';\n`,
);
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--format=esm', '--tsconfig=tsconfig.json', `--outfile=${path.join(dir, 'c.js')}`],
  { stdio: 'inherit' },
);
const B = await import(pathToFileURL(path.join(dir, 'c.js')));

let bad = 0;

/* ── 1. the ARMS group is still shaped the way the pose assumes ───────── */

function find(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.kids) {
      const hit = find(n.kids, id);
      if (hit) return hit;
    }
  }
  return null;
}

const arms = find(B.NODES, 'ARMS');
if (!arms) {
  console.log('KHÔNG THẤY nhóm ARMS trong koa-scene.ts');
  bad++;
} else {
  const kids = arms.kids ?? [];
  const want = { 0: 'arm_left_upper', 1: 'arm_right_upper' };
  const ids = kids.map((k) => k.id ?? '—');
  // 4 and 5 are the shading slivers: no id, a fill, and a real opacity
  const sliver = (k) => !k.id && k.a && k.a.fill && (k.a.opacity ?? 1) > 0.2;
  const ok =
    kids.length === 6 &&
    kids[0].id === want[0] &&
    kids[1].id === want[1] &&
    sliver(kids[4]) &&
    sliver(kids[5]);
  if (!ok) bad++;
  console.log(
    `nhóm ARMS có ${kids.length} con: ${ids.join(', ')}\n` +
      (ok
        ? '  đúng thứ tự koa-dress.ts giả định (0,4 = tay trái · 1,5 = tay phải)\n'
        : '  SAI THỨ TỰ — DRESS_ARM_AT trong koa-dress.ts đang trỏ nhầm chỗ\n'),
  );
}

/* ── 2. every part moves, and none of them runs away ──────────────────── */

/**
 * A point on each part, so travel is reported as distance rather than as the
 * matrix's own `f`.
 *
 * The first version printed `m[5]`, which for a rotation about a pivot is
 * mostly the pivot's own offset — it read 128 → 175 for an arm swinging seven
 * degrees. A matrix component is not a measurement of anything a viewer sees.
 */
const PARTS = ['body', 'head', 'armL', 'armR', 'footL', 'footR', 'eyes'];
const STEPS = 96;

const PROBE = {
  body: [120, 200],
  head: [120, 96],
  // the far end of each arm path, which is what a raise actually moves
  armL: [40, 236],
  armR: [200, 236],
  footL: [104, 280],
  footR: [136, 280],
  eyes: [120, 150],
};

/**
 * The eyes are meant to hold still.
 *
 * They carry a constant downward offset — he is looking at what he is wearing,
 * not glancing around — so "this part never changes" is the correct answer for
 * them and a failure for everything else. The first run of this tool called it
 * a bug, which it was not; naming the exception is better than loosening the
 * rule for all seven.
 */
const STILL = ['eyes'];

console.log('mỗi bộ phận, qua một chu kỳ:');
for (const part of PARTS) {
  const [px, py] = PROBE[part];
  let minDeg = 1e9;
  let maxDeg = -1e9;
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  for (let i = 0; i < STEPS; i++) {
    const m = B.dressMat(part, (i / STEPS) * B.DRESS_PERIOD);
    const deg = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    minDeg = Math.min(minDeg, deg);
    maxDeg = Math.max(maxDeg, deg);
    const qx = m[0] * px + m[2] * py + m[4];
    const qy = m[1] * px + m[3] * py + m[5];
    x0 = Math.min(x0, qx);
    x1 = Math.max(x1, qx);
    y0 = Math.min(y0, qy);
    y1 = Math.max(y1, qy);
  }
  const travel = Math.hypot(x1 - x0, y1 - y0);
  const still = STILL.includes(part);
  const moves = still ? travel < 0.05 : travel > 0.5;
  // 150°, not the 90° this was first written at. Ninety was standing in for
  // "the pivot is wrong" — a part rotating about the wrong point swings absurdly
  // — and that is now measured directly and much better by the frame-clearance
  // pass below, which is the thing anybody would actually see. The arms raise
  // through 108° on purpose, and a bound that a correct pose trips is a bound
  // that teaches people to ignore the tool.
  const sane = Math.abs(maxDeg) < 150 && Math.abs(minDeg) < 150;
  if (!moves || !sane) bad++;
  console.log(
    `  ${part.padEnd(6)} xoay ${minDeg.toFixed(1)}° → ${maxDeg.toFixed(1)}°   điểm mốc đi ${travel.toFixed(1)} đv` +
      (still ? '   (phải đứng yên)' : '') +
      (moves ? '' : still ? '   ĐÁNG LẼ ĐỨNG YÊN' : '   ĐỨNG YÊN') +
      (sane ? '' : '   QUAY QUÁ XA'),
  );
}

/* ── 3. the head still fits inside the figure's frame ─────────────────── */

/**
 * Measured off the artwork, not off two coordinates somebody typed.
 *
 * Every number in every path under `HEADRIG` is taken as a point — control
 * points included, which bounds the curves loosely and errs toward saying
 * there is less room than there is. `koa-frame.ts` insets the whole figure by
 * `KOA_INSET`, so what has to fit is the inset point.
 *
 * This exists because the viewBox has clipped this character twice: the ears on
 * a head tilt, and the shadow on a widened spread. A new pose that rotates the
 * head gets its clearance measured before it ships.
 */
/**
 * Every point a path actually visits, per command.
 *
 * Not every pair of numbers in the `d` string. The export uses `A`, whose
 * parameters are `rx ry rot large-arc sweep x y` — pairing those off blindly
 * turns two radii into a point, a rotation and a flag into another, and reports
 * artwork at coordinates the drawing has never been near. The first version of
 * this check did exactly that and came back with the head's leftmost point at
 * x ≈ −6, on a figure whose viewBox starts at 0. It then told me the pose was
 * two units from clipping, which was a number about nothing.
 *
 * Every command in this export is uppercase, so there is no relative-coordinate
 * arithmetic to do — only correct arity. Control points are kept: they bound
 * the curve from outside, which errs toward reporting less room than there is.
 */
function pathPoints(d, out) {
  const tok = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  let cmd = '';
  let i = 0;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    if (i >= tok.length) break;
    if (cmd === 'M' || cmd === 'L') out.push([num(), num()]);
    else if (cmd === 'C') {
      out.push([num(), num()], [num(), num()], [num(), num()]);
    } else if (cmd === 'Q') {
      out.push([num(), num()], [num(), num()]);
    } else if (cmd === 'A') {
      i += 5; // rx ry rot large-arc sweep
      out.push([num(), num()]);
    } else if (cmd === 'Z' || cmd === 'z') {
      // nothing to read
    } else {
      // an unknown command would silently desynchronise the reader
      throw new Error(`lệnh path chưa xử lý: ${cmd}`);
    }
  }
  return out;
}

function pointsUnder(node, out) {
  if (node.a && typeof node.a.d === 'string') pathPoints(node.a.d, out);
  if (node.kids) for (const k of node.kids) pointsUnder(k, out);
  return out;
}

/**
 * The head *and* the arms.
 *
 * The head was the only thing measured at first, on the reasoning that the head
 * is what got clipped before. The arms are the parts that actually travel — a
 * hundred degrees against the head's four — and a raise that puts a paw through
 * the side of the frame is exactly as invisible in a still as the ear clipping
 * was.
 */
for (const [id, part] of [
  ['HEADRIG', 'head'],
  ['arm_left_upper', 'armL'],
  ['arm_right_upper', 'armR'],
]) {
const head = find(B.NODES, id);
const pts = head ? pointsUnder(head, []) : [];
if (!head || pts.length === 0) {
  console.log(`\nKHÔNG ĐỌC ĐƯỢC hình của ${id} — phép đo khung không chạy`);
  bad++;
} else {
  let worst = 1e9;
  let worstAt = 0;
  let side = '';
  for (let i = 0; i < STEPS; i++) {
    const t = (i / STEPS) * B.DRESS_PERIOD;
    const m = B.dressMat(part, t);
    for (const [x, y] of pts) {
      const [ix, iy] = B.inset(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
      const edges = [
        ['trái', ix],
        ['phải', B.KOA_W - ix],
        ['trên', iy],
      ];
      for (const [name, room] of edges) {
        if (room < worst) {
          worst = room;
          worstAt = t;
          side = name;
        }
      }
    }
  }
  /**
   * Three units, not zero.
   *
   * `HEADRIG` carries the export's own `koaBob` — ±0.8° about (120, 180) and
   * 2.5 units of rise — and it composes *on top of* the pose's matrix, which
   * this loop does not model. "Inside the frame" measured without it is not the
   * question anyone cares about. The margin is what stands in for the part not
   * measured, and it is why the sway was cut from 4.2° to 3.2°: at 4.2 this
   * read 0.9 units, which is inside the frame and still wrong.
   */
  const MARGIN = 3;
  const fits = worst > MARGIN;
  if (!fits) bad++;
  console.log(
    `\n${id.padEnd(16)} ${pts.length} điểm, sát khung nhất (t=${worstAt.toFixed(0)}ms, mép ${side}): còn ${worst.toFixed(1)} đơn vị` +
      (fits ? `  đủ lề (cần > ${MARGIN})` : `  KHÔNG ĐỦ LỀ (cần > ${MARGIN})`),
  );
}
}

console.log(bad === 0 ? '\ntư thế mặc đồ hợp lệ' : `\n${bad} lỗi`);
process.exit(bad === 0 ? 0 : 1);
