/**
 * That "already in today" is right about what the diary contains, and errs the
 * safe way when it cannot be.
 *
 * ── why a rule like this needs a test more than most ──
 *
 * It compares two things that were typed by two different parts of the app and
 * decides whether they are the same meal. There is no id linking them — a
 * planned row and a diary row have nothing in common but names — so this is a
 * judgement, and a judgement has two ways to be wrong that are not equal:
 *
 * **Too loose**, and the app tells you today already has your breakfast when it
 * does not. You believe it, you do not log, and the day is under by 600 kcal
 * with nothing on screen having looked wrong.
 *
 * **Too strict**, and it offers to log something already logged. That costs a
 * confirmation dialog, which is exactly what the dialog is for.
 *
 * So the rule is deliberately strict, and this file's job is to keep it that
 * way: the cases below are mostly about what must *not* match.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'planned-'));

const foods = (...names) => names.map((food_name) => ({ food_name }));

try {
  execFileSync('npx', ['tsc', 'src/lib/planned-meal.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const { plannedMealIsLoggedToday } = createRequire(import.meta.url)(path.join(out, 'planned-meal.js'));

  const problems = [];
  const check = (what, planned, mealType, entries, want) => {
    const got = plannedMealIsLoggedToday(planned, mealType, entries);
    if (got !== want) problems.push(`${what}: ${got}, đáng lẽ ${want}`);
  };

  const BREAKFAST = foods('Ức gà', 'Cơm trắng');

  // ── it says yes when today really does hold this meal ──
  check('khớp đúng', BREAKFAST, 'breakfast',
    [{ meal_type: 'breakfast', items: foods('Ức gà', 'Cơm trắng') }], true);
  check('khác thứ tự vẫn là một bữa', BREAKFAST, 'breakfast',
    [{ meal_type: 'breakfast', items: foods('Cơm trắng', 'Ức gà') }], true);
  check('hoa/thường và khoảng trắng không phải khác biệt', BREAKFAST, 'breakfast',
    [{ meal_type: 'breakfast', items: foods('  ức GÀ ', 'cơm trắng') }], true);
  check('bữa khác trong ngày không cản', BREAKFAST, 'breakfast',
    [
      { meal_type: 'lunch', items: foods('Phở') },
      { meal_type: 'breakfast', items: foods('Ức gà', 'Cơm trắng') },
    ], true);

  // ── and no when it does not ──
  check('nhật ký trống', BREAKFAST, 'breakfast', [], false);
  check('đúng món nhưng sai bữa', BREAKFAST, 'breakfast',
    [{ meal_type: 'dinner', items: foods('Ức gà', 'Cơm trắng') }], false);
  check('thiếu một món', BREAKFAST, 'breakfast',
    [{ meal_type: 'breakfast', items: foods('Ức gà') }], false);
  /*
    The one that decides the whole design: today's breakfast has the planned
    foods *and a coffee*. Loose matching would call this done. It is not the
    planned meal, and the cost of being wrong here is a day silently under by
    the calories of a meal somebody then does not log.
  */
  check('có thêm món khác', BREAKFAST, 'breakfast',
    [{ meal_type: 'breakfast', items: foods('Ức gà', 'Cơm trắng', 'Cà phê') }], false);
  check('món hoàn toàn khác', BREAKFAST, 'breakfast',
    [{ meal_type: 'breakfast', items: foods('Bánh mì') }], false);

  // ── nothing planned is never "already logged" ──
  check('kế hoạch rỗng', [], 'breakfast',
    [{ meal_type: 'breakfast', items: foods('Ức gà') }], false);
  check('kế hoạch toàn tên rỗng', foods('', '   '), 'breakfast',
    [{ meal_type: 'breakfast', items: foods('') }], false);

  // ── a food written twice in one meal is one food, on both sides ──
  check('trùng tên trong kế hoạch', foods('Trứng', 'Trứng'), 'breakfast',
    [{ meal_type: 'breakfast', items: foods('Trứng') }], true);
  check('trùng tên trong nhật ký', foods('Trứng'), 'breakfast',
    [{ meal_type: 'breakfast', items: foods('Trứng', 'Trứng') }], true);

  /*
    Self-test: the loose version, rebuilt.

    "The entry contains every planned food" is the rule somebody reaches for
    first, and it passes every case above except the coffee. If it does not
    fail that one, the coffee case is not testing what it claims to.
  */
  const loose = (planned, mealType, entries) => {
    const want = planned.map((f) => f.food_name.trim().toLowerCase()).filter(Boolean);
    return entries.some(
      (e) =>
        e.meal_type === mealType &&
        want.length > 0 &&
        want.every((n) => e.items.some((it) => it.food_name.trim().toLowerCase() === n)),
    );
  };
  if (!loose(BREAKFAST, 'breakfast', [{ meal_type: 'breakfast', items: foods('Ức gà', 'Cơm trắng', 'Cà phê') }])) {
    console.error('phép tự kiểm hỏng — cách so lỏng đáng lẽ phải nhận nhầm ca "có thêm cà phê", đừng tin kết quả');
    process.exit(1);
  }

  /*
    And that nothing built on it blocks.

    The rule is evidence, not a verdict: the button has to stay pressable and
    ask. `disabled` bound to it would turn a heuristic into a refusal, and the
    person who genuinely ate the same breakfast twice would have no way to say
    so.
  */
  const screen = readFileSync(path.join(NATIVE, 'src/app/meal-plan.tsx'), 'utf8');
  if (/disabled=\{[^}]*\balready\b/.test(screen)) {
    problems.push('meal-plan: nút bị khoá theo "already" — đây là bằng chứng, không phải phán quyết; phải hỏi chứ không chặn');
  }
  if (!/Alert\.alert\(i18n\.nMpAgainTitle/.test(screen)) {
    problems.push('meal-plan: không thấy hộp thoại xác nhận trước khi ghi trùng');
  }
  /*
    The file this reads moved once already — the button was on `meal-plans`
    until the plan got a screen of its own. A rule pointed at a file that no
    longer holds the code it is about passes forever, so the path is asserted
    before it is searched.
  */
  if (!/plannedMealIsLoggedToday/.test(screen)) {
    problems.push('meal-plan: màn hình này không còn dùng plannedMealIsLoggedToday — luật đang canh sai tệp');
  }

  if (problems.length) {
    console.error('"đã có trong hôm nay" sai:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  console.log('bữa đã ghi OK — 13 ca, so khớp chặt (thêm một món là không khớp), và nút vẫn bấm được, chỉ hỏi lại');
} finally {
  rmSync(out, { recursive: true, force: true });
}
