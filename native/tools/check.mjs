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

const STEPS = [
  ['kiểu dữ liệu', 'npx', ['tsc', '--noEmit']],
  ['worklet', 'node', ['tools/koa-studio/worklets.mjs']],
  ['ngân sách vẽ', 'node', ['tools/koa-studio/budget.mjs']],
  ['camera shop', 'node', ['tools/shop-camera.mjs']],
];

let failed = 0;
for (const [label, cmd, args] of STEPS) {
  process.stdout.write(`${label.padEnd(14)} `);
  try {
    const out = execFileSync(cmd, args, { cwd: NATIVE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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
