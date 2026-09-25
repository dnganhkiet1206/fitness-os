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
 *     `static alert() {}`. On iOS they are real.
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
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(NATIVE, 'tools', '.live-build');
const SHOTS = path.join(NATIVE, 'tools', '.live-shots');
const PORT = 8731;
import { FIXTURES, REF, UID, applyQuery, day, jwt } from './live-world.mjs';
import { requestRejection, rpcArgsRejection } from './postgrest-select.mjs';
import { RPC_FIXTURES } from './live-rpc.mjs';
import { applyWrite, unsupportedFilters } from './live-writes.mjs';
import {
  LARGE_LANGS, LARGE_TEXT, NARROW, NARROW_LANGS, NARROW_ROUTES, NARROW_ROUTES_MAIN, NARROW_ROUTES_NUTRITION, clipExempt, copyPatterns,
  enlargeText, narrowFindings,
} from './live-narrow.mjs';

const args = new Set(process.argv.slice(2));
const wantShots = args.has('--shots');
const narrowOnly = args.has('--narrow-only');
/* Chạy riêng những kịch bản có tên chứa chuỗi này — cho phép thử ngược một
   kịch bản trên một bản dựng bị phá mà không trả 35 phút của lượt đầy đủ. Bỏ
   qua mọi lượt quét và lượt bấm, và dòng tổng kết nói đúng như thế. */
const onlyArg = [...args].find((a) => a.startsWith('--only='))?.slice(7) ?? null;
/*
  ── theme, vì một bộ chạy chỉ vẽ được một thế giới ──

  Bộ này bơm phiên đăng nhập vào `localStorage` trước khi trang chạy. Theme sống
  ở cùng chỗ, dưới khoá `ascnd_theme` (xem `use-app-settings.tsx`), nên nó đi
  cùng đường: một `addInitScript` nữa, chạy TRƯỚC mã của app.

  Mặc định vẫn là không đặt gì — tức app tự quyết như trước, và mọi phép khẳng
  định cũ vẫn chạy trên đúng thế giới cũ. `--theme=light` là để CHỤP bản sáng.
*/
const themeArg = [...args].find((a) => a.startsWith('--theme='))?.slice(8);
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

async function openPage(chromium, route, mode, settleMs = 9000, { width = 402, height = 874, lang = null } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height } });
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
    errors.push(t);
  });

  /* #52: một BẢN SAO thế giới cho mỗi trang, và lệnh ghi áp vào nó
     (`live-writes.mjs`). Chế độ `empty` là thế giới chỉ có hồ sơ, như trước. */
  const world = mode === 'empty' ? { profiles: structuredClone(FIXTURES.profiles) } : structuredClone(FIXTURES);
  await page.route('**/*.supabase.co/**', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/rest/v1/')) {
      if (mode === 'fail') {
        return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"server error"}' });
      }
      const table = u.pathname.split('/')[3];
      /* #38: `/rest/v1/rpc/<tên>` là một lời gọi hàm, không phải bảng `rpc`.
         Trước đây nó rơi vào nhánh bảng dưới đây và luôn nhận `[]`, nên thẻ
         thử thách, gợi ý theo dõi, tìm người và bản xem trước Tiến trình chỉ
         từng được quét ở trạng thái rỗng. Nay: đối số phải khớp chữ ký trong
         `types.ts` (không thì 404 / PGRST202 như PostgREST), rồi kết quả tính
         từ CÙNG thế giới với các bảng (`tools/live-rpc.mjs`). Hàm không có
         fixture vẫn nhận `[]` như cũ, và được liệt kê cuối lượt. */
      if (table === 'rpc') {
        const fn = u.pathname.split('/')[4];
        const req = r.request();
        let args = {};
        if (req.method() === 'GET') args = Object.fromEntries(u.searchParams);
        else if (req.postData()) { try { args = JSON.parse(req.postData()); } catch { args = {}; } }
        const badArgs = rpcArgsRejection(fn, args);
        if (badArgs) {
          RPC_ARG_MISSES.add(
            `rpc/${fn}(${Object.keys(args).join(', ')}) — ` +
              [badArgs.extra.length && `thừa ${badArgs.extra.join(', ')}`, badArgs.missing.length && `thiếu ${badArgs.missing.join(', ')}`]
                .filter(Boolean).join('; '),
          );
          return r.fulfill({ status: badArgs.status, contentType: 'application/json', body: JSON.stringify(badArgs.body) });
        }
        const fx = RPC_FIXTURES[fn];
        if (!fx) {
          RPC_UNFIXTURED.add(fn);
          return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        }
        try {
          const out = fx.run(args, world);
          const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
          return r.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify(one && Array.isArray(out) ? (out[0] ?? null) : out),
          });
        } catch (e) {
          if (!e.rpc) throw e;
          return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify(e.rpc) });
        }
      }
      /* #35: `select=` hỏi một cột không có thật thì trả 400 như PostgREST, và
         ghi lại — một lượt quét màn hay một kịch bản có thể chỉ thấy một toast
         lỗi (hay không thấy gì), còn danh sách này nói đúng bảng và cột.
         Trước đây máy chủ giả trả hàng bất kể câu hỏi, nên bốn lệnh xoá hỏi
         `RETURNING id` trên bảng không có `id` (c227cfe) xanh ở đây suốt. */
      /* #40: không chỉ `select=` — bộ lọc, `or=`/`and=`, `order=`, `on_conflict=`,
         `columns=` (42703) và khoá của thân POST/PATCH (PGRST204) cũng phải là
         cột có thật. Trước #40, `.eq('user_idd', …)` gõ nhầm cho một màn
         "trống" ở đây, còn trên server thật nó hỏng. */
      const rejected = requestRejection(u, r.request().method(), r.request().postData());
      if (rejected) {
        SELECT_MISSES.add(
          `${r.request().method()} ${table} (${rejected.where}${rejected.where === 'select=' ? u.searchParams.get('select') : ''}) — không có cột ${rejected.bad.join(', ')}`,
        );
        return r.fulfill({ status: rejected.status, contentType: 'application/json', body: JSON.stringify(rejected.body) });
      }
      /* `applyQuery` lọc `eq`/`neq`/`in`/`is` (từ #17), rồi đọc `order=` và
         `limit=` — xem chú thích của nó trong `live-world.mjs`. Không đọc
         `gte`/`lt`; giới hạn ấy ghi ở kịch bản "nhật ký ngày khác" bên dưới
         và vẫn còn nguyên. */
      const req = r.request();
      const wrote = applyWrite(world, table, req.method(), u, req.postData(), req.headers());
      if (wrote) {
        if (!wrote.applied) WRITES_NOT_APPLIED.add(`${req.method()} ${table} (${unsupportedFilters(u).join(', ')})`);
        return r.fulfill({ status: wrote.status, contentType: 'application/json', body: wrote.body });
      }
      const rows = applyQuery(world[table] ?? [], u);
      const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
      return r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(single ? (rows[0] ?? null) : rows),
      });
    }
    return r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', role: 'authenticated' }),
    });
  });

  await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(settleMs);
  return { browser, page, errors };
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

/** App còn tin là mất mạng? (dải báo `nOffline` còn trên màn) */
async function stillOffline(page) {
  return /Ngoại tuyến — đang hiển thị|Offline — showing saved data/.test(await page.locator('body').innerText());
}

/**
 * Everything on the page a person can read — including what `innerText` cannot.
 *
 * ── the blind spot this closes ──
 *
 * `AnimatedNumber` renders a `TextInput`, because a number that counts up has
 * to be written on the UI thread and a `<Text>` cannot be. On web that is an
 * `<input>`, and an input's value is an ATTRIBUTE, not text content — so
 * `body.innerText` has never contained a single one of this app's headline
 * figures. Readiness 74, today's calories, the water total: all invisible to
 * the harness, all perfectly visible to a person.
 *
 * That is not only why the canary started failing. It means `BAD_TEXT` — the
 * scan for NaN, undefined, [object Object] — was never able to see the numbers
 * most likely to become NaN. A whole class of the bug this runner exists to
 * catch was outside its reach.
 */
async function readable(page) {
  const body = await page.locator('body').innerText().catch(() => '');
  const fields = await page
    .evaluate(() =>
      [...document.querySelectorAll('input, textarea')]
        .map((el) => (el.value ?? '').toString().trim())
        .filter(Boolean),
    )
    .catch(() => []);
  return fields.length ? `${body}\n${fields.join('\n')}` : body;
}

async function boot(chromium, route, mode, settleMs = 9000) {
  const { browser, page, errors } = await openPage(chromium, route, mode, settleMs);
  const text = await readable(page);
  const rootLen = await page.evaluate(() => document.getElementById('root')?.innerHTML?.length ?? 0);
  if (wantShots) {
    const dir = path.join(SHOTS, themeArg ? `${themeArg}-${mode}` : mode);
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${route === '/' ? 'today' : route.slice(1).replace(/\//g, '-')}.png`) });
  }
  await browser.close();
  return { text, rootLen, errors };
}

// ── pressing things ───────────────────────────────────────────────────────

/**
 * Everything about the page that a working control could plausibly change.
 *
 * Deliberately coarse. The question is not "did the right thing happen" — that
 * is what the scripted scenarios below are for — but "did *anything* happen".
 * A control that leaves all four of these identical did nothing at all, and
 * that is the bug: not a wrong outcome, an absent one.
 */
async function snapshot(page) {
  return page.evaluate(() => ({
    url: location.pathname,
    len: document.getElementById('root')?.innerHTML?.length ?? 0,
    /* Cùng lý do như `readable` ở trên: giá trị của một input không nằm trong
       innerText, mà mọi con số lớn trên app này đều là input. */
    text: [
      document.body.innerText || '',
      ...[...document.querySelectorAll('input, textarea')].map((el) => (el.value ?? '').toString()),
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, 4000),
    focus: document.activeElement?.tagName ?? '',
  }));
}
const changed = (a, b) => a.url !== b.url || a.len !== b.len || a.text !== b.text;

/**
 * Press every control on a screen and require the app to react.
 *
 * ── the bug this generalises ──
 *
 * `auth-screen.tsx` had `if (!email) return;` at the top of `submit`, and a
 * second silent `return` for the password. Tapping Sign In with a blank field
 * changed nothing: no message, no highlight, no haptic. On the first screen of
 * the app a dead tap does not read as "you missed a field", it reads as the app
 * being broken — and there is nothing to file a bug report about, because
 * nothing happened.
 *
 * ── why a control may legitimately do nothing ──
 *
 * The first real run of this rule produced five findings and **not one of them
 * was a dead button**. Every one exposed a flaw in the rule instead, and each
 * flaw is now a named exclusion rather than a silent tolerance:
 *
 *   1. **Disabled.** A control that says it will do nothing has answered the
 *      question. That is also how Sign In was fixed — the button dims until the
 *      form is complete — so the rule and the fix agree instead of fighting.
 *
 *   2. **Already selected.** "All" on the weight chart is the default range;
 *      pressing the segment you are already on correctly changes nothing.
 *      `aria-selected` / `aria-checked` is the control saying so.
 *
 *   3. **Covered.** `headerRight` buttons sit at y≈8, and on web the tab bar is
 *      drawn over that strip — `elementFromPoint` returns a different div and a
 *      real click times out. The first version passed `force: true`, which
 *      dispatches at the coordinates anyway, so the overlay swallowed the press
 *      and a perfectly good button was reported dead. Forcing turned "I cannot
 *      reach this" into "this does nothing", which are opposite findings. It is
 *      also a web-only layout: iOS puts the tabs at the bottom.
 *
 *   4. **Its whole job is a confirm dialog.** `react-native-web`'s Alert is
 *      literally `static alert() {}` — an empty function. Every `Alert.alert`
 *      confirmation in the app is therefore silent *on web* and correct on iOS.
 *      Nothing about the app can be learned by pressing those here.
 *
 * The lesson worth keeping is the one about `force`: a harness that makes a
 * control reachable when a user's finger could not is not testing the app the
 * user has.
 *
 * Navigation counts as a reaction, so after each press the page is returned to
 * where it started; otherwise the second control would be pressed on a screen
 * it does not belong to.
 */
/**
 * Controls whose only action is a confirm dialog.
 *
 * `react-native-web` ships `class Alert { static alert() {} }` — an empty
 * function — so these are silent here and correct on a phone. Listed by name
 * with the reason, rather than tolerated silently, because the day one of them
 * grows a real behaviour it should come back off this list.
 */
const CONFIRM_ONLY = new Set(['Delete account', 'Xoá tài khoản', 'Sign out', 'Đăng xuất']);

/**
 * Does anything else in this control's own group react?
 *
 * Answers "already selected" without needing an attribute the web layer throws
 * away. A segmented control has its buttons under one parent; pressing the
 * neighbour of the current option changes the screen, pressing the current
 * option does not, and that difference is the whole answer.
 */
async function siblingReacts(page, control) {
  try {
    const sibs = control.locator('xpath=../*[@role="button"]');
    const n = Math.min(await sibs.count(), 4);
    for (let j = 0; j < n; j++) {
      const sib = sibs.nth(j);
      const before = await snapshot(page);
      try {
        await sib.click({ timeout: 1500 });
      } catch {
        continue;
      }
      await page.waitForTimeout(1200);
      if (changed(before, await snapshot(page))) return true;
    }
  } catch {
    // no siblings, detached, or navigated away — not evidence either way
  }
  return false;
}

async function pressEverything(page, label, problems) {
  const controls = page.locator('[role="button"]:visible, button:visible');
  const total = Math.min(await controls.count(), 14);
  const home = page.url();
  let tried = 0;
  let skipped = 0;

  for (let i = 0; i < total; i++) {
    const c = controls.nth(i);
    let name = '';
    try {
      if (!(await c.isVisible())) continue;
      name = ((await c.getAttribute('aria-label')) || (await c.innerText()) || '').trim().slice(0, 40);
      if (!name) continue; // unnamed controls are `tap-targets.mjs`'s problem

      const off = (await c.getAttribute('aria-disabled')) === 'true' || (await c.isDisabled().catch(() => false));
      const on = (await c.getAttribute('aria-selected')) === 'true' || (await c.getAttribute('aria-checked')) === 'true';
      if (off || on || CONFIRM_ONLY.has(name)) {
        skipped++;
        continue;
      }
      /* Back only means something with somewhere to go. These screens are
         opened directly by URL, so a stack that was never pushed onto has no
         previous entry and the button is right to do nothing. */
      if (/^(Go back|Quay lại|Back)$/i.test(name) && (await page.evaluate(() => history.length)) <= 2) {
        skipped++;
        continue;
      }
    } catch {
      continue;
    }

    const before = await snapshot(page);
    try {
      /* No `force`. A forced click dispatches at the coordinates whatever is on
         top, so an element under an overlay looks pressed and then looks dead —
         reporting "does nothing" for something a finger could not have reached.
         Letting the click time out keeps those two findings apart. */
      await c.click({ timeout: 2500 });
    } catch {
      skipped++;
      continue;
    }
    tried++;
    await page.waitForTimeout(1400);
    const after = await snapshot(page);

    if (!changed(before, after)) {
      /*
        ── dead, or simply the option you are already on ──

        The weight chart's range segments declare `accessibilityState={{
        selected }}`, which VoiceOver reads on iOS whatever the role is — but
        `react-native-web` drops it, because `aria-selected` is not valid on
        `role="button"`. Measured: the DOM carries `role=button` and nothing
        else. So on this harness there is no attribute to read, and "All"
        (the default range) looked like a dead button three runs running.

        Naming it in a list would fix that one segment and none of the others.
        The question a person would actually ask is better: *does the rest of
        this group work?* If a sibling under the same parent changes the screen,
        the group is alive and this control was the one already chosen. If no
        sibling does anything either, it stays a finding.
      */
      const groupAlive = await siblingReacts(page, c);
      if (page.url() !== home) {
        await page.goto(home, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
      }
      if (!groupAlive) {
        problems.push(
          `${label}: bấm "${name}" mà màn hình không đổi gì — ` +
            'không điều hướng, không thông báo, không một ký tự nào khác, ' +
            'và các nút cùng nhóm cũng vậy. ' +
            'Nút chết không đọc thành "bạn thiếu gì đó", nó đọc thành app hỏng. ' +
            'Nếu nó cố ý chưa dùng được thì phải để disabled.',
        );
      } else {
        skipped++;
      }
    }

    if (page.url() !== home) {
      await page.goto(home, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
    }
  }
  return { tried, skipped };
}

/**
 * The handful of flows worth stating exactly.
 *
 * `pressEverything` asks whether anything happened. These ask whether the right
 * thing did, and they are written out one at a time because there is no way to
 * infer intent from a DOM.
 */
const SCENARIOS = [
  {
    /*
      Màn hình ĐỨNG YÊN thì cái gì vẫn đang chạy?

      ── vì sao bước này tồn tại ──

      Người dùng báo app "rất nóng khi mở lâu" trên iPhone 16 Pro Max. Nhiệt là
      việc chạy liên tục, và không một ảnh chụp nào thấy được nó: một vòng lặp
      vĩnh viễn trông y hệt một màn hình đứng im.

      Nên bước này ngồi yên trên Today, không chạm gì, và ĐẾM số lần style bị
      ghi lại. Đo lần đầu: ~696 lần mỗi giây, năm phần tử đầu bảng đều là nhân
      vật, cộng một chấm nhịp 60/giây. Đó là thứ đang sinh nhiệt.

      ── ngưỡng là một NGÂN SÁCH, không phải một con số đẹp ──

      Nó không bắt app phải đứng im: nhân vật có quyền thở, chấm trạng thái có
      quyền nhịp. Nó bắt số thứ đang chạy phải ĐẾM ĐƯỢC — thêm một vòng lặp
      vĩnh viễn nữa thì bước này đỏ, và người thêm phải nói ra vì sao.

      Ngưỡng SỐ PHẦN TỬ là 6, đúng bằng con số đo được, và nó chặt như vậy vì
      bản đầu không chặt: tôi đặt 9 để "nới một nửa", rồi phép thử ngược gỡ cổng
      của lớp aura ra — thêm đúng một vòng lặp vĩnh viễn — và bước này vẫn XANH.
      Một cái lưới có lỗ to bằng con cá nó phải bắt thì không phải cái lưới.

      Sáu là: năm phần tử của nhân vật, cộng chấm nhịp của thẻ sẵn sàng. Thêm
      MỘT thứ chạy mãi nữa là đỏ, và người thêm phải nói ra vì sao — đó chính là
      việc của bước này. Con số này được phép tăng; nó không được phép tăng
      trong im lặng.

      Ngưỡng lần-ghi-mỗi-giây nới hơn (900 so với ~700 đo được) vì nó thật sự
      dao động giữa hai lần chạy; số phần tử thì không.

      ── và vì sao harness KHÔNG thấy hết ──

      Web chạy 60Hz, nên `FIGURE_FPS` 120 hay 60 ở đây ra cùng một con số. Bước
      này canh "có bao nhiêu thứ chạy mãi", không canh "chúng chạy nhanh bao
      nhiêu". Nửa sau chỉ máy thật trả lời được.
    */
    name: 'đứng yên: không có vòng lặp vĩnh viễn nào mới',
    route: '/', mode: 'full',
    async run(page) {
      /* Chờ mọi hiệu ứng VÀO chạy xong — chúng có quyền động, và đếm chúng là
         đếm nhầm. Cascade dài nhất trong app là 600ms. */
      await page.waitForTimeout(8000);
      const out = await page.evaluate((secs) => new Promise((done) => {
        const hits = new Map();
        const obs = new MutationObserver((ms) => {
          for (const m of ms) {
            if (m.type !== 'attributes') continue;
            const el = m.target;
            if (!(el instanceof Element)) continue;
            if (!el.__idleKey) {
              const r = el.getBoundingClientRect();
              el.__idleKey = `${el.tagName.toLowerCase()} ${Math.round(r.width)}×${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)}`;
            }
            hits.set(el.__idleKey, (hits.get(el.__idleKey) ?? 0) + 1);
          }
        });
        obs.observe(document.body, {
          attributes: true, subtree: true,
          attributeFilter: ['style', 'transform', 'd', 'opacity', 'fill', 'cx', 'cy', 'r', 'points'],
        });
        setTimeout(() => {
          obs.disconnect();
          const rows = [...hits].sort((a, b) => b[1] - a[1]);
          done({ n: rows.length, total: rows.reduce((s, r) => s + r[1], 0), top: rows.slice(0, 4) });
        }, secs * 1000);
      }), 5);

      const perSec = Math.round(out.total / 5);
      if (out.n > 6) {
        return `có ${out.n} phần tử vẫn động khi màn hình đứng yên (ngân sách 6: năm của nhân vật ` +
          `cộng chấm nhịp thẻ sẵn sàng). Nặng nhất: ` +
          out.top.map(([k, v]) => `${k} ${Math.round(v / 5)}/s`).join('; ');
      }
      if (perSec > 900) {
        return `khi đứng yên vẫn ghi ${perSec} lần style mỗi giây (ngân sách 900). Nặng nhất: ` +
          out.top.map(([k, v]) => `${k} ${Math.round(v / 5)}/s`).join('; ');
      }

      /*
        ── lần đo THỨ HAI, sau ngưỡng không-ai-chạm ──

        Không chạm gì thì sau `IDLE_MS` (20 giây) nhân vật phải ĐỨNG HÌNH. Đây
        là nửa quan trọng nhất của bài toán nhiệt: màn hình đứng yên là trạng
        thái MẶC ĐỊNH của một app đang mở lâu, không phải ngoại lệ.

        Lần đo đầu ở trên nằm gọn trong 20 giây ấy, nên nó đo trạng thái CÒN
        CHẠY. Lần này đo trạng thái đã lặng, và kỳ vọng ngược lại — chỉ còn chấm
        nhịp của thẻ sẵn sàng, thứ KHÔNG nằm trong thay đổi này.

        Hai lần đo ngược chiều nhau là điều kiện để bước này có răng: một bản
        đóng băng nhân vật vĩnh viễn qua được lần hai và trượt lần một; một bản
        không bao giờ lặng thì ngược lại.
      */
      await page.waitForTimeout(9000);
      /* Đếm KHÔNG đủ: một con số trần chỉ nói "còn thứ gì đó chạy", và thứ
         đầu tiên phải làm khi thấy nó là đi tìm xem thứ đó là gì. Nên phép đo
         tự gọi tên, kèm nhịp — hai thứ đó biến một lần đỏ thành một địa chỉ. */
      const late = await page.evaluate((secs) => new Promise((done) => {
        const hits = new Map();
        const obs = new MutationObserver((ms) => {
          for (const m of ms) {
            if (m.type !== 'attributes' || !(m.target instanceof Element)) continue;
            const el = m.target;
            if (!el.__lateKey) {
              const r = el.getBoundingClientRect();
              el.__lateKey = `${el.tagName.toLowerCase()} ${Math.round(r.width)}×${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)}`;
            }
            hits.set(el.__lateKey, (hits.get(el.__lateKey) ?? 0) + 1);
          }
        });
        obs.observe(document.body, {
          attributes: true, subtree: true,
          attributeFilter: ['style', 'transform', 'd', 'opacity', 'fill', 'cx', 'cy', 'r', 'points'],
        });
        setTimeout(() => {
          obs.disconnect();
          const rows = [...hits].sort((a, b) => b[1] - a[1]);
          done({ n: rows.length, rows: rows.slice(0, 5).map(([k, v]) => `${k} ${Math.round(v / secs)}/s`) });
        }, secs * 1000);
      }), 5);

      if (late.n > 2) {
        return `sau 20 giây không ai chạm vẫn còn ${late.n} phần tử động (chờ tối đa 2: chấm nhịp thẻ ` +
          `sẵn sàng): ${late.rows.join('; ')}. Nhân vật không đứng hình khi không ai nhìn — đó là toàn ` +
          'bộ bài toán "máy nóng"';
      }
      if (out.n <= 2) {
        return `TRƯỚC ngưỡng không-ai-chạm đã chỉ còn ${out.n} phần tử động — nhân vật đứng hình quá ` +
          'sớm, hoặc nó không bao giờ chạy';
      }
      return null;
    },
  },
  {
    /*
      Năm thẻ hero chồng khít lên nhau, và không có luật tĩnh nào thấy được.

      ── lỗi ──

      `CardDeck` đặt từng trang bằng `translateX: (index - at.value) * (width ||
      1)` trong một worklet, với `width` là `useState` do `onLayout` ghi. Ở lần
      render đầu `width` còn 0, nên `width || 1` cho ra MỘT ĐIỂM: năm trang nằm
      ở x = 0, 1, 2, 3, 4, mỗi trang vẫn rộng đủ màn hình vì chúng lấy bề rộng
      từ cha. Năm vòng tròn lồng nhau, năm dòng tiêu đề đè lên nhau, năm con số
      cùng một chỗ.

      `useAnimatedStyle` đóng băng lần chạy đầu và chỉ mapper mới ghi đè. Bình
      thường mapper chạy ngay sau đó nên đó chỉ là một khung hình — nhưng "chỉ
      một khung hình" là điều kiện chứ không phải bảo đảm. Người dùng báo màn
      Today kẹt ở đúng trạng thái ấy sau khi vào Cài đặt rồi thoát ra, và kéo để
      tải lại không cứu được: thứ hỏng là BỐ CỤC, không phải dữ liệu.

      ── vì sao là ở đây ──

      `tools/measured-worklet.mjs` đọc mã và bỏ sót ca này, vì phép đo đi qua
      RANH GIỚI component dưới dạng prop — hình dạng mà chính nó gọi là bản sửa.
      Đúng, nhưng chỉ khi component con KHÔNG ĐƯỢC MOUNT trước lúc đo xong, và
      điều kiện đó thì đọc mã không thấy. Cái thấy được là vị trí thật của năm
      cái hộp, trên một trang đang chạy, ở khung hình đầu tiên chúng tồn tại.

      Đã đo trên bản đã ship: mốc 200ms → x = 0,1,2,3,4. Sau bản sửa: trang chỉ
      xuất hiện khi đã đo xong, và lần đầu thấy chúng là ở 0,402,804,1206,1608.
    */
    name: 'deck hero: trang không chồng nhau, và cú vuốt không nhảy',
    route: '/', mode: 'full',
    async run(page) {
      /* Sân khấu là hộp bị cắt; các trang là con tuyệt đối của nó. Neo vào
         `overflow: hidden` để các lớp aura/scrim — cũng tuyệt đối — không bị
         nhầm là trang. */
      const deck = () =>
        page.evaluate(() => {
          const stages = [...document.querySelectorAll('*')].filter((d) => {
            const s = getComputedStyle(d);
            return s.overflow === 'hidden' || s.overflowX === 'hidden';
          });
          let best = [];
          for (const st of stages) {
            let kids = [...st.children].filter((c) => getComputedStyle(c).position === 'absolute');
            /* các trang nằm trong một "đường ray" trượt chung */
            if (kids.length === 1) kids = [...kids[0].children];
            if (kids.length > best.length) best = kids;
          }
          return best.map((e) => Math.round(e.getBoundingClientRect().x));
        });

      /*
        TẢI LẠI trước khi đo, và đây là chỗ bản đầu của phép kiểm này tự lừa
        mình: `openPage` đã đợi 9 giây cho trang yên rồi mới gọi `run`, mà trạng
        thái hỏng chỉ sống trong khoảng 250ms ĐẦU TIÊN sau khi deck mount. Bản
        ấy chạy XANH trên chính bản mã đã hỏng. Một phép kiểm nhìn muộn hơn lỗi
        thì không đo gì cả.

        Nên nó tự dựng lại trang và lấy mẫu ngay từ khung hình đầu. Nhịp 60ms:
        deck xuất hiện rồi sửa lại trong vòng vài trăm mili giây, nên lấy mẫu
        thưa hơn là bỏ lỡ.
      */
      await page.reload({ waitUntil: 'domcontentloaded' });
      let seen = 0;
      let worst = null;
      for (let i = 0; i < 150; i++) {
        const xs = await deck();
        if (xs.length >= 3) {
          seen++;
          const gaps = xs.slice(1).map((x, k) => Math.abs(x - xs[k]));
          const min = Math.min(...gaps);
          if (worst === null || min < worst.min) worst = { min, xs: xs.join(',') };
        }
        await page.waitForTimeout(60);
      }
      if (seen === 0) return 'không tìm thấy deck hero trên trang — phép đo này không đo gì cả';
      /* Một bề rộng màn hình là 402 ở khung nhìn này; bất cứ khoảng cách nào
         dưới một nửa số đó nghĩa là các trang đang đè lên nhau. */
      if (worst.min < 150) {
        return `năm trang hero chồng lên nhau: x = ${worst.xs} (khoảng cách nhỏ nhất ${worst.min}px). ` +
          'Đó là `width || 1` chạy khi số đo còn 0 — mỗi trang lệch nhau đúng một điểm, ' +
          'vẫn rộng đủ màn hình, nên chúng vẽ chồng khít';
      }

      /*
        ── và cú vuốt ──

        Bản sửa ĐẦU TIÊN cho lỗi chồng trang ở trên đã tự đẻ ra một lỗi thứ hai,
        và nó chỉ lộ ra khi vuốt. Nó bọc các trang trong một "đường ray" mang
        `left: -page * width` (state React) rồi để worklet tính phần lẻ. Cộng
        lại đúng, nhưng cùng một `page` khi đó nằm ở HAI đường ống không đồng bộ
        — commit của React và luồng UI của Reanimated — nên ngay lúc cú vuốt
        dừng, có những khung hình lệch nguyên một bề rộng màn hình.

        Nên phép đo này vuốt thật rồi theo dõi từng mẫu: khoảng cách giữa các
        trang phải GIỮ NGUYÊN suốt cú vuốt (không thì bố cục đang trôi), và deck
        không được NHẢY (không thì hai nguồn đang cãi nhau). Cuối cùng nó phải
        thật sự sang trang mới — một deck đứng im cũng thoả hai điều kiện trên.
      */
      const before = await deck();
      const gap = before[1] - before[0];
      const y = 430;
      await page.mouse.move(320, y);
      await page.mouse.down();
      for (const x of [300, 270, 240, 210, 180, 150, 120]) {
        await page.mouse.move(x, y);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();

      const trace = [];
      for (let i = 0; i < 60; i++) {
        trace.push(await deck());
        await page.waitForTimeout(16);
      }
      for (const xs of trace) {
        if (xs.length < 3) continue;
        const gaps = xs.slice(1).map((x, k) => x - xs[k]);
        const off = gaps.find((g) => Math.abs(g - gap) > 2);
        if (off !== undefined) {
          return `giữa cú vuốt, khoảng cách giữa hai trang là ${off} thay vì ${gap} — ` +
            'bố cục của deck đang trôi trong lúc nó trượt';
        }
      }
      const head = trace.map((xs) => xs[0]);
      for (let i = 1; i < head.length; i++) {
        if (Math.abs(head[i] - head[i - 1]) > gap / 2) {
          return `deck NHẢY giữa cú vuốt: ${head[i - 1]} → ${head[i]} trong một khung hình ` +
            `(nửa bề rộng là ${gap / 2}). Hai nguồn đang cùng đặt vị trí và chúng lệch pha`;
        }
      }
      if (Math.abs(head[head.length - 1] - (before[0] - gap)) > 4) {
        return `vuốt sang trái mà deck không dừng ở trang kế: x của trang đầu là ` +
          `${head[head.length - 1]}, chờ ${before[0] - gap}`;
      }
      return null;
    },
  },
  {
    /*
      An animation is the one thing a screenshot cannot answer.

      Every rule about the segmented control reads the source: it says
      `translateX`, it says `withTiming`, it does not animate layout. All of
      that can be true of a control that still jumps, and this project has been
      caught twice by exactly that gap — a shadow whose props were correct and
      drew nothing, and a companion whose opacity multiplier was read but never
      written. So this presses the segment and watches where the pill actually
      is, twice, while it should still be moving.
    */
    name: 'segmented: viên chọn ĐI sang mục mới chứ không nhảy cóc',
    route: '/nutrition', mode: 'full',
    async run(page) {
      /*
        Không gọi tên mục nào bằng chữ.

        Bản trước bấm `getByRole('tab', { name: 'Foods' })` và neo hàng bằng
        nhãn 'Today'. Nutrition sau đó tách nhóm TRA CỨU ra trang riêng, mục
        'Foods' biến mất, và bước này chết ở `click: Timeout 30000ms` — 30 giây
        chờ một thứ không còn tồn tại, nói đúng là nó hỏng nhưng không nói được
        vì sao. Một chuỗi ký tự trong bài kiểm là một BẢN SAO của quyết định sản
        phẩm, và bản sao thì mục ruỗng lặng lẽ.

        Nên hàng và cả hai mục đều đọc ra từ DOM: hàng segmented là hàng có từ
        hai `role="tab"` trở lên VÀ một con nằm tuyệt đối không phải tab — tức
        viên trượt. Thanh tab dưới cùng có `role="tab"` nhưng capsule của nó nằm
        TRONG mỗi tab chứ không phải anh em của chúng, nên nó không lọt. Nếu có
        hơn một hàng thoả, bước này nói thẳng ra chứ không bốc đại một hàng.
      */
      const probe = () =>
        page.evaluate(() => {
          const rows = new Map();
          for (const t of document.querySelectorAll('[role="tab"]')) {
            const p = t.parentElement;
            if (!p) continue;
            if (!rows.has(p)) rows.set(p, []);
            rows.get(p).push(t);
          }
          const found = [];
          for (const [row, tabs] of rows) {
            if (tabs.length < 2) continue;
            const pill = [...row.children].find(
              (c) => c.getAttribute('role') !== 'tab' && getComputedStyle(c).position === 'absolute',
            );
            if (!pill) continue;
            found.push({
              x: pill.getBoundingClientRect().x,
              labels: tabs.map((t) => t.getAttribute('aria-label') ?? t.textContent?.trim() ?? ''),
              on: tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'),
            });
          }
          return found;
        });

      const first = await probe();
      if (first.length === 0) return 'không tìm thấy hàng segmented nào có viên trượt';
      if (first.length > 1) {
        return `có ${first.length} hàng segmented trên màn — bước này không biết đang đo hàng nào`;
      }
      const { x: start, labels, on } = first[0];
      /* `on` là -1 khi không mục nào khai aria-selected; mục 0 vẫn là mục đang
         mở lúc mới vào màn, nên "mục khác" vẫn xác định được. */
      const target = labels.find((_, i) => i !== (on < 0 ? 0 : on));
      if (!target) return `hàng segmented chỉ có một mục (${labels.join(', ')}) — không có gì để đi sang`;

      const pillX = async () => {
        const rows = await probe();
        return rows.length === 1 ? rows[0].x : null;
      };

      await page.getByRole('tab', { name: target, exact: true }).click();
      /*
        70ms, và con số này CỐ Ý không được lấy từ `pick-row.tsx`.

        Quãng đi ở đó đã đổi ba lần trong ít commit gần đây — 220ms timing, rồi
        240ms (`duration.move`), rồi `spring(0.25, 0)` — nên chép nó vào đây là
        đặt thêm một bản sao nữa vào chỗ vừa mục ruỗng một lần. Bước này chỉ cần
        một mốc NGẮN HƠN MỌI quãng đi mà bảng từ vựng chuyển động cho phép, và
        70ms nằm dưới cả `duration.toggle`.

        Nếu một ngày quãng đi bị rút xuống dưới 70ms thì bước này nói "viên chọn
        NHẢY thẳng tới đích" — sai chẩn đoán nhưng đúng cảnh báo, và nó ồn chứ
        không im. Đó là chiều hỏng đúng để chọn.
      */
      await page.waitForTimeout(70);
      const mid = await pillX();
      await page.waitForTimeout(600);
      const end = await pillX();

      if (mid == null || end == null) return 'mất dấu viên chọn giữa chừng';
      if (Math.abs(end - start) < 4) {
        return `bấm sang ${target} mà viên chọn không dịch (${start} → ${end})`;
      }
      if (Math.abs(mid - end) < 2) {
        return `viên chọn NHẢY thẳng tới đích: sau 70ms đã ở ${mid}, đích là ${end} — không có chuyển động`;
      }
      if (Math.abs(mid - start) < 2) {
        return `viên chọn chưa nhúc nhích sau 70ms (${mid}) — hoặc nó không chạy, hoặc quá chậm`;
      }
      return null;
    },
  },
  {
    name: 'màn đăng nhập: nút mờ khi thiếu trường, sáng khi đủ',
    route: '/', mode: 'signedout',
    async run(page) {
      const opacity = () =>
        page.getByText('Sign In', { exact: true })
          .evaluate((el) => getComputedStyle(el.closest('[role="button"]') ?? el.parentElement).opacity);
      const blank = Number(await opacity());
      await page.getByPlaceholder('Email').fill('a@b.com');
      await page.waitForTimeout(400);
      const halfway = Number(await opacity());
      await page.getByPlaceholder('Password').fill('secret123');
      await page.waitForTimeout(400);
      const complete = Number(await opacity());

      if (!(blank < 0.9)) return 'ô trống mà nút vẫn sáng — bấm vào sẽ không có gì xảy ra';
      if (!(halfway < 0.9)) return 'mới có email mà nút đã sáng — thiếu mật khẩu vẫn bấm được';
      if (!(complete > 0.9)) return 'đã nhập đủ mà nút vẫn mờ — không vào được app';
      return null;
    },
  },
  {
    name: 'màn đăng nhập: đổi ngôn ngữ đổi chữ trên màn hình',
    route: '/', mode: 'signedout',
    async run(page) {
      const before = await readable(page);
      await page.getByText('VI', { exact: true }).click();
      await page.waitForTimeout(900);
      const after = await readable(page);
      if (before === after) return 'bấm VI mà không chữ nào đổi';
      if (!/Đăng nhập/.test(after)) return `đã đổi sang VI nhưng không thấy tiếng Việt: ${after.slice(0, 80)}`;
      return null;
    },
  },
  {
    /*
      #44: lọc bài theo loại trên hồ sơ, Ở SERVER. Linh Phạm có cả ba loại; bấm
      "Công thức" thì chỉ còn thẻ công thức ("Thêm vào bữa ăn"), không còn thẻ
      buổi tập ("Thử workout").
    */
    name: 'Hồ sơ: lọc bài theo loại',
    route: '/community-user?id=c0000000-0000-4000-8000-0000000011a1', mode: 'full',
    async run(page) {
      const chip = page.getByRole('button', { name: /^(Công thức|Recipes)$/ }).or(page.getByRole('tab', { name: /^(Công thức|Recipes)$/ })).first();
      if ((await chip.count()) === 0) return 'không thấy hàng lọc theo loại trên hồ sơ có ba loại bài';
      await chip.click({ force: true });
      await page.waitForTimeout(2500);
      const body = await readable(page);
      if (!/Thêm vào bữa ăn|Add to a meal/.test(body)) return 'lọc "Công thức" mà không thấy thẻ công thức';
      if (/Thử workout|Try workout/.test(body)) return 'lọc "Công thức" mà vẫn còn thẻ buổi tập';
      return null;
    },
  },
  {
    /* …và hồ sơ chỉ có MỘT loại bài thì không có hàng lọc nào để bấm. */
    name: 'Hồ sơ: một loại bài thì không có hàng lọc',
    route: '/community-user?id=c0000000-0000-4000-8000-00000000a5cd', mode: 'full',
    async run(page) {
      const n = await page.getByRole('button', { name: /^(Tất cả|All)$/ }).or(page.getByRole('tab', { name: /^(Tất cả|All)$/ })).count();
      return n === 0 ? null : 'hồ sơ chỉ có bài buổi tập mà vẫn hiện hàng lọc';
    },
  },
  {
    /*
      #19: ô tìm người hỏi server theo chuỗi đã chuẩn hoá (bỏ `@`, chữ thường),
      KHÔNG hỏi khi mới một ký tự (một ký tự khớp gần hết bảng), và trễ 250ms
      nên gõ liền nhiều phím chỉ ra một lượt hỏi. Đếm chính các request RPC.
    */
    name: 'Tìm người: một ký tự không hỏi, hai ký tự hỏi đúng một lần',
    route: '/community-search', mode: 'full',
    async run(page) {
      const asked = [];
      page.on('request', (q) => {
        if (q.url().includes('/rpc/community_search_profiles')) asked.push(q.postData() ?? '');
      });
      const box = page.getByPlaceholder(/^(Tên hoặc @handle|Name or @handle)$/);
      if ((await box.count()) === 0) return 'không thấy ô tìm người';
      await box.fill('@');
      await box.pressSequentially('L', { delay: 30 });
      await page.waitForTimeout(700);
      if (asked.length) return `mới một ký tự mà đã hỏi server: ${asked.join(' | ')}`;
      await box.pressSequentially('i', { delay: 30 });
      await page.waitForTimeout(900);
      if (asked.length !== 1) return `gõ "@Li" phải hỏi đúng MỘT lần, ra ${asked.length}`;
      if (!/"p_q"\s*:\s*"li"/.test(asked[0])) return `chuỗi gửi đi phải là "li" (bỏ @, chữ thường), ra ${asked[0]}`;
      return null;
    },
  },
  {
    /*
      #27 (B tìm ra): Thích/Lưu hỏng từng đổi dấu rồi âm thầm đổi ngược — người
      ta tưởng bấm hụt. Cho MỌI lệnh ghi vào community_likes trả 500 (đọc vẫn
      chạy), rồi đòi: một thanh toast có chữ, không phải chữ của server (#31),
      và nhãn của nút ("Thích · 128") trở về đúng như trước. Nhãn chứ không
      phải trạng thái chọn: trên web `accessibilityState.selected` không thành
      thuộc tính nào (xem pick-row), còn con số trong nhãn thì có.

      #46: đo CẢ HAI đường. Bản cũ bấm nút Thích đầu tiên — bài ấy UID đã
      thích sẵn, nên nó chỉ từng đo BỎ thích (DELETE + confirmWrite); đường
      THÍCH (INSERT, nhánh 23505) chưa từng chạy, và ở #31 chính điều đó làm
      lỗi thứ hai lộ ra muộn. Đường nào là đường nào thì đọc từ LỆNH GHI đi
      ra, không đoán theo thứ tự feed: sửa fixture hay đổi cách xếp feed
      không làm vế này âm thầm đo lại một đường.
    */
    name: 'Cộng đồng: Thích hỏng thì báo lỗi và trả dấu về (cả Thích lẫn Bỏ thích)',
    route: '/community', mode: 'full',
    run: (page) => bothWritePaths(page, 'community_likes', /^(Thích|Like) · \d+$/, true),
  },
  {
    /*
      #41: thử thách đã hoàn thành phải còn chỗ để thấy. Fixture: UID theo
      "30 ngày kỷ luật" (đang tham gia), "Tháng mới: 20 buổi" chưa mở (sắp bắt
      đầu), và "Tháng 7: 12 buổi" đã nhận 150 xu, hết hạn 46 ngày trước —
      tổng quan KHÔNG còn nó, chỉ `community_challenge_history` có.

      Bắt đầu bằng MỞ THẲNG màn chi tiết của nó, lúc cache còn trống — như từ
      một thông báo, hay khi app mở lại. Bản đầu của kịch bản đi danh sách →
      chi tiết, và phép thử ngược (tắt lượt đọc lịch sử của màn chi tiết) vẫn
      XANH: danh sách đã nạp lịch sử vào cache, nên màn chi tiết thấy nó mà
      không cần hỏi. Rồi mới đi qua link sang danh sách, và quay lại dòng ấy.
    */
    name: 'Thử thách: mở thẳng thử thách đã hoàn thành, trang tất cả có lịch sử',
    route: '/community-challenge?id=c4a11e00-0000-4000-8000-000000000003', mode: 'full',
    async run(page) {
      const detail = async (where) => {
        const t = await page.locator('body').innerText();
        if (/không còn nữa|no longer available/i.test(t)) return `${where}: thử thách đã hoàn thành ra "không còn nữa" — màn chi tiết chỉ đọc tổng quan`;
        if (!/Đã nhận thưởng|Reward claimed/.test(t)) return `${where}: không nói "Đã nhận thưởng"`;
        if (!/150/.test(t)) return `${where}: không hiện phần thưởng đã nhận (150)`;
        return null;
      };
      const direct = await detail('mở thẳng');
      if (direct) return direct;

      const link = page.getByRole('link', { name: /Tất cả thử thách|All challenges/ });
      if ((await link.count()) !== 1) return 'màn chi tiết không có lối sang trang tất cả thử thách';
      await link.click();
      await page.waitForTimeout(2500);
      const text = await page.locator('body').innerText();
      for (const [group, title] of [
        [/Đang tham gia|Joined/, '30 ngày kỷ luật'],
        [/Sắp bắt đầu|Starting soon/, 'Tháng mới: 20 buổi'],
        [/Đã hoàn thành|Completed/, 'Tháng 7: 12 buổi'],
      ]) {
        if (!group.test(text)) return `trang tất cả: thiếu nhóm ${group}`;
        if (!text.includes(title)) return `trang tất cả: thiếu thử thách "${title}"`;
      }
      const done = page.getByRole('button', { name: /^Tháng 7: 12 buổi, / });
      if ((await done.count()) !== 1) return 'trang tất cả: không có đúng một dòng "Tháng 7: 12 buổi"';
      const label = await done.getAttribute('aria-label');
      if (!/\+150/.test(label)) return `dòng đã hoàn thành phải mang số xu đã vào sổ (+150), ra "${label}"`;
      await done.click();
      await page.waitForTimeout(2500);
      const back = await detail('mở từ danh sách');
      if (back) return back;
      /* Mở từ danh sách thì nút Quay lại đã là đường về; link sẽ đẩy thêm một
         trang danh sách nữa lên ngăn xếp. */
      if ((await page.getByRole('link', { name: /Tất cả thử thách|All challenges/ }).count()) !== 0) {
        return 'mở từ danh sách mà màn chi tiết vẫn mời sang danh sách — một trang nữa chồng lên ngăn xếp';
      }
      return null;
    },
  },
  {
    /*
      #60: thử thách đã đạt mà chưa nhận, đã kết thúc — thẻ ở Khám phá không
      hiện nó (chỉ hiện thử thách còn mở), và 7 ngày sau hạn nó biến khỏi mọi
      màn cùng phần thưởng. Fixture: "Tuần bứt tốc: 3 buổi" hết hạn 3 ngày
      trước, UID 5/3, chưa nhận, thưởng 100. Đòi: hộp thư có dòng nhắc với tên
      thử thách và số ngày còn lại (7 − 3 = 4), và bấm vào thì màn chi tiết
      có nút nhận đúng 100 xu — lời nhắc dẫn tới đúng việc nó nhắc.
    */
    name: 'Hộp thư: nhắc nhận thưởng thử thách đã đạt, dẫn tới nút Nhận',
    route: '/community-inbox', mode: 'full',
    async run(page) {
      await page.waitForTimeout(1500);
      const row = page.getByRole('button', { name: /Tuần bứt tốc: 3 buổi/ });
      if ((await row.count()) !== 1) return 'hộp thư không có đúng một dòng nhắc "Tuần bứt tốc: 3 buổi"';
      const label = await row.getAttribute('aria-label');
      if (!/100/.test(label)) return `dòng nhắc phải nói phần thưởng (100), ra "${label}"`;
      if (!/còn 4 ngày|4 days left/.test(label)) return `dòng nhắc phải nói còn 4 ngày (hết hạn 3 ngày, cửa sổ 7), ra "${label}"`;
      await row.click();
      await page.waitForTimeout(2500);
      const claim = page.getByRole('button', { name: /^(Nhận 100 xu|Claim 100 coins)$/ });
      if ((await claim.count()) !== 1) return 'bấm lời nhắc mà màn chi tiết không có nút nhận 100 xu';
      return null;
    },
  },
  {
    /*
      #62: đường XẾP HÀNG BỀN phải gửi đúng MỘT lần khi có mạng lại. Nước đi
      qua hàng đợi ở mọi lúc (`mutationKey: [...OFFLINE_WRITE_KEY]`), nên mất
      mạng thì React Query tạm dừng nó và lưu nó vào cache persist.

      (A) có mạng lại trong trang: đúng một upsert `water_logs`, và 3 giây sau
          vẫn một — không gửi đôi.
      (B) rời app LÚC MẤT MẠNG, có mạng lại, mở app: việc đã xếp hàng sống qua
          lần tải lại (cache persist) và được gửi đúng một lần.

      Trước `goOnline`, vế (A) đỏ "0 lệnh ghi sau 8 giây" — không phải vì app,
      mà vì bộ chạy chưa bao giờ báo cho NetInfo là mạng đã về (xem goOnline).
    */
    name: 'Mất mạng: nước xếp hàng được gửi đúng một lần khi có mạng lại, kể cả qua lần mở lại app',
    route: '/water', mode: 'full',
    async run(page) {
      const writes = [];
      page.on('request', (q) => {
        if (/\/rest\/v1\/water_logs/.test(q.url()) && isWrite(q.method())) writes.push(q.postData() ?? '');
      });
      const add = () => page.getByRole('button', { name: /^(Thêm|Add) \d+ (ml|oz)$/ }).first();
      if ((await add().count()) === 0) return 'không thấy nút thêm nước';
      const paused = () =>
        page.evaluate(() => {
          const c = JSON.parse(localStorage.getItem('ascnd_rq_cache') ?? '{}');
          return (c.clientState?.mutations ?? []).filter((m) => m.state?.isPaused).length;
        });

      /* (A) — và #66: cú chạm lúc mất mạng phải THẤY được. Trước #66 con số
         đứng yên và không một câu nào, nên người ta bấm lại — thành hai cốc. */
      const total = async () => Number((await page.locator('body').innerText()).match(/(\d+(?:\.\d+)?) ?oz\b/)?.[1] ?? NaN);
      const before = await total();
      await goOffline(page);
      await page.waitForTimeout(1500);
      await add().click();
      let toastText = '';
      for (let i = 0; i < 10 && !toastText; i++) {
        await page.waitForTimeout(250);
        toastText = (await page.locator('[aria-live="polite"]').allInnerTexts()).join(' ').trim();
      }
      if (!/đồng bộ khi có mạng|sync when you are back online/.test(toastText)) {
        return `(A) mất mạng, bấm thêm nước: phải nói "đã lưu, sẽ đồng bộ" (#66), ra "${toastText}"`;
      }
      await page.waitForTimeout(1000);
      if (!(await total() > before)) return `(A) mất mạng, bấm thêm nước: tổng phải tăng (#66), trước ${before}, sau ${await total()}`;
      if (writes.length) return `(A) mất mạng mà vẫn có ${writes.length} lệnh ghi đi ra`;
      if ((await paused()) !== 1) return `(A) mất mạng, bấm thêm nước: cache persist phải có đúng 1 mutation tạm dừng, ra ${await paused()}`;
      await goOnline(page);
      for (let i = 0; i < 16 && writes.length === 0; i++) await page.waitForTimeout(500);
      if (writes.length === 0) return '(A) có mạng lại 8 giây mà việc đã xếp hàng không được gửi';
      await page.waitForTimeout(3000);
      if (writes.length !== 1) return `(A) có mạng lại: phải đúng 1 lệnh ghi water_logs, ra ${writes.length} — gửi đôi`;
      if (!/"amount_ml"\s*:\s*\d+/.test(writes[0])) return `(A) lệnh ghi không mang amount_ml: ${writes[0].slice(0, 120)}`;

      /* (B) */
      const url = page.url();
      await goOffline(page);
      await page.waitForTimeout(1500);
      await add().click();
      /* persist có throttle 1 giây: đợi nó ghi xong rồi mới "tắt app". */
      await page.waitForTimeout(2000);
      if ((await paused()) !== 1) return `(B) trước khi rời app, cache phải có đúng 1 mutation tạm dừng, ra ${await paused()}`;
      await page.goto('about:blank');
      await goOnline(page);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      for (let i = 0; i < 24 && writes.length < 2; i++) await page.waitForTimeout(500);
      await page.waitForTimeout(3000);
      if (writes.length !== 2) return `(B) mở lại app khi có mạng: việc xếp hàng lúc mất mạng phải được gửi đúng 1 lần, ra ${writes.length - 1}`;
      if ((await paused()) !== 0) return `(B) đã gửi mà cache vẫn còn ${await paused()} mutation tạm dừng — lần mở sau sẽ gửi lại`;
      return null;
    },
  },
  /*
    #69: như vế Nước của #62, cho các loại việc xếp hàng CÒN LẠI có màn riêng.
    Mỗi dòng: màn, cách lưu, bảng đích. Mỗi vế đòi: mất mạng → lưu → 0 lệnh ghi
    và đúng 1 mutation tạm dừng trong cache persist; có mạng lại → ĐÚNG 1 lệnh
    ghi tới đúng bảng, 3 giây sau vẫn 1, và cache sạch. Không ai phải nhập gì:
    cân nặng mở với số của hôm nay, giấc ngủ mở với một đêm hợp lệ.
  */
  ...[
    ['cân nặng', '/log-weight', /^(Lưu thay đổi|Save changes)$/, ['weight_logs'], null],
    ['giấc ngủ', '/log-sleep', /^(Lưu giấc ngủ|Save Sleep)$/, ['sleep_logs'], null],
    /* Số đo mở TRỐNG (không có gì để lưu): điền ô đầu — vòng cổ, 38 cm. */
    ['số đo', '/log-measurement', /^(Lưu|Save)$/, ['body_measurements'], async (page) => page.getByPlaceholder('—').first().fill('38')],
    /* Bữa ăn: món yêu thích ở hàng thêm nhanh. HAI bảng, mỗi bảng đúng một
       lệnh ghi — `offline-queue.mjs` từng đo được "một bữa 520 kcal mà không
       có món nào" khi lệnh ghi lặp lại (bữa có, món không). */
    ['bữa ăn', '/log-meal', /^(Lưu bữa ăn|Save Meal)$/, ['meal_entries', 'meal_entry_items'],
      async (page) => page.getByText('Cơm gà nhà làm', { exact: true }).first().click()],
    /* Buổi tập: một set tự gõ — tên bài, mức tạ, số lần. */
    ['buổi tập', '/log-workout', /^(Lưu buổi tập|Save Workout)$/, ['workout_sessions'], async (page) => {
      await page.getByPlaceholder(/^(Bài tập|Exercise)$/).first().fill('Bench Press');
      await page.getByPlaceholder('—').nth(0).fill('60');
      await page.getByPlaceholder('—').nth(1).fill('8');
    }],
  ].map(([what, route, saveName, tables, prepare]) => ({
    name: `Mất mạng: ${what} xếp hàng được gửi đúng một lần khi có mạng lại`,
    route, mode: 'full',
    async run(page) {
      const writes = Object.fromEntries(tables.map((t) => [t, 0]));
      page.on('request', (q) => {
        const t = tables.find((x) => new RegExp(`/rest/v1/${x}(\\?|$)`).test(q.url()));
        if (t && isWrite(q.method())) writes[t]++;
      });
      const sent = () => Object.values(writes).reduce((a, b) => a + b, 0);
      const paused = () =>
        page.evaluate(() => {
          const c = JSON.parse(localStorage.getItem('ascnd_rq_cache') ?? '{}');
          return (c.clientState?.mutations ?? []).filter((m) => m.state?.isPaused).length;
        });
      await page.waitForTimeout(1500);
      if (prepare) await prepare(page);
      const save = page.getByRole('button', { name: saveName });
      if ((await save.count()) !== 1) return `không thấy đúng một nút lưu ${saveName} trên ${route}`;
      await goOffline(page);
      await page.waitForTimeout(1500);
      await save.click();
      await page.waitForTimeout(2500);
      if (sent()) return `mất mạng mà vẫn có lệnh ghi đi ra: ${JSON.stringify(writes)}`;
      if ((await paused()) !== 1) return `mất mạng, bấm lưu: cache persist phải có đúng 1 mutation tạm dừng, ra ${await paused()}`;
      await goOnline(page);
      for (let i = 0; i < 16 && sent() < tables.length; i++) await page.waitForTimeout(500);
      await page.waitForTimeout(3000);
      const off = tables.filter((t) => writes[t] !== 1);
      if (off.length) return `có mạng lại: mỗi bảng phải đúng 1 lệnh ghi, ra ${JSON.stringify(writes)} — ${off.join(', ')} lệch`;
      if ((await paused()) !== 0) return `đã gửi mà cache vẫn còn ${await paused()} mutation tạm dừng — lần mở sau sẽ gửi lại`;
      return null;
    },
  })),
  {
    /*
      #45: mất mạng, React Query mặc định TẠM DỪNG mutation — không chạy, không
      onError. Đo trên bản chưa sửa (dựng lại với useOnlineMutation trả thẳng
      useMutation): bài đã thích, bấm → nhãn "Thích · 128" thành 127 và nằm
      đó, không toast, và có mạng lại 5 giây vẫn không lệnh ghi nào — dấu nói
      dối mãi. Đòi: một câu báo, nhãn y như trước, KHÔNG lệnh ghi nào lúc mất
      mạng, và có mạng lại cũng không tự gửi (thao tác cộng đồng không xếp
      hàng — phát lại sau vài giờ là sai ngữ cảnh).
    */
    name: 'Cộng đồng: mất mạng thì Thích báo ngay, không treo, không gửi sau',
    route: '/community', mode: 'full',
    async run(page) {
      const writes = [];
      page.on('request', (q) => {
        if (/\/rest\/v1\/community_likes/.test(q.url()) && isWrite(q.method())) writes.push(q.method());
      });
      await page.waitForTimeout(2000);
      const btn = () => page.getByRole('button', { name: /^(Thích|Like) · \d+$/ }).first();
      if ((await btn().count()) === 0) return 'không thấy nút Thích nào trên feed';
      const before = await btn().getAttribute('aria-label');
      await goOffline(page);
      await page.waitForTimeout(1500);
      try {
        await btn().click();
        let toastText = '';
        for (let i = 0; i < 10 && !toastText; i++) {
          await page.waitForTimeout(250);
          toastText = (await page.locator('[aria-live="polite"]').allInnerTexts()).join(' ').trim();
        }
        if (!toastText) return 'mất mạng, bấm Thích: không một câu nào — mutation bị tạm dừng im lặng (#45)';
        if (!/giữ lại|kept/i.test(toastText)) return `câu báo phải nói rõ là không giữ lại để gửi sau, ra "${toastText}"`;
        const after = await btn().getAttribute('aria-label');
        if (after !== before) return `mất mạng mà dấu vẫn đổi: trước "${before}", sau "${after}"`;
        if (writes.length) return `mất mạng mà vẫn có ${writes.length} lệnh ghi đi ra`;
      } finally {
        await goOnline(page);
      }
      await page.waitForTimeout(5000);
      if (await stillOffline(page)) return 'có mạng lại mà app vẫn tin là mất mạng — vế "không tự gửi" dưới đây sẽ không đo gì';
      if (writes.length) return `có mạng lại thì tự gửi ${writes.length} lệnh ghi — thao tác cộng đồng không được xếp hàng`;
      const back = await btn().getAttribute('aria-label');
      if (back !== before) return `có mạng lại, nhãn thành "${back}" (trước "${before}")`;
      return null;
    },
  },
  {
    /*
      #27, nửa còn lại, và #46: Lưu đi qua cùng `useToggle` với Thích, nhưng
      issue đòi chứng minh cả hai. Nhãn Lưu không mang số ("Lưu"), nên nhãn
      trở về không phân biệt được gì; vế này đòi toast ở CẢ HAI đường (Lưu
      bài chưa lưu, Bỏ lưu bài đã lưu), và toast ấy KHÔNG phải câu "Đã lưu vào
      thư viện": bẻ đường GHI của `useToggle` (nuốt lỗi INSERT) thì câu thành
      công hiện ra, và bản đầu của vế này — chỉ đòi "có toast" — vẫn xanh.
    */
    name: 'Cộng đồng: Lưu hỏng thì báo lỗi (cả Lưu lẫn Bỏ lưu)',
    route: '/community', mode: 'full',
    run: (page) => bothWritePaths(page, 'community_saves', /^(Lưu|Save)$/, false, /Đã lưu vào thư viện|Saved to your library/),
  },
  {
    /*
      #35: Bỏ thích / Bỏ lưu / Bỏ theo dõi phải CHẠY trên máy chủ giả, không chỉ
      qua được bước cổng tĩnh. Từ #35 máy chủ giả trả 400 khi `select=` hỏi
      một cột không có thật; `confirmWrite` hỏi lại cột ấy bằng `select=`, nên
      trả `'post_id'` về mặc định `'id'` thì lệnh DELETE ở đây nhận 400 —
      độc lập với `confirm-write-cols.mjs`.

      Fixture: UID đã thích bài …0001, đã lưu …0002 và …0004, đã theo dõi
      c0…11a1. Nhãn nút không nói trạng thái trên web (`accessibilityState`
      không thành thuộc tính), nên vế này bấm MỌI nút Thích/Lưu trên feed
      và đòi: có ít nhất một DELETE cho mỗi bảng (tức đã chạm đúng dòng đã
      thích/lưu), và mọi lệnh ghi vào hai bảng ấy đều 2xx. Rời thử thách
      không đo được: fixture không có thành viên thử thách nào.
    */
    name: 'Cộng đồng: Bỏ thích / Bỏ lưu / Bỏ theo dõi chạy được',
    route: '/community', mode: 'full',
    async run(page) {
      const writes = [];
      page.on('response', (res) => {
        const m = res.request().method();
        const hit = /\/rest\/v1\/(community_likes|community_saves|community_follows)\b/.exec(res.url());
        if (hit && m !== 'GET') writes.push({ table: hit[1], m, status: res.status() });
      });
      await page.waitForTimeout(2000);
      for (const name of [/^(Thích|Like) · \d+$/, /^(Lưu|Save)$/]) {
        const btns = page.getByRole('button', { name });
        const n = await btns.count();
        for (let i = 0; i < n; i++) {
          await btns.nth(i).click().catch(() => {});
          await page.waitForTimeout(700);
        }
      }
      await page.goto(`${new URL(page.url()).origin}/community-user?id=c0000000-0000-4000-8000-0000000011a1`, {
        waitUntil: 'domcontentloaded', timeout: 60000,
      });
      await page.waitForTimeout(6000);
      const unfollow = page.getByRole('button', { name: /^(Đang theo dõi|Following)$/ }).first();
      if ((await unfollow.count()) === 0) return 'không thấy nút "Đang theo dõi" trên hồ sơ c0…11a1';
      await unfollow.click();
      await page.waitForTimeout(2000);

      for (const t of ['community_likes', 'community_saves', 'community_follows']) {
        if (!writes.some((w) => w.table === t && w.m === 'DELETE')) {
          return `không có lệnh DELETE nào vào ${t} — vế này không chạm được dòng đã có, nên không đo gì`;
        }
      }
      const bad = writes.filter((w) => w.status >= 400);
      if (bad.length) {
        return `lệnh ghi hỏng trên máy chủ giả: ${bad.map((w) => `${w.m} ${w.table} → ${w.status}`).join(', ')}`;
      }
      return null;
    },
  },
  {
    /*
      #38: ba màn đọc RPC phải vẽ NHÁNH CÓ DỮ LIỆU. Trước #38 mọi RPC nhận
      `[]`, nên thẻ thử thách không hiện, "Gợi ý cho bạn" ra "Chưa có gợi ý
      nào", và bản xem trước Tiến trình không có con số nào. Số đòi ở đây
      không gõ tay: chúng lấy từ chính fixture RPC chạy trên cùng thế giới
      (và, với Tiến trình, trên ĐÚNG đối số màn đã gửi đi).
    */
    name: 'RPC có dữ liệu: thẻ thử thách, gợi ý theo dõi, xem trước Tiến trình',
    route: '/community', mode: 'full',
    async run(page) {
      const origin = new URL(page.url()).origin;
      const ov = RPC_FIXTURES.community_challenges_overview.run({ p_offset_min: 0 }, FIXTURES);
      const joined = ov.find((c) => c.joined);
      await page.waitForTimeout(1500);
      let t = await readable(page);
      if (!joined) return 'fixture không có thử thách nào UID đã tham gia — vế này không đo gì';
      if (!t.includes(joined.title)) return `tab Cộng đồng không có thẻ thử thách "${joined.title}" — RPC tổng quan không tới màn`;
      if (!new RegExp(`\\b\\d+ / ${joined.target} (ngày|days)`).test(t)) return `thẻ thử thách không hiện tiến độ "… / ${joined.target}"`;

      await page.goto(`${origin}/community-search`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(6000);
      t = await readable(page);
      const sug = RPC_FIXTURES.community_follow_suggestions.run({}, FIXTURES);
      if (/Chưa có gợi ý nào|No suggestions right now/.test(t)) return 'màn tìm người vẫn nói "chưa có gợi ý" — RPC gợi ý không tới màn';
      for (const x of sug) if (!t.includes(x.display_name)) return `màn tìm người thiếu gợi ý "${x.display_name}"`;

      const sent = [];
      page.on('request', (q) => { if (q.url().includes('/rpc/build_progress_payload')) sent.push(q.postData() ?? '{}'); });
      await page.goto(`${origin}/community-share-progress`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(6000);
      if (!sent.length) return 'màn chia sẻ Tiến trình không gọi build_progress_payload';
      const want = RPC_FIXTURES.build_progress_payload.run(JSON.parse(sent[sent.length - 1]), FIXTURES);
      t = await readable(page);
      const lead = want.weight ?? want.waist;
      if (!lead) return `fixture Tiến trình không có chỉ số cân/eo cho đối số ${sent[sent.length - 1]}`;
      const num = (v) => String(v).replace('.', '[.,]');
      if (!new RegExp(`${num(lead.start)}[^\\n]{0,12}→[^\\n]{0,12}${num(lead.end)}`).test(t)) {
        return `bản xem trước Tiến trình không hiện "${lead.start} → ${lead.end}" (đối số ${sent[sent.length - 1]})`;
      }
      return null;
    },
  },
  {
    /*
      #49: ngoài Cộng đồng, mutation trần (`useMutation`, `networkMode` mặc
      định) bị React Query TẠM DỪNG khi mất mạng: không chạy, không onError.
      Đo trên bản chưa sửa, ở ngôi sao Yêu thích của `/food-list`: mất mạng,
      bấm → không toast, không lệnh ghi; có mạng lại 10 giây vẫn KHÔNG lệnh
      ghi nào. Tức nó vừa không báo, vừa không tự gửi — "từ chối thành tiếng"
      (`useOnlineMutation`) không làm mất gì. Ngôi sao là thao tác HAI CHIỀU,
      như tick thực phẩm bổ sung mà `offline-write.ts` đã quyết không xếp hàng.
      Đòi: một câu báo nói rõ là không giữ lại, không lệnh ghi lúc mất mạng,
      và có mạng lại cũng không tự gửi.
    */
    name: 'Món của tôi: mất mạng thì ngôi sao Yêu thích báo ngay, không treo, không gửi sau',
    route: '/food-list', mode: 'full',
    async run(page) {
      const writes = [];
      page.on('request', (q) => {
        if (/\/rest\/v1\/food_items/.test(q.url()) && isWrite(q.method())) writes.push(q.method());
      });
      await page.waitForTimeout(1500);
      const star = page.getByRole('button', { name: /^(Bật\/tắt yêu thích|Toggle favourite)$/ }).first();
      if ((await star.count()) === 0) return 'không thấy ngôi sao Yêu thích nào trên /food-list (fixture food_items?)';
      await goOffline(page);
      await page.waitForTimeout(1500);
      try {
        await star.click();
        let toastText = '';
        for (let i = 0; i < 12 && !toastText; i++) {
          await page.waitForTimeout(250);
          toastText = (await page.locator('[aria-live="polite"]').allInnerTexts()).join(' ').trim();
        }
        if (!toastText) return 'mất mạng, bấm ngôi sao: không một câu nào — mutation bị tạm dừng im lặng (#49)';
        if (!/giữ lại|kept/i.test(toastText)) return `câu báo phải nói rõ là không giữ lại để gửi sau, ra "${toastText}"`;
        if (writes.length) return `mất mạng mà vẫn có ${writes.length} lệnh ghi đi ra`;
      } finally {
        await goOnline(page);
      }
      await page.waitForTimeout(5000);
      if (await stillOffline(page)) return 'có mạng lại mà app vẫn tin là mất mạng — vế "không tự gửi" dưới đây sẽ không đo gì';
      if (writes.length) return `có mạng lại thì tự gửi ${writes.length} lệnh ghi — ngôi sao không được xếp hàng`;
      return null;
    },
  },
  {
    /*
      #54 (đưa phép đo #47 vào bộ hồi quy): `PickRow scroll` phải cho thấy TRỌN
      ô đang chọn. Đo ở 320 với chữ trong ô phóng to (giả lập Dynamic Type) —
      trước #47: mở `/log-meal?meal=postworkout` thì ô "Sau tập" nằm HẲN ngoài
      khung ([619, 727] trong [24, 296]), và chạm một ô bị mép cắt thì nó vẫn
      bị cắt. Chạm bằng TOẠ ĐỘ vào phần còn thấy, không bằng `click()`:
      Playwright tự cuộn phần tử vào khung trước khi bấm, tức đo gian.
    */
    name: 'PickRow cuộn ở 320 + chữ lớn: ô đang chọn luôn hiện trọn, ô đã trọn thì khung đứng yên',
    route: '/log-meal?meal=postworkout', mode: 'full',
    async run(page) {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(6000);
      const state = () => page.evaluate(() => {
        for (const t of document.querySelectorAll('[role="tab"]')) {
          let el = t.parentElement;
          while (el && !(el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX))) el = el.parentElement;
          if (!el) continue;
          const box = el.getBoundingClientRect();
          const tabs = [...el.querySelectorAll('[role="tab"]')].map((x) => {
            const b = x.getBoundingClientRect();
            return { label: x.getAttribute('aria-label') ?? x.innerText, l: b.left, r: b.right, y: b.top + b.height / 2, sel: x.getAttribute('aria-selected') === 'true' };
          });
          return { scrollLeft: el.scrollLeft, max: el.scrollWidth - el.clientWidth, row: { l: box.left, r: box.right }, tabs };
        }
        return null;
      });
      const inside = (t, s) => t.l >= s.row.l - 0.5 && t.r <= s.row.r + 0.5;
      /* 1 — cỡ chữ thường, lúc MỞ TRANG với ô cuối đã chọn. */
      const s0 = await state();
      if (!s0) return 'không có hàng PickRow nào tràn khung ở 320 — vế này không đo gì (hàng loại bữa của log-meal đổi?)';
      const sel = s0.tabs.find((t) => t.sel);
      if (!sel) return 'không có ô nào mang aria-selected="true" trong hàng';
      if (!inside(sel, s0)) return `mở trang với "${sel.label}" đã chọn mà ô ấy không hiện trọn: [${sel.l.toFixed(0)}, ${sel.r.toFixed(0)}] trong khung [${s0.row.l.toFixed(0)}, ${s0.row.r.toFixed(0)}] (#47)`;
      /* 3 — vẫn cỡ chữ thường (nhiều ô nằm trọn): chạm một ô đã trọn thì khung
         đứng yên. Kéo hàng về ĐẦU trước (như một cú vuốt ngược), rồi chạm ô nằm
         trọn NGOÀI CÙNG BÊN PHẢI. Bản đầu của vế này đo ngay ở vị trí mở trang
         — hàng đã cuộn tới CUỐI — và một PickRow bẻ để luôn cuộn ô được chọn về
         sát mép trái vẫn XANH: đích bị kẹp ở mức cuộn tối đa nên khung đứng yên
         dù code sai. Ở đầu hàng thì không có gì kẹp hộ. */
      await page.evaluate(() => {
        for (const t of document.querySelectorAll('[role="tab"]')) {
          let el = t.parentElement;
          while (el && !(el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX))) el = el.parentElement;
          if (el) { el.scrollLeft = 0; return; }
        }
      });
      await page.waitForTimeout(600);
      const s0b = await state();
      const fulls = s0b.tabs.filter((t) => !t.sel && t.l >= s0b.row.l + 1 && t.r <= s0b.row.r - 1);
      const full = fulls[fulls.length - 1];
      if (!full || fulls.length < 2) return 'ở đầu hàng không có đủ hai ô nằm trọn (ngoài ô đang chọn) để thử "khung đứng yên"';
      await page.mouse.click((full.l + full.r) / 2, full.y);
      await page.waitForTimeout(900);
      const s1 = await state();
      /* So với `min(trước, mức tối đa MỚI)`, không với `trước`: đổi ô chọn làm
         nội dung hẹp đi 1px (đo: mức tối đa 286 → 285), và trình duyệt tự kẹp
         scrollLeft về mức mới — không phải PickRow cuộn. */
      if (Math.abs(s1.scrollLeft - Math.min(s0b.scrollLeft, s1.max)) >= 1) return `chạm "${full.label}" (đã nằm trọn) mà khung vẫn cuộn: scrollLeft ${s0b.scrollLeft} → ${s1.scrollLeft} (mức tối đa ${s0b.max} → ${s1.max})`;
      /* 2 — chữ lớn (giả lập Dynamic Type): chạm phần còn thấy của một ô bị mép cắt thì nó hiện trọn. */
      await page.addStyleTag({ content: '[role="tab"] div { font-size: 21px !important; line-height: 26px !important; }' });
      await page.waitForTimeout(1200);
      const s2 = await state();
      const cut = s2.tabs.find((t) => !t.sel && ((t.l < s2.row.l - 0.5 && t.r > s2.row.l + 8) || (t.r > s2.row.r + 0.5 && t.l < s2.row.r - 8)));
      if (!cut) return 'chữ lớn mà không ô nào vừa thấy vừa bị mép cắt để chạm — vế chạm không đo được';
      const x = cut.l < s2.row.l ? Math.max(cut.l, s2.row.l) + 4 : Math.min(cut.r, s2.row.r) - 4;
      await page.mouse.click(x, cut.y);
      await page.waitForTimeout(900);
      const s3 = await state();
      const t3 = s3.tabs.find((t) => t.label === cut.label);
      if (!t3.sel) return `chạm "${cut.label}" mà ô ấy không thành ô đang chọn`;
      if (!inside(t3, s3)) return `chạm "${cut.label}" (đang bị cắt) mà nó vẫn bị cắt: [${t3.l.toFixed(0)}, ${t3.r.toFixed(0)}] trong [${s3.row.l.toFixed(0)}, ${s3.row.r.toFixed(0)}] (#47)`;
      return null;
    },
  },
  {
    /*
      #57: "Thêm vào bữa ăn" là ghi nhật ký TẠO MỚI, nên mất mạng thì XẾP HÀNG
      như ghi bữa tay — không từ chối (#49 để nó ở `useOnlineMutation`, sai
      đường), không treo. Đo trên thực đơn `mp1` (trên web `Alert` của thẻ Recipe
      là hàm rỗng, nên chọn bữa ở đó không được). Đòi:
        1. mất mạng, bấm "Ghi vào hôm nay" → câu báo nói đã LƯU và sẽ đồng bộ;
           không lệnh ghi nào đi ra;
        2. có mạng lại → đúng MỘT lệnh ghi `meal_entries` và lệnh ghi món, và
           các món trỏ đúng id bữa đã tạo lúc bấm (không phải id server sinh).
    */
    name: 'Thực đơn: mất mạng thì "Ghi vào hôm nay" xếp hàng, có mạng lại thì gửi đúng một bữa',
    route: '/meal-plan?plan=mp1', mode: 'full',
    async run(page) {
      const writes = [];
      page.on('request', (q) => {
        const t = /\/rest\/v1\/(meal_entries|meal_entry_items)\b/.exec(q.url());
        /* HEAD là ĐỌC (truy vấn đếm `select=id` với `head: true`), không phải ghi —
           bản đầu đếm mọi thứ khác GET và báo "3 lệnh ghi" cho 1 POST + 2 HEAD. */
        if (t && isWrite(q.method())) writes.push({ table: t[1], method: q.method(), body: q.postData() ?? '', at: Date.now(), url: q.url() });
      });
      const statuses = [];
      page.on('response', (r) => {
        if (/\/rest\/v1\/(meal_entries|meal_entry_items|daily_logs)\b/.test(r.url()) && r.request().method() !== 'GET') statuses.push(`${r.request().method()} ${r.url().split('/rest/v1/')[1].slice(0, 60)} → ${r.status()} @${Date.now() % 100000}`);
      });
      await page.waitForTimeout(1500);
      const eat = page.getByRole('button', { name: /^(Ghi vào hôm nay|Log to today)$/ }).first();
      if ((await eat.count()) === 0) return 'không thấy nút "Ghi vào hôm nay" trên thực đơn mp1';
      await goOffline(page);
      await page.waitForTimeout(1500);
      let toastText = '';
      try {
        await eat.click();
        for (let i = 0; i < 12 && !toastText; i++) {
          await page.waitForTimeout(250);
          toastText = (await page.locator('[aria-live="polite"]').allInnerTexts()).join(' ').trim();
        }
        if (!toastText) return 'mất mạng, bấm "Ghi vào hôm nay": không một câu nào';
        if (!/đồng bộ khi có mạng|sync when you are back online/i.test(toastText)) {
          return `mất mạng mà câu báo không nói đã lưu để đồng bộ sau: "${toastText}" (#57)`;
        }
        if (writes.length) return `mất mạng mà vẫn có ${writes.length} lệnh ghi đi ra`;
      } finally {
        await goOnline(page);
      }
      for (let i = 0; i < 40 && writes.filter((w) => w.table === 'meal_entry_items').length === 0; i++) await page.waitForTimeout(250);
      const entries = writes.filter((w) => w.table === 'meal_entries');
      const items = writes.filter((w) => w.table === 'meal_entry_items');
      if (entries.length !== 1) return `có mạng lại: ${entries.length} lệnh ghi meal_entries, phải là đúng 1 — bữa xếp hàng không được gửi (hoặc gửi trùng) · ${statuses.join(' ; ')}`;
      if (items.length < 1) return 'có mạng lại: bữa đã gửi nhưng không có lệnh ghi món nào';
      let entryId = '';
      try { entryId = JSON.parse(entries[0].body).id ?? ''; } catch { /* thân không phải JSON */ }
      const itemRows = items.flatMap((w) => { try { const b = JSON.parse(w.body); return Array.isArray(b) ? b : [b]; } catch { return []; } });
      if (!entryId) return 'lệnh ghi meal_entries không mang id tạo lúc bấm — phát lại sẽ không nhận ra chính nó';
      if (!itemRows.length || itemRows.some((r) => r.meal_entry_id !== entryId)) {
        return `món không trỏ đúng id bữa đã tạo lúc bấm (${entryId}): ${JSON.stringify(itemRows.map((r) => r.meal_entry_id))}`;
      }
      return null;
    },
  },
  {
    /*
      #52: thế giới giả NHỚ lệnh ghi trong một trang. Trước #52 tham gia thử
      thách rồi đọc lại tổng quan vẫn ra `joined: false` — mọi luồng "ghi →
      thấy thay đổi" nằm ngoài tầm đo. Đòi: bấm "Tham gia" ở thử thách sắp mở
      (fixture: UID chưa tham gia `ch…0002`; trang chi tiết của nó) → lệnh ghi thành công, lượt đọc
      lại `community_challenges_overview` ra `joined: true` cho đúng thử thách
      ấy, và nút Tham gia của nó biến khỏi màn.
    */
    name: 'Thử thách: bấm Tham gia thì đọc lại thấy đã tham gia (thế giới giả nhớ lệnh ghi)',
    route: '/community-challenge?id=ch000000-0000-4000-8000-000000000002', mode: 'full',
    async run(page) {
      const TARGET = 'ch000000-0000-4000-8000-000000000002';
      const overviews = [];
      const writes = [];
      page.on('response', async (res) => {
        const u = res.url();
        if (u.includes('/rpc/community_challenges_overview')) overviews.push(await res.json().catch(() => null));
        if (/\/rest\/v1\/community_challenge_members/.test(u) && res.request().method() === 'POST') writes.push(res.status());
      });
      await page.waitForTimeout(2000);
      const joins = page.getByRole('button', { name: /^(Tham gia|Join)$/ });
      const before = await joins.count();
      if (before === 0) return 'không thấy nút "Tham gia" trên trang chi tiết ch…0002 (fixture?)';
      /* Nút chỉ hiện khi `!ch.joined`, nên có nút là lượt đọc đầu đã ra "chưa
         tham gia" (lượt ấy xảy ra lúc mở trang, trước khi bộ nghe kịp gắn). */
      const seenBefore = overviews.length;
      await joins.first().click();
      for (let i = 0; i < 20 && !(overviews.length > seenBefore && overviews.at(-1)?.find((c) => c.id === TARGET)?.joined); i++) await page.waitForTimeout(250);
      if (writes.length !== 1 || writes[0] >= 300) return `bấm Tham gia: lệnh ghi community_challenge_members ${JSON.stringify(writes)}, phải là đúng một 2xx`;
      const last = overviews.at(-1) ?? [];
      if (overviews.length <= seenBefore) return 'bấm Tham gia mà tổng quan không được đọc lại';
      if (last.find((c) => c.id === TARGET)?.joined !== true) return `đọc lại tổng quan vẫn ra ch…0002 chưa tham gia — thế giới giả không nhớ lệnh ghi (#52)`;
      await page.waitForTimeout(800);
      const after = await joins.count();
      if (after !== before - 1) return `nút Tham gia: ${before} → ${after}, phải bớt đúng một`;
      return null;
    },
  },
  {
    /*
      #12: lưu một buổi tập → thanh "Đã lưu buổi tập" có nút Chia sẻ → nút mở
      `/community-share` với ĐÚNG buổi vừa lưu (`?session=` là id do insert
      trả về, không phải một id đoán). Vế này cũng canh một lỗi fixture: dòng
      `daily_logs` từng thiếu `updated_at` — token CAS của `recomputeDailyLog`
      — nên sau #17 mọi lần lưu buổi tập trong thế giới giả hỏng sau ba lượt
      thử mà không màn nào báo ra.
    */
    name: 'Ghi buổi tập: lưu xong có lời mời chia sẻ, mở đúng buổi',
    route: '/log-workout', mode: 'full',
    async run(page) {
      await page.getByPlaceholder(/^(Bài tập|Exercise)$/).first().fill('Squat');
      await page.getByPlaceholder('—', { exact: true }).nth(0).fill('60');
      await page.getByPlaceholder('—', { exact: true }).nth(1).fill('8');
      await page.waitForTimeout(600);
      const save = page.getByText(/^(Lưu buổi tập|Save Workout)$/).first();
      if ((await save.count()) === 0) return 'không thấy nút lưu buổi tập';
      await save.click();
      await page.waitForTimeout(4000);
      const share = page.getByRole('button', { name: /^(Chia sẻ|Share)$/ });
      if ((await share.count()) === 0) return 'lưu xong mà thanh toast không có nút Chia sẻ (hoặc lưu hỏng — xem updated_at của daily_logs)';
      await share.first().click();
      await page.waitForTimeout(2500);
      if (!/community-share\?session=\w/.test(page.url())) return `bấm Chia sẻ mà tới ${page.url().replace(/^.*8731/, '')}`;
      return null;
    },
  },
  {
    /*
      #17: trước khi `applyQuery` lọc `eq`, `useMyCommunityProfile` nhận CẢ BẢNG
      hồ sơ và `.maybeSingle()` ném PGRST116. Tab Cộng đồng — đúng thiết kế —
      im lặng khi hồ sơ lỗi, nên ô soạn bài (lối vào của cả ba màn chia sẻ)
      biến mất mà không có gì báo ra. Vế này đòi nó HIỆN, và đòi chuông của hộp
      thông báo (chỉ vẽ khi đã có hồ sơ) cũng có mặt: hai dấu hiệu độc lập rằng
      hồ sơ của UID đã được đọc. Bỏ lọc `eq` khỏi `applyQuery` thì vế này đỏ.
    */
    name: 'Cộng đồng: hồ sơ đọc được, ô soạn bài hiện',
    route: '/community', mode: 'full',
    async run(page) {
      await page.waitForTimeout(2500);
      const composer = page.getByText(/^(Chia sẻ một buổi tập…|Share a workout…)$/);
      if ((await composer.count()) === 0) return 'không thấy ô soạn bài — hồ sơ cộng đồng của UID không đọc được (xem #17)';
      const bell = page.getByLabel(/^(Thông báo|Notifications)/);
      if ((await bell.count()) === 0) return 'ô soạn bài có nhưng không thấy chuông thông báo';
      return null;
    },
  },
  {
    /*
      Nút ghi bữa không còn ở Today: thẻ dinh dưỡng của Today nay mở tab Dinh
      dưỡng (xem chú thích ở `(tabs)/index.tsx`, "the card used to be … a
      shortcut to `/log-meal` only when it was empty, which is backwards"), và
      nút ghi bữa là `MealLogActions` trên tab ấy. Kịch bản đi theo nút tới chỗ
      mới — cùng câu hỏi "bấm có mở đúng màn không" — thay vì đỏ mãi ở chỗ cũ.
    */
    name: 'Dinh dưỡng: nút ghi bữa ăn mở đúng màn',
    route: '/nutrition', mode: 'full',
    async run(page) {
      /* "Ghi bữa ăn" trên thẻ là TIÊU ĐỀ; bốn cách ghi là bốn nút bên dưới,
         mỗi nút một nhãn trợ năng. Ô "nhập tay" là ô luôn tới `/log-meal`
         (hai ô đầu mở camera, thứ web không có). */
      const btn = page.getByRole('button', { name: /^(Enter manually|Nhập tay số liệu)$/ }).first();
      if ((await btn.count()) === 0) return 'không tìm thấy nút nhập tay trong thẻ ghi bữa ăn trên tab Dinh dưỡng';
      await btn.click();
      await page.waitForTimeout(2500);
      if (!/log-meal/.test(page.url())) return `bấm xong vẫn ở ${page.url().replace(/^.*8731/, '')}`;
      return null;
    },
  },
  {
    /*
      `/progress` không còn (ba33494): Tiến trình gộp vào Tập luyện thành segment
      "Cơ thể", và Số đo thành lưới thẻ NGAY trên trang ấy chứ không còn là một
      tab. Câu hỏi giữ nguyên — đổi segment có thật sự đổi nội dung không — và
      đòi thêm lưới số đo có mặt, vì đó là thứ trang Cơ thể vẽ mà trang Buổi
      tập không vẽ.
    */
    name: 'Tập luyện: segment Cơ thể đổi nội dung và có số đo',
    route: '/workouts', mode: 'full',
    async run(page) {
      const before = await readable(page);
      const seg = page.getByText(/^(Body|Cơ thể)$/).first();
      if ((await seg.count()) === 0) return 'không tìm thấy segment Cơ thể';
      await seg.click();
      await page.waitForTimeout(1500);
      const after = await readable(page);
      if (after === before) return 'bấm segment mà nội dung không đổi';
      /* Không phân biệt hoa thường: nhãn ô là `textTransform: uppercase`, và
         `innerText` trả chữ ĐÃ biến đổi ("BẮP TAY"). */
      if (!/bắp tay|biceps/i.test(after)) return 'segment Cơ thể mở ra mà không có lưới số đo';
      return null;
    },
  },
  {
    /*
      ── nhật ký bữa ăn: thứ bộ chạy này chưa bao giờ nhìn thấy ──

      `live-world.mjs` có `meal_entries` mà không có `meal_entry_items`, nên ở
      MỌI lượt chạy trước, mọi thẻ bữa ăn đều mở ra rỗng và tóm tắt ghi
      `0 items · 520 kcal`. Phần mở thẻ, các hàng món, hai nút sửa/xoá trên
      từng hàng — tức đúng những thứ người dùng dùng để sửa một bữa ghi nhầm —
      chưa từng được chạm tới, trong khi 32 màn vẫn báo xanh.

      Bước này canh cả ba: tóm tắt đếm đúng, thẻ MỞ RA CAO LÊN thật, và mỗi
      hàng món có hai nút bấm được.
    */
    name: 'nhật ký: thẻ bữa ăn mở ra có món, mỗi món có nút sửa và xoá',
    route: '/nutrition', mode: 'full',
    async run(page) {
      /* 1. Tóm tắt phải ĐẾM ĐÚNG.

         Đọc từ chính các hàng tiêu đề bữa ăn, KHÔNG từ `body.innerText`: chuỗi
         `{n} món` còn là của danh sách đi chợ (`nGroceryLeft`) và của thực đơn
         (`nRmFoods`), nên quét cả trang là để một fixture thêm vào ngày mai làm
         bước này đỏ vì một lý do chẳng liên quan gì. */
      const heads = await page.evaluate(() => {
        const seen = new Set();
        for (const el of document.querySelectorAll('div')) {
          const t = (el.innerText ?? '').trim();
          if (!/^(Breakfast|Lunch|Dinner|Bữa sáng|Bữa trưa|Bữa tối)/.test(t)) continue;
          if (!/kcal/.test(t) || t.length > 90) continue;
          const r = el.getBoundingClientRect();
          if (r.height <= 30 || r.height >= 120) continue;
          seen.add(t.replace(/\n/g, ' | '));
        }
        return [...seen];
      });
      if (heads.length < 2) return `nhật ký chỉ có ${heads.length} thẻ bữa ăn, chờ ít nhất 2: ${JSON.stringify(heads)}`;
      const zero = heads.find((t) => /\b0 (items|món)\b/.test(t));
      if (zero) return `thẻ bữa ăn ghi "0 món" — fixture thiếu món, hoặc lượt đọc món hỏng mà bị nuốt: ${zero}`;
      if (!heads.some((t) => /^(Breakfast|Bữa sáng)/.test(t) && /\b4 (items|món)\b/.test(t))) {
        return `bữa sáng không ghi "4 món": ${JSON.stringify(heads)}`;
      }

      /* 2. Mở thẻ bữa sáng. */
      const head = await page.evaluate(() => {
        for (const el of document.querySelectorAll('div')) {
          const t = (el.innerText ?? '').trim();
          if (!/^(Breakfast|Bữa sáng)/.test(t) || !/kcal/.test(t) || t.length > 90) continue;
          const r = el.getBoundingClientRect();
          if (r.height <= 30 || r.height >= 120) continue;
          el.setAttribute('data-probe', 'mealhead');
          /*
            Thẻ là tổ tiên gần nhất CAO HƠN hàng tiêu đề — phải đi tìm, không
            lấy `parentElement`.

            Bản đầu lấy cha trực tiếp và nó đúng cho tới khi thẻ bữa ăn được
            bọc trong `ReanimatedSwipeable`: cây nay có hai lớp bọc cao 0 xen
            vào, nên phép đo ra "0 → 0px" và bước này đỏ trong khi app chạy
            đúng (đo thật: 70 → 202px). Một phép đo bám vào hình dạng cây là
            một phép đo hỏng ở lần đổi cây kế tiếp.
          */
          const headH = r.height;
          let card = el.parentElement;
          for (let i = 0; i < 6 && card; i++) {
            if (card.getBoundingClientRect().height > headH) break;
            card = card.parentElement;
          }
          if (!card) return null;
          card.setAttribute('data-probe-card', '1');
          return { h: Math.round(card.getBoundingClientRect().height) };
        }
        return null;
      });
      if (!head) return 'không tìm thấy thẻ bữa sáng trong nhật ký';

      await page.click('[data-probe="mealhead"]');
      await page.waitForTimeout(1500);

      const after = await page.evaluate(() => {
        const card = document.querySelector('[data-probe-card]');
        const labels = ['Sửa khẩu phần', 'Xoá khỏi nhật ký', 'Edit servings', 'Remove from log'];
        const btns = [...(card?.querySelectorAll('[aria-label]') ?? [])]
          .filter((e) => labels.includes(e.getAttribute('aria-label')))
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
        return {
          h: Math.round(card?.getBoundingClientRect().height ?? 0),
          btns: btns.length,
          text: (card?.innerText ?? '').replace(/\n/g, ' | '),
        };
      });

      /* 3. Cao lên thật — không phải chỉ đổi một thuộc tính */
      if (after.h <= head.h) return `bấm mở mà thẻ không cao lên (${head.h} → ${after.h}px)`;
      /* 4. Bốn món, mỗi món hai nút */
      if (after.btns !== 8) return `mở ra chỉ thấy ${after.btns} nút sửa/xoá, phải là 8 (4 món × 2)`;
      /* 5. Tên món có thật trên màn, và nhánh "khẩu phần khác 1" có chạy */
      if (!/Yến mạch/.test(after.text)) return `mở ra không thấy tên món: ${after.text.slice(0, 120)}`;
      if (!/×2/.test(after.text)) return 'không thấy dấu ×2 — nhánh khẩu phần khác 1 chưa từng được vẽ';
      return null;
    },
  },
  {
    /*
      ── và nếu lượt đọc MÓN hỏng, màn hình phải nói ra ──

      `useTodayLog` đọc hai lượt: `meal_entries` cho tổng, rồi `meal_entry_items`
      cho chi tiết. Lượt đầu hỏng thì ném và tab hiện `LoadFailed`. Lượt thứ hai
      từng bị nuốt lỗi, nên truy vấn vẫn THÀNH CÔNG với dữ liệu thiếu một nửa:
      mỗi bữa đủ calo, `items: []`, và người dùng nhìn một thẻ "0 món · 540 kcal"
      mở ra rỗng, không có hàng nào để bấm sửa hay xoá — tức đúng lúc dữ liệu
      đáng ngờ nhất thì đường sửa nó biến mất, trong im lặng.

      Chỉ chặn ĐÚNG bảng món, không chặn `meal_entries`: đó là điều phân biệt
      bước này với chế độ `fail`, nơi mọi truy vấn đều hỏng và lượt đọc đầu che
      mất lượt thứ hai.
    */
    name: 'nhật ký: đọc món hỏng thì NÓI RA, không vẽ "0 món"',
    route: '/nutrition', mode: 'full',
    async run(page) {
      await page.route(
        (u) => u.pathname.includes('/rest/v1/meal_entry_items'),
        (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"server error"}' }),
      );
      /* Cache bền được nạp lại lúc khởi động và `staleTime` là 60s, nên không
         xoá nó thì lần tải sau phục vụ lại KẾT QUẢ CŨ ĐÃ THÀNH CÔNG và bước này
         xanh vì một lý do không liên quan gì tới điều nó hỏi. */
      await page.evaluate(() => window.localStorage.removeItem('ascnd_rq_cache'));
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(12000);

      const out = await page.evaluate(() => {
        const heads = new Set();
        for (const el of document.querySelectorAll('div')) {
          const t = (el.innerText ?? '').trim();
          if (!/^(Breakfast|Lunch|Dinner|Bữa sáng|Bữa trưa|Bữa tối)/.test(t)) continue;
          if (!/kcal/.test(t) || t.length > 90) continue;
          const r = el.getBoundingClientRect();
          if (r.height > 30 && r.height < 120) heads.add(t.replace(/\n/g, ' | '));
        }
        return { heads: [...heads], body: document.body.innerText };
      });
      if (out.heads.length) {
        return 'đọc món hỏng mà vẫn vẽ thẻ bữa ăn kèm đủ calo — lỗi bị nuốt, và người dùng ' +
          `mất luôn đường sửa: ${JSON.stringify(out.heads)}`;
      }
      if (!/Could not load your data|Không tải được dữ liệu/.test(out.body)) {
        return 'đọc món hỏng mà màn hình không báo gì';
      }
      return null;
    },
  },
  {
    /*
      ── `/diary`: tham số `date` có THẬT SỰ chảy tới truy vấn không ──

      Mười ba hook nhận `date?` và trước màn này không chỗ gọi nào truyền, nên
      cả bộ tham số ấy chưa từng chạy khác mặc định một lần nào. Một màn mới gọi
      chúng mà không ai đo thì "xem được ngày khác" vẫn có thể chỉ là một nhãn
      ngày đổi chữ trên đúng dữ liệu của hôm nay.

      ── và vì sao nó đo YÊU CẦU MẠNG chứ không đo các hàng hiện ra ──

      Bản đầu của bước này khẳng định "hôm nay có hai bữa, hôm qua không có bữa
      nào, nên lùi một ngày mà vẫn thấy Breakfast là đỏ". Nó đỏ thật, và nó SAI:
      route giả ở `openPage` trả về `FIXTURES[table]` NGUYÊN BẢNG, không đọc một
      tham số lọc nào. `?date_time=gte.…&date_time=lt.…` bị bỏ qua hoàn toàn,
      nên mọi ngày đều nhận đúng hai bữa ấy.

      Đó là một giới hạn có thật của bộ chạy — nó KHÔNG kiểm được bất kỳ lỗi lọc
      theo ngày nào của bất kỳ màn nào — và ghi ở đây để người sau không lại
      dựng một phép khẳng định lên trên nó lần nữa.

      Thứ đo được, và đúng ra là thứ nên đo ngay từ đầu, là YÊU CẦU mà app gửi
      đi: nếu `date` thật sự chảy tới `useTodayLog` thì sau cú bấm phải có một
      request `meal_entries` mang `date_time=gte.` của một ngày TRƯỚC hôm nay.
      Cái đó không phụ thuộc vào việc server giả có biết lọc hay không.

      Và vế cuối là vế dễ hỏng nhất: nút ghi thêm trên một ngày đã qua phải mở
      form ghi vào NGÀY ẤY. Thiếu một tham số ở đó thì người dùng vừa được mời
      sửa thứ Năm lại ghi thêm một bữa vào hôm nay, im lặng.
    */
    name: 'nhật ký ngày khác: lùi một ngày thì DỮ LIỆU đổi, và ghi thêm vẫn đúng ngày ấy',
    route: '/diary', mode: 'full',
    async run(page) {
      const read = () => page.evaluate(() => document.body.innerText);

      const atToday = await read();
      if (!/Today|Hôm nay/.test(atToday)) return 'mở /diary mà không thấy nhãn "Hôm nay"';
      if (!/Breakfast|Bữa sáng/.test(atToday)) return 'ngày hôm nay trong /diary không có bữa nào — fixture hay truy vấn hỏng';

      /* Mũi tên "ngày sau" phải TẮT ở hôm nay: một nhật ký đi được vào tương lai
         là một nhật ký hứa dữ liệu không thể tồn tại. */
      const nextDisabled = await page.evaluate(() => {
        const el = [...document.querySelectorAll('[aria-label]')]
          .find((e) => /Next day|Ngày sau/.test(e.getAttribute('aria-label')));
        if (!el) return 'missing';
        return el.getAttribute('aria-disabled') === 'true' || el.disabled === true;
      });
      if (nextDisabled === 'missing') return 'không tìm thấy nút "ngày sau"';
      if (nextDisabled !== true) return 'đang ở hôm nay mà nút "ngày sau" vẫn bấm được — nhật ký đi được vào tương lai';

      /* Ngày hôm nay theo ĐỒNG HỒ CỦA TRANG, không theo đồng hồ của Node: hai
         thứ ấy lệch nhau được, và khi lệch thì bước này đỏ vì múi giờ. */
      const todayStr = await page.evaluate(() => new Date().toLocaleDateString('en-CA'));

      /* Bắt đầu nghe TỪ ĐÂY, nên mọi request bên dưới đều là hệ quả của cú bấm. */
      const asked = [];
      page.on('request', (r) => asked.push(decodeURIComponent(r.url())));

      const prev = page.locator('[aria-label="Previous day"], [aria-label="Ngày trước"]').first();
      if ((await prev.count()) === 0) return 'không tìm thấy nút "ngày trước"';
      await prev.click();
      await page.waitForTimeout(3500);

      const atYesterday = await read();
      if (!/Yesterday|Hôm qua/.test(atYesterday)) {
        return 'bấm lùi một ngày mà nhãn không đổi thành "Hôm qua"';
      }

      const windows = asked
        .filter((u) => /\/rest\/v1\/meal_entries/.test(u))
        .map((u) => u.match(/date_time=gte\.(\d{4}-\d{2}-\d{2})/)?.[1])
        .filter(Boolean);
      if (!windows.length) {
        return 'bấm lùi một ngày mà app không hỏi lại `meal_entries` lần nào — nhãn đổi, truy vấn thì không';
      }
      if (!windows.some((d) => d < todayStr)) {
        return `bấm lùi một ngày mà cửa sổ truy vấn vẫn bắt đầu từ hôm nay (${windows.join(', ')}) — ` +
          '`date` không tới được useTodayLog, nên màn chỉ đổi nhãn chứ không đổi dữ liệu';
      }

      /* Ghi thêm vào CHÍNH ngày đang xem. */
      const add = page.getByText(/Log a meal for this day|Ghi một bữa cho ngày này/).first();
      if ((await add.count()) === 0) return 'ngày đã qua không có lối ghi thêm bữa nào';
      await add.click();
      await page.waitForTimeout(2500);
      const url = page.url();
      if (!/log-meal/.test(url)) return `bấm ghi thêm mà không mở màn ghi bữa: ${url}`;
      const carried = /[?&]date=(\d{4}-\d{2}-\d{2})/.exec(url)?.[1];
      if (!carried) {
        return `mở màn ghi bữa mà KHÔNG mang ngày theo (${url.replace(/^.*8731/, '')}) — ` +
          'người dùng đang sửa hôm qua sẽ ghi thêm một bữa vào hôm nay';
      }
      if (!(carried < todayStr)) {
        return `mở màn ghi bữa với ngày ${carried}, mà màn đang đứng ở một ngày TRƯỚC ${todayStr}`;
      }
      return null;
    },
  },
];

// ── the canary ────────────────────────────────────────────────────────────

/**
 * Prove the harness is looking at the app before believing anything it says.
 *
 * Not "did a page load" — a 404 page loads. These are numbers this app derives
 * from the fixture row: 2,450 − 1,680 = 770 remaining, and 8,432 steps. Nothing
 * but the real screen rendering the real fixture can put both on screen.
 */
async function canary(chromium) {
  const { text, rootLen, errors } = await boot(chromium, '/', 'full');
  const seen = {
    'tổng calo hôm nay': /1[,.]680/.test(text),
    'còn lại 770 kcal': /770/.test(text),
    'số bước 8.432': /8[,.]432/.test(text),
    'cây DOM có nội dung': rootLen > 5000,
  };
  const missing = Object.entries(seen).filter(([, ok]) => !ok).map(([k]) => k);
  if (missing.length) {
    console.error(
      'canary hỏng — bộ chạy KHÔNG nhìn thấy app thật, đừng tin kết quả nào bên dưới.\n' +
        `  thiếu: ${missing.join(', ')}\n` +
        '  Đây đúng là cách bản đầu tiên của công cụ này báo "30/30 màn khoẻ" trong khi\n' +
        '  29 trong số đó là trang 404 của web server.' +
        /* Lỗi runtime là thứ DUY NHẤT nói được vì sao trang trống, và không in nó
           ra thì người sửa chỉ biết "hỏng" mà không biết hỏng ở đâu. */
        (errors.length ? `\n\n  lỗi trang:\n${errors.slice(0, 5).map((e) => `    ${e}`).join('\n')}` : '\n\n  (trang không ném lỗi nào — nhiều khả năng là server, không phải app)'),
    );
    process.exit(2);
  }
}

// ── run ───────────────────────────────────────────────────────────────────

const BAD_TEXT = /\bNaN\b|\bundefined\b|\[object Object\]|Invalid Date|\bInfinity\b/;

const chromium = loadChromium();
build();
const server = await serve();
const problems = [];

try {
  await canary(chromium);
  process.stdout.write('canary OK — đang mở từng màn');

  for (const mode of args.has('--press-only') || narrowOnly || onlyArg ? [] : MODES) {
    for (const route of ROUTES) {
      const { text, rootLen, errors } = await boot(chromium, route, mode);
      const at = `[${mode}] ${route}`;

      /* Blank is the failure nobody reports, because there is nothing to
         report: no error, no message, no way to tell it from a slow network. */
      if (rootLen < 400) problems.push(`${at}: màn hình trắng (root ${rootLen} ký tự)`);

      const bad = text.split('\n').filter((l) => BAD_TEXT.test(l)).slice(0, 2);
      if (bad.length) problems.push(`${at}: chữ không dành cho người dùng — ${bad.join(' / ')}`);

      if (errors.length) problems.push(`${at}: lỗi runtime — ${errors.slice(0, 2).join(' | ').slice(0, 200)}`);

      process.stdout.write('.');
    }
  }
  console.log('');

  /*
    ── the driving half ──

    Opening a screen proves it renders. It says nothing about whether anything
    on it works, and the app's very first button did nothing at all for weeks
    while every static rule stayed green.
  */
  /*
    ── the narrow half (#48) ──

    Every Community screen at 320×720, in both languages: the page must not be
    wider than the frame, and no string the APP wrote may be cut to "…". User
    content cut by `numberOfLines` is what that prop is for — listed, not
    failed. See `live-narrow.mjs` for how the two are told apart.
  */
  globalThis.__narrow = null;
  if (!args.has('--press-only') && !onlyArg) {
    process.stdout.write('quét hẹp 320');
    const patterns = copyPatterns();
    const contentCut = new Set();
    let opened = 0;
    let largeOpened = 0;
    let clipExempted = 0;
    /* Cỡ chữ mặc định ở cả hai ngôn ngữ, rồi chữ lớn (#56) ở LARGE_LANGS.
       Màn Dinh dưỡng (#55) chạy ở lượt cỡ chữ mặc định; lượt chữ lớn vẫn là
       phạm vi #56 (Cộng đồng). */
    const passes = [
      ...NARROW_LANGS.map((lang) => ({ lang, large: false })),
      ...LARGE_LANGS.map((lang) => ({ lang, large: true })),
    ];
    for (const { lang, large } of passes) {
      for (const route of large ? [...NARROW_ROUTES, ...NARROW_ROUTES_MAIN] : [...NARROW_ROUTES, ...NARROW_ROUTES_NUTRITION, ...NARROW_ROUTES_MAIN]) {
        const { browser, page, errors } = await openPage(chromium, route, 'full', 9000, { ...NARROW, lang });
        try {
          const at = `[320 ${lang}${large ? ` chữ ×${LARGE_TEXT}` : ''}] ${route}`;
          if (errors.length) problems.push(`${at}: lỗi runtime — ${errors.slice(0, 2).join(' | ').slice(0, 200)}`);
          const rootLen = await page.evaluate(() => document.getElementById('root')?.innerHTML?.length ?? 0);
          if (rootLen < 400) problems.push(`${at}: màn hình trắng (root ${rootLen} ký tự)`);
          if (large) {
            if ((await enlargeText(page)) === 0) problems.push(`${at}: phóng chữ không đổi được cỡ của phần tử chữ nào — giả lập hỏng, đừng tin lượt này`);
            await page.waitForTimeout(300);
          }
          const { wide, cut, clipped } = await narrowFindings(page, patterns);
          if (wide) problems.push(`${at}: trang rộng ${wide}px trong khung ${NARROW.width}px — cả màn cuộn ngang`);
          if (!large) {
            for (const c of clipped) {
              if (clipExempt(route, c)) clipExempted++;
              else problems.push(`${at}: ô chọn bị mép vùng cuộn cắt ngang khi chưa cuộn — ${c}`);
            }
          }
          for (const c of cut) {
            if (c.app) problems.push(`${at}: chữ của app bị cắt thành "…" — "${c.text.slice(0, 80)}"`);
            else contentCut.add(c.text.slice(0, 40));
          }
          if (large) largeOpened++;
          else opened++;
        } finally {
          await browser.close();
        }
        process.stdout.write('.');
      }
    }
    console.log('');
    globalThis.__narrow = { opened, largeOpened, contentCut: contentCut.size, clipExempted };
  }

  if (!narrowOnly) {
    process.stdout.write('bấm thử từng nút');
    let pressed = 0;
    let skipped = 0;
    /* `/workouts` thay `/progress`: trang cũ không còn, nên suốt từ ba33494 lượt
       bấm ở đây bấm trên một trang không-tìm-thấy và không đo gì. */
    for (const [route, mode] of onlyArg ? [] : [['/', 'signedout'], ['/', 'full'], ['/workouts', 'full'], ['/settings', 'full']]) {
      const { browser, page } = await openPage(chromium, route, mode);
      try {
        const r = await pressEverything(page, `[${mode}] ${route}`, problems);
        pressed += r.tried;
        skipped += r.skipped;
      } finally {
        await browser.close();
      }
      process.stdout.write('.');
    }
    console.log('');
    globalThis.__skipped = skipped;

    process.stdout.write('kịch bản');
    const picked = onlyArg ? SCENARIOS.filter((sc) => sc.name.includes(onlyArg)) : SCENARIOS;
    if (onlyArg && picked.length === 0) problems.push(`--only=${onlyArg}: không kịch bản nào có tên chứa chuỗi này`);
    globalThis.__picked = picked.length;
    for (const sc of picked) {
      const { browser, page } = await openPage(chromium, sc.route, sc.mode);
      try {
        const why = await sc.run(page);
        if (why) problems.push(`${sc.name} — ${why}`);
      } catch (e) {
        problems.push(`${sc.name} — không chạy được: ${e.message.split('\n')[0].slice(0, 140)}`);
      } finally {
        await browser.close();
      }
      process.stdout.write('.');
    }
    console.log('');
    globalThis.__pressed = pressed;
  }
} finally {
  server.close();
}

for (const m of RPC_ARG_MISSES) {
  problems.push(`máy chủ giả trả 404 PGRST202 (như PostgREST): ${m} so với chữ ký trong \`types.ts\` — trên server thật không tìm ra hàm`);
}
for (const m of SELECT_MISSES) {
  problems.push(`máy chủ giả trả 400 (như PostgREST): ${m} trong \`types.ts\` — trên server thật câu này hỏng MỌI lần`);
}

/* #38: không phải lỗi — nói rõ RPC nào lượt này vẫn chỉ thấy `[]`, để không ai
   đọc "xanh" thành "đã quét nhánh có dữ liệu" của một hàm chưa có fixture. */
const RPC_NOTE = () =>
  `RPC có fixture (tính từ thế giới giả, tools/live-rpc.mjs): ${Object.keys(RPC_FIXTURES).join(', ')}. ` +
  (RPC_UNFIXTURED.size
    ? `RPC app đã gọi mà CHƯA có fixture, nên vẫn nhận [] như trước #38: ${[...RPC_UNFIXTURED].sort().join(', ')}`
    : 'Không RPC nào app gọi trong lượt này thiếu fixture') +
  (WRITES_NOT_APPLIED.size
    ? `. Lệnh ghi KHÔNG áp vào thế giới giả (bộ lọc không hiểu, trả lời kiểu cũ): ${[...WRITES_NOT_APPLIED].sort().join('; ')}`
    : '. Mọi lệnh ghi của lượt này đều được áp vào thế giới giả của trang');

if (problems.length) {
  console.log(RPC_NOTE());
  console.log(`\nchạy thật: ${problems.length} vấn đề\n`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

/*
  The summary may only claim what this run actually did.

  With `--press-only` the first version still announced "25 screens × 3 states"
  — a sentence about work it had just been told to skip. That is the same lie
  this tool exists to catch, printed by the tool itself, and a green line
  nobody can trust is worse than a red one.
*/
const narrowClaim = globalThis.__narrow
  ? `${globalThis.__narrow.opened} lượt mở màn Cộng đồng, Dinh dưỡng và các tab chính ở ${NARROW.width}×${NARROW.height} (${NARROW_LANGS.join(' + ')}): ` +
    'không trang nào rộng hơn khung, không chữ nào của app hay số đo nào bị cắt thành "…", không ô chọn nào ' +
    'bị mép vùng cuộn cắt ngang; ' +
    `thêm ${globalThis.__narrow.largeOpened} lượt màn Cộng đồng và các tab chính với chữ ×${LARGE_TEXT} (${LARGE_LANGS.join(' + ')}, giả lập Dynamic Type): ` +
    'không trang nào rộng hơn khung, không chữ nào của app hay số đo nào bị cắt ' +
    `(${globalThis.__narrow.contentCut} đoạn nội dung người dùng được cắt đúng luật numberOfLines; ` +
    `${globalThis.__narrow.clipExempted} ô vắt mép được miễn theo NARROW_CLIP_OK, mỗi mục một lý do)`
  : 'bỏ qua lượt quét hẹp';

if (onlyArg) {
  console.log(`\nchạy thật OK (--only=${onlyArg}) — ${globalThis.__picked} kịch bản đúng; KHÔNG quét màn, không bấm thử`);
  process.exit(0);
}

if (narrowOnly) {
  console.log(`\nchạy thật OK (--narrow-only) — ${narrowClaim}`);
  console.log(RPC_NOTE());
  process.exit(0);
}

const sweptClaim = args.has('--press-only')
  ? 'bỏ qua vòng quét màn (--press-only)'
  : `${ROUTES.length} màn × ${MODES.length} trạng thái (đủ dữ liệu / tài khoản trống / mọi truy vấn hỏng): ` +
    'không màn nào trắng, không lỗi runtime, không chữ lọt ra ngoài như NaN hay undefined';

console.log(
  `\nchạy thật OK — ${sweptClaim}; ` +
    `đã BẤM THỬ ${globalThis.__pressed} nút trên 4 màn và nút nào cũng làm màn hình đổi ` +
    `(${globalThis.__skipped} nút được bỏ qua có lý do: disabled, đang được chọn sẵn, bị che, ` +
    'hoặc việc duy nhất của nó là mở hộp thoại xác nhận — thứ mà Alert của react-native-web là hàm rỗng); ' +
    `${SCENARIOS.length} kịch bản có kết quả cụ thể đều đúng; ${narrowClaim}; ` +
    'canary xác nhận bộ chạy nhìn đúng app thật chứ không phải trang lỗi của server',
);
console.log(RPC_NOTE());
