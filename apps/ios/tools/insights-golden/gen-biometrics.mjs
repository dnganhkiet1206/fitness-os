#!/usr/bin/env node
/**
 * Golden cho màn sinh trắc học (#527) — `app/biometrics.tsx` @ fac9ac2. Không
 * hàm nào ở đó export, nên các biểu thức chép NGUYÊN VĂN (chỉ bỏ kiểu TS):
 *
 * - `statusOf` (`:40–45`): trong khoảng → good; lệch ≤ 15% bề rộng → warn; còn lại → bad;
 * - `hrvKinds` (`:77–82`): chỉ loại HRV đã có; chưa có gì thì RMSSD;
 * - giá trị hiện (`:168`): `Math.round(latest * 10) / 10` rồi `String(n)`;
 * - `summarise` (`:268–277`): chỉ phần đã đo, nối " · ", rỗng → "No values".
 *
 *   node gen-biometrics.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/biometrics-golden.json
 */
function statusOf(v, [lo, hi]) {
  if (v >= lo && v <= hi) return 'good';
  const margin = (hi - lo) * 0.15;
  if (v >= lo - margin && v <= hi + margin) return 'warn';
  return 'bad';
}

function hrvKinds(history) {
  const hasSdnn = (history ?? []).some((s) => s.hrv_sdnn_ms != null);
  const hasRmssd = (history ?? []).some((s) => s.hrv_rmssd_ms != null);
  if (!hasSdnn && !hasRmssd) return { sdnn: false, rmssd: true };
  return { sdnn: hasSdnn, rmssd: hasRmssd };
}

function summarise(s, vi) {
  const bits = [];
  if (s.hr_bpm != null) bits.push(`${vi ? 'Nhịp nghỉ' : 'RHR'} ${s.hr_bpm}`);
  if (s.hrv_sdnn_ms != null) bits.push(`SDNN ${s.hrv_sdnn_ms}ms`);
  if (s.hrv_rmssd_ms != null) bits.push(`RMSSD ${s.hrv_rmssd_ms}ms`);
  if (s.spo2_pct != null) bits.push(`SpO₂ ${s.spo2_pct}%`);
  if (s.resp_rate_rpm != null) bits.push(`${vi ? 'Thở' : 'Resp'} ${s.resp_rate_rpm}`);
  if (s.vo2max_mlkgmin != null) bits.push(`VO₂max ${s.vo2max_mlkgmin}`);
  return bits.join(' · ') || (vi ? 'Không có giá trị' : 'No values');
}

// Khoảng của từng thẻ (`:84–104`).
const RANGES = {
  hr: [50, 100], hrvSdnn: [20, 100], hrv: [20, 100], spo2: [95, 100], vo2max: [30, 60], resp: [12, 20], soreness: [1, 10],
};
const probes = [-5, 0, 0.5, 1, 4, 10, 11, 11.3, 11.4, 12, 13.6, 16, 20, 21.2, 21.3, 25, 29, 30, 37, 38, 42.5, 50, 60, 64.5, 65,
  67, 92, 92.75, 93, 95, 99.9, 100, 100.75, 101, 107.5, 108, 112, 120, 130];
const status = [];
for (const [metric, range] of Object.entries(RANGES)) {
  for (const v of probes) status.push({ metric, v, status: statusOf(v, range) });
}

const display = [0, 1, 45, 45.04, 45.05, 45.15, 45.25, 62.349, 62.35, 98.95, 99.99, 0.05, 0.15, 3.45, 1e-7, 12.25, 37.5]
  .map((v) => ({ v, text: String(Math.round(v * 10) / 10) }));

const kinds = [
  { name: 'none', rows: [] },
  { name: 'no-hrv', rows: [{ hr_bpm: 60 }] },
  { name: 'rmssd-only', rows: [{ hrv_rmssd_ms: 45 }, { hr_bpm: 58 }] },
  { name: 'sdnn-only', rows: [{ hrv_sdnn_ms: 52 }] },
  { name: 'both', rows: [{ hrv_sdnn_ms: 52 }, { hrv_rmssd_ms: 40 }] },
].map(({ name, rows }) => ({ name, rows, kinds: hrvKinds(rows) }));

const samples = [
  {},
  { hr_bpm: 58 },
  { hr_bpm: 58, hrv_sdnn_ms: 52.5, hrv_rmssd_ms: 40, spo2_pct: 97, resp_rate_rpm: 14.5, vo2max_mlkgmin: 44.2 },
  { spo2_pct: 99, vo2max_mlkgmin: 50 },
  { hrv_rmssd_ms: 0, soreness_1_10: 4, illness_flag: true },
  { resp_rate_rpm: 16 },
];
const summary = samples.map((s) => ({ sample: s, vi: summarise(s, true), en: summarise(s, false) }));

process.stdout.write(JSON.stringify({ status, display, kinds, summary }, null, 1) + '\n');
