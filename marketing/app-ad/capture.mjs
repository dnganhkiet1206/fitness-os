/**
 * Chụp màn hình THẬT của app ASCND: đúng bản web dựng từ code của app
 * (`native/tools/.live-build`), dữ liệu mẫu của bộ chạy thử (`live-world.mjs`,
 * Supabase giả của `live-server.mjs`). Không vẽ lại màn nào.
 *
 *   node capture.mjs still /  /nutrition …        → shots/<route>.png
 *   node capture.mjs scroll <route> <frames> <px>  → seq/<name>/0000.png… (cuộn thật từng khung)
 */
import http from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NATIVE = path.resolve(HERE, '../../native');
const OUT = process.env.LIVE_BUILD || path.join(NATIVE, 'tools/.live-build');
const { FIXTURES, REF, UID, day, jwt } = await import(pathToFileURL(path.join(NATIVE, 'tools/live-world.mjs')).href);
const { fakeSupabase } = await import(pathToFileURL(path.join(NATIVE, 'tools/live-server.mjs')).href);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || execSync('npm root -g').toString().trim() + '/playwright');

const PORT = 8741;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(OUT, url);
  if (!existsSync(f) || statSync(f).isDirectory()) {
    const asHtml = path.join(OUT, url.replace(/\/$/, '') + '.html');
    f = existsSync(asHtml) ? asHtml : path.join(OUT, 'index.html');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((ok) => server.listen(PORT, ok));

const W = 402, H = 874, DPR = 2.5;
/* Giờ địa phương 14:00 như bộ chạy thử (live.mjs): chụp lúc nửa đêm thì Koa ở biểu cảm buồn ngủ, mắt nhắm. */
const OFF = Math.round(Number(process.env.HOUR || 14) - (new Date().getUTCHours() + new Date().getUTCMinutes() / 60));
const TZ = OFF === 0 ? 'UTC' : `Etc/GMT${OFF > 0 ? '-' : '+'}${Math.abs(OFF)}`;
const browser = await chromium.launch();
async function open(route) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, timezoneId: TZ, locale: 'vi-VN' });
  await ctx.addInitScript(([ref, session, theme]) => {
    localStorage.setItem('ascnd_lang', 'vi');
    localStorage.setItem('ascnd_theme', theme);
    localStorage.setItem(`sb-${ref}-auth-token`, session);
  }, [REF, JSON.stringify({
    access_token: jwt(), refresh_token: 'r', token_type: 'bearer', expires_in: 86400 * 30, expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
    user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@ascnd.app', app_metadata: {}, user_metadata: { name: 'Kiệt' }, created_at: day(400) },
  }), process.env.THEME || 'light']);
  const page = await ctx.newPage();
  const world = structuredClone(FIXTURES);
  /* MORNING=1: buổi sáng đã ăn mà chưa tập — Koa ở trạng thái bình thường, mắt mở
     (moodFrom: có bữa + đã tập = 'happy' → cười híp mắt). Chỉ sửa hàng daily_logs mới nhất. */
  if (process.env.MORNING && world.daily_logs?.length) {
    const last = world.daily_logs.reduce((a, b) => (String(a.date) > String(b.date) ? a : b));
    last.workout_count = 0;
  }
  await page.route('**/*.supabase.co/**', fakeSupabase({ world, mode: 'full', report: {} }));
  await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(Number(process.env.SETTLE || 9000));
  /* Thanh tab chỉ có trên bản web (bộ đo) — iOS dùng thanh tab gốc của hệ thống, web không vẽ được. Ẩn nó. */
  await page.addStyleTag({ content: '#harness-tabs{display:none!important}' });
  await page.waitForTimeout(600);
  return { ctx, page };
}
/* Vùng cuộn chính: phần tử cuộn được lớn nhất đang hiện. */
const scroller = (page) => page.evaluateHandle(() => {
  let best = null, h = 0;
  for (const el of document.querySelectorAll('div')) {
    if (!el.checkVisibility() || !/auto|scroll/.test(getComputedStyle(el).overflowY)) continue;
    const r = el.scrollHeight - el.clientHeight;
    if (r > h) { h = r; best = el; }
  }
  return best;
});

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'still') {
  mkdirSync(path.join(HERE, process.env.SHOTS || 'shots'), { recursive: true });
  for (const route of rest) {
    const { ctx, page } = await open(route);
    const name = (route === '/' ? 'today' : route.replace(/^\//, '').replace(/[/?=&]/g, '_')) + (process.env.THEME === 'dark' ? '-dark' : '');
    await page.screenshot({ path: path.join(HERE, process.env.SHOTS || 'shots', name + '.png') });
    const sc = await scroller(page);
    const room = sc.asElement() ? await sc.evaluate((el) => el.scrollHeight - el.clientHeight) : 0;
    console.log(name, 'cuộn được', Math.round(room), 'px');
    await ctx.close();
  }
} else if (mode === 'probe') {
  const [route] = rest;
  const { ctx, page } = await open(route);
  const [x, y] = rest.slice(1).map(Number);
  console.log(JSON.stringify(await page.evaluate(([x, y]) => document.elementsFromPoint(x, y).slice(0, 8).map((e) => ({ tag: e.tagName, bg: getComputedStyle(e).backgroundColor, op: getComputedStyle(e).opacity, tr: getComputedStyle(e).transform, w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })), [x, y]), null, 0));
  await ctx.close();
} else if (mode === 'eyes') {
  const { ctx, page } = await open(rest[0]);
  console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('ellipse')].filter((e) => e.getAttribute('rx') === '19' && e.getAttribute('ry') === '25').map((e) => ({ fill: e.getAttribute('fill'), cx: e.getAttribute('cx'), ptf: e.parentElement.getAttribute('transform'), ptfs: getComputedStyle(e.parentElement).transform, n: document.querySelectorAll('ellipse').length })))));
  await ctx.close();
} else if (mode === 'rest') {
  /* tick một set ở Kế hoạch ngày để mở đồng hồ nghỉ, chụp vài mốc */
  const { ctx, page } = await open('/workouts/plan');
  const box = page.getByRole('checkbox').filter({ visible: true });
  console.log('ô tick:', await box.count());
  await box.first().click();
  mkdirSync(path.join(HERE, 'probe-rest'), { recursive: true });
  if (process.env.SHORTEN) {
    const minus = page.locator('[aria-label="Nghỉ −15"]');
    await page.waitForTimeout(700);
    for (let k = 0; k < 5; k++) { await minus.first().click({ timeout: 5000 }); await page.waitForTimeout(150); }
  }
  for (const [i, w] of (process.env.SHORTEN ? [[2, 8600], [3, 4300], [4, 500], [5, 500], [6, 500], [7, 500], [8, 500], [9, 500], [10, 500], [11, 500]] : [[0, 900], [1, 1500]])) {
    await page.waitForTimeout(w);
    await page.screenshot({ path: path.join(HERE, 'probe-rest', `rest-${process.env.THEME || 'light'}-${i}.png`) });
  }
  await ctx.close();
} else if (mode === 'burst') {
  /* nhiều khung liên tiếp của một màn đứng yên — để chọn khung Koa mở mắt */
  const [route, count, gap, name] = rest;
  const dir = path.join(HERE, 'burst', name);
  mkdirSync(dir, { recursive: true });
  const { ctx, page } = await open(route);
  for (let i = 0; i < Number(count); i++) {
    await page.screenshot({ path: path.join(dir, String(i).padStart(3, '0') + '.png') });
    await page.waitForTimeout(Number(gap));
  }
  console.log(name, count, 'khung');
  await ctx.close();
} else if (mode === 'scroll') {
  const [route, frames, px, name] = rest;
  const dir = path.join(HERE, 'seq', name);
  mkdirSync(dir, { recursive: true });
  const { ctx, page } = await open(route);
  const sc = await scroller(page);
  const n = Number(frames), dist = Number(px);
  /* Cuộn theo đường cong êm (ease-in-out) — mỗi khung đặt scrollTop rồi chụp. */
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    await sc.evaluate((el, y) => { el.scrollTop = y; }, dist * e);
    await page.waitForTimeout(40);
    await page.screenshot({ path: path.join(dir, String(i).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 92 });
  }
  console.log(name, n, 'khung');
  await ctx.close();
}
await browser.close();
server.close();
