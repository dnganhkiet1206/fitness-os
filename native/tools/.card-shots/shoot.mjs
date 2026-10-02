/**
 * Chụp thẻ Tập luyện tuần (TodayTraining) ở 4 trạng thái × sáng/tối.
 * Workaround #189: static server + forward proxy để Chromium qua được
 * ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS.
 */
import http from 'node:http';
import path from 'node:path';
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { fakeSupabase } from '../live-server.mjs';
import { FIXTURES, REF, UID, at, jwt } from '../live-world.mjs';

import { fileURLToPath } from 'node:url';
const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(NATIVE, 'tools', '.live-build');
const SHOTS = '/tmp/card-shots';
mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

// Hôm nay: thứ Năm 2026-10-01 → routineIndex = (4+6)%7 = 3
const TODAY_IDX = 3;

const srv = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(OUT, url);
  if (!existsSync(f) || statSync(f).isDirectory()) f = path.join(OUT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((ok) => srv.listen(8732, ok));

const proxy = http.createServer((clientReq, clientRes) => {
  const u = new URL(clientReq.url);
  const fwd = http.request(
    { host: u.hostname, port: +(u.port || 80), path: u.pathname + u.search, method: clientReq.method, headers: { host: u.host } },
    (r) => { clientRes.writeHead(r.statusCode, r.headers); r.pipe(clientRes); },
  );
  fwd.on('error', () => { try { clientRes.writeHead(502); clientRes.end(); } catch {} });
  clientReq.pipe(fwd);
});
await new Promise((ok) => proxy.listen(8897, '127.0.0.1', ok));

function worldFor(state) {
  const world = structuredClone(FIXTURES);
  const rd = world.routine_days.map((r) => ({ ...r }));
  if (state === 'rest') {
    rd[TODAY_IDX] = { ...rd[TODAY_IDX], is_rest: true, template_id: null };
  } else if (state === 'none') {
    rd[TODAY_IDX] = { ...rd[TODAY_IDX], is_rest: false, template_id: null };
  }
  world.routine_days = rd;
  if (state === 'done') {
    world.workout_sessions = [{
      id: 'done-today', user_id: UID, date_time: at(0, '07:30'),
      template_name: 'Push A', template_id: 't1',
    }];
  } else {
    world.workout_sessions = [];
  }
  return world;
}

const session = JSON.stringify({
  access_token: jwt(), refresh_token: jwt(), token_type: 'bearer',
  expires_in: 99999, expires_at: 9999999999,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@ascnd.app', app_metadata: {}, user_metadata: { name: 'Kiệt' }, created_at: '2025-01-01' },
});

const browser = await chromium.launch({ proxy: { server: 'http://127.0.0.1:8897' } });
for (const state of ['planned', 'rest', 'none', 'done']) {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
    await ctx.addInitScript(([ref, sess, th]) => {
      window.localStorage.setItem('sb-' + ref + '-auth-token', sess);
      window.localStorage.setItem('ascnd_lang', 'vi');
      window.localStorage.setItem('ascnd_theme', th);
    }, [REF, session, theme]);
    const page = await ctx.newPage();
    const world = worldFor(state);
    await page.route('**/*.supabase.co/**', fakeSupabase({ world, mode: 'full', report: {} }));
    await page.goto('http://localhost:8732/workouts', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(14000);
    await page.screenshot({ path: `${SHOTS}/${state}-${theme}.png` });
    console.log('shot', state, theme);
    await ctx.close();
  }
}
await browser.close();
srv.close();
proxy.close();
process.exit(0);
