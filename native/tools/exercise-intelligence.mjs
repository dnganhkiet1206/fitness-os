/**
 * The exercise intelligence engine, run against invented histories.
 *
 * ── why this is a runner and not a reader ──
 *
 * Every verdict this engine produces is a claim about somebody's training, and
 * all of them come out of arithmetic that looks reasonable on the page. The
 * only way to know whether "PLATEAU" means what the comment above it says is to
 * hand the real function a history and see what it returns — so this compiles
 * `exercise-trend.ts` and `exercise-performance.ts` and calls them. Nothing
 * here restates a formula: a second implementation agreeing with the first
 * proves the two were written by the same person on the same afternoon.
 *
 * The cases below are the ones that were argued about while it was built, plus
 * the ones the specification named, plus the ones this repository has been
 * burned by before — a missing reading becoming a number, a unit round-trip
 * inventing a change, and a timestamp read as a date.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createRequire as _r } from 'node:module';
const require = _r(import.meta.url);
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'exint-'));
const problems = [];
const note = (m) => problems.push(m);

const SRC = [
  'exercise-kind', 'exercise-performance', 'exercise-trend', 'personal-record', 'rep-entry',
  'exercise-key', 'local-date', 'load-progression', 'user-state', 'goal-training',
  'prescription', 'readiness-i18n', 'training-card',
];

try {
  try {
    execFileSync(
      'npx',
      ['tsc', ...SRC.map((f) => `src/lib/${f}.ts`),
       '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* the `@/` path mapping makes tsc exit non-zero; it still emits, which is
       all this needs — the same arrangement `tools/score-doc.mjs` uses */
  }
  for (const f of SRC) {
    const p = path.join(out, `${f}.js`);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/@\/lib\//g, './'));
  }
  const req = createRequire(import.meta.url);
  const load = (m) => req(path.join(out, `${m}.js`));

  const perf = load('exercise-performance');
  const trend = load('exercise-trend');
  const kindMod = load('exercise-kind');
  const pr = load('personal-record');

  /* ── fixtures ───────────────────────────────────────────────────────────
     Sessions are built rather than typed out, because every test below needs
     the same envelope and the interesting part is the sets. */
  let seq = 0;
  const at = (dayAgo, hour = 18) => {
    const d = new Date();
    d.setDate(d.getDate() - dayAgo);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const S = (dayAgo, sets, extra = {}) => ({
    id: `s${++seq}`,
    date_time: at(dayAgo),
    sets,
    ...extra,
  });
  /** n sets of one movement at one weight and rep count */
  const reps = (name, weight, r, n = 1, extra = {}) =>
    Array.from({ length: n }, (_, i) => ({
      exerciseId: '', exerciseName: name, setIndex: i + 1, weight, reps: r, ...extra,
    }));

  /** Build a history from `[weight, reps]` pairs, oldest first, one per session. */
  const runOf = (name, pairs, opts = {}) => {
    const sessions = pairs.map(([w, r], i) => S(pairs.length - i, reps(name, w, r, opts.sets ?? 1)));
    return perf.performancesFrom(sessions, opts);
  };
  const readOf = (name, pairs, opts = {}) =>
    trend.insightFor(perf.historyOf(runOf(name, pairs, opts), pr.exerciseKey(name)));

  const eq = (what, got, want) => {
    if (got !== want) note(`${what}: được '${got}', phải là '${want}'`);
  };

  /* ── 1. progression ──────────────────────────────────────────────────── */
  {
    /* Reps climbing at a fixed load — the specification's own example. */
    const r = readOf('Bench Press', [[55, 8], [55, 9], [55, 10]]);
    eq('reps tăng dần ở cùng mức tạ → trend', r.trend, 'IMPROVING');
    eq('reps tăng dần ở cùng mức tạ → readiness', r.readiness, 'READY_TO_PROGRESS');

    /* Weight climbing at a fixed rep count. */
    eq('tạ tăng dần', readOf('Squat', [[60, 5], [62.5, 5], [65, 5]]).trend, 'IMPROVING');

    /* Identical sessions are not a direction. */
    eq('ba buổi y hệt', readOf('Row', [[50, 8], [50, 8], [50, 8]]).trend, 'STABLE');

    /* Going backwards. */
    eq(
      'tụt thật sự',
      readOf('Deadlift', [[100, 8], [100, 8], [100, 6], [95, 6]]).trend,
      'DECLINING',
    );
    eq(
      'tụt thật sự → không được bảo tăng tải',
      readOf('Deadlift', [[100, 8], [100, 8], [100, 6], [95, 6]]).readiness,
      'NOT_READY',
    );
  }

  /* ── 2. plateau ──────────────────────────────────────────────────────── */
  {
    /*
      The case a least-squares slope gets wrong, and the reason the engine
      compares halves instead. One ordinary bad day at the end of five identical
      sessions is a plateau, not a decline.
    */
    const stuck = readOf('Bench Press', [[60, 6], [60, 6], [60, 6], [60, 5], [60, 6]]);
    eq('60×6,6,6,5,6 → plateau chứ không phải tụt', stuck.trend, 'PLATEAU');
    eq('plateau → không tự bảo tăng tải', stuck.readiness, 'MAINTAIN');
    if (!stuck.evidence.some((e) => e.kind === 'no-upward-trend')) {
      note('plateau không kèm bằng chứng no-upward-trend — một phán xét không có gì chống lưng');
    }

    /*
      The case that actually separates best-of-half from a regression line, and
      the reason the engine uses the first.

      Three sessions of real progress and then one bad day. Measured: the halves
      give +2.6% and a least-squares slope gives −8.4%, so the two methods return
      PLATEAU and DECLINING for the same person. The specification's own plateau
      example does NOT separate them — both read it as PLATEAU — which is why
      this case is here and that one is not doing this job.

      Ten reps and not eleven: eleven is past `E1RM_MAX_REPS`, so that session
      would have no index at all and be dropped, which is a different test.
    */
    const badDay = readOf('Incline Press', [[55, 8], [55, 9], [55, 10], [55, 5]]);
    if (badDay.sessions !== 4) {
      note(`ca "một ngày tệ" chỉ đọc được ${badDay.sessions}/4 buổi — fixture đang vượt rào rep`);
    }
    if (badDay.trend === 'DECLINING') {
      note(
        'ba buổi tiến bộ rồi MỘT ngày tệ bị đọc thành DECLINING — đó là dấu hiệu đã ' +
          'quay về dùng đường hồi quy, thứ bị điểm cuối kéo tụt; best-of-half cho +5,1%',
      );
    }

    /*
      A false plateau: the weight never moves and the reps do. The
      specification calls this out by name.
    */
    eq(
      'plateau giả (tạ đứng yên, reps tăng)',
      readOf('Pulldown', [[55, 8], [55, 9], [55, 10], [55, 11]]).trend,
      'IMPROVING',
    );

    /* Three flat sessions is not yet enough to accuse anybody of plateauing. */
    const three = readOf('Curl', [[20, 10], [20, 10], [20, 10]]);
    eq('ba buổi phẳng → chưa được gọi là plateau', three.trend, 'STABLE');
    if (trend.PLATEAU_SESSIONS <= trend.MIN_SESSIONS) {
      note(
        `PLATEAU_SESSIONS (${trend.PLATEAU_SESSIONS}) không còn cao hơn MIN_SESSIONS ` +
          `(${trend.MIN_SESSIONS}) — nói "bạn đang chững" là một lời về CON NGƯỜI, ` +
          'nó phải cần nhiều bằng chứng hơn là nói "bạn đang tiến bộ"',
      );
    }
  }

  /* ── 3. not enough data is a verdict, not a guess ────────────────────── */
  {
    for (const n of [0, 1, 2]) {
      const pairs = Array.from({ length: n }, () => [50, 8]);
      const r = n === 0 ? null : readOf('Fly', pairs);
      if (n === 0) {
        if (trend.insightFor([]) !== null) note('lịch sử rỗng phải trả null chứ không phải một insight');
        continue;
      }
      eq(`${n} buổi → INSUFFICIENT_DATA`, r.trend, 'INSUFFICIENT_DATA');
      eq(`${n} buổi → NOT_READY`, r.readiness, 'NOT_READY');
      if (r.confidence === 'high') note(`${n} buổi mà độ tin cậy 'high'`);
      if (!r.evidence.some((e) => e.kind === 'too-few-sessions')) {
        note(`${n} buổi: thiếu bằng chứng too-few-sessions`);
      }
    }
  }

  /* ── 4. estimated one-rep-max, and its fence ─────────────────────────── */
  {
    const e = perf.estimate1rm;
    if (e(100, 1) !== 100) note(`e1RM(100,1) = ${e(100, 1)}, một rep là chính nó`);
    const five = e(100, 5);
    if (Math.abs(five - 116.67) > 0.01) note(`e1RM(100,5) = ${five}, Epley cho 116.67`);
    if (e(100, 10) === null) note('e1RM từ chối 10 rep, trong khi 10 là biên ĐƯỢC PHÉP');
    if (e(100, 11) !== null) {
      note(
        `e1RM(100,11) = ${e(100, 11)} — quá biên rep vẫn ra số. Đây đúng là điều ` +
          'personal-record.ts từ chối cả hàm này để tránh: "một set hai mươi rep nhẹ ' +
          'sẽ đăng một con số sức mạnh chưa ai từng nâng"',
      );
    }
    for (const [w, r] of [[0, 5], [-10, 5], [100, 0], [100, -1], [NaN, 5], [100, NaN]]) {
      if (e(w, r) !== null) note(`e1RM(${w},${r}) = ${e(w, r)}, dữ liệu vô nghĩa phải ra null`);
    }

    /* 60×6 against 55×10 — not comparable on weight, not on reps. */
    const a = e(60, 6);
    const b = e(55, 10);
    if (!(b > a)) {
      note(`e1RM đọc 55×10 (${b}) không cao hơn 60×6 (${a}) — mất đúng khả năng nó sinh ra để có`);
    }

    /* No estimate is ever turned into a personal record. */
    const bests = pr.bestsFrom([{ exerciseName: 'Bench', weight: 60, reps: 6 }]);
    const recs = pr.findRecords([{ exerciseName: 'Bench', weight: 55, reps: 10 }], bests);
    if (recs.some((x) => x.value > 60)) {
      note('findRecords đăng một kỷ lục lớn hơn mức tạ thật sự nâng — e1RM đã rò vào bảng kỷ lục');
    }
  }

  /* ── 5. bodyweight movements ─────────────────────────────────────────── */
  {
    const bw = [{ date: '2000-01-01', value: 53 }];

    /* Never loaded → inferred as bodyweight without anybody declaring it. */
    const pull = runOf('Pull-up', [[0, 8], [0, 8], [0, 9], [0, 8]], { weighIns: bw });
    eq('kéo xà không tạ → kind', pull[0].kind, 'bodyweight');

    /* The body is the load: 53 kg × 8 reps, not zero. */
    const idx = trend.performanceIndex(pull[0]);
    if (Math.abs(idx - 53 * 8) > 0.01) {
      note(`chỉ số kéo xà = ${idx}, phải là 53×8 = ${53 * 8} — cơ thể CHÍNH LÀ tải`);
    }

    /* A belt is a real increase, and the engine has to see it. */
    const belted = perf.performancesFrom(
      [S(4, reps('Pull-up', 0, 8)), S(3, reps('Pull-up', 0, 8)),
       S(2, reps('Pull-up', 10, 8)), S(1, reps('Pull-up', 10, 8))],
      { weighIns: bw },
    );
    const bt = trend.insightFor(perf.historyOf(belted, 'pull-up'));
    eq('đeo thêm 10 kg → trend', bt.trend, 'IMPROVING');
    if (!(bt.current > bt.previous)) note('đeo tạ mà chỉ số không tăng');

    /* Same movement, ten kilos lighter, same reps: that is progress and the
       rep count alone cannot see it. */
    const heavy = perf.performancesFrom([S(1, reps('Dip', 0, 10))], {
      weighIns: [{ date: '2000-01-01', value: 80 }],
    });
    const light = perf.performancesFrom([S(1, reps('Dip', 0, 10))], {
      weighIns: [{ date: '2000-01-01', value: 70 }],
    });
    if (!(trend.performanceIndex(heavy[0]) > trend.performanceIndex(light[0]))) {
      note('dip ở 80 kg không được chấm cao hơn cùng số rep ở 70 kg');
    }

    /* No weigh-in at all: a rep count, said out loud, at lower confidence. */
    const blind = runOf('Pull-up', [[0, 8], [0, 8], [0, 9], [0, 10]]);
    const bi = trend.insightFor(perf.historyOf(blind, 'pull-up'));
    if (bi.confidence === 'high') {
      note('không biết cân nặng mà vẫn tự tin "high" — chỉ số đang là số rep trần');
    }
    if (!bi.evidence.some((e) => e.kind === 'bodyweight-unknown')) {
      note('không biết cân nặng mà không nói ra — một con số trình bày như thể nó là tải');
    }

    /* The estimate for a bodyweight movement is loaded by the body too, not by
       the belt alone — a 53 kg person doing five strict pull-ups is not
       estimating a zero-kilo maximum. */
    const strict = perf.performancesFrom([S(1, reps('Pull-up', 0, 5, 3))], { weighIns: bw });
    if (strict[0].bestE1rmKg === null || strict[0].bestE1rmKg < 53) {
      note(
        `e1RM kéo xà không tạ = ${strict[0].bestE1rmKg} — cơ thể không được tính vào tải, ` +
          'nên một người kéo được năm cái nghiêm chỉnh bị ước lượng là nâng zero',
      );
    }

    /* A weighted dip is loaded work by the body plus the belt. */
    const wd = perf.performancesFrom([S(1, reps('Weighted Dip', 20, 5))], { weighIns: bw });
    if (wd[0].kind !== 'compound') {
      note(`dip có tạ được phân loại '${wd[0].kind}' — nó CÓ tải nên không phải bodyweight`);
    }
  }

  /* ── 6. isolation gets no one-rep-max ────────────────────────────────── */
  {
    const lat = perf.performancesFrom(
      /* Eight reps, not twelve. Twelve is past `E1RM_MAX_REPS`, so an estimate
         would be refused on the rep count alone and this case could not tell
         whether `usesE1rm` was doing anything — it stayed green with the kind
         check deleted. */
      [S(1, reps('Lateral Raise', 8, 8))],
      { declaredKinds: { 'lateral raise': 'isolation' } },
    );
    eq('nâng tạ bên khai báo isolation', lat[0].kind, 'isolation');
    if (lat[0].bestE1rmKg !== null) {
      note(
        `isolation vẫn ra e1RM (${lat[0].bestE1rmKg}) — một mức tạ tối đa một lần cho ` +
          'động tác nâng tạ bên không phải một con số nhỏ hơn, nó là một lỗi phạm trù',
      );
    }
    eq('chỉ số isolation là tấn của set tốt nhất', trend.indexUnit('isolation'), 'kg-rep');
    if (kindMod.usesE1rm('isolation')) note('usesE1rm nói isolation có e1RM');
  }

  /* ── 7. holds ────────────────────────────────────────────────────────── */
  {
    const hold = (sec) => [{ exerciseId: '', exerciseName: 'Plank', setIndex: 1, weight: 0, durationSec: sec }];
    const p = perf.performancesFrom([S(4, hold(45)), S(3, hold(50)), S(2, hold(55)), S(1, hold(60))]);
    eq('plank → kind', p[0].kind, 'timed');
    const i = trend.insightFor(perf.historyOf(p, 'plank'));
    eq('plank giữ lâu dần → trend', i.trend, 'IMPROVING');
    eq('đơn vị của bài giữ', i.unit, 'sec');
    if (i.bestDurationSec !== 60) note(`plank best = ${i.bestDurationSec}, phải là 60`);
    /* A hold has no reps, and the old parser dropped it entirely. */
    if (pr.setsFromJson(hold(45)).length !== 1) {
      note('setsFromJson vẫn vứt bỏ set chỉ có thời lượng — mọi plank từng ghi biến mất');
    }
  }

  /* ── 8. warm-ups ─────────────────────────────────────────────────────── */
  {
    const withWarm = pr.setsFromJson([
      { exerciseName: 'Squat', weight: 40, reps: 12, warmup: true },
      { exerciseName: 'Squat', weight: 100, reps: 5 },
    ]);
    const p = perf.performancesFrom([S(1, withWarm)]);
    if (p[0].setCount !== 1) note(`khởi động vẫn được đếm là set làm việc (${p[0].setCount})`);
    if (p[0].totalReps !== 5) note(`tổng rep = ${p[0].totalReps}, khởi động vẫn bị cộng vào`);
    if (p[0].bestReps !== 5) note(`bestReps = ${p[0].bestReps}, 12 rep khởi động đang được coi là kỷ lục rep`);

    /* And a marked warm-up can never post a record. */
    const bests = pr.bestsFrom([{ exerciseName: 'Squat', weight: 40, reps: 8 }]);
    const recs = pr.findRecords(
      [{ exerciseName: 'Squat', weight: 40, reps: 12, warmup: true }],
      bests,
    );
    if (recs.length !== 0) note('một set ĐÁNH DẤU khởi động vẫn đăng được kỷ lục rep');

    /* Rows written before the flag existed have no flag, and must still count. */
    const legacy = pr.setsFromJson([{ exerciseName: 'Squat', weight: 100, reps: 5 }]);
    if (perf.performancesFrom([S(1, legacy)])[0].setCount !== 1) {
      note('dòng cũ KHÔNG có cờ warmup bị coi là khởi động — cả kho dữ liệu cũ sẽ biến mất');
    }
  }

  /* ── 9. rubbish must not crash, and must not become a number ─────────── */
  {
    const junk = [
      null, undefined, 42, 'nope', [], {},
      { exerciseName: '', weight: 1, reps: 1 },
      { exerciseName: '   ', weight: 1, reps: 1 },
      { exerciseName: 'X', weight: NaN, reps: 5 },
      { exerciseName: 'X', weight: 5, reps: NaN },
      { exerciseName: 'X', weight: 5, reps: 0 },
      { exerciseName: 'X', weight: 5, reps: -3 },
      { exerciseName: 'X', weight: -5, reps: 3 },
      { exerciseName: 'X', weight: Infinity, reps: 3 },
      { exerciseName: 'X', weight: 1e9, reps: 1e9 },
    ];
    let p;
    try {
      p = perf.performancesFrom([
        S(3, junk),
        { id: 'a', date_time: null, sets: [] },
        { id: 'b', date_time: 'không phải ngày', sets: reps('X', 5, 5) },
        { id: 'c', sets: 'không phải mảng' },
        {},
        null,
      ].filter(Boolean));
    } catch (e) {
      note(`performancesFrom ném lỗi trên dữ liệu rác: ${e.message}`);
      p = [];
    }
    for (const q of p) {
      for (const [k, v] of Object.entries(q)) {
        if (typeof v === 'number' && !Number.isFinite(v)) {
          note(`dữ liệu rác đẻ ra ${k} = ${v} — một số không hữu hạn đi vào lớp trí tuệ`);
        }
      }
      if (q.totalReps < 0 || q.totalVolumeKg < 0) note('rác đẻ ra tổng ÂM');
    }
    try {
      trend.insightsFrom(p);
    } catch (e) {
      note(`insightsFrom ném lỗi trên dữ liệu rác: ${e.message}`);
    }
  }

  /* ── 10. units ───────────────────────────────────────────────────────── */
  {
    /*
      Everything stored is kilograms. What this checks is that the engine does
      not manufacture a change out of the round-trip a pounds user's weights
      take — the exact failure `personal-record.ts` measured, where re-logging
      the same lift posted a record every session forever.
    */
    const lbs = (v) => v * 0.45359237;
    const oneTwenty = lbs(220.5); // 100.0197… kg, what 100 kg comes back as
    const flat = readOf('Bench Press', [[100, 5], [oneTwenty, 5], [100, 5], [oneTwenty, 5]]);
    if (flat.trend === 'IMPROVING' || flat.trend === 'DECLINING') {
      note(
        `vòng lặp kg→lb→kg đọc thành '${flat.trend}' — cùng một mức tạ, người dùng ` +
          'không thấy gì đổi cả, mà app báo có xu hướng',
      );
    }
    if (Math.abs(flat.changePct) > 0.001) {
      note(`vòng lặp đơn vị đẻ ra thay đổi ${(flat.changePct * 100).toFixed(3)}%`);
    }
    /* And a real 2.5 kg step is NOT swallowed. */
    const step = readOf('Bench Press', [[60, 5], [60, 5], [62.5, 5], [62.5, 5]]);
    eq('bước 2,5 kg thật phải thấy được', step.trend, 'IMPROVING');
  }

  /* ── 11. duplicates and order ────────────────────────────────────────── */
  {
    /* The query returns newest first; the engine talks about oldest first. */
    const newestFirst = [S(1, reps('Row', 70, 5)), S(2, reps('Row', 60, 5)), S(3, reps('Row', 50, 5))];
    const p = perf.performancesFrom(newestFirst);
    if (!(p[0].at < p[p.length - 1].at)) {
      note('performancesFrom không sắp xếp cũ→mới; mọi xu hướng sẽ ra ngược');
    }
    eq('thứ tự đảo vẫn đọc ra tiến bộ', trend.insightFor(perf.historyOf(p, 'row')).trend, 'IMPROVING');

    /* The same set listed twice in one session is more work, not two sessions. */
    const dup = perf.performancesFrom([S(1, [...reps('Row', 60, 5), ...reps('Row', 60, 5)])]);
    if (dup.length !== 1) note(`set trùng đẻ ra ${dup.length} bản ghi hiệu suất`);
    if (dup[0].bestWeightKg !== 60) note('set trùng làm hỏng best weight');

    /* Two names that differ only by spacing are one movement — the bug
       `exercise-key.ts` was written for. */
    const spaced = perf.performancesFrom([
      S(2, reps('Bench  Press', 60, 5)),
      S(1, reps('bench press', 62.5, 5)),
    ]);
    if (spaced.length !== 2 || spaced[0].exerciseKey !== spaced[1].exerciseKey) {
      note('"Bench  Press" và "bench press" bị tách thành hai lịch sử');
    }
  }

  /* ── 12. dates: the day a session belongs to ─────────────────────────── */
  {
    /*
      Run in real timezones, in a child process, because `localDateStr` reads the
      process zone and there is no way to change it in place. UTC+7 is where this
      app's users are; Australia/Lord_Howe steps the clock by half an hour and is
      the zone `tools/readiness-integrity.mjs` already uses for the same reason.
    */
    const script = path.join(out, 'tzcheck.cjs');
    writeFileSync(script, `
      const perf = require(${JSON.stringify(path.join(out, 'exercise-performance.js'))});
      const cases = ${JSON.stringify([
        /* 06:30 local on 25 Aug at UTC+7 is 23:30 UTC on the 24th */
        { at: '2026-08-24T23:30:00.000Z', zone: 'Asia/Ho_Chi_Minh', want: '2026-08-25' },
        /* 23:30 local on 24 Aug at UTC-4 is 03:30 UTC on the 25th */
        { at: '2026-08-25T03:30:00.000Z', zone: 'America/New_York', want: '2026-08-24' },
        /* the hour US clocks spring forward, 2026-03-08 */
        { at: '2026-03-08T07:30:00.000Z', zone: 'America/New_York', want: '2026-03-08' },
        /* Lord Howe's half-hour step, 2026-04-05 */
        { at: '2026-04-04T14:30:00.000Z', zone: 'Australia/Lord_Howe', want: '2026-04-05' },
      ])};
      const zone = process.env.TZ;
      for (const c of cases) {
        if (c.zone !== zone) continue;
        const got = perf.dayOf(c.at);
        if (got !== c.want) console.log('SAI ' + zone + ' ' + c.at + ' → ' + got + ', phải là ' + c.want);
      }
      /* And the ordering it protects: an evening session and the next morning's
         must not swap places. */
      if (zone === 'Asia/Ho_Chi_Minh') {
        const p = perf.performancesFrom([
          { id: 'tue', date_time: '2026-08-24T23:30:00.000Z', sets: [{ exerciseName: 'Bench', weight: 60, reps: 5 }] },
          { id: 'mon', date_time: '2026-08-24T12:00:00.000Z', sets: [{ exerciseName: 'Bench', weight: 55, reps: 5 }] },
        ]);
        if (p[0].sessionId !== 'mon') console.log('SAI thứ tự: buổi tối thứ Hai không đứng trước buổi sáng thứ Ba');
        if (p[0].date === p[1].date) console.log('SAI: hai buổi khác NGÀY ĐỊA PHƯƠNG bị gộp vào một ngày (' + p[0].date + ')');
      }
    `);
    for (const zone of ['Asia/Ho_Chi_Minh', 'America/New_York', 'Australia/Lord_Howe']) {
      let stdout = '';
      try {
        stdout = execFileSync(process.execPath, [script], {
          env: { ...process.env, TZ: zone },
          encoding: 'utf8',
        });
      } catch (e) {
        note(`kiểm múi giờ ${zone} ném lỗi: ${e.message}`);
      }
      for (const line of stdout.split('\n').filter(Boolean)) note(`múi giờ: ${line}`);
    }
  }

  /* ── 13. the engine does not decide anything ─────────────────────────── */
  {
    /*
      V1 provides intelligence and changes nothing. A grep, because the failure
      would be a line of code rather than a wrong number, and no fixture can see
      it.
    */
    for (const f of ['exercise-trend', 'exercise-performance', 'exercise-kind']) {
      const src = readFileSync(path.join(NATIVE, `src/lib/${f}.ts`), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      if (/\bsupabase\b|\bfrom\(['"]/.test(src)) {
        note(`${f}.ts chạm vào cơ sở dữ liệu — lớp trí tuệ phải là hàm thuần, không đọc và không ghi`);
      }
      if (/useState|useQuery|useEffect/.test(src)) {
        note(`${f}.ts kéo React vào — nó sẽ không còn chạy được trong bộ kiểm này nữa`);
      }
    }
    /* Structured facts, never prose: evidence must not carry a sentence. */
    const r = readOf('Bench Press', [[55, 8], [55, 9], [55, 10]]);
    for (const e of r.evidence) {
      for (const [k, v] of Object.entries(e)) {
        if (k !== 'kind' && k !== 'unit' && typeof v === 'string') {
          note(`evidence.${e.kind}.${k} là một chuỗi ("${v}") — engine đang tự chọn CHỮ, ` +
            'mà app này nói hai thứ tiếng và hiện hai đơn vị');
        }
      }
    }
  }

  /* ── 17. the write path carries every field the set shape has ────────── */
  {
    /*
      `useLogWorkoutSession` rebuilds each set field by field rather than
      spreading it, deliberately: nothing reaches the database that the hook has
      not named.

      The cost is that growing the shape silently loses data. It happened the
      day this engine landed — `log-workout.tsx` began sending `warmup` and
      `durationSec`, the hook named neither, and TypeScript said nothing because
      excess properties on an object passed through a variable are not an error.
      The toggle rendered, the workout saved, and the flag went nowhere.

      So: every optional field on `LoggedSet` must appear in the mapping that
      writes `sets`. A grep, because the failure is an ABSENCE and no fixture can
      contain one.
    */
    const hook = readFileSync(path.join(NATIVE, 'src/hooks/use-fitness-data.ts'), 'utf8');
    const shape = hook.match(/export interface LoggedSet \{([\s\S]*?)\n\}/);
    if (!shape) {
      note('không tìm thấy interface LoggedSet — luật này đang không kiểm gì cả');
    } else {
      const fields = [...shape[1].matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
      const write = hook.match(/sets: sets\.map\(\(s, i\) => \(\{[\s\S]*?\}\)\),/);
      if (!write) {
        note('không tìm thấy chỗ ghi `sets` trong useLogWorkoutSession');
      } else {
        for (const f of fields) {
          if (!new RegExp(`\\b${f}\\b`).test(write[0])) {
            note(
              `LoggedSet có trường \`${f}\` nhưng chỗ ghi \`sets\` không hề nhắc tới nó — ` +
                'người dùng nhập vào, app lưu buổi tập thành công, và trường đó biến mất trong im lặng',
            );
          }
        }
      }
      /* And the tonnage that feeds the load windows must not count rehearsals. */
      const vol = hook.match(/volume_load: Math\.round\([\s\S]*?\),/);
      if (vol && !/warmup/.test(vol[0])) {
        note(
          'volume_load vẫn cộng cả set khởi động — tấn đó chảy vào cửa sổ tải 7/28 ngày ' +
            'rồi vào điểm sẵn sàng, nên một buổi khởi động nhiều sẽ đội điểm lên',
        );
      }
    }
  }

  /* ── 16. what somebody typed into the reps box ───────────────────────── */
  {
    /*
      A hold is entered as `45s` rather than through a fifth input, so the
      parsing IS the feature and its edges are where it fails. Run, not read.
    */
    const { parseRepEntry, entered } = load('rep-entry');
    const CASES = [
      ['8', 8, null, 'số rep bình thường'],
      ['45s', 0, 45, 'bài giữ tư thế'],
      ['45S', 0, 45, 'chữ S hoa là cùng một ngón tay trên cùng một phím'],
      [' 45s ', 0, 45, 'khoảng trắng thừa'],
      ['45 s', 0, 45, 'khoảng trắng trước đơn vị'],
      ['0s', 0, null, 'giữ 0 giây không phải một set ai làm'],
      ['s', 0, null, 'mỗi chữ s, không có số'],
      ['', 0, null, 'ô trống'],
      [null, 0, null, 'null'],
      [undefined, 0, null, 'undefined'],
      ['-5', 0, null, 'số âm'],
      ['-5s', 0, null, 'giây âm'],
      ['0', 0, null, 'không rep'],
      ['8.5', 0, null, 'nửa rep là trượt ngón, không phải nửa lần nâng'],
      ['abc', 0, null, 'chữ'],
      ['s45', 0, null, 'đơn vị đứng trước — không ai viết thế'],
      ['1e3', 0, null, 'ký hiệu khoa học'],
      ['Infinity', 0, null, 'Infinity'],
      ['45.6s', 0, 46, 'giây lẻ được làm tròn'],
      ['+8', 0, null, 'dấu cộng đứng trước'],
      ['1000', 1000, null, 'ngay tại trần rep vẫn được nhận'],
      ['1001', 0, null, 'quá trần rep — một dòng dán vào sẽ đè bẹp sáu buổi thật'],
      ['3600s', 0, 3600, 'ngay tại trần thời lượng'],
      ['3601s', 0, null, 'giữ tư thế hơn một tiếng'],
    ];
    for (const [raw, wantReps, wantSec, why] of CASES) {
      let got;
      try { got = parseRepEntry(raw); } catch (e) { note(`parseRepEntry(${JSON.stringify(raw)}) ném lỗi: ${e.message}`); continue; }
      if (got.reps !== wantReps || got.durationSec !== wantSec) {
        note(
          `parseRepEntry(${JSON.stringify(raw)}) = {reps:${got.reps}, sec:${got.durationSec}}, ` +
            `phải là {reps:${wantReps}, sec:${wantSec}} — ${why}`,
        );
      }
    }
    if (entered(parseRepEntry('')) || entered(parseRepEntry('0s'))) {
      note('entered() coi một ô trống là đã ghi được gì đó');
    }
    if (!entered(parseRepEntry('8')) || !entered(parseRepEntry('45s'))) {
      note('entered() bỏ qua một dòng CÓ ghi — set đó sẽ không được lưu');
    }

    /* And the whole way through: a hold typed into the sheet has to come back
       out of the engine as a hold. */
    const held = pr.setsFromJson([
      { exerciseName: 'Plank', weight: 0, reps: 0, durationSec: parseRepEntry('45s').durationSec },
    ]);
    if (held.length !== 1 || held[0].durationSec !== 45) {
      note('một bài giữ tư thế gõ vào màn ghi buổi tập không đi qua được setsFromJson');
    }
  }

  /* ── 15. the readable series lines up with the one the verdict came from ── */
  {
    /*
      Two series travel with every insight: `series`, which is what the trend was
      computed from, and `best-sets`, which is what the screen shows.

      The screen showed the first one for a build, and on a pull-up it read
      "655 kg · 582 kg · 582 kg" — body-times-reps rendered with a kilogram
      label. Tonnage wearing a weight's unit, a number that appears nowhere in
      anybody's logbook, on the card whose entire job is to let a person check
      the verdict against their own training.

      They have to stay the same length. A readable series one row longer than
      the index series would be quietly displaying a session the verdict ignored
      — which is worse than the original bug, because it would look right.
    */
    for (const [name, pairs, opts] of [
      ['Bench Press', [[55, 8], [55, 9], [55, 10], [55, 9]], {}],
      ['Pull-up', [[0, 8], [0, 8], [0, 9], [0, 8]], { weighIns: [{ date: '2000-01-01', value: 72.8 }] }],
      /* one session past the rep fence: it has no index, so it must appear in
         NEITHER series */
      ['Row', [[50, 8], [50, 9], [50, 14], [50, 10]], {}],
    ]) {
      const r = readOf(name, pairs, opts);
      const idx = r.evidence.find((e) => e.kind === 'series');
      const readable = r.evidence.find((e) => e.kind === 'best-sets');
      if (!readable) {
        note(`${name}: không có chuỗi best-sets — màn hình sẽ phải hiện chỉ số thô`);
        continue;
      }
      if (idx.values.length !== readable.values.length) {
        note(
          `${name}: chuỗi đọc được có ${readable.values.length} dòng còn chuỗi chỉ số có ` +
            `${idx.values.length} — màn hình đang hiện một buổi mà phán quyết đã bỏ qua`,
        );
      }
      for (const v of readable.values) {
        if (v.reps === null && v.durationSec === null) {
          note(`${name}: một dòng trong chuỗi đọc được không có rep lẫn thời lượng`);
        }
      }
    }

    /* And a bodyweight movement carries the body with it, or the card can say
       "9 × bodyweight" beside "Est. 1RM 95 kg" with nothing joining them. */
    const p = readOf('Pull-up', [[0, 8], [0, 8], [0, 9], [0, 8]], {
      weighIns: [{ date: '2000-01-01', value: 72.8 }],
    });
    const bs = p.evidence.find((e) => e.kind === 'best-sets');
    if (!bs.values.every((v) => v.bodyweightKg === 72.8)) {
      note('chuỗi best-sets của bài bodyweight không mang theo cân nặng cơ thể');
    }
    /* A loaded movement must NOT carry one — printing a bench press as
       "10 × 127.8 kg" would be adding the person to the barbell. */
    const b = readOf('Bench Press', [[55, 8], [55, 9], [55, 10]], {
      weighIns: [{ date: '2000-01-01', value: 72.8 }],
    });
    const bbs = b.evidence.find((e) => e.kind === 'best-sets');
    if (bbs.values.some((v) => v.bodyweightKg !== null)) {
      note('chuỗi best-sets của bài CÓ TẠ mang theo cân nặng cơ thể — sẽ cộng người vào thanh tạ');
    }
  }

  /* ── 14. every seeded exercise has a kind ────────────────────────────── */
  {
    /*
      A movement with no declared kind falls through to inference, and inference
      is explicitly the weakest part of this engine — it cannot tell a curl from
      a row, which decides whether an estimated one-rep-max is computed at all.
      For a user's own exercises that is the honest answer. For the ten the app
      ships with, nobody has to guess, and the migration says so.

      The failure this catches is the quiet one: somebody adds an eleventh
      exercise to the seed and does not think about the column that was added
      months earlier. Nothing breaks; that movement is simply judged by a
      heuristic while its nine neighbours are judged by a declaration.

      The first draft of the backfill had exactly this bug in the other
      direction — it named five exercises that do not exist and missed two that
      do.
    */
    const MIG = path.join(NATIVE, '..', 'supabase', 'migrations');
    const files = require('node:fs').readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
    const seeded = new Set();
    for (const f of files) {
      const sql = readFileSync(path.join(MIG, f), 'utf8');
      const block = sql.match(/INSERT INTO public\.exercises[\s\S]*?;/g) ?? [];
      for (const b of block) {
        for (const m of b.matchAll(/\(NULL,\s*'([^']+)'/g)) seeded.add(m[1]);
      }
    }
    const classified = new Set();
    for (const f of files) {
      const sql = readFileSync(path.join(MIG, f), 'utf8');
      for (const m of sql.matchAll(/SET exercise_kind = '(\w+)'([\s\S]*?);/g)) {
        const body = m[2];
        for (const n of body.matchAll(/'([^']+)'/g)) classified.add(n[1]);
        /* the equipment-driven rule covers a whole class rather than names */
        const eq = body.match(/equipment = '([^']+)'/);
        if (eq) classified.add(`__equipment:${eq[1]}`);
      }
    }
    const equipmentOf = new Map();
    for (const f of files) {
      const sql = readFileSync(path.join(MIG, f), 'utf8');
      for (const b of sql.match(/INSERT INTO public\.exercises[\s\S]*?;/g) ?? []) {
        for (const m of b.matchAll(/\(NULL,\s*'([^']+)',\s*'[^']*',\s*'([^']*)'/g)) {
          equipmentOf.set(m[1], m[2]);
        }
      }
    }
    if (seeded.size === 0) {
      note('không tìm thấy bài tập nào trong seed — luật này đang không kiểm gì cả');
    }
    for (const name of seeded) {
      const byName = classified.has(name);
      const byEquipment = classified.has(`__equipment:${equipmentOf.get(name)}`);
      if (!byName && !byEquipment) {
        note(
          `bài tập '${name}' có trong seed nhưng KHÔNG được migration nào gán exercise_kind — ` +
            'nó sẽ bị phán đoán bằng suy luận, thứ không phân biệt nổi cuốn tay với chèo, ' +
            'trong khi những bài bên cạnh nó được phân loại đàng hoàng',
        );
      }
    }
  }

  if (problems.length) {
    console.log('trí tuệ bài tập CÓ LỖI:\n');
    for (const p of problems.slice(0, 14)) console.log(`  • ${p}`);
    if (problems.length > 14) console.log(`  … và ${problems.length - 14} lỗi nữa`);
    process.exit(1);
  }

  console.log(
    'trí tuệ bài tập OK — CHẠY THẬT engine trên lịch sử tự dựng, không chép lại công thức nào. ' +
      'Tiến bộ: reps tăng ở cùng mức tạ, tạ tăng ở cùng reps, ba buổi y hệt, và tụt thật. Plateau: ' +
      '60×6,6,6,5,6 ra PLATEAU chứ không phải DECLINING — hồi quy tuyến tính đọc ca này thành −1,7%/buổi ' +
      'vì một ngày kém ở cuối, nên engine so TỐT NHẤT nửa gần với TỐT NHẤT nửa xa; plateau giả (tạ đứng ' +
      'yên, reps tăng) vẫn là IMPROVING; ba buổi phẳng CHƯA được gọi là chững, vì nói "bạn đang chững" ' +
      'là một lời về con người và phải cần nhiều bằng chứng hơn lời khen. e1RM có hàng rào: 10 rep còn ' +
      'tính, 11 rep trả null — đúng thứ personal-record.ts từ chối cả hàm để tránh — và không estimate ' +
      'nào rò được vào bảng kỷ lục. Bodyweight: cơ thể CHÍNH LÀ tải (53×8 chứ không phải 0), đeo thêm ' +
      '10 kg thấy được, cùng số rep ở 80 kg chấm cao hơn ở 70 kg, và không biết cân nặng thì hạ độ tin ' +
      'cậy VÀ nói ra. Isolation không bao giờ có e1RM. Plank đo bằng giây, và setsFromJson không còn vứt ' +
      'bỏ set chỉ có thời lượng. Khởi động không tính vào set, rep, best, hay kỷ lục — nhưng dòng cũ ' +
      'KHÔNG có cờ vẫn tính. 16 dạng rác không làm engine ném lỗi và không đẻ ra số vô hạn hay tổng âm. ' +
      'Vòng lặp kg→lb→kg (100,0197 kg) không đẻ ra xu hướng, trong khi bước 2,5 kg thật vẫn thấy. Thứ ' +
      'tự truy vấn mới→cũ được đảo lại đúng. Ngày: chạy THẬT ở ba múi giờ gồm một múi lệch nửa giờ và ' +
      'một mốc đổi giờ — 06:30 sáng ở UTC+7 không bị ghi vào hôm qua, và buổi tối thứ Hai không nhảy ' +
      'sau buổi sáng thứ Ba. Và engine vẫn thuần: không chạm database, không kéo React, evidence không ' +
      'chứa một câu chữ nào',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
