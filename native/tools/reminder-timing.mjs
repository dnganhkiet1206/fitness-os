/**
 * That a reminder fires at an hour this person is awake for.
 *
 * ── the bug this was written for ──
 *
 * Four reminder times were constants somebody typed once, the same for every
 * account: supplements 09:00, bedtime 22:30, weigh-in 07:00, workout 17:00.
 *
 * The onboarding flow **asks** for a bedtime and a waketime and saves both. So
 * the app could be told "I go to bed at half past midnight and get up at eight"
 * and would then fire a wind-down alert at 22:30 — two hours early — and a
 * weigh-in alert at 07:00, **an hour before they wake up**.
 *
 * That last one is the reason this is not cosmetic. A notification that wakes
 * somebody is worse than none: it is how an app teaches a person to switch
 * notifications off, and after that no reminder works again. And nothing was
 * missing — the app had asked for the number, stored it, and was drawing it on
 * the dashboard.
 *
 * ── the two ways the fix goes wrong ──
 *
 * **Midnight.** A bedtime of 00:15 minus thirty minutes is 23:45 the evening
 * before, not minus fifteen minutes. Clock arithmetic that does not wrap is the
 * same family as `hoursBetween` reading a night owl as late at breakfast — and
 * this app has already shipped that one.
 *
 * **Deriving a time from a reading that means something else.** The learned
 * hour for `sleep` is when the sleep *log* was written, and people write last
 * night's sleep down in the morning. Using it for a bedtime reminder would put
 * the wind-down alert at breakfast. The bedtime suggestion has to come from the
 * profile — a time somebody actually stated about going to bed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

const out = mkdtempSync(path.join(tmpdir(), 'remind-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/reminder-timing.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* no project tsconfig here, so tsc exits non-zero over the `@/` mapping while
     still emitting — which is all this uses */
}
const {
  parseClock, toClock, suggestedTime, worthOffering, formatClock,
  WIND_DOWN_MIN, AFTER_WAKE_MIN, WORKOUT_LEAD_MIN, WORTH_OFFERING_MIN,
} = createRequire(import.meta.url)(path.join(out, 'reminder-timing.js'));

const at = (h, m) => ({ hour: h, minute: m });
const same = (a, b) => a && b && a.hour === b.hour && a.minute === b.minute;

/* ── 1. the person the constants were wrong for ── */
{
  /* Bed at 00:30, up at 08:00 — a completely ordinary night shape, and the one
     the shipped defaults handle worst. */
  const owl = { bedtime: '00:30', waketime: '08:00' };

  const bed = suggestedTime('bedtime', owl);
  if (!same(bed, at(0, 0))) {
    problems.push(`ngủ lúc 00:30 → nhắc thư giãn phải là 0:00, đang ra ${bed && formatClock(bed)}`);
  }

  const weigh = suggestedTime('weighIn', owl);
  if (!same(weigh, at(8, 15))) {
    problems.push(`dậy lúc 08:00 → nhắc cân phải là 8:15, đang ra ${weigh && formatClock(weigh)}`);
  }
  /* The assertion that matters: never before they are up. */
  if (weigh && weigh.hour * 60 + weigh.minute < 8 * 60) {
    problems.push('nhắc cân bắn TRƯỚC giờ người ta dậy — đúng lỗi cũ, chỉ đổi số');
  }
}

/* ── 2. midnight, which is where clock arithmetic dies ── */
{
  const cases = [
    ['00:15', at(23, 45)], // half an hour before quarter past midnight is last night
    ['00:00', at(23, 30)],
    ['23:00', at(22, 30)],
    ['22:00', at(21, 30)],
  ];
  for (const [bedtime, want] of cases) {
    const got = suggestedTime('bedtime', { bedtime });
    if (!same(got, want)) {
      problems.push(`ngủ ${bedtime} → phải nhắc ${formatClock(want)}, ra ${got && formatClock(got)}`);
    }
  }
  /* Waking at a quarter to midnight is a night shift, and the reading still has
     to land on the same day-circle rather than at hour 24. */
  const night = suggestedTime('weighIn', { waketime: '23:50' });
  if (!same(night, at(0, 5))) {
    problems.push(`dậy 23:50 → cân 0:05, ra ${night && formatClock(night)}`);
  }
  for (const m of [-90, -1, 0, 1439, 1440, 3000]) {
    const c = toClock(m);
    if (!(c.hour >= 0 && c.hour <= 23 && c.minute >= 0 && c.minute <= 59)) {
      problems.push(`toClock(${m}) ra ngoài mặt đồng hồ: ${JSON.stringify(c)}`);
    }
  }
}

/* ── 3. nothing known means nothing said ── */
{
  for (const [key, known] of [
    ['bedtime', {}],
    ['weighIn', {}],
    ['workout', {}],
    ['supplements', { bedtime: '23:00', waketime: '07:00', workoutHour: 18 }],
  ]) {
    if (suggestedTime(key, known) !== null) {
      problems.push(`'${key}' bịa ra một giờ trong khi app không biết gì`);
    }
  }
  /* Postgres `time` comes back as HH:MM:SS, and a profile column can hold
     anything an older build wrote. None of it may become a time. */
  for (const bad of [null, undefined, '', 'evening', '25:00', '22:70', '22', 'null']) {
    if (parseClock(bad) !== null) problems.push(`parseClock chấp nhận rác: ${JSON.stringify(bad)}`);
  }
  if (parseClock('23:00:00') !== 23 * 60) problems.push('parseClock không đọc được HH:MM:SS của Postgres');
  if (parseClock('7:05') !== 7 * 60 + 5) problems.push('parseClock không đọc được giờ một chữ số');
}

/* ── 4. the learned hour, and the lead it is given ── */
{
  const w = suggestedTime('workout', { workoutHour: 18.5 });
  if (!same(w, at(17, 30))) {
    problems.push(`thường ghi tập lúc 18:30 → nhắc 17:30, ra ${w && formatClock(w)}`);
  }
  /* A reminder at the hour somebody already trains is a reminder for something
     they have just done. */
  if (WORKOUT_LEAD_MIN <= 0) problems.push('nhắc tập không được đặt vào đúng giờ người ta đã tập xong');
  /* Learned at 00:30 → an hour earlier is the night before, not hour −1. */
  const late = suggestedTime('workout', { workoutHour: 0.5 });
  if (!same(late, at(23, 30))) {
    problems.push(`tập lúc 0:30 → nhắc 23:30, ra ${late && formatClock(late)}`);
  }
}

/* ── 5. an offer worth making ── */
{
  if (worthOffering(at(22, 30), at(22, 38))) {
    problems.push('đề nghị dời báo thức 8 phút — đó là vặt vãnh, không phải gợi ý');
  }
  if (!worthOffering(at(7, 0), at(8, 15))) {
    problems.push('chênh hơn một tiếng mà không đề nghị gì');
  }
  /* Around the clock, or a midnight alarm gets offered a move of a whole day. */
  if (worthOffering(at(23, 50), at(0, 5))) {
    problems.push('23:50 và 0:05 bị coi là cách nhau gần một ngày — số học đồng hồ không vòng');
  }
  if (!(WORTH_OFFERING_MIN >= 10)) problems.push('ngưỡng đề nghị quá nhỏ');
}

/* ── 6. the shape: derived, never silently applied ── */
{
  const screen = strip(read('src/app/reminders.tsx'));
  if (!/suggestedTime\(/.test(screen) || !/worthOffering\(/.test(screen)) {
    problems.push('màn nhắc nhở không dùng giờ suy ra từ dữ liệu — bốn hằng số cũ vẫn là tất cả');
  }
  /* The suggestion must be applied from a press handler and nowhere else.
     An effect that calls `setTime` is an app quietly moving somebody's alarm,
     which is a different product from one that offers to. */
  const applied = [...screen.matchAll(/setTime\(/g)].length;
  const inEffect = /useEffect\([\s\S]*?setTime\(/.test(screen);
  if (inEffect) {
    problems.push('setTime được gọi trong useEffect — app tự dời báo thức của người ta');
  }
  if (applied < 2) {
    problems.push('không thấy chỗ áp dụng gợi ý (phải có nút bấm riêng, ngoài picker)');
  }

  /* And the sleep *log* hour must never reach a bedtime reminder — the reading
     means "when they wrote last night down", which is the morning. */
  const lib = strip(read('src/lib/reminder-timing.ts'));
  if (/sleepHour|habitFor\('sleep'\)|known\.sleepHour/.test(lib + screen)) {
    problems.push("giờ học được của 'sleep' bị dùng cho nhắc ngủ — đó là giờ người ta GHI lại giấc ngủ, tức buổi sáng");
  }
}

/* ── 7. both languages ── */
{
  const strings = read('src/lib/native-strings.ts');
  for (const key of ['nSmartFrom', 'nSmartBedtime', 'nSmartWake', 'nSmartWorkout', 'nSmartMove']) {
    if (strings.split(`${key}:`).length - 1 < 2) problems.push(`thiếu bản dịch cho ${key}`);
  }
}

if (problems.length) {
  console.log('giờ nhắc nhở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `giờ nhắc OK — người ngủ 00:30 dậy 08:00 được nhắc thư giãn lúc 0:00 và cân lúc 8:15 ` +
    `(hằng số cũ 22:30/07:00 sẽ đánh thức họ dậy); số học đồng hồ vòng qua nửa đêm ở cả 6 ca; ` +
    `không biết thì không đoán (supplements luôn im, hồ sơ trống cũng im), và parseClock từ chối 8 kiểu rác ` +
    `nhưng đọc được HH:MM:SS của Postgres; giờ tập học được lùi ${WORKOUT_LEAD_MIN} phút vì đó là giờ GHI chứ không phải giờ tập; ` +
    `chênh dưới ${WORTH_OFFERING_MIN} phút thì không làm phiền, và 23:50 với 0:05 không bị coi là cách nhau một ngày; ` +
    `gợi ý chỉ áp dụng từ một nút bấm — không useEffect nào tự dời báo thức`,
);
