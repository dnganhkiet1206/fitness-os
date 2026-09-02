/**
 * The app's logic, actually running, in three states.
 *
 *   node tools/live.mjs            build, boot every screen, then press things
 *   node tools/live.mjs --no-build reuse the last build
 *   node tools/live.mjs --shots    also write PNGs to tools/.live-shots/
 *   node tools/live.mjs --press-only  skip the screen sweep, only drive controls
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
import { FIXTURES, REF, UID, day, jwt } from './live-world.mjs';

const args = new Set(process.argv.slice(2));
const wantShots = args.has('--shots');

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
  '/', '/nutrition', '/workouts', '/progress', '/assistant',
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
async function openPage(chromium, route, mode, settleMs = 9000) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
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

  await page.route('**/*.supabase.co/**', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/rest/v1/')) {
      if (mode === 'fail') {
        return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"server error"}' });
      }
      const table = u.pathname.split('/')[3];
      const rows = mode === 'empty' && table !== 'profiles' ? [] : (FIXTURES[table] ?? []);
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
    mkdirSync(path.join(SHOTS, mode), { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, mode, `${route === '/' ? 'today' : route.slice(1)}.png`) });
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
    name: 'Today: nút ghi bữa ăn mở đúng màn',
    route: '/', mode: 'full',
    async run(page) {
      const btn = page.getByText(/Log meal|Ghi bữa ăn/).first();
      if ((await btn.count()) === 0) return 'không tìm thấy nút ghi bữa ăn trên Today';
      await btn.click();
      await page.waitForTimeout(2500);
      if (!/log-meal/.test(page.url())) return `bấm xong vẫn ở ${page.url().replace(/^.*8731/, '')}`;
      return null;
    },
  },
  {
    name: 'Tiến trình: đổi tab đổi nội dung',
    route: '/progress', mode: 'full',
    async run(page) {
      const before = await readable(page);
      const tab = page.getByText(/Measurements|Số đo/).first();
      if ((await tab.count()) === 0) return 'không tìm thấy tab số đo';
      await tab.click();
      await page.waitForTimeout(1500);
      if ((await readable(page)) === before) return 'bấm tab mà nội dung không đổi';
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
  const { text, rootLen } = await boot(chromium, '/', 'full');
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
        '  29 trong số đó là trang 404 của web server.',
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

  for (const mode of args.has('--press-only') ? [] : MODES) {
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
  process.stdout.write('bấm thử từng nút');
  let pressed = 0;
  let skipped = 0;
  for (const [route, mode] of [['/', 'signedout'], ['/', 'full'], ['/progress', 'full'], ['/settings', 'full']]) {
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
  for (const sc of SCENARIOS) {
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
} finally {
  server.close();
}

if (problems.length) {
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
const sweptClaim = args.has('--press-only')
  ? 'bỏ qua vòng quét màn (--press-only)'
  : `${ROUTES.length} màn × ${MODES.length} trạng thái (đủ dữ liệu / tài khoản trống / mọi truy vấn hỏng): ` +
    'không màn nào trắng, không lỗi runtime, không chữ lọt ra ngoài như NaN hay undefined';

console.log(
  `\nchạy thật OK — ${sweptClaim}; ` +
    `đã BẤM THỬ ${globalThis.__pressed} nút trên 4 màn và nút nào cũng làm màn hình đổi ` +
    `(${globalThis.__skipped} nút được bỏ qua có lý do: disabled, đang được chọn sẵn, bị che, ` +
    'hoặc việc duy nhất của nó là mở hộp thoại xác nhận — thứ mà Alert của react-native-web là hàm rỗng); ' +
    `${SCENARIOS.length} kịch bản có kết quả cụ thể đều đúng; ` +
    'canary xác nhận bộ chạy nhìn đúng app thật chứ không phải trang lỗi của server',
);
