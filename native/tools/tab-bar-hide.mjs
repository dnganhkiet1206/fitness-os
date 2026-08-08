/**
 * That the tab bar leaves, rather than vanishes — and that the page arriving
 * behind it agrees about how long that takes.
 *
 * ── why this needs a tool at all ──
 *
 * Opening the Health Assistant hides the tab bar. That part is one prop and it
 * works. What it did *not* do was move: `react-native-screens` applies
 * `tabBarHidden` with `animated:NO` hard-coded on both of its call sites, so
 * the bar was there on one frame and gone on the next, which is the specific
 * thing that made the transition look wrong.
 *
 * Nothing in JavaScript can fix that. The bar is a `UITabBar` owned by a
 * `UITabBarController` — it lives outside the React view hierarchy, so there
 * is no view here to wrap in an `Animated.View` and no opacity here to drive.
 * The only place the decision exists is in the native file, so the fix is
 * `patches/react-native-screens+4.25.2.patch`, two lines, `NO` → `YES`.
 *
 * A patch is a fragile place to keep a decision, and it fails silently in two
 * directions:
 *
 *   - **`postinstall` did not run.** `npm ci --ignore-scripts`, a partial
 *     install, a fresh clone someone `npm i --no-scripts`-ed. `node_modules`
 *     goes back to upstream, the bar goes back to blinking, and there is no
 *     error anywhere — the app builds, runs, and is subtly worse.
 *   - **the package was bumped.** `patch-package` does fail loudly on a
 *     conflict, but only if the hunks conflict. A version whose surrounding
 *     lines happen to match still leaves the patch *named* for a version that
 *     is no longer installed, which is the first thing anyone debugging this
 *     will be misled by.
 *
 * Both are invisible by reading a diff and only visible by watching the bottom
 * of a phone during a tab change. That is exactly the class of thing that
 * belongs in a check.
 *
 * ── and why the timings are checked next to it ──
 *
 * The bar's slide is UIKit's, roughly 300ms, and it is not a number this app
 * gets to pick. Everything on the assistant page that moves on arrival is
 * therefore set *to* it: the cards settle over 340ms, the aura blooms over
 * 420ms. That ordering is the whole effect — bar out, cards down, light up —
 * and it only reads as one motion while the three stay close together.
 *
 * The first version had the cards landing at 560ms and the light at 620ms,
 * against a bar that was already gone. Half the arrival was the page still
 * moving with nothing to move *with*, and it felt slow. Those numbers live in
 * two different files, so nothing but a check keeps them in step.
 *
 * ── what is checked ──
 *
 * 1. the navigator still drives `hidden` from the route
 * 2. the patch exists and is named for the version actually installed
 * 3. it converts every `setTabBarHidden:` call, and leaves none at `NO`
 * 4. the installed `node_modules` copy matches — i.e. `postinstall` ran
 * 5. the settle starts from the page as it is, not from invisible
 * 6. the light lands last, and the whole arrival is over quickly
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

const NATIVE_FILE = 'node_modules/react-native-screens/ios/tabs/host/RNSTabsHostComponentView.mm';

/**
 * How long the bar takes to go, and what the page is allowed to spend.
 *
 * `BAR_MS` is not ours — it is `UITabBarController`'s standard hide, and it is
 * written down here only so the other two numbers have something to be judged
 * against.
 *
 * `FLOOR` exists because "fast" has a bottom. Under about 150ms a move stops
 * reading as a transition and starts reading as a dropped frame; the point of
 * animating the bar was to stop things appearing out of nowhere, and winning
 * that by making everything else appear out of nowhere is not a win.
 */
const BAR_MS = 300;
const FLOOR = 150;
const CEILING = 500;

/*
  ── 1: the prop is driven by the last *tab*, not by the pathname ──

  `hidden={pathname === '/assistant'}` is the obvious version and it flashes.
  Push anything from the assistant — the coach, a metric tile, a tool — and
  `pathname` becomes that route, `hidden` flips to false, and the bar slides
  back *up* underneath the screen still sliding in. A third of a second of a
  bar reappearing on a page that had deliberately hidden it.

  This was happening before `animated:YES` too; the patch is what made it
  visible, because a snap during a transition nobody watches is not the same
  as three hundred milliseconds of movement. That is the cost of that patch
  landing somewhere it was not expected, and it is the reason this rule exists
  rather than a comment.

  So the rule is about the *shape*: the decision has to come from a value that
  a push cannot change. Checked as "the pathname is not compared directly to
  a route", plus the two pieces that make the frozen version work.
*/
function navigatorProblems(raw) {
  const bad = [];
  /* Comments out first. The file's own note quotes the broken line verbatim to
     explain why it is broken, and the first version of this rule fired on that
     — a check that forbids describing what it forbids is one nobody can leave
     a note next to. `training-card.mjs` hit the same trap and documents it. */
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (/hidden=\{pathname ===/.test(src)) {
    bad.push(
      'app-tabs: `hidden` so thẳng pathname — mọi màn push từ trang trợ lý sẽ làm ' +
        'thanh tab trượt trở lại ngay dưới màn đang trượt vào. Phải quyết theo tab cuối cùng.',
    );
  }
  if (!/const TAB_ROUTES = \[/.test(src) || !/lastTab/.test(src)) {
    bad.push(
      'app-tabs: không còn ghi nhớ tab cuối cùng — thiếu TAB_ROUTES/lastTab thì ' +
        '`hidden` lại đổi theo từng lần push',
    );
  }
  if (!/hidden=\{hidden\}/.test(src)) {
    bad.push('app-tabs: `hidden` không còn được truyền vào NativeTabs');
  }
  /* Every tab has to be in the list, or visiting it leaves `lastTab` pointing
     at wherever you were before — and the bar's state would be a page behind. */
  for (const route of ['/', '/nutrition', '/workouts', '/progress', '/assistant']) {
    if (!new RegExp(`'${route.replace('/', '\\/')}'`).test(src.match(/const TAB_ROUTES = \[[^\]]*\]/)?.[0] ?? '')) {
      bad.push(`app-tabs: TAB_ROUTES thiếu '${route}' — vào tab đó thì trạng thái thanh tab trễ một trang`);
    }
  }
  return bad;
}

// ── 2 + 3: the patch ──
function patchProblems(files, installedVersion, patchBody) {
  const bad = [];
  const mine = files.filter((f) => f.startsWith('react-native-screens+'));

  if (mine.length === 0) {
    bad.push(
      'không thấy patches/react-native-screens+*.patch — thanh tab sẽ biến mất ' +
        'giữa hai khung hình, không có hiệu ứng nào cả',
    );
    return bad;
  }
  if (mine.length > 1) {
    bad.push(`có ${mine.length} bản vá react-native-screens: ${mine.join(', ')} — chỉ được một`);
  }

  const named = mine[0].replace(/^react-native-screens\+/, '').replace(/\.patch$/, '');
  if (named !== installedVersion) {
    bad.push(
      `bản vá tên cho ${named} nhưng đang cài ${installedVersion} — ` +
        'patch-package sẽ không áp, và thanh tab lặng lẽ quay về nhấp nháy',
    );
  }

  // Count what the patch actually does, from its own +/- lines. A patch that
  // exists but no longer touches these calls is the same as no patch.
  const removed = [...patchBody.matchAll(/^-.*setTabBarHidden:.*animated:NO/gm)].length;
  const added = [...patchBody.matchAll(/^\+.*setTabBarHidden:.*animated:YES/gm)].length;
  if (removed !== 2 || added !== 2) {
    bad.push(
      `bản vá đổi ${removed} chỗ animated:NO thành ${added} chỗ animated:YES — ` +
        'phải là 2/2: một ở đường props Fabric, một ở setter kiến trúc cũ',
    );
  }
  return bad;
}

// ── 4: what is actually on disk, which is what compiles ──
function installedProblems(src) {
  const bad = [];
  const stillNo = [...src.matchAll(/setTabBarHidden:.*animated:NO/g)].length;
  const yes = [...src.matchAll(/setTabBarHidden:.*animated:YES/g)].length;
  if (stillNo > 0) {
    bad.push(
      `${NATIVE_FILE}: còn ${stillNo} chỗ animated:NO — bản vá chưa được áp. ` +
        'Chạy `npm run postinstall` (npm ci --ignore-scripts sẽ gây ra đúng lỗi này)',
    );
  }
  if (yes !== 2) {
    bad.push(`${NATIVE_FILE}: có ${yes} chỗ animated:YES, phải là 2`);
  }
  return bad;
}

// ── 5 + 6: the arrival ──
function timingProblems(settle, aura, assistant) {
  const bad = [];

  const dur = Number(settle.match(/withTiming\(1, \{ duration: (\d+)/)?.[1]);
  const step = Number(settle.match(/index \* (\d+)/)?.[1]);
  const base = Number(settle.match(/opacity: ([\d.]+) \+ t\.value/)?.[1]);
  const bloom = Number(aura.match(/bloom\.value = withTiming\(1, \{ duration: (\d+)/)?.[1]);
  const indices = [...assistant.matchAll(/<Settle index=\{(\d+)\}>/g)].map((m) => Number(m[1]));

  if (![dur, step, base, bloom].every(Number.isFinite) || indices.length === 0) {
    return ['không đọc được các mốc thời gian — settle.tsx / assistant-aura.tsx / assistant.tsx đã đổi hình dạng'];
  }

  /* The lesson `screen.tsx` records: `FadeInDown` and its family begin at
     invisible, and on a page a UITabBarController keeps mounted that means
     un-drawing what is already there. Anything near zero here is that bug
     coming back. */
  if (base < 0.5) {
    bad.push(
      `settle bắt đầu từ opacity ${base} — trên trang vẫn còn mount, mọi thứ ` +
        'bắt đầu gần 0 đều phải xoá đi cái đang hiện, và người dùng thấy cái nháy đó',
    );
  }

  const last = dur + step * Math.max(...indices);
  if (last < FLOOR) bad.push(`thẻ đáp xuống sau ${last}ms — dưới ${FLOOR}ms thì đó là một khung hình rớt, không phải hiệu ứng`);
  if (last > CEILING) bad.push(`thẻ đáp xuống sau ${last}ms — quá ${CEILING}ms là chậm, người dùng đã yêu cầu nhanh`);
  if (bloom > CEILING) bad.push(`ánh sáng lên trong ${bloom}ms — quá ${CEILING}ms`);

  /* Light is the slowest thing in a real arrival. If it finishes first the
     cards are the ones that look late. */
  if (bloom < last) {
    bad.push(`ánh sáng xong ở ${bloom}ms trước khi thẻ xong ở ${last}ms — ánh sáng phải là thứ đáp sau cùng`);
  }

  /* And all of it has to stay in the same breath as the bar. Twice the bar's
     own length is where "one motion" stops being true. */
  if (bloom > BAR_MS * 2) {
    bad.push(`ánh sáng ${bloom}ms so với thanh tab ${BAR_MS}ms — rời nhau quá xa, thành hai chuyển động khác nhau`);
  }
  return bad;
}

// ── run it ──
const problems = [];
problems.push(...navigatorProblems(read('src/components/app-tabs.tsx')));

const patchFiles = existsSync(path.join(NATIVE, 'patches')) ? readdirSync(path.join(NATIVE, 'patches')) : [];
const mine = patchFiles.find((f) => f.startsWith('react-native-screens+'));
const version = existsSync(path.join(NATIVE, 'node_modules/react-native-screens/package.json'))
  ? JSON.parse(read('node_modules/react-native-screens/package.json')).version
  : null;

if (version === null) {
  problems.push('chưa cài react-native-screens — chạy npm install trước');
} else {
  problems.push(...patchProblems(patchFiles, version, mine ? read(`patches/${mine}`) : ''));
  if (existsSync(path.join(NATIVE, NATIVE_FILE))) {
    problems.push(...installedProblems(read(NATIVE_FILE)));
  } else {
    problems.push(`không thấy ${NATIVE_FILE} — react-native-screens đã đổi bố cục thư mục`);
  }
}

problems.push(
  ...timingProblems(
    read('src/components/ascnd/settle.tsx'),
    read('src/components/ascnd/assistant-aura.tsx'),
    read('src/app/(tabs)/assistant.tsx'),
  ),
);

/**
 * The self-test.
 *
 * Every rule above is handed the broken version it exists to catch, and has to
 * catch it. A check that has never failed is a check nobody has any reason to
 * believe — and this file has more than the usual reason to prove itself,
 * because two of its four subjects are files it does not own.
 */
const selfTest = [
  ['prop bị gỡ', () => navigatorProblems('<NativeTabs minimizeBehavior="onScrollDown">')],
  ['so thẳng pathname', () => navigatorProblems(GOOD_TABS.replace('hidden={hidden}', "hidden={pathname === '/assistant'}"))],
  ['thiếu một tab', () => navigatorProblems(GOOD_TABS.replace("'/progress', ", ''))],
  ['không có bản vá', () => patchProblems(['expo-modules-jsi+57.0.3.patch'], '4.25.2', '')],
  ['bản vá sai phiên bản', () => patchProblems(['react-native-screens+4.20.0.patch'], '4.25.2', GOOD_PATCH)],
  ['bản vá chỉ sửa một chỗ', () => patchProblems(['react-native-screens+4.25.2.patch'], '4.25.2', HALF_PATCH)],
  ['postinstall chưa chạy', () => installedProblems('[_controller setTabBarHidden:_tabBarHidden animated:NO];\n'.repeat(2))],
  ['settle bắt đầu từ 0', () => timingProblems(GOOD_SETTLE.replace('opacity: 0.86 +', 'opacity: 0.0 +'), GOOD_AURA, GOOD_PAGE)],
  ['arrival quá chậm', () => timingProblems(GOOD_SETTLE.replace('duration: 220', 'duration: 560'), GOOD_AURA, GOOD_PAGE)],
  ['ánh sáng xong trước thẻ', () => timingProblems(GOOD_SETTLE, GOOD_AURA.replace('duration: 420', 'duration: 200'), GOOD_PAGE)],
];

const GOOD_TABS =
  "const TAB_ROUTES = ['/', '/nutrition', '/workouts', '/progress', '/assistant'];\n" +
  '  const lastTab = useRef("/");\n' +
  '  <NativeTabs hidden={hidden}>';
const GOOD_PATCH =
  '-      [_controller setTabBarHidden:_tabBarHidden animated:NO];\n' +
  '+      [_controller setTabBarHidden:_tabBarHidden animated:YES];\n' +
  '-    [_controller setTabBarHidden:_tabBarHidden animated:NO];\n' +
  '+    [_controller setTabBarHidden:_tabBarHidden animated:YES];\n';
const HALF_PATCH = GOOD_PATCH.split('\n').slice(0, 2).join('\n');
const GOOD_SETTLE =
  't.value = withDelay(index * 30, withTiming(1, { duration: 220, easing }));\n' +
  'opacity: 0.86 + t.value * 0.14,\n';
const GOOD_AURA = 'bloom.value = withTiming(1, { duration: 420, easing });\n';
const GOOD_PAGE = '<Settle index={0}><Settle index={1}><Settle index={2}><Settle index={3}><Settle index={4}>';

const missed = selfTest.filter(([, fn]) => fn().length === 0).map(([label]) => label);
if (missed.length) {
  console.log(`tự kiểm tra hỏng — không bắt được: ${missed.join(', ')}`);
  process.exit(1);
}

if (problems.length) {
  for (const p of problems) console.log(`• ${p}`);
  process.exit(1);
}

const dur = Number(read('src/components/ascnd/settle.tsx').match(/duration: (\d+)/)[1]);
const step = Number(read('src/components/ascnd/settle.tsx').match(/index \* (\d+)/)[1]);
const bloom = Number(read('src/components/ascnd/assistant-aura.tsx').match(/bloom\.value = withTiming\(1, \{ duration: (\d+)/)[1]);
const idx = Math.max(...[...read('src/app/(tabs)/assistant.tsx').matchAll(/<Settle index=\{(\d+)\}>/g)].map((m) => Number(m[1])));
console.log(`thanh tab trượt ${BAR_MS}ms · thẻ ${dur + step * idx}ms · ánh sáng ${bloom}ms — đã vá, đúng thứ tự`);
