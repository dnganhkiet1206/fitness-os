#!/usr/bin/env node
/**
 * Golden cho lời Koa / "việc kế tiếp" của tab Hôm nay (#527, bản thiết kế
 * `docs/design/today`) — `lib/mascot-message.ts` (`mascotLine`, `GAP_FROM`,
 * `GAP_SPAN`) @ fac9ac2 BIÊN DỊCH (`build.sh`), không chép tay.
 *
 * Ca: ngày có / thiếu số (một ô `null` là cả ngày chưa biết), mọi giờ 0…23,
 * thứ tự ưu tiên ngẫu nhiên (kể cả mục lạ 'steps' và mục trùng), giờ bắt đầu
 * riêng (`dueFrom`) ngẫu nhiên.
 *
 *   node gen-mascot-line.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/mascot-line-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mascotLine, GAP_FROM, GAP_SPAN } = require('./out/mascot-message.js');

let s = 20261012;
const rnd = (n) => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return Math.floor(s / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];
const THINGS = ['sleep', 'meal', 'water', 'workout'];

const cases = [];
for (let i = 0; i < 1200; i++) {
  const day = {
    sleepMin: rnd(12) === 0 ? null : pick([0, 0, 420, 35.5]),
    meals: rnd(12) === 0 ? null : pick([0, 0, 1, 3]),
    waterPct: rnd(12) === 0 ? null : pick([0, 10, 49.9, 50, 80, 120]),
    workouts: rnd(12) === 0 ? null : pick([0, 0, 1, 2]),
    hour: rnd(24),
  };
  let order;
  if (rnd(3) > 0) {
    order = Array.from({ length: rnd(6) }, () => pick([...THINGS, 'steps']));
  }
  let dueFrom;
  if (rnd(3) === 0) {
    dueFrom = {};
    for (const t of THINGS) if (rnd(2) === 0) dueFrom[t] = pick([0, 5, 9, 13, 18, 22, 23]);
  }
  const line = mascotLine(day, order, dueFrom);
  cases.push({ day, order: order ?? null, dueFrom: dueFrom ?? null, line });
}

process.stdout.write(
  JSON.stringify({ GAP_FROM, GAP_SPAN, cases }).replace(/\},\{"day"/g, '},\n{"day"') + '\n',
);
