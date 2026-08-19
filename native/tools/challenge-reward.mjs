/**
 * A challenge is finished once, and celebrated once.
 *
 * ── the bug this was written for ──
 *
 * `useUpdateChallengeProgress` runs from Today's `useFocusEffect`. That means it
 * fires on **every return to the tab** — back from a meal sheet, a workout
 * sheet, a weigh-in, or simply switching tabs and switching back. Most of those
 * passes find nothing changed, which is fine and intended.
 *
 * What is not fine is anything in the pass that is gated on a *state* rather
 * than on a *transition*. The coin payment had it right:
 *
 *     if (isCompleted && !ch.completed) { … pay … }
 *
 * The celebration, four lines below, had:
 *
 *     if (!isCompleted || !ch.reward_title) return null;
 *
 * One condition weaker. So finishing a challenge on Monday queued a full-screen
 * award animation on **every single return to Today** until the week rolled
 * over. The whole value of a celebration is that it is rare; this was the most
 * repeated animation in the product, and nothing about reading either line
 * makes that visible — the fault is in how many times the function is called.
 *
 * ── so the check is repetition, not shape ──
 *
 * A grep for `!ch.completed` would have passed the broken version, because the
 * string was right there in the payment. The only honest test is to run a week
 * of passes and count. That is why `challengeStep` was lifted into
 * `lib/challenge-progress.ts`: a rule about what happens the *second* time
 * cannot live somewhere only the first time can be read.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'chalrew-'));
const problems = [];

try {
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/challenge-progress.ts', '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* no project tsconfig here — tsc exits non-zero over the `@/` mapping and
       still emits, which is all this uses */
  }
  const { challengeStep } = createRequire(import.meta.url)(path.join(out, 'challenge-progress.js'));

  /**
   * A week of focus passes, as the app really makes them.
   *
   * The row is the database: each pass reads what the last pass stored and
   * writes back what this one decided, exactly as the mutation does. `measured`
   * is what the counting queries came back with on that pass.
   */
  const runWeek = (measurements, target) => {
    let row = { current_value: 0, target_value: target, completed: false };
    const log = [];
    for (const measured of measurements) {
      const step = challengeStep(row, measured);
      log.push(step);
      if (!step.unchanged) {
        row = { ...row, current_value: step.value, completed: step.completed };
      }
    }
    return { log, row };
  };

  const count = (log, field) => log.filter((s) => s[field]).length;

  /* ── 1. the case that shipped: finished on Monday, tab reopened all week ── */
  {
    // 7 workouts needed; done by the third pass, then twenty more focus passes
    const passes = [1, 4, 7, ...Array(20).fill(7)];
    const { log } = runWeek(passes, 7);
    const celebrations = count(log, 'justCompleted');
    if (celebrations !== 1) {
      problems.push(
        `thử thách xong rồi mà mở lại Today ${passes.length - 3} lần nữa sinh ra ${celebrations} lần ăn mừng — ` +
          'phải đúng 1. Bản đã ship bắn pháo hoa MỖI lần quay lại tab cho tới khi sang tuần, ' +
          'vì màn ăn mừng chỉ khoá `isCompleted` còn tiền thưởng khoá `isCompleted && !completed`',
      );
    }
  }

  /* ── 2. and no write on a pass where nothing moved ──

     Not a performance nicety: the update rewrites `completed_at`, so an
     unconditional write quietly moves the moment a challenge was finished to
     whenever the person last opened the tab. */
  {
    const { log } = runWeek([3, 3, 3, 3, 3], 7);
    const writes = log.length - count(log, 'unchanged');
    if (writes !== 1) {
      problems.push(
        `5 lượt với cùng một số đo sinh ra ${writes} lần ghi — phải đúng 1 (lượt đầu). ` +
          'Ghi vô điều kiện còn viết đè `completed_at`, tức dời thời điểm hoàn thành sang lúc mở tab gần nhất',
      );
    }
  }

  /* ── 3. progress that goes up on several passes still celebrates once ── */
  {
    const { log } = runWeek([0, 1, 2, 3, 4, 5, 6, 7, 7, 7], 7);
    if (count(log, 'justCompleted') !== 1) {
      problems.push('tiến trình tăng dần qua nhiều lượt vẫn phải ăn mừng đúng một lần');
    }
    if (log[7].justCompleted !== true) {
      problems.push('lượt chạm đúng mục tiêu phải là lượt ăn mừng, không phải lượt nào khác');
    }
  }

  /* ── 4. the numbers themselves ── */
  {
    const CASES = [
      [{ current_value: 0, target_value: 7, completed: false }, 9, 7, true, 'vượt mục tiêu phải bị kẹp về đúng mục tiêu — thanh tiến trình không được tràn'],
      [{ current_value: 0, target_value: 7, completed: false }, -3, 0, false, 'số đo âm (một truy vấn hỏng) không được lưu thành tiến trình'],
      [{ current_value: 0, target_value: 7, completed: false }, NaN, 0, false, 'NaN không được lưu vào cột số'],
      [{ current_value: 7, target_value: 7, completed: true }, 7, 7, true, 'đã xong thì vẫn xong'],
      [{ current_value: 0, target_value: 0, completed: false }, 0, 0, true, 'mục tiêu 0 là đã đạt — không được chia cho 0 hay kẹt mãi'],
    ];
    for (const [row, measured, wantValue, wantCompleted, why] of CASES) {
      const s = challengeStep(row, measured);
      if (s.value !== wantValue || s.completed !== wantCompleted) {
        problems.push(
          `challengeStep(${JSON.stringify(row)}, ${measured}) ra ${s.value}/${s.completed} ` +
            `nhưng phải là ${wantValue}/${wantCompleted} — ${why}`,
        );
      }
    }
  }

  /* ── 5. a target that goes backwards does not re-celebrate ──

     A challenge measured by a count can fall: a workout deleted, a meal edited
     below the calorie line. If it drops under target and climbs back, that is
     the same achievement — but `justCompleted` fires again, because `completed`
     was written false in between. That is correct and worth stating, because it
     is the one repeat this file permits: the app really did un-finish it. What
     must never happen is a repeat with **no** dip. */
  {
    const { log } = runWeek([7, 7, 7, 5, 7], 7);
    const marks = log.map((s) => s.justCompleted);
    if (marks[0] !== true || marks[1] !== false || marks[2] !== false) {
      problems.push('ba lượt liền ở trạng thái xong mà vẫn ăn mừng lại — đúng lỗi đã ship');
    }
    if (marks[4] !== true) {
      problems.push(
        'tụt xuống dưới mục tiêu rồi đạt lại mà không ăn mừng — lần này app THẬT SỰ đã gỡ trạng thái xong, ' +
          'nên đây là lần đạt mới chứ không phải lặp',
      );
    }
  }

  /* ── 6. one bad row does not take the good ones with it ──

     A correction to my own previous round, and worth stating as a rule rather
     than a patch. That round wrapped the challenge write in `confirmWrite`,
     which **throws** when the update matches no rows — for a good reason: a
     silent no-op leaves `completed` false in the database, so the next focus
     pass reads the challenge as freshly finished and celebrates it again, which
     is the exact repeat this file exists to prevent.

     What it did not weigh is where that throw lands. The pass runs
     `challenges.map(...)` inside `Promise.all`, so one unwritable row rejected
     the whole batch: no challenge in that pass paid, none celebrated. And
     Today's focus effect wraps the call in `.catch(() => {})`, so it happened
     without a word.

     `allSettled` keeps the blast radius at one challenge. The failure is still
     reported — re-thrown after the successful ones have been paid and announced
     — so nothing is swallowed; it simply stops being contagious. */
  {
    const src = readFileSync(path.join(NATIVE, 'src/hooks/use-extras.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    if (/await Promise\.all\(\s*challenges\.map/.test(src)) {
      problems.push(
        'vòng thử thách vẫn dùng Promise.all — một dòng không ghi được sẽ reject cả lượt, nên KHÔNG ' +
          'thử thách nào được trả tiền hay ăn mừng, và .catch(() => {}) ở Today nuốt luôn lý do',
      );
    }
    if (!/Promise\.allSettled\(\s*challenges\.map/.test(src)) {
      problems.push('không tìm thấy Promise.allSettled quanh vòng thử thách — bộ quét hỏng hoặc luật đã bị gỡ');
    }
    /* and the failure is not merely dropped: allSettled without a re-throw
       would trade a contagious error for a silent one, which is the other half
       of the same mistake */
    if (!/status === 'rejected'/.test(src)) {
      problems.push(
        'allSettled mà không ai đọc nhánh rejected — đổi một lỗi lây lan lấy một lỗi im lặng, ' +
          'tức vẫn là nửa việc',
      );
    }
    /* The celebrations still run before the re-throw, or a failing row silences
       the four that worked — the very thing this section is about.

       Scoped to the text after `settled`, and that scoping is the fix to a
       first draft that could not fail: it searched the whole file for
       `enqueueAward(`, and the first one is in the medal engine four hundred
       lines earlier. So the celebration always appeared to come first, whatever
       the challenge loop did. Breaking the order on purpose left it green. */
    const loop = src.slice(src.indexOf('const settled'));
    const enqueueAt = loop.indexOf('enqueueAward(');
    const throwAt = loop.search(/throw failed\.reason/);
    if (enqueueAt < 0 || throwAt < 0) {
      problems.push('không tìm thấy cả hai mốc (enqueueAward / throw) sau vòng settled — bộ quét hỏng');
    } else if (throwAt < enqueueAt) {
      problems.push(
        'ném lỗi TRƯỚC khi bắn các màn ăn mừng — những thử thách đã thành công trong cùng lượt vẫn bị làm im',
      );
    }
  }

  /* ── 7. the mutation actually asks this function ──

     The rule above proves the function is right. This proves the app uses it:
     the payment and the celebration must sit behind the same `justCompleted`,
     because them drifting one condition apart is the entire bug. */
  {
    const src = readFileSync(path.join(NATIVE, 'src/hooks/use-extras.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    if (!/challengeStep\(/.test(src)) {
      problems.push('use-extras.ts không còn gọi challengeStep — luật ở trên không nói gì về app nữa');
    }
    const gate = src.indexOf('step.justCompleted');
    if (gate < 0) {
      problems.push('không tìm thấy cổng step.justCompleted trong use-extras.ts');
    } else {
      /* brace-match the guarded block rather than reading a fixed window — an
         adjacent block satisfying the search is exactly how `plausible.mjs`
         went green about a check that had been removed */
      const open = src.indexOf('{', gate);
      let depth = 0;
      let end = open;
      for (; end < src.length; end++) {
        if (src[end] === '{') depth++;
        else if (src[end] === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      const block = src.slice(open, end + 1);
      /* Either claim RPC counts as "the payment". `claim_quest_reward` is the
         one to call — the server prices the key there — and `earn_mascot_coins`
         is the old signature kept alive for builds already on phones. Naming
         only the old one made this rule go red the day the call was moved, and
         naming only the new one would make it silently match nothing on any
         branch that still uses the old. See 20260819120000. */
      if (!/claim_quest_reward|earn_mascot_coins/.test(block)) {
        problems.push('tiền thưởng không nằm trong nhánh justCompleted');
      }
      if (!/reward_title/.test(block) || !/CHALLENGE_TEXT/.test(block)) {
        problems.push(
          'màn ăn mừng KHÔNG nằm trong cùng nhánh với tiền thưởng — đúng hình dạng của lỗi đã ship: ' +
            'trả tiền theo chuyển trạng thái, ăn mừng theo trạng thái',
        );
      }
    }
  }

  if (problems.length) {
    console.log('thưởng thử thách CÓ LỖI:\n');
    for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
    process.exit(1);
  }

  console.log(
    'thưởng thử thách OK — chạy thật một tuần các lượt focus: thử thách xong ở lượt 3 rồi mở lại Today ' +
      '20 lần nữa vẫn chỉ ăn mừng ĐÚNG MỘT LẦN (bản đã ship bắn pháo hoa mỗi lần quay lại tab cho tới hết ' +
      'tuần, vì ăn mừng khoá `isCompleted` còn trả tiền khoá `isCompleted && !completed`); 5 lượt cùng số đo ' +
      'chỉ sinh 1 lần ghi, nên `completed_at` không bị dời sang lúc mở tab gần nhất; vượt mục tiêu bị kẹp, ' +
      'số âm và NaN không lưu được, mục tiêu 0 không kẹt; tụt xuống rồi đạt lại thì ĐƯỢC ăn mừng lại vì ' +
      'app thật sự đã gỡ trạng thái xong; và trong use-extras.ts tiền thưởng với màn ăn mừng nằm trong ' +
      'CÙNG một nhánh chuyển trạng thái; và một thử thách ghi hỏng chỉ làm hỏng CHÍNH NÓ — ' +
      'Promise.all cũ khiến một dòng không ghi được reject cả lượt, nên không thử thách nào được ' +
      'trả tiền hay ăn mừng, trong im lặng, vì Today bọc lời gọi bằng .catch(() => {})',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
