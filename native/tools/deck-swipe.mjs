/**
 * Đo cú vuốt qua lại giữa các thẻ trong deck ở Dashboard.
 *
 * ── vì sao tệp này tồn tại ──
 *
 * Người dùng báo "vuốt qua lại giữa ring card còn hơi giật giật nhẹ". Trước
 * `tab-latency.mjs` tôi đã ba lần vá một triệu chứng không đo được, và cả ba
 * lần đều hỏng theo một kiểu khác. Tệp này là để không có lần thứ tư.
 *
 * ── giả thuyết nó kiểm ──
 *
 * `card-deck.tsx` neo chiều cao sân khấu vào STATE REACT:
 *
 *     const shown = heights[page] ?? heights[0] ?? 0;
 *     style={[styles.stage, shown > 0 ? { height: shown } : null]}
 *
 * `page` đổi qua `runOnJS(settle)`, gọi từ `onEnd` — đúng lúc lò xo snap vừa
 * bắt đầu bay. Nên nếu hai trang cao khác nhau, chiều cao sân khấu NHẢY một
 * nhát tức thì giữa lúc thẻ còn đang trượt: một lượt layout trên luồng JS chen
 * vào giữa một chuyển động đang chạy trên luồng UI.
 *
 * Tệp này lấy mẫu HAI đại lượng mỗi khung hình trong suốt cú vuốt: chiều cao
 * sân khấu, và vị trí ngang của trang. Nếu giả thuyết đúng thì chiều cao phải
 * đổi thành bậc thang trong khi vị trí vẫn đang chạy. Nếu chiều cao phẳng lì
 * suốt cú vuốt thì giả thuyết SAI và tôi phải đi tìm chỗ khác.
 *
 * ── vì sao không tin một lượt chạy ──
 *
 * `tab-latency.mjs` bản đầu chạy mỗi ô một lượt, báo "tái hiện được", rồi chạy
 * lại y hệt cho kết quả ngược. Ở đây mỗi hướng vuốt chạy nhiều lượt, và số in
 * ra là trung vị kèm khoảng min–max.
 *
 *   node tools/deck-swipe.mjs                dựng lại rồi đo
 *   node tools/deck-swipe.mjs --no-build     dùng bản dựng sẵn
 *   node tools/deck-swipe.mjs --runs 7
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(NATIVE, 'tools', '.live-build');
const PORT_BASE = 8742;

const argv = process.argv.slice(2);
const args = new Set(argv);
const runs = Number(argv[argv.indexOf('--runs') + 1]) || 5;

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

async function openPage(chromium) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, hasTouch: true });
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
  return { browser, page };
}

/**
 * Tìm sân khấu của deck.
 *
 * `styles.stage` là `position: relative; overflow: hidden`, và nó là khối duy
 * nhất trên Dashboard vừa rộng gần hết màn vừa cắt nội dung. Tìm theo hình
 * dạng chứ không theo class: bundle web sinh tên class ngẫu nhiên, và bám vào
 * tên ấy là bám vào thứ đổi mỗi lần dựng.
 */
const FIND_STAGE = `
  (() => [...document.querySelectorAll('div')].find((d) => {
    const s = getComputedStyle(d), b = d.getBoundingClientRect();
    return s.overflow === 'hidden' && s.position === 'relative' && b.width > 300 && b.height > 180;
  }))()`;

async function swipe(page, dir, quiet = false) {
  const ok = await page.evaluate(`!!${FIND_STAGE}`);
  if (!ok) return null;

  await page.evaluate(`
    window.__f = [];
    const stage = ${FIND_STAGE};
    const page0 = stage.querySelector('div');
    const t0 = performance.now();
    const tick = () => {
      const m = new DOMMatrixReadOnly(getComputedStyle(page0).transform);
      window.__f.push([performance.now() - t0, +stage.getBoundingClientRect().height.toFixed(1), +m.m41.toFixed(1)]);
      if (performance.now() - t0 < 2200) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  `);

  const box = await page.evaluate(`(() => { const b = ${FIND_STAGE}.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width }; })()`);

  /* Vuốt bằng CHUỘT chứ không phải touch: react-native-gesture-handler trên web
     nghe pointer event, và chuột của Playwright phát đúng chuỗi
     pointerdown/pointermove/pointerup mà nó chờ. */
  const sign = dir === 'trái' ? -1 : 1;
  const start = box.x - sign * box.w * 0.3;
  await page.mouse.move(start, box.y);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(start + sign * (box.w * 0.55) * (i / 14), box.y);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(1600);

  if (quiet) return { bậc: 0, khựng: 0, rớt: 0, đổiCao: 0, chạy: 0 };
  const f = await page.evaluate('window.__f');
  return read(f);
}

/**
 * Đọc chuỗi khung hình.
 *
 * `bậc` — số lần chiều cao sân khấu đổi TRONG KHI trang còn đang chạy. Đây là
 * đại lượng giả thuyết dự đoán: một lượt layout chen vào giữa chuyển động.
 *
 * `khựng` — số lần trang tăng tốc lại sau đỉnh vận tốc, cùng chữ ký như
 * `tab-latency.mjs` dùng. Lò xo snap là `SNAP`, và bất kỳ cú tăng tốc nào sau
 * đỉnh đều là một lò xo thứ hai hoặc một khung hình bị rớt.
 *
 * `rớt` — số khung hình dài hơn 32ms (hai nhịp ở 60Hz) trong lúc đang chạy.
 * Đây là thứ gần nhất với "giật" mà mắt thật sự thấy.
 */
function read(f) {
  const moving = [];
  for (let i = 1; i < f.length; i++) if (Math.abs(f[i][2] - f[i - 1][2]) > 0.5) moving.push(i);
  if (moving.length < 4) return { bậc: 0, khựng: 0, rớt: 0, đổiCao: 0, chạy: 0 };
  const a = moving[0], b = moving[moving.length - 1];

  let steps = 0;
  for (let i = a; i <= b; i++) if (Math.abs(f[i][1] - f[i - 1][1]) > 1) steps++;

  const v = [];
  for (let i = a + 1; i <= b; i++) {
    const dt = f[i][0] - f[i - 1][0];
    if (dt > 0) v.push(Math.abs(f[i][2] - f[i - 1][2]) / dt);
  }
  let peak = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[peak]) peak = i;
  let stall = 0;
  for (let i = peak + 2; i < v.length; i++) if (v[i] > v[i - 1] * 1.5 + 0.5) stall++;

  let drops = 0;
  for (let i = a + 1; i <= b; i++) if (f[i][0] - f[i - 1][0] > 32) drops++;

  const hs = f.slice(a, b + 1).map((r) => r[1]);
  return {
    bậc: steps, khựng: stall, rớt: drops,
    đổiCao: Math.round(Math.max(...hs) - Math.min(...hs)),
    chạy: Math.round(f[b][0] - f[a][0]),
  };
}

build();
const { server, port } = await serve();
const chromium = loadChromium();

/*
  Đi hết TỪNG CẶP kề nhau, không phải một bước từ trang đầu.

  Bản đầu chỉ vuốt một bước rồi kết luận cho cả deck. Nó bỏ sót đúng thứ cần
  tìm: người dùng chỉ vào THẺ NƯỚC, và trang nước là trang duy nhất có hai ô
  thay vì bốn (`hero-pages.tsx` ghi rõ: "Nước có đúng một phép đo và một mục
  tiêu"). Nếu chiều cao sân khấu nhảy thì nó nhảy MẠNH NHẤT ở cặp có chênh
  lệch chiều cao lớn nhất — và một phép đo chỉ nhìn bước đầu tiên sẽ báo
  "không sao" trong khi bước thứ ba giật.

  Nên đo từng bước riêng: bước 0→1, 1→2, 2→3, rồi ngược lại.
*/
const PAGES = 4;
const rows = [];
for (let step = 0; step < PAGES - 1; step++) {
  for (const dir of ['trái', 'phải']) {
    const got = [];
    for (let i = 0; i < runs; i++) {
      const { browser, page } = await openPage(chromium);
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(9000);
      /* Đi tới mép của bước đang đo mà KHÔNG đo, rồi mới đo đúng một bước. */
      const lead = dir === 'trái' ? step : step + 1;
      for (let k = 0; k < lead; k++) { await swipe(page, 'trái', true); await page.waitForTimeout(400); }
      const r = await swipe(page, dir);
      if (r) got.push(r);
      await browser.close();
      process.stdout.write(r ? '.' : 'x');
    }
    rows.push({ dir, step, got });
  }
}
server.close();
console.log('');

if (rows.every((r) => r.got.length === 0)) {
  console.log('\nKHÔNG vuốt được trong harness — mọi lượt đều không tìm thấy sân khấu hoặc');
  console.log('deck không nhúc nhích. Chưa đo được, và không được suy đoán thay.');
  process.exit(1);
}

const mid = (xs) => { const v = [...xs].sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : null; };
const rng = (xs) => (xs.length ? `${Math.min(...xs)}–${Math.max(...xs)}` : '—');

console.log(`\nmỗi hướng ${runs} lượt; số in ra là TRUNG VỊ, trong ngoặc là min–max\n`);
console.log('bước    hướng   bậc chiều cao      khựng        khung rớt     biên độ cao   thời gian chạy');
for (const r of rows) {
  const tag = (r.dir === 'trái' ? `${r.step}→${r.step + 1}` : `${r.step + 1}→${r.step}`).padEnd(8);
  if (!r.got.length) { console.log(tag + r.dir.padEnd(8) + 'không vuốt được'); continue; }
  const c = (k) => r.got.map((g) => g[k]);
  console.log(
    tag + r.dir.padEnd(8) +
      `${mid(c('bậc'))} (${rng(c('bậc'))})`.padEnd(17) +
      `${mid(c('khựng'))} (${rng(c('khựng'))})`.padEnd(13) +
      `${mid(c('rớt'))} (${rng(c('rớt'))})`.padEnd(14) +
      `${mid(c('đổiCao'))}px`.padEnd(14) +
      `${mid(c('chạy'))}ms`,
  );
}

const allSteps = rows.flatMap((r) => r.got.map((g) => g.bậc));
const allH = rows.flatMap((r) => r.got.map((g) => g.đổiCao));
console.log('');
if (mid(allSteps) > 0 && mid(allH) > 1) {
  console.log(`GIẢ THUYẾT ĐÚNG — chiều cao sân khấu đổi ${mid(allH)}px TRONG KHI trang còn đang chạy.`);
  console.log('Đó là một lượt layout trên luồng JS chen vào giữa chuyển động trên luồng UI.');
} else {
  console.log('GIẢ THUYẾT SAI — chiều cao sân khấu không đổi trong lúc trang chạy.');
  console.log('Cú giật, nếu có, đến từ chỗ khác; xem cột "khung rớt" và "khựng".');
}
