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

const stops = [...scrim.matchAll(/<Stop\s+offset="([\d.]+)"[^>]*stopOpacity="([\d.]+)"/g)]
  .map((m) => [Number(m[1]), Number(m[2])]);
if (stops.length < 2) {
  problems.push('status-scrim: không đọc được các mốc gradient');
} else {
  const [firstOff, firstOp] = stops[0];
  const [lastOff, lastOp] = stops[stops.length - 1];
  if (firstOff !== 0 || firstOp !== 1) problems.push(`status-scrim: mốc đầu (${firstOff}, ${firstOp}) — phải đục hoàn toàn ở đỉnh`);
  if (lastOff !== 1 || lastOp !== 0) problems.push(`status-scrim: mốc cuối (${lastOff}, ${lastOp}) — phải tan hết đúng ở mép dưới, không thì chính nó thành một đường viền`);
  for (let i = 1; i < stops.length; i++) {
    if (stops[i][0] <= stops[i - 1][0]) problems.push(`status-scrim: mốc ${i} không tăng dần`);
    if (stops[i][1] > stops[i - 1][1]) problems.push(`status-scrim: mốc ${i} đậm hơn mốc trước — gradient phải nhạt dần`);
  }
}

/*
  Self-test: the bug this file was written for, rebuilt.

  Move the strip above the scroll view — the exact mistake that leaves it
  painted underneath — and the order check must catch it. If a broken source
  passes, the clean run above proves nothing.
*/
const broken = read('src/app/(tabs)/index.tsx')
  .replace(/\s*<StatusScrim \/>/, '')
  .replace('<ScrollView', '<StatusScrim />\n      <ScrollView');
if (orderProblems('tự kiểm', broken).bad.length === 0) {
  console.error('phép tự kiểm hỏng — bản đặt sai chỗ đáng lẽ phải bị bắt, đừng tin kết quả');
  process.exit(1);
}

if (problems.length) {
  console.error('dải trạng thái sai:\n');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const n = Object.values(PAGES).reduce((a, b) => a + b, 0);
console.log(`dải trạng thái OK — ${n} trang che đúng, id động, gradient tan hết ở mép`);
