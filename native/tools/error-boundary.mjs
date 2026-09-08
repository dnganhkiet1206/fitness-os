/**
 * Một màn hỏng không được là cả app hỏng — CHẠY THẬT, trong React thật.
 *
 * ── vì sao bước này không đọc mã ──
 *
 * "Có một error boundary" là một câu dễ kiểm bằng `grep` và gần như vô nghĩa.
 * Bốn chỗ hỏng thật đều không hiện ra trong mã nguồn:
 *
 *   1. Gõ sai tên `getDerivedStateFromError` — React im lặng bỏ qua, class vẫn
 *      là class, và app vẫn trắng màn đúng như trước khi có boundary.
 *   2. Fallback tự ném. Lúc ấy React tháo luôn cả boundary, và ta quay lại đúng
 *      màn trắng — chỉ tốn thêm một nhịp.
 *   3. Nút thử lại không đặt lại state, hoặc đặt lại rồi lặp vô hạn.
 *   4. Fallback in ra thông điệp lỗi, thứ mang theo `user_id=eq.<uuid>` hay một
 *      access token.
 *
 * Nên bước này nạp React 19 và ReactDOM THẬT vào một trình duyệt thật, nạp
 * `error-boundary.tsx` đã biên dịch, rồi làm đúng thứ người dùng gặp: cho một
 * component con ném lúc render.
 *
 * ── và cái nó KHÔNG chứng minh ──
 *
 * Nó chạy trong DOM, không phải trên iOS. Error boundary là cơ chế của React
 * chứ không của renderer, nên phần máy trạng thái ở đây đúng như trên máy thật;
 * nhưng bố cục, `UIVisualEffectView` và lớp interop thì không. Và nó KHÔNG bắt
 * được sự cố native — lớp lỗi của A9 — vì không mã JS nào bắt được.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const want = (ok, msg) => { if (!ok) problems.push(msg); };

/* ── phần TĨNH: biên nằm đúng chỗ, và fallback không mượn chỗ hay hỏng ─────── */
{
  const layout = readFileSync(path.join(NATIVE, 'src/app/_layout.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  want(/<AppErrorBoundary>\s*<Gate\s*\/>\s*<\/AppErrorBoundary>/.test(layout),
    'biên không bọc `<Gate />` trong `_layout.tsx`. Mọi màn của app nằm dưới Gate; bọc chỗ khác là bỏ trống '
    + 'một phần cây, và phần bị bỏ trống thì không ai thấy cho tới khi nó hỏng');

  const eb = readFileSync(path.join(NATIVE, 'src/components/ascnd/error-boundary.tsx'), 'utf8');
  /*
    Fallback không được chia phụ thuộc với chỗ hay hỏng nhất.

    `LoadFailed` dựng trên `GlassCard` + `MascotFigure`, tức lớp kính và rig
    nhân vật. Lớp kính là đúng chỗ A9 nổ, và `glass-card.tsx:154` còn nằm trong
    danh sách nhánh theo theme mà `theme-shape.mjs` đóng băng. Một màn hình sinh
    ra VÌ có thứ vừa hỏng mà lại dựng trên thứ hay hỏng là chỗ hở số 2 ở đầu
    tệp này.
  */
  for (const banned of ['GlassCard', 'MascotFigure', 'LoadFailed', 'BlurView', 'MaskedView', 'PressScale', 'react-native-svg']) {
    want(!new RegExp(`\\b${banned}\\b`).test(eb.replace(/\/\*[\s\S]*?\*\//g, '')),
      `fallback dùng \`${banned}\` — màn hình dựng ra vì có thứ vừa hỏng không được chia phụ thuộc với `
      + 'lớp kính / rig nhân vật / lớp hoạt hoạ, những chỗ hay hỏng nhất trong app');
  }
  want(/usePalette|makeStyles/.test(eb),
    'fallback không đọc bảng màu — nó phải theo theme như phần còn lại của app, không phải màu gõ tay');
}

/* ── biên dịch component thật ────────────────────────────────────────────── */
const out = mkdtempSync(path.join(tmpdir(), 'errb-'));
try {
  execFileSync('npx', ['tsc',
    'src/components/ascnd/error-boundary.tsx', 'src/lib/native-strings.ts',
    '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2022',
    '--jsx', 'react-jsx', '--skipLibCheck', '--lib', 'es2022,dom', '--esModuleInterop'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
} catch { /* Đường dẫn `@/…` không phân giải được ngoài tsconfig; tsc kêu rồi vẫn emit. */ }

const EB = path.join(out, 'components/ascnd/error-boundary.js');
const STR = path.join(out, 'lib/native-strings.js');
if (!existsSync(EB) || !existsSync(STR)) {
  console.error('biên bắt lỗi: không biên dịch được error-boundary.tsx hoặc native-strings.ts');
  process.exit(1);
}

/* ── nạp React thật vào một trình duyệt thật ─────────────────────────────── */
const N = path.join(NATIVE, 'node_modules');
const mods = {
  react: readFileSync(path.join(N, 'react/cjs/react.development.js'), 'utf8'),
  'react-dom': readFileSync(path.join(N, 'react-dom/cjs/react-dom.development.js'), 'utf8'),
  'react-dom/client': readFileSync(path.join(N, 'react-dom/cjs/react-dom-client.development.js'), 'utf8'),
  scheduler: readFileSync(path.join(N, 'scheduler/cjs/scheduler.development.js'), 'utf8'),
  'react/jsx-runtime': readFileSync(path.join(N, 'react/cjs/react-jsx-runtime.development.js'), 'utf8'),
  boundary: readFileSync(EB, 'utf8'),
  strings: readFileSync(STR, 'utf8'),
};

let chromium;
for (const r of [N, (() => { try { return execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(); } catch { return ''; } })()]) {
  if (!r || !existsSync(path.join(r, 'playwright'))) continue;
  ({ chromium } = await import(path.join(r, 'playwright/index.mjs')));
  break;
}
if (!chromium) {
  console.error('biên bắt lỗi: không nạp được playwright — bước này CẦN một trình duyệt và không bỏ qua');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
/* Một lỗi trong trang mà không ai nghe thì bước này báo "mọi ô đều rỗng" và
   không nói vì sao — đúng lớp lỗi "dụng cụ đo im lặng" đã gặp hai lần. */
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
await page.setContent('<div id="root"></div>');

const result = await page.evaluate((mods) => {
  /* ── require nhỏ cho CJS trong trình duyệt ── */
  const cache = {};
  const shims = {};
  const req = (name) => {
    if (name in shims) return shims[name];
    if (cache[name]) return cache[name].exports;
    const src = mods[name];
    if (!src) throw new Error(`không có module ${name}`);
    const m = { exports: {} };
    cache[name] = m;
    new Function('module', 'exports', 'require', 'process', src)(
      m, m.exports, req, { env: { NODE_ENV: 'development' } });
    return m.exports;
  };

  const React = req('react');
  const { createRoot } = req('react-dom/client');

  /* ── đồ giả cho những gì component nhập vào ──
     `react-native` thành phần tử DOM: error boundary là cơ chế của React chứ
     không của renderer, nên đổi host element không đổi thứ đang được kiểm. */
  const el = (tag) => (props) => React.createElement(tag, {
    ...props, style: undefined, accessibilityRole: undefined,
    'data-label': props.accessibilityLabel, onClick: props.onPress,
  }, props.children);
  shims['react-native'] = { View: el('div'), Text: el('span'), Pressable: el('button') };
  shims['@/constants/ascnd'] = {
    spacing: { xs: 4, sm: 8, lg: 16, xl: 24 },
    radius: { md: 12 },
    type: { headline: {}, footnote: {} },
  };
  shims['@/constants/theme'] = {
    alpha: () => 'rgba(0,0,0,0.07)',
    makeStyles: (fn) => (c) => fn(c, { ink: '#000' }),
  };
  const strings = req('strings').nativeStrings;
  shims['@/hooks/use-app-settings'] = { useI18n: () => strings.vi };
  shims['@/hooks/use-palette'] = {
    usePalette: () => ({ background: '#fff', foreground: '#111', mutedForeground: '#777' }),
  };
  const recorded = [];
  shims['@/lib/crash-log'] = {
    recordCrash: (e, fatal, cs) => recorded.push({ msg: String(e && e.message), fatal, cs: String(cs || '') }),
  };

  const { AppErrorBoundary } = req('boundary');

  /* ── kịch bản ── */
  let boom = false;
  const SECRET = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.zzzz';
  const UID = '6f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8';
  function Child() {
    if (boom) throw new Error(`đọc /rest/v1/daily_logs?user_id=eq.${UID} với token ${SECRET}`);
    return React.createElement('span', null, 'MÀN BÌNH THƯỜNG');
  }

  const root = createRoot(document.getElementById('root'));
  const html = () => document.getElementById('root').innerHTML;
  const draw = () => new Promise((r) => {
    root.render(React.createElement(AppErrorBoundary, null, React.createElement(Child)));
    setTimeout(r, 60);
  });
  const clickRetry = () => new Promise((r) => {
    const b = document.querySelector('button');
    if (b) b.click();
    setTimeout(r, 60);
  });

  return (async () => {
    const steps = {};
    /* 1. bình thường */
    await draw();
    steps.normal = html();

    /* 2. con ném */
    boom = true;
    await draw();
    steps.fallback = html();
    steps.recorded = JSON.parse(JSON.stringify(recorded));

    /* 3. hồi phục: con thôi ném, bấm thử lại */
    boom = false;
    await clickRetry();
    steps.recovered = html();

    /*
      4. một sự cố KHÁC, lâu sau lần thử lại gần nhất — phải được mời thử lại.

      Lùi đồng hồ thay vì chờ thật: thứ đang kiểm là một KHOẢNG CÁCH. Và bước
      này phải đứng TRƯỚC phép thử vòng lặp, vì vòng lặp kết thúc ở trạng thái
      "kẹt" — nơi không còn nút nào để bấm, nên không ra khỏi đó được. Đó không
      phải giới hạn của phép thử; đó đúng là điều câu "đóng app rồi mở lại" nói.
    */
    const realNow = Date.now;
    Date.now = () => realNow() + 60000;
    boom = true;
    await draw();
    steps.later = html();

    /*
      5. vòng lặp: ném lại NGAY sau mỗi lần thử lại.

      Từ đây đồng hồ đứng yên ở mốc đã lùi, nên mỗi lần bấm rồi hỏng đều nằm
      trong LOOP_MS.
    */
    await clickRetry();
    steps.loop1 = html();
    await clickRetry();
    steps.loop2 = html();
    Date.now = realNow;

    return { steps, strings: { title: strings.vi.nCrashTitle, hint: strings.vi.nCrashHint, stuck: strings.vi.nCrashStuck, retry: strings.vi.nRetry } };
  })();
}, mods);

await browser.close();

const { steps, strings } = result;
if (!steps.normal && pageErrors.length) {
  console.error('biên bắt lỗi: trang không dựng được gì cả. Lỗi trong trình duyệt:');
  for (const e of pageErrors.slice(0, 4)) console.error(`  ${e.slice(0, 300)}`);
  process.exit(1);
}
const has = (h, s) => h.includes(s);

/* 1. màn bình thường không bị đụng tới */
want(has(steps.normal, 'MÀN BÌNH THƯỜNG'),
  `khi không có lỗi, boundary không dựng con: ${steps.normal.slice(0, 120)}`);
want(!has(steps.normal, strings.title), 'fallback hiện ra khi KHÔNG có lỗi nào');

/* 2. lỗi lúc render bị BẮT, và fallback dựng ra */
want(has(steps.fallback, strings.title),
  `con ném mà fallback không hiện: ${steps.fallback.slice(0, 200)} — nếu chỗ này rỗng thì React đã tháo cả cây, `
  + 'tức đúng màn trắng mà boundary sinh ra để chặn');
want(has(steps.fallback, strings.hint) && has(steps.fallback, strings.retry),
  'fallback thiếu câu giải thích hoặc nút thử lại');
want(!has(steps.fallback, 'MÀN BÌNH THƯỜNG'), 'con vẫn được dựng sau khi nó ném');

/* 3. và nó KHÔNG nói lỗi là gì */
for (const [label, secret] of [
  ['access token', 'eyJhbGciOiJIUzI1NiJ9'],
  ['UUID người dùng', '6f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8'],
  ['đường dẫn bảng sức khoẻ', 'daily_logs'],
  ['chữ "Error"', 'Error'],
]) {
  want(!has(steps.fallback, secret),
    `fallback in ra ${label} — thông điệp của một lỗi thật mang theo thứ nó vừa chạm vào; chỗ đọc nó là `
    + 'nhật ký sự cố, nơi nó đã được lọc');
}

/* 4. lỗi vẫn được GHI — boundary không được đổi khả năng nhìn thấy lấy khả năng hồi phục */
want(steps.recorded.length === 1,
  `componentDidCatch ghi ${steps.recorded.length} mục, mong 1 — ErrorUtils KHÔNG thấy lỗi đã bị boundary bắt, `
  + 'nên nếu chỗ này không ghi thì thêm boundary là làm nhật ký sự cố mù đúng loại lỗi nó sinh ra để bắt');
want(steps.recorded[0] && steps.recorded[0].fatal === false,
  'ghi lỗi với fatal=true — app còn sống và người dùng còn thấy một màn hình, đó là khác biệt đáng ghi');
want(steps.recorded[0] && steps.recorded[0].cs.length > 0,
  'không gửi componentStack — stack của bundle đã minify không nói được MÀN NÀO hỏng, componentStack thì có');

/* 5. hồi phục */
want(has(steps.recovered, 'MÀN BÌNH THƯỜNG'),
  `bấm thử lại mà con không dựng lại: ${steps.recovered.slice(0, 150)} — nút không đặt lại state thì nó là một `
  + 'nút không làm gì, và đó là chỗ hở số 3');

/* 6. một sự cố khác, một phút sau lần thử lại, phải được mời thử lại */
want(has(steps.later, strings.title) && has(steps.later, strings.retry),
  `một sự cố xảy ra một phút sau lần thử lại vẫn bị coi là vòng lặp: ${steps.later.slice(0, 200)} — vòng lặp `
  + 'phải đo bằng THỜI GIAN, không bằng số lần; một bộ đếm trần thì không bao giờ mời thử lại nữa sau đó');

/* 7. nhưng hỏng NGAY sau mỗi lần thử lại thì ngừng mời */
want(has(steps.loop1, strings.title) && has(steps.loop1, strings.retry),
  `sau lần hỏng lặp thứ nhất đã ngừng mời thử lại: ${steps.loop1.slice(0, 200)} — hai lần là ngưỡng, `
  + 'một lần thì quá vội');
want(has(steps.loop2, strings.stuck) && !has(steps.loop2, strings.retry),
  `hỏng lại ngay sau hai lần thử vẫn còn mời thử lại: ${steps.loop2.slice(0, 200)} — một nút thử lại nhấp nháy `
  + 'giữa hai màn hỏng là tệ hơn không có nút');

if (problems.length) {
  console.error('biên bắt lỗi CÓ LỖI:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  'biên bắt lỗi OK — CHẠY THẬT `AppErrorBoundary` trong React 19 + ReactDOM trong một trình duyệt thật, với '
  + 'một component con NÉM lúc render. Không lỗi thì con dựng bình thường và fallback không hiện. Có lỗi thì '
  + 'fallback dựng ra (chỗ này rỗng nghĩa là React đã tháo cả cây — đúng màn trắng mà biên sinh ra để chặn) '
  + 'và nó KHÔNG in token, UUID, tên bảng hay chữ "Error". Lỗi vẫn được ghi kèm componentStack và fatal=false: '
  + 'ErrorUtils không thấy lỗi đã bị boundary bắt, nên không ghi ở đây là đổi khả năng nhìn thấy lấy khả năng '
  + 'hồi phục. Bấm thử lại thì con dựng lại thật. Hỏng NGAY sau hai lần thử thì ngừng mời thử lại và đổi sang '
  + 'câu "đóng app rồi mở lại" — nhưng một sự cố khác một phút sau thì lại được mời, vì vòng lặp đo bằng thời '
  + 'gian chứ không bằng số lần. Và tĩnh: biên bọc đúng `<Gate />`, fallback không mượn GlassCard, '
  + 'MascotFigure, PressScale hay SVG — những chỗ hay hỏng nhất trong app.',
);
