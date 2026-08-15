/**
 * That food you photographed reaches a meal.
 *
 * ── the bug this was written for ──
 *
 * The two scanners hand their results to `/log-meal` through a module-level
 * slot in `lib/scan-bridge.ts`. `/log-meal` is the only screen that ever reads
 * that slot, and it reads it on focus.
 *
 * Which screen the scanner returned to was decided by a query parameter:
 * `scan-food?from=ai` meant "there is no meal sheet below you, route into one",
 * anything else meant "just pop". The Nutrition tab's own card — the one titled
 * *four ways to log a meal* — pushes both scanners with **no parameter at all**.
 *
 * So: photograph a plate, wait for the model, tap "Thêm 3 món", the camera
 * closes, and nothing is logged. No toast. No error. No row in the diary. The
 * barcode scanner did the same, right after a success haptic.
 *
 * And the food did not stay lost, which is the worse half: the slot was cleared
 * only by being consumed, so those items were appended to the **next** meal
 * sheet opened — that evening, the next morning — with their calories and
 * macros, into a meal they had nothing to do with. Nothing in the app connected
 * the two events, and `daily_logs.kcal` is what `adaptiveTDEE` regresses over
 * fourteen days to suggest a calorie target.
 *
 * ── why two rules and not one ──
 *
 * The failure had two independent halves, and fixing either alone leaves a live
 * bug:
 *
 *   · **the destination was passed in.** A hand-off that needs every future
 *     caller to remember a flag is broken by the first caller who does not, and
 *     that had already happened. The scanner has to work it out.
 *   · **the slot never expired.** Perfect routing makes a stale scan
 *     unreachable; it does not make it impossible. An expiry is what turns
 *     "should never happen" into "cannot be served hours later".
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

const out = mkdtempSync(path.join(tmpdir(), 'scan-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/scan-bridge.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* no project tsconfig here — tsc exits non-zero over the `@/` mapping and
     still emits, which is all this uses */
}
const { setPendingScan, consumePendingScan, stackHasMealSheet, SCAN_TTL_MS } =
  createRequire(import.meta.url)(path.join(out, 'scan-bridge.js'));

const food = (name) => ({
  food_name: name, kcal: 300, protein_g: 20, carbs_g: 30, fat_g: 10, fiber_g: 4, serving_g: 200,
});

/* ── 1. the slot expires ── */
{
  const t0 = 1_000_000;
  setPendingScan(food('phở'), t0);
  const soon = consumePendingScan(t0 + 30_000);
  if (!soon || soon.length !== 1) {
    problems.push('quét xong 30 giây sau đã không lấy lại được — hết hạn quá sớm');
  }

  setPendingScan(food('bún'), t0);
  const late = consumePendingScan(t0 + SCAN_TTL_MS + 1);
  if (late !== null) {
    problems.push('lần quét bị lạc vẫn được phục vụ sau khi hết hạn — nó sẽ chui vào một bữa khác');
  }

  /* Consumed once, gone. Two meal sheets opened in a row must not both receive
     the same plate. */
  setPendingScan(food('cơm'), t0);
  consumePendingScan(t0);
  if (consumePendingScan(t0) !== null) {
    problems.push('cùng một lần quét được phục vụ hai lần');
  }

  if (!(SCAN_TTL_MS >= 60_000 && SCAN_TTL_MS <= 30 * 60_000)) {
    problems.push(`hạn giữ ${SCAN_TTL_MS}ms không hợp lý (cần đủ cho một vòng gọi AI, và ngắn hơn khoảng cách giữa hai bữa)`);
  }
}

/* ── 2. the destination is worked out, not passed in ── */
{
  /* The real shape expo-router hands back: a root navigator whose routes may
     nest. Both are exercised, because a check that only reads the top level
     would answer "no sheet" for a sheet one level down and open a second one. */
  const withSheet = { routes: [{ name: '(tabs)' }, { name: 'log-meal' }, { name: 'scan-food' }] };
  const nested = { routes: [{ name: '(tabs)', state: { routes: [{ name: 'log-meal' }] } }] };
  const without = { routes: [{ name: '(tabs)' }, { name: 'scan-food' }] };

  if (!stackHasMealSheet(withSheet)) problems.push('không nhận ra sheet log-meal ở ngay stack gốc');
  if (!stackHasMealSheet(nested)) problems.push('không nhận ra sheet log-meal lồng trong navigator con');
  if (stackHasMealSheet(without)) problems.push('báo có sheet log-meal trong khi không có');

  /* Unknown shapes must answer "no sheet", which routes *into* one. The worst
     case that way is a second sheet carrying the food; the worst case the other
     way is the food disappearing. */
  for (const junk of [null, undefined, {}, { routes: null }, 'nope', 42, { routes: [null, 7] }]) {
    if (stackHasMealSheet(junk) !== false) {
      problems.push(`trạng thái điều hướng lạ (${JSON.stringify(junk)}) không trả về false`);
    }
  }
}

/* ── 3. neither scanner decides by query parameter any more ── */
{
  for (const file of ['src/app/scan-food.tsx', 'src/app/scan-barcode.tsx']) {
    const src = strip(read(file));

    if (!src.includes('stackHasMealSheet(')) {
      problems.push(`${file}: không hỏi trạng thái điều hướng — điểm đến lại do chỗ gọi quyết định`);
    }
    /* The shipped shape, named exactly. */
    if (/from\s*===\s*'ai'/.test(src)) {
      problems.push(`${file}: vẫn rẽ nhánh theo tham số 'from' — chỗ gọi nào quên gắn thì lần quét đó mất`);
    }
    /* Every path out of the scanner has to land the food somewhere. A bare
       `router.back()` with no `replace` beside it is the branch that dropped
       it. */
    if (src.includes('setPendingScan(') && !src.includes("router.replace('/log-meal')")) {
      problems.push(`${file}: có ghi vào bridge nhưng không có đường mở /log-meal — thức ăn vẫn có thể rơi`);
    }
  }

  /* And the consumer still exists. If `/log-meal` stops reading the slot, every
     scan in the app is silently discarded and nothing else in this file would
     notice. */
  const meal = strip(read('src/app/log-meal.tsx'));
  if (!meal.includes('consumePendingScan(')) {
    problems.push('src/app/log-meal.tsx: không còn đọc bridge — mọi lần quét sẽ bị vứt');
  }
}

if (problems.length) {
  console.log('bàn giao kết quả quét:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `bàn giao quét OK — chỗ giữ hết hạn sau ${SCAN_TTL_MS / 60000} phút nên một lần quét bị lạc ` +
    'không bao giờ chui được vào bữa ăn sau (bản cũ không hết hạn, và nó đã làm đúng thế); ' +
    'chỉ phục vụ đúng một lần; điểm đến do chính scanner suy ra từ trạng thái điều hướng — ' +
    'nhận ra sheet ở cả stack gốc lẫn navigator lồng, và trạng thái lạ thì trả false để mở sheet ' +
    'chứ không để rơi thức ăn; không màn nào còn rẽ nhánh theo tham số `from` (thẻ "bốn cách ghi ' +
    'bữa ăn" ở tab Nutrition chưa từng gắn tham số đó, nên hai nút quét nổi nhất app đều rơi vào ' +
    'nhánh sai); và /log-meal vẫn là chỗ đọc',
);
