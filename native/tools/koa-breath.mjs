/**
 * Koa, actually breathing — measured in a browser rather than read in a file.
 *
 *   node tools/koa-breath.mjs           build, then watch the figure for 30s
 *   node tools/koa-breath.mjs --no-build   reuse the bundle live.mjs left behind
 *
 * ── why this is not `tools/koa-idle.mjs` ──
 *
 * That one runs the *rules* and reads the widget's source. Both are static, and
 * the bug they were written for is not: the character used to fire a random
 * quirk — including a full 360° flip — every six to fourteen seconds, and the
 * only way to be sure that has stopped is to sit and watch for longer than the
 * longest gap between two of them.
 *
 * A grep for `setTimeout` proves the shape is gone from one file. Thirty
 * seconds of samples prove the *behaviour* is gone from the running app, which
 * is a different claim and the one worth making.
 *
 * ── what it measures ──
 *
 * The figure's own transform, sampled four times a second:
 *
 *   · **rotateY** — the flip. Must never leave zero on its own. This is the
 *     assertion; everything else is description.
 *   · **translateY** — the breath. Its range says how deep, and the gap between
 *     turning points says how slow, which is what `presenceMotion` claims to
 *     control.
 *
 * Two runs, at two different hours of the day, because a single run cannot tell
 * "the state drives the motion" from "the motion happens to be this". Late at
 * night Koa should be asleep and nearly still; in the afternoon it should
 * breathe about twice as fast. The clock is moved by overriding `Date` before
 * the app boots — the emotion is derived from `new Date().getHours()`, so that
 * is the whole of what a different time of day means to this code.
 *
 * ── and what it cannot see ──
 *
 * The same limits `live.mjs` documents: this is a web bundle in a headless
 * browser, so it is a check on logic and state and on nothing else. Layout and
 * platform chrome seen here are noise. What carries over to a phone is exactly
 * this: whether a timer moves the character, and whether the state changes the
 * numbers.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIXTURES, REF, UID, day, jwt } from './live-world.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(NATIVE, 'tools', '.live-build');
const PORT = 8734;
const noBuild = process.argv.includes('--no-build');
const problems = [];

/* One world, imported. The first draft copied the project reference and the
   user id across from `live.mjs` by hand and got the reference wrong, so the
   app rejected the seeded session and every boot landed on the Sign In screen
   — a tool measuring a login form while reporting on a mascot. See
   `tools/live-world.mjs`. */
function build() {
  if (noBuild) {
    if (!existsSync(path.join(OUT, 'index.html'))) {
      console.error(`--no-build nhưng chưa có bản dựng ở ${OUT} — chạy tools/live.mjs trước`);
      process.exit(2);
    }
    return;
  }
  process.stdout.write('dựng bundle web… ');
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', OUT, '--clear'], {
    cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log('xong');
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
};
function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let f = path.join(OUT, url);
    /* The single-page fallback, without which every client-side route hands
       back a 404 page that a text scan happily calls healthy — the mistake
       `live.mjs` records having made. */
    if (!existsSync(f) || statSync(f).isDirectory()) f = path.join(OUT, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(PORT, () => ok(server)));
}

/** Watch the figure for `seconds`, with the app believing it is `hour` o'clock. */
async function watch(chromium, hour, seconds) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });

  await ctx.addInitScript(
    ([ref, session, atHour]) => {
      window.localStorage.setItem(`sb-${ref}-auth-token`, session);
      /* Move the clock, and only the clock. `getHours` is the entire input the
         emotion engine takes from the time of day, so overriding it is a
         smaller lie than faking a whole timezone — and it leaves every duration
         and every `Date.now()` in Reanimated untouched, which is the thing
         being measured. */
      Date.prototype.getHours = function () {
        return atHour;
      };
    },
    [REF, JSON.stringify({
      access_token: jwt(), refresh_token: 'r', token_type: 'bearer',
      expires_in: 86400 * 30, expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
      user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@ascnd.app',
              app_metadata: {}, user_metadata: { name: 'Kiệt' }, created_at: day(400) },
    }), hour],
  );

  const page = await ctx.newPage();
  await page.route('**/*.supabase.co/**', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/rest/v1/')) {
      const table = u.pathname.split('/')[3];
      const rows = FIXTURES[table] ?? [];
      const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(single ? (rows[0] ?? null) : rows) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', role: 'authenticated' }) });
  });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);

  /*
    Find the figure by what it is rather than by a test id.

    The widget draws an SVG inside a 64pt square carrying the animated
    transform, and that transform opens with `perspective(320)` — so it is the
    only element on the page whose computed transform is a **3D** matrix. Every
    other transformed ancestor of an SVG up there is a `PressScale` button,
    which is a flat `scale` and comes out as a 2D `matrix(...)`.

    Discriminating on that rather than on a test id keeps an attribute whose
    only reader would be this file out of the app — and the first draft, which
    took "the nearest transformed ancestor of any svg above 30px", found a
    header icon button instead, because the header is drawn first.
  */
  const found = await page.evaluate(() => {
    for (const svg of document.querySelectorAll('svg')) {
      let el = svg.parentElement;
      for (let up = 0; up < 6 && el; up++, el = el.parentElement) {
        const t = getComputedStyle(el).transform;
        if (!t.startsWith('matrix3d')) continue;
        const b = el.getBoundingClientRect();
        if (b.width > 40 && b.width < 200 && b.height > 40) {
          el.setAttribute('data-koa-watch', '1');
          return { w: Math.round(b.width), h: Math.round(b.height) };
        }
      }
    }
    return null;
  });
  if (!found) {
    await browser.close();
    return { hour, samples: [], found: null };
  }

  const samples = await page.evaluate(async (ms) => {
    const el = document.querySelector('[data-koa-watch]');
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      /* `m.m32` is the y translation and `m.m13` carries the rotateY through
         the 3D matrix — a flip cannot happen without moving it off zero. */
      out.push({ t: Math.round(performance.now() - t0), y: m.m42, ry: m.m13 });
      await new Promise((r) => setTimeout(r, 250));
    }
    return out;
  }, seconds * 1000);

  await browser.close();
  return { hour, samples, found };
}

/** Peak-to-peak travel, and the mean gap between turning points. */
function describe(samples) {
  const ys = samples.map((s) => s.y);
  const range = Math.max(...ys) - Math.min(...ys);
  const turns = [];
  for (let i = 1; i < ys.length - 1; i++) {
    /* A turning point only counts if it actually turned by something the eye
       could see; float noise around a still figure would otherwise read as a
       very fast breath. */
    if (Math.abs(ys[i] - ys[i - 1]) < 0.05 && Math.abs(ys[i + 1] - ys[i]) < 0.05) continue;
    if ((ys[i] - ys[i - 1]) * (ys[i + 1] - ys[i]) < 0) turns.push(samples[i].t);
  }
  const gaps = turns.slice(1).map((t, i) => t - turns[i]);
  const period = gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length) * 2 : 0;
  const spin = Math.max(...samples.map((s) => Math.abs(s.ry)));
  return { range, period: Math.round(period), spin, n: samples.length };
}

const require_ = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require_('playwright'));
} catch {
  console.error('không nạp được playwright — thử: NODE_PATH=$(npm root -g) node tools/koa-breath.mjs');
  process.exit(2);
}

build();
const server = await serve();
try {
  /* Thirty-five seconds: longer than the longest gap the old quirk timer could
     produce (14s), so "no flip happened" is a statement about the mechanism and
     not about having been lucky. */
  const noon = await watch(chromium, 14, 35);
  const night = await watch(chromium, 23, 35);

  for (const run of [noon, night]) {
    if (!run.found) problems.push(`không tìm thấy hình Koa trên màn hình lúc ${run.hour}h`);
    else if (run.samples.length < 60) problems.push(`chỉ lấy được ${run.samples.length} mẫu lúc ${run.hour}h`);
  }

  if (problems.length === 0) {
    const d = { noon: describe(noon.samples), night: describe(night.samples) };
    console.log(`  14h  biên độ ${d.noon.range.toFixed(2)}px  chu kỳ ~${d.noon.period}ms  xoay tối đa ${d.noon.spin.toFixed(3)}  (${d.noon.n} mẫu)`);
    console.log(`  23h  biên độ ${d.night.range.toFixed(2)}px  chu kỳ ~${d.night.period}ms  xoay tối đa ${d.night.spin.toFixed(3)}  (${d.night.n} mẫu)`);

    /* ── the assertion this file exists for ── */
    for (const [name, r] of [['14h', d.noon], ['23h', d.night]]) {
      if (r.spin > 0.02) {
        problems.push(`${name}: nhân vật TỰ xoay (rotateY tới ${r.spin.toFixed(3)}) — cú lộn theo hẹn giờ vẫn còn`);
      }
    }
    /* And that the state is what sets the pace. Asleep must be visibly slower
       and shallower than awake, or `presenceMotion` is a table nobody reads. */
    if (!(d.night.range < d.noon.range)) {
      problems.push(`ban đêm thở sâu bằng hoặc hơn ban ngày (${d.night.range.toFixed(2)} ≥ ${d.noon.range.toFixed(2)})`);
    }
    if (d.noon.period > 0 && d.night.period > 0 && !(d.night.period > d.noon.period * 1.2)) {
      problems.push(`ban đêm không thở chậm hơn hẳn ban ngày (${d.night.period}ms vs ${d.noon.period}ms)`);
    }
  }
} finally {
  server.close();
}

if (problems.length) {
  console.log('\nnhịp thở thật của Koa:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log('\nnhịp thở thật OK — 35 giây liên tục ở hai thời điểm trong ngày, không lần nào nhân vật tự xoay;\nban đêm thở nông hơn và chậm hơn ban ngày, đúng như presenceMotion nói');
