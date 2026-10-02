/**
 * The app's logic, actually running, in three states.
 *
 *   node tools/live.mjs            build, boot every screen, then press things
 *   node tools/live.mjs --no-build reuse the last build
 *   node tools/live.mjs --shots    also write PNGs to tools/.live-shots/
 *   node tools/live.mjs --press-only  skip the screen sweeps, only drive controls
 *   node tools/live.mjs --narrow-only only the 320-wide Community sweep (#48)
 *   node tools/live.mjs --only=<text> only the scenarios whose name contains <text>
 *
 * Not part of `check.mjs`. It builds a bundle and drives a browser, which takes
 * minutes rather than seconds, and a suite people stop running is worth less
 * than a slower one they run deliberately.
 *
 * ── why this exists ──
 *
 * The other forty-seven tools read the code. Every one of them was green on the
 * day each of these shipped:
 *
 *   - **The Sign In button did nothing.** `submit` opened with `if (!email)
 *     return;` and carried a second silent `return` for the password. On the
 *     app's first screen, tapping with a blank field produced no message, no
 *     haptic, no change. An early return is ordinary code and no static rule has
 *     an opinion about it.
 *
 *   - **Twelve `isError` branches were unreachable.** Wiring the failure state
 *     into twelve screens fixed six. The other six had query functions that
 *     destructured `error` away, so a failed request *resolved* with `data:
 *     null`, React Query recorded a success, and the branch could never run. It
 *     read exactly like a fix.
 *
 *   - **One failing query blanked the whole app, for ever.** `Gate` waited on
 *     `!profileLoading` with no case for that query having failed. Fail only
 *     `profiles` and the app is thirty-five seconds of nothing, with no error
 *     and no way out. Fail every *other* query and it works perfectly.
 *
 * All three needed the app to run. None of them needed a device: a web bundle,
 * a headless browser, a fake session and a fake server are enough to reach the
 * screens and lie to them convincingly.
 *
 * ── what this can and cannot tell you ──
 *
 * **The app ships native. The web bundle is a harness, not a target.** Nobody
 * uses it; it exists here because it is the cheapest way to execute the app's
 * own JavaScript with a browser attached.
 *
 * So this file is a check on **logic and state**, and on nothing else. The three
 * bugs above are all of that kind: an early `return`, a swallowed error, a
 * readiness condition with a missing case. Every one of them would have shipped
 * to a phone exactly as it shipped to this harness.
 *
 * Anything that is *layout*, *platform* or *chrome* seen here is noise and must
 * be discarded rather than fixed. The first run of the press check produced five
 * findings and every one was of that kind:
 *
 *   - `headerRight` buttons read as unreachable because the web tab bar is drawn
 *     over the top strip. iOS renders `NativeTabs` at the bottom; there is
 *     nothing over that strip on a phone.
 *   - Confirm dialogs read as dead because `react-native-web`'s Alert is
 *     `static alert() {}`. On iOS they are real. (Since #83 the app replaces
 *     it with the browser's own dialogs, so on web they are real too, and #91
 *     presses them.)
 *
 * If a finding here would disappear on a phone, it was never a finding. Judge
 * every one against that question before touching a line of app code.
 *
 * ── the mistake this file is built to prevent ──
 *
 * The first version of this harness reported **30 of 30 routes healthy**. It
 * was serving with `python -m http.server`, which 404s any path that is not a
 * file, so twenty-nine of the thirty "screens" measured were the server's own
 * error page. Only `/` had ever loaded the app. A green result measuring
 * precisely nothing.
 *
 * So `canary()` below runs before anything is trusted, and it does not check
 * that a page loaded — it checks that a specific number this app computes from
 * fixture data is on the screen. Nothing but the real app rendering real data
 * can produce that.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* `LIVE_BUILD=<thư mục>`: chạy trên một bản dựng KHÁC — bản đã bị phá có chủ
   ý cho phép thử ngược — mà không đè lên bản sạch ở `.live-build` (#71). */
const OUT = process.env.LIVE_BUILD ? path.resolve(process.env.LIVE_BUILD) : path.join(NATIVE, 'tools', '.live-build');
const SHOTS = path.join(NATIVE, 'tools', '.live-shots');
const PORT = 8731;
import { FIXTURES, REF, UID, applyQuery, day, jwt, LIVE_TZ } from './live-world.mjs';
import { RPC_FIXTURES, rewardAmountFor } from './live-rpc.mjs';
import { fakeSupabase } from './live-server.mjs';
import { DESTRUCTIVE } from './live-press.mjs';
import {
  LARGE_LANGS, LARGE_TEXT, NARROW, NARROW_LANGS, NARROW_ROUTES, NARROW_ROUTES_MAIN, NARROW_ROUTES_NUTRITION, clipExempt, copyPatterns,
  enlargeText, narrowFindings, tailPatterns,
} from './live-narrow.mjs';

const args = new Set(process.argv.slice(2));
const wantShots = args.has('--shots');
const narrowOnly = args.has('--narrow-only');
/* Chạy riêng những kịch bản có tên chứa chuỗi này — cho phép thử ngược một
   kịch bản trên một bản dựng bị phá mà không trả 35 phút của lượt đầy đủ. Bỏ
   qua mọi lượt quét và lượt bấm, và dòng tổng kết nói đúng như thế. */
const onlyArg = [...args].find((a) => a.startsWith('--only='))?.slice(7) ?? null;
/* Quét màn (và quét hẹp) chỉ những đường dẫn chứa chuỗi này — cho phép đo lại
   một màn sau khi sửa (#76: `/workouts`) mà không trả cả lượt 37 × 3. Bỏ qua
   lượt bấm và kịch bản, và dòng tổng kết nói đúng như thế. */
const routeArg = [...args].find((a) => a.startsWith('--route='))?.slice(8) ?? null;
const pickRoutes = (list) => (routeArg ? list.filter((r) => r.includes(routeArg)) : list);
/* Chỉ lượt bấm thử, và chỉ những mục PRESS_ROUTES có đường dẫn chứa chuỗi này
   (#127) — đo lại một màn sau khi sửa mà không trả mọi màn và mọi kịch bản. Đi
   cùng `--press-only`; dòng tổng kết nói đúng như thế. */
const pressRouteArg = [...args].find((a) => a.startsWith('--press-route='))?.slice(14) ?? null;
/*
  ── theme, vì một bộ chạy chỉ vẽ được một thế giới ──

  Bộ này bơm phiên đăng nhập vào `localStorage` trước khi trang chạy. Theme sống
  ở cùng chỗ, dưới khoá `ascnd_theme` (xem `use-app-settings.tsx`), nên nó đi
  cùng đường: một `addInitScript` nữa, chạy TRƯỚC mã của app.

  Mặc định vẫn là không đặt gì — tức app tự quyết như trước, và mọi phép khẳng
  định cũ vẫn chạy trên đúng thế giới cũ. `--theme=light` là để CHỤP bản sáng.
*/
const themeArg = [...args].find((a) => a.startsWith('--theme='))?.slice(8);
/*
  ── song song (#102) ──

  Lượt quét màn (37 × 3) và quét hẹp mở mỗi màn trong một trình duyệt RIÊNG,
  với một bản sao thế giới riêng (#52), rồi phần lớn thời gian là CHỜ: 9 s cho
  màn lắng, thêm chờ sau mỗi phân đoạn. Chạy N trang cùng lúc không đổi phép đo
  nào — mỗi trang vẫn chờ đủ chừng ấy — chỉ thôi chờ tuần tự. Kịch bản và lượt
  bấm vẫn tuần tự: chúng đổi mạng (#68) và đo thời gian lắng của một lần bấm.

  `--jobs=1` là lượt tuần tự cũ, để so khi một vế đỏ chỉ lúc chạy song song.
*/
const JOBS = Number([...args].find((a) => a.startsWith('--jobs='))?.slice(7) ?? 3);
if (!Number.isInteger(JOBS) || JOBS < 1 || JOBS > 8) {
  console.error(`--jobs phải là số nguyên 1–8, nhận "${JOBS}"`);
  process.exit(2);
}
if (themeArg && themeArg !== 'light' && themeArg !== 'dark') {
  console.error(`--theme phải là light hoặc dark, nhận "${themeArg}"`);
  process.exit(2);
}

/* Playwright is whatever the machine happens to have, exactly as in
   `check.mjs`. ESM ignores NODE_PATH, so the global root is required directly
   rather than hoped for. */
function loadChromium() {
  for (const root of [path.join(NATIVE, 'node_modules'), globalRoot()]) {
    if (!root || !existsSync(path.join(root, 'playwright'))) continue;
    return createRequire(path.join(root, 'x.js'))('playwright').chromium;
  }
  console.error(
    'không tìm thấy playwright.\n' +
      'cài: npm i -g playwright && npx playwright install chromium\n' +
      'Đây là công cụ chạy thật, không phải phần bắt buộc của `check.mjs`.',
  );
  process.exit(2);
}
function globalRoot() {
  try {
    return execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// ── the world the app wakes up in ─────────────────────────────────────────


/**
 * The three worlds.
 *
 * `empty` keeps the profile — somebody who finished onboarding and has logged
 * nothing — because a missing profile is a different test (`Gate`), not this
 * one.
 */
const MODES = ['full', 'empty', 'fail'];

const ROUTES = [
  /* `/progress` đã rời khỏi danh sách: nó gộp vào `/workouts` (ba33494), và
     suốt từ đó lượt quét vẫn "mở" nó xanh — một trang không-tìm-thấy. */
  '/', '/nutrition', '/workouts', '/assistant',
  '/steps', '/water', '/biometrics', '/sleep-insights', '/sessions',
  '/templates', '/exercises', '/supplements', '/grocery', '/food-list',
  '/meal-plans', '/progress-photos', '/awards', '/challenges', '/smart-goals',
  '/weekly-review', '/settings', '/coach-memory', '/shop', '/ai-coach',
  /*
    The screens people actually type into were missing from this list, which is
    an odd shape for a harness whose whole purpose is that static rules cannot
    see a rendered page. `/log-workout` is the one somebody opens every session,
    and it was never once opened here.

    Found while adding the music shortcut to it: the row rendered, `tsc` was
    clean, every rule was green, and nothing in this tool had ever drawn the
    screen it sits on.
  */
  '/log-workout',
  /*
    Nhật ký bữa ăn của một ngày bất kỳ — màn DUY NHẤT trong app đọc dữ liệu của
    một ngày không phải hôm nay. Nó có ba trạng thái mà không màn nào khác có
    cùng lúc: đang tải một ngày mới, một ngày rỗng, và một ngày đọc hỏng; cộng
    một điều khiển không thể đứng yên (mũi tên "ngày sau" tắt đúng ở hôm nay).
  */
  '/diary',
  /*
    The panel people tick sets off on while they are training. It was
    `/routine`, a root-level screen; it is `/workouts/plan` now — a page inside
    the training tab rather than one pushed over the whole tab bar. Same
    drawing, same reason for being in this list, new path.
  */
  '/workouts/plan',
  /* Trang "thư viện & lịch sử" — nhóm TRA CỨU tách ra khỏi gốc tab. Nó mang một
     danh sách, một trạng thái rỗng và một lưới ô, tức là ba thứ có thể trắng ở
     ba lý do khác nhau. */
  '/workouts/library',
  /*
    And the room itself. Two things are drawn nowhere else in the app — the
    segmented energy ring and the level bar — so for as long as this list did
    not contain `/mascot-room`, no screenshot in this repository had ever
    contained either of them. `entry-points.mjs` had already written the room up
    as "a room with only vanishing doors"; it turned out the harness could not
    find the door either.

    Found the same way `/log-workout` was: making the ring animate, and having
    nowhere to look at the result.
  */
  '/mascot-room',
  /*
    And the two screens whose choice-rows were the last ones still cutting.
    `/edit-profile` is where the app asks who you are — goal, activity level,
    training level — and `/log-meal` is the most-used logging screen there is.
    Neither had ever been drawn here, which is why the bordered chip grid on one
    and the scrolling meal-type row on the other were both changed blind.
  */
  '/edit-profile',
  '/log-meal',
  /* Exercise Intelligence's only surface. It reads inside `workout_sessions.sets`,
     which no other screen does, so nothing else here would notice it breaking. */
  '/exercise-insight',
  /*
    Cộng đồng — cả tab lẫn các màn của nó chưa từng có trong danh sách này, nên
    lỗi #17 (hồ sơ không bao giờ đọc được trong thế giới giả, ô soạn bài không
    bao giờ hiện) không có chỗ nào để lộ ra ở đây.
  */
  '/community', '/community-inbox', '/community-privacy', '/community-search',
  /* #41: trang mọi thử thách — bốn nhóm, mỗi nhóm có thể rỗng vì một lý do khác. */
  '/community-challenges',
];

// ── build & serve ─────────────────────────────────────────────────────────

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

/**
 * A static server with a single-page fallback.
 *
 * The fallback is the whole point and the reason the first harness measured
 * nothing: every route below is a client-side path, not a file on disk, so
 * anything that 404s unknown paths hands back an error page that a text scan
 * will happily call healthy.
 */
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
  return new Promise((ok) => server.listen(PORT, () => ok(server)));
}

// ── one boot ──────────────────────────────────────────────────────────────

/**
 * Open the app and hand back the page, still alive.
 *
 * `boot` below reads it and closes it; the driving checks keep it and press
 * things. `mode === 'signedout'` seeds no session, which is the only way to
 * reach the screen every user meets first.
 */
/**
 * #46: đo đường GHI (INSERT) và đường XOÁ (DELETE) của một nút bật/tắt trên
 * feed khi mọi lệnh ghi vào `table` trả 500. Bấm lần lượt từng nút cho tới khi
 * đã thấy cả `POST` lẫn `DELETE`; mỗi cú bấm phải có toast riêng (đợi toast
 * trước tắt hẳn rồi mới bấm tiếp, để không đọc nhầm toast cũ), không mang chữ
 * của server, và — nếu nhãn có số — nhãn trở về như trước.
 */
async function bothWritePaths(page, table, nameRe, labelHasCount, successRe = null) {
  const writes = [];
  await page.route(new RegExp(`/rest/v1/${table}`), (r) => {
    if (r.request().method() === 'GET') return r.fallback();
    writes.push(r.request().method());
    return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"server error"}' });
  });
  await page.waitForTimeout(2000);
  const btns = page.getByRole('button', { name: nameRe });
  const n = await btns.count();
  if (n === 0) return `không thấy nút nào khớp ${nameRe} trên feed`;
  const toast = async () => (await page.locator('[aria-live="polite"]').allInnerTexts()).join(' ').trim();
  const seen = {};
  for (let i = 0; i < n && !(seen.POST && seen.DELETE); i++) {
    for (let k = 0; k < 20 && (await toast()); k++) await page.waitForTimeout(250);
    const before = await btns.nth(i).getAttribute('aria-label');
    const w0 = writes.length;
    await btns.nth(i).click();
    for (let k = 0; k < 8 && writes.length === w0; k++) await page.waitForTimeout(200);
    if (writes.length === w0) return `bấm nút thứ ${i + 1} (${before}) mà không có lệnh ghi nào vào ${table}`;
    const m = writes[writes.length - 1];
    if (seen[m]) continue;
    /* Dò liên tục: toast không nút tự tắt sau đúng AUTO_HIDE_MS = 3000 (#27). */
    let text = '';
    for (let k = 0; k < 12 && !text; k++) {
      await page.waitForTimeout(250);
      text = await toast();
    }
    const path = m === 'POST' ? 'đường GHI (INSERT)' : `đường XOÁ (${m})`;
    if (!text) return `${table}: ${path} hỏng mà không có thanh toast nào — lỗi bị nuốt`;
    if (/server error/i.test(text)) return `${table}: ${path} — toast hiện nguyên chữ của server: "${text}" (#31)`;
    /* Có toast chưa đủ: lỗi bị nuốt thì `onSuccess` chạy và câu THÀNH CÔNG hiện
       ra ("Đã lưu vào thư viện") — một lời nói dối có chữ. Phép phá đường GHI
       của #46 lộ ra đúng chỗ này ở vế Lưu. */
    if (successRe && successRe.test(text)) return `${table}: ${path} hỏng mà toast báo THÀNH CÔNG: "${text}"`;
    if (labelHasCount) {
      const after = await btns.nth(i).getAttribute('aria-label');
      if (after !== before) return `${table}: ${path} hỏng mà nút không trở về: trước "${before}", sau "${after}"`;
    }
    seen[m] = true;
  }
  if (!seen.POST) return `${table}: bấm hết ${n} nút mà không có lệnh INSERT nào — đường GHI chưa được đo (mọi bài đều đã bật sẵn?)`;
  if (!seen.DELETE) return `${table}: bấm hết ${n} nút mà không có lệnh DELETE nào — đường XOÁ chưa được đo (không bài nào bật sẵn?)`;
  return null;
}

/** Mọi câu `select=` máy chủ giả đã từ chối trong lượt chạy này (#35). */
const SELECT_MISSES = new Set();
/** Lời gọi RPC có đối số lệch chữ ký trong `types.ts` (#38). */
const RPC_ARG_MISSES = new Set();
/** Hàm RPC app đã gọi mà `live-rpc.mjs` chưa có fixture — nhận `[]` như trước #38. */
const RPC_UNFIXTURED = new Set();
/** Lệnh ghi KHÔNG được áp vào thế giới vì bộ lọc máy chủ giả không hiểu (#52). */
const WRITES_NOT_APPLIED = new Set();
/*
  #117: mở một route mà trang DỪNG ở đường dẫn khác. Trên bản web `/assistant`
  bị chuyển về `/` (thanh tab web không có Trợ lý), nên mọi lượt quét mang nhãn
  "/assistant" đã đo màn Hôm nay lần thứ hai, và màn Trợ lý chưa từng được quét.
  Một chuyển hướng có chủ ý phải có tên ở `REDIRECT_OK`, kèm lý do.
*/
const LANDING_MISSES = new Set();
const REDIRECT_OK = {};

/*
  #112: MÚI GIỜ của trình duyệt, chọn một lần lúc nạp.

  Thế giới giả đặt mọi mốc bằng `day(n)` = lúc nạp − n ngày, với 26 mốc là
  phần của ngày (`day(0.4)`: buổi tập "hôm nay" 9,6 giờ trước). App đọc ngày
  theo giờ ĐỊA PHƯƠNG. Chạy với trình duyệt ở UTC thì kết quả tuỳ giờ bấm
  chạy: trước 09:36 UTC buổi "hôm nay" là hôm qua và vế nút gập (#103) đỏ; một
  lượt bắt đầu 23:30 vắt qua nửa đêm và Hộp thư đếm "3 ngày" thay vì 4. Mọi
  lượt xanh trước #112 đều chạy vào chiều/tối UTC.

  Nên: độ lệch `Etc/GMT±N` đặt giờ địa phương lúc nạp ở khoảng 14:00, trên
  CÙNG ngày UTC với thế giới giả (`dayStr(0)`). Lượt ~1 giờ không vắt qua nửa
  đêm, và mỗi `day(0.x)` luôn rơi vào cùng một nửa ngày. Độ lệch nằm trong
  −9…+14, luôn có trong IANA.
*/
/* Từ #114 độ lệch được tính MỘT lần ở `live-world.mjs`, cùng mốc neo `LOAD`
   với mọi mốc của thế giới — và mọi đầu dò dùng chung. */

async function openPage(chromium, route, mode, settleMs = 9000, { width = 402, height = 874, lang = null } = {}) {
  const browser = await chromium.launch(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE, args: ['--no-sandbox'] } : undefined);
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: LIVE_TZ });
  /* #113: các vế tự truy vấn DOM đi qua `__shown(sel, root)`, không qua
     `querySelectorAll` trần. Màn trước còn trong DOM với `display: none` sau
     một cú bấm điều hướng (#110), và `checkVisibility()` loại đúng thứ ấy —
     phần tử bị gập hay nằm ngoài vùng cuộn thì vẫn được tính, như trước. */
  await ctx.addInitScript(() => {
    window.__shown = (sel, root = document) => [...root.querySelectorAll(sel)].filter((e) => e.checkVisibility());
    /* #125: `Linking.openURL` của react-native-web là `window.open` — giao cho
       một app khác (Spotify, Apple Music) hay một trang ngoài. Trang này không
       theo được sang đó, nên lượt bấm thử từng đọc nút ấy là "không làm gì".
       Ghi lại thay vì mở: một lần giao đi LÀ màn đã trả lời. */
    window.__opened = [];
    window.open = (url) => {
      window.__opened.push(String(url));
      return null;
    };
  });
  /* Như theme ngay dưới: đặt TRƯỚC khi app chạy. Lượt quét hẹp (#48) đo cả
     hai ngôn ngữ, vì chữ tiếng Việt dài hơn và mọi nhãn bị cắt đã tìm thấy
     đều là tiếng Việt. */
  if (lang) await ctx.addInitScript((l) => { window.localStorage.setItem('ascnd_lang', l); }, lang);
  if (mode !== 'signedout') await ctx.addInitScript(([ref, session]) => {
    window.localStorage.setItem(`sb-${ref}-auth-token`, session);
  }, [REF, JSON.stringify({
    access_token: jwt(), refresh_token: 'r', token_type: 'bearer',
    expires_in: 86400 * 30, expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
    user: {
      id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@ascnd.app',
      app_metadata: {}, user_metadata: { name: 'Kiệt' }, created_at: day(400),
    },
  })]);

  /* Đặt TRƯỚC khi app chạy: `AppSettingsProvider` đọc khoá này trong effect đầu
     tiên, nên một lần đặt sau đó là một lần vẽ lại mà ảnh chụp có thể bắt trượt. */
  if (themeArg) await ctx.addInitScript((t) => { window.localStorage.setItem('ascnd_theme', t); }, themeArg);

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    /* A 500 we asked for is not a finding; it is the experiment. */
    if (/Failed to load resource|favicon/.test(t)) return;
    /*
      #70: chính sách "user activation" của Chrome, không phải lỗi của app.
      `expo-haptics` trên web gọi `navigator.vibrate`, và Chrome chặn — kèm dòng
      này ở mức error — mọi lần rung khi trang chưa từng được chạm. iOS không có
      luật ấy: một cú rung lúc mở màn là hợp lệ ở đó. Có số đếm thật (#70) thì
      một thử thách TUẦN đạt ngay lần đầu mở /challenges trong tuần, và màn chúc
      mừng rung — đúng hành vi cho người mới trong tuần. Bỏ dòng này đi thì mất
      MỘT tín hiệu của vòng lặp chúc mừng (màn bật lên ở mọi trang mới), không
      mất hết: trên Hôm nay, lượt "đứng yên" vẫn đỏ khi confetti chạy — nó đã
      đỏ ở lần thiếu `awards` trong fixture, cùng lúc với dòng này.
    */
    if (/^Blocked call to navigator\.vibrate because user hasn't tapped on the frame/.test(t)) return;
    errors.push(t);
  });

  /* #52: một BẢN SAO thế giới cho mỗi trang, và lệnh ghi áp vào nó
     (`live-writes.mjs`). Chế độ `empty` là thế giới chỉ có hồ sơ, như trước. */
  const world = mode === 'empty' ? { profiles: structuredClone(FIXTURES.profiles) } : structuredClone(FIXTURES);
  await ctx.route('**/*.supabase.co/**', fakeSupabase({
    world,
    mode,
    report: { rpcArgMisses: RPC_ARG_MISSES, rpcUnfixtured: RPC_UNFIXTURED, selectMisses: SELECT_MISSES, writesNotApplied: WRITES_NOT_APPLIED },
  }));

  /* SHIM review: phuc vu file tinh qua route interception (Chrome o day chan loopback) */
  await ctx.route((url) => url.host === `localhost:${PORT}`, async (r) => {
    const pathname = decodeURIComponent(new URL(r.request().url()).pathname);
    let f = path.join(OUT, pathname);
    if (!existsSync(f) || statSync(f).isDirectory()) {
      const asHtml = path.join(OUT, pathname.replace(/\/$/, '') + '.html');
      f = existsSync(asHtml) ? asHtml : path.join(OUT, 'index.html');
    }
    await r.fulfill({
      status: 200,
      contentType: TYPES[path.extname(f)] ?? 'application/octet-stream',
      body: readFileSync(f),
    });
  });

  await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(settleMs);
  const asked = route.split('?')[0];
  const landed = new URL(page.url()).pathname;
  if (landed !== asked && REDIRECT_OK[`${asked}→${landed}`] === undefined) LANDING_MISSES.add(`[${mode}] mở ${asked} mà trang dừng ở ${landed}`);
  return { browser, page, errors, world };
}

/**
 * Có mạng lại — theo cách một trình duyệt THẬT báo cho app (#62).
 *
 * ── vì sao `setOffline(false)` một mình không đủ ──
 *
 * Đo trên Chromium của bộ chạy này: `setOffline(true)` bắn CẢ
 * `navigator.connection` 'change' LẪN `window` 'offline'; `setOffline(false)`
 * chỉ bắn `window` 'online'. NetInfo bản web, khi `navigator.connection` tồn
 * tại, CHỈ nghe 'change' — nên app thấy mất mạng mà không bao giờ thấy mạng
 * về: dải "Ngoại tuyến" nằm mãi, `onlineManager` ở offline mãi, và hàng đợi
 * bền không bao giờ được gửi. Mọi vế "có mạng lại thì…" viết trước hàm này
 * (#45, #49) vì thế chưa từng có mạng lại trong mắt app — rỗng nghĩa, dạng
 * thứ ba: dữ liệu đích đã hỏng vì một lý do khác. Và `lib/offline.ts` kết luận
 * "có mạng lại 30 giây vẫn không gửi" từ ĐÚNG phép đo này.
 *
 * Nên có mạng lại = tắt giả lập VÀ bắn 'change' như trình duyệt thật khi mạng
 * đổi. Sau đó `stillOffline` phải là false — nếu không, vế đang đo không đo gì.
 */
/**
 * Một request có GHI không. "Không phải GET" thì chưa chắc: `select(…, { head:
 * true })` là HEAD — một phép ĐỌC. Vế bữa ăn của #69 đếm "không phải GET" và
 * đỏ "meal_entries: 3 lệnh ghi" cho một bữa ghi đúng một lần: 1 POST và 2 HEAD
 * đếm dòng của lượt dựng lại nhật ký ngày.
 */
const isWrite = (method) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

async function goOnline(page) {
  await page.context().setOffline(false);
  await page.evaluate(() => navigator.connection?.dispatchEvent(new Event('change')));
}

/**
 * Mất mạng — cùng lý do, chiều ngược lại. Lần mất mạng ĐẦU Chromium tự bắn
 * 'change'; từ lần THỨ HAI thì không, vì `navigator.connection` của nó chưa
 * từng biết mạng đã về (nó không đổi trạng thái lúc `setOffline(false)`), nên
 * với nó "mất mạng lần nữa" là không có gì đổi. Đo được ở vế (B) của #62: lần
 * mất mạng thứ hai app vẫn tin là có mạng, mutation chạy và hỏng thay vì tạm
 * dừng, và cache không có gì để gửi lại.
 */
async function goOffline(page) {
  await page.context().setOffline(true);
  await page.evaluate(() => navigator.connection?.dispatchEvent(new Event('change')));
}
/* Repro tập trung: bữa ăn offline -> restart -> có gửi lại không */
const chromium = loadChromium();
const { browser: b2, page: pg, errors: errs } = await openPage(chromium, '/log-meal', 'full', 9000);
pg.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || t.includes('restore-threw')) console.log('[console]', t.slice(0, 500)); });
await pg.evaluate(() => {
  window.__writes = [];
  const orig = window.localStorage.setItem.bind(window.localStorage);
  window.localStorage.setItem = (k, v) => {
    if (k === 'ascnd_rq_cache') {
      let muts = '?';
      try { muts = JSON.stringify(JSON.parse(v).clientState.mutations.map((m) => m.mutationKey?.[0] + ':' + m.state?.status + (m.state?.isPaused ? ':paused' : ''))); }
      catch (e) { muts = 'parse-err'; }
      let threw = '';
      let readback = '';
      try {
        orig(k, v);
        const rb = window.localStorage.getItem(k);
        readback = rb === v ? 'rb=ok' : 'rb=MISMATCH(len=' + (rb ? rb.length : 'null') + ')';
      } catch (e) { threw = 'THREW:' + e.message; }
      window.__writes.push([new Date().toISOString().slice(17, 23), 'len=' + v.length, muts, threw, readback].filter(Boolean).join(' '));
    } else {
      return orig(k, v);
    }
  };
});
const drainWrites = () => pg.evaluate(() => window.__writes);
pg.on('request', (q) => { if (q.url().includes('__pagehide__')) console.log('pagehide beacon:', q.url().split('__pagehide__?')[1]); });
await pg.evaluate(() => {
  window.addEventListener('pagehide', () => {
    try {
      const raw = window.localStorage.getItem('ascnd_rq_cache') ?? '{}';
      const n = (JSON.parse(raw).clientState?.mutations ?? []).length;
      fetch('http://127.0.0.1:9999/__pagehide__?muts=' + n + '&len=' + raw.length, { keepalive: true, mode: 'no-cors' }).catch(() => {});
    } catch (e) {}
  });
});
const writes = { meal_entries: 0, meal_entry_items: 0 };
pg.on('request', (q) => {
  for (const t of Object.keys(writes))
    if (new RegExp(`/rest/v1/${t}(\\?|$)`).test(q.url()) && isWrite(q.method())) writes[t]++;
});
await pg.getByText('Cơm gà nhà làm', { exact: true }).first().click();
await pg.waitForTimeout(1000);
await goOffline(pg);
await pg.waitForTimeout(1500);
const save = pg.getByRole('button', { name: /^(Lưu bữa ăn|Save Meal)$/ });
console.log('save count:', await save.count());
await save.click();
await pg.waitForTimeout(2500);
console.log('writes while offline:', JSON.stringify(writes));
const dump = () => pg.evaluate(() => {
  const c = JSON.parse(localStorage.getItem('ascnd_rq_cache') ?? '{}');
  return (c.clientState?.mutations ?? []).map((m) => ({
    key: m.mutationKey, paused: !!m.state?.isPaused, status: m.state?.status,
    vars: JSON.stringify(m.state?.variables)?.slice(0, 160),
  }));
});
console.log('cache before restart:', JSON.stringify(await dump()));
let lastMuts = 'init';
for (let i = 0; i < 12; i++) {
  await pg.waitForTimeout(500);
  const cur = await pg.evaluate(() => {
    try {
      const c = JSON.parse(localStorage.getItem('ascnd_rq_cache') ?? '{}');
      return JSON.stringify((c.clientState?.mutations ?? []).map((m) => m.mutationKey?.[0] + ':' + m.state?.status + (m.state?.isPaused ? ':paused' : '')));
    } catch (e) { return 'ERR'; }
  });
  if (cur !== lastMuts) { console.log(`oldpage t+${((i + 1) * 0.5).toFixed(1)}s localStorage muts:`, cur); lastMuts = cur; }
}
const url = pg.url();
console.log('url before restart:', url.replace(/^.*8731/, ''));
console.log('setItem writes on old page:', JSON.stringify(await drainWrites()));
const SEED = process.env.SEED_CACHE || '';
let seedScriptNote = 'no-seed';
if (SEED === '1') {
  const captured = await pg.evaluate(() => localStorage.getItem('ascnd_rq_cache'));
  console.log('captured cache len:', captured?.length);
  await pg.context().addInitScript((v) => { window.localStorage.setItem('ascnd_rq_cache', v); }, captured);
  seedScriptNote = 'seeded len=' + captured?.length;
} else {
  await pg.evaluate((m) => localStorage.setItem('__marker', m), 'marker-' + Date.now());
}
const RESTART_MODE = process.env.RESTART_MODE || 'blank';
if (RESTART_MODE === 'reload') {
  await goOnline(pg);
  await pg.addInitScript(() => {
    try {
      window.__cacheAtBoot = window.localStorage.getItem('ascnd_rq_cache');
      window.__markerAtBoot = window.localStorage.getItem('__marker');
    } catch (e) { window.__cacheAtBoot = 'READ-ERR ' + e.message; }
  });
  await pg.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
} else {
  await pg.goto('about:blank');
  await goOnline(pg);
}
await pg.addInitScript(() => {
  try {
    window.__cacheAtBoot = window.localStorage.getItem('ascnd_rq_cache');
    window.__markerAtBoot = window.localStorage.getItem('__marker');
    window.__allKeysAtBoot = Object.keys(window.localStorage).join(',');
  } catch (e) { window.__cacheAtBoot = 'READ-ERR ' + e.message; }
});
pg.on('pageerror', (e) => console.log('[pageerror@' + new Date().toISOString().slice(14, 23) + ']', String(e.stack || e).slice(0, 400)));
if (RESTART_MODE !== 'reload') await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
const bootCache = await pg.evaluate(() => {
  const raw = window.__cacheAtBoot;
  if (!raw || raw.startsWith('READ-ERR')) return String(raw);
  try {
    const c = JSON.parse(raw);
    return 'len=' + raw.length + ' muts=' + JSON.stringify((c.clientState?.mutations ?? []).map((m) => ({ key: m.mutationKey, paused: m.state?.isPaused })));
  } catch (e) { return 'PARSE-ERR ' + e.message + ' head=' + String(raw).slice(0, 80); }
});
console.log('cache at boot:', bootCache);
const bootExtra = await pg.evaluate(() => ({ marker: window.__markerAtBoot, keys: window.__allKeysAtBoot }));
console.log('marker at boot:', bootExtra.marker, '| keys:', bootExtra.keys);
const bootCache2 = await pg.evaluate(() => {
  const raw = localStorage.getItem('ascnd_rq_cache');
  try {
    const c = JSON.parse(raw);
    return 'len=' + raw.length + ' muts=' + JSON.stringify((c.clientState?.mutations ?? []).map((m) => ({ key: m.mutationKey, paused: m.state?.isPaused })));
  } catch (e) { return 'PARSE-ERR head=' + String(raw).slice(0, 60); }
});
console.log('cache right after load:', bootCache2);
await pg.waitForTimeout(1000);
const bootCache3 = await pg.evaluate(() => {
  const raw = localStorage.getItem('ascnd_rq_cache');
  try {
    const c = JSON.parse(raw);
    return 'len=' + raw.length + ' muts=' + JSON.stringify((c.clientState?.mutations ?? []).map((m) => ({ key: m.mutationKey, paused: m.state?.isPaused })));
  } catch (e) { return 'PARSE-ERR head=' + String(raw).slice(0, 60); }
});
console.log('cache t+1s after load:', bootCache3);
await pg.waitForFunction(() => window.__qc, null, { timeout: 30000 });
await pg.evaluate(() => {
  const qc = window.__qc;
  const mc = qc.getMutationCache();
  const origBuild = mc.build.bind(mc);
  window.__buildCalls = [];
  mc.build = (client, options, state) => {
    window.__buildCalls.push({ key: options.mutationKey, status: state?.status, paused: state?.isPaused,
      hasFn: typeof client.defaultMutationOptions(options).mutationFn === 'function' });
    return origBuild(client, options, state);
  };
  const origResume = qc.resumePausedMutations.bind(qc);
  window.__resumeCalled = 0;
  qc.resumePausedMutations = (...a) => { window.__resumeCalled++; return origResume(...a); };
});
const hooks = () => pg.evaluate(() => ({ buildCalls: window.__buildCalls, resumeCalled: window.__resumeCalled }));
const probe = () => pg.evaluate(() => {
  const qc = window.__qc;
  const d = qc.getMutationDefaults(['offline-write']);
  const muts = qc.getMutationCache().getAll().map((m) => ({
    key: m.options.mutationKey, status: m.state.status, paused: m.state.isPaused,
    hasFn: typeof m.options.mutationFn === 'function',
    err: m.state.error ? String(m.state.error).slice(0, 120) : null,
    failCount: m.state.failureCount,
  }));
  return { defaultsKeys: Object.keys(d), hasDefaultFn: typeof d.mutationFn === 'function', muts };
});
let last = '';
for (let i = 0; i < 24; i++) {
  await pg.waitForTimeout(500);
  const cur = JSON.stringify(await probe());
  if (cur !== last) { console.log(`probe t+${((i + 1) * 0.5).toFixed(1)}s:`, cur.slice(0, 600)); last = cur; }
}
for (let i = 0; i < 5; i++) {
  await pg.waitForTimeout(3000);
  let raw = 'N/A';
  try { raw = await pg.evaluate(() => localStorage.getItem('ascnd_rq_cache') ? 'present,len=' + localStorage.getItem('ascnd_rq_cache').length : 'MISSING'); } catch (e) { raw = 'ERR ' + e.message.slice(0, 60); }
  console.log(`t+${(i + 1) * 3}s writes=`, JSON.stringify(writes), 'hooks=', JSON.stringify(await hooks()).slice(0, 300));
}
await b2.close();
