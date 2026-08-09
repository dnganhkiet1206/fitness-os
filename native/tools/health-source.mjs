/**
 * That a number keeps its meaning between the watch and the readiness score.
 *
 * ── the bug this exists for ──
 *
 * `health.ts` read Apple's `HeartRateVariabilitySDNN` and wrote it into
 * `biometric_samples.hrv_rmssd_ms`. The manual entry screen wrote the *same*
 * column from a field labelled "HRV RMSSD (ms)". SDNN and RMSSD are different
 * quantities that do not convert into each other — Apple publishes only SDNN,
 * most straps report RMSSD — so anybody who both synced a Watch and ever typed
 * a reading had one column holding two populations.
 *
 * `daily-log-service` then built `hrv_history_28d` from all of it and scored
 * today against that baseline as a robust z-score, weighted **0.30** — the
 * largest single term in the readiness score. A bimodal baseline inflates its
 * MAD, which flattens the z toward zero, so real changes in recovery stop
 * moving the number; and the day somebody switched sources their readiness
 * jumped for a reason that had nothing to do with their body.
 *
 * ── why it needs a tool ──
 *
 * Nothing about it is visible. Both numbers are plausible HRV readings in ms,
 * the chart draws a line either way, the score comes out between 0 and 100. It
 * survived because every part of it type-checks and looks reasonable in
 * isolation, and the only way to notice is to know what the two acronyms mean.
 *
 * The same shape of mistake is now one edit away in three more places, which is
 * what the rest of this file is about: time in bed counted as sleep, an
 * imported run given an invented tonnage, and a sync that writes a second copy
 * of last night every time it runs.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HEALTH = 'src/lib/health.ts';
const SYNC = 'src/hooks/use-health-sync.ts';
const SERVICE = 'src/lib/daily-log-service.ts';

const problems = [];

/*
  ── 1: Apple's HRV goes in the Apple-shaped column ──

  Checked as a pair. Writing to `hrv_sdnn_ms` is only right if the value being
  written is the SDNN read, and a file that mentions both columns has to be
  looked at rather than pattern-matched.
*/
{
  const code = strip(read(HEALTH));
  if (!/HeartRateVariabilitySDNN/.test(code)) {
    problems.push(`${HEALTH}: không còn đọc SDNN — nếu Apple đổi API thì sửa luật này, đừng bỏ nó`);
  }
  if (/hrv_rmssd_ms/.test(code)) {
    problems.push(
      `${HEALTH}: vẫn nhắc tới hrv_rmssd_ms — Apple chỉ công bố SDNN, ghi vào cột RMSSD là trộn hai đại lượng khác nhau`,
    );
  }
  if (!/hrv_sdnn_ms/.test(code)) {
    problems.push(`${HEALTH}: không ghi hrv_sdnn_ms — giá trị SDNN phải nằm ở cột mang đúng tên nó`);
  }
  const sync = strip(read(SYNC));
  if (/hrv_rmssd_ms/.test(sync)) {
    problems.push(`${SYNC}: ghi hrv_rmssd_ms từ dữ liệu Apple — đó là SDNN`);
  }
}

/*
  ── 2: one HRV family per baseline ──

  The failure is a single `concat` or a filter that takes "whichever column is
  not null", either of which reads as tidying up.
*/
{
  const code = strip(read(SERVICE));
  /*
    The baseline itself has to branch on the flag — not merely mention it.

    The first version searched the file for `usingSdnn`, which a sabotage passed
    with the variable left in place and the history rebuilt from both columns.
    A rule that a surviving identifier satisfies is checking spelling, not
    behaviour.
  */
  if (!/hrvHistory[\s\S]{0,200}?usingSdnn \? b\.hrv_sdnn_ms : b\.hrv_rmssd_ms/.test(code)) {
    problems.push(
      `${SERVICE}: baseline HRV không chọn theo họ chỉ số — ` +
        'trộn SDNN với RMSSD làm baseline hai đỉnh, và HRV chiếm 0.30 điểm sẵn sàng',
    );
  }
  /* Both columns feeding one array in one expression is the regression. */
  if (/hrv_sdnn_ms\s*\?\?\s*b?\.?hrv_rmssd_ms|hrv_rmssd_ms\s*\?\?\s*b?\.?hrv_sdnn_ms/.test(code)) {
    problems.push(
      `${SERVICE}: lấy "cột nào có thì dùng" cho HRV — đó chính là cách hai đại lượng lại chảy vào một baseline`,
    );
  }
  if (!/hrv_today: hrvToday/.test(code)) {
    problems.push(`${SERVICE}: hrv_today không đi qua bước chọn họ chỉ số`);
  }
}

/*
  ── 3: time in bed is not time asleep ──

  HealthKit records the awake stretches inside a night. Ignoring them credits
  somebody who read in bed for an hour with an hour of recovery, and sleep is
  weighted the same 0.30 as HRV.
*/
{
  const health = strip(read(HEALTH));
  if (!/getLastNightSleep/.test(health)) {
    problems.push(`${HEALTH}: không còn đọc giấc ngủ từ HealthKit`);
  }
  /* value 2 is `awake`, 0 is `inBed`; both must be skipped from the total. */
  if (!/v === 2 \|\| v === 0/.test(health)) {
    problems.push(
      `${HEALTH}: tổng thời gian ngủ không loại giai đoạn thức (2) và nằm-trên-giường (0) — ` +
        'đó là cách một đêm dài thêm cả tiếng đồng hồ',
    );
  }
  const svc = strip(read(SERVICE));
  if (!/function asleepMinutes/.test(svc)) {
    problems.push(`${SERVICE}: không có asleepMinutes — thời lượng ngủ lại quay về waketime trừ bedtime`);
  }
  if (!/asleep_min != null/.test(svc)) {
    problems.push(`${SERVICE}: không ưu tiên asleep_min khi nguồn đo được nó`);
  }
  /* Both readers of sleep_logs must go through it, or the night and the 7-day
     debt printed above each other disagree. */
  /* The declaration matches `asleepMinutes(` too, and counting it let a
     sabotage that deleted one of the two call sites read as two. */
  const uses = [...svc.matchAll(/(?<!function )asleepMinutes\(/g)].length;
  if (uses < 2) {
    problems.push(
      `${SERVICE}: chỉ ${uses} chỗ dùng asleepMinutes — cả đêm hôm qua lẫn nợ ngủ 7 ngày phải tính cùng một cách`,
    );
  }
}

/*
  ── 4: resting heart rate is a different quantity from heart rate ──

  `hr_bpm` is a resting-HR column: the manual field above it says "Nhịp tim
  nghỉ", and `readiness-engine` scores it as `rhr` at a weight of 0.20 (0.25
  with no HRV). The Apple path read `HKQuantityTypeIdentifierHeartRate`, the
  latest instantaneous beat — so a sync taken after climbing the stairs filed a
  resting heart rate of 110 and marked the day down for it.

  Same shape as the SDNN one above, and just as invisible: both numbers are
  heart rates in bpm and both look fine on the chart.
*/
{
  const code = strip(read(HEALTH));
  if (/'HKQuantityTypeIdentifierHeartRate'/.test(code)) {
    problems.push(
      `${HEALTH}: đọc HeartRate (nhịp tức thời) cho cột nhịp tim nghỉ — ` +
        'đồng bộ sau khi leo cầu thang sẽ ghi nhịp nghỉ 110 rồi trừ điểm sẵn sàng vì nó',
    );
  }
  if (!/HKQuantityTypeIdentifierRestingHeartRate/.test(code)) {
    problems.push(`${HEALTH}: không đọc RestingHeartRate — đó mới là đại lượng cột hr_bpm nói tới`);
  }
  /* SpO2's unit could not be confirmed either way, so the value decides. A bare
     `* 100` is the version that is wrong by a factor of a hundred if the bridge
     ever hands back percentages. */
  if (!/function asPercent/.test(code)) {
    problems.push(`${HEALTH}: SpO₂ không đi qua asPercent — nhân thẳng 100 là sai gấp trăm lần nếu đơn vị đổi`);
  }
}

/*
  ── 5: an imported workout carries no tonnage, and imports once ──

  ACWR is a sum of `volume_load`. A run has none, so a zero keeps the ratio
  exactly where it was while the session still raises `workout_count` and resets
  "you have not trained in N days". Any other number there is invented, and it
  lands in the one figure on that screen whose job is to be trustworthy.
*/
{
  const sync = strip(read(SYNC));
  if (!/volume_load: 0/.test(sync)) {
    problems.push(
      `${SYNC}: buổi tập nhập từ Apple không đặt volume_load: 0 — ` +
        'bất kỳ số nào khác đều là bịa, và nó chảy thẳng vào ACWR',
    );
  }
  for (const [what, re] of [
    ['external_id', /external_id/],
    ['onConflict', /onConflict: 'user_id,external_id'/],
  ]) {
    if (!re.test(sync)) {
      problems.push(`${SYNC}: thiếu ${what} — chạy đồng bộ lần hai là nhân đôi đêm qua và mọi buổi tập`);
    }
  }
  /* A night somebody typed in wins: they were there. */
  if (!/\.eq\('source', 'manual'\)/.test(sync)) {
    problems.push(`${SYNC}: không kiểm tra đêm đã ghi tay — đồng bộ sẽ đè lên thứ người dùng tự nhập`);
  }
}

/**
 * The self-test.
 *
 * The mixed-baseline rule is the one worth proving, because the wrong version
 * is the one that reads as a helpful fallback.
 */
const SELF = [
  ['cột nào có thì dùng — bị bắt', () => {
    const bad = 'const v = b.hrv_sdnn_ms ?? b.hrv_rmssd_ms;';
    return /hrv_sdnn_ms\s*\?\?\s*b?\.?hrv_rmssd_ms/.test(bad);
  }],
  ['chọn theo họ — không bị bắt', () => {
    const good = 'const hrvHistory = (bioHistory ?? []).map(b => (usingSdnn ? b.hrv_sdnn_ms : b.hrv_rmssd_ms));';
    return !/hrv_sdnn_ms\s*\?\?\s*b?\.?hrv_rmssd_ms/.test(good) && /usingSdnn/.test(good);
  }],
  ['giữ tên biến nhưng trộn baseline — bị bắt', () => {
    const bad = 'const usingSdnn = true;\nconst hrvHistory = h.map(b => b.hrv_sdnn_ms ?? b.hrv_rmssd_ms);';
    return !/hrvHistory[\s\S]{0,200}?usingSdnn \? b\.hrv_sdnn_ms : b\.hrv_rmssd_ms/.test(bad);
  }],
  ['dòng khai báo hàm không tính là chỗ gọi', () => {
    const one = 'function asleepMinutes(x) {}\nconst a = asleepMinutes(s);';
    return [...one.matchAll(/(?<!function )asleepMinutes\(/g)].length === 1;
  }],
  ['tổng ngủ quên loại giai đoạn thức — bị bắt', () => {
    const bad = 'for (const s of night) { asleep += minutes(s); }';
    return !/v === 2 \|\| v === 0/.test(bad);
  }],
  ['đọc HeartRate thay vì RestingHeartRate — bị bắt', () => {
    const bad = "latestQuantity('HKQuantityTypeIdentifierHeartRate', 'count/min')";
    return /'HKQuantityTypeIdentifierHeartRate'/.test(bad);
  }],
  ['RestingHeartRate không bị bắt nhầm', () => {
    const good = "latestQuantity('HKQuantityTypeIdentifierRestingHeartRate', 'count/min')";
    return !/'HKQuantityTypeIdentifierHeartRate'/.test(good);
  }],
  ['nhập buổi tập có tonnage — bị bắt', () => {
    const bad = "{ volume_load: w.kcal ?? 0, external_id: w.id }";
    return !/volume_load: 0/.test(bad);
  }],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — không bắt được: ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('nguồn dữ liệu sức khoẻ sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  'nguồn sức khoẻ OK — SDNN của Apple vào cột SDNN và baseline HRV chỉ dùng một họ chỉ số (HRV nặng 0.30 điểm sẵn sàng); ' +
    'thời lượng ngủ loại giai đoạn thức và cả hai chỗ đọc sleep_logs dùng chung một hàm; ' +
    'nhịp tim nghỉ đọc từ RestingHeartRate chứ không phải nhịp tức thời, SpO₂ tự nhận đơn vị theo dải sinh lý; ' +
    'buổi tập nhập về mang volume_load 0 nên ACWR không đổi, và external_id khiến đồng bộ lại không nhân đôi',
);
