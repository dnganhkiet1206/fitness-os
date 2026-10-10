#!/usr/bin/env node
/**
 * Golden cho "Koa để ý" giờ tập (#527 A-NEXT-7 · S2 + S3, E) @ fac9ac2.
 *
 * - `watch`: chuỗi lần đọc `useDailyQuests` → các lần `noteDone` — CHÍNH khối
 *   `seen` / `seenDay` / `before && !before[key]` của
 *   `hooks/use-quest-autoclaim.ts:139-147, 230-234` (chép nguyên văn: file hook
 *   không biên dịch riêng được), `unclaimed` như `use-daily-quests.ts:141-143`
 *   trên `DAILY_QUESTS` / `questRefKey` biên dịch.
 * - `offer`: quan sát giờ nguyên (`getHours()`) → `observeHour` / `habit`
 *   biên dịch (`user-rhythm.ts`) → `SOURCE.workout` (`app/reminders.tsx:76-77`,
 *   `formatClock` biên dịch) → `offer` (`:192-198`, `suggestedTime` /
 *   `worthOffering` biên dịch).
 *
 *   node gen-quest-habit.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/quest-habit-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DAILY_QUESTS, questRefKey } = require('./out/mascot-room.js');
const { observeHour, habit, emptyHours } = require('./out/user-rhythm.js');
const { suggestedTime, worthOffering, formatClock } = require('./out/reminder-timing.js');

let seed = 5150;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const KEYS = DAILY_QUESTS.map((q) => q.key);

// ── watch ──
const watch = [];
for (let i = 0; i < 150; i++) {
  // Trạng thái của hook (`useRef`) — nguyên văn.
  const seen = { current: null };
  const seenDay = { current: null };
  let today = '2026-10-0' + (1 + rnd(3));
  let done = Object.fromEntries(KEYS.map((k) => [k, rnd(4) === 0]));
  const claimed = new Set();
  const readings = [];
  for (let k = 0, n = 2 + rnd(9); k < n; k++) {
    if (rnd(8) === 0) {
      today = today.slice(0, 9) + String(Math.min(9, Number(today[9]) + 1));
      done = Object.fromEntries(KEYS.map((q) => [q, false]));
    }
    for (const q of KEYS) if (!done[q] && rnd(4) === 0) done[q] = true;
    for (const q of KEYS) if (done[q] && rnd(6) === 0) claimed.add(questRefKey(today, q));
    if (rnd(12) === 0) for (const q of KEYS) if (done[q] && rnd(3) === 0) done[q] = false; // sửa / xoá
    const stepsAvailable = rnd(5) !== 0;
    const ready = rnd(10) !== 0;
    const hour = rnd(24);
    const activeDefs = DAILY_QUESTS.filter((q) => q.key !== 'steps' || stepsAvailable !== false);
    const unclaimed = activeDefs.filter((q) => done[q.key] && !claimed.has(questRefKey(today, q.key))).map((q) => q.key);
    const quests = { ready, today, done: { ...done }, unclaimed };

    const notes = [];
    // use-quest-autoclaim.ts:139-147 + 230-234 — nguyên văn (bỏ phần nhận xu / peek).
    if (quests.ready) {
      if (seenDay.current !== quests.today) {
        seenDay.current = quests.today;
        seen.current = null;
      }
      const before = seen.current;
      seen.current = { ...quests.done };
      for (const key of quests.unclaimed) {
        if (before && !before[key]) notes.push({ quest: key, hour });
      }
    }
    readings.push({ ready, today, done: { ...done }, unclaimed, hour, notes });
  }
  watch.push({ readings });
}

// ── offer ──
const offer = [];
for (let i = 0; i < 160; i++) {
  const center = rnd(24);
  const width = [0, 0, 1, 2, 4, 12][rnd(6)];
  const n = rnd(10);
  let s = emptyHours();
  const hours = [];
  for (let k = 0; k < n; k++) {
    const h = (center + rnd(2 * width + 1) - width + 24) % 24;
    hours.push(h);
    s = observeHour(s, h);
  }
  const workout = habit(s);
  const known = { bedtime: null, waketime: null, workoutHour: workout?.hour ?? null };
  const source = workout ? formatClock({ hour: Math.round(workout.hour), minute: 0 }) : null;
  const r = { enabled: rnd(4) !== 0, hour: rnd(24), minute: [0, 15, 30, 45][rnd(4)] };
  const suggested = suggestedTime('workout', known);
  // reminders.tsx:192-198 — nguyên văn.
  const o = r.enabled && suggested && source && worthOffering(r, suggested) ? suggested : null;
  offer.push({ hours, habit: workout ? workout.hour : null, source, row: r, offer: o });
}

process.stdout.write(JSON.stringify({ watch, offer }, null, 1) + '\n');
