/**
 * Đo công việc mỗi khung hình của một màn, và quy trách nhiệm cho từng SVG.
 *
 * ── vì sao tệp này tồn tại ──
 *
 * Người dùng báo ba thứ nghe như ba lỗi rời nhau: vuốt deck giật nhẹ, bấm vào
 * ô nhập cân nặng giật, ghi xong giật liên hồi. Tôi đã đi tìm ba nguyên nhân
 * riêng và trượt cả ba — chiều cao sân khấu (bác bỏ: cả 5 trang đúng 402px),
 * gradient SVG (bác bỏ: cả 5 trang đều dùng), `todayISO()` không ổn định (bác
 * bỏ: nó gọi `localDateStr`).
 *
 * Cái tìm ra nguyên nhân không phải giả thuyết thứ tư mà là một phép đo KHÔNG
 * nhắm vào đâu cả: đếm số lần DOM bị sửa mỗi khung, rồi hỏi ai sửa.
 *
 * ── số đo được, trên Dashboard, LÚC ĐỨNG YÊN ──
 *
 *     13.860 lượt sửa DOM trong 3 giây  ≈ 77 lượt mỗi khung hình
 *     91% đến từ MỘT svg:  54×68 với 26 nhóm <g>  (3% nữa là chính nó ở 54×67)
 *     mọi svg còn lại trên trang:       g=0
 *
 * Đó là mascot (`vector-mascot.tsx`): thở, đung đưa, chớp mắt, tự lên lịch để
 * không lặp đều đặn. Nó có gác `useIsFocused()` nên dừng khi MÀN mất focus,
 * nhưng không dừng khi bị cuộn khuất, không dừng khi đang gõ, không dừng khi
 * đang vuốt.
 *
 * ── vì sao harness không kêu, và vì sao vẫn nên tin con số ──
 *
 * `khung dài = 0`: trên web `<g>` chỉ là một node DOM, đổi `transform` rất rẻ
 * và GPU lo phần còn lại. Trên iOS `react-native-svg` dựng mỗi nhóm thành một
 * lớp Core Animation và cập nhật là VẼ LẠI. Nên "0 khung dài" ở đây không có
 * nghĩa là rẻ trên máy thật — nó chỉ có nghĩa là cái đắt nằm ở chỗ trình duyệt
 * không phải trả tiền.
 *
 * Thứ tệp này đo được và đáng tin là SỐ LƯỢNG công việc, không phải giá của
 * nó. Số lượng thì giống nhau trên cả hai nền.
 *
 * ── trạng thái ──
 *
 * Người dùng đã chọn CHƯA làm gì với mascot. Tệp này không sửa gì; nó ở đây để
 * con số trên tái lập được thay vì phải tin một tin nhắn đã trôi mất.
 *
 *   node tools/frame-churn.mjs                 màn Hôm nay
 *   node tools/frame-churn.mjs --route /nutrition
 *   node tools/frame-churn.mjs --no-build --seconds 5
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(NATIVE, 'tools', '.live-build');
const PORT_BASE = 8752;

const argv = process.argv.slice(2);
const args = new Set(argv);
const route = argv[argv.indexOf('--route') + 1]?.startsWith('/') ? argv[argv.indexOf('--route') + 1] : '/';
const seconds = Number(argv[argv.indexOf('--seconds') + 1]) || 3;

const { FIXTURES, REF, UID, day, jwt } = await import(path.join(NATIVE, 'tools', 'live-world.mjs'));

function loadChromium() {
  for (const root of [path.join(NATIVE, 'node_modules'), execFileSync('npm', ['root', '-g']).toString().trim()]) {
    if (!root || !existsSync(path.join(root, 'playwright'))) continue;
    return createRequire(path.join(root, 'x.js'))('playwright').chromium;
  }
  console.error('không tìm thấy playwright. cài: npm i -g playwright');
  process.exit(2);
}

function build() {
  if (args.has('--no-build')) {
    if (!existsSync(path.join(OUT, 'index.html'))) {
      console.error(`--no-build nhưng chưa có bản dựng ở ${OUT}`);
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
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
};
function serve() {
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
  return new Promise((ok, fail) => {
    let port = PORT_BASE;
    server.on('error', (e) => {
      if (e.code !== 'EADDRINUSE' || port > PORT_BASE + 9) return fail(e);
      server.listen(++port);
    });
    server.on('listening', () => ok({ server, port }));
    server.listen(port);
  });
}

build();
const { server, port } = await serve();
const chromium = loadChromium();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
await ctx.addInitScript(([ref, session]) => {
  window.localStorage.setItem(`sb-${ref}-auth-token`, session);
}, [REF, JSON.stringify({
  access_token: jwt(), refresh_token: 'r', token_type: 'bearer', expires_in: 86400 * 30,
  expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
  user: {
    id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@ascnd.app',
    app_metadata: {}, user_metadata: { name: 'Kiệt' }, created_at: day(400),
  },
})]);
const page = await ctx.newPage();
await page.route('**/*.supabase.co/**', async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.startsWith('/rest/v1/')) {
    const t = u.pathname.split('/')[3];
    const rows = FIXTURES[t] ?? [];
    const one = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(one ? (rows[0] ?? null) : rows) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: UID, aud: 'authenticated', role: 'authenticated' }) });
});

await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(9000);

/* Quy trách nhiệm theo SVG chứa node bị sửa. Không bám vào tên class: bundle
   web sinh tên ngẫu nhiên, và bám vào đó là bám vào thứ đổi mỗi lần dựng. */
await page.evaluate(`
  window.__s = {}; window.__f = []; window.__t0 = performance.now();
  new MutationObserver((ms) => {
    for (const m of ms) {
      let n = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      let svg = n; while (svg && svg.tagName !== 'svg') svg = svg.parentElement;
      let k;
      if (!svg) k = '(ngoài svg)';
      else { const b = svg.getBoundingClientRect();
        /* Khoá KHÔNG kèm toạ độ. Bản đầu có, và nó tách một nguồn duy nhất
           thành sáu dòng — vì thứ churn nhiều nhất là thứ đang DI CHUYỂN, nên
           toạ độ của nó đổi từng khung. Bảng khi đó cho ra sáu dòng 32%, 18%,
           12%… trông như sáu thủ phạm nhỏ, trong khi đó là một thủ phạm 94%. */
        k = Math.round(b.width) + '×' + Math.round(b.height) + '  g=' + svg.querySelectorAll('g').length; }
      window.__s[k] = (window.__s[k] || 0) + 1;
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const tick = () => { window.__f.push(performance.now()); if (performance.now() - window.__t0 < ${seconds * 1000}) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
`);
await page.waitForTimeout(seconds * 1000 + 300);

const { s, frames, long } = await page.evaluate(`(() => {
  let long = 0;
  for (let i = 1; i < window.__f.length; i++) if (window.__f[i] - window.__f[i-1] > 32) long++;
  return { s: window.__s, frames: window.__f.length, long };
})()`);
await browser.close();
server.close();

const tot = Object.values(s).reduce((a, b) => a + b, 0);
console.log(`\n${route} — đứng yên, ${seconds} giây\n`);
console.log(`${tot} lượt sửa DOM · ${frames} khung · ${long} khung dài hơn 32ms`);
console.log(`≈ ${(tot / Math.max(1, frames)).toFixed(0)} lượt sửa mỗi khung hình\n`);
for (const [k, n] of Object.entries(s).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
  console.log(String(n).padStart(7) + '  ' + (100 * n / tot).toFixed(0).padStart(3) + '%  ' + k);
}
const top = Object.entries(s).sort((a, b) => b[1] - a[1])[0];
if (top && top[1] / tot > 0.5) {
  console.log(`\nMỘT nguồn chiếm ${(100 * top[1] / tot).toFixed(0)}% — ${top[0]}`);
  console.log('Số lượng công việc thì giống nhau trên web và trên máy thật; chỉ có GIÁ là khác.');
}
