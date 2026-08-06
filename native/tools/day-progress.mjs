/**
 * That a workout recorded one way shows up the other way, and that reading it
 * back never overrules the person holding the phone.
 *
 * ── the contradiction ──
 *
 * A session reaches the database from two places: the week's day panel, and
 * the free-form sheet at `/log-workout`. The week already noticed both — the
 * strip goes green, the session card appears, the finish button locks. The
 * tick marks noticed neither but their own checkbox, so a day logged from the
 * sheet read `0/12 set` with an empty progress bar directly beneath a card
 * saying it was finished at 18:40.
 *
 * ── and the trap in fixing it ──
 *
 * The obvious repair — spread the evidence over the stored ticks — breaks
 * unticking. A set you untick writes `false` to storage and is painted back
 * over on the next render by the session it came from, so the checkbox stops
 * working on exactly the days it has the most to say. Half these cases are
 * about that direction.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'dayprog-'));

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/day-progress.ts', '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { sessionTicks, mergeProgress } = createRequire(import.meta.url)(
    path.join(out, 'day-progress.js'),
  );

  const problems = [];
  const check = (what, got, want) => {
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    if (a !== b) problems.push(`${what}: ${a}, đáng lẽ ${b}`);
  };
  const ticked = (map, rows) => rows.filter((r) => map[r.key]).map((r) => r.key);

  /* A plan: 3 sets of squat, 2 of bench. */
  const ROWS = [
    { key: '0-0', exerciseName: 'Squat' },
    { key: '0-1', exerciseName: 'Squat' },
    { key: '0-2', exerciseName: 'Squat' },
    { key: '1-0', exerciseName: 'Bench Press' },
    { key: '1-1', exerciseName: 'Bench Press' },
  ];
  const sets = (...names) => names.map((exerciseName) => ({ exerciseName }));

  /* ── reading a session back onto the plan ── */
  check('không có buổi tập thì không tích gì', sessionTicks(ROWS, []), {});
  check(
    'ghi đủ thì tích đủ',
    ticked(sessionTicks(ROWS, sets('Squat', 'Squat', 'Squat', 'Bench Press', 'Bench Press')), ROWS),
    ['0-0', '0-1', '0-2', '1-0', '1-1'],
  );
  /*
    Two of three squats logged ticks two rows, not three and not none. This is
    the case the whole design is for: somebody who stopped early still has a
    record of what they did.
  */
  check('ghi 2/3 set thì tích 2', ticked(sessionTicks(ROWS, sets('Squat', 'Squat')), ROWS), ['0-0', '0-1']);
  check('ghi nhiều hơn kế hoạch thì tích hết chứ không tràn',
    ticked(sessionTicks(ROWS, sets('Squat', 'Squat', 'Squat', 'Squat', 'Squat')), ROWS),
    ['0-0', '0-1', '0-2']);
  check('bài không có trong kế hoạch thì không tích gì',
    sessionTicks(ROWS, sets('Deadlift', 'Deadlift')), {});
  check('hoa/thường và khoảng trắng không phải khác biệt',
    ticked(sessionTicks(ROWS, sets('  sQuAt ', 'bench press')), ROWS), ['0-0', '1-0']);
  check('set không tên thì không quy được cho ai',
    sessionTicks(ROWS, [{ exerciseName: '' }, { exerciseName: null }, {}]), {});
  /*
    Weight and reps are deliberately not consulted. A set logged 100×8 against
    a row planned 100×10 is the same set, done two reps short — the ordinary
    case, and the whole reason for recording what happened rather than what was
    written down.
  */
  check('ghi thiếu rep vẫn là set đó',
    ticked(sessionTicks(ROWS, [{ exerciseName: 'Squat', reps: 2, weight: 20 }]), ROWS), ['0-0']);
  // never says "no" about anything — the caller merges this, it is not the answer
  check('chỉ nói có, không bao giờ nói không',
    Object.values(sessionTicks(ROWS, sets('Squat'))).every((v) => v === true), true);

  /* ── merging with what the person actually ticked ── */
  check('chưa tích gì thì bằng chứng lấp vào',
    ticked(mergeProgress({}, ROWS, sets('Squat', 'Squat')), ROWS), ['0-0', '0-1']);
  check('tự tích rồi thì giữ nguyên và lấp phần còn lại',
    ticked(mergeProgress({ '1-1': true }, ROWS, sets('Squat')), ROWS), ['0-0', '1-1']);
  /*
    The one that keeps the checkbox working. `false` in storage is somebody
    having ticked a set and changed their mind; a session cannot argue with
    that, or unticking on a logged day would silently do nothing.
  */
  check('bỏ tích rồi thì bằng chứng không tích lại',
    ticked(mergeProgress({ '0-0': false }, ROWS, sets('Squat', 'Squat')), ROWS), ['0-1']);
  check('không có buổi tập thì trả về đúng cái đã lưu',
    mergeProgress({ '0-0': true }, ROWS, []), { '0-0': true });

  /*
    Self-test: the spread-the-other-way version.

    `{ ...ticks, ...stored }` reads as the same idea and is the same thing for
    every case above but one — the untick. If this rebuild does not disagree
    there, that case is not testing the direction it claims to.
  */
  const backwards = (stored, rows, s) => ({ ...stored, ...sessionTicks(rows, s) });
  const wrong = ticked(backwards({ '0-0': false }, ROWS, sets('Squat', 'Squat')), ROWS);
  if (wrong.length === 1 && wrong[0] === '0-1') {
    console.error('phép tự kiểm hỏng — bản gộp ngược đáng lẽ phải tích lại ô đã bỏ, đừng tin kết quả');
    process.exit(1);
  }

  /* ── and that the panel is actually wired to it ── */
  const panel = readFileSync(path.join(NATIVE, 'src/components/ascnd/day-plan.tsx'), 'utf8');
  if (!/mergeProgress\(/.test(panel)) {
    problems.push('day-plan: không dùng mergeProgress — luật đang canh sai tệp');
  }
  /*
    Every place that asks "is this set done" has to ask the merged map. One
    left reading the raw stored state is the original bug back in miniature:
    the header counting twelve while the boxes show none, or a tap that writes
    `true` over a box already drawn ticked and appears to do nothing.
  */
  const raw = panel.match(/\bdone\[[a-z]+\.key\]/g) ?? [];
  if (raw.length > 0) {
    problems.push(`day-plan: còn ${raw.length} chỗ đọc thẳng done[...] thay vì shown[...] — ${raw.join(', ')}`);
  }
  if (!/sessions[\s\S]{0,80}sets/.test(panel)) {
    problems.push('day-plan: không đọc sets của buổi tập, không có gì để đối chiếu');
  }
  /*
    The column list, parsed rather than matched.

    This was written as a literal `volume_load, sets'`, and the very next change
    to the query — adding `pr_detected` for the training card — inserted a
    column between the two and failed the check while `sets` was still being
    selected perfectly well. A rule that breaks when something *near* it moves
    is a rule that gets deleted the third time it cries wolf.
  */
  const hook = readFileSync(path.join(NATIVE, 'src/hooks/use-fitness-data.ts'), 'utf8');
  const select = hook
    .match(/export function useWorkoutSessions[\s\S]{0,1200}?\.select\('([^']*)'\)/)?.[1]
    ?.split(',')
    .map((c) => c.trim());
  if (!select) {
    problems.push('use-fitness-data: không đọc được danh sách cột của useWorkoutSessions');
  } else if (!select.includes('sets')) {
    problems.push(
      `use-fitness-data: useWorkoutSessions không lấy cột sets (đang lấy: ${select.join(', ')}) — panel sẽ không bao giờ đối chiếu được`,
    );
  }

  if (problems.length) {
    console.error('đối chiếu buổi tập với lịch tuần sai:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  console.log(
    'đối chiếu buổi tập OK — 14 ca; ghi bằng sheet thì lịch tuần tích theo, so theo tên+số set chứ không so tạ/rep, ô đã bỏ tích thì bằng chứng không tích lại; bản gộp ngược vẫn bị bắt',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
