import http from 'node:http';
import path from 'node:path';
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { fakeSupabase } from '../live-server.mjs';
import { FIXTURES, REF, UID, at, jwt } from '../live-world.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(NATIVE, 'tools', '.live-build');
const SHOTS = '/tmp/card-shots';
mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const TODAY_IDX = 3;

const srv = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(OUT, url);
  if (!existsSync(f) || statSync(f).isDirectory()) f = path.join(OUT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((ok) => srv.listen(8734, ok));
const proxy = http.createServer((clientReq, clientRes) => {
  const u = new URL(clientReq.url);
  const fwd = http.request(
    { host: u.hostname, port: +(u.port || 80), path: u.pathname + u.search, method: clientReq.method, headers: { host: u.host } },
    (r) => { clientRes.writeHead(r.statusCode, r.headers); r.pipe(clientRes); },
  );
  fwd.on('error', () => { try { clientRes.writeHead(502); clientRes.end(); } catch {} });
  clientReq.pipe(fwd);
});
await new Promise((ok) => proxy.listen(8899, '127.0.0.1', ok));

const session = JSON.stringify({
  access_token: jwt(), refresh_token: jwt(), token_type: 'bearer',
  expires_in: 99999, expires_at: 9999999999,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@ascnd.app', app_metadata: {}, user_metadata: { name: 'Kiệt' }, created_at: '2025-01-01' },
});
const browser = await chromium.launch({ proxy: { server: 'http://127.0.0.1:8899' } });

async function shot(name, theme, worldFn, url) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
  await ctx.addInitScript(([ref, sess]) => {
    window.localStorage.setItem('sb-' + ref + '-auth-token', sess);
    window.localStorage.setItem('ascnd_lang', 'vi');
    window.localStorage.setItem('ascnd_theme', theme);
  }, [REF, session]);
  const page = await ctx.newPage();
  const world = structuredClone(FIXTURES);
  worldFn(world);
  await page.route('**/*.supabase.co/**', fakeSupabase({ world, mode: 'full', report: {} }));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(14000);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log('shot', name);
  await ctx.close();
}

// Ngày nghỉ THẬT (is_rest=true): badge phải vẫn tím "Nghỉ ngơi", icon trăng
await shot('plan-rest215', 'light', (w) => {
  const rd = w.routine_days.map((r) => ({ ...r }));
  rd[TODAY_IDX] = { ...rd[TODAY_IDX], is_rest: true, template_id: null };
  w.routine_days = rd;
  w.workout_sessions = [];
}, 'http://localhost:8734/workouts/plan?day=3');

// Ngày trống, dark mode
await shot('plan-unplanned215-dark', 'dark', (w) => {
  const rd = w.routine_days.map((r) => ({ ...r }));
  rd[TODAY_IDX] = { ...rd[TODAY_IDX], is_rest: false, template_id: null };
  w.routine_days = rd;
  w.workout_sessions = [];
}, 'http://localhost:8734/workouts/plan?day=3');

// Thẻ Today (tab chính) ngày trống: dot hôm nay phải xám, không tím
await shot('today-none215', 'light', (w) => {
  const rd = w.routine_days.map((r) => ({ ...r }));
  rd[TODAY_IDX] = { ...rd[TODAY_IDX], is_rest: false, template_id: null };
  w.routine_days = rd;
  w.workout_sessions = [];
}, 'http://localhost:8734/workouts');

await browser.close();
srv.close();
proxy.close();
process.exit(0);
