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
const LAYOUT = 'src/app/_layout.tsx';
const ONBOARDING = 'src/components/ascnd/onboarding-flow.tsx';

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

/*
  ── 6: và có thứ gì đó thật sự chạy nó ──

  Everything above is about the data being right. This is about the data being
  *there*, which turned out to be a separate question with a worse answer.

  The sync ran from three buttons and nothing else. Every rule above passed —
  SDNN in the SDNN column, sleep minus the awake stages, resting heart rate from
  the right identifier — and on an ordinary morning the readiness score was
  still computed from yesterday's numbers, because nobody had tapped. A pipeline
  that is correct and never runs looks exactly like one that works.

  Four properties, and three of them are about *manners*: an automatic thing
  that prompts, shouts, or runs constantly gets the feature turned off, which
  costs more than the staleness it was fixing.
*/
{
  const sync = strip(read(SYNC));
  const layout = strip(read(LAYOUT));

  if (!/export function useAutoHealthSync/.test(sync)) {
    problems.push(
      `${SYNC}: không có đường chạy tự động — ` +
        'mọi luật ở trên vẫn đúng mà điểm sẵn sàng sáng nay vẫn tính từ số của hôm qua',
    );
  }
  /*
    Rendered, not merely defined.

    The first version of this rule looked for `useAutoHealthSync()` anywhere in
    the layout — which the wrapper's own body contains. Deleting `<HealthAutoSync
    />` from the tree left the component defined, unrendered, and the rule
    perfectly happy. A hook that is never mounted never runs, which is the exact
    bug this whole section exists for, reproduced inside its own check.
  */
  if (!/<HealthAutoSync\s*\/>/.test(layout)) {
    problems.push(
      `${LAYOUT}: không render <HealthAutoSync /> — ` +
        'định nghĩa hook mà không mount thì nó không bao giờ chạy, đúng thứ lỗi mục này sinh ra để bắt',
    );
  }
  if (!/useAutoHealthSync\(\)/.test(layout)) {
    problems.push(`${LAYOUT}: không gọi useAutoHealthSync`);
  }

  /* iOS shows the Health sheet once. Spending it on app launch, at a moment
     nobody chose, is spending it badly — and a "no" cannot be re-asked from
     inside the app afterwards, only from Settings. */
  const auto = sync.slice(sync.indexOf('useAutoHealthSync'));
  if (/requestHealthPermissions\(/.test(auto)) {
    problems.push(
      `${SYNC}: đường tự động gọi requestHealthPermissions — ` +
        'iOS chỉ hiện bảng xin quyền một lần, tiêu nó vào lúc người dùng không yêu cầu là tiêu phí',
    );
  }
  if (!/healthAlreadyAsked\(/.test(auto)) {
    problems.push(`${SYNC}: đường tự động không kiểm tra healthAlreadyAsked trước khi đọc`);
  }

  /* A toast on every foreground is noise; an error toast for work nobody asked
     for is worse. Both are checked at the source: the silent flag has to reach
     the two places that speak. */
  for (const [what, re] of [
    ['toast thành công', /if \(silent\) return;[\s\S]{0,200}?toast\.success/],
    ['toast lỗi', /if \(!silent\) toast\.error/],
  ]) {
    if (!re.test(sync)) {
      problems.push(
        `${SYNC}: ${what} không được chặn ở lần chạy tự động — ` +
          'mỗi lần mở app lại hiện một thông báo cho việc không ai yêu cầu',
      );
    }
  }

  /* Persisted, and stamped before the run: a device with no Health data must
     not retry on every single foreground for ever. */
  if (!/AsyncStorage\.setItem\(LAST_SYNC_KEY[\s\S]{0,120}?mutate\(\)/.test(sync)) {
    problems.push(
      `${SYNC}: mốc thời gian không được ghi TRƯỚC khi chạy — ` +
        'lần chạy hỏng sẽ không giữ khoảng nghỉ, và máy không có dữ liệu Health sẽ thử lại mỗi lần mở app',
    );
  }
}

/*
  ── 7: onboarding mời cả hai quyền ──

  The same failure one step earlier. Both permissions existed and neither was
  ever offered: Health only from a button on Today, notifications only from a
  screen in Settings. Somebody finished onboarding, landed on a dashboard of
  empty rings, and had no reason to think the app could fill them in.

  The `why` line is checked too, because it is the part that does the work. iOS
  shows a system sheet that cannot say anything specific to this app, so if the
  reason is not on screen first, the person is deciding with nothing to go on.
*/
{
  const onb = strip(read(ONBOARDING));
  for (const [what, re, why] of [
    ['Apple Health', /requestHealthPermissions\(/, 'điểm sẵn sàng cần HRV, nhịp tim nghỉ và giấc ngủ — không có quyền thì không có gì để tính'],
    ['thông báo', /requestNotificationPermission\(/, 'toàn bộ phần nhắc nhở im lặng nếu không ai xin quyền'],
    ['lý do trước khi xin', /onboardingHealthWhy/, 'bảng hệ thống của iOS không nói được vì sao app này cần'],
    ['ẩn khi máy không có HealthKit', /isHealthKitAvailable\(/, 'một lời mời không thể nhận lời còn tệ hơn không mời'],
  ]) {
    if (!re.test(onb)) problems.push(`${ONBOARDING}: không mời "${what}" — ${why}`);
  }
}

/*
  ── 8: thiếu dữ liệu không phải là một giá trị ──

  `sleep_duration_min` is `0` on any day with no sleep row, and that zero used
  to be scored: `0 / 480` gives a sleep sub-score of **20**, exactly as if the
  person had lain awake all night. Weighted 0.45 when there is no HRV either,
  and then `if (sleep_min_lastnight < 240)` capped the whole score at 40.

  Measured on the engine itself, same person, same everything else:

      ngủ 7h20 đo được       →  70  vàng
      ngủ 3h đo được         →  40  đỏ     (đúng — đêm ngắn thật)
      KHÔNG có dữ liệu ngủ   →  40  đỏ     ← sai 26 điểm, đỏ thay vì vàng

  The app told somebody with three biometric readings and no sleep tracker,
  with a number and a colour, that they were not recovered — and then advised
  them to rest. That is advice about a body derived from an absence of data
  about that body, and nothing on screen separated it from a real bad night.

  HRV already had this right: `computeHRVScore` returns null without enough
  history and the weights redistribute. The rule is that every sub-score works
  that way, because the readiness score is the app's headline claim about
  somebody's physiology.
*/
{
  const eng = strip(read('src/lib/readiness-engine.ts'));

  if (!/function computeSleepScore\([^)]*\): number \| null/.test(eng)) {
    problems.push(
      'readiness-engine.ts: computeSleepScore không trả về null được — ' +
        'đêm không đo được sẽ bị chấm điểm như đêm thức trắng, và điểm sẵn sàng ' +
        'nói sai về cơ thể người dùng dựa trên dữ liệu không tồn tại',
    );
  }
  if (!/if \(sleepMin === undefined \|\| sleepMin === null \|\| sleepMin <= 0\) return null;/.test(eng)) {
    problems.push('readiness-engine.ts: computeSleepScore không chặn giá trị 0 — đó chính là giá trị của "không có log ngủ"');
  }
  /* The cap must ask whether the night was measured, not merely whether the
     number is small. Zero is the smallest number of all. */
  const cap = (eng.match(/if \([^)]*sleep_min_lastnight < 240[^)]*\)/) ?? [''])[0];
  if (!cap) {
    problems.push('readiness-engine.ts: không tìm thấy chốt an toàn cho đêm ngắn — luật này cần sửa lại');
  } else if (!/sleepScore !== null/.test(cap)) {
    problems.push(
      'readiness-engine.ts: chốt "đêm ngắn" không kiểm xem đêm đó có được ĐO không — ' +
        '0 phút cũng nhỏ hơn 240, nên người không đeo đồng hồ ngủ bị chặn điểm ở 40',
    );
  }
  /* A term that does not exist must not appear in the explain line, which is
     built from the two *lowest* factors — an invented zero would not just be
     wrong, it would be the headline. */
  if (!/if \(sleepScore !== null\) \{\s*factors\.push/.test(eng)) {
    problems.push('readiness-engine.ts: yếu tố "giấc ngủ" vẫn được đưa vào danh sách kể cả khi không đo được');
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
  /*
    The wiring rules. Each rebuilds the version that shipped, because in every
    case that version *looked* finished — the sync was written, the permission
    helpers were written, and the only thing missing was a caller.
  */
  ['chấm điểm đêm không đo được — bị bắt', () => {
    const bad = 'function computeSleepScore(sleepMin: number, targetMin: number, debtMin: number): number {\n  const ratio = sleepMin / (targetMin || 480);';
    return !/function computeSleepScore\([^)]*\): number \| null/.test(bad);
  }],
  ['trả null được — không báo oan', () => {
    const good = 'function computeSleepScore(sleepMin: number | undefined, targetMin: number, debtMin: number): number | null {';
    return /function computeSleepScore\([^)]*\): number \| null/.test(good);
  }],
  ['chốt đêm ngắn không hỏi "có đo không" — bị bắt', () => {
    const bad = 'if (input.sleep_min_lastnight < 240) raw = Math.min(raw, 40);';
    const cap = (bad.match(/if \([^)]*sleep_min_lastnight < 240[^)]*\)/) ?? [''])[0];
    return cap && !/sleepScore !== null/.test(cap);
  }],
  ['chỉ có nút bấm, không có đường tự động — bị bắt', () => {
    const bad = 'export function useHealthSync() {\n  return { available: isHealthKitAvailable(), sync };\n}';
    return !/export function useAutoHealthSync/.test(bad);
  }],
  ['đường tự động tự ý xin quyền — bị bắt', () => {
    const bad = 'export function useAutoHealthSync() {\n  const granted = await requestHealthPermissions();\n}';
    const auto = bad.slice(bad.indexOf('useAutoHealthSync'));
    return /requestHealthPermissions\(/.test(auto);
  }],
  ['đường tự động im lặng — không báo oan', () => {
    const good = 'export function useAutoHealthSync() {\n  if (!(await healthAlreadyAsked())) return;\n}';
    const auto = good.slice(good.indexOf('useAutoHealthSync'));
    return !/requestHealthPermissions\(/.test(auto) && /healthAlreadyAsked\(/.test(auto);
  }],
  ['ghi mốc SAU khi chạy — bị bắt', () => {
    const bad = 'sync.mutate();\nawait AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));';
    return !/AsyncStorage\.setItem\(LAST_SYNC_KEY[\s\S]{0,120}?mutate\(\)/.test(bad);
  }],
  ['định nghĩa hook nhưng không render — bị bắt', () => {
    /* The one the first version of this rule missed: the wrapper still exists
       and still calls the hook, it simply is not in the tree. */
    const bad = 'function HealthAutoSync() {\n  useAutoHealthSync();\n  return null;\n}\nreturn <Stack />;';
    return /useAutoHealthSync\(\)/.test(bad) && !/<HealthAutoSync\s*\/>/.test(bad);
  }],
  ['có render — không báo oan', () => {
    const good = 'function HealthAutoSync() {\n  useAutoHealthSync();\n  return null;\n}\nreturn <><HealthAutoSync /><Stack /></>;';
    return /<HealthAutoSync\s*\/>/.test(good);
  }],
  ['onboarding không mời quyền nào — bị bắt', () => {
    const bad = 'const finish = useMutation({ mutationFn: async () => { await supabase.from("profiles").upsert({}); } });';
    return !/requestHealthPermissions\(/.test(bad) && !/requestNotificationPermission\(/.test(bad);
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
    'buổi tập nhập về mang volume_load 0 nên ACWR không đổi, và external_id khiến đồng bộ lại không nhân đôi; ' +
    'và đường ống này thật sự có người chạy — đồng bộ tự động khi mở app (15 phút một lần, ghi mốc trước khi chạy), ' +
    'không tự ý bật bảng xin quyền, không nói gì khi thành công lẫn thất bại; ' +
    'onboarding có mời cả Apple Health lẫn thông báo, kèm lý do trước khi bảng hệ thống hiện ra; ' +
    'và điểm sẵn sàng không chấm điểm thứ nó không đo được — đêm không có log trả về null và trọng số ' +
    'được chia lại, thay vì bị chấm 20 điểm như đêm thức trắng rồi chặn cả điểm số ở 40',
);
