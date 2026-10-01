# Chụp màn hình khi Chromium chặn localhost (workaround #188)

> Ghi chú của C sau #189, để A/B dùng chung. Không sửa `tools/live.mjs`.

## Vấn đề

Chromium 152 chặn truy cập trực tiếp vào localhost
(`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`), nên `live.mjs` không chụp
được màn Community. Mở bundle qua `file://` cũng không boot vì Expo dùng
asset path tuyệt đối (`/_expo/...`).

## Cách vượt (đã kiểm chứng ở #189)

1. Dựng bundle web mới:
   ```bash
   cd native
   npx expo export --platform web --output-dir tools/.live-build --clear
   ```
2. Chạy một static server cho bundle (ví dụ port 8732).
3. Chạy một HTTP forward proxy cục bộ (ví dụ port 8897).
4. Cho Playwright/Chromium đi qua proxy — lúc đó request tới
   `http://localhost:8732` được coi là đi qua proxy nên không bị chặn.

Mẫu tối giản (đã chạy thật, exit 0):

```js
import http from 'http';
import path from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { chromium } from 'playwright';
import { fakeSupabase } from './tools/live-server.mjs';
import { FIXTURES, REF, UID, day, jwt } from './tools/live-world.mjs';

const OUT = path.join('tools', '.live-build');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

// 1. Static server cho bundle
const srv = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(OUT, url);
  if (!existsSync(f) || statSync(f).isDirectory()) f = path.join(OUT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(ok => srv.listen(8732, ok));

// 2. Forward proxy cục bộ
const proxy = http.createServer((clientReq, clientRes) => {
  const u = new URL(clientReq.url);
  const fwd = http.request(
    { host: u.hostname, port: +(u.port || 80), path: u.pathname + u.search, method: clientReq.method, headers: { host: u.host } },
    (r) => { clientRes.writeHead(r.statusCode, r.headers); r.pipe(clientRes); },
  );
  fwd.on('error', () => { try { clientRes.writeHead(502); clientRes.end(); } catch {} });
  clientReq.pipe(fwd);
});
await new Promise(ok => proxy.listen(8897, '127.0.0.1', ok));

// 3. Chromium đi qua proxy
const browser = await chromium.launch({ proxy: { server: 'http://127.0.0.1:8897' } });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
await ctx.addInitScript(([ref, session]) => {
  window.localStorage.setItem('sb-' + ref + '-auth-token', session);
  window.localStorage.setItem('ascnd_lang', 'vi');
}, [REF, JSON.stringify({
  access_token: jwt(), refresh_token: jwt(), token_type: 'bearer',
  expires_in: 99999, expires_at: 9999999999,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@ascnd.app', app_metadata: {}, user_metadata: { name: 'Kiệt' }, created_at: day(400) },
})]);
const page = await ctx.newPage();
const world = structuredClone(FIXTURES);
await page.route('**/*.supabase.co/**', fakeSupabase({ world, mode: 'full', report: {} }));
await page.goto('http://localhost:8732/community', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(12000);
await page.screenshot({ path: '/tmp/shot-community.png' });
await browser.close();
process.exit(0);
```

## Những điều đã làm rõ ở #189 (để khỏi mất công điều tra lại)

- **"Koala đè lên chữ bài tập" không phải bug.** Truy DOM thì đó là
  `KoaCompanion` (`app/_layout.tsx:370`) — mascot nổi có chủ ý, mount trên
  mọi màn hình. Đừng sửa.
- **Tab bar bị cắt chữ ở web là artifact của `NativeTabs` khi render web,**
  trên iOS thật 5 tab vẫn vừa. Đừng file bug từ ảnh web.
- **Mock chưa có `community_find_posts`** (`live-rpc.mjs`) nên chỉ chụp được
  empty state của tìm bài viết, không chụp được lúc có kết quả → #192 (việc B).
  RPC thật đã xanh 17/17 ở #182.
