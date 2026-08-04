/**
 * That the status-bar strip is actually in front of the content it covers.
 *
 * ── why this is worth a tool ──
 *
 * `StatusScrim` is `position: absolute` with `zIndex: 10`, and both of those
 * read like they are enough. They are not. React Native stacks siblings in
 * *source order*, and `zIndex` only reorders siblings of the same parent — so a
 * strip written above the page's `<ScrollView>` is painted underneath it and
 * covers nothing whatsoever. The page looks exactly as it did before: content
 * still slides through the clock, no warning, no error, nothing to notice
 * except that the change you just made did not happen.
 *
 * That is the whole class of bug this file exists for. It is also not
 * hypothetical — the same shape already cost this app a wasted pass on
 * `AmbientLight`, which drew nothing until the scroll view stopped painting
 * `colors.background` over the top of it.
 *
 * ── what is checked ──
 *
 * 1. every page whose content reaches y=0 renders the strip at all
 * 2. each strip is a sibling that comes *after* a closed scroll view, with no
 *    scroll view opening between the two — i.e. it is genuinely on top
 * 3. the gradient's id is not a string literal (ids are document-global on
 *    native; this has bitten the app three times)
 * 4. the gradient starts opaque and reaches exactly zero at its own bottom
 *    edge, so the strip has no visible edge of its own
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

const problems = [];

/**
 * Every `<StatusScrim />` in `src` sits after a closed scroll view.
 *
 * Returns the complaints rather than pushing them, so the self-test at the
 * bottom can run the same function over a deliberately broken source and check
 * that it does complain.
 */
function orderProblems(label, src) {
  const bad = [];
  const scrims = [...src.matchAll(/<StatusScrim\s*\/>/g)];
  for (const m of scrims) {
    const before = src.slice(0, m.index);
    const closed = before.lastIndexOf('</ScrollView>');
    if (closed < 0) {
      bad.push(`${label}: <StatusScrim /> đứng trước mọi ScrollView — sẽ bị vẽ đè, không che được gì`);
      continue;
    }
    // a scroll view opening again in between means the strip is inside it
    if (src.slice(closed, m.index).includes('<ScrollView')) {
      bad.push(`${label}: <StatusScrim /> nằm trong ScrollView — nó sẽ cuộn theo nội dung`);
    }
  }
  return { bad, count: scrims.length };
}

// ── 1 + 2: the pages that scroll to the top edge ──
const PAGES = {
  // two of three branches: the tab layout and the floating-header layout.
  // The solid sub-page header already owns the inset, so it needs no strip.
  'src/components/ascnd/screen.tsx': 2,
  // Today builds its own scroll view instead of going through <Screen>
  'src/app/(tabs)/index.tsx': 1,
};
for (const [file, want] of Object.entries(PAGES)) {
  const src = read(file);
  const { bad, count } = orderProblems(file, src);
  problems.push(...bad);
  if (count !== want) problems.push(`${file}: có ${count} <StatusScrim />, đáng lẽ ${want}`);
}

// ── 3 + 4: the strip itself ──
const scrim = read('src/components/ascnd/status-scrim.tsx');

if (/<LinearGradient[^>]*\sid="/.test(scrim)) {
  problems.push('status-scrim: id gradient là chuỗi cứng — id trong SVG là toàn cục, phải dùng useId()');
}

/**
 * The gradient has no edge of its own.
 *
 * Ends are the easy half: opaque at the top, and gone *exactly* at the bottom,
 * because a fade still at 0.2 when it runs out of strip has a hard edge after
 * all — it just moved from the middle to the very bottom row of pixels.
 *
 * The middle is the half that was wrong. Held flat and then released, the ramp
 * has a kink where the slope changes, and the eye finds a kink as easily as it
 * finds a half-way point: that corner *was* the line at the bottom of the
 * strip. So no single span may carry more than half the total fall — flat, and
 * then a cliff, is exactly what that rules out.
 */
function gradientProblems(src) {
  const bad = [];
  const stops = [...src.matchAll(/<Stop\s+offset="([\d.]+)"[^>]*stopOpacity="([\d.]+)"/g)]
    .map((m) => [Number(m[1]), Number(m[2])]);
  if (stops.length < 2) return ['status-scrim: không đọc được các mốc gradient'];

  const [firstOff, firstOp] = stops[0];
  const [lastOff, lastOp] = stops[stops.length - 1];
  if (firstOff !== 0 || firstOp !== 1) bad.push(`status-scrim: mốc đầu (${firstOff}, ${firstOp}) — phải đục hoàn toàn ở đỉnh`);
  if (lastOff !== 1 || lastOp !== 0) bad.push(`status-scrim: mốc cuối (${lastOff}, ${lastOp}) — phải tan hết đúng ở mép dưới, không thì chính nó thành một đường viền`);

  let worst = 0;
  for (let i = 1; i < stops.length; i++) {
    if (stops[i][0] <= stops[i - 1][0]) bad.push(`status-scrim: mốc ${i} không tăng dần`);
    if (stops[i][1] > stops[i - 1][1]) bad.push(`status-scrim: mốc ${i} đậm hơn mốc trước — gradient phải nhạt dần`);
    worst = Math.max(worst, stops[i - 1][1] - stops[i][1]);
  }
  const fall = firstOp - lastOp;
  if (fall > 0 && worst > fall * 0.5) {
    bad.push(
      `status-scrim: một đoạn tụt ${worst.toFixed(2)}/${fall.toFixed(2)} độ đục — ` +
        'dốc gãy như vậy chính là đường viền, phải chia thành nhiều mốc thoải dần',
    );
  }
  return bad;
}
problems.push(...gradientProblems(scrim));

/**
 * The glass has no rim of its own either.
 *
 * `UIGlassEffect` paints a bright specular edge around whatever shape it is
 * applied to — that is what makes it read as a lens rather than as a blur — and
 * `expo-glass-effect` has no prop to switch it off (`GlassView` is a plain
 * `UIVisualEffectView`; its props are style, tint, interactivity, colour scheme
 * and corner radii). The only way is to hang the glass outside a clipping
 * parent on all four sides, so every edge it draws lands outside the strip.
 *
 * `StyleSheet.absoluteFill` is the obvious thing to write there and is the bug:
 * the rim then sits exactly on the strip's own bottom edge.
 */
function rimProblems(src) {
  const bad = [];
  const strip = /strip:\s*\{([^}]*)\}/.exec(src)?.[1] ?? '';
  if (!/overflow:\s*'hidden'/.test(strip)) {
    bad.push("status-scrim: strip không có overflow: 'hidden' — không cắt thì viền kính vẫn hiện");
  }
  const glassStyle = /\sstyle=\{([^}]*)\}\s*\/>/.exec(/<GlassView[\s\S]*?\/>/.exec(src)?.[0] ?? '')?.[1] ?? '';
  if (/absoluteFill/.test(glassStyle)) {
    bad.push('status-scrim: GlassView dùng absoluteFill — viền sáng của kính sẽ nằm đúng mép dưới của dải');
  }
  const glass = /glass:\s*\{([^}]*)\}/.exec(src)?.[1] ?? '';
  for (const side of ['top', 'left', 'right', 'bottom']) {
    if (!new RegExp(`${side}:\\s*-`).test(glass)) {
      bad.push(`status-scrim: kính không tràn ra ngoài cạnh ${side} — viền của nó sẽ lọt vào trong dải`);
    }
  }
  return bad;
}
problems.push(...rimProblems(scrim));

/*
  Self-tests: the three bugs this file was written for, rebuilt.

  Each one is a version that shipped or nearly shipped, and each must be caught.
  A clean run over a source that has already been fixed proves nothing about
  whether the check works — only a run over the broken version does.
*/
const SELF = [
  [
    'đặt trước ScrollView',
    () =>
      orderProblems(
        'tự kiểm',
        read('src/app/(tabs)/index.tsx')
          .replace(/\s*<StatusScrim \/>/, '')
          .replace('<ScrollView', '<StatusScrim />\n      <ScrollView'),
      ).bad,
  ],
  [
    // the first gradient: solid to 0.7, then most of the fall in one span
    'gradient gãy dốc',
    () =>
      gradientProblems(
        scrim.replace(
          /<Stop offset="0"[\s\S]*?<Stop offset="1"[^/]*\/>/,
          '<Stop offset="0" stopOpacity="1" />\n' +
            '<Stop offset="0.7" stopOpacity="1" />\n' +
            '<Stop offset="0.88" stopOpacity="0.55" />\n' +
            '<Stop offset="1" stopOpacity="0" />',
        ),
      ),
  ],
  ['kính phủ kín dải', () => rimProblems(scrim.replace(/glass:\s*\{[^}]*\}/, 'glass: { top: 0, left: 0, right: 0, bottom: 0 }'))],
];
for (const [what, run] of SELF) {
  if (run().length === 0) {
    console.error(`phép tự kiểm hỏng — bản "${what}" đáng lẽ phải bị bắt, đừng tin kết quả`);
    process.exit(1);
  }
}

if (problems.length) {
  console.error('dải trạng thái sai:\n');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const n = Object.values(PAGES).reduce((a, b) => a + b, 0);
console.log(`dải trạng thái OK — ${n} trang che đúng, id động, không mép nào ở đáy (kính lẫn gradient)`);
