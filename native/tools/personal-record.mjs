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
import { mkdtempSync, readFileSync } from 'node:fs';
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
    ['tsc', 'src/lib/personal-record.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* No project tsconfig here, so tsc exits non-zero over the missing `@/`
     mapping while still emitting the JS — which is all this uses. */
}
const { bestsFrom, findRecords, recordsMagnitude, setsFromJson, headlineRecord } =
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

/* ── 7. every emitter hands Koa a context read at the moment it fires ── */
{
  const files = [
    'src/hooks/use-extras.ts',
    'src/hooks/use-quest-autoclaim.ts',
    'src/hooks/use-streak-guard.ts',
    'src/app/log-workout.tsx',
  ];
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
    'mọi emitKoa đều đọc lại giờ và "có ai nhìn không" ngay lúc bắn, ' +
    'và buổi tập không có kỷ lục vẫn đóng ngay trong một nhịp như cũ',
);
