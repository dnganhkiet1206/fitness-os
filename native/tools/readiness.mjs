/**
 * The readiness score, actually computed.
 *
 * ── why this exists ──
 *
 * Readiness is the most consequential number the app produces: it is the
 * headline on Today, it colours the day green or amber or red, and the advice
 * underneath it — rest, cut volume, push — is advice about somebody's body.
 *
 * Until this file, **nothing ran it.** Two tools mention `readiness-engine.ts`
 * and both only transcribe constants out of it: `training-card.mjs` copies the
 * load bands, `health-source.mjs` checks where the inputs come from. Every
 * assertion about the engine was a copy of the engine, and a copy agrees with
 * itself.
 *
 * ── the bug it was written for ──
 *
 * `robustZ` divided by `1.4826 * MAD + 1e-6`. MAD is a *spread* estimate, and
 * resting heart rate is stored as a whole number over a five-to-twenty-eight
 * reading window, so a spread of exactly zero is ordinary rather than exotic:
 * `[58, 58, 58, 60, 62]` has MAD **0**.
 *
 * With a divisor of `1e-6`, a reading one beat above the median produced
 * `z ≈ 10⁶`, clamped to 3, scoring `50 - 12·3` = **14/100** — identical to a
 * reading forty beats high. The metric was no longer a measurement but a
 * three-step function: 86 below the median, 50 on it, 14 above. At weight 0.20
 * that is seven to nine points of readiness, enough to turn a green day amber,
 * and the panel announced "Nhịp tim nghỉ: cao (14)" about one beat of ordinary
 * variation.
 *
 * Two properties are asserted rather than one number, because the number is a
 * product decision and the properties are what make it a measurement at all:
 * a bigger deviation must score worse than a smaller one (**monotonic**), and a
 * one-unit deviation must not score like a catastrophic one (**proportionate**).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const out = mkdtempSync(path.join(tmpdir(), 'readiness-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/readiness-engine.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* `./types` is type-only and the `@/` alias is unmapped without the project
     tsconfig; tsc exits non-zero and still emits, which is all this uses. */
}
const emitted = path.join(out, 'readiness-engine.js');
if (!readFileSync(emitted, 'utf8')) {
  console.log('không biên dịch được src/lib/readiness-engine.ts');
  process.exit(1);
}
const { computeReadiness } = createRequire(import.meta.url)(emitted);

/** A day with everything present, so one variable can be moved at a time. */
const base = {
  hrv_today: 60,
  rhr_today: 58,
  sleep_min_lastnight: 450,
  sleep_target_min: 480,
  sleep_debt_7d_min: 0,
  training_load_7d: 9000,
  training_load_28d: 36000,
  training_days_28d: 28,
  illness_flag: false,
  hrv_history_28d: [60, 60, 60, 62, 58, 61, 59],
  rhr_history_28d: [58, 58, 58, 60, 62],
};

const rhrScore = (rhr, history = base.rhr_history_28d) =>
  computeReadiness({ ...base, rhr_today: rhr, rhr_history_28d: history })?.subscores?.rhr;
const hrvScore = (hrv, history) =>
  computeReadiness({ ...base, hrv_today: hrv, hrv_history_28d: history })?.subscores?.hrv;

/* ── 1. the zero-spread baseline is the real one ── */
{
  /* Stated out loud: this fixture is the shape the bug needs. If the data ever
     stops producing MAD 0 the rest of this section is measuring nothing. */
  const h = base.rhr_history_28d;
  const med = [...h].sort((a, b) => a - b)[Math.floor(h.length / 2)];
  const devs = h.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const madVal = devs[Math.floor(devs.length / 2)];
  if (madVal !== 0) {
    problems.push(`bộ dữ liệu mẫu không còn cho MAD = 0 (ra ${madVal}) — luật này mất mục tiêu`);
  }
}

/* ── 2. one beat is not forty beats ── */
{
  const onBase = rhrScore(58);
  const oneUp = rhrScore(59);
  const wayUp = rhrScore(98);

  for (const [name, v] of [['đúng median', onBase], ['+1 bpm', oneUp], ['+40 bpm', wayUp]]) {
    if (typeof v !== 'number') {
      problems.push(`điểm nhịp nghỉ ${name} không tính được (${v})`);
    }
  }

  if (typeof oneUp === 'number' && typeof wayUp === 'number') {
    if (oneUp === wayUp) {
      problems.push(
        `nhích 1 bpm và nhích 40 bpm cùng ra ${oneUp} điểm — MAD = 0 biến chỉ số thành hàm bậc thang, ` +
          'và ô giải thích in ra "Nhịp tim nghỉ: cao" cho một nhịp dao động bình thường',
      );
    }
    if (!(oneUp > wayUp)) {
      problems.push(`nhích 1 bpm (${oneUp}) không được chấm cao hơn nhích 40 bpm (${wayUp})`);
    }
    /* Proportionate: a single beat must stay near neutral rather than landing
       at the bottom of the scale. */
    if (oneUp < 35) {
      problems.push(
        `nhích đúng 1 bpm đã bị chấm ${oneUp}/100 — một nhịp không phải là dấu hiệu kiệt sức`,
      );
    }
  }

  /* And the metric still works: a genuinely high resting heart rate must score
     badly, or the floor has flattened the signal instead of the noise. */
  if (typeof wayUp === 'number' && wayUp > 30) {
    problems.push(`nhịp nghỉ cao hơn 40 bpm vẫn được ${wayUp}/100 — biên độ sàn đang nuốt cả tín hiệu thật`);
  }
}

/* ── 3. monotonic across the whole range ── */
{
  let last = Infinity;
  for (let rhr = 55; rhr <= 75; rhr++) {
    const s = rhrScore(rhr);
    if (typeof s !== 'number') continue;
    if (s > last + 1e-9) {
      problems.push(`điểm nhịp nghỉ tăng lên khi nhịp tim xấu đi (tại ${rhr} bpm)`);
      break;
    }
    last = s;
  }
}

/* ── 4. HRV has the same hole, in its own unit ── */
{
  const flat = [62, 62, 62, 62, 62];
  const oneOff = hrvScore(61, flat);
  const wayOff = hrvScore(20, flat);
  if (typeof oneOff === 'number' && typeof wayOff === 'number') {
    if (oneOff === wayOff) {
      problems.push(
        `HRV lệch 1 ms và lệch 42 ms cùng ra ${oneOff} điểm — cùng lỗi MAD = 0 ở chỉ số nặng ký nhất`,
      );
    }
    if (oneOff < 35) {
      problems.push(`HRV lệch đúng 1 ms đã bị chấm ${oneOff}/100`);
    }
  }
}

/* ── 5. and a missing reading is still not a bad reading ── */
{
  const noRhr = computeReadiness({ ...base, rhr_today: undefined });
  if (noRhr?.subscores?.rhr !== undefined) {
    problems.push('không có nhịp nghỉ mà vẫn chấm điểm cho nó — thiếu số đo không phải là số đo xấu');
  }
  const thinHistory = rhrScore(58, [58, 58]);
  if (thinHistory !== undefined) {
    problems.push('mới 2 lần đo đã dám dựng baseline nhịp nghỉ');
  }
}

if (problems.length) {
  console.log('điểm sẵn sàng:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'điểm sẵn sàng OK — chạy THẬT engine chứ không chép hằng số (trước đây không công cụ nào ' +
    'gọi computeReadiness, dù đây là con số quyết định màu của cả ngày); với baseline nhịp tim ' +
    'không có độ phân tán (MAD = 0, chuyện thường vì bpm là số nguyên), nhích 1 bpm không còn ' +
    'bị chấm ngang nhích 40 bpm — bản đã ship cho cả hai đúng 14/100; điểm giảm đơn điệu suốt ' +
    'dải 55–75 bpm; HRV cũng vậy ở đơn vị của nó; nhịp nghỉ cao thật vẫn bị chấm thấp nên biên độ ' +
    'sàn chỉ nuốt nhiễu chứ không nuốt tín hiệu; và thiếu số đo vẫn trả về "không có điểm" ' +
    'chứ không phải điểm kém',
);
