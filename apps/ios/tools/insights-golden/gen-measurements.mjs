#!/usr/bin/env node
/**
 * Golden cho Số đo cơ thể (#527) — `app/measurements-trend.tsx` @ fac9ac2.
 *
 * Phần tính của màn không export: chép NGUYÊN VĂN `FIELDS` và `series`
 * (`:27-90`). Hai bản:
 *   - `rn`: đúng như RN — trục thời gian đọc `r.measured_at`, cột KHÔNG tồn
 *     tại (bảng có `date`, chính `useMeasurementHistory` ghi vậy), nên mọi
 *     điểm ra ngày `NaN-NaN-NaN`;
 *   - `fixed`: cùng mã, đọc `r.date`.
 * Giá trị, `last`, `delta`, `dir` hai bản trùng nhau (ngày không vào phép tính).
 *
 *   TZ=Asia/Ho_Chi_Minh node gen-measurements.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/measurements-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { localDateStr } = require('./out/local-date.js');

let seed = 2468;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};

// measurements-trend.tsx:27-40
const FIELDS = [
  { key: 'neck_cm', labelKey: 'measureNeck', unit: 'cm' },
  { key: 'shoulders_cm', labelKey: 'measureShoulders', unit: 'cm' },
  { key: 'chest_cm', labelKey: 'measureChest', unit: 'cm' },
  { key: 'waist_cm', labelKey: 'measureWaist', unit: 'cm' },
  { key: 'hips_cm', labelKey: 'measureHips', unit: 'cm' },
  { key: 'bicep_left_cm', labelKey: 'measureBicepL', unit: 'cm' },
  { key: 'bicep_right_cm', labelKey: 'measureBicepR', unit: 'cm' },
  { key: 'thigh_left_cm', labelKey: 'measureThighL', unit: 'cm' },
  { key: 'thigh_right_cm', labelKey: 'measureThighR', unit: 'cm' },
  { key: 'calf_left_cm', labelKey: 'measureCalfL', unit: 'cm' },
  { key: 'calf_right_cm', labelKey: 'measureCalfR', unit: 'cm' },
  { key: 'body_fat_pct', labelKey: 'measureBodyFat', unit: '%' },
];

// measurements-trend.tsx:50-90 (`timeKey`: 'measured_at' như RN, 'date' khi sửa).
function series(rows, timeKey) {
  const list = rows ?? [];
  return FIELDS.map((f) => {
    const points = list
      .map((r) => {
        const v = Number(r[f.key]);
        if (!Number.isFinite(v) || v <= 0) return null;
        return { t: new Date(String(r[timeKey])).getTime(), v };
      })
      .filter((p) => p != null);
    if (points.length < 2) return null;
    const first = points[0].v;
    const last = points[points.length - 1].v;
    const delta = Math.round((last - first) * 10) / 10;
    return {
      key: f.key,
      labelKey: f.labelKey,
      unit: f.unit,
      dates: points.map((p) => localDateStr(new Date(p.t))),
      values: points.map((p) => p.v),
      last,
      delta,
      dir: delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat',
      // `{s.last}{s.unit}` và `${delta > 0 ? '+' : ''}${delta}${unit}`
      lastText: `${last}${f.unit}`,
      deltaText: `${delta > 0 ? '+' : ''}${delta}${f.unit}`,
    };
  }).filter((s) => s != null);
}

const VALUES = [null, null, 0, -2, 'abc', '', '81.5', 30, 30.04, 30.05, 30.06, 35.25, 40, 75.5, 92.3, 18.7, 18.75, 101];
const cases = [];
for (let i = 0; i < 150; i++) {
  const n = rnd(9);
  const rows = [];
  for (let k = 0; k < n; k++) {
    const d = new Date(Date.UTC(2026, 6, 1 + k * 7 + rnd(7)));
    const row = { id: `m${i}-${k}`, date: d.toISOString().slice(0, 10) };
    for (const f of FIELDS) if (rnd(3) > 0) row[f.key] = VALUES[rnd(VALUES.length)];
    rows.push(row);
  }
  const rn = series(rows, 'measured_at');
  const fixed = series(rows, 'date');
  cases.push({ rows, rn, fixed });
}
process.stdout.write(JSON.stringify(cases, null, 1) + '\n');
