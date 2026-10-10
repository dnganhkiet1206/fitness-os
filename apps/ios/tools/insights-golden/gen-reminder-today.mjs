#!/usr/bin/env node
/**
 * Golden cho bốn tín hiệu "hôm nay" của kế hoạch nhắc nhở (#527 A-NEXT-4) —
 * `hooks/use-reminders.ts` @ fac9ac2.
 *
 * `mealDone` / `sleepDone` là mã RN biên dịch (`lib/todo.ts`, qua `build.sh`).
 * Hai vế còn lại là biểu thức trong hook, chép NGUYÊN VĂN:
 * - `weighedToday: !!todayWeight`, với `todayWeight` = `data ? Number(data.weight_kg) : null`
 *   (`useTodayWeight`, `use-fitness-data.ts:84`);
 * - `bioLoggedToday: todayBio != null` (`useTodayBiometrics` trả `data` của `maybeSingle`).
 * `useTodaySleep` trả `mainSleep(data)` — có hàng thì không null — nên vế
 * `todaySleep != null` ở đây là "có hàng".
 *
 *   node gen-reminder-today.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/reminder-today-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mealDone, sleepDone } = require('./out/todo.js');

let s = 4045;
const rnd = (n) => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return Math.floor(s / 65536) % n;
};
const pick = (a) => a[rnd(a.length)];

// Giá trị cột như PostgREST trả (số / chuỗi numeric / null) và vài giá trị hỏng.
const VALUES = [null, 0, '0', 1, 70, '70.5', -5, '-1', 'abc', '', 0.4, 2000];

const cases = [];
for (let i = 0; i < 240; i++) {
  const weightRow = rnd(3) ? { weight_kg: pick(VALUES) } : null;
  const dailyLog = rnd(4) ? { kcal: pick(VALUES), sleep_duration_min: pick(VALUES) } : null;
  const sleepRows = rnd(2) ? [{ id: `s${i}` }] : [];
  const bioRow = rnd(2) ? { id: `b${i}` } : null;
  // use-reminders.ts — nguyên văn
  const todayWeight = weightRow ? Number(weightRow.weight_kg) : null;
  const todaySleep = sleepRows.length ? sleepRows[0] : null;
  const todayBio = bioRow;
  cases.push({
    weightRows: weightRow ? [weightRow] : [],
    dailyLogRows: dailyLog ? [dailyLog] : [],
    sleepRows,
    bioRows: bioRow ? [bioRow] : [],
    expected: {
      weighedToday: !!todayWeight,
      mealLoggedToday: mealDone(dailyLog?.kcal),
      sleepLoggedToday: sleepDone(todaySleep != null, dailyLog?.sleep_duration_min),
      bioLoggedToday: todayBio != null,
    },
  });
}

process.stdout.write(JSON.stringify({ source: 'fac9ac2', cases }, null, 1) + '\n');
