#!/usr/bin/env node
/**
 * Golden cho ghi giấc ngủ (#527, `log-sleep`) — @ fac9ac2.
 *
 * BIÊN DỊCH (`build.sh`): `sleep-window.ts` (`sleepSpan`), `plausible.ts`
 * (`plausible`, `plausibleText`, `BOUNDS`), `health-owned.ts` (`fromHealth`,
 * `healthValues`, `overriddenFields`).
 *
 * CHÉP NGUYÊN VĂN (sống trong component / gắn với supabase, không biên dịch
 * riêng được) — chỉ thay trạng thái React bằng tham số:
 * - `app/log-sleep.tsx:163-169` `durationBad`, `:186-197` lỗi giai đoạn;
 * - `:131-143` `healthChanges`;
 * - `:248-256` hàng ghi (`Number(x) || 0`);
 * - `lib/same-day-entry.ts:34-37,73-79` phép CHỒNG LẤN của `sleepRowToReplace`.
 *
 * `sleepSpan` đọc giờ địa phương: chạy dưới nhiều `TZ` (đổi `process.env.TZ`
 * giữa chừng — Node đọc lại), gồm hai ngày đổi giờ của New York.
 *
 *   node gen-sleep-log.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/sleep-log-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { sleepSpan } = require('./out/sleep-window.js');
const { BOUNDS, plausible, plausibleText } = require('./out/plausible.js');
const { fromHealth, healthValues, overriddenFields } = require('./out/health-owned.js');

let s = 9091;
const rnd = (n) => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return Math.floor(s / 65536) % n;
};

// ── sleepSpan dưới nhiều múi giờ ──
const span = [];
const TZS = ['UTC', 'Asia/Ho_Chi_Minh', 'America/New_York', 'Australia/Lord_Howe'];
const REFS = ['2026-10-10T05:30:00Z', '2026-03-08T12:00:00Z', '2026-11-01T12:00:00Z', '2026-10-04T15:00:00Z', '2026-01-01T00:10:00Z'];
const TIMES = [[23, 0], [7, 0], [22, 30], [6, 45], [0, 0], [1, 30], [2, 30], [12, 0], [13, 15], [23, 59], [7, 0]];
for (const tz of TZS) {
  process.env.TZ = tz;
  for (const ref of REFS) {
    const refDate = new Date(ref);
    for (let i = 0; i < 30; i++) {
      const [bh, bm] = TIMES[rnd(TIMES.length)];
      const [wh, wm] = i === 0 ? [bh, bm] : TIMES[rnd(TIMES.length)];
      const r = sleepSpan({ getHours: () => bh, getMinutes: () => bm }, { getHours: () => wh, getMinutes: () => wm }, refDate);
      span.push({ tz, ref: refDate.getTime(), bed: [bh, bm], wake: [wh, wm], bedAt: r.bedDate.getTime(), wakeAt: r.wakeDate.getTime(), minutes: r.minutes });
    }
  }
}
process.env.TZ = 'UTC';

// ── lỗi thời lượng / giai đoạn (log-sleep.tsx, nguyên văn) ──
function checks(deepMin, remMin, lightMin, durationMin) {
  const durationBad = !plausible('sleep_duration_min', durationMin);
  const stages = [deepMin, remMin, lightMin].map((v) => (v.trim() ? Number(v) : 0));
  const stageBad = [deepMin, remMin, lightMin].some((v) => !plausibleText('sleep_stage_min', v));
  const stageSum = stages.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const stagesOverrun = durationMin > 0 && stageSum > durationMin;
  return { durationBad, stageBad, stageSum, stagesOverrun };
}
const STAGE_TEXTS = ['', ' ', '0', '30', '60.5', '90', '120', '200', '480', '1440', '1441', '-5', '.5', '5.', 'abc', '0x10', '1e2', ' 45 '];
const DURATIONS = [0, 5, 9, 10, 300, 480, 960, 961, 1200];
const stage = [];
for (let i = 0; i < 300; i++) {
  const d = STAGE_TEXTS[rnd(STAGE_TEXTS.length)], r = STAGE_TEXTS[rnd(STAGE_TEXTS.length)], l = STAGE_TEXTS[rnd(STAGE_TEXTS.length)];
  const dur = DURATIONS[rnd(DURATIONS.length)];
  // Hàng ghi (`:248-256`): `Number(x) || 0`.
  const row = { deep_min: Number(d) || 0, rem_min: Number(r) || 0, light_min: Number(l) || 0 };
  stage.push({ deep: d, rem: r, light: l, duration: dur, ...checks(d, r, l, dur), row });
}

// ── sleepRowToReplace: phép chồng lấn trên các hàng của ngày thức dậy ──
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
function pick(bedtime, waketime, data) {
  const wake = new Date(waketime);
  if (Number.isNaN(wake.getTime())) return null;
  const bed = new Date(bedtime).getTime();
  const woke = wake.getTime();
  for (const row of data) {
    const b = new Date(String(row.bedtime)).getTime();
    const w = new Date(String(row.waketime)).getTime();
    if (Number.isNaN(b) || Number.isNaN(w)) continue;
    if (overlaps(bed, woke, b, w)) return String(row.id);
  }
  return null;
}
const H = 3600000;
const base = Date.parse('2026-10-10T00:00:00Z');
const iso = (t) => new Date(t).toISOString();
const replace = [];
for (let i = 0; i < 150; i++) {
  const bed = base - rnd(10) * H + rnd(4) * 15 * 60000;
  const wake = bed + (rnd(12) + 1) * H;
  const rows = [];
  for (let k = 0, n = rnd(4); k < n; k++) {
    const b = base - rnd(14) * H + rnd(4) * 15 * 60000;
    const w = b + rnd(10) * H;
    const kind = rnd(8);
    rows.push({
      id: `r${i}-${k}`,
      bedtime: kind === 0 ? 'not a date' : iso(b),
      waketime: kind === 1 ? null : iso(w),
    });
  }
  replace.push({ bedtime: iso(bed), waketime: iso(wake), rows, expected: pick(iso(bed), iso(wake), rows) });
}

// ── đêm Apple Health ghi + số thứ bị sửa (`healthChanges`, nguyên văn) ──
const SOURCES = [null, '', '  ', 'manual', ' manual ', 'apple_health', 'healthkit', 'Manual'];
const VAL = [null, 0, -3, 45, '60', 'x', 90.5];
const health = [];
for (let i = 0; i < 200; i++) {
  const night = {
    source: SOURCES[rnd(SOURCES.length)],
    bedtime: iso(base - 7 * H),
    waketime: iso(base + rnd(2) * H),
    deep_min: VAL[rnd(VAL.length)],
    rem_min: VAL[rnd(VAL.length)],
    light_min: VAL[rnd(VAL.length)],
  };
  const healthNight = fromHealth(night) ? night : null;
  const healthStages = healthValues(healthNight, ['deep_min', 'rem_min', 'light_min']);
  const typed = [STAGE_TEXTS[rnd(STAGE_TEXTS.length)], STAGE_TEXTS[rnd(STAGE_TEXTS.length)], STAGE_TEXTS[rnd(STAGE_TEXTS.length)]];
  const bedDate = new Date(base - (7 - rnd(2)) * H);
  const wakeDate = new Date(base + rnd(2) * H);
  let n = 0;
  if (healthNight) {
    n = overriddenFields(healthStages, {
      deep_min: typed[0].trim() === '' ? null : Number(typed[0]),
      rem_min: typed[1].trim() === '' ? null : Number(typed[1]),
      light_min: typed[2].trim() === '' ? null : Number(typed[2]),
    }).length;
    if (+new Date(String(healthNight.bedtime)) !== +bedDate) n += 1;
    if (+new Date(String(healthNight.waketime)) !== +wakeDate) n += 1;
  }
  health.push({
    night, typed, bedAt: bedDate.getTime(), wakeAt: wakeDate.getTime(),
    fromHealth: fromHealth(night), stages: healthStages, changes: n,
  });
}

process.stdout.write(
  JSON.stringify({ BOUNDS: { duration: BOUNDS.sleep_duration_min, stage: BOUNDS.sleep_stage_min }, span, stage, replace, health }, null, 0)
    .replace(/\},\{/g, '},\n{') + '\n',
);
