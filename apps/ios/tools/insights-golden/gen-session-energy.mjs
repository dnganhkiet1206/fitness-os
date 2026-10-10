#!/usr/bin/env node
/**
 * Golden cho kcal ước lượng mỗi buổi (#527, SessionEnergy) — `lib/energy.ts`
 * + `activity.ts` + `prescription.ts` + `fitness-calc.ts` + `plausible.ts` @
 * fac9ac2, biên dịch (`build.sh`), không chép tay: `RT_MET`, `metForSession`,
 * `trainingMinutes`, `restingKcalPerMin`, `sessionActiveKcal`,
 * `energyProfileFrom`, `sessionKcalOf`.
 *
 * `calcAge` đọc `new Date()`: ở đây `Date` không đối số bị ghim vào trưa của
 * một "hôm nay" ghi trong từng ca (`today`), và tiến trình chạy với `TZ=UTC`
 * — test Swift truyền đúng ngày ấy vào, không đọc đồng hồ.
 *
 * Số không hữu hạn không viết được trong JSON: `"NaN"` / `"Infinity"` /
 * `"-Infinity"`. `undefined` (trường vắng) là khoá không có mặt.
 *
 *   TZ=UTC node gen-session-energy.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/session-energy-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

if (process.env.TZ !== 'UTC') throw new Error('chạy với TZ=UTC');

const RealDate = Date;
let NOW = new RealDate(2026, 9, 10, 12).getTime();
class PinnedDate extends RealDate {
  constructor(...a) {
    if (a.length === 0) super(NOW);
    else super(...a);
  }
  static now() {
    return NOW;
  }
}
globalThis.Date = PinnedDate;
const pin = (today) => {
  const [y, m, d] = today.split('-').map(Number);
  NOW = new RealDate(y, m - 1, d, 12).getTime();
};

const { RT_MET, metForSession, sessionActiveKcal, energyProfileFrom, sessionKcalOf } = require('./out/energy.js');
const { trainingMinutes } = require('./out/activity.js');
const { restingKcalPerMin } = require('./out/fitness-calc.js');

let s = 5309;
const rnd = (n) => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return Math.floor(s / 65536) % n;
};
const pick = (a) => a[rnd(a.length)];
const enc = (x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x);

// Giá trị một ô trong `sets` (JSONB tự do): số, chuỗi số, chuỗi hỏng, null,
// vắng (`undefined` → khoá bị bỏ khi `JSON.stringify`), bool, mảng.
const REPS = [10, 8, 5, 12, 0, -3, 0.4, 8.5, '10', ' 6 ', '', 'abc', null, undefined, true, false, [], [7], [[]], ['9'], [1, 2], {}];
const WEIGHTS = [60, 0, 100, 22.5, '40', '', 'x', null, undefined, -10, true, [], [15], {}];
const RESTS = [90, 60, 0, 120, 45.5, '60', 'abc', '', null, undefined, -30, true, [], [30], {}];
const RPES = [null, undefined, 0, 4, 4.9, 5, 6, 7, 7.99, 8, 9, 10, 11, -1, '8', '4', 'x', '', true, [8], [], {}];

function randomSet() {
  const set = {};
  const r = pick(REPS), w = pick(WEIGHTS), t = pick(RESTS);
  if (r !== undefined) set.reps = r;
  if (w !== undefined) set.weight = w;
  if (rnd(3) > 0 && t !== undefined) set.restSeconds = t;
  // Các trường khác của một set thật — không đổi gì của phép tính.
  if (rnd(2)) set.exercise_name = 'Squat';
  if (rnd(4) === 0) set.is_warmup = true;
  return set;
}
// Một hàng `sets`: thường là set đúng dạng, đôi khi có phần tử không phải
// object (số, chuỗi, mảng). KHÔNG có phần tử `null` — RN đọc `null.reps` là
// TypeError (màn đỏ), không có golden cho nó; Swift bỏ qua (test riêng).
function randomSets() {
  const n = [0, 1, 2, 3, 4, 6, 9][rnd(7)];
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = rnd(14);
    if (k === 0) out.push(pick([5, 'set', [], [3]]));
    else out.push(randomSet());
  }
  return out;
}
const REAL = { weight_kg: 70, height_cm: 175, age: 30, sex: 'male' };
const PROFILES = [
  REAL,
  { weight_kg: 58.5, height_cm: 162, age: 41, sex: 'female' },
  { weight_kg: 92, height_cm: 188, age: 23, sex: 'other' },
  { weight_kg: 20, height_cm: 100, age: 0, sex: 'female' },
  { weight_kg: 400, height_cm: 250, age: 130, sex: 'male' },
];

// ── metForSession ──
const met = [];
for (const rpe of RPES) {
  for (const sets of [
    [{ reps: 10, weight: 60 }],
    [{ reps: 10, weight: 0 }],
    [{ reps: 0, weight: 100 }, { reps: 12 }],
    [{ reps: '8', weight: '40' }],
    [{ reps: 'x', weight: 50 }, { reps: 5, weight: null }],
    [],
  ]) {
    const c = { sets, expected: enc(metForSession(sets, rpe)) };
    if (rpe !== undefined) c.rpe = rpe;
    met.push(c);
  }
}
for (let i = 0; i < 120; i++) {
  const sets = randomSets();
  const rpe = pick(RPES);
  const c = { sets, expected: enc(metForSession(sets, rpe)) };
  if (rpe !== undefined) c.rpe = rpe;
  met.push(c);
}

// ── trainingMinutes ──
const minutes = [
  [],
  [{ reps: 0 }, { reps: -1 }],
  [{ reps: 10, restSeconds: 90 }, { reps: 10, restSeconds: 90 }, { reps: 10, restSeconds: 90 }],
  [{ reps: 10 }],
  [{ reps: 10, restSeconds: null }],
  [{ reps: 10, restSeconds: 0 }],
  [{ reps: 10, restSeconds: '60' }],
  [{ reps: 10, restSeconds: 'abc' }],
  [{ reps: 0.4, restSeconds: 0 }],
  [{ reps: 8.5, restSeconds: 20 }],
  [{ reps: 1, restSeconds: -1000 }],
  [{ reps: 'Infinity', restSeconds: 60 }],
].map((sets) => ({ sets, expected: enc(trainingMinutes(sets)) }));
for (let i = 0; i < 120; i++) {
  const sets = randomSets();
  minutes.push({ sets, expected: enc(trainingMinutes(sets)) });
}

// ── restingKcalPerMin ──
const resting = [];
for (const weight_kg of [19.9, 20, 70, 400, 400.1])
  for (const height_cm of [99, 100, 175, 250, 251])
    for (const age of [-1, 0, 30, 130, 131])
      for (const sex of ['male', 'female', 'other']) {
        const i = { weight_kg, height_cm, age, sex };
        resting.push({ ...i, expected: enc(restingKcalPerMin(i)) });
      }
// BMR ≤ 0: cơ thể nhỏ nhất, già nhất, nữ.
resting.push({ weight_kg: 20, height_cm: 100, age: 130, sex: 'female', expected: enc(restingKcalPerMin({ weight_kg: 20, height_cm: 100, age: 130, sex: 'female' })) });

// ── sessionActiveKcal (hồ sơ đưa thẳng) ──
const active = [];
const PROFILE_EDGES = [
  null,
  { weight_kg: 0, height_cm: 175, age: 30, sex: 'male' },
  { weight_kg: 70, height_cm: 0, age: 30, sex: 'male' },
  { weight_kg: 70, height_cm: 175, age: 0, sex: 'male' },
  { weight_kg: 19, height_cm: 175, age: 30, sex: 'male' },
  { weight_kg: 70, height_cm: 260, age: 30, sex: 'female' },
  { weight_kg: 70, height_cm: 175, age: 131, sex: 'male' },
  ...PROFILES,
];
for (const p of PROFILE_EDGES)
  for (const m of [0, -5, 1, 6, 45, 90])
    for (const [sets, rpe] of [
      [[{ reps: 10, weight: 60 }], 7],
      [[{ reps: 10, weight: 60 }], 8],
      [[{ reps: 10, weight: 60 }], null],
      [[{ reps: 10 }], 9],
      [[{ reps: 10 }], 3],
    ])
      active.push({ sets, rpe, minutes: m, profile: p, expected: enc(sessionActiveKcal(sets, rpe, m, p)) });
active.push({ sets: [{ reps: 10, weight: 60 }], rpe: 7, minutes: 'NaN', profile: REAL, expected: enc(sessionActiveKcal([{ reps: 10, weight: 60 }], 7, NaN, REAL)) });

// ── energyProfileFrom (với "hôm nay" ghim) ──
const profileFrom = [];
const DOBS = [
  '1996-03-15', '1996-10-10', '1996-10-11', '1996-10-09', '2000-02-29', '2001-02-29', '2000-02-30', '2000-04-31',
  '2000-02-31', '2000-01-00', '2000-01-32', '2000-13-01', '2000-00-10', '1990-1-5', '2000-01-05T00:00:00', 'abc', '',
  null, undefined, '2027-01-01', '2026-10-10', '2026-10-11', '1896-10-10', '1895-10-11', '1896-10-11', '0000-03-01',
];
const TODAYS = ['2026-10-10', '2024-02-29', '2025-01-01'];
for (const today of TODAYS) {
  pin(today);
  for (const dob of DOBS)
    for (const [w, h, sex] of [
      [70, 175, 'male'],
      [58, 162, 'female'],
      ['80', '180', 'other'],
      [0, 175, 'male'],
      [70, null, 'male'],
      [null, 175, null],
      [70, -1, 'female'],
      [15, 90, 'Female'],
    ]) {
      const row = {};
      if (w !== undefined) row.weight_kg = w;
      if (h !== undefined) row.height_cm = h;
      if (dob !== undefined) row.dob = dob;
      if (sex !== undefined) row.sex = sex;
      profileFrom.push({ today, row, expected: energyProfileFrom(row) });
    }
  profileFrom.push({ today, row: null, expected: energyProfileFrom(null) });
}
pin('2026-10-10');

// ── sessionKcalOf: 200 hàng seed + vài hình dạng `sets` lạ ──
const rows = [];
const NOT_ARRAY = [null, undefined, 'x', 5, {}, { reps: 10 }];
for (const sets of NOT_ARRAY) {
  const row = { session_rpe: 7 };
  if (sets !== undefined) row.sets = sets;
  rows.push({ row, profile: REAL, expected: enc(sessionKcalOf(row, REAL)) });
}
rows.push({ row: null, profile: REAL, expected: enc(sessionKcalOf(null, REAL)) });
rows.push({ row: { sets: [{ reps: 10, weight: 60 }], session_rpe: 7 }, profile: null, expected: enc(sessionKcalOf({ sets: [{ reps: 10, weight: 60 }], session_rpe: 7 }, null)) });
// Ví dụ đọc được của báo cáo audit (6099047019).
for (const rpe of [7, 8]) {
  const row = { sets: [1, 2, 3].map(() => ({ reps: 10, weight: 60, restSeconds: 90 })), session_rpe: rpe };
  rows.push({ row, profile: REAL, expected: enc(sessionKcalOf(row, REAL)) });
}
{
  const row = { sets: [1, 2, 3].map(() => ({ reps: 10, weight: 0, restSeconds: 90 })), session_rpe: 9 };
  rows.push({ row, profile: REAL, expected: enc(sessionKcalOf(row, REAL)) });
}
for (let i = 0; i < 200; i++) {
  const row = { sets: randomSets() };
  const rpe = pick(RPES);
  if (rpe !== undefined) row.session_rpe = rpe;
  const p = rnd(8) === 0 ? null : pick(PROFILES);
  rows.push({ row, profile: p, expected: enc(sessionKcalOf(row, p)) });
}

process.stdout.write(
  JSON.stringify({ RT_MET, met, minutes, resting, active, profileFrom, rows }, null, 0).replace(/\},\{/g, '},\n{') + '\n',
);
