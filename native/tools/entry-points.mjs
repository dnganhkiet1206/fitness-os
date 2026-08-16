/**
 * Every screen has a door, and at least one door that cannot close.
 *
 * ── the two failures this was written for ──
 *
 * **A room with only vanishing doors.** `/mascot-room` had exactly two ways in:
 * the figure on Today, which renders `null` when the companion switch is off,
 * and the streak chip, which renders `null` until a streak reaches one day.
 * `/shop` and `/challenges` are reachable *only from inside that room*.
 *
 * So turning the companion off — a switch in Settings, with no warning attached
 * — removed the shop, the weekly challenges and the coin balance from the app.
 * The app kept paying coins for daily quests and kept scoring challenges in the
 * background the whole time: a currency with nowhere to spend it and a
 * competition nobody could watch. Same for anybody in their first days, before
 * a streak exists.
 *
 * **A door that opens on the wrong room.** The "Find a food" tile, one of four
 * on the card whose whole job is *four ways to log a meal*, opened
 * `/food-list` — the food **library**. Its search box filters the library, a
 * row opens the nutrition editor, the `+` saves a food into My Foods. Nothing
 * there logs a meal. The tile was not broken in any way a type or a test would
 * notice; it went to a real screen that simply cannot do the thing the tile is
 * named after.
 *
 * ── what is checked, and what deliberately is not ──
 *
 * This cannot know what a screen *does* — that is the second failure, and it is
 * caught by naming the promise explicitly in `PROMISES` below. What it can know
 * is whether a route is referenced from anywhere at all, and whether the
 * references it has are all inside something conditional.
 *
 * A route with no reference is unreachable. A route whose only references sit
 * behind a render gate is reachable *sometimes*, which is worse than
 * unreachable because nobody discovers it by testing on their own account —
 * the tester has a streak and the companion switched on.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const read = (f) => {
  try {
    return readFileSync(path.join(NATIVE, f), 'utf8');
  } catch {
    return '';
  }
};
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

/* ── the routes the app declares ── */
const routes = files
  .filter((f) => /^src\/app\/[^/]+\.tsx$/.test(f))
  .map((f) => '/' + path.basename(f, '.tsx'))
  .filter((r) => r !== '/_layout' && r !== '/+not-found' && r !== '/index');

if (routes.length < 15) {
  problems.push(`chỉ đọc được ${routes.length} route từ src/app — bộ quét hỏng, đừng tin kết quả`);
}

/**
 * Screens with no door of their own, and the reason that is correct.
 *
 * The reason is the point: "it is in the list" is not an argument, and the
 * sentence beside each entry is what a later reader needs in order to decide
 * whether the entry is still true.
 */
const NO_DOOR = new Map([
  ['/koa-debug', 'màn công cụ cho dev, cố ý không có lối vào từ giao diện thường'],
  ['/food-editor', 'mở từ một dòng trong thư viện món — đích của một hàng, không phải một mục menu'],
]);

/**
 * Doors that vanish, and where the door that cannot vanish is instead.
 *
 * A route reachable only through a conditional render is reachable only for
 * people whose account happens to satisfy that condition. Naming the
 * unconditional door here is what makes the guarantee checkable.
 */
const ALWAYS_OPEN = new Map([
  [
    '/mascot-room',
    {
      from: 'src/app/settings.tsx',
      why:
        'hai lối cũ đều biến mất được (hình Koa ẩn khi tắt công tắc, chip chuỗi ẩn khi chuỗi < 1), ' +
        'mà /shop và /challenges chỉ vào được TỪ TRONG phòng này — tắt linh vật là mất luôn ví, ' +
        'cửa hàng và thử thách trong khi app vẫn tiếp tục trả xu',
    },
  ],
]);

/* ── who references each route ── */
const refs = new Map(routes.map((r) => [r, []]));
for (const f of files) {
  if (!/\.tsx?$/.test(f)) continue;
  if (/^src\/app\/[^/]+\.tsx$/.test(f) && f.includes('_layout')) continue;
  const src = strip(read(f));
  for (const r of routes) {
    /* `'/shop'` and `'/shopping'` must not match each other, and a query string
       is still the same route */
    const re = new RegExp(`['"\`]${r}(?:[?][^'"\`]*)?['"\`]`);
    if (re.test(src) && !f.endsWith(`src/app${r}.tsx`)) refs.get(r).push(f);
  }
}

/* ── 1. nothing is unreachable ── */
for (const r of routes) {
  if (refs.get(r).length === 0 && !NO_DOOR.has(r)) {
    problems.push(
      `route '${r}' không có một chỗ nào trong app trỏ tới — nối nó vào, hoặc ghi tên nó vào ` +
        'NO_DOOR trong tools/entry-points.mjs kèm LÝ DO',
    );
  }
}

/* ── 2. the list does not outlive its entries ── */
for (const [r, why] of NO_DOOR) {
  if (!routes.includes(r)) problems.push(`NO_DOOR còn '${r}' nhưng route đó không còn — bỏ dòng đó đi`);
  if (!why || why.length < 20) problems.push(`'${r}' trong NO_DOOR mà lý do quá sơ sài`);
}

/* ── 3. the promised unconditional door is really there ── */
for (const [route, { from, why }] of ALWAYS_OPEN) {
  if (!routes.includes(route)) {
    problems.push(`ALWAYS_OPEN còn '${route}' nhưng route đó không còn — bỏ dòng đó đi`);
    continue;
  }
  if (!why || why.length < 30) problems.push(`'${route}' trong ALWAYS_OPEN mà lý do quá sơ sài`);
  const src = strip(read(from));
  if (!new RegExp(`['"\`]${route}['"\`]`).test(src)) {
    problems.push(
      `'${route}' phải có một lối vào KHÔNG điều kiện ở ${from} và không tìm thấy — ${why}`,
    );
  }
}

/*
  ── 4. and the four ways to log a meal all reach somewhere that logs a meal ──

  The one thing a route graph cannot tell you: `/food-list` is a perfectly real
  screen, and the tile pointing at it was perfectly wired. It just cannot log a
  meal — its search filters the library, its rows open the nutrition editor, its
  `+` saves a food. So the promise is written down here and checked against the
  destinations, because "does this screen do what the button says" has no
  structural signal at all.
*/
{
  const CAN_LOG_A_MEAL = new Set(['/log-meal', '/scan-food', '/scan-barcode']);
  const src = strip(read('src/components/ascnd/meal-log-actions.tsx'));
  const ways = [...src.matchAll(/route:\s*'([^']+)'/g)].map((m) => m[1]);

  if (ways.length < 4) {
    problems.push(`chỉ đọc được ${ways.length} ô trong thẻ "cách ghi bữa ăn" — bộ quét hỏng`);
  }
  for (const w of ways) {
    const base = w.split('?')[0];
    if (!CAN_LOG_A_MEAL.has(base)) {
      problems.push(
        `thẻ "cách ghi bữa ăn" có một ô dẫn tới '${w}', mà màn đó không ghi được bữa ăn nào. ` +
          "Bản đã ship trỏ ô Tìm món vào '/food-list' — màn THƯ VIỆN món: ô tìm ở đó lọc danh sách, " +
          'chạm một dòng mở trình sửa dinh dưỡng, nút + lưu món vào danh sách. Không có đường nào ra một bữa ăn',
      );
    }
  }
  /* and the search tile lands in the search box, or it is one tap better than
     before and still leaves somebody hunting on a busy sheet */
  if (!ways.some((w) => w.includes('focus=search'))) {
    problems.push('ô Tìm món không mở sẵn ô tìm — người bấm "Tìm món" phải thấy con trỏ ở chỗ tìm');
  }
  const meal = strip(read('src/app/log-meal.tsx'));
  if (!/autoFocus=\{focusSearch\}/.test(meal) || !/focus === 'search'/.test(meal)) {
    problems.push('log-meal.tsx không đọc tham số focus — tham số gửi đi mà không ai nhận');
  }
}

if (problems.length) {
  console.log('lối vào màn hình CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
  process.exit(1);
}

console.log(
  `lối vào OK — ${routes.length} màn, mỗi màn đều có chỗ trỏ tới hoặc nằm trong NO_DOOR kèm lý do ` +
    `(${NO_DOOR.size} màn); ${ALWAYS_OPEN.size} màn có lối vào KHÔNG điều kiện được kiểm tận nơi — ` +
    'phòng Koa từng chỉ vào được qua hai cửa đều biến mất được (tắt linh vật, hoặc chuỗi < 1 ngày), ' +
    'mà cửa hàng và thử thách chỉ vào được từ trong phòng đó, nên tắt một công tắc là mất cả ví lẫn ' +
    'thử thách trong khi app vẫn trả xu; và cả 4 ô trong thẻ "cách ghi bữa ăn" đều dẫn tới màn ' +
    "THẬT SỰ ghi được bữa ăn — ô Tìm món từng trỏ vào '/food-list', màn thư viện món, nơi không có " +
    'đường nào ra một bữa ăn',
);
