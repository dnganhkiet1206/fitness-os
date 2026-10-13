#!/usr/bin/env node
/**
 * Golden cho ba vòng hoạt động của Hôm nay (#527 N4) — @ fac9ac2.
 *
 * BIÊN DỊCH (`build.sh`): `activity.ts` (`activityModel`, `ringValueText`,
 * `ringTargetText`, `trainingMinutes`, hai mục tiêu), `prescription.ts`
 * (`estimatedMinutes`, mà `trainingMinutes` gọi).
 *
 * CHÉP NGUYÊN VĂN: `minutesOf` (`hooks/use-fitness-data.ts:555`) — gộp `sets`
 * của MỌI buổi hôm nay rồi tính một lần.
 *
 * `toLocaleString()` của Node là `en-US` ("10,000"): test Swift so với locale
 * `en_US`.
 *
 *   ./build.sh && node gen-activity.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/activity-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const A = require('./out/activity.js');

let s = 41173;
const rnd = (n) => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return Math.floor(s / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

const KCAL = [null, null, 0, -5, 12.4, 150, 299.5, 300, 412.6, 1250];
const EST = [null, null, 0, 35, 120.2, 300, 680];
const MIN = [null, null, 0, 4, 29.6, 30, 75];
const LOGGED = [0, 0, 0.4, 0.5, 12, 29.5, 30, 64, -3, NaN];
const STEPS = [0, 0, 340.6, 9999.5, 10000, 12844, -20];
const TARGET = [0, -1, 6000, 8000, 10000, 12500];

const models = [];
for (let i = 0; i < 300; i++) {
  const input = {
    moveKcal: pick(KCAL),
    estimatedMoveKcal: pick(EST),
    healthMinutes: pick(MIN),
    loggedMinutes: pick(LOGGED),
    steps: pick(STEPS),
    stepsTarget: pick(TARGET),
  };
  const m = A.activityModel(input);
  models.push({
    input: { ...input, loggedMinutes: Number.isNaN(input.loggedMinutes) ? 'NaN' : input.loggedMinutes },
    out: {
      closed: m.closed,
      hasAny: m.hasAny,
      rings: m.rings.map((r) => ({
        key: r.key,
        current: Number.isNaN(r.current) ? 'NaN' : r.current,
        target: r.target,
        source: r.source,
        pct: Number.isNaN(r.pct) ? 'NaN' : r.pct,
        value: A.ringValueText(r),
        targetText: A.ringTargetText(r, 'u'),
      })),
    },
  });
}

// `minutesOf`, nguyên văn (`use-fitness-data.ts:555`).
const minutesOf = (rows) => A.trainingMinutes(rows.flatMap((s) => (Array.isArray(s.sets) ? s.sets : [])));
const REPS = [10, 8, '12', 0, null, 'x', 5];
const REST = [undefined, undefined, 60, 120, 0, null];
const minutes = [];
for (let i = 0; i < 80; i++) {
  const rows = Array.from({ length: rnd(4) }, () => {
    const k = rnd(6);
    if (k === 0) return { sets: null, session_rpe: 8 };
    if (k === 1) return { sets: { reps: 10 }, session_rpe: 8 };
    return {
      session_rpe: pick([null, 6, 8]),
      sets: Array.from({ length: rnd(6) }, () => {
        const set = { reps: pick(REPS), weight: 40 };
        const rest = pick(REST);
        if (rest !== undefined) set.restSeconds = rest;
        return set;
      }),
    };
  });
  minutes.push({ rows, out: minutesOf(rows) });
}

process.stdout.write(
  JSON.stringify({
    source: 'native/src/lib/{activity,prescription}.ts + hooks/use-fitness-data.ts (minutesOf) @ fac9ac2 — gen-activity.mjs',
    moveTargetKcal: A.MOVE_TARGET_KCAL,
    exerciseTargetMin: A.EXERCISE_TARGET_MIN,
    models,
    minutes,
  }) + '\n',
);
