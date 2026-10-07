#!/usr/bin/env node
/**
 * Golden cho nhắc nhở (#427): `planReminders` / `planSignature` của
 * `native/src/lib/reminder-plan.ts` và `parseClock` / `toClock` /
 * `suggestedTime` / `worthOffering` của `reminder-timing.ts` — CHÍNH mã RN @
 * fac9ac2 biên dịch.
 *
 * Kế hoạch đọc giờ địa phương (`new Date(y, m, d, h, min)`), nên mỗi ca chạy
 * trong một múi giờ thật: Asia/Ho_Chi_Minh (múi của app) và America/New_York
 * (qua hai lần đổi giờ mùa hè 08/03/2026 và 01/11/2026 — giờ rơi vào khoảng
 * trống / khoảng lặp).
 *
 *   ./build.sh && node gen-reminders.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/reminder-golden.json
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ZONES = ['Asia/Ho_Chi_Minh', 'America/New_York'];

if (process.argv[2] !== '--zone') {
  const self = fileURLToPath(import.meta.url);
  const runs = ZONES.map((tz) =>
    JSON.parse(execFileSync(process.execPath, [self, '--zone'], { env: { ...process.env, TZ: tz }, maxBuffer: 1 << 26 }).toString()),
  );
  process.stdout.write(JSON.stringify({ prefs: runs[0].prefs, plans: runs.flatMap((r) => r.cases), timing: timing() }) + '\n');
  process.exit(0);
}

const { planReminders, planSignature } = require('./out/reminder-plan.js');
const tz = process.env.TZ;

const DEFAULTS = {
  water: { enabled: false, everyHours: 2 },
  supplements: { enabled: false, hour: 9, minute: 0 },
  bedtime: { enabled: false, hour: 22, minute: 30 },
  weighIn: { enabled: false, hour: 7, minute: 0 },
  workout: { enabled: false, hour: 17, minute: 0 },
  meal: { enabled: false, hour: 20, minute: 0 },
  biometrics: { enabled: false, hour: 7, minute: 30 },
  sleepLog: { enabled: false, hour: 8, minute: 0 },
  challengeClaim: { enabled: true },
};
const on = (p, over = {}) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, enabled: true, ...(over[k] ?? {}) }]));
const with_ = (p, over) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, ...(over[k] ?? {}) }]));

const prefsSet = [
  ['defaults', DEFAULTS],
  ['all on', on(DEFAULTS)],
  ['all on water 1h', on(DEFAULTS, { water: { everyHours: 1 } })],
  ['all on water 3h', on(DEFAULTS, { water: { everyHours: 3 } })],
  ['water 4h only', with_(DEFAULTS, { water: { enabled: true, everyHours: 4 } })],
  ['water 2.6h (rounds to 3)', with_(DEFAULTS, { water: { enabled: true, everyHours: 2.6 } })],
  ['water 2.5h (rounds to 3)', with_(DEFAULTS, { water: { enabled: true, everyHours: 2.5 } })],
  ['water 0h (floor 1)', with_(DEFAULTS, { water: { enabled: true, everyHours: 0 } })],
  ['water 13h', with_(DEFAULTS, { water: { enabled: true, everyHours: 13 } })],
  ['workout + bedtime custom', with_(DEFAULTS, { workout: { enabled: true, hour: 6, minute: 15 }, bedtime: { enabled: true, hour: 0, minute: 15 } })],
  ['dst gap 02:30 + ambiguous 01:30', with_(DEFAULTS, { workout: { enabled: true, hour: 2, minute: 30 }, bedtime: { enabled: true, hour: 1, minute: 30 } })],
  ['claims off', with_(DEFAULTS, { challengeClaim: { enabled: false }, meal: { enabled: true } })],
];

const NONE = {
  workedOutToday: false, weighedToday: false, supplementsDone: false, mealLoggedToday: false,
  bioLoggedToday: false, sleepLoggedToday: false, waterDone: false, trainingDays: null, pendingClaims: [],
};
const claim = (id, claimBy) => ({ id, title: `T-${id}`, claimBy, rewardCoins: 100, body: `B-${id}` });

/** "Bây giờ" theo giờ địa phương của múi đang chạy. */
const nows = [
  [2026, 10, 5, 6, 0], [2026, 10, 5, 12, 34], [2026, 10, 4, 23, 59],
  [2026, 3, 7, 23, 0], [2026, 10, 31, 12, 0], [2026, 12, 29, 21, 0],
];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ctxSet = (now) => {
  const today = ymd(now);
  const tomorrow = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const yesterday = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  return [
    ['nothing done', NONE],
    ['all done today', { ...NONE, workedOutToday: true, weighedToday: true, supplementsDone: true, mealLoggedToday: true, bioLoggedToday: true, sleepLoggedToday: true, waterDone: true }],
    ['trains Mon/Wed/Fri', { ...NONE, trainingDays: [0, 2, 4] }],
    ['rest week', { ...NONE, trainingDays: [] }],
    ['claims', { ...NONE, pendingClaims: [claim('a', today), claim('b', tomorrow), claim('c', yesterday), claim('d', '2026-13-40'), claim('e', 'x')] }],
  ];
};

/* Mọi bối cảnh × ba bộ cài đặt chính; mọi bộ cài đặt × bối cảnh trống. Kế
   hoạch ghi gọn `key@ms` (đúng dạng của `planSignature`); chữ riêng chỉ có ở
   lời nhắc nhận thưởng. */
const MAIN = new Set(['defaults', 'all on', 'claims off']);
const cases = [];
for (const [y, m, d, h, mi] of nows) {
  const now = new Date(y, m - 1, d, h, mi, 0, 0);
  for (const [cname, ctx] of ctxSet(now)) for (const [pname, prefs] of prefsSet) {
    if (!(MAIN.has(pname) || cname === 'nothing done')) continue;
    const plan = planReminders(prefs, ctx, now);
    cases.push({
      name: `${tz} ${ymd(now)} ${h}:${mi} · ${pname} · ${cname}`,
      tz, now: now.getTime(), prefs: pname, ctx,
      plan: plan.map((p) => `${p.key}@${p.at.getTime()}`),
      text: plan.filter((p) => p.title != null).map((p) => [p.title, p.body]),
      signature: planSignature(plan),
    });
  }
}
process.stdout.write(JSON.stringify({ prefs: Object.fromEntries(prefsSet), cases }));

function timing() {
  const t = require('./out/reminder-timing.js');
  const clocks = ['07:00', '7:05', '23:30:00', '00:15', ' 22:30 ', '24:00', '12:60', '7:5', '', 'x', '07:00:0', '-1:00', '1:2:3', null];
  const parse = clocks.map((s) => ({ s, out: t.parseClock(s) }));
  const toClock = [-1, 0, 59.5, 60, 1439, 1440, 1441, -30, -1470, 2879.4, 754.5].map((m) => ({ m, out: t.toClock(m) }));
  const knowns = [
    {}, { bedtime: '00:15', waketime: '06:00', workoutHour: 0.5 }, { bedtime: '23:00:00', waketime: '23:50', workoutHour: 18.75 },
    { bedtime: 'bad', waketime: '7:30', workoutHour: Number.NaN }, { bedtime: null, waketime: null, workoutHour: null },
  ];
  const keys = ['supplements', 'bedtime', 'weighIn', 'workout', 'meal', 'biometrics', 'sleepLog'];
  const suggested = knowns.flatMap((known) => keys.map((key) => ({
    key, known: { ...known, workoutHour: Number.isNaN(known.workoutHour) ? 'NaN' : known.workoutHour },
    out: t.suggestedTime(key, known),
  })));
  const pairs = [[[23, 50], [0, 5]], [[7, 0], [7, 19]], [[7, 0], [7, 20]], [[0, 0], [12, 0]], [[22, 30], [22, 10]], [[0, 10], [23, 51]], [[0, 10], [23, 50]]];
  const worth = pairs.map(([a, b]) => ({
    current: { hour: a[0], minute: a[1] }, suggested: { hour: b[0], minute: b[1] },
    out: t.worthOffering({ hour: a[0], minute: a[1] }, { hour: b[0], minute: b[1] }),
  }));
  return { parse, toClock, suggested, worth };
}
