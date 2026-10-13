#!/usr/bin/env node
/**
 * Golden cho thẻ tập luyện của Hôm nay (#527 N3) — @ fac9ac2.
 *
 * BIÊN DỊCH (`build.sh`): `training-card.ts` (`averageWeek`, `chronicDays`,
 * `weeklyVolumes`, `daysSince`, `acwrZone`, `loadComparison`, `acwrPercent`,
 * `TREND_WEEKS`, `STALE_AFTER_DAYS`), `training-week.ts` (`strengthDaysIn`),
 * `goal-training.ts` (`goalTraining`), `session-load.ts` (`loadWindow`).
 *
 * CHÉP NGUYÊN VĂN từ `components/ascnd/today-widgets-2.tsx` (`TrainingCard`,
 * :400-850), chỉ thay hook bằng tham số:
 * - `useWorkoutSessions(n)` (`hooks/use-fitness-data.ts:848`): truy vấn
 *   `PROGRESS_DAYS` = 56 ngày, rồi lọc `Date.parse(date_time) >= daysAgoISO(n)`
 *   cho n < 56 (`select`), còn n = 56 thì giữ nguyên hàng server trả;
 * - `daysAgoISO` (`:60`) nhận `now` thay vì `new Date()`;
 * - `useRecentWorkouts()[0]` → `latest`; `useProfile()` → `profile`
 *   (`undefined` = chưa nạp);
 * - chiều cao cột / vạch thói quen (`TREND_H` = 72) giữ nguyên biểu thức.
 *
 * Chạy với `TZ=America/Los_Angeles`: có ngày đổi giờ (8/3 và 1/11/2026), nơi
 * `setDate(getDate() - 7k)` khác 7k × 24 giờ.
 *
 *   ./build.sh && TZ=America/Los_Angeles node gen-training.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/training-card-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('./out/training-card.js');
const { strengthDaysIn } = require('./out/training-week.js');
const { goalTraining } = require('./out/goal-training.js');
const { loadWindow } = require('./out/session-load.js');
const { localDateStr } = require('./out/local-date.js');

if (process.env.TZ !== 'America/Los_Angeles') throw new Error('chạy với TZ=America/Los_Angeles');

let s = 90417;
const rnd = (n) => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return Math.floor(s / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

// `daysAgoISO` (use-fitness-data.ts:60), `new Date()` → `now`.
function daysAgoISO(days, now) {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
// `useWorkoutSessions(days)` với span 56 (`select`, :851-857).
const SPAN = T.TREND_WEEKS * 7;
const sessionsWithin = (rows, days, now) => {
  if (days === SPAN) return rows;
  const cut = Date.parse(daysAgoISO(days, now));
  return rows.filter((r) => Date.parse(r.date_time) >= cut);
};

const TREND_H = 72;

/** Biểu thức của `TrainingCard` (:400-850), không có JSX. */
function card({ acwr, latest, rows, profile, now }) {
  const week = sessionsWithin(rows, 7, now);
  const month = sessionsWithin(rows, 28, now);
  const history = sessionsWithin(rows, SPAN, now);

  const judged = acwr != null && acwr > 0;
  const a = acwr ?? 0;
  const zone = T.acwrZone(a);
  const cmp = T.loadComparison(a);

  const weekSessions = week ?? [];
  const weekVolume = weekSessions.reduce((s, w) => s + Number(w.volume_load || 0), 0);
  const monthVolume = (month ?? []).reduce((s, w) => s + Number(w.volume_load || 0), 0);
  const habitVolume = T.averageWeek(monthVolume, T.chronicDays(month ?? [], now));

  const weekLoad = loadWindow(weekSessions);
  const monthLoad = loadWindow(month ?? []);
  const habitLoad = T.averageWeek(monthLoad, T.chronicDays(month ?? [], now));
  const hasPR = weekSessions.some((w) => w.pr_detected);

  const strengthTarget = profile === undefined ? null : goalTraining(profile?.goal).strengthDays;
  const strengthDone = week == null ? null : strengthDaysIn(week, localDateStr(now));
  const trend = T.weeklyVolumes(history ?? [], T.TREND_WEEKS, now);
  const trendMax = Math.max(...trend.map((w) => w.volume), habitVolume);

  const sets = Array.isArray(latest?.sets) ? latest.sets : [];
  const age = latest ? T.daysSince(latest.date_time, now) : null;
  const stale = age != null && age >= T.STALE_AFTER_DAYS;

  if (!latest) return { empty: true };
  return {
    empty: false,
    judged,
    verdict: a > 0,
    zone,
    comparison: cmp,
    weekSessions: weekSessions.length,
    weekVolume,
    habitVolume,
    weekLoad,
    habitLoad,
    hasPR,
    strengthTarget,
    strengthDone,
    showStrength: strengthDone != null && strengthTarget != null,
    stale,
    age,
    showTrend: trend.some((w) => w.volume > 0),
    trend,
    trendMax,
    bars: trend.map((w) => {
      const empty = w.volume === 0;
      return { empty, height: empty ? 2 : Math.max(3, (w.volume / (trendMax || 1)) * TREND_H) };
    }),
    habitLine: habitVolume > 0 && trendMax > 0 ? (habitVolume / trendMax) * TREND_H : null,
    latest: {
      name: latest.template_name || null,
      sets: sets.length,
      volume: Number(latest.volume_load || 0),
      rpe: latest.session_rpe != null ? Number(latest.session_rpe) : null,
    },
  };
}

// ── các "bây giờ": thường, quanh hai ngày đổi giờ, nửa đêm, gần nửa đêm ──
const NOWS = [
  '2026-10-13T09:15:00-07:00',
  '2026-10-13T23:50:00-07:00',
  '2026-10-14T00:05:00-07:00',
  '2026-03-09T08:00:00-07:00', // ngày sau khi vào giờ mùa hè
  '2026-03-12T21:30:00-07:00',
  '2026-11-01T10:00:00-08:00', // ngày ra khỏi giờ mùa hè
  '2026-11-04T06:00:00-08:00',
  '2026-12-31T23:59:00-08:00',
].map((x) => new Date(x));

const REPS = [5, 8, 10, '12', '45s', 0, -3, null, 'x', 6.5];
const setsOf = () => {
  const k = rnd(6);
  if (k === 0) return [];
  if (k === 1) return null;
  return Array.from({ length: 1 + rnd(5) }, () => ({ reps: pick(REPS), weight: pick([0, 20, 60, 82.5]) }));
};
const VOL = [0, null, '', 800, 1250.5, '950.5', 3000, 12000, 4200];
const RPE = [null, 6, 7, 8, '8', 8.5, 10, 11, 0];
const NAMES = ['Push Day', '', null, 'Chân', 'Chạy bộ · 5 km'];

/** Hàng server trả cho `gte('date_time', daysAgoISO(56))`, mới trước. */
function history(now, density, gapFrom, gapTo) {
  const rows = [];
  const start = Date.parse(daysAgoISO(SPAN, now));
  for (let day = -1; day <= SPAN + 1; day++) {
    if (day >= gapFrom && day <= gapTo) continue;
    if (rnd(100) >= density) continue;
    const n = rnd(10) === 0 ? 2 : 1;
    for (let j = 0; j < n; j++) {
      const t = new Date(now);
      t.setDate(t.getDate() - day);
      // Giờ trong ngày: sáng sớm, trưa (ghi tay = trưa local), tối muộn.
      t.setHours(pick([5, 6, 12, 12, 18, 23]), pick([0, 15, 59]), 0, 0);
      if (t.getTime() < start) continue;
      rows.push({
        id: `s${rows.length}`,
        date_time: t.toISOString(),
        template_name: pick(NAMES),
        session_rpe: pick(RPE),
        volume_load: pick(VOL),
        pr_detected: rnd(12) === 0 ? true : pick([false, null]),
        sets: setsOf(),
      });
    }
  }
  return rows.sort((x, y) => (x.date_time < y.date_time ? 1 : -1));
}

const cards = [];
for (let i = 0; i < 240; i++) {
  const now = NOWS[i % NOWS.length];
  const kind = rnd(5);
  const density = [0, 15, 35, 60, 90][rnd(5)];
  // Một khoảng nghỉ: để có tuần trống, buổi gần nhất cũ (`stale`), lịch sử ngắn.
  const gapFrom = kind === 1 ? 0 : kind === 2 ? 10 + rnd(30) : 999;
  const gapTo = kind === 1 ? 7 + rnd(20) : kind === 2 ? gapFrom + rnd(14) : -1;
  const rows = kind === 3 ? history(now, density, 10 + rnd(40), 99) : history(now, density, gapFrom, gapTo);
  const acwr = pick([null, null, 0, 0.3, 0.65, 0.8, 1, 1.18, 1.3, 1.31, 1.6, 1.7, 2.4]);
  // `latest` là buổi mới nhất KHÔNG giới hạn ngày: có thể cũ hơn 56 ngày.
  const old = new Date(now);
  old.setDate(old.getDate() - (60 + rnd(40)));
  const latest =
    rows.length && rnd(5) !== 0
      ? rows[0]
      : rnd(3) === 0
        ? null
        : { id: 'old', date_time: old.toISOString(), template_name: pick(NAMES), session_rpe: pick(RPE), volume_load: pick(VOL), sets: setsOf() };
  const profile = pick([undefined, null, { goal: null }, { goal: 'strength' }, { goal: ' BULK ' }, { goal: 'cut' }, { goal: 'endurance' }]);
  cards.push({
    input: { now: now.toISOString(), acwr, latest, rows, profile: profile === undefined ? 'unloaded' : profile },
    out: card({ acwr, latest, rows, profile, now }),
  });
}

// ── các hàm thuần, riêng ──
const averageWeek = [
  [0, 0], [7000, 28], [7000, 7], [7000, 3], [7000, 0], [11100, 20], [999.5, 13],
].map(([v, d]) => ({ v, d, out: T.averageWeek(v, d) }));
const acwrPercent = [-1, 0, 0.5, 1, 1.3, 2, 2.5, 9].map((a) => ({ a, out: T.acwrPercent(a) }));
const goals = [null, undefined, '', 'strength', 'Strength', ' bulk ', 'cut', 'endurance', 'maintain', 'zzz'].map((g) => ({
  goal: g === undefined ? 'undefined' : g,
  strengthDays: goalTraining(g).strengthDays,
}));
const daysSince = [];
for (const now of NOWS) {
  for (const back of [0, 1, 2, 6, 7, 8, 30]) {
    for (const h of [0, 1, 12, 23]) {
      const t = new Date(now);
      t.setDate(t.getDate() - back);
      t.setHours(h, 30, 0, 0);
      daysSince.push({ now: now.toISOString(), at: t.toISOString(), out: T.daysSince(t.toISOString(), now) });
    }
  }
  // Tương lai (buổi ghi tay đóng dấu trưa local): 0, không âm.
  const f = new Date(now);
  f.setHours(f.getHours() + 5);
  daysSince.push({ now: now.toISOString(), at: f.toISOString(), out: T.daysSince(f.toISOString(), now) });
}

process.stdout.write(
  JSON.stringify({
    source:
      'native/src/{lib/training-card,lib/training-week,lib/goal-training,lib/session-load}.ts + components/ascnd/today-widgets-2.tsx (TrainingCard) @ fac9ac2 — gen-training.mjs, TZ=America/Los_Angeles',
    tz: process.env.TZ,
    trendWeeks: T.TREND_WEEKS,
    staleAfterDays: T.STALE_AFTER_DAYS,
    acwrMax: T.ACWR_MAX,
    optimal: T.ACWR_OPTIMAL,
    averageWeek,
    acwrPercent,
    goals,
    daysSince,
    cards,
  }) + '\n',
);
