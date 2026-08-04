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
 * 4. both ramps — the black wash you see and the white mask that thins the
 *    blur — start full, reach exactly zero at their own bottom edge, and have
 *    no kink anywhere in between
 * 5. the wash is black and stays a wash rather than becoming a slab
 * 6. the blur is a masked fraction of a system material, and fades out inside
 *    the wash rather than outliving it
 * 7. there is no hairline, because a blur that fades has no end to mark
 * 8. the gradient is 80–100pt long on every real inset
 * 9. the header starts 8–12pt below the safe area
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
 * Read a `<Stop>`'s opacity whether it is a literal or a named constant.
 *
 * `stopOpacity="0.05"` and `stopOpacity={GRADIENT_TOP}` are the same thing to
 * the renderer and not to a regex. Pulling the constants out of the file first
 * means a value can be given a name and an explanation — which is the whole
 * house style here — without the check quietly losing sight of it.
 */
function readConsts(src) {
  const table = {};
  for (const m of src.matchAll(/const ([A-Z_]+) = ([\d.]+);/g)) table[m[1]] = Number(m[2]);
  return table;
}
function readStops(block, consts) {
  return [...block.matchAll(/<Stop\s+offset="([\d.]+)"\s+stopColor="([^"]+)"\s+stopOpacity=(?:"([\d.]+)"|\{([A-Z_]+)\})/g)]
    .map((m) => [Number(m[1]), m[2], m[3] !== undefined ? Number(m[3]) : consts[m[4]]]);
}

/**
 * Shared shape rules, applied to both gradients in the file.
 *
 * Two of them now, doing opposite jobs: one is the wash you can see, one is the
 * mask that decides how much of the blur survives at each row. They are drawn
 * the same way and they fail the same way, so the rules are written once.
 *
 * **Full at the top, gone exactly at the bottom.** A fade still at 0.2 when it
 * runs out has a hard edge after all — it just moved from the middle to the
 * last row of pixels. For the mask this is the difference between a blur that
 * fades and a blur that stops.
 *
 * **No kink.** Held flat and then released, a ramp has a corner where the slope
 * changes, and the eye finds a corner as easily as it finds the half-way point
 * of a straight one. That corner *was* the visible line at the bottom of an
 * earlier version of this strip. So no single span may carry more than half the
 * total fall.
 */
function rampProblems(what, stops, { top, tol = 0.5 }) {
  const bad = [];
  if (stops.length < 3) return [`status-scrim: ${what} chỉ có ${stops.length} mốc — quá ít để không thấy chỗ gãy`];

  const [firstOff, , firstOp] = stops[0];
  const [lastOff, , lastOp] = stops[stops.length - 1];
  if (firstOff !== 0) bad.push(`status-scrim: ${what} mốc đầu ở ${firstOff}, phải ở 0`);
  if (firstOp !== top) bad.push(`status-scrim: ${what} đỉnh ${firstOp}, đáng lẽ ${top}`);
  if (lastOff !== 1 || lastOp !== 0) {
    bad.push(`status-scrim: ${what} mốc cuối (${lastOff}, ${lastOp}) — phải tan hết đúng ở mép dưới, không thì chính nó thành một đường viền`);
  }

  let worst = 0;
  for (let i = 1; i < stops.length; i++) {
    if (stops[i][0] <= stops[i - 1][0]) bad.push(`status-scrim: ${what} mốc ${i} không tăng dần`);
    if (stops[i][2] > stops[i - 1][2]) bad.push(`status-scrim: ${what} mốc ${i} đậm hơn mốc trước — phải nhạt dần`);
    worst = Math.max(worst, stops[i - 1][2] - stops[i][2]);
  }
  const fall = firstOp - lastOp;
  if (fall > 0 && worst > fall * tol) {
    bad.push(
      `status-scrim: ${what} có đoạn tụt ${worst.toFixed(3)}/${fall.toFixed(3)} — ` +
        'dốc gãy như vậy chính là một đường viền, phải chia thành nhiều mốc thoải dần',
    );
  }
  return bad;
}

/**
 * The wash is black, and is a wash rather than a slab.
 *
 * Grey and white were both tried and both are visible as themselves — a grey
 * wash reads as a panel laid over the app, a white one as haze on the lens.
 * Black at a low percentage reads as the content being further away, which is
 * the only honest description of what a backdrop does.
 *
 * And it stays low. Past about fifteen percent it stops being something you see
 * through and becomes a rectangle, and a rectangle has corners and an area and
 * a presence.
 */
const WASH_CEILING = 0.15;

function gradientProblems(src) {
  const consts = readConsts(src);
  const blocks = src.split('<LinearGradient').slice(1);
  const wash = blocks.map((b) => readStops(b, consts)).find((st) => st.length && st[0][1].startsWith('#00'));
  const mask = blocks.map((b) => readStops(b, consts)).find((st) => st.length && st[0][1] === '#fff');

  const bad = [];
  if (!wash) return ['status-scrim: không thấy gradient đen — lớp phủ phải là đen, xám thành tấm nền, trắng thành sương'];

  for (const [, color] of wash) {
    if (!/^#000$|^#000000$|^rgba?\(0, *0, *0/.test(color)) {
      bad.push(`status-scrim: lớp phủ dùng màu ${color} — chỉ được dùng đen`);
    }
  }
  const top = wash[0][2];
  if (!(top > 0 && top <= WASH_CEILING)) {
    bad.push(`status-scrim: đỉnh lớp phủ ${top} — trên ${WASH_CEILING} thì nó là một hình chữ nhật chứ không phải một lớp phủ`);
  }
  bad.push(...rampProblems('lớp phủ', wash, { top }));

  /*
    The mask is white on purpose and is not a colour at all — alpha here is how
    much of the blurred result survives at that row. It is checked as a ramp
    like the wash, and against a looser kink tolerance: it starts at full and
    has further to fall, so its steepest span is legitimately larger.
  */
  if (mask) bad.push(...rampProblems('mặt nạ blur', mask, { top: 1, tol: 0.55 }));
  return bad;
}
problems.push(...gradientProblems(scrim));

/**
 * The blur is a fraction of a system material, it fades, and it fades inside
 * the wash.
 *
 * `expo-blur` holds a `UIViewPropertyAnimator` at `fractionComplete`, so
 * `intensity` scales the blur radius *and* the material's own tint together — a
 * low number is a fraction of the effect, not a weak frost. 50 is the library's
 * default and 60–100 is what makes a backdrop announce itself as a BlurView.
 *
 * The number here is no longer uniform, though, so a flat range would be
 * measuring the wrong quantity: the mask takes it down row by row, and what
 * reaches the eye is the *average* over that mask. So both are checked —
 *
 *   - the average must sit inside the range a flat blur would have used, which
 *     is what the design is stated in
 *   - the peak must stay well under it anyway, because the topmost rows get the
 *     full number whatever the mask does further down
 *
 * The tint has to be one of the system materials — what UIKit's own bars are
 * made of. `dark` is `UIBlurEffect.Style.dark`, a heavy grey vibrancy from
 * before iOS 13. Pinned to a `…Dark` variant because the app is dark-only; an
 * adaptive material goes pale the moment the OS hands it a light trait.
 */
const MEAN_LO = 8;
const MEAN_HI = 28;
const PEAK_HI = 40;

/** Area under the mask ramp — the fraction of the blur that survives on average. */
function meanAlpha(stops) {
  let area = 0;
  for (let i = 1; i < stops.length; i++) {
    area += ((stops[i - 1][2] + stops[i][2]) / 2) * (stops[i][0] - stops[i - 1][0]);
  }
  return area;
}

function blurProblems(src) {
  const bad = [];
  const consts = readConsts(src);
  const intensity = consts.INTENSITY;
  if (!(intensity > 0)) return ['status-scrim: không đọc được INTENSITY'];
  if (intensity > PEAK_HI) {
    bad.push(`status-scrim: intensity ${intensity} — trên ${PEAK_HI} thì mấy hàng trên cùng là một lớp sương dù mặt nạ có làm gì bên dưới`);
  }

  const tint = /const TINT = '([^']+)'/.exec(src)?.[1] ?? '';
  if (!/^system\w*MaterialDark$/.test(tint)) {
    bad.push(`status-scrim: tint "${tint}" — phải là một system material bản Dark, các kiểu cũ (dark/default/light) là lớp xám nặng`);
  }

  if (!/<BlurView/.test(src)) {
    bad.push('status-scrim: không thấy <BlurView> — lớp 1 phải là blur thật (UIVisualEffectView)');
    return bad;
  }

  /*
    An unmasked blur ends at a definite row, and that row is an edge. The mask
    is not decoration on top of the blur — it is the only thing that makes the
    blur end without a line, so a `<BlurView>` outside a `<MaskedView>` is the
    bug, not a simplification.
  */
  const masked = /<MaskedView[\s\S]*?<BlurView[\s\S]*?<\/MaskedView>/.test(src);
  if (!masked) {
    bad.push('status-scrim: BlurView không nằm trong MaskedView — blur không tan mà dừng, và chỗ dừng là một đường viền');
    return bad;
  }

  const mask = src.split('<LinearGradient').slice(1)
    .map((b) => readStops(b, consts)).find((st) => st.length && st[0][1] === '#fff');
  if (mask) {
    const mean = intensity * meanAlpha(mask);
    if (!(mean >= MEAN_LO && mean <= MEAN_HI)) {
      bad.push(
        `status-scrim: blur trung bình ${mean.toFixed(1)} (${intensity} × mặt nạ ${meanAlpha(mask).toFixed(2)}) — ` +
          `phải trong ${MEAN_LO}–${MEAN_HI}, tức khoảng của một lớp blur phẳng`,
      );
    }
  }

  /*
    The blur must not outlive the wash. It fades to nothing inside a strip that
    is still being darkened underneath it; ending past the wash would put its
    last rows against bare content, which is the edge all of this exists to
    avoid.
  */
  const drop = /const BLUR_DROP = (\d+)/.exec(src)?.[1];
  const over = /Math\.max\(\d+, top \+ (\d+)\)/.exec(src)?.[1];
  if (drop === undefined || over === undefined) {
    bad.push('status-scrim: không đọc được BLUR_DROP hoặc chiều dài gradient');
  } else if (Number(drop) > Number(over)) {
    bad.push(`status-scrim: blur kéo xuống ${drop}pt dưới inset nhưng lớp phủ chỉ dài thêm ${over}pt — blur sẽ kết thúc ở chỗ không còn gì đỡ`);
  }
  return bad;
}
problems.push(...blurProblems(scrim));

/**
 * There is no hairline, and there must not be one.
 *
 * There used to be: one physical pixel of 5% white, drawn exactly where the
 * blur stopped. It was right for a blur that *ends* — an unmarked end is a
 * smudge the eye keeps trying to focus on, and a stated one settles it, which
 * is what UIKit's own bars do.
 *
 * The blur fades now, so there is no end to mark. The line stopped describing
 * anything and became the only edge in the strip: the one visible thing in a
 * component whose entire standard is that nobody can tell it is here.
 *
 * Written as a check rather than left as a deletion because putting it back is
 * the obvious move for anyone who reads about backdrops — every article on the
 * subject has one — and because it would look fine in a diff.
 */
function hairlineProblems(src) {
  return /hairlineWidth/.test(src)
    ? ['status-scrim: có hairline — blur đã tan dần thì không còn chỗ nào để đánh dấu, đường kẻ đó sẽ là thứ duy nhất nhìn thấy được']
    : [];
}
problems.push(...hairlineProblems(scrim));

/**
 * The gradient is 80–100pt long on every inset a real phone has.
 *
 * Short is the failure. A short gradient is a band with a soft edge, and the
 * eye still finds where it ends; finding where it ends is the one thing that
 * must not happen.
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

  The list is long on purpose. This component has been rewritten four times and
  each rewrite was a correction of the last, so the checks are worth exactly as
  much as their ability to reject the versions in between.
*/
const sub = (a, b) => {
  const next = scrim.replace(a, b);
  if (next === scrim) {
    console.error(`phép tự kiểm hỏng — không dựng được bản hỏng cho ${a}, đừng tin kết quả`);
    process.exit(1);
  }
  return next;
};

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
  // the grey rectangle — smooth, well-formed, and visible as an overlay
  ['lớp phủ xám', () => gradientProblems(sub(/#000/g, '#3a3a3c'))],
  // dark enough to stop being something you see through
  ['lớp phủ quá đục', () => gradientProblems(sub('const GRADIENT_TOP = 0.12', 'const GRADIENT_TOP = 0.3'))],
  // a wash that never reaches zero: the edge moves to the last row of pixels
  [
    'lớp phủ chưa tan đã hết',
    () => gradientProblems(sub('offset="1" stopColor="#000" stopOpacity="0"', 'offset="1" stopColor="#000" stopOpacity="0.04"')),
  ],
  // version two: held flat, then most of the fall in one span
  [
    'lớp phủ gãy dốc',
    () =>
      gradientProblems(
        sub('<Stop offset="0.42" stopColor="#000" stopOpacity="0.07" />', '<Stop offset="0.42" stopColor="#000" stopOpacity="0.118" />')
          .replace('<Stop offset="0.7" stopColor="#000" stopOpacity="0.05" />', '<Stop offset="0.7" stopColor="#000" stopOpacity="0.115" />'),
      ),
  ],
  // a mask that stops instead of fading — the blur then ends on a line again
  [
    'mặt nạ dừng đột ngột',
    () => gradientProblems(sub('offset="1" stopColor="#fff" stopOpacity="0"', 'offset="1" stopColor="#fff" stopOpacity="0.5"')),
  ],
  ['blur mặc định', () => blurProblems(sub('const INTENSITY = 30', 'const INTENSITY = 50'))],
  ['tint kiểu cũ', () => blurProblems(sub(/const TINT = '[^']+'/, "const TINT = 'dark'"))],
  // the "simplification" that puts the hard edge straight back
  ['blur không có mặt nạ', () => blurProblems(sub(/MaskedView/g, 'View'))],
  // blur reaching past the wash, so its last rows land on bare content
  ['blur dài hơn lớp phủ', () => blurProblems(sub('const BLUR_DROP = 22', 'const BLUR_DROP = 60'))],
  // the line coming back to a blur that no longer has an end to mark
  [
    'hairline quay lại',
    () => hairlineProblems(sub('  blur: {', '  hairline: { height: StyleSheet.hairlineWidth },\n  blur: {')),
  ],
  ['gradient ngắn', () => lengthProblems(sub(/Math\.max\(\d+, top \+ \d+\)/, 'Math.max(40, top + 4)'))],
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
const consts = readConsts(scrim);
const maskStops = scrim.split('<LinearGradient').slice(1)
  .map((b) => readStops(b, consts)).find((st) => st.length && st[0][1] === '#fff');
const mean = maskStops ? consts.INTENSITY * meanAlpha(maskStops) : consts.INTENSITY;
console.log(
  `dải trạng thái OK — ${n} trang, blur ${consts.INTENSITY} × mặt nạ ${meanAlpha(maskStops).toFixed(2)} ` +
    `= ${mean.toFixed(1)} trung bình, lớp phủ đen ${consts.GRADIENT_TOP} dài ` +
    `${INSETS.map((t) => Math.max(88, t + 34)).at(-1)}pt, không hairline, ${SELF.length} bản hỏng đều bị bắt`,
);
