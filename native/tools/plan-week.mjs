/**
 * Plan, once it could show a week other than this one.
 *
 * ── what changed, and what it put at risk ──
 *
 * The training week was `/routine`: one screen, one week, the week you are in.
 * It is now `<WeekPlan />` — the first section of the training tab — with an
 * arrow on each side of the date label. Four of the things that screen could
 * take for granted stopped being true the moment those arrows existed, and not
 * one of them announces itself. Every failure below renders a coherent,
 * plausible, wrong week.
 *
 *   1. THE QUERY WINDOW NO LONGER COVERS THE WEEK ON SCREEN.
 *      `useWorkoutSessions(days)` asks for sessions newer than `today - days`.
 *      Fourteen was right for a screen that could only ever show this week. Step
 *      back three weeks with fourteen still hardcoded and every session in the
 *      week you are looking at is outside the window — so the strip draws seven
 *      "chưa tập" dots and the day panel offers to log a workout you already
 *      did. Nothing errors. The screen is a confident report built out of a
 *      query bound that did not move.
 *
 *   2. THE DAY PANEL IS REUSED ACROSS WEEKS.
 *      `<DayPlan>` keeps live state — which sets are ticked — and reads a
 *      stored resume point for the date it is showing. It was keyed by the
 *      weekday index, which is unique within one week and is `0` for every
 *      Monday there has ever been. Keyed that way, stepping from this Monday to
 *      last Monday keeps the mounted panel and shows one Monday's ticks against
 *      the other Monday's date, until the storage read lands on top of it.
 *
 *   3. A SESSION GETS WRITTEN FOR A DAY THAT HAS NOT HAPPENED.
 *      `finish` stamps `date_time` at local noon of the day being looked at.
 *      That is right for yesterday and is a fabrication for next Thursday —
 *      and next Thursday is four taps away now. Readiness, ACWR and every
 *      training-load window read that table by date, so the damage is a load
 *      figure that includes work nobody has done, with nothing on any screen
 *      to say where it came from.
 *
 *   4. A ROUTE PARAM REACHES `routine_days.day_of_week`.
 *      Plan's day sheet opens the builder with `assignDay`, and the builder
 *      writes it. Route params are strings from outside the file; a coerced
 *      `NaN` or a `7` would go into the database as a weekday slot that does
 *      not exist and would never draw on any of the seven cells.
 *
 * ── how it is checked ──
 *
 * By running what ships. The window arithmetic, the panel's key, the finish
 * guard and the param parser are all read out of the two components and the
 * builder and executed here — not restated. The one substitution is the clock:
 * the anchor block's `new Date()` becomes a supplied instant so the sweep can
 * stand on every weekday of two years in eleven timezones, and the substitution
 * is asserted to have happened rather than assumed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = 'src/components/ascnd/week-plan.tsx';
const PANEL = 'src/components/ascnd/day-plan.tsx';
const BUILDER = 'src/app/workout-builder.tsx';
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');

const problems = [];
const fatal = (m) => {
  console.error(`phép tự kiểm hỏng — ${m}, đừng tin kết quả`);
  process.exit(1);
};

// ── reading the shipped expressions out of the shipped files ──────────────

/** the text between a balanced pair, starting just after `open` at `from` */
function balanced(src, from, open, close) {
  let depth = 1;
  let i = from;
  for (; i < src.length && depth; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) depth--;
  }
  if (depth) return null;
  return src.slice(from, i - 1);
}

/** the argument text of the first `name(...)` call */
function argOf(src, name) {
  const m = new RegExp(`\\b${name}\\(`).exec(src);
  return m ? balanced(src, m.index + m[0].length, '(', ')') : null;
}

/** the `{...}` value of a JSX prop */
function propOf(src, name) {
  const m = new RegExp(`\\b${name}=\\{`).exec(src);
  return m ? balanced(src, m.index + m[0].length, '{', '}') : null;
}

/** the body of `export function name(...) { ... }`, signature included */
function fnOf(src, name) {
  const m = new RegExp(`export function ${name}\\(`).exec(src);
  if (!m) return null;
  const brace = src.indexOf('{', m.index);
  const body = balanced(src, brace + 1, '{', '}');
  return body === null ? null : `function ${name}(${balanced(src, m.index + m[0].length, '(', ')')}) {${body}}`;
}

const plan = read(PLAN);
const panel = read(PANEL);
const builder = read(BUILDER);

const num = (src, name) => {
  const m = new RegExp(`const ${name} = (\\d+);`).exec(src);
  return m ? Number(m[1]) : null;
};
const WEEKS_BACK = num(plan, 'WEEKS_BACK');
const WEEKS_FORWARD = num(plan, 'WEEKS_FORWARD');
if (WEEKS_BACK === null || WEEKS_FORWARD === null) {
  fatal(`${PLAN}: không đọc được WEEKS_BACK/WEEKS_FORWARD`);
}

/* The two lines that turn "how many weeks away" into seven dates, verbatim. */
const anchorSrc = /const anchor = new Date\(\);[\s\S]*?const dates = weekDates\(anchor\);/.exec(plan)?.[0];
if (!anchorSrc) fatal(`${PLAN}: không tìm thấy khối dựng \`dates\` từ \`weekOffset\``);

const windowSrc = argOf(plan, 'useWorkoutSessions');
if (!windowSrc) fatal(`${PLAN}: không tìm thấy lời gọi useWorkoutSessions`);

const dayPlanEl = /<DayPlan\b[\s\S]*?\/>/.exec(plan)?.[0];
if (!dayPlanEl) fatal(`${PLAN}: không tìm thấy phần tử <DayPlan />`);

const futureSrc = /const future = ([^;]+);/.exec(panel)?.[1];
const canFinishSrc = /const canFinish = ([^;]+);/.exec(panel)?.[1];
if (!futureSrc || !canFinishSrc) fatal(`${PANEL}: không đọc được \`future\` hoặc \`canFinish\``);

const assignSrc = fnOf(builder, 'assignDayParam');
if (!assignSrc) fatal(`${BUILDER}: không tìm thấy export assignDayParam`);

// ── the real calendar helpers, compiled from source ───────────────────────

const out = mkdtempSync(path.join(tmpdir(), 'plan-week-'));
try {
  execFileSync('npx', ['tsc', 'src/lib/local-date.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const { localDateStr, weekDates } = createRequire(import.meta.url)(path.join(out, 'local-date.js'));

  /**
   * The shipped week-building block, with its clock supplied.
   *
   * `new Date()` is the one thing replaced, and the replacement is counted: if
   * the block ever stops reading the clock that way, the sweep below would
   * silently stand on a single fixed day and pass forever.
   */
  const clocked = anchorSrc.replace('new Date()', 'new Date(NOW)');
  if (clocked === anchorSrc) fatal(`${PLAN}: khối dựng \`dates\` không còn đọc \`new Date()\``);

  const datesFor = new Function('weekDates', 'NOW', 'weekOffset', `${clocked}\nreturn dates;`);
  const windowFor = new Function('weekOffset', `return (${windowSrc});`);

  /**
   * Whole local days from `a` to `b`, both Dates, by calendar rather than by
   * division — the reason is written out in `lib/local-date.ts`.
   */
  const gap = (a, b) => {
    const x = new Date(a); x.setHours(12, 0, 0, 0);
    const y = new Date(b); y.setHours(12, 0, 0, 0);
    return Math.round((y - x) / 86_400_000);
  };

  /**
   * The sweep.
   *
   * `useWorkoutSessions(days)` filters on `date_time >= now - days` where `now`
   * carries the current time of day, so the oldest instant it can reach is
   * `(today - days)` at whatever o'clock it is. A session on the Monday it is
   * showing can be stamped at 00:00, so the bound has to land on a *strictly
   * earlier calendar day*: `days >= gap + 1`.
   *
   * Two years so both DST transitions in both hemispheres are swept twice, and
   * eleven zones for the same reasons `tools/week.mjs` lists — half-hour
   * offsets, a southern hemisphere running the other way, and the zones that
   * move the clock at midnight, where a week can lose a 00:00 entirely.
   */
  const ZONES = [
    'UTC', 'America/New_York', 'Europe/London', 'Asia/Ho_Chi_Minh',
    'America/Santiago', 'America/Havana', 'Australia/Lord_Howe', 'Pacific/Chatham',
    'Australia/Sydney', 'Pacific/Auckland', 'America/Sao_Paulo',
  ];

  /** Runs the whole window rule in one timezone; returns the failures. */
  const sweepWindow = (zone, windowFn) => {
    const bad = [];
    const prev = process.env.TZ;
    process.env.TZ = zone;
    let swept = 0;
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 86_400_000) {
      /* 23:00 local-ish is the worst case for the bound: the further into the
         day it is, the later `today - days` lands. */
      const now = t + 23 * 3_600_000;
      for (let off = -WEEKS_BACK; off <= WEEKS_FORWARD; off++) {
        const dates = datesFor(weekDates, now, off);
        const days = windowFn(off);
        const need = gap(dates[0], new Date(now)) + 1;
        swept++;
        if (days < need) {
          bad.push(
            `${zone} ${localDateStr(new Date(now))} tuần ${off}: cửa sổ truy vấn ${days} ngày, ` +
              `mà ngày cũ nhất trên màn hình (${localDateStr(dates[0])}) cần ${need} — ` +
              'các buổi tập của tuần đang xem nằm ngoài truy vấn, nên dải ngày vẽ toàn "chưa tập" ' +
              'và panel mời ghi lại một buổi đã tập rồi',
          );
        }
      }
    }
    process.env.TZ = prev;
    if (swept === 0) fatal('quét 0 ca — vòng lặp không chạy');
    return bad;
  };

  for (const zone of ZONES) problems.push(...sweepWindow(zone, windowFor).slice(0, 3));

  /* Self-test: the version that never widened. It has to be caught, or the
     sweep above is checking a rule with no edge. */
  {
    const frozen = new Function('weekOffset', 'return 14;');
    if (sweepWindow('UTC', frozen).length === 0) {
      fatal('bản giữ nguyên 14 ngày đáng lẽ phải bị bắt');
    }
    /* And a version that is merely one day short at the far end, so the check
       is known to be tight rather than merely non-empty. */
    const short = new Function('weekOffset', `return (${windowSrc}) - 1;`);
    if (sweepWindow('UTC', short).length === 0) {
      fatal('bản thiếu đúng một ngày đáng lẽ phải bị bắt — luật này không sát mép');
    }
  }

  // ── 2. the day panel cannot be reused across two weeks ───────────────────
  {
    const key = propOf(dayPlanEl, 'key');
    const dateProp = propOf(dayPlanEl, 'dateStr');
    if (!key || !dateProp) {
      problems.push(`${PLAN}: <DayPlan /> thiếu \`key\` hoặc \`dateStr\``);
    } else if (key.trim() !== dateProp.trim()) {
      problems.push(
        `${PLAN}: <DayPlan /> khoá theo \`${key.trim()}\` chứ không theo ngày (\`${dateProp.trim()}\`) — ` +
          'thứ Hai tuần này và thứ Hai tuần trước cùng một khoá, nên bước sang tuần khác sẽ giữ ' +
          'nguyên panel đang gắn: các set đã tick của một thứ Hai hiện trên ngày của thứ Hai kia',
      );
    }
    /* Self-test: the version keyed by the weekday, which is what shipped while
       there was only ever one week on screen. */
    const wrong = dayPlanEl.replace(/\bkey=\{[^}]*\}/, 'key={selected}');
    if (propOf(wrong, 'key').trim() === propOf(wrong, 'dateStr').trim()) {
      fatal('bản khoá theo thứ trong tuần đáng lẽ phải khác `dateStr`');
    }
  }

  // ── 3. no session is written for a day that has not happened ─────────────
  {
    const futureFn = new Function('dateStr', 'localDateStr', `return (${futureSrc});`);
    const finishFn = new Function(
      'doneRows', 'log', 'logged', 'future',
      `return (${canFinishSrc});`,
    );

    /* A day that is plainly ahead, a day that is plainly behind, and today —
       the boundary, where an off-by-one would mean you cannot log the workout
       you just did. */
    const today = '2026-08-27';
    const cases = [
      ['2026-09-24', true, 'bốn tuần tới'],
      ['2026-08-28', true, 'ngày mai'],
      [today, false, 'hôm nay'],
      ['2026-08-26', false, 'hôm qua'],
      ['2026-07-30', false, 'bốn tuần trước'],
    ];
    const clock = () => today;
    for (const [dateStr, wantFuture, what] of cases) {
      const isFuture = futureFn(dateStr, clock);
      if (isFuture !== wantFuture) {
        problems.push(
          `${PANEL}: \`future\` trả ${isFuture} cho ${what} (${dateStr}) — phải là ${wantFuture}`,
        );
        continue;
      }
      const can = finishFn([{}], { isPending: false }, false, isFuture);
      if (can === wantFuture) {
        problems.push(
          `${PANEL}: nút hoàn thành ${can ? 'vẫn sống' : 'đã chết'} ở ${what} (${dateStr}) — ` +
            'ghi một buổi tập cho ngày chưa tới sẽ nằm trong workout_sessions như một dòng thật, ' +
            'rồi đi thẳng vào điểm sẵn sàng, ACWR và mọi cửa sổ tải tập, mà không màn nào nói nó từ đâu ra',
        );
      }
    }
    /* Self-test: the version without the guard — what shipped before the
       arrows existed, and what a tidy-up would delete first. */
    const ungated = new Function(
      'doneRows', 'log', 'logged', 'future',
      `return (${canFinishSrc.replace(/\s*&&\s*!future/, '')});`,
    );
    if (ungated([{}], { isPending: false }, false, true) !== true) {
      fatal('bản bỏ chốt ngày tương lai đáng lẽ phải cho bấm hoàn thành');
    }
    /* …and the one that reads the wrong way round, which passes "today" and
       fails everything else. */
    const flipped = new Function('dateStr', 'localDateStr', `return (${futureSrc.replace('>', '<')});`);
    if (flipped('2026-09-24', clock) !== false) fatal('bản đảo dấu đáng lẽ phải sai ở ngày tương lai');
  }

  // ── 4. a route param never becomes a weekday slot ────────────────────────
  {
    /*
      Compiled, not string-stripped.

      The function carries a TypeScript parameter annotation, and the cheap way
      to run it here is a regular expression that deletes the types. That would
      make this rule depend on a second, worse parser: the day somebody widens
      the signature in a way the expression does not expect, the check either
      throws or — far worse — runs something that is no longer the shipped
      function. `tsc` is already a dependency of this repository and it is the
      same compiler the app is built with.
    */
    const loose = assignSrc.replace('/^[0-6]$/', '/^\\d+$/').replace('assignDayParam', 'looseParam');
    writeFileSync(path.join(out, 'assign.ts'), `export ${assignSrc}\nexport ${loose}\n`);
    execFileSync('npx', ['tsc', path.join(out, 'assign.ts'), '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
    const { assignDayParam, looseParam } = createRequire(import.meta.url)(path.join(out, 'assign.js'));
    const cases = [
      ['3', 3], ['0', 0], ['6', 6],
      ['7', null], ['-1', null], ['06', null], [' 3', null], ['3.0', null],
      ['', null], ['abc', null], ['NaN', null], ['Infinity', null],
      [undefined, null], [null, null], [{}, null], [['4'], 4], [[], null],
      ['1e0', null], ['0x3', null], ['٣', null],
    ];
    for (const [raw, want] of cases) {
      let got;
      try {
        got = assignDayParam(raw);
      } catch (e) {
        problems.push(`${BUILDER}: assignDayParam(${JSON.stringify(raw)}) ném ${e.message}`);
        continue;
      }
      if (got !== want) {
        problems.push(
          `${BUILDER}: assignDayParam(${JSON.stringify(raw)}) ra ${JSON.stringify(got)}, phải là ${JSON.stringify(want)} — ` +
            'giá trị này đi thẳng vào routine_days.day_of_week, cột chỉ nhận 0–6 và được vẽ bởi bảy ô của dải ngày',
        );
      }
    }

    /* Self-test: the lenient parser — any run of digits, which is what this
       would have been written as first. */
    if (looseParam('7') !== 7) fatal('bản nới lỏng đáng lẽ phải nhận "7"');
  }

  // ── 5. the arrows have a wall on both sides ──────────────────────────────
  {
    const stepSrc = /setWeekOffset\(\(o\) => ([^)]*\)*)\);/.exec(plan)?.[1] ?? '';
    if (!/WEEKS_BACK/.test(stepSrc) || !/WEEKS_FORWARD/.test(stepSrc)) {
      problems.push(
        `${PLAN}: mũi tên đổi tuần không kẹp bằng CẢ HAI mốc WEEKS_BACK/WEEKS_FORWARD — ` +
          'giữ nút là đi mãi, và cửa sổ truy vấn ở trên nở ra theo, mỗi bước một lần fetch dài hơn',
      );
    }
    if (!(WEEKS_BACK >= 1) || !(WEEKS_FORWARD >= 0)) {
      problems.push(`${PLAN}: WEEKS_BACK=${WEEKS_BACK}, WEEKS_FORWARD=${WEEKS_FORWARD} — không còn tuần nào để đi tới`);
    }
    /* The disabled state has to say so to VoiceOver, not merely look faded. */
    for (const guard of ['-WEEKS_BACK', 'WEEKS_FORWARD']) {
      if (!new RegExp(`disabled=\\{weekOffset [<>]=? ${guard.replace(/[-]/g, '\\-')}\\}`).test(plan)) {
        problems.push(`${PLAN}: nút mũi tên ở mốc ${guard} không có \`disabled\` — chỉ mờ đi thì vẫn bấm được`);
      }
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.error('kế hoạch tuần CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  `kế hoạch tuần OK — CHẠY THẬT bốn thứ đọc thẳng ra khỏi mã đang ship. Cửa sổ truy vấn được quét ` +
    `qua 2 năm × 11 múi giờ × ${WEEKS_BACK + WEEKS_FORWARD + 1} vị trí tuần và luôn với tới ngày cũ nhất ` +
    'trên màn hình — bản giữ nguyên 14 ngày VÀ bản thiếu đúng một ngày đều bị bắt, nên luật này sát mép ' +
    'chứ không chỉ khác rỗng. <DayPlan /> khoá theo NGÀY chứ không theo thứ, nên thứ Hai tuần này và thứ ' +
    'Hai tuần trước không dùng chung một panel đang gắn. Nút hoàn thành chết ở ngày chưa tới và sống ở ' +
    'hôm nay — một buổi tập ghi cho ngày mai là một dòng thật trong workout_sessions, đi thẳng vào điểm ' +
    'sẵn sàng và ACWR mà không màn nào nói nó từ đâu ra. Và assignDayParam từ chối 7, -1, "06", " 3", ' +
    '"0x3", "٣", mảng rỗng và mọi thứ không phải một trong bảy ô, vì giá trị đó đi vào ' +
    'routine_days.day_of_week',
);
