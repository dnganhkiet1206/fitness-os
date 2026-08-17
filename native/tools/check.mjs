/**
 * One command that proves the room is sound.
 *
 *   node tools/check.mjs
 *
 * ── why this exists ──
 *
 * It exists because of a wasted half hour that looked like a broken toolchain
 * and was not one.
 *
 * The repository root is the project's **previous life**: a Vite web app whose
 * `src/` is long gone but whose `tsconfig.json` is still there, still carrying
 * a deprecated `baseUrl` and still pointing `@/*` at a directory that does not
 * exist. The app is `native/`, with its own Expo tsconfig. Run `npx tsc` with
 * the working directory drifted one level up — which `cd`-ing to the repo root
 * for a `git` command is enough to do — and you get
 *
 *     tsconfig.json(5,5): error TS5101: Option 'baseUrl' is deprecated
 *
 * from a config the app has nothing to do with, and it reads exactly like the
 * app's own build breaking. It is not. Nothing was wrong.
 *
 * So the first thing this does is **refuse to run from anywhere else**. A check
 * whose result depends on where you were standing is not a check, and the fix
 * for that class of mistake is to make the mistake impossible rather than to
 * remember not to make it.
 *
 * ── what it runs ──
 *
 * Only the checks that *assert* — the ones with a right answer and a non-zero
 * exit. The tools that draw pictures (`preview`, `gaze`, `weather`, `bugs`,
 * `wardrobe`) are for looking at and are not run here; a screenshot nobody
 * opens proves nothing.
 *
 * ── what this cannot see, and what does ──
 *
 * Everything here reads the code. That is a real limit rather than a
 * theoretical one: three bugs shipped past a green run of this suite, and each
 * needed the app to actually run before it was visible.
 *
 *   - Sign In did nothing when a field was blank — an early `return` is
 *     ordinary code and no rule here has an opinion about it.
 *   - Twelve `isError` branches were unreachable, because the query functions
 *     below them swallowed the error and resolved successfully.
 *   - One failing query blanked the entire app for ever.
 *
 *     node tools/live.mjs
 *
 * builds a web bundle, boots every screen in a headless browser against a fake
 * server in three states, and asserts. It is deliberately not a step below: it
 * takes minutes, and a suite people stop running is worth less than a slower
 * one they run on purpose. Run it before anything ships.
 *
 *     node tools/koa-breath.mjs
 *
 * is the same idea pointed at one thing that only exists over time: it watches
 * the character's own transform for thirty-five seconds at two hours of the
 * day. It found what every rule here missed — the breath taking its *pace* from
 * the state while its *depth* stayed the literal the file shipped with, so
 * asleep and wide awake both rose exactly seven points.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.cwd() !== NATIVE) {
  console.error(
    `chạy từ ${process.cwd()}\n` +
      `phải chạy từ ${NATIVE}\n\n` +
      'Thư mục gốc của repo có một tsconfig.json cũ từ bản web Vite — nó vẫn\n' +
      'còn `baseUrl` đã bị bỏ và trỏ `@/*` vào ./src, thứ không còn tồn tại.\n' +
      'Chạy tsc ở đó sẽ báo TS5101 và trông y như app hỏng.',
  );
  process.exit(2);
}
if (!existsSync(path.join(NATIVE, 'app.json'))) {
  console.error('không thấy app.json — đây không phải thư mục app');
  process.exit(2);
}

/**
 * `budget.mjs` rasterises the room in a browser, and Playwright is not a
 * dependency of this app — it is whatever the machine happens to have. When it
 * is installed globally rather than in `node_modules`, `createRequire` inside
 * the tool cannot see it and the step dies with a bare `MODULE_NOT_FOUND`
 * stack, which reads exactly like the room being broken and is nothing of the
 * kind. Same class of mistake as the `tsconfig.json` above: the check failing
 * for a reason that has nothing to do with what it checks.
 *
 * So the global root is put on `NODE_PATH` when the local one has no
 * Playwright. If neither has it the step still fails, but it fails saying so.
 */
const env = { ...process.env };
if (!existsSync(path.join(NATIVE, 'node_modules', 'playwright'))) {
  try {
    const global = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    if (existsSync(path.join(global, 'playwright'))) {
      env.NODE_PATH = env.NODE_PATH ? `${env.NODE_PATH}:${global}` : global;
    }
  } catch {
    // leave NODE_PATH alone; the step below will say what is missing
  }
}

const STEPS = [
  /*
    First, because `tsc` is downstream of it.

    `router.d.ts` is written by the dev server and gitignored, so on any
    checkout where `expo start` has not run since a page was added, typed
    routes report a perfectly good `router.push('/templates')` as an error
    listing 157 other routes. That reads exactly like a routing mistake and is
    a stale generated file — the same class as the tsconfig above.
  */
  ['route đã sinh', 'node', ['tools/typed-routes.mjs']],
  ['lối vào', 'node', ['tools/reachable.mjs']],
  ['kiểu dữ liệu', 'npx', ['tsc', '--noEmit']],
  /*
    Early, and right after `tsc`, because it catches a class `tsc` cannot see
    at all: a string rendered outside `<Text>`. That is legal TypeScript and a
    hard crash at runtime, and the stack RN prints for it names no file in this
    app — so without this step the only way to find one is to open every screen.
  */
  ['chữ ngoài Text', 'node', ['tools/stray-text.mjs']],
  ['cửa sổ ngày', 'node', ['tools/day-window.mjs']],
  ['backend', 'node', ['tools/backend-config.mjs']],
  ['vùng chạm', 'node', ['tools/tap-targets.mjs']],
  ['kinh tế', 'node', ['tools/economy.mjs']],
  ['lỗi edge', 'node', ['tools/edge-failure.mjs']],
  ['worklet', 'node', ['tools/koa-studio/worklets.mjs']],
  ['ánh sáng nền', 'node', ['tools/ambient.mjs']],
  ['trục nước', 'node', ['tools/water-scale.mjs']],
  ['đường cân nặng', 'node', ['tools/curve.mjs']],
  ['nhóm cơ', 'node', ['tools/muscle-map.mjs']],
  ['nghỉ/gắng sức', 'node', ['tools/prescription.mjs']],
  ['tuần tập', 'node', ['tools/week.mjs']],
  ['bố cục Today', 'node', ['tools/widgets.mjs']],
  ['khẩu phần', 'node', ['tools/servings.mjs']],
  ['ăn lại bữa', 'node', ['tools/repeat-meal.mjs']],
  ['nhắc nhở', 'node', ['tools/reminders.mjs']],
  ['bữa đã ghi', 'node', ['tools/planned-meal.mjs']],
  ['vòng hoạt động', 'node', ['tools/activity.mjs']],
  ['đối chiếu tập', 'node', ['tools/day-progress.mjs']],
  ['nhắc trợ giúp', 'node', ['tools/help-nudge.mjs']],
  ['thẻ tập luyện', 'node', ['tools/training-card.mjs']],
  ['ẩn thanh tab', 'node', ['tools/tab-bar-hide.mjs']],
  ['thang chữ', 'node', ['tools/type-scale.mjs']],
  ['hình huy hiệu', 'node', ['tools/glyph-collision.mjs']],
  ['ngôn ngữ AI', 'node', ['tools/ai-language.mjs']],
  ['worklet đo được', 'node', ['tools/measured-worklet.mjs']],
  ['giọng linh vật', 'node', ['tools/mascot-voice.mjs']],
  ['bàn phím', 'node', ['tools/keyboard.mjs']],
  ['đọc trên kính', 'node', ['tools/glass-legibility.mjs']],
  ['gợi ý trợ lý', 'node', ['tools/suggestions.mjs']],
  ['lời tóm tắt', 'node', ['tools/brief.mjs']],
  ['phân tích chỉ số', 'node', ['tools/metric-analysis.mjs']],
  ['insight hôm nay', 'node', ['tools/insight.mjs']],
  ['trò chuyện coach', 'node', ['tools/coach-chat.mjs']],
  ['chi phí aura', 'node', ['tools/aura-cost.mjs']],
  ['luật chuyển động', 'node', ['tools/motion.mjs']],
  ['nguồn sức khoẻ', 'node', ['tools/health-source.mjs']],
  ['quyền kinh tế', 'node', ['tools/economy-authority.mjs']],
  ['trí nhớ coach', 'node', ['tools/coach-memory.mjs']],
  ['quyền lợi gói', 'node', ['tools/entitlement.mjs']],
  ['sửa sai được', 'node', ['tools/correctable.mjs']],
  ['rỗng ≠ hỏng', 'node', ['tools/empty-vs-failed.mjs']],
  ['hợp lý sinh lý', 'node', ['tools/plausible.mjs']],
  ['mục tiêu dinh dưỡng', 'node', ['tools/nutrition-targets.mjs']],
  ['TDEE thích ứng', 'node', ['tools/adaptive-tdee.mjs']],
  ['sẵn sàng deploy', 'node', ['tools/deployable.mjs']],
  ['ghi khi mất mạng', 'node', ['tools/offline-durable.mjs']],
  /*
    `offline-durable.mjs` proves the queue works, and every one of its rules is
    about a call site that *already uses* the key. Three things it therefore
    cannot see, all of which had shipped: a screen that finishes a workout with
    no durable path at all (the week's day panel — the one people tick sets on
    while training); an offline branch outside the button's double-submit guard,
    so a second tap during the dismiss animation queues the same session twice;
    and a replay whose verb differs from the online write it exists to repeat —
    `insert` into a table the online path upserts, refused by every day that
    already has a row, inside `resumePausedMutations` where no screen hears it.
  */
  ['gửi khi mất mạng', 'node', ['tools/offline-submit.mjs']],
  ['ngân sách ảnh', 'node', ['tools/photo-budget.mjs']],
  ['dịch thuật', 'node', ['tools/i18n.mjs']],
  ['dải trạng thái', 'node', ['tools/status-scrim.mjs']],
  ['ngân sách vẽ', 'node', ['tools/koa-studio/budget.mjs']],
  ['camera shop', 'node', ['tools/shop-camera.mjs']],
  ['tư thế mặc đồ', 'node', ['tools/koa-studio/dress.mjs']],
  ['peek sau thẻ', 'node', ['tools/peek.mjs']],
  ['chuỗi ngày', 'node', ['tools/streak.mjs']],
  ['khuôn mặt', 'node', ['tools/mascot-face.mjs']],
  ['mô hình cá nhân', 'node', ['tools/personalize.mjs']],
  ['icon tô đặc', 'node', ['tools/icon-fill.mjs']],
  ['quyết định Koa', 'node', ['tools/koa-decide.mjs']],
  ['trạng thái người dùng', 'node', ['tools/user-state.mjs']],
  ['thưởng thử thách', 'node', ['tools/challenge-reward.mjs']],
  ['lối vào màn hình', 'node', ['tools/entry-points.mjs']],
  ['ngày của lệnh ghi', 'node', ['tools/write-day.mjs']],
  ['hiệu ứng focus', 'node', ['tools/focus-effects.mjs']],
  ['lệnh ghi xác nhận', 'node', ['tools/write-confirmed.mjs']],
  ['tải buổi tập', 'node', ['tools/session-load.mjs']],
  ['mục tiêu → tập luyện', 'node', ['tools/goal-training.mjs']],
  ['điều chỉnh tải', 'node', ['tools/load-progression.mjs']],
  ['lệnh ghi có người nghe', 'node', ['tools/write-heard.mjs']],
  ['kỷ lục cá nhân', 'node', ['tools/personal-record.mjs']],
  ['nhịp thở Koa', 'node', ['tools/koa-idle.mjs']],
  ['giờ nhắc nhở', 'node', ['tools/reminder-timing.mjs']],
  ['đã nối chưa', 'node', ['tools/linked.mjs']],
  ['ghi ngày', 'node', ['tools/daily-log-write.mjs']],
  ['bàn giao quét', 'node', ['tools/scan-handoff.mjs']],
  /*
    Reads `supabase/migrations/`, not `src/`. It is here because the bug it was
    written for passed every other check in this file and a real deploy: a
    plpgsql body is not parsed when the function is created, so `FOR UPDATE`
    beside a `SUM` loaded green and raised on every call — the whole shop and
    the streak freeze, dead, with nothing red anywhere.
  */
  ['SQL kinh tế', 'node', ['tools/economy-sql.mjs']],
  /*
    Asks the two questions the other economy rules do not: can this amount get
    past the server's ceiling, and how many ledger rows does one event write.
    `economy-authority.mjs` compares the ceiling only against `CHALLENGE_REWARD`
    (peak exactly 120) so it never saw the 300-coin welcome gift failing, and
    `economy.mjs` prices rewards without counting them, so it never saw a
    finished challenge being paid through two different `ref_key` shapes.
  */
  ['sổ cái thưởng', 'node', ['tools/reward-ledger.mjs']],
  ['cửa sổ giấc ngủ', 'node', ['tools/sleep-window.mjs']],
  /*
    Runs `computeReadiness` for real. Every other assertion about that engine —
    in `training-card.mjs` and `health-source.mjs` — is a transcription of its
    constants, and a copy agrees with itself. This is the app's headline number
    and nothing had ever executed it.
  */
  ['điểm sẵn sàng', 'node', ['tools/readiness.mjs']],
  /*
    Two ways a readiness number said more than it knew. `getACWR(0, 0, …)`
    returns 0, so an account that had never logged a session stored exactly what
    somebody who trained a month and then rested a full week stored — opposite
    states, one value, and the missing one given a numeral. And the score itself
    carried no trace of its own thinness: a 72 built from sleep alone rendered
    identically to a 72 built from four dimensions, on the screen where somebody
    decides whether to train hard today.
  */
  ['độ tin cậy điểm sẵn sàng', 'node', ['tools/readiness-confidence.mjs']],
  /*
    `docs/fitness-scores.md` says, for every number the app shows, what it is
    made of and what it does when the data is missing. Written down those are
    assertions, and a document is the one place here where an assertion has
    never had to be true — a threshold moves in code and the prose goes on
    describing the old behaviour to whoever reads it next. This pulls every
    figure back out of the document and compares it to the value in use.
  */
  ['tài liệu chỉ số', 'node', ['tools/score-doc.mjs']],
  /*
    Sign-out used to clear one of seventeen stored keys. The one that mattered
    most was invisible: a leftover reminder-plan signature makes the scheduler
    exit early, so the *next* account never gets a single notification while
    every switch still reads as on. Nothing about a leftover preference looks
    wrong, which is why this has to be a list somebody maintains rather than a
    thing anybody would notice.
  */
  ['đăng xuất sạch', 'node', ['tools/signed-out.mjs']],
  /*
    invalidateQueries is a filter, so matching nothing is indistinguishable
    from success — no error, no warning, no return value anybody reads. A key
    naming the table instead of the query therefore refreshes nothing and looks
    exactly like a slow network. Two of them had shipped.
  */
  ['khoá invalidate', 'node', ['tools/invalidate-keys.mjs']],
  /*
    A runtime import cycle is the bug that works until it does not: every use
    sits inside a function body, so the modules finish loading before anything
    calls — right up until one module-scope call anywhere in the loop, which
    throws at startup on the slowest device with a stack naming none of the
    files involved. Checks the direction too, since a layer reaching upwards is
    what produces the cycles.
  */
  ['tầng import', 'node', ['tools/layering.mjs']],
  /*
    Two shapes that only misbehave in a corner: a challenge measuring a literal
    while its own label promises "your target", and a week-start expression
    that is right six days out of seven and wrong on Sunday — the day people sit
    down to review their week, and fixed again by Monday morning.
  */
  ['mục tiêu tuần', 'node', ['tools/weekly-targets.mjs']],
  /*
    A table nobody uses does not fail — it accumulates. Two were queried on
    every Today open with nothing ever writing to them, and one of those sat in
    todayKeys so every write in the app refetched an empty table. Same shape as
    linked.mjs: unused must be named, with a reason, somewhere a person edits
    on purpose.
  */
  ['bảng chết', 'node', ['tools/dead-schema.mjs']],
];

let failed = 0;
for (const [label, cmd, args] of STEPS) {
  process.stdout.write(`${label.padEnd(14)} `);
  try {
    const out = execFileSync(cmd, args, { cwd: NATIVE, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    // the last line each of these prints is its verdict
    const last = out.trim().split('\n').filter(Boolean).pop() ?? '';
    console.log(`OK   ${last.trim()}`);
  } catch (e) {
    failed++;
    console.log('HỎNG');
    console.log((e.stdout ?? '') + (e.stderr ?? ''));
  }
}

console.log(failed === 0 ? '\ntất cả đều xanh' : `\n${failed}/${STEPS.length} bước hỏng`);
process.exit(failed === 0 ? 0 : 1);
