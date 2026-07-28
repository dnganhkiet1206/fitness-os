/**
 * The figure clock, driven the way a real screen drives it.
 *
 * This exists because the character froze twice and neither the type
 * checker nor the browser diff could see it: both look at a drawing, and a
 * drawing that never moves looks perfectly correct. The failure was always
 * in time, so this test is about time.
 *
 *   node tools/koa-import/clock.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(path.join(tmpdir(), 'koa-clock-'));
execFileSync('npx', ['esbuild', 'src/components/ascnd/koa/figure-clock.ts', '--format=esm', `--outdir=${out}`], {
  stdio: 'ignore',
});
const { stepClock, CLOCK_RESET } = await import(pathToFileURL(path.join(out, 'figure-clock.js')));

const FPS = 30;
const FRAME_MS = 1000 / FPS;

/**
 * A stand-in for `useFrameCallback`, faithful to Reanimated's own registry:
 * `setActive(false)` clears `startTime`, so the next activation reports
 * `timeSinceFirstFrame` from 0 again.
 */
function screen() {
  const clock = { value: 0 };
  const last = { value: CLOCK_RESET };
  let wall = 0;
  let startTime = null;
  let on = false;
  return {
    clock,
    activate() {
      on = true;
      startTime = null;
      last.value = CLOCK_RESET; // what the effect does on switching on
    },
    deactivate() {
      on = false;
      startTime = null; // Reanimated does this
    },
    /** run `ms` of wall time at 60Hz */
    run(ms) {
      for (let i = 0; i < Math.round(ms / (1000 / 60)); i++) {
        wall += 1000 / 60;
        if (!on) continue;
        if (startTime === null) startTime = wall;
        stepClock(clock, last, wall - startTime, FRAME_MS);
      }
    },
  };
}

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'LỖI '} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed++;
};

// 1. it runs at all
{
  const s = screen();
  s.activate();
  s.run(1000);
  check('chạy 1s thì đồng hồ tiến ~1s', Math.abs(s.clock.value - 1000) < 60, `được ${s.clock.value.toFixed(0)}ms`);
}

// 2. it throttles to FIGURE_FPS rather than the display's 60
{
  const s = screen();
  s.activate();
  let ticks = 0;
  let prev = 0;
  for (let i = 0; i < 60; i++) {
    s.run(1000 / 60);
    if (s.clock.value !== prev) ticks++;
    prev = s.clock.value;
  }
  check('1s ở 60Hz chỉ nhích ~30 lần', ticks >= 28 && ticks <= 32, `${ticks} lần`);
}

// 3. THE REGRESSION: blur, then focus again. `timeSinceFirstFrame` restarts
//    at 0 while the clock has already accumulated a minute.
{
  const s = screen();
  s.activate();
  s.run(60000);
  const before = s.clock.value;
  s.deactivate();
  s.run(5000); // off-screen: nothing should move
  const paused = s.clock.value;
  s.activate();
  s.run(2000);
  check('rời màn hình thì đồng hồ dừng', paused === before, `${before.toFixed(0)} → ${paused.toFixed(0)}`);
  check(
    'quay lại màn hình thì đồng hồ CHẠY TIẾP',
    s.clock.value - paused > 1900,
    `chỉ tiến ${(s.clock.value - paused).toFixed(0)}ms sau khi quay lại — nhân vật đứng hình`,
  );
  check('và nó đi tiếp chứ không nhảy về 0', s.clock.value > before, `${s.clock.value.toFixed(0)} vs ${before.toFixed(0)}`);
}

// 4. many cycles, the way a tab bar is actually used
{
  const s = screen();
  let expected = 0;
  for (let i = 0; i < 20; i++) {
    s.activate();
    s.run(3000);
    expected += 3000;
    s.deactivate();
    s.run(3000);
  }
  check('20 vòng rời/quay lại vẫn cộng dồn đúng', Math.abs(s.clock.value - expected) < 20 * 60,
    `${s.clock.value.toFixed(0)} vs ~${expected}`);
}

console.log(failed ? `\n${failed} phép kiểm HỎNG` : '\ntất cả phép kiểm đạt');
process.exit(failed ? 1 : 0);
