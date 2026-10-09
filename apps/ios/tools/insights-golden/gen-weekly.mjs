#!/usr/bin/env node
/**
 * Golden cho màn tổng kết tuần (#527) — `app/weekly-review.tsx` @ fac9ac2.
 *
 * Phần tính của màn không export, nên chép NGUYÊN VĂN (chỉ bỏ kiểu TS, bỏ
 * hook) các biểu thức `:376–545` — trung bình theo quần thể (`metricMean`,
 * CHÍNH `lib/nutrition-mean.ts`), giấc ngủ (`asleepMinutes`, chép từ
 * `daily-log-service.ts:163`), khối lượng 12 tuần, dữ liệu biểu đồ, thẻ số, và
 * chuỗi khuyến nghị (dùng CHÍNH `lib/readiness-week.ts` + `latestAcwr`).
 * Mỗi khuyến nghị ghi thêm `id` + `args` (phần chữ chèn vào câu) để phía Swift
 * so mà không cần ngôn ngữ.
 *
 * Ngày theo múi giờ của máy: chạy với TZ=Asia/Ho_Chi_Minh.
 *
 *   ./build.sh && TZ=Asia/Ho_Chi_Minh node gen-weekly.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/weekly-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const N = require('./out/nutrition-mean.js');
const W = require('./out/readiness-week.js');
const T = require('./out/training-card.js');
const D = require('./out/local-date.js');
if (process.env.TZ !== 'Asia/Ho_Chi_Minh') throw new Error('TZ=Asia/Ho_Chi_Minh');

const { metricMean } = N;
const { deloadWarranted, recoveryBacked } = W;
const { latestAcwr } = T;
const { localDateStr, parseLocalDate, weekStartOf } = D;
const getWeekStart = weekStartOf;
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// daily-log-service.ts:163
function asleepMinutes(sleep) {
  if (sleep.asleep_min != null && sleep.asleep_min > 0) return Math.round(sleep.asleep_min);
  const bed = new Date(sleep.bedtime).getTime();
  const wake = new Date(sleep.waketime).getTime();
  return Math.max(0, Math.round((wake - bed) / 60000));
}

function review({ weekStartStr, dailyLogs, workouts, sleepLogs, prevLogs, volumeHistory, profile }) {
  const weekStart = parseLocalDate(weekStartStr);
  const logs = dailyLogs ?? [];
  const daysWithData = logs.length;
  const targets = {
    kcal: profile?.tdee_target_kcal ?? 2200,
    protein: profile?.macro_protein_g ?? 140,
    sleepH: Number(profile?.sleep_target_hours) || 8,
  };
  const { mean: avgKcal } = metricMean(logs, (l) => Number(l.kcal));
  const { mean: avgProtein, count: proteinDays } = metricMean(logs, (l) => Number(l.protein_g));
  const { mean: avgWaterMl } = metricMean(logs, (l) => Number(l.water_ml));
  const avgSleepMin = avg((sleepLogs ?? []).map((s) => asleepMinutes(s)));
  const avgSleepH = avgSleepMin / 60;
  const totalVolume = sum(logs.map((l) => Number(l.volume_load) || 0));
  const workoutCount = (workouts ?? []).length;
  const suppDays = logs.filter((l) => Number(l.supplement_planned) > 0);
  const suppAdherence =
    suppDays.length === 0
      ? null
      : Math.round(
          (suppDays.reduce((a, l) => a + Number(l.supplement_taken || 0), 0) /
            suppDays.reduce((a, l) => a + Number(l.supplement_planned || 0), 0)) *
            100,
        );
  const readinessDays = logs.filter((l) => l.readiness_score).length;
  const avgReadiness = avg(logs.filter((l) => l.readiness_score).map((l) => Number(l.readiness_score)));
  const pLogs = prevLogs ?? [];
  const prevAvgKcal = metricMean(pLogs, (l) => Number(l.kcal)).mean;
  const prevAvgProtein = metricMean(pLogs, (l) => Number(l.protein_g)).mean;
  const prevTotalVolume = sum(pLogs.map((l) => Number(l.volume_load) || 0));

  const volumeWeekly = (() => {
    const rows = volumeHistory ?? [];
    const byWeek = new Map();
    for (const r of rows) {
      const d = parseLocalDate(r.date);
      const ws = getWeekStart(d);
      const key = localDateStr(ws);
      byWeek.set(key, (byWeek.get(key) ?? 0) + (Number(r.volume_load) || 0));
    }
    const points = [];
    for (let i = 11; i >= 0; i--) {
      const ws = new Date(weekStart);
      ws.setDate(ws.getDate() - i * 7);
      const key = localDateStr(ws);
      points.push({ date: key, value: Math.round((byWeek.get(key) ?? 0) / 1000) });
    }
    return points;
  })();

  const chartData = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d);
    const log = logs.find((l) => l.date === dateStr);
    const sleep = (sleepLogs ?? []).find((s) => localDateStr(new Date(s.waketime)) === dateStr);
    const sleepMin = sleep ? asleepMinutes(sleep) : 0;
    return {
      date: dateStr,
      kcal: Number(log?.kcal) || 0,
      protein: Number(log?.protein_g) || 0,
      sleep_h: +(sleepMin / 60).toFixed(1),
      volume: Number(log?.volume_load) || 0,
      readiness: Number(log?.readiness_score) || 0,
    };
  });

  const acwr = latestAcwr(logs);

  // Chuỗi khuyến nghị — điều kiện NGUYÊN VĂN; `id` / `args` là phần chèn vào câu.
  const recs = [];
  let acwrRec = null;
  if (acwr == null) {
  } else if (acwr > 1.5) {
    acwrRec = { kind: 'warning', id: 'acwrHigh', args: [`${acwr}`] };
  } else if (acwr > 1.3) {
    acwrRec = { kind: 'warning', id: 'acwrSlightlyHigh', args: [`${acwr}`] };
  } else if (acwr < 0.6) {
    acwrRec = { kind: 'info', id: 'acwrLow', args: [`${acwr}`] };
  } else if (acwr >= 0.8 && acwr <= 1.3) {
    acwrRec = { kind: 'success', id: 'acwrOptimal', args: [`${acwr}`] };
  }
  if (deloadWarranted(logs, avgReadiness, readinessDays)) {
    recs.push({ kind: 'warning', id: 'deload', args: [] });
  } else if (avgReadiness >= 75) {
    recs.push({ kind: 'success', id: recoveryBacked(logs) ? 'overloadRecovered' : 'overloadCapacity', args: [] });
  }
  if (avgSleepH < targets.sleepH - 1) {
    recs.push({ kind: 'warning', id: 'sleepDebt', args: [avgSleepH.toFixed(1), `${targets.sleepH}`] });
  }
  if (avgProtein < targets.protein * 0.8 && proteinDays >= 3) {
    recs.push({ kind: 'info', id: 'proteinLow', args: [`${Math.round(avgProtein)}`, `${targets.protein}`] });
  }
  if (totalVolume > prevTotalVolume * 1.15 && prevTotalVolume > 0) {
    recs.push({ kind: 'info', id: 'volumeUp', args: [`${Math.round((totalVolume / prevTotalVolume - 1) * 100)}`] });
  }

  const delta = (curr, prev) => (prev ? Math.round(((curr - prev) / prev) * 100) : null);
  const cards = {
    kcal: { value: `${Math.round(avgKcal)}`, sub: `/${targets.kcal}`, d: delta(avgKcal, prevAvgKcal) },
    protein: { value: `${Math.round(avgProtein)}g`, sub: `/${targets.protein}g`, d: delta(avgProtein, prevAvgProtein) },
    sleep: { value: `${avgSleepH.toFixed(1)}h`, sub: `/${targets.sleepH}h`, d: null },
    volume: { value: `${Math.round(totalVolume / 1000)}k`, sessions: workoutCount, d: delta(totalVolume, prevTotalVolume) },
    readiness: { value: `${Math.round(avgReadiness)}`, sub: acwr != null ? `ACWR ${acwr}` : '—', d: null },
    supplements: suppAdherence != null ? { value: `${suppAdherence}%`, sub: `/${suppDays.length}d`, d: null } : null,
    water: {
      value: `${(avgWaterMl / 1000).toFixed(1)}L`,
      sub: `/${(Number(profile?.water_target_ml) || 2500) / 1000}L`,
      d: null,
    },
  };
  const readinessPoints = chartData.filter((c) => c.readiness > 0).map((c) => ({ date: c.date, value: c.readiness }));
  const daysLogged = logs.filter(
    (d) => Number(d.kcal) > 0 || Number(d.volume_load) > 0 || d.readiness_score != null,
  ).length;

  return {
    daysWithData, daysLogged, avgKcal, avgProtein, proteinDays, avgWaterMl, avgSleepH, totalVolume, workoutCount,
    suppAdherence, readinessDays, avgReadiness, prevAvgKcal, prevAvgProtein, prevTotalVolume, acwr, acwrRec,
    recommendations: recs, cards, chartData, volumeWeekly, readinessPoints,
  };
}

// ── Dữ liệu thử ──────────────────────────────────────────────────────────
const ws = '2026-10-05';
const day = (i) => {
  const d = parseLocalDate(ws);
  d.setDate(d.getDate() + i);
  return localDateStr(d);
};
const rec = 'hrv:62|rhr:70|sleep:55|load:80';
const loadOnly = 'load:30';
const sleepLog = (date, h, extra = {}) => ({
  bedtime: new Date(new Date(`${date}T06:30:00`).getTime() - h * 3600000).toISOString(),
  waketime: new Date(`${date}T06:30:00`).toISOString(),
  asleep_min: null, deep_min: null, rem_min: null, light_min: null, ...extra,
});
const history = (weeks, per) => {
  const out = [];
  for (let w = 1; w <= weeks; w++) {
    for (let k = 0; k < 3; k++) {
      const d = parseLocalDate(ws);
      d.setDate(d.getDate() - w * 7 + k * 2);
      out.push({ date: localDateStr(d), volume_load: per(w, k) });
    }
  }
  return out;
};

const rich = {
  weekStartStr: ws,
  dailyLogs: [
    { date: day(0), kcal: 2100, protein_g: 150, volume_load: 8200, readiness_score: 82, readiness_explain: rec, acwr: 1.12, sleep_duration_min: 450, sleep_quality: 4, supplement_taken: 2, supplement_planned: 3, water_ml: 2600 },
    { date: day(1), kcal: '1950', protein_g: '120.5', volume_load: 0, readiness_score: 78, readiness_explain: rec, acwr: '1.18', sleep_duration_min: 420, sleep_quality: null, supplement_taken: 3, supplement_planned: 3, water_ml: 2000 },
    { date: day(2), kcal: 0, protein_g: 0, volume_load: 9100.5, readiness_score: 80, readiness_explain: rec, acwr: null, sleep_duration_min: null, sleep_quality: null, supplement_taken: 0, supplement_planned: 0, water_ml: null },
    { date: day(3), kcal: 2400, protein_g: 170, volume_load: 0, readiness_score: null, readiness_explain: null, acwr: 1.21, sleep_duration_min: 400, sleep_quality: 3, supplement_taken: null, supplement_planned: 2, water_ml: 3100 },
    { date: day(5), kcal: 1800, protein_g: 130, volume_load: 10400, readiness_score: 76, readiness_explain: rec, acwr: 1.27, sleep_duration_min: 480, sleep_quality: 5, supplement_taken: 1, supplement_planned: 2, water_ml: 2500 },
  ],
  workouts: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  sleepLogs: [sleepLog(day(0), 7.5), sleepLog(day(1), 7, { asleep_min: 401.6 }), sleepLog(day(3), 6.25), sleepLog(day(5), 8), sleepLog(day(5), 1.5)],
  prevLogs: [{ kcal: 2000, protein_g: 140, volume_load: 20000 }, { kcal: 0, protein_g: null, volume_load: '3000' }, { kcal: 2200, protein_g: 150, volume_load: null }],
  volumeHistory: history(12, (w, k) => 4000 + w * 300 + k * 111.5),
  profile: { tdee_target_kcal: 2300, macro_protein_g: 160, sleep_target_hours: '7.5', water_target_ml: 3000 },
};

const cases = [{ name: 'rich', input: rich }];
cases.push({ name: 'empty', input: { weekStartStr: ws, dailyLogs: [], workouts: [], sleepLogs: [], prevLogs: [], volumeHistory: [], profile: null } });
cases.push({
  name: 'deload',
  input: {
    ...rich,
    dailyLogs: [0, 1, 2, 3].map((i) => ({ date: day(i), kcal: 1500, protein_g: 60, volume_load: 5000, readiness_score: 40 + i, readiness_explain: rec, acwr: 1.7, water_ml: 1000 })),
    sleepLogs: [sleepLog(day(0), 5), sleepLog(day(2), 5.5)],
    profile: {},
  },
});
cases.push({
  name: 'load-only-low',
  input: {
    ...rich,
    dailyLogs: [0, 1, 2, 3].map((i) => ({ date: day(i), kcal: null, protein_g: 50, volume_load: 1000, readiness_score: 30, readiness_explain: loadOnly, acwr: 0.3 })),
    prevLogs: [{ volume_load: 3000 }],
    profile: { macro_protein_g: '150.5', sleep_target_hours: 0 },
  },
});
cases.push({
  name: 'high-capacity',
  input: {
    ...rich,
    dailyLogs: [0, 1, 2].map((i) => ({ date: day(i), kcal: 2000, protein_g: 160, volume_load: 30000, readiness_score: 90, readiness_explain: loadOnly, acwr: 0 })),
    prevLogs: [{ volume_load: 20000 }],
    profile: { macro_protein_g: null, tdee_target_kcal: 0 },
  },
});
cases.push({
  name: 'string-zero-score',
  input: {
    ...rich,
    dailyLogs: [
      { date: day(6), readiness_score: '0', readiness_explain: '', acwr: 'x' },
      { date: day(6), kcal: 900, readiness_score: 0, acwr: 0.85 },
      { date: day(4), water_ml: '1750', supplement_planned: '2', supplement_taken: '1' },
    ],
    sleepLogs: [],
  },
});
for (const a of [0.3, 0.59, 0.6, 0.62, 0.65, 0.7, 0.79, 0.8, 1, 1.3, 1.31, 1.45, 1.5, 1.55, 1.6, 1.61, 2.4]) {
  cases.push({
    name: `acwr-${a}`,
    input: { ...rich, dailyLogs: [{ date: day(2), readiness_score: 60, readiness_explain: loadOnly, acwr: a }], prevLogs: [] },
  });
}

process.stdout.write(
  JSON.stringify({ weekStart: ws, cases: cases.map((c) => ({ name: c.name, input: c.input, out: review(c.input) })) }, null, 1) + '\n',
);
