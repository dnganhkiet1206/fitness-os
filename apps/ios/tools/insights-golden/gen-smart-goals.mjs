#!/usr/bin/env node
/**
 * Golden cho Hiệu chỉnh mục tiêu (#527) — `app/smart-goals.tsx` +
 * `lib/adaptive-tdee.ts` @ fac9ac2.
 *
 * `adaptiveTDEE` / `worthMentioning` / `calcTargetCalories` / `calorieTargetFor`
 * / `nutritionDays` / `weekStartOf` / `convertWeight` là mã RN biên dịch
 * (`build.sh`). Phần tính của màn không export: chép NGUYÊN VĂN `weekDates`,
 * `weekAvg` (`:35-47`), `analysis` (`:96-180`) và `protein` (`:182-238`), chỉ
 * thay `weekStartOf()` bằng `weekStartOf(hôm nay)` để ngày cố định. Chạy với
 * TZ=UTC (`weekStartOf` / `localDateStr` đọc giờ địa phương).
 *
 *   TZ=UTC node gen-smart-goals.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/smart-goals-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { adaptiveTDEE, worthMentioning } = require('./out/adaptive-tdee.js');
const { calcTargetCalories } = require('./out/fitness-calc.js');
const { localDateStr, weekStartOf } = require('./out/local-date.js');
const { nutritionDays } = require('./out/nutrition-mean.js');
const { convertWeight } = require('./out/units.js');
const { calorieTargetFor } = require('./out/macro-targets.js');

if (new Date(0).getTimezoneOffset() !== 0) throw new Error('chạy với TZ=UTC');

let seed = 5527;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const day = (today, k) => {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - k);
  return localDateStr(d);
};

// smart-goals.tsx:35-47, `weekStartOf()` → `weekStartOf(now)`.
function weekDates(weeksAgo, now) {
  const start = weekStartOf(now);
  start.setDate(start.getDate() - weeksAgo * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: localDateStr(start), end: localDateStr(end) };
}
function weekAvg(logs, start, end) {
  const w = logs.filter((l) => l.date >= start && l.date <= end);
  if (w.length === 0) return null;
  return w.reduce((s, l) => s + l.weight_kg, 0) / w.length;
}

// smart-goals.tsx:96-180
function analyse(weightLogs, dailyLogs, profile, now) {
  if (!weightLogs || weightLogs.length < 3 || !profile) return null;
  const goal = profile.goal || 'maintain';
  const sex = profile.sex || 'other';
  const currentCal = calorieTargetFor(profile);
  const weekAvgs = [];
  for (let i = 3; i >= 0; i--) {
    const { start, end } = weekDates(i, now);
    weekAvgs.push({ week: `W${4 - i}`, value: weekAvg(weightLogs, start, end) });
  }
  const valid = weekAvgs.filter((w) => w.value !== null);
  if (valid.length < 2) return null;
  const last2 = valid.slice(-2);
  const weeklyChange = last2[1].value - last2[0].value;
  const targetMin = goal === 'bulk' ? 0.25 : goal === 'cut' ? -0.75 : -0.1;
  const targetMax = goal === 'bulk' ? 0.5 : goal === 'cut' ? -0.25 : 0.1;
  const onTrack = weeklyChange >= targetMin && weeklyChange <= targetMax;
  const measured = adaptiveTDEE(
    (dailyLogs ?? []).map((d) => ({ date: String(d.date), kcal: Number(d.kcal) || 0 })),
    (weightLogs ?? []).map((w) => ({ date: w.date, kg: w.weight_kg })),
  );
  let twoWeekDeviation = false;
  let calorieAdjustment = 0;
  let fromMeasurement = false;
  let measuredDays = 0;
  if (measured.ok) {
    const shouldBe = calcTargetCalories(measured.measured, goal, sex);
    if (worthMentioning(shouldBe, currentCal)) {
      twoWeekDeviation = true;
      fromMeasurement = true;
      measuredDays = measured.loggedDays;
      calorieAdjustment = shouldBe - currentCal;
    }
  } else if (valid.length >= 3) {
    const prev2 = valid.slice(-3, -1);
    const prevChange = prev2[1].value - prev2[0].value;
    const bothOff =
      (goal === 'bulk' && weeklyChange < targetMin && prevChange < targetMin) ||
      (goal === 'cut' && weeklyChange > targetMax && prevChange > targetMax);
    if (bothOff) {
      twoWeekDeviation = true;
      if (goal === 'bulk') calorieAdjustment = weeklyChange < 0 ? 250 : 150;
      if (goal === 'cut') calorieAdjustment = weeklyChange > 0 ? -250 : -150;
    }
  }
  return { valid, weeklyChange, onTrack, twoWeekDeviation, calorieAdjustment, fromMeasurement, measuredDays, currentCal, targetMin, targetMax, goal, measured };
}

// smart-goals.tsx:182-238
function proteinCard(dailyLogs, profile) {
  const withNutrition = nutritionDays(dailyLogs ?? [], (d) => Number(d.kcal), (d) => Number(d.protein_g));
  if (withNutrition === 0 || !profile) return null;
  const target = Number(profile.macro_protein_g) || 150;
  const perMeal = Math.round(target / 4);
  const lowDays = dailyLogs.filter((d) => Number(d.protein_g) < target * 0.7);
  return { target, perMeal, lowDays: lowDays.length, totalDays: dailyLogs.length };
}

// Chữ trong ô chú thích (`:280-286`), chưa có nhãn đơn vị / "tuần".
const signed = (v, unit) => `${v > 0 ? '+' : ''}${convertWeight(v, unit).toFixed(2)}`;

const GOALS = ['bulk', 'cut', 'maintain', 'recomp', 'strength', 'endurance', '', null, 'bulk', 'cut'];
const SEXES = ['male', 'female', 'other', null];
const TDEE = [null, 0, 1800, 2500, '2200', 3000, 1300, '', -5];
const PROTEIN = [null, 0, 120, 150, '180', 95];
const KCAL = [0, null, 1500, 1850, 2100, 2400, 2900, 3300, '2100', '', 'abc'];
const PROT = [0, null, 60, 90, 120, 150, '140', 'x'];

const cases = [];
for (let i = 0; i < 260; i++) {
  const today = `2026-10-${String(1 + rnd(31)).padStart(2, '0')}`;
  const now = new Date(`${today}T12:00:00`);
  // Cân: 0…36 ngày, mật độ thay đổi, xu thế ±, đôi khi hai lần một ngày.
  const density = [0, 1, 2, 4, 6, 8, 10][rnd(7)];
  const base = 55 + rnd(50);
  const slope = (rnd(21) - 10) / 100; // kg/ngày, −0.10…+0.10
  const weights = [];
  for (let k = 35; k >= 0; k--) {
    if (rnd(10) >= density) continue;
    const reps = rnd(6) === 0 ? 2 : 1;
    for (let r = 0; r < reps; r++) {
      const kg = Math.round((base + slope * (35 - k) + (rnd(11) - 5) / 10) * 10) / 10;
      weights.push({ date: day(today, k), weight_kg: rnd(15) === 0 ? String(kg) : kg });
    }
  }
  const daily = [];
  const dDensity = [0, 3, 6, 8, 10][rnd(5)];
  for (let k = 14; k >= 0; k--) {
    if (rnd(10) >= dDensity) continue;
    daily.push({ date: day(today, k), kcal: KCAL[rnd(KCAL.length)], protein_g: PROT[rnd(PROT.length)] });
  }
  const profile =
    rnd(12) === 0
      ? null
      : {
          goal: GOALS[rnd(GOALS.length)],
          sex: SEXES[rnd(SEXES.length)],
          tdee_target_kcal: TDEE[rnd(TDEE.length)],
          macro_protein_g: PROTEIN[rnd(PROTEIN.length)],
        };
  // `useQuery`: `Number(d.weight_kg)`.
  const weightLogs = weights.map((d) => ({ date: d.date, weight_kg: Number(d.weight_kg) }));
  const a = analyse(weightLogs, daily, profile, now);
  cases.push({
    today,
    weightFrom: day(today, 35),
    dailyFrom: day(today, 14),
    weights,
    daily,
    profile,
    analysis: a && {
      weeks: a.valid.map((w) => w.week),
      values: a.valid.map((w) => w.value),
      weeklyChange: a.weeklyChange,
      onTrack: a.onTrack,
      targetMin: a.targetMin,
      targetMax: a.targetMax,
      goal: a.goal,
      currentCal: a.currentCal,
      twoWeekDeviation: a.twoWeekDeviation,
      calorieAdjustment: a.calorieAdjustment,
      fromMeasurement: a.fromMeasurement,
      measuredDays: a.measuredDays,
      measured: a.measured,
      text: {
        kg: [signed(a.weeklyChange, 'kg'), signed(a.targetMin, 'kg'), signed(a.targetMax, 'kg')],
        lbs: [signed(a.weeklyChange, 'lbs'), signed(a.targetMin, 'lbs'), signed(a.targetMax, 'lbs')],
      },
    },
    protein: proteinCard(daily, profile),
  });
}

// `adaptiveTDEE` riêng: những lần từ chối và các ngày không phải ngày.
const intake = (n, kcal = 2000) => Array.from({ length: n }, (_, k) => ({ date: `2026-09-${String(10 + k).padStart(2, '0')}`, kcal }));
const series = (dates, kg0 = 80, perDay = -0.05) =>
  dates.map((d) => ({ date: d, kg: Math.round((kg0 + perDay * (Date.parse(`${d}T00:00:00Z`) / 86400000 - Date.parse('2026-09-01T00:00:00Z') / 86400000)) * 100) / 100 }));
const spread = ['2026-09-01', '2026-09-03', '2026-09-05', '2026-09-07', '2026-09-09', '2026-09-12'];
const adaptive = [
  { intake: intake(9), weights: series(spread) },
  { intake: intake(10), weights: series(spread) },
  { intake: [...intake(10), { date: '2026-09-25', kcal: 0 }, { date: '2026-09-26', kcal: -100 }], weights: series(spread) },
  { intake: intake(12), weights: series(spread.slice(0, 5)) },
  { intake: intake(12), weights: series(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-08']) },
  // Phần chú thích của RN: ba lần thứ Hai + ba lần thứ Bảy, 12 ngày sau.
  {
    intake: intake(14, 2200),
    weights: [
      { date: '2026-09-07', kg: 71 }, { date: '2026-09-07', kg: 71 }, { date: '2026-09-07', kg: 71 },
      { date: '2026-09-19', kg: 69.5 }, { date: '2026-09-19', kg: 69.5 }, { date: '2026-09-19', kg: 69.5 },
    ],
  },
  { intake: intake(14, 1800), weights: series([...spread, '2026-09-14', '2026-09-15']) },
  { intake: intake(14, 3100), weights: series(spread, 70, 0.04) },
  { intake: intake(11, 2500), weights: series(spread, 90, 0) },
  // Ngày hỏng bị bỏ như một cân nặng hỏng.
  { intake: intake(12), weights: [...series(spread.slice(0, 5)), { date: '2026-02-30', kg: 79 }, { date: '', kg: 79 }, { date: 'abc', kg: 79 }, { date: '2026-9-13', kg: 79 }] },
  { intake: intake(12), weights: [...series(spread), { date: '2026-09-20', kg: 0 }, { date: '2026-09-21', kg: -3 }] },
  { intake: intake(12), weights: [...series(spread), { date: '2024-02-29', kg: 81 }] },
  // Cùng ngày, khác cân, thứ tự đầu vào lộn.
  { intake: intake(13, 2333), weights: [...series(spread).reverse(), { date: '2026-09-05', kg: 79.1 }, { date: '2026-09-05', kg: 80.3 }] },
].map((c) => ({ ...c, result: adaptiveTDEE(c.intake, c.weights) }));

const worth = [[2000, 2199], [2000, 2200], [2200, 2000], [2000, 1801], [1800, 2000.5]].map(([m, t]) => ({ measured: m, target: t, worth: worthMentioning(m, t) }));

process.stdout.write(JSON.stringify({ cases, adaptive, worth }, null, 1) + '\n');
