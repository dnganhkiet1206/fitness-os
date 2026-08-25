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
  /* And the panel people tick sets off on while they are training — the other
     screen the music shortcut lives on, and the one a plan is actually read
     from. It was missing for the same reason `/log-workout` was. */
  '/routine',
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
      /* The pill is the one absolutely-positioned child of the row that is not
         a segment — found by walking up from a label rather than by a test id,
         so this keeps working if the markup is rearranged. */
      const pillX = () =>
        page.evaluate(() => {
          const label = [...document.querySelectorAll('div')]
            .find((d) => d.textContent?.trim() === 'Today' && d.getAttribute('role') === 'tab');
          const row = label?.parentElement;
          if (!row) return null;
          const pill = [...row.children].find((c) => getComputedStyle(c).position === 'absolute');
          return pill ? pill.getBoundingClientRect().x : null;
        });

      const start = await pillX();
      if (start == null) return 'không tìm thấy viên chọn trong hàng segmented';

      await page.getByRole('tab', { name: 'Foods' }).click();
      /* Well inside the 220ms slide. If the control jumps, this already reads
         the destination; if it travels, it is somewhere between. */
      await page.waitForTimeout(70);
      const mid = await pillX();
      await page.waitForTimeout(600);
      const end = await pillX();

      if (mid == null || end == null) return 'mất dấu viên chọn giữa chừng';
      if (Math.abs(end - start) < 4) return `bấm sang Foods mà viên chọn không dịch (${start} → ${end})`;
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
