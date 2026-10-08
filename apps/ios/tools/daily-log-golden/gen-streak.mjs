#!/usr/bin/env node
/**
 * Golden cho chuỗi ngày (#66, widget "Chuỗi + Sẵn sàng") — CHÍNH `streakFrom`
 * của `native/src/lib/streak.ts` (dùng chung với huy chương ở RN).
 *
 *   ./build.sh && node gen-streak.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/streak-golden.json
 *
 * Ngày là chuỗi YYYY-MM-DD; phép trừ ngày của RN đi qua `Date` địa phương nên
 * chạy ở một múi có đổi giờ (Anh) để bắt lệch quanh ngày 25 giờ.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

if (!process.env.GOLDEN_CHILD) {
  process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TZ: 'Europe/London', GOLDEN_CHILD: '1' } }));
  process.exit(0);
}
const require = createRequire(import.meta.url);
const { streakFrom } = require('./out/streak.js');
const { shiftLocalDate } = require('./out/local-date.js');

let s = 7;
const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const TODAYS = ['2026-10-27', '2026-10-25', '2026-10-26', '2026-03-29', '2026-03-30', '2026-01-01', '2028-03-01'];
const cases = [];
for (let i = 0; i < 400; i++) {
  const today = TODAYS[i % TODAYS.length];
  const days = [];
  // Một dải ngày gần hôm nay (có thể lệch 0, 1, 2 ngày), lỗ rải rác, đôi khi ngày tương lai.
  let cursor = shiftLocalDate(today, Math.floor(r() * 4) - (r() < 0.15 ? 2 : 0));
  const n = Math.floor(r() * 30);
  for (let k = 0; k < n; k++) {
    days.push(cursor);
    cursor = shiftLocalDate(cursor, -(r() < 0.8 ? 1 : 2 + Math.floor(r() * 3)));
  }
  const datesDesc = [...new Set(days)].sort().reverse();
  const frozen = [];
  if (r() < 0.5) {
    for (let k = 0; k < 1 + Math.floor(r() * 4); k++) frozen.push(shiftLocalDate(today, -Math.floor(r() * 20) + (r() < 0.1 ? 1 : 0)));
    if (r() < 0.3) frozen.push(today);
  }
  cases.push({ datesDesc, today, frozen, expected: streakFrom(datesDesc, today, frozen) });
}
cases.push({ datesDesc: [], today: '2026-10-27', frozen: [], expected: streakFrom([], '2026-10-27', []) });
process.stdout.write(JSON.stringify({ cases }));
