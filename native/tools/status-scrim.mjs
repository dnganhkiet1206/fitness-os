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
 * ── and why the numbers are checked too ──
 *
 * The backdrop's whole standard is that you cannot see it. That makes every
 * knob on it a one-way ratchet under maintenance: turning any of them *up*
 * makes the effect more obvious, which always looks like progress in a diff and
 * is always the failure. `intensity: 50` is `expo-blur`'s own default and is
 * more than twice what belongs here; a grey gradient reads as a panel; a
 * hairline you can see is a border. None of those is a bug you would notice by
 * reading the change — they are bugs you notice by looking at the phone, and
 * only if you know what it is meant to look like.
 *
 * So the limits live here, with the reason next to each one.
 *
 * ── what is checked ──
 *
 * 1. every page whose content reaches y=0 renders the strip at all
 * 2. each strip is a sibling that comes *after* a closed scroll view, with no
 *    scroll view opening between the two — i.e. it is genuinely on top
 * 3. the gradient's id is not a string literal (ids are document-global on
 *    native; this has bitten the app three times)
 * 4. the gradient is black, never a slab, reaches exactly zero at its own
 *    bottom edge, and has no kink in it
 * 5. the blur is a partial one in a system material, and covers the status bar
 *    rather than the whole strip
 * 6. the hairline is at the threshold of visibility, not over it
 * 7. the gradient is 80–100pt long on every real inset
 * 8. the header starts 8–12pt below the safe area
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
 * The gradient is black, is never a slab, and has no edge of its own.
 *
 * Three separate ways this goes wrong, all of which look like an improvement
 * while you are making them.
 *
 * **Colour.** Grey and white are both visible as themselves — a grey wash reads
 * as a panel laid over the app, a white one as haze on the lens. Black at a low
 * percentage reads as the content being further away, which is the only honest
 * description of what a backdrop does. So: black, and nothing else.
 *
 * **Depth.** The top stop is a wash, not a cover. Past about fifteen percent it
 * stops being something you see through and becomes a rectangle, and a
 * rectangle has corners and an area and a presence. Twelve is the design.
 *
 * **Ends and middles.** Gone *exactly* at the bottom, because a fade still at
 * 0.2 when it runs out of strip has a hard edge after all — it just moved from
 * the middle to the last row of pixels. And no single span may carry more than
 * half the total fall: held flat and then released, a ramp has a kink where the
 * slope changes, and the eye finds a kink as easily as it finds the half-way
 * point of a straight one. That kink *was* the line at the bottom of the strip.
 */
function gradientProblems(src) {
  const bad = [];
  const stops = [...src.matchAll(/<Stop\s+offset="([\d.]+)"\s+stopColor="([^"]+)"\s+stopOpacity="([\d.]+)"/g)]
    .map((m) => [Number(m[1]), m[2], Number(m[3])]);
  if (stops.length < 2) return ['status-scrim: không đọc được các mốc gradient'];

  for (const [, color] of stops) {
    if (!/^#000$|^#000000$|^rgba?\(0, *0, *0/.test(color)) {
      bad.push(`status-scrim: gradient dùng màu ${color} — chỉ được dùng đen, xám thành tấm nền, trắng thành sương`);
    }
  }

  const [firstOff, , firstOp] = stops[0];
  const [lastOff, , lastOp] = stops[stops.length - 1];
  if (firstOff !== 0) bad.push(`status-scrim: mốc đầu ở ${firstOff}, phải ở 0`);
  if (firstOp > 0.15) {
    bad.push(`status-scrim: đỉnh gradient ${firstOp} — quá đục, từ đây trở lên nó là một hình chữ nhật chứ không phải một lớp phủ`);
  }
  if (firstOp <= 0) bad.push('status-scrim: đỉnh gradient bằng 0 — không có gì cả');
  if (lastOff !== 1 || lastOp !== 0) {
    bad.push(`status-scrim: mốc cuối (${lastOff}, ${lastOp}) — phải tan hết đúng ở mép dưới, không thì chính nó thành một đường viền`);
  }

  let worst = 0;
  for (let i = 1; i < stops.length; i++) {
    if (stops[i][0] <= stops[i - 1][0]) bad.push(`status-scrim: mốc ${i} không tăng dần`);
    if (stops[i][2] > stops[i - 1][2]) bad.push(`status-scrim: mốc ${i} đậm hơn mốc trước — gradient phải nhạt dần`);
    worst = Math.max(worst, stops[i - 1][2] - stops[i][2]);
  }
  const fall = firstOp - lastOp;
  if (fall > 0 && worst > fall * 0.5) {
    bad.push(
      `status-scrim: một đoạn tụt ${worst.toFixed(3)}/${fall.toFixed(3)} độ đục — ` +
        'dốc gãy như vậy chính là đường viền, phải chia thành nhiều mốc thoải dần',
    );
  }
  return bad;
}
problems.push(...gradientProblems(scrim));

/**
 * The blur is a fraction of a system material, over the status bar only.
 *
 * `expo-blur` holds a `UIViewPropertyAnimator` at `fractionComplete`, so
 * `intensity` scales the blur radius *and* the material's own tint together —
 * a low number is a fraction of the effect, not a weak frost. The whole range
 * that reads as native is narrow, and it is nowhere near the middle: 50 is the
 * library's default and is more than twice what belongs here; 60–100 is what
 * makes a backdrop announce itself as a BlurView.
 *
 * The tint has to be one of the system materials — what UIKit's own bars are
 * made of. `dark` is `UIBlurEffect.Style.dark`, a heavy grey vibrancy from
 * before iOS 13, and `default`/`light`/`regular`/`prominent` are its siblings.
 * Pinned to a `…Dark` variant because the app is dark-only; an adaptive
 * material goes pale the moment the OS hands it a light trait.
 *
 * And the blur is bounded by `insets.top`. Given the whole strip it would
 * soften the large title where it sits at rest — which is not content passing
 * behind anything, it is just the page, and the page is meant to be sharp.
 */
const BLUR_LO = 18;
const BLUR_HI = 28;

function blurProblems(src) {
  const bad = [];
  const intensity = Number(/const INTENSITY = ([\d.]+)/.exec(src)?.[1] ?? NaN);
  if (!(intensity >= BLUR_LO && intensity <= BLUR_HI)) {
    bad.push(`status-scrim: intensity ${intensity} — phải trong khoảng ${BLUR_LO}–${BLUR_HI}, 50 là mặc định của thư viện và đục gấp đôi mức cần`);
  }
  const tint = /const TINT = '([^']+)'/.exec(src)?.[1] ?? '';
  if (!/^system\w*MaterialDark$/.test(tint)) {
    bad.push(`status-scrim: tint "${tint}" — phải là một system material bản Dark, các kiểu cũ (dark/default/light) là lớp xám nặng`);
  }
  const tag = /<BlurView[\s\S]*?\/>/.exec(src)?.[0] ?? '';
  if (!tag) {
    bad.push('status-scrim: không thấy <BlurView> — lớp 1 phải là blur thật (UIVisualEffectView)');
  } else if (!/height:\s*insets\.top/.test(tag)) {
    bad.push('status-scrim: blur không bị giới hạn ở insets.top — nó sẽ làm mờ cả tiêu đề lớn đang đứng yên');
  }
  return bad;
}
problems.push(...blurProblems(scrim));

/**
 * The hairline is at the threshold of being seen, not over it.
 *
 * Its job is to state where the blur stops. An unmarked end is a smudge — a
 * soft boundary the eye keeps trying to focus on — and a *visible* line is a
 * border, which puts the page back in a frame. Five percent white on this
 * background is the gap between those two, and it is narrow: at ten percent it
 * is a line you can point at.
 *
 * One physical pixel, so it stays a hairline at 3× rather than becoming three.
 */
function hairlineProblems(src) {
  const bad = [];
  const rule = /hairline:\s*\{([\s\S]*?)\n  \},/.exec(src)?.[1] ?? '';
  if (!rule) return ['status-scrim: không thấy hairline'];
  const alpha = Number(/rgba\(255, *255, *255, *([\d.]+)\)/.exec(rule)?.[1] ?? NaN);
  if (!(alpha > 0 && alpha <= 0.06)) {
    bad.push(`status-scrim: hairline ở ${alpha} — trên 0.06 là một đường kẻ nhìn thấy được, tức là một cái viền`);
  }
  if (!/height:\s*StyleSheet\.hairlineWidth/.test(rule)) {
    bad.push('status-scrim: hairline không dùng StyleSheet.hairlineWidth — 1 điểm sẽ thành 3 pixel trên màn 3×');
  }
  return bad;
}
problems.push(...hairlineProblems(scrim));

/**
 * The gradient is 80–100pt long on every inset a real phone has.
 *
 * Short is the failure. A short gradient is a band with a soft edge, and the
 * eye still finds where it ends; finding where it ends is the one thing that
 * must not happen. Long enough, a twelve percent fall has nowhere to
 * concentrate and no row of pixels in it differs from its neighbour enough to
 * see.
 *
 * The insets below are real: 20 is a pre-notch iPhone and a typical Android
 * status bar, 44 the iPhone X through 13, 47–48 the 14, 54 the 12 mini, 59 the
 * Dynamic Island phones, 62 the 16 Pro.
 */
const INSETS = [20, 24, 44, 47, 48, 54, 59, 62];
function lengthProblems(src) {
  const bad = [];
  const m = /Math\.max\((\d+), top \+ (\d+)\)/.exec(src);
  if (!m) return ['status-scrim: không đọc được chiều dài gradient'];
  const [floor, add] = [Number(m[1]), Number(m[2])];
  for (const top of INSETS) {
    const h = Math.max(floor, top + add);
    if (h < 80 || h > 100) bad.push(`status-scrim: inset ${top} → dải dài ${h}pt, phải trong 80–100`);
  }
  return bad;
}
problems.push(...lengthProblems(scrim));

/*
  The header starts 8–12pt below the safe area.

  Not this component's doing, but the same requirement: a title flush against
  the inset sits under the Dynamic Island's shadow and reads as cramped. The two
  pages that lay out their own top padding are the two that can drift.
*/
const SPACING_SM = 8; // src/constants/ascnd.ts
const GAPS = {
  'src/components/ascnd/screen.tsx': [/paddingTop: insets\.top \+ spacing\.sm/, SPACING_SM],
  'src/app/(tabs)/index.tsx': [/paddingTop: insets\.top \+ (\d+)/, null],
};
for (const [file, [re, fixed]] of Object.entries(GAPS)) {
  const m = re.exec(read(file));
  const gap = fixed ?? Number(m?.[1]);
  if (!m || !(gap >= 8 && gap <= 12)) {
    problems.push(`${file}: header cách safe area ${m ? gap : '?'}pt — phải 8–12pt`);
  }
}

/*
  Self-tests: every version this backdrop has already been, rebuilt.

  Each entry below is a real previous state of the file, or the obvious wrong
  turn from where it stands now, and every one must be caught. A clean run over
  a source that has already been fixed proves nothing about whether the check
  works — only a run over a broken one does.

  The list is long on purpose. This component has been rewritten three times and
  each rewrite was a correction of the last, so the checks are worth exactly as
  much as their ability to reject the versions in between.
*/
const STOPS = /<Stop offset="0"[\s\S]*?<Stop offset="1"[^/]*\/>/;
const restop = (...rows) =>
  scrim.replace(STOPS, rows.map(([o, c, a]) => `<Stop offset="${o}" stopColor="${c}" stopOpacity="${a}" />`).join('\n'));

const SELF = [
  [
    // the strip painted underneath the thing it is meant to sit in front of
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
    // version two: opaque, held flat to 0.7, then most of the fall in one span
    'gradient gãy dốc',
    () => gradientProblems(restop([0, '#000', 1], [0.7, '#000', 1], [0.88, '#000', 0.55], [1, '#000', 0])),
  ],
  [
    // the grey rectangle — smooth, well-formed, and visible as an overlay
    'gradient xám',
    () => gradientProblems(restop([0, '#3a3a3c', 0.12], [0.42, '#3a3a3c', 0.09], [0.7, '#3a3a3c', 0.05], [1, '#3a3a3c', 0])),
  ],
  [
    // a fade that never reaches zero: the edge moves to the last row of pixels
    'gradient chưa tan đã hết',
    () => gradientProblems(restop([0, '#000', 0.12], [0.42, '#000', 0.09], [0.7, '#000', 0.06], [1, '#000', 0.04])),
  ],
  ['blur mặc định', () => blurProblems(scrim.replace(/const INTENSITY = [\d.]+/, 'const INTENSITY = 50'))],
  ['tint kiểu cũ', () => blurProblems(scrim.replace(/const TINT = '[^']+'/, "const TINT = 'dark'"))],
  [
    // blur over the whole strip, softening the large title where it sits still
    'blur phủ kín dải',
    () => blurProblems(scrim.replace(/style=\{\[styles\.blur[^\]]*\]\}/, 'style={StyleSheet.absoluteFill}')),
  ],
  ['hairline nhìn thấy được', () => hairlineProblems(scrim.replace('rgba(255,255,255,0.05)', 'rgba(255,255,255,0.14)'))],
  ['gradient ngắn', () => lengthProblems(scrim.replace(/Math\.max\(\d+, top \+ \d+\)/, 'Math.max(40, top + 4)'))],
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
console.log(
  `dải trạng thái OK — ${n} trang, blur ${/const INTENSITY = ([\d.]+)/.exec(scrim)[1]}/100 ` +
    `bó trong status bar, gradient đen 0.12 dài ${INSETS.map((t) => Math.max(88, t + 34)).at(-1)}pt, ` +
    `hairline 0.05, ${SELF.length} bản hỏng đều bị bắt`,
);
