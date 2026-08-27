/**
 * That a day which could not be rebuilt says so.
 *
 * ── the bug this was written for ──
 *
 * `daily_logs` is the one table every other feature reads: the calorie ring, the
 * macro tiles, the readiness score, the daily quests and the streak all come out
 * of the row `recomputeDailyLog` writes.
 *
 * That function ended:
 *
 *     if (error) console.error('recomputeDailyLog error:', error);
 *     return { error };
 *
 * and **all sixteen call sites** did `await recomputeDailyLog(...)` and threw the
 * result away. Nobody read it. Not one.
 *
 * So: log a meal, `meal_entries` inserts fine, this upsert is refused — RLS, a
 * dropped connection on the twelfth request of the sequence, a constraint. The
 * mutation resolves. `onSuccess` fires. A green toast says saved. The meal shows
 * up in the diary. And the calorie ring, the macros, the readiness score and the
 * day's quest all keep the numbers they had *before the meal* — for ever, until
 * some later write for the same day happens to succeed.
 *
 * The file's own header states the opposite contract, and states it about this
 * exact function: *"Refusing to write is the only safe answer. A rebuild that
 * throws leaves the previous row intact and surfaces through the caller's
 * `onError`."* The eleven **reads** were built that way. The one **write** was
 * not, and nothing noticed because a swallowed error is indistinguishable from
 * no error.
 *
 * ── the three things checked, and why each is the shape rather than the line ──
 *
 * 1. **The write refuses.** Not "the string `throw` appears in the file" — the
 *    upsert's own error branch has to throw, because that is the branch that was
 *    wrong.
 * 2. **Nobody swallows it.** A `try { recomputeDailyLog } catch {}` anywhere is
 *    the old behaviour rebuilt by hand. Exactly one call site is allowed to, for
 *    a reason written down beside it (see below).
 * 3. **Every screen that can now raise it can show it.** Making a function throw
 *    into a caller with no error path converts a silent wrong number into a
 *    silent nothing, which is not an improvement.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

/* ── 1. the write refuses ── */
{
  const src = strip(read('src/lib/daily-log-service.ts'));

  /* The shipped shape, named exactly: log the error and hand it back as a value
     nobody is obliged to read. */
  if (/return\s*\{\s*error\s*\}/.test(src)) {
    problems.push(
      'recomputeDailyLog trả lỗi ra như một giá trị (`return { error }`) — 16/16 chỗ gọi từng bỏ qua đúng cái giá trị đó',
    );
  }

  /*
    Anchored on the write's own error branch. `throw` appearing *somewhere* in a
    350-line file proves nothing: the reads above already throw, and it was
    precisely the write below them that did not.

    ── and the write is no longer one verb ──

    It was `.upsert(`, and this rule went red when the write became
    `.insert(` plus a compare-and-set `.update(...)` — the fix for two devices
    overwriting each other's snapshot. The spelling changed; the property did
    not. So every statement that writes `daily_logs` from this file is found,
    and each one's error branch has to throw. That is stricter than before: one
    verb was checked, now both are, and a third would be too.
  */
  const writes = [...src.matchAll(/from\('daily_logs'\)[\s\S]{0,80}?\.\s*(insert|upsert|update)\(/g)];
  if (writes.length === 0) {
    problems.push('không tìm thấy lệnh ghi daily_logs nào trong recomputeDailyLog — luật này đã lạc mục tiêu');
  }
  const silent = writes.filter((m) => {
    const tail = src.slice(m.index, m.index + 900);
    return !/if\s*\(\s*error\s*\)[\s\S]{0,220}throw/.test(tail);
  });
  if (silent.length > 0) {
    problems.push(
      `nhánh lỗi của lệnh ${silent.map((m) => m[1]).join(', ')} vào daily_logs không ném — ngày ghi hỏng lại im lặng`,
    );
  }
}

/* ── 2. nobody rebuilds the swallow by hand ──

   One call site is allowed to, and only one: the offline replay path, where the
   insert has already landed on the server and re-running the queued write would
   duplicate the row. It carries its reason in a comment beside it. Any other
   `catch` around this call is the old bug wearing a `try`. */
const ALLOWED_SWALLOW = 'src/lib/offline-write.ts';
{
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const p = path.join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p)) files.push(p);
    }
  })(path.join(NATIVE, 'src'));

  let callSites = 0;
  for (const abs of files) {
    const rel = path.relative(path.join(NATIVE, 'src'), abs);
    const src = strip(readFileSync(abs, 'utf8'));
    if (!src.includes('recomputeDailyLog(')) continue;

    callSites += (src.match(/await recomputeDailyLog\(/g) ?? []).length;

    /* A result captured into a variable is a result that can be ignored — the
       whole point of throwing is that there is nothing to capture. */
    if (/=\s*await recomputeDailyLog\(/.test(src)) {
      problems.push(`${rel}: hứng kết quả recomputeDailyLog vào biến — lại có thứ để bỏ qua`);
    }

    if (`src/${rel}` === ALLOWED_SWALLOW) continue;
    if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(src) && src.includes('recomputeDailyLog')) {
      problems.push(`${rel}: có catch rỗng trong file gọi recomputeDailyLog — kiểm tra lại`);
    }
  }

  /* If the scan stops finding call sites, the two rules above are passing by
     measuring nothing — the failure `live.mjs` records having shipped once. */
  if (callSites < 10) {
    problems.push(`chỉ thấy ${callSites} chỗ gọi recomputeDailyLog — bộ quét hỏng, đừng tin kết quả`);
  }
}

/* ── 3. every delete that rebuilds a day can report a failure ──

   These are the screens whose mutations reach `recomputeDailyLog`. Before this
   change a failed rebuild was silent; after it, a screen with no `onError` turns
   that silence into a delete that appears not to have happened. */
{
  const MUST_REPORT = [
    ['src/app/biometrics.tsx', 'remove.mutate('],
    ['src/app/sleep-insights.tsx', 'remove.mutate('],
    ['src/app/(tabs)/progress.tsx', 'removeMeasurement.mutate('],
    ['src/app/sessions.tsx', 'del.mutate('],
    ['src/app/(tabs)/workouts/index.tsx', 'delSession.mutate('],
    ['src/components/ascnd/today-meals.tsx', 'del.mutate('],
  ];
  for (const [file, call] of MUST_REPORT) {
    const src = strip(read(file));
    const at = src.indexOf(call);
    if (at < 0) {
      problems.push(`${file}: không còn thấy '${call}' — luật này đã lạc mục tiêu, sửa lại`);
      continue;
    }
    /* Walk to the end of the call rather than grepping the file: an `onError`
       belonging to a *different* mutation on the same screen would satisfy a
       whole-file grep and prove nothing about this one. */
    let depth = 0;
    let j = at + call.length - 1;
    for (; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (!src.slice(at, j + 1).includes('onError')) {
      problems.push(
        `${file}: '${call}' không có onError — lần dựng lại ngày hỏng sẽ trông y như xoá thành công`,
      );
    }
  }
}

/* ── 4. a failed rebuild must not put a deleted row back on screen ──

   The regression this rule exists for was caused by the fix above.

   These mutations write, then `resyncMealEntry`, then `recomputeDailyLog`. The
   write cannot be undone — the row is gone from the server before the rebuild
   even starts. While the rebuild swallowed its errors, `onError` almost never
   ran for that reason; now that it throws, an unconditional rollback restores
   the pre-delete snapshot and the food *reappears*, next to an error, until
   `onSettled` refetches and it vanishes again.

   Deleted → gone → back with an error → gone. So the rollback has to know which
   step failed, and the only durable way to tell is the error's own type. */
{
  const src = strip(read('src/hooks/use-nutrition.ts'));

  if (!src.includes('DailyLogRebuildError')) {
    problems.push(
      'src/hooks/use-nutrition.ts: rollback lạc quan không phân biệt lỗi GHI với lỗi DỰNG LẠI NGÀY — ' +
        'lệnh xoá đã chạy trên server rồi, khôi phục snapshot sẽ làm món ăn đã xoá hiện lại kèm ' +
        'thông báo lỗi, rồi tự biến mất khi refetch',
    );
  }

  /* Every `onError` in this file has to go through the one decision. A second
     unconditional `setQueryData(ctx.key, ctx.previous)` beside it would be the
     same bug back, in a file that already looks fixed. */
  const raw = [...src.matchAll(/setQueryData\(\s*ctx\.key\s*,\s*ctx\.previous\s*\)/g)];
  const guarded = src.includes('function rollbackUnlessRebuilt');
  if (guarded && raw.length > 1) {
    problems.push(
      `src/hooks/use-nutrition.ts: có ${raw.length} chỗ khôi phục snapshot trực tiếp — ` +
        'phải đi qua rollbackUnlessRebuilt, nếu không một chỗ sẽ lại phục hồi dòng đã xoá thật',
    );
  }

  /* And the class has to actually be thrown, or the guard above is a no-op that
     reads like a fix. */
  const svc = strip(read('src/lib/daily-log-service.ts'));
  const thrown = [...svc.matchAll(/throw new DailyLogRebuildError\(/g)].length;
  const plain = [...svc.matchAll(/throw new Error\(/g)].length;
  if (thrown < 2) {
    problems.push(
      `src/lib/daily-log-service.ts: chỉ ${thrown} chỗ ném DailyLogRebuildError — ` +
        'cả nhánh đọc lẫn nhánh ghi đều phải ném đúng lớp đó, nếu không rollback vẫn phục hồi nhầm',
    );
  }
  if (plain > 0) {
    problems.push(
      `src/lib/daily-log-service.ts: còn ${plain} chỗ ném Error thường — ` +
        'chỗ gọi sẽ coi đó là lỗi ghi và hoàn tác một thao tác đã thành công',
    );
  }
}

if (problems.length) {
  console.log('ghi ngày hỏng mà không ai biết:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'ghi daily_logs OK — lệnh upsert hỏng thì NÉM chứ không trả lỗi ra như một giá trị nữa ' +
    '(bản cũ trả `{ error }` và cả 16 chỗ gọi đều bỏ qua, nên vòng calo/macro/điểm sẵn sàng ' +
    'giữ nguyên số trước bữa ăn vĩnh viễn kèm một toast xanh); không chỗ nào hứng kết quả vào biến ' +
    'để lại có thứ mà bỏ qua; chỉ đúng một chỗ được nuốt lỗi — đường phát lại offline, nơi lệnh ghi ' +
    'đã nằm trên server và chạy lại sẽ nhân đôi bản ghi — và nó có lý do viết ngay bên cạnh; ' +
    'và cả 6 màn xoá có dựng lại ngày đều báo được lỗi thay vì trông như đã xoá xong; ' +
    'lỗi dựng-lại-ngày mang lớp riêng (DailyLogRebuildError) và rollback lạc quan bỏ qua nó — ' +
    'nếu không, một lần dựng lại hỏng sẽ đưa món ăn ĐÃ XOÁ THẬT quay lại màn hình kèm thông báo ' +
    'lỗi rồi tự biến mất, tức chính bản sửa "ném thay vì nuốt" đẻ ra lỗi mới',
);
