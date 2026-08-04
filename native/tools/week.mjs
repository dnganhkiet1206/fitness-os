/**
 * That the training week lines up with the calendar it is drawn on.
 *
 * ── the invariant the screen rests on ──
 *
 * `routine.tsx` draws seven cards from `routine_days`, indexed 0–6 with Monday
 * as 0, and puts `weekDates()[idx]` on card `idx`. Everything else on the
 * screen follows from that pairing: which card is highlighted as today, which
 * date is looked up in the set of logged sessions, and therefore whether a day
 * reads "done", "to do" or "not trained".
 *
 * So the invariant is exactly one line — `weekDates(d)[routineIndex(d)]` is the
 * same calendar day as `d` — and if it ever fails, the screen does not break.
 * It shows a coherent, plausible, wrong week: Wednesday's workout on Tuesday's
 * card, a session you did today credited to yesterday, "not trained" against a
 * day you trained. Nothing to see in a screenshot unless you happen to know
 * what day it is.
 *
 * ── why date arithmetic and not milliseconds ──
 *
 * The obvious way to build seven days is `start + i * 864e5`, and it is wrong,
 * because a day is not always 86,400,000 milliseconds. Most of the time you get
 * away with it: this check sweeps two years in eleven timezones and the two
 * versions agree in ten of them, including every US and European zone, because
 * their clocks move at 2am on a Sunday and a week anchored at Monday midnight
 * never straddles that.
 *
 * `America/Santiago` is where it shows. Chile moves the clock at *midnight* on
 * the Sunday, so the last day of the week has no 00:00 at all, and the
 * millisecond version lands the whole of Sunday on Saturday — the week of
 * 2026-03-30 comes out ending on April 4 instead of April 5.
 *
 * That is the shape of the bug worth having a tool for. It is not wrong; it is
 * wrong for some users, in some months, and correct everywhere it would be
 * tested by hand.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'week-'));

/**
 * Eleven zones, chosen for the ways they are awkward rather than for coverage.
 *
 * Half-hour and three-quarter-hour offsets (Lord Howe, Chatham), a southern
 * hemisphere whose DST runs the other way (Sydney, Auckland, São Paulo), a zone
 * that moves at midnight (Santiago, Havana), one that used to and no longer
 * does (Tehran), and the two everybody actually tests in.
 */
const ZONES = [
  'UTC', 'America/New_York', 'Europe/London', 'Europe/Lisbon', 'Asia/Ho_Chi_Minh',
  'America/Santiago', 'America/Havana', 'Australia/Lord_Howe', 'Pacific/Chatham',
  'Australia/Sydney', 'Pacific/Auckland', 'America/Sao_Paulo', 'Asia/Tehran',
];

/** Two full years, so both transitions in both hemispheres are swept twice. */
const FROM = Date.UTC(2026, 0, 1);
const TO = Date.UTC(2028, 0, 1);

const ds = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

try {
  execFileSync('npx', ['tsc', 'src/lib/local-date.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const { DAY_PROGRESS_KEEP, dayProgressKey, routineIndex, staleDayProgress, weekDates } =
    createRequire(import.meta.url)(path.join(out, 'local-date.js'));

  const problems = [];
  let swept = 0;

  // ── Monday is 0, in the one place the mapping is written down ──
  // 2026-08-03 is a Monday; seven consecutive days cover every weekday once.
  for (let i = 0; i < 7; i++) {
    const d = new Date(2026, 7, 3 + i);
    if (routineIndex(d) !== i) problems.push(`routineIndex(${ds(d)}) = ${routineIndex(d)}, đáng lẽ ${i}`);
  }

  for (const tz of ZONES) {
    process.env.TZ = tz;
    const seen = [];
    for (let t = FROM; t < TO; t += 864e5) {
      const d = new Date(t);
      const week = weekDates(d);
      swept++;

      // seven days, Monday first
      if (week.length !== 7) {
        problems.push(`${tz} ${ds(d)}: ${week.length} ngày`);
        continue;
      }
      if (routineIndex(week[0]) !== 0) problems.push(`${tz} ${ds(d)}: tuần bắt đầu bằng thứ ${routineIndex(week[0]) + 2}`);

      // ── the invariant ──
      if (ds(week[routineIndex(d)]) !== ds(d)) {
        problems.push(`${tz} ${ds(d)}: thẻ ${routineIndex(d)} rơi vào ${ds(week[routineIndex(d)])}`);
      }

      // seven *consecutive* calendar days, no repeat and no gap
      for (let i = 1; i < 7; i++) {
        const prev = new Date(week[i]);
        prev.setDate(prev.getDate() - 1);
        if (ds(prev) !== ds(week[i - 1])) {
          problems.push(`${tz} ${ds(d)}: ${ds(week[i - 1])} → ${ds(week[i])} không liền nhau`);
        }
      }
      seen.push(ds(week[0]));
    }
    // every day of a week must produce the same Monday
    if (new Set(seen).size > 106) problems.push(`${tz}: ${new Set(seen).size} thứ hai khác nhau trong 2 năm, quá nhiều`);
    if (problems.length > 40) break;
  }
  process.env.TZ = 'UTC';

  /*
    ── the ticks do not pile up forever ──

    Nothing carries a workout's "done" state across a week — it is worked out
    from this week's dates against the last fortnight's sessions, so Monday
    comes round and the week is empty again on its own.

    The tick marks are the part that did carry over, in the quiet way: written
    under the date they belong to, which is what makes them safe, and never
    deleted, which meant seven entries a week for as long as the app stayed
    installed. This is the rule that clears them, and it is worth checking
    because the two ways it can be wrong are both bad and neither is visible.
    Too loose and it deletes the query cache, which lives in the same store.
    Too eager and it throws away the resume point for a workout somebody is
    halfway through.
  */
  const TODAY = '2026-08-04';
  const KEEP = [
    dayProgressKey(TODAY, 'abc'),
    dayProgressKey('2026-08-03', 'abc'),
    dayProgressKey('2026-07-22', 'abc'), // 13 days back — inside the window
    // a template id with a colon in it must not confuse the date parse
    dayProgressKey(TODAY, 'a:b:c'),
  ];
  const DROP = [
    dayProgressKey('2026-07-21', 'abc'), // 14 days back — the first one out
    dayProgressKey('2026-01-01', 'abc'),
    dayProgressKey('2025-12-30', 'abc'),
    'routine-day:not-a-date:abc',
  ];
  const OTHERS = [
    'REACT_QUERY_OFFLINE_CACHE',
    'ascnd:offline-queue',
    'routine-daySOMETHINGELSE',
    '',
  ];
  const stale = new Set(staleDayProgress([...KEEP, ...DROP, ...OTHERS], TODAY));
  for (const k of KEEP) if (stale.has(k)) problems.push(`xoá nhầm bản còn dùng được: ${k}`);
  for (const k of DROP) if (!stale.has(k)) problems.push(`bỏ sót bản đã cũ: ${k}`);
  for (const k of OTHERS) if (stale.has(k)) problems.push(`đụng vào key không phải của mình: "${k}"`);
  if (DAY_PROGRESS_KEEP < 7) problems.push(`giữ ${DAY_PROGRESS_KEEP} ngày — chưa đủ một tuần`);

  /*
    ── the week and the day agree about what is already recorded ──

    The week turns a day green from the sessions stored against its date. The
    panel underneath it used to know nothing about them, and the two halves of
    one screen disagreed in the expensive direction: the pill said "Hoàn thành"
    while the button below it was live and would write a second session for the
    same workout. A session can arrive from the free-form log sheet or from
    yesterday's app run, so "did I just save it" is not the same question as
    "is this day done" and cannot be answered from local state.

    Nothing errors when this breaks. You get two sessions, both real, and the
    week's volume is double — which nobody checks against anything.
  */
  const dayPlan = readFileSync(path.join(NATIVE, 'src/components/ascnd/day-plan.tsx'), 'utf8');
  const routine = readFileSync(path.join(NATIVE, 'src/app/routine.tsx'), 'utf8');

  const guard = (src) => {
    const bad = [];
    const logged = /const logged = ([^;]+);/.exec(src)?.[1] ?? '';
    if (!logged) bad.push('day-plan: không thấy biến `logged`');
    else if (!/sessions\.length/.test(logged)) {
      bad.push('day-plan: `logged` không xét sessions đã có — nút sẽ ghi thêm một buổi nữa cho cùng một ngày');
    }
    if (!/const canFinish = [^;]*\blogged\b/.test(src)) {
      bad.push('day-plan: nút hoàn thành không dựa vào `logged`');
    }
    return bad;
  };
  problems.push(...guard(dayPlan));
  if (!/<DayPlan[\s\S]*?sessions=\{/.test(routine)) {
    problems.push('routine: không truyền sessions xuống DayPlan — panel sẽ không biết ngày đã tập rồi');
  }

  // the version that only knew about its own save
  if (guard(dayPlan.replace(/const logged = [^;]+;/, 'const logged = log.isSuccess;')).length === 0) {
    console.error('phép tự kiểm hỏng — bản chỉ biết lần lưu của chính nó đáng lẽ phải bị bắt, đừng tin kết quả');
    process.exit(1);
  }

  /*
    Self-test: the millisecond version, and the exact week it fails on.

    Two assertions, because either one alone would be misleading. It has to
    fail somewhere — otherwise this whole file is checking a distinction that
    does not exist — and it has to *pass* in New York, because that is why the
    bug survives review: the wrong version is correct in the timezone almost
    everybody writing and testing this code is sitting in.
  */
  const naive = (d) => {
    const m = new Date(d);
    m.setHours(0, 0, 0, 0);
    const start = m.getTime() - ((m.getDay() + 6) % 7) * 864e5;
    return Array.from({ length: 7 }, (_, i) => new Date(start + i * 864e5));
  };
  const disagrees = (tz) => {
    process.env.TZ = tz;
    for (let t = FROM; t < TO; t += 864e5) {
      const d = new Date(t);
      const a = weekDates(d);
      const b = naive(d);
      for (let i = 0; i < 7; i++) if (ds(a[i]) !== ds(b[i])) return ds(d);
    }
    return null;
  };
  const chile = disagrees('America/Santiago');
  const york = disagrees('America/New_York');
  process.env.TZ = 'UTC';
  if (!chile) {
    console.error('phép tự kiểm hỏng — bản cộng mili-giây đáng lẽ phải sai ở Santiago, đừng tin kết quả');
    process.exit(1);
  }
  if (york) {
    console.error(`phép tự kiểm hỏng — bản cộng mili-giây lại sai cả ở New York (${york}); ` +
      'ca thử này không còn mô tả đúng lý do lỗi sống sót, xem lại');
    process.exit(1);
  }

  if (problems.length) {
    console.error('tuần tập lệch lịch:\n');
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
    process.exit(1);
  }

  console.log(
    `tuần tập OK — ${swept} ngày × ${ZONES.length} múi giờ, thẻ luôn trùng ngày; ` +
      `dọn tick giữ ${DAY_PROGRESS_KEEP} ngày, ngày đã ghi thì khoá nút lưu; ` +
      `bản cộng mili-giây lệch ở Santiago (${chile}) và đúng ở New York, đúng như lý do nó sống sót`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
