#!/usr/bin/env node
/**
 * Golden cho toán thuần của Koa (#527, K1) @ fac9ac2 — CHÍNH mã RN biên dịch:
 * `koa-flags.ts` (`koaFlags`), phần toán trích nguyên văn từ `koa-figure.tsx`
 * (`lib/koa-math.ts`, xem `extract-koa.mjs`), `koa-pose.ts` (`REST_MAT`,
 * `restsAt`), `koa-dress.ts` (`dressMat`), `figure-clock.ts` (`stepClock`),
 * `koa-frame.ts` (`KOA_INSET_MAT`). `headMatOf` / `eyeMatOf` của `koa-gaze.ts`
 * chép nguyên văn (tệp ấy kéo theo côn trùng của phòng).
 *
 *   node gen-koa.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/koa-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { koaFlags, KOA_SLOTS, KOA_ITEMS, KOA_EXPRESSIONS, KOA_POSES } = require('./out/koa-flags.js');
const M = require('./out/koa-math.js');
const { KEYFRAMES, NODES } = require('./out/koa-scene.js');
const { REST_MAT, restsAt } = require('./out/koa-pose.js');
const { dressMat } = require('./out/koa-dress.js');
const { stepClock } = require('./out/figure-clock.js');
const { KOA_INSET_MAT } = require('./out/koa-frame.js');

// koa-gaze.ts, nguyên văn
const HEAD_TILT = 3.6, HEAD_TURN = 0.9, HEAD_LIFT = 3, PUPIL_SHIFT = 4.4;
const HEAD_PIVOT = [120, 105];
const IDENTITY = [1, 0, 0, 1, 0, 0];
function place(deg, cx, cy, tx, ty) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, cx - (c * cx - s * cy) + tx, cy - (s * cx + c * cy) + ty];
}
function headMatOf(g) {
  if (g.k <= 0) return IDENTITY;
  return place(HEAD_TILT * g.x * g.k, HEAD_PIVOT[0], HEAD_PIVOT[1], HEAD_TURN * g.x * g.k, HEAD_LIFT * g.y * g.k);
}
function eyeMatOf(g) {
  if (g.k <= 0) return IDENTITY;
  return [1, 0, 0, 1, PUPIL_SHIFT * g.x * g.k, PUPIL_SHIFT * 0.7 * g.y * g.k];
}

let seed = 1717;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

// cờ: mọi biểu cảm × tư thế, kèm vài bộ đồ
const flags = [];
for (const e of KOA_EXPRESSIONS) for (const p of KOA_POSES) {
  const worn = {};
  for (const slot of KOA_SLOTS) if (rnd(3) === 0) worn[slot] = pick(KOA_ITEMS[slot]);
  flags.push({ e: e.key, p: p.key, worn, out: koaFlags(e.key, p.key, worn), rests: restsAt(koaFlags(e.key, p.key, worn)) });
}

// mọi chuỗi transform / hoạt ảnh có thể đưa xuống, cộng vài chuỗi lạ
const strings = new Set();
for (const f of flags) for (const v of Object.values(f.out)) if (typeof v === 'string') strings.add(v);
for (const s of ['rotate(-12.5)', 'translateX(3) translateY(-4.5)', 'scale(1.2)', 'scaleX(.5) scaleY(-1)', 'rotate(10 20 30) scale(2,3)', 'translate(5)', 'koaBob 2.4s ease-out 0.6s infinite', 'animation:koaX 1s linear infinite;translate:0 -3px', 'translate: 4px', 'foo']) strings.add(s);
const parse = [...strings].map((s) => ({ s, ops: M.parseOps(s), anim: M.parseAnim(s) }));

// ma trận của từng phép
const ops = [];
for (let i = 0; i < 120; i++) {
  const k = pick(['r', 'r', 't', 's']);
  const op = k === 'r' ? (rnd(2) ? ['r', rnd(720) / 4 - 90] : ['r', rnd(720) / 4 - 90, rnd(240), rnd(300)]) : k === 't' ? ['t', rnd(80) - 40, rnd(80) - 40] : ['s', rnd(30) / 10, rnd(30) / 10];
  ops.push(op);
}
const opMats = ops.map((op) => ({ op, m: M.opMat(op) }));
const lists = [];
for (let i = 0; i < 60; i++) {
  const list = Array.from({ length: rnd(4) }, () => pick(ops));
  const ox = pick([0, 0, 120, 80.5]), oy = pick([0, 0, 178, 294]);
  lists.push({ ops: list, ox, oy, m: M.opsMat(list, ox, oy) });
}

// đường cong
const ease = [];
for (const kind of ['lin', 'out', 'io']) for (let i = 0; i <= 40; i++) ease.push({ kind, t: i / 40, v: M.ease(i / 40, kind) });

// mọi rãnh keyframe ở nhiều t, vài gốc
const tracks = [];
for (const [k, tr] of Object.entries(KEYFRAMES)) {
  for (const kind of ['lin', 'out', 'io']) for (const t of [0, 0.1, 0.25, 0.33, 0.5, 0.71, 0.9, 1]) {
    const o = pick([[0, 0], [120, 294], [160, 178]]);
    tracks.push({
      k, kind, t, ox: o[0], oy: o[1],
      m: tr.tf && tr.tf.length ? M.sampleMat(tr.tf, t, kind, o[0], o[1]) : null,
      v: tr.op && tr.op.length ? M.sampleOp(tr.op, t, kind) : null,
    });
  }
}

const rest = Object.fromEntries(Object.entries(REST_MAT).map(([k, v]) => [k, v.slice(7, -1).split(' ').map(Number)]));

const dress = [];
for (const part of ['hop', 'body', 'head', 'armL', 'armR', 'footL', 'footR', 'eyes']) for (const t of [0, 137, 550, 1100, 1650, 2199, 2200, 4567.5]) for (const k of [1, 0.5, 0]) {
  dress.push({ part, t, k, m: dressMat(part, t, k) });
}

const clock = [];
for (let i = 0; i < 30; i++) {
  const c = { value: 0 }, last = { value: -1 };
  const steps = [];
  let t = rnd(1000);
  for (let j = 0; j < 12; j++) {
    t += pick([0, 4, 8, 16, 16.6, 17, 33, -5]);
    const frameMs = pick([1000 / 60, 1000 / 30]);
    stepClock(c, last, t, frameMs);
    steps.push({ t, frameMs, clock: c.value, last: last.value });
  }
  clock.push(steps);
}
seed = 1717 + 99;

const gaze = [];
for (let i = 0; i < 40; i++) {
  const g = { x: rnd(21) / 10 - 1, y: rnd(21) / 10 - 1, k: pick([0, 0.3, 1, -0.2]) };
  gaze.push({ g, head: headMatOf(g), eye: eyeMatOf(g) });
}

process.stdout.write(JSON.stringify({
  inset: KOA_INSET_MAT.slice(7, -1).split(' ').map(Number),
  nodeCount: (function count(ns) { return ns.reduce((n, x) => n + 1 + count(x.kids ?? []), 0); })(NODES),
  keyframeCount: Object.keys(KEYFRAMES).length,
  flags, parse, opMats, lists, ease, tracks, rest, dress, gaze, clock,
}) + '\n');
