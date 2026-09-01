/**
 * Đo độ trễ của thanh điều hướng mục, dưới dữ liệu NHẸ và dữ liệu NẶNG.
 *
 * ── vì sao tệp này tồn tại ──
 *
 * Người dùng báo thanh ở trang Dinh dưỡng bấm thấy trễ hơn thanh ở trang Tiến
 * trình, dù hai trang dùng chung một `Segmented`, chung một `PickRow`, chung
 * một lò xo. Tôi sửa hai lần theo suy luận và cả hai lần đều đẻ ra giật, vì
 * `live.mjs` không tái hiện được triệu chứng: fixture của nó có ba kế hoạch ăn
 * và KHÔNG có `food_items` nào cả, nên nửa Kế hoạch ăn ở đó nhẹ hều. Cái nó đo
 * được là "panel nhẹ thì không trễ" — chuyện vốn đã đúng.
 *
 * Vá một thứ không đo được là lấy máy người dùng làm nơi thử nghiệm. Tệp này
 * là để thôi làm thế.
 *
 * ── giả thuyết nó kiểm ──
 *
 * Lệnh cho vệt sáng chạy nằm trong một `useEffect` ở `pick-row`, tức là chạy
 * SAU khi React dựng xong và commit cả cây. Nếu cây ấy nặng thì vệt sáng xếp
 * hàng sau nó. Vậy độ trễ phải TĂNG THEO khối lượng dữ liệu của panel, và phải
 * tăng ở trang Dinh dưỡng nhiều hơn hẳn trang Tiến trình.
 *
 * Nếu chạy tệp này mà hai cột nhẹ/nặng bằng nhau thì giả thuyết SAI, và mọi
 * bản vá dựa trên nó cũng sai. Đó là điều đáng giá nhất tệp này làm được.
 *
 * ── cách nó bơm nặng ──
 *
 * Không sửa `live-world.mjs`: fixture ở đó là một thế giới cân đối, dùng cho
 * ảnh chụp và cho canary, và bơm phình nó lên sẽ làm hỏng mọi thứ khác đọc nó.
 * Tệp này chặn ở tầng mạng và trả về bản đã nhân bản, chỉ cho lần chạy này.
 *
 *   node tools/tab-latency.mjs              dựng lại rồi đo
 *   node tools/tab-latency.mjs --no-build   dùng bản dựng sẵn ở tools/.live-build
 *   node tools/tab-latency.mjs --heavy 800  đổi số món trong thư viện thực phẩm
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(NATIVE, 'tools', '.live-build');
/* Cổng khác `live.mjs` để hai thứ chạy song song được. Và nếu chính tệp này
   đang chạy dở ở một cửa sổ khác thì nhích sang cổng kế tiếp thay vì chết:
   phép đo này chạy gần hai phút, nên "cổng bận" là chuyện thường gặp chứ không
   phải chuyện bất thường. */
const PORT_BASE = 8732;

const argv = process.argv.slice(2);
const args = new Set(argv);
const heavyN = Number(argv[argv.indexOf('--heavy') + 1]) || 400;

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
    cwd: NATIVE,
    stdio: ['ignore', 'pipe', 'pipe'],
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

/**
 * Thế giới NẶNG.
 *
 * `food_items` là chỗ nặng nhất và cũng là chỗ fixture gốc bỏ trống hoàn toàn:
 * `useMyFoodsSorted` và `dedupeSeedShadows` quét CẢ mảng ở mỗi lần dựng, kể cả
 * khi màn chỉ vẽ năm dòng đầu. Đó đúng là hình dạng chi phí mà giả thuyết nói
 * tới — việc trên luồng JS, tỉ lệ với số bản ghi, không tỉ lệ với số pixel.
 *
 * `meal_plans` nhân lên vì `useMealPlanFill` hỏi thêm cho từng plan được vẽ.
 */
function heavyWorld() {
  const foods = Array.from({ length: heavyN }, (_, i) => ({
    id: `f${i}`, user_id: i % 3 === 0 ? null : UID,
    name: `Món số ${i}`, brand: i % 4 === 0 ? `Hiệu ${i % 20}` : null,
    serving_g: 100, kcal: 100 + (i % 400), protein_g: i % 40, carbs_g: i % 60, fat_g: i % 20,
    fiber_g: i % 12, is_favorite: i % 17 === 0, created_at: day(i % 300),
  }));
  const plans = Array.from({ length: 30 }, (_, i) => ({
    id: `hp${i}`, user_id: UID, name: `Kế hoạch ${i}`,
    goal: ['maintain', 'cut', 'bulk'][i % 3], meals_per_day: 3 + (i % 4),
    start_date: null, end_date: null, created_at: day(i),
  }));
  const items = plans.flatMap((p, pi) =>
    Array.from({ length: 21 }, (_, k) => ({
      id: `hi-${pi}-${k}`, meal_plan_id: p.id, day_index: k % 7,
      meal_type: ['breakfast', 'lunch', 'dinner'][k % 3],
      food_name: `Món ${k}`, serving_g: 250, kcal: 400, protein_g: 30, carbs_g: 40, fat_g: 12,
      food_item_id: null,
    })),
  );
  return { ...FIXTURES, food_items: foods, meal_plans: plans, meal_plan_items: items };
}

async function openPage(chromium, world) {
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
      const rows = world[t] ?? [];
      const one = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(one ? (rows[0] ?? null) : rows) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: UID, aud: 'authenticated', role: 'authenticated' }) });
  });
  return { browser, page };
}

/**
 * Một lần bấm, đo từ mốc `pointerdown` THẬT.
 *
 * Ba cái bẫy mà ba bản đo trước đã sập, nên viết ra đây:
 *
 * 1. Không lấy mẫu bằng cách gọi `page.evaluate` nhiều lần rồi tin vào
 *    `waitForTimeout`: mỗi lượt gọi tốn một vòng qua trình duyệt, nên nhãn
 *    "40ms" thật ra là một mốc muộn hơn nhiều. Lấy mẫu bằng `requestAnimation-
 *    Frame` NGAY TRONG trang, đọc kết quả một lần ở cuối.
 * 2. Không giữ tham chiếu tới phần tử: panel dựng lại làm nó bị thay, và bản
 *    đo giữ tham chiếu đã trả về toạ độ âm vô nghĩa. Truy vấn lại mỗi khung.
 * 3. Mốc 0 là `pointerdown` do chính trang ghi lại, không phải thời điểm
 *    Playwright gọi `.click()`.
 */
async function press(page, label) {
  await page.evaluate(`
    window.__down = null; window.__s = [];
    document.addEventListener('pointerdown', () => { window.__down = performance.now(); }, true);
    const at = () => { const c = [...document.querySelectorAll('div')]
        .map((d) => ({ r: d.getBoundingClientRect(), st: getComputedStyle(d) }))
        .filter(({ r, st }) => st.position === 'absolute' && r.top < 200 && r.height > 20 && r.width < 40 && r.width > 4);
      return c.length ? +c[0].r.left.toFixed(1) : null; };
    const tick = () => { window.__s.push([performance.now(), at()]); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  `);
  await page.getByText(label).first().click();
  await page.waitForTimeout(1500);
  const { down, s } = await page.evaluate('({ down: window.__down, s: window.__s })');
  if (!down) return null;
  const base = s.find((p) => p[0] < down && p[1] !== null);
  const x0 = base ? base[1] : s[0][1];
  const end = s[s.length - 1][1];
  const span = end - x0;
  if (!span) return null;
  const moved = s.filter((p) => p[0] >= down && p[1] !== null && Math.abs(p[1] - x0) > 1);
  if (!moved.length) return { first: null, p50: null, p99: null };
  const hit = (f) => {
    const h = moved.find((p) => Math.abs(p[1] - x0) >= Math.abs(span) * f);
    return h ? Math.round(h[0] - down) : null;
  };
  return { first: Math.round(moved[0][0] - down), p50: hit(0.5), p99: hit(0.99) };
}

const SCREENS = [
  { name: 'dinh dưỡng', route: '/nutrition', label: /Meal Plan/i },
  { name: 'tiến trình', route: '/progress', label: /^Measurements$/ },
];

build();
const { server, port } = await serve();
const chromium = loadChromium();

const rows = [];
for (const [worldName, world] of [['nhẹ', FIXTURES], ['nặng', heavyWorld()]]) {
  for (const s of SCREENS) {
    const { browser, page } = await openPage(chromium, world);
    await page.goto(`http://localhost:${port}${s.route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(9000);
    const r = await press(page, s.label);
    rows.push({ world: worldName, screen: s.name, ...(r ?? { first: null, p50: null, p99: null }) });
    await browser.close();
  }
}
server.close();

const n = (v) => (v === null || v === undefined ? '—' : String(v) + 'ms');
console.log(`\nthư viện thực phẩm: ${heavyN} món ở cột "nặng"\n`);
console.log('dữ liệu  màn          nhúc nhích đầu   50%      99%');
for (const r of rows) {
  console.log(
    r.world.padEnd(8) + r.screen.padEnd(13) + n(r.first).padStart(11) + n(r.p50).padStart(11) + n(r.p99).padStart(9),
  );
}

const pick = (w, s) => rows.find((r) => r.world === w && r.screen === s)?.first;
const dLight = pick('nhẹ', 'dinh dưỡng');
const dHeavy = pick('nặng', 'dinh dưỡng');
const pLight = pick('nhẹ', 'tiến trình');
const pHeavy = pick('nặng', 'tiến trình');
console.log('');
if ([dLight, dHeavy, pLight, pHeavy].some((v) => v === null || v === undefined)) {
  console.log('không đủ số liệu — có mốc không đo được');
} else {
  const dGrow = dHeavy - dLight;
  const pGrow = pHeavy - pLight;
  console.log(`dinh dưỡng nặng thêm ${dGrow}ms, tiến trình nặng thêm ${pGrow}ms`);
  console.log(
    dGrow - pGrow >= 20
      ? 'TÁI HIỆN ĐƯỢC — độ trễ tăng theo khối lượng dữ liệu, và tăng ở Dinh dưỡng nhiều hơn.'
      : 'KHÔNG tái hiện được — giả thuyết "effect xếp hàng sau lượt dựng nặng" chưa được số liệu ủng hộ.',
  );
}
