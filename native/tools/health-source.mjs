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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

/** Every .ts/.tsx under a directory. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Comments out, newlines kept — a rule must not fire on the note explaining it. */
const blankComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
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
    /* `toast.error` became `toast.fail` when the error-copy boundary went in —
       a failed sync now shows a sentence rather than PostgreSQL's own words.
       The invariant here is unchanged and is about the SILENT FLAG, so the rule
       follows the call rather than pinning a function name. */
    ['toast lỗi', /if \(!silent\) toast\.(error|fail)\(/],
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

/*
  ── 9: mẫu số của ACWR phải là những ngày đã xảy ra ──

  Chronic load was `load28d / 28` — an average over a window that, for anybody
  newer than a month, is mostly days before they installed the app. Measured on
  the engine, somebody training **perfectly evenly**:

      buổi tập đầu tiên   →  ACWR 4.00   ("spike", nguy hiểm)
      tập đều 2 tuần      →  ACWR 2.00   ("spike")
      tập đều 4 tuần      →  ACWR 1.00   (đúng)

  Three weeks of being warned about a dangerous ramp, for training exactly the
  same amount every week. The ratio was measuring how long they had owned the
  app, not what they had done.

  And with no sessions logged at all the ratio came out 0, which lands in the
  `< 0.65` band and scores 45 — "detrained". Somebody who keeps their training
  elsewhere was marked down daily for a gap in the app's records.

  After: 1.00 for the first workout, 1.00 at two weeks, unchanged at four, and a
  real ramp (12000 against a 8000 baseline) still reads 1.33. The detector still
  works; it just stopped firing at people for being new.
*/
{
  const eng = strip(read('src/lib/readiness-engine.ts'));

  if (!/function getACWR\([^)]*chronicDays[^)]*\)/.test(eng)) {
    problems.push(
      'readiness-engine.ts: getACWR vẫn chia cứng cho 28 ngày — ' +
        'người mới tập đều đặn sẽ bị báo tăng tải gấp bốn lần suốt ba tuần đầu',
    );
  }
  if (!/Math\.max\(chronicDays, 7\)/.test(eng)) {
    problems.push(
      'readiness-engine.ts: cửa sổ mãn tính không có sàn 7 ngày — ' +
        'ngắn hơn cửa sổ cấp tính thì tỉ số thành so sánh một tuần với một phần của chính nó',
    );
  }
  if (!/function computeLoadScore\([\s\S]{0,200}?\): number \| null/.test(eng)) {
    problems.push('readiness-engine.ts: computeLoadScore không trả null được — không log buổi tập nào sẽ bị chấm 45 điểm "thiếu tập"');
  }
  if (!/if \(load28d <= 0\) return null;/.test(eng)) {
    problems.push('readiness-engine.ts: computeLoadScore không chặn trường hợp không có tải nào');
  }

  const svc = strip(read(SERVICE));
  if (!/training_days_28d:/.test(svc)) {
    problems.push(`${SERVICE}: không truyền training_days_28d — engine sẽ mặc định cả 28 ngày, đúng bằng lỗi vừa sửa`);
  }
  /*
    ── the property, not the column list ──

    This pinned the literal `select('volume_load, date_time')`. What it is
    protecting is that the 28-day load query carries `date_time`, because
    without it the chronic span is unknown and the engine falls back to a flat
    28 — the exact bug it was written after.

    Pinning the whole string made it fail the moment the query stopped reading
    `volume_load`, which it did when training load moved from tonnage to the
    session-RPE method (`lib/session-load.ts`). The query still carried
    `date_time`; the rule was asserting a spelling. That is the shape this
    directory keeps having to fix, so it now asks the question it means.
  */
  /* Bound to the statement, and the first attempt at this was not: it looked
     for any `.select(…date_time…)` in the file and the biometrics query
     satisfied it, so removing `date_time` from the load query left the rule
     green. The same flat-search trap `write-confirmed.mjs` fell into. This
     finds the 28-day `workout_sessions` query by its own window bound and reads
     only that one. */
  /* The bound is named `chronic.start` since BUG-106 was fixed — the window is
     derived from the day being rebuilt rather than from `new Date()`. Only the
     spelling of the anchor moved; what this rule asks is unchanged, and
     `readiness-anchor.mjs` is what asserts the anchoring itself. */
  const load28 = [...svc.matchAll(/from\('workout_sessions'\)([\s\S]{0,240}?)chronic\.start/g)];
  if (load28.length !== 1) {
    problems.push(
      `${SERVICE}: tìm thấy ${load28.length} truy vấn workout_sessions 28 ngày — bộ quét hỏng, đừng tin bước này`,
    );
  }
  if (!load28.some((m) => /\.select\('[^']*date_time[^']*'\)/.test(m[1]))) {
    problems.push(`${SERVICE}: truy vấn tải 28 ngày không lấy date_time — không có nó thì không biết cửa sổ dài bao nhiêu`);
  }
}

/*
  ── 10: bốn số hạng, không số hạng nào được bịa ──

  The last of the four. `computeRHRScore` returned a flat **50** with no reading,
  and again with fewer than five points of baseline. Neutral rather than
  punitive, which is why it survived three passes over this engine — but still
  0.20 of the score (0.25 without HRV) describing nobody.

  Measured, same person, same everything else:

      ngủ tốt + tải tốt, CÓ nhịp nghỉ    →  73  vàng
      y hệt nhưng KHÔNG có nhịp nghỉ     →  81  xanh

  Eight points and a colour band, contributed by a measurement that does not
  exist. It flatters somebody struggling by exactly as much.

  And with all four absent the weighted mean of an empty list is 0, which would
  render as a readiness of zero — the most alarming number on the screen,
  produced by having no data at all. `computeReadiness` returns null there and
  the caller writes nothing, so the gauge stays blank.

  This is the fourth time the same shape has been found in one engine: a zero or
  a default standing in for "not measured" and then being scored. The rule below
  asks the question of all four at once.
*/
{
  const eng = strip(read('src/lib/readiness-engine.ts'));

  for (const [fn, why] of [
    ['computeHRVScore', 'HRV cần 5 mốc lịch sử mới có baseline'],
    ['computeRHRScore', 'nhịp tim nghỉ không đo được không phải là nhịp trung bình'],
    ['computeSleepScore', 'đêm không ghi không phải là đêm thức trắng'],
    ['computeLoadScore', 'không log buổi tập không phải là tập quá ít'],
  ]) {
    if (!new RegExp(`function ${fn}\\([\\s\\S]{0,260}?\\): number \\| null`).test(eng)) {
      problems.push(`readiness-engine.ts: ${fn} không trả null được — ${why}`);
    }
  }
  if (/computeRHRScore\([^)]*\)\s*\n?\s*: 50/.test(eng) || /:\s*50;\s*\n\s*const sleepScore/.test(eng)) {
    problems.push('readiness-engine.ts: vẫn thay nhịp tim nghỉ vắng mặt bằng 50 — một con số không mô tả ai cả');
  }
  if (!/if \(present\.length === 0\) return null;/.test(eng)) {
    problems.push(
      'readiness-engine.ts: không chặn trường hợp KHÔNG số hạng nào đo được — ' +
        'trung bình có trọng số của một danh sách rỗng là 0, và 0 hiện lên thành điểm sẵn sàng đỏ rực',
    );
  }
  if (!/computeReadiness\(input: ReadinessInput\): ReadinessResult \| null/.test(eng)) {
    problems.push('readiness-engine.ts: computeReadiness luôn trả về một điểm số, kể cả khi không có gì để chấm');
  }
}

/*
  ── 11: the coach was never told how long anybody slept ──

  Section 3 settled this for the client: time in bed is not time asleep, and
  both readers of `sleep_logs` go through one `asleepMinutes`. The edge
  functions were outside that rule and had the same bug from a third direction.

  `ai-coach` sent the model `{ date, deep_min, rem_min, light_min, quality }`
  and no duration at all. `ai-smart-nudges` computed one as
  `deep + rem + light`. Both are only right for a night HealthKit wrote — a
  night typed into `log-sleep` leaves the three stage boxes empty, stored as 0.

  So for every hand-logged night the coach was handed three zeroes and asked
  about the person's recovery. That is the second half of a bug a real user
  reported: "sinh trắc học và giấc ngủ khi ghi thì không xuất hiện ở dashboard
  và health assistant". The dashboard half was an unapplied migration. This is
  the assistant half, and it was still live.

  Deno and the RN bundle share no module, so `_shared/sleep.ts` is a second
  copy of the client's rule by necessity. What is not necessary is the two
  drifting, so both are read here and required to say the same thing.
*/
{
  const shared = read('../supabase/functions/_shared/sleep.ts');
  const client = read('src/lib/daily-log-service.ts');

  /* Both must prefer a positive `asleep_min` and fall back to the span. If
     either half of that rule is missing on either side, they have drifted. */
  for (const [where, src] of [['_shared/sleep.ts', shared], ['daily-log-service.ts', client]]) {
    if (!/asleep_min\s*!=\s*null\s*&&\s*\w+\.asleep_min\s*>\s*0/.test(src)) {
      problems.push(`${where}: asleepMinutes không ưu tiên asleep_min > 0 — thời gian nằm giường bị tính là thời gian ngủ`);
    }
    if (!/waketime[\s\S]{0,120}?bedtime[\s\S]{0,120}?60000|wake\s*-\s*bed\s*\)\s*\/\s*60000/.test(src)) {
      problems.push(`${where}: asleepMinutes không có nhánh lấy khoảng bedtime→waketime — đêm tự ghi tay sẽ không có thời lượng`);
    }
  }

  for (const fn of ['ai-coach', 'ai-smart-nudges']) {
    const src = read(`../supabase/functions/${fn}/index.ts`);
    if (/deep_min\s*\?\?\s*0\s*\)\s*\+/.test(src) || /\(s\.deep_min[^)]*\)\s*\+\s*\(s\.rem_min/.test(src)) {
      problems.push(
        `${fn}: cộng deep+rem+light để ra thời lượng ngủ — đêm ghi tay để trống ba ô đó, ` +
          'nên model được cho biết người dùng ngủ 0 phút rồi bị hỏi về phục hồi',
      );
    }
    if (!/asleepMinutes\s*\(/.test(src)) {
      problems.push(`${fn}: không dùng asleepMinutes — model không được cho biết đêm đó dài bao nhiêu`);
    }
  }

  /*
    ── and the same sum was on a screen, in front of the user ──

    The rule above was written for the two edge functions because that is where
    the bug was found. It was on the client too: `sleep-insights.tsx` built a
    night's length as `deep + rem + light`, so a hand-logged night showed
    **0.0h**, a week of them produced a full week of sleep debt, and the screen
    printed "Bạn ngủ trung bình 0.0h, thiếu 8.0h so với mục tiêu" as a finding
    about somebody's body.

    Written about the shape rather than about the file, because the file is not
    the thing that is wrong — the arithmetic is, wherever it appears.
  */
  /*
    The three added together, whatever the locals happen to be called: `deep +
    rem + light`, `deep_min + rem_min + light_min`, `deep_h + rem_h + light_h`.

    A first version of this looked for `deep_min` specifically and came back
    clean against the very file it was written to catch, because that file had
    already destructured the columns into `deep`, `rem` and `light`. The rule
    was reading a spelling rather than a shape.
  */
  const SUM = /\bdeep\w*\s*\+\s*rem\w*\s*\+\s*light\w*/;
  for (const rel of walk(path.join(NATIVE, 'src'))) {
    const src = blankComments(readFileSync(rel, 'utf8'));
    if (!SUM.test(src)) continue;
    /*
      Adding the three to ask *whether they are known at all* is the correct
      use, and is how the fix itself is written (`stagesKnown`). What is wrong
      is binding that sum to something that means a length of time.
    */
    const asDuration = new RegExp(
      String.raw`\b(total|duration|slept|asleep|minutes|mins)\w*\s*[:=]\s*[^;\n]{0,40}` + SUM.source,
      'i',
    ).test(src);
    if (asDuration) {
      problems.push(
        `${path.relative(NATIVE, rel)}: lấy deep+rem+light làm THỜI LƯỢNG một đêm — ` +
          'đêm ghi tay để trống ba ô đó, nên nó ra 0 và màn hình nói người dùng ngủ 0 giờ. Dùng asleepMinutes.',
      );
    }
  }
}

/*
  ── 12: a number called the wrong thing is a wrong number ──

  Three separate ways the same data was misdescribed on the way out.

  **`hr_bpm` is resting heart rate.** HealthKit fills it from
  `RestingHeartRate`, the sheet people type it into says "Nhịp tim nghỉ", and
  the readiness engine scores it as RHR. Two display sites called it plain
  "Heart Rate" — one of them in English, on a Vietnamese app. Somebody reading
  that compares it against the live number on their watch and concludes the app
  is broken, or logs a live reading into the column the score treats as
  resting.

  **The HRV tile went blind for Apple Health users.** The Today card read
  `hrv_rmssd_ms` only. Apple publishes SDNN, the sync writes it to its own
  column, so the value was null and the tile silently vanished. `ai-coach` had
  the identical bug, fixed, with a comment saying why — and this one stayed.
  Anything that *displays* HRV has to know about both families.

  **The prompts were never told what null means.** Sections 8–11 made
  `total_min`, `readiness` and the four sub-scores properly nullable, which
  moved the problem rather than removing it: a model handed `total_min: null`
  will happily write "bạn không ngủ đêm qua". Every prompt that receives these
  fields has to say, in its own language, that null means not measured.
*/
{
  const dict = read('src/lib/i18n.ts');
  const hrLabels = [...dict.matchAll(/biometricsHeartRate:\s*'([^']*)'/g)].map((m) => m[1]);
  if (hrLabels.length < 2) {
    problems.push('i18n.ts: không tìm thấy đủ hai bản dịch của biometricsHeartRate — luật dưới đây đang không kiểm gì');
  }
  for (const label of hrLabels) {
    if (!/nghỉ|resting/i.test(label)) {
      problems.push(
        `i18n.ts: hr_bpm hiện lên là "${label}" — cột đó là nhịp tim NGHỈ (HealthKit RestingHeartRate, ` +
          'và điểm sẵn sàng chấm nó như nhịp nghỉ). Gọi là "nhịp tim" mời người dùng so với số trên đồng hồ',
      );
    }
  }

  /* Writing is not displaying: the manual sheet files a typed reading into the
     RMSSD column on purpose, because that is the family a hand-entered number
     belongs to until a watch says otherwise. */
  const WRITE_ONLY = { 'log-biometrics.tsx': 'màn nhập tay — ghi vào cột RMSSD, không hiển thị chuỗi HRV nào' };
  for (const rel of ['src/components/ascnd/today-widgets-2.tsx', 'src/app/biometrics.tsx', 'src/app/log-biometrics.tsx']) {
    const src = read(rel);
    const base = path.basename(rel);
    if (base in WRITE_ONLY) continue;
    if (/hrv_rmssd_ms/.test(src) && !/hrv_sdnn_ms/.test(src)) {
      problems.push(
        `${base}: hiển thị HRV chỉ từ cột RMSSD — người dùng đồng bộ Apple Health có số ở cột SDNN, ` +
          'nên ô HRV của họ biến mất không một lời giải thích',
      );
    }
  }

  for (const fn of ['ai-coach', 'ai-smart-nudges', 'ai-meal-suggest']) {
    const src = read(`../supabase/functions/${fn}/index.ts`);
    /* Both languages, because a rule the model only gets in English is a rule
       Vietnamese users do not get. */
    if (!/null[^\n]*NOT MEASURED|NOT MEASURED[^\n]*null/i.test(src)) {
      problems.push(`${fn}: prompt tiếng Anh không nói null nghĩa là chưa đo được — model sẽ đọc null thành 0`);
    }
    if (!/null[^\n]*CHƯA ĐO ĐƯỢC|CHƯA ĐO ĐƯỢC[^\n]*null/i.test(src)) {
      problems.push(`${fn}: prompt tiếng Việt không nói null nghĩa là chưa đo được — model sẽ đọc null thành 0`);
    }
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
  ['nhịp tim nghỉ vắng mặt thay bằng 50 — bị bắt', () => {
    const bad = 'function computeRHRScore(rhr: number, history: number[]): number {\n  if (history.length < 5) return 50;';
    return !/function computeRHRScore\([\s\S]{0,260}?\): number \| null/.test(bad);
  }],
  ['trả null được — không báo oan', () => {
    const good = 'function computeRHRScore(rhr: number, history: number[]): number | null {\n  if (history.length < 5) return null;';
    return /function computeRHRScore\([\s\S]{0,260}?\): number \| null/.test(good);
  }],
  ['ACWR chia cứng 28 ngày — bị bắt', () => {
    const bad = 'function getACWR(load7d: number, load28d: number): number {\n  const chronic = load28d / 28;';
    return !/function getACWR\([^)]*chronicDays[^)]*\)/.test(bad);
  }],
  ['ACWR nhận cửa sổ thật — không báo oan', () => {
    const good = 'function getACWR(load7d: number, load28d: number, chronicDays: number): number {\n  const chronic = load28d / Math.max(chronicDays, 7);';
    return /function getACWR\([^)]*chronicDays[^)]*\)/.test(good) && /Math\.max\(chronicDays, 7\)/.test(good);
  }],
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
    'được chia lại, thay vì bị chấm 20 điểm như đêm thức trắng rồi chặn cả điểm số ở 40; ' +
    'ACWR chia cho số ngày THẬT SỰ có trong cửa sổ (sàn 7), nên người tập đều tuần đầu ra 1.00 chứ không phải 4.00, ' +
    'và không log buổi tập nào thì tải bị loại khỏi điểm thay vì bị chấm 45 "thiếu tập"; ' +
    'cả BỐN số hạng (HRV, nhịp nghỉ, giấc ngủ, tải) đều trả null được, và khi không số hạng nào đo được ' +
    'thì không chấm điểm chứ không ra 0',
);
