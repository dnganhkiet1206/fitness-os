#!/usr/bin/env node
/**
 * Golden cho giờ thói quen (#527 A-NEXT-7 · S1) — `lib/user-rhythm.ts` @ fac9ac2,
 * biên dịch (`build.sh`), không chép tay: `observeHour`, `habit`, `lateHour`,
 * `forward`, `MIN_OBS`, `MIN_R`.
 *
 * Giờ không hữu hạn không viết được trong JSON: mã hoá `"NaN"` / `"Infinity"` /
 * `"-Infinity"`, test Swift giải mã lại.
 *
 *   node gen-user-rhythm.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/user-rhythm-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { emptyHours, observeHour, habit, lateHour, forward, MIN_OBS, MIN_R } = require('./out/user-rhythm.js');

let s = 7707;
const rnd = (n) => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return Math.floor(s / 65536) % n;
};
const enc = (x) => (Number.isFinite(x) ? x : String(x));

// Kiểu người: giờ tập trung quanh một tâm (có lệch), tản mát, quanh nửa đêm,
// lẫn hai cụm, và giờ hỏng / ngoài 0…24.
function hoursFor(kind) {
  const center = rnd(24) + rnd(4) / 4;
  const n = [3, 5, 6, 7, 9, 12, 20][rnd(7)];
  const out = [];
  for (let i = 0; i < n; i++) {
    if (kind === 'tight') out.push(center + (rnd(9) - 4) / 4);
    else if (kind === 'loose') out.push(rnd(96) / 4);
    else if (kind === 'midnight') out.push([23, 23.5, 0, 0.5, 1, 22.75][rnd(6)]);
    else if (kind === 'mixed') out.push(rnd(2) ? center + (rnd(5) - 2) / 2 : center + 12);
    else out.push([NaN, Infinity, -Infinity, -5, 26, 47.5, center][rnd(7)]);
  }
  return out;
}

const KINDS = ['tight', 'loose', 'midnight', 'mixed', 'bad'];
const cases = [];
for (let i = 0; i < 300; i++) {
  const kind = KINDS[rnd(KINDS.length)];
  const hours = hoursFor(kind);
  let st = emptyHours();
  for (const h of hours) st = observeHour(st, h);
  const hb = habit(st);
  const floors = [0, 6, 13, 17.5, 21, 23.75].filter(() => rnd(2));
  cases.push({
    kind,
    hours: hours.map(enc),
    stat: { n: st.n, sin: st.sin, cos: st.cos },
    habit: hb && { hour: hb.hour, strength: hb.strength, spread: hb.spread },
    late: floors.map((f) => ({ floor: f, expected: lateHour(hb, f) })),
  });
}

// Tổng hỏng (dữ liệu đã lưu bị sửa tay / cắt cụt): `habit` phải trả null.
const corrupt = [
  { n: NaN, sin: 1, cos: 1 }, { n: 8, sin: NaN, cos: 0 }, { n: 8, sin: 0, cos: Infinity },
  { n: 0, sin: 0, cos: 0 }, { n: 6, sin: 0, cos: 0 },
].map((st) => ({ stat: { n: enc(st.n), sin: enc(st.sin), cos: enc(st.cos) }, habit: habit(st) }));

const fwd = [[22, 2], [2, 22], [5, 5], [23.5, 0.25], [-3, 4], [30, 1]].map(([a, b]) => ({ a, b, expected: forward(a, b) }));

process.stdout.write(JSON.stringify({ source: 'fac9ac2', MIN_OBS, MIN_R, cases, corrupt, forward: fwd }, null, 1) + '\n');
