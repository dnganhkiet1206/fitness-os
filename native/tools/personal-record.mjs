/**
 * That a personal record is one, and that the column saying so is written.
 *
 * ── the bug this was written for ──
 *
 * `workout_sessions.pr_detected` shipped in the very first migration and was
 * written as the literal `false` by the only code in the app that inserts a
 * session. Nothing computed it, ever. That is not a dead column — three live
 * features read it:
 *
 *   · `first_pr` and `pr_5`, two medals counted with `.eq('pr_detected', true)`
 *     and therefore **unearnable by construction**, sitting locked on the
 *     Awards screen beside medals people do earn;
 *   · the training card's "Kỷ lục mới" badge, which could never light;
 *   · Koa's `personal_record` reaction — a face, an intensity and a line, all
 *     written, all reachable only through a medal that could not be granted.
 *
 * It is the exact shape this suite keeps finding: a value nobody computes, read
 * by things that look like they work. So the first rule here is about the
 * *shape* — a constant where a computation belongs — and not about the column.
 *
 * ── and the four ways a record engine flatters people ──
 *
 * Every one of these produces a celebration that feels good once and makes the
 * feature worthless afterwards, which is worse than not having it:
 *
 *   1. the first time an exercise is done, when there is nothing to beat;
 *   2. a load never used before, where "most reps at this weight" has no
 *      previous value — so every 2.5kg step up the ladder is a record;
 *   3. a warm-up ramp inside one session beating its own earlier sets;
 *   4. a session comparing itself against a history it is already part of.
 *
 * ── plus the two orderings that decide whether any of it is seen ──
 *
 * History is read **before** the insert, or the session is in its own past.
 * And Koa is told **after** the figure is on screen, or the engine's first
 * question — is anybody looking — is answered "no" by the very state change
 * that put a character there.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const problems = [];

/* Comments describe bugs by name in this codebase, so a rule that greps the
   raw text matches the prose explaining the thing it is looking for. Every
   check below reads code with the comments taken out. */
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── load the real engine ── */
const out = mkdtempSync(path.join(tmpdir(), 'pr-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/personal-record.ts', 'src/lib/exercise-key.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* No project tsconfig here, so tsc exits non-zero over the missing `@/`
     mapping while still emitting the JS — which is all this uses. */
}
/* The `@/` alias has no mapping without the project tsconfig, so the emitted
   require is pointed at its sibling — the trick `tools/streak.mjs` documents.
   `exercise-key.ts` is compiled alongside because the "same exercise?" rule now
   lives there, shared with `day-progress.ts`; it used to be written out twice
   and the two copies disagreed about doubled spaces. */
{
  const emitted = path.join(out, 'personal-record.js');
  writeFileSync(
    emitted,
    readFileSync(emitted, 'utf8').replaceAll('@/lib/exercise-key', './exercise-key'),
  );
}
const { bestsFrom, findRecords, recordsMagnitude, setsFromJson, headlineRecord, exerciseKey } =
  createRequire(import.meta.url)(path.join(out, 'personal-record.js'));

const set = (exerciseName, weight, reps) => ({ exerciseName, weight, reps });
/** shorthand: build a history, then ask what a session did against it */
const against = (history, session) => findRecords(session, bestsFrom(history));

/* ── 1. the four ways to flatter somebody ── */
{
  // 1: nothing to beat
  if (against([], [set('Bench Press', 60, 8)]).length !== 0) {
    problems.push('bài tập lần đầu tiên đã tính là kỷ lục — chưa có gì để phá');
  }

  // 2: a load with no history at that load
  const newLoad = against(
    [set('Bench', 60, 10), set('Bench', 80, 3)],
    [set('Bench', 70, 10)],
  );
  if (newLoad.length !== 0) {
    problems.push('mức tạ chưa từng tập đã tính là kỷ lục reps — mỗi nấc 2.5kg sẽ thành kỷ lục');
  }

  // 3: a ramp inside one session
  const ramp = against(
    [set('Squat', 50, 5)],
    [set('Squat', 60, 5), set('Squat', 70, 5), set('Squat', 80, 5)],
  );
  if (ramp.length !== 1 || ramp[0].value !== 80) {
    problems.push(
      `khởi động tăng dần trong cùng buổi tạo ${ramp.length} kỷ lục (phải là 1, mức 80)`,
    );
  }

  // 4: equalling is not beating
  if (against([set('Row', 70, 8)], [set('Row', 70, 8)]).length !== 0) {
    problems.push('bằng kỷ lục cũ vẫn tính là kỷ lục mới');
  }
}

/* ── 2. the records that are real ── */
{
  const heavier = against([set('Bench', 80, 5)], [set('Bench', 85, 3)]);
  if (heavier.length !== 1 || heavier[0].kind !== 'weight' || heavier[0].previous !== 80) {
    problems.push('nâng nặng hơn từ trước tới giờ mà không tính là kỷ lục tạ');
  }

  const moreReps = against([set('Bench', 80, 5)], [set('Bench', 80, 7)]);
  if (moreReps.length !== 1 || moreReps[0].kind !== 'reps' || moreReps[0].previous !== 5) {
    problems.push('thêm số lần ở cùng mức tạ mà không tính là kỷ lục reps');
  }

  /* Bodyweight work is the case a weight-only engine cannot see at all: every
     set is 0kg, so "heavier" never happens and reps are the only record there
     is. Pull-ups are not a rounding error in a fitness app. */
  const pullups = against([set('Pull-up', 0, 10)], [set('Pull-up', 0, 12)]);
  if (pullups.length !== 1 || pullups[0].kind !== 'reps' || pullups[0].atWeight !== 0) {
    problems.push('kỷ lục body-weight (hít xà 0kg) không được ghi nhận');
  }

  /* And the first time load is added to a bodyweight movement is a record whose
     previous value is genuinely zero — which must not be divided by. */
  const firstLoad = against([set('Pull-up', 0, 10)], [set('Pull-up', 10, 5)]);
  if (firstLoad.length !== 1 || firstLoad[0].previous !== 0) {
    problems.push('lần đầu đeo tạ vào bài body-weight không được ghi nhận');
  }
  const m = recordsMagnitude(firstLoad);
  if (!Number.isFinite(m)) problems.push('độ lớn kỷ lục ra NaN/Infinity khi kỷ lục cũ bằng 0');
}

/* ── 3. names are matched the way people type them ── */
{
  const spaced = against([set('Bench  Press', 80, 5)], [set('  bench press ', 85, 5)]);
  if (spaced.length !== 1) {
    problems.push('cùng một bài viết hoa/khoảng trắng khác nhau bị coi là hai bài khác nhau');
  }

  /*
    ── and the training week agrees about it ──

    This rule was written twice. Here it collapsed runs of whitespace; in
    `day-progress.ts` it did not. So `"Bench  Press"` with a doubled space —
    a paste, a thumb — was one exercise to the record detector and two to the
    week: the plan said the scheduled lift had not been done while this file was
    comparing those very rows against each other and celebrating a record from
    them.

    Both now call `lib/exercise-key.ts`. Comparing the two *behaviours* rather
    than checking that both files contain an import is the point — an import
    proves nothing if somebody adds a local override beside it.
  */
  const { sessionTicks } = (() => {
    try {
      execFileSync(
        'npx',
        ['tsc', 'src/lib/day-progress.ts', 'src/lib/exercise-key.ts', '--ignoreConfig',
         '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
        { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch {
      /* the `@/` alias again — it emits anyway */
    }
    const dp = path.join(out, 'day-progress.js');
    writeFileSync(dp, readFileSync(dp, 'utf8').replaceAll('@/lib/exercise-key', './exercise-key'));
    return createRequire(import.meta.url)(dp);
  })();

  for (const [a, b] of [
    ['Bench  Press', 'Bench Press'],
    ['  Squat ', 'squat'],
    ['Front\tSquat', 'front squat'],
    ['Overhead   Press', 'OVERHEAD PRESS'],
  ]) {
    const sameToRecords = exerciseKey(a) === exerciseKey(b);
    /* One planned row named `b`, one logged set named `a`: ticked exactly when
       the week thinks they are the same exercise. */
    const ticks = sessionTicks([{ key: 'r1', exerciseName: b }], [{ exerciseName: a }]);
    const sameToWeek = ticks.r1 === true;
    if (sameToRecords !== sameToWeek) {
      problems.push(
        `"${a}" vs "${b}": bộ kỷ lục nói ${sameToRecords ? 'CÙNG' : 'KHÁC'} bài, ` +
          `lịch tuần nói ${sameToWeek ? 'CÙNG' : 'KHÁC'} — hai bản sao của cùng một luật lại lệch nhau`,
      );
    }
  }
}

/* ── 3b. a pound user re-logging the same weight is not a record ──

   Run through the app's real conversion functions rather than a hand-typed
   number, because the bug *is* the conversion: `displayWeight` rounds to one
   decimal for the sheet and `weightToKg` parses it back, so 100.00 kg returns
   as 100.0197… and beats itself. Logging the identical workout twice posted a
   personal record, printed "220.5 lb, trước là 220.5 lb" — the same number
   twice — set `pr_detected`, and counted toward two medals. And it compounds:
   every round-trip drifts further, so it fires again, forever. */
{
  const u = mkdtempSync(path.join(tmpdir(), 'units-'));
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/units.ts', '--ignoreConfig', '--outDir', u,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* emits anyway */
  }
  const { displayWeight, weightToKg } = createRequire(import.meta.url)(path.join(u, 'units.js'));
  const roundTrip = (kg) => weightToKg(displayWeight(kg, 'lbs'), 'lbs');

  for (const kg of [60, 80, 100, 102.5, 137.5]) {
    const back = roundTrip(kg);
    /* The premise: the round-trip really does move the number. If it stops
       doing so this rule is guarding nothing and should say so rather than pass
       quietly. */
    if (back === kg) {
      problems.push(`vòng đổi kg→lb→kg tại ${kg} không còn lệch — luật này mất mục tiêu, kiểm tra lại`);
      continue;
    }
    const again = against([set('Bench', kg, 5)], [set('Bench', back, 5)]);
    if (again.length !== 0) {
      problems.push(
        `ghi lại đúng mức tạ cũ (${kg}kg → ${displayWeight(kg, 'lbs')}lb → ${back}kg) ` +
          'vẫn tính là kỷ lục — người dùng dùng pound sẽ phá kỷ lục mỗi buổi mà không nâng thêm gì',
      );
    }
    /* And the rep history at that load survives the round-trip, or every set
       reads as "a load never used before" and rep records stop existing. */
    const moreReps = against([set('Bench', kg, 5)], [set('Bench', back, 8)]);
    if (moreReps.length !== 1 || moreReps[0].kind !== 'reps') {
      problems.push(
        `thêm reps ở mức tạ đã đổi đơn vị (${kg} → ${back}) không được ghi nhận — ` +
          'lịch sử reps bị lạc sang một "mức tạ mới"',
      );
    }
  }

  /* A real increase still registers. The margin must not eat a genuine lift —
     1.25 kg is the smallest pair of plates most gyms have. */
  const real = against([set('Bench', 100, 5)], [set('Bench', 101.25, 5)]);
  if (real.length !== 1 || real[0].kind !== 'weight') {
    problems.push('tăng thật 1.25kg lại KHÔNG được tính là kỷ lục — biên độ bỏ qua đang quá rộng');
  }
}

/* ── 3c. the sentence the celebration prints, on all four branches ──

   `recordLine` carried a comment saying it was "exported and pure so
   `tools/personal-record.mjs` can read every branch". It was not: `grep
   recordLine tools/*.mjs` returned nothing. The comment described a test that
   had never been written, which is worse than no comment — it is a claim that
   the risky part is covered, sitting directly above the risky part.

   And the branches are exactly the ones worth covering. Two of the four exist
   because a number that is genuinely zero must not be printed as one:

     · a bodyweight rep record must not say "ở 0 kg", which reads as a broken
       app rather than as pull-ups;
     · the first time load is added to a bodyweight movement must not say
       "trước là 0 kg", which is a sentence about a set nobody did. */
{
  const rc = mkdtempSync(path.join(tmpdir(), 'recline-'));
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/record-line.ts', '--ignoreConfig', '--outDir', rc,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* `@/lib/units` is unmapped without the project config; it emits anyway. */
  }
  let recordLine;
  try {
    const emitted = path.join(rc, 'record-line.js');
    /* Only `displayWeight` and `weightLabel` are needed, and both are pure
       arithmetic — compiled alongside and pointed at their sibling, the trick
       `tools/streak.mjs` documents. */
    execFileSync(
      'npx',
      ['tsc', 'src/lib/units.ts', '--ignoreConfig', '--outDir', rc,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    writeFileSync(emitted, readFileSync(emitted, 'utf8').replaceAll('@/lib/units', './units'));
    ({ recordLine } = createRequire(import.meta.url)(emitted));
  } catch (e) {
    problems.push(`không nạp được recordLine để kiểm: ${String(e).slice(0, 90)}`);
  }

  if (typeof recordLine === 'function') {
    /* Only the six placeholders matter, so the strings are stand-ins that make
       which branch ran unmistakable. */
    const i18n = {
      nPrWeightLine: 'W|{ex}|{value}|{unit}|{prev}',
      nPrFirstLoad: 'FIRST|{ex}|{value}|{unit}',
      nPrRepsLine: 'R|{ex}|{value}|{w}|{unit}|{prev}',
      nPrRepsBodyLine: 'RBODY|{ex}|{value}|{prev}',
    };
    const line = (r) => recordLine(r, i18n, 'kg');

    const heavier = line({ exercise: 'Bench', kind: 'weight', value: 85, previous: 80 });
    if (!heavier.startsWith('W|')) problems.push(`kỷ lục tạ dùng nhầm câu: ${heavier}`);

    const firstLoad = line({ exercise: 'Pull-up', kind: 'weight', value: 10, previous: 0 });
    if (!firstLoad.startsWith('FIRST|')) {
      problems.push(`lần đầu đeo tạ vẫn in câu "trước là 0 kg": ${firstLoad}`);
    }
    if (/\b0\b/.test(firstLoad)) {
      problems.push(`lần đầu đeo tạ vẫn in ra số 0: ${firstLoad}`);
    }

    const reps = line({ exercise: 'Bench', kind: 'reps', value: 8, previous: 5, atWeight: 80 });
    if (!reps.startsWith('R|')) problems.push(`kỷ lục reps có tạ dùng nhầm câu: ${reps}`);

    const bodyReps = line({ exercise: 'Pull-up', kind: 'reps', value: 12, previous: 10, atWeight: 0 });
    if (!bodyReps.startsWith('RBODY|')) {
      problems.push(`kỷ lục reps body-weight vẫn in "ở 0 kg": ${bodyReps}`);
    }
    if (/\b0\b/.test(bodyReps)) {
      problems.push(`kỷ lục body-weight vẫn in ra số 0: ${bodyReps}`);
    }
    /* `atWeight` absent is the same fact as zero, and reached by a different
       route — `findRecords` omits it for weight records. */
    const bodyNoField = line({ exercise: 'Dip', kind: 'reps', value: 9, previous: 7 });
    if (!bodyNoField.startsWith('RBODY|')) {
      problems.push(`thiếu hẳn atWeight không được coi là body-weight: ${bodyNoField}`);
    }
    /* And every placeholder is filled — a leftover `{prev}` on screen is the
       most visible possible bug in a celebration. */
    for (const [what, s] of [['tạ', heavier], ['lần đầu', firstLoad], ['reps', reps], ['body', bodyReps]]) {
      if (/\{\w+\}/.test(s)) problems.push(`câu ${what} còn chỗ trống chưa thay: ${s}`);
    }
  }
}

/* ── 4. magnitude stays inside the scale the engine speaks ── */
{
  /* `QUIET_BELOW` is where `koa-decide` stops bothering anybody. Beating
     yourself is never below it, however small the step: 2.5kg on a bench is
     the whole point of keeping a log. */
  const QUIET_BELOW = 0.25;
  const small = recordsMagnitude(against([set('Bench', 80, 5)], [set('Bench', 82.5, 5)]));
  if (!(small > QUIET_BELOW)) {
    problems.push(`kỷ lục nhỏ nhất bị coi là quá nhỏ để nói (độ lớn ${small})`);
  }
  /* And bigger is bigger — the property the whole 0..1 scale exists for. A
     flat number here would make every record the same event again. */
  const bigger = recordsMagnitude(against([set('Bench', 80, 5)], [set('Bench', 92.5, 5)]));
  if (!(bigger > small)) {
    problems.push(`bước nhảy lớn hơn không cho độ lớn lớn hơn (${bigger} ≤ ${small})`);
  }
  const two = recordsMagnitude(
    against([set('Bench', 80, 5), set('Squat', 80, 5)], [set('Bench', 82.5, 5), set('Squat', 82.5, 5)]),
  );
  if (!(two > small)) {
    problems.push(`phá kỷ lục ở hai bài không lớn hơn ở một bài (${two} ≤ ${small})`);
  }
  const many = recordsMagnitude(
    against(
      [set('A', 10, 5), set('B', 10, 5), set('C', 10, 5), set('D', 10, 5), set('E', 10, 5)],
      [set('A', 40, 5), set('B', 40, 5), set('C', 40, 5), set('D', 40, 5), set('E', 40, 5)],
    ),
  );
  /* 0.95 is a platinum medal. A day of personal bests is a big day and is still
     not the same event as a year-long streak. */
  if (!(many <= 0.9)) problems.push(`độ lớn kỷ lục vượt trần 0.9 (${many})`);
  if (recordsMagnitude([]) !== 0) problems.push('không có kỷ lục nào mà độ lớn vẫn khác 0');
  if (headlineRecord([]) !== null) problems.push('headlineRecord phải trả null khi không có gì');
}

/* ── 5. the column is free JSONB, so the reader must survive anything ── */
{
  const junk = [
    null,
    'not an object',
    {},
    { exerciseName: 'Bench' },
    { exerciseName: 'Bench', weight: 'heavy', reps: 5 },
    { exerciseName: '   ', weight: 50, reps: 5 },
    { exerciseName: 'Bench', weight: 50, reps: 5 },
  ];
  let parsed;
  try {
    parsed = setsFromJson(junk);
  } catch (e) {
    problems.push(`setsFromJson ném lỗi trên dữ liệu rác: ${e.message}`);
    parsed = [];
  }
  if (parsed.length !== 1) {
    problems.push(`setsFromJson giữ lại ${parsed.length} dòng rác (chỉ được giữ 1 dòng hợp lệ)`);
  }
  if (setsFromJson(null).length !== 0 || setsFromJson({}).length !== 0) {
    problems.push('setsFromJson không chịu được cột không phải mảng');
  }
  /* An unfinished row is a row with no reps in it, and it is the commonest
     thing in the table. It must not become a record of zero. */
  if (bestsFrom([set('Bench', 100, 0)]).bench !== undefined) {
    problems.push('set chưa có reps vẫn được tính vào kỷ lục');
  }
}

/* ── 6. the shape of the original bug: a constant where a computation goes ── */
{
  const src = strip(read('src/hooks/use-fitness-data.ts'));
  if (/pr_detected:\s*(false|true)\b/.test(src)) {
    problems.push('pr_detected lại được ghi bằng hằng số — đó chính là lỗi cũ');
  }
  if (!/pr_detected:\s*records\.length/.test(src)) {
    problems.push('pr_detected không được tính từ kỷ lục tìm được');
  }

  /* Ordering: the history read has to come before the insert, or the session
     being saved is part of the history it is judged against and every set in it
     ties its own record. */
  /* Anchored on the *query*, not on `PR_HISTORY` anywhere. The first draft of
     this rule matched the import at the top of the file, which by construction
     comes before everything — so it passed the sabotage where the whole read
     had been moved below the insert. A position check is only a check if it is
     measured from the thing that moves. */
  const historyAt = src.indexOf('.limit(PR_HISTORY)');
  const insertAt = src.indexOf("from('workout_sessions').insert");
  if (historyAt < 0 || insertAt < 0) {
    problems.push('không thấy chỗ đọc lịch sử hoặc chỗ ghi buổi tập');
  } else if (historyAt > insertAt) {
    problems.push('đọc lịch sử SAU khi ghi — buổi tập tự nằm trong lịch sử của chính nó');
  }
}

/* ── 7. every emitter hands Koa a context read at the moment it fires ──

   ── the list used to be typed here, and that was the bug in the rule ──

   Four paths, written down once. So the rule covered the emitters that existed
   the day it was written and was blind to every one added after — which is a
   guard that checks a list rather than a behaviour, the failure mode this
   directory has now had to fix six times.

   It found out the honest way: `components/ascnd/mascot.tsx` became the fifth
   emitter (the tap on the figure, which had never announced itself), and this
   rule stayed green about a file it had never heard of.

   So the emitters are *found*. Anything in `src` that calls `emitKoa` answers
   for its context, and a sixth one cannot be added without either passing or
   failing — never by being absent. The debug screen is the one exemption and it
   is named with its reason: it builds contexts by hand precisely so it can ask
   what happens when nobody is watching, and refreshing them would defeat the
   only thing it is for. */
{
  const EXEMPT = new Map([
    [
      'src/app/koa-debug.tsx',
      'dựng ngữ cảnh bằng tay để hỏi "nếu không ai nhìn thì sao" — làm mới sẽ phá đúng thứ nó tồn tại để thử',
    ],
  ]);

  const all = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
    cwd: NATIVE,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

  const files = all.filter((f) => {
    if (f === 'src/lib/koa-stage.ts') return false; // where emitKoa is defined
    if (EXEMPT.has(f)) return false;
    try {
      return /\bemitKoa\(/.test(readFileSync(path.join(NATIVE, f), 'utf8'));
    } catch {
      return false;
    }
  });

  if (files.length < 4) {
    problems.push(
      `chỉ tìm thấy ${files.length} file gọi emitKoa — bộ quét hỏng, đừng tin kết quả của bước này`,
    );
  }
  for (const [f, why] of EXEMPT) {
    if (!all.includes(f)) problems.push(`danh sách miễn còn '${f}' nhưng file đó không còn — bỏ dòng đó đi`);
    if (!why || why.length < 20) problems.push(`'${f}' được miễn mà lý do quá sơ sài`);
  }

  for (const f of files) {
    const src = strip(read(f));
    let i = src.indexOf('emitKoa(');
    while (i >= 0) {
      // walk to the matching close paren of this call
      let depth = 0;
      let j = i + 'emitKoa'.length;
      for (; j < src.length; j++) {
        if (src[j] === '(') depth++;
        else if (src[j] === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      const call = src.slice(i, j + 1);
      if (!call.includes('refreshKoaContext(')) {
        problems.push(
          `${f}: emitKoa nhận ngữ cảnh chụp lúc render — giờ và "có ai nhìn không" đã cũ ` +
            '(bọc refreshKoaContext)',
        );
      }
      i = src.indexOf('emitKoa(', j);
    }
  }
}

/* ── 8. the ceremony is rationed by the event ── */
{
  const src = strip(read('src/app/log-workout.tsx'));
  if (!/records\.length\s*>\s*0\s*\?[\s\S]{0,200}RecordCelebration/.test(src)) {
    problems.push('màn ăn mừng không bị chặn bởi "có kỷ lục hay không" — buổi tập thường cũng phải chờ');
  }
  /* The emit lives in an effect, not in `onSuccess`. In `onSuccess` the figure
     does not exist yet, the presence counter is zero, and the engine answers
     "không ai đang nhìn" to the biggest moment in the app. */
  const emitAt = src.indexOf('emitKoa(');
  const effectAt = src.lastIndexOf('useEffect(', emitAt);
  const successAt = src.lastIndexOf('onSuccess:', emitAt);
  if (emitAt >= 0 && effectAt < successAt) {
    problems.push('báo cho Koa ngay trong onSuccess — lúc đó chưa có hình nào trên màn hình');
  }
}

/* ── 9. both languages, or the record speaks English to a Vietnamese app ── */
{
  const strings = read('src/lib/native-strings.ts');
  const [, en = '', vi = ''] = strings.split(/^export const (?:en|vi)[^=]*= \{$/m);
  for (const key of [
    'nPrTitle',
    'nPrTitleMany',
    'nPrWeightLine',
    'nPrRepsLine',
    'nPrRepsBodyLine',
    'nPrFirstLoad',
    'nPrContinue',
  ]) {
    const hits = strings.split(`${key}:`).length - 1;
    if (hits < 2) problems.push(`thiếu bản dịch cho ${key} (chỉ thấy ${hits} lần)`);
  }
  if (!en && !vi) {
    /* the split above is a sanity net, not the assertion — `tools/i18n.mjs`
       owns dictionary completeness */
  }
}

if (problems.length) {
  console.log('kỷ lục cá nhân:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'kỷ lục cá nhân OK — bài tập lần đầu không tính, mức tạ chưa từng tập không tính, ' +
    'khởi động tăng dần trong một buổi chỉ ra một kỷ lục, bằng kỷ lục cũ không tính; ' +
    'nặng hơn và nhiều lần hơn ở cùng mức đều được ghi nhận, hít xà 0kg cũng có kỷ lục, ' +
    'lần đầu đeo tạ không chia cho 0; tên bài khớp theo cách người ta gõ; ' +
    'độ lớn luôn đủ để nói thành lời và không bao giờ vượt huy chương bạch kim; ' +
    'cột JSONB rác không làm hỏng lần lưu; pr_detected được TÍNH chứ không phải hằng số, ' +
    'lịch sử đọc TRƯỚC khi ghi, Koa được báo SAU khi hình đã lên màn hình, ' +
    'mọi emitKoa đều đọc lại giờ và "có ai nhìn không" ngay lúc bắn — và các emitter được QUÉT RA chứ không còn là danh sách gõ tay, nên emitter thứ năm (cú chạm vào Koa) không thể lọt qua bằng cách vắng mặt, ' +
    'buổi tập không có kỷ lục vẫn đóng ngay trong một nhịp như cũ; và câu ăn mừng được CHẠY THẬT qua cả bốn nhánh — chú thích của nó từng nói là công cụ này đọc mọi nhánh trong khi grep ra 0 kết quả, nên hai nhánh dễ hỏng nhất (hít xà không in "ở 0 kg", lần đầu đeo tạ không in "trước là 0 kg") chưa từng được kiểm',
);
