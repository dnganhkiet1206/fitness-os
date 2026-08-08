/**
 * The rules that make motion feel smooth, kept true as the app grows.
 *
 * ── what this is, and what it deliberately is not ──
 *
 * Not a token table. The numbers in this app are mostly *compositions* rather
 * than instances of a scale: the aura's pools drift at 17s / 23s / 29s because
 * co-prime periods stop four lights resynchronising into a visible loop, and
 * 300 / 370 / 420 is one cascade — tab bar, then cards, then light — not three
 * samples of "slow". Flattening those into `duration.slow` would not make
 * anything smoother; it would delete the reasoning and leave a lie behind.
 *
 * What actually separates an app that feels like Apple's from one that does not
 * is much smaller and much more mechanical:
 *
 *   1. animation touches the compositor, never the layout engine
 *   2. nothing animates while nobody is looking at it
 *   3. the system's Reduce Motion setting is honoured even where the animation
 *      library does not do it for you
 *
 * Those are the three this enforces. They are worth a tool because all three
 * fail *invisibly*: the screen looks exactly as designed and the battery goes,
 * or the frame budget goes, and there is nothing in the diff to review.
 *
 * ── the history behind rule 2 ──
 *
 * The assistant's aura ran four light pools and four dust layers on a bare
 * `withRepeat(…, -1)` started at mount, with nothing to stop them. They kept
 * compositing full-screen translucent layers for the rest of the app's life —
 * on other tabs, underneath pushed screens. It went months without being
 * noticed and was found by a person holding a warm phone. `aura-cost.mjs`
 * guards that one screen in detail; this generalises the property to every
 * looping component in the app.
 */
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const files = globSync('src/**/*.{ts,tsx}', { cwd: NATIVE }).sort();
const problems = [];

/**
 * Style properties that force a layout pass when they change.
 *
 * `position` is in here because switching absolute/relative re-flows the
 * parent; the transform-ish properties are not, because they are handled by
 * the compositor after layout is settled.
 */
const LAYOUT_PROPS = new Set([
  'width', 'height', 'top', 'left', 'right', 'bottom', 'position', 'flex',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'padding', 'paddingTop',
  'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingHorizontal',
  'paddingVertical', 'gap', 'rowGap', 'columnGap', 'fontSize', 'lineHeight',
  'borderWidth', 'aspectRatio',
]);

/**
 * Reads the balanced body of an expression starting at `i`.
 *
 * Needed because the first version of this scan grabbed a fixed 900-character
 * window after `useAnimatedStyle(() =>`, which ran off the end of the callback
 * and into whatever followed. It reported `onPress` and `onSuccess` as animated
 * style properties, which is how I know a character window is not good enough
 * to answer a question about scope.
 */
function balanced(src, i) {
  const n = src.length;
  while (i < n && src[i] !== '(' && src[i] !== '{') i++;
  if (i >= n) return '';
  const start = i;
  let depth = 0;
  while (i < n) {
    const c = src[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
    i++;
  }
  return src.slice(start);
}

/** Every `useAnimatedStyle` body in a file, already balanced. */
function animatedStyleBodies(code) {
  const out = [];
  for (const m of code.matchAll(/useAnimatedStyle\(\s*\(\)\s*=>/g)) {
    out.push({ body: balanced(code, m.index + m[0].length), at: code.slice(0, m.index).split('\n').length });
  }
  return out;
}

/**
 * ── rule 1: animation is composited, not laid out ──
 *
 * A bounded layout animation is a real technique and this does not ban it —
 * `today-meals` animates a height precisely *because* it wants the sibling card
 * pushed down every frame, which `LinearTransition` was measured failing to do
 * (it left a 94px hole that slowly closed). Banning the property outright would
 * push somebody to "fix" a case that was already reasoned through.
 *
 * What is banned is animating a layout property **continuously** — from an
 * endless `withRepeat` or a frame callback. That is a layout pass every frame
 * for as long as the screen is open, and there is no version of it that is
 * correct.
 *
 * Bounded ones are allowed but have to be listed here with a reason, so adding
 * the next one is a decision somebody makes on purpose rather than a line that
 * slips in.
 */
const BOUNDED_LAYOUT = {
  'src/components/ascnd/today-meals.tsx':
    'mở thẻ bằng height thật để thẻ bên dưới bị đẩy xuống theo từng frame — ' +
    'LinearTransition đã đo và không làm được (để lại khoảng hở 94px)',
  'src/components/ascnd/chart-bar.tsx':
    'cột biểu đồ phải chạy mượt giữa hai giá trị khi đổi ô chỉ số; scaleY sẽ nhảy, ' +
    'còn translateY thì bị cắt mất đáy bo tròn vì metric-panel không clip còn steps thì có',
};

for (const f of files) {
  const code = strip(read(f));
  const loops = /withRepeat\([\s\S]{0,200}?-1/.test(code);
  const frameClock = /useFrameCallback/.test(code);

  for (const { body, at } of animatedStyleBodies(code)) {
    const props = new Set();
    for (const pm of body.matchAll(/(?:^|[{,])\s*([A-Za-z][A-Za-z0-9]*)\s*:/g)) {
      if (LAYOUT_PROPS.has(pm[1])) props.add(pm[1]);
    }
    if (!props.size) continue;
    const list = [...props].join(', ');

    if (loops || frameClock) {
      problems.push(
        `${f}:${at}: animate thuộc tính layout (${list}) trong file có vòng lặp vô hạn/frame clock — ` +
          'mỗi frame là một lần chạy lại layout, suốt thời gian màn hình mở',
      );
    } else if (!BOUNDED_LAYOUT[f]) {
      problems.push(
        `${f}:${at}: animate thuộc tính layout (${list}) mà chưa có lý do ghi lại — ` +
          'nếu chỉ là "cho hiện ra" thì dùng transform/opacity; nếu thật sự cần layout thì ghi lý do vào BOUNDED_LAYOUT',
      );
    }
  }
}

/* A reason left behind for code that no longer does the thing is worse than no
   reason: the next person reads it as still true. */
for (const f of Object.keys(BOUNDED_LAYOUT)) {
  const bodies = animatedStyleBodies(strip(read(f)));
  const still = bodies.some(({ body }) =>
    [...body.matchAll(/(?:^|[{,])\s*([A-Za-z][A-Za-z0-9]*)\s*:/g)].some((m) => LAYOUT_PROPS.has(m[1])),
  );
  if (!still) {
    problems.push(`BOUNDED_LAYOUT còn ghi ${f} nhưng file đó không còn animate layout — xoá dòng ngoại lệ đi`);
  }
}

/**
 * ── rule 2: nothing loops while nobody is looking ──
 *
 * ── why this is scoped to the effect and not the file ──
 *
 * The first version asked whether the *file* mentioned a gate anywhere:
 * `useIsFocused`, `cancelAnimation`, a `moving` flag. It reported the aura
 * clean after I had deleted the `cancelAnimation` call, because the unused
 * `cancelAnimation` **import** was still at the top and satisfied the search.
 * A rule that a stale import can pass is not checking anything.
 *
 * So the guard is looked for where it has to be: inside the same `useEffect`
 * that starts the loop, as a conditional early return or a cancel. Every
 * looping component in the app is already written that way —
 *
 *     useEffect(() => {
 *       if (!focused) return;        // or: if (…) { cancelAnimation(v); return; }
 *       v.value = withRepeat(…, -1);
 *     }, [focused]);
 *
 * — so the rule describes the codebase rather than imposing a new shape on it.
 */
const GUARD = /if\s*\([^)]*\)\s*(?:\{[\s\S]{0,200}?)?(?:return|cancelAnimation\()/;
for (const f of files) {
  const code = strip(read(f));
  const loops = [...code.matchAll(/withRepeat\([\s\S]{0,200}?-1/g)];
  if (!loops.length) continue;

  /* Every `useEffect` body in the file, with the span it covers. */
  const effects = [];
  for (const m of code.matchAll(/useEffect\(\s*\(\)\s*=>/g)) {
    const body = balanced(code, m.index + m[0].length);
    effects.push({ start: m.index, end: m.index + m[0].length + body.length, body });
  }

  for (const loop of loops) {
    const line = code.slice(0, loop.index).split('\n').length;
    const host = effects.find((e) => loop.index >= e.start && loop.index <= e.end);
    if (!host) {
      problems.push(
        `${f}:${line}: withRepeat(…, -1) không nằm trong useEffect nào — ` +
          'không có chỗ nào để dừng nó lại khi màn hình bị che',
      );
    } else if (!GUARD.test(host.body)) {
      problems.push(
        `${f}:${line}: withRepeat(…, -1) chạy vô điều kiện — ` +
          'useEffect bọc nó không có `if (…) return` hay cancelAnimation, nên vòng lặp sống suốt đời app ' +
          '(đúng lỗi đã làm máy nóng ở assistant-aura)',
      );
    }
  }
}

/**
 * ── rule 3: Reduce Motion reaches the raw frame clocks ──
 *
 * Reanimated's `withTiming` / `withSpring` / `withRepeat` already default to
 * `ReduceMotion.System`, so most of the app honours the setting without being
 * told to. `useFrameCallback` is the hole: it is a bare per-frame callback on
 * the UI thread and consults nothing. It is also where this app puts its most
 * persistent motion — the mascot breathing, the studio loop — so the hole is
 * exactly where it matters.
 */
for (const f of files) {
  const code = strip(read(f));
  if (!/useFrameCallback/.test(code)) continue;
  if (f.endsWith('use-reduced-motion.ts')) continue;
  if (!/reduceMotionSV/.test(code)) {
    problems.push(
      `${f}: dùng useFrameCallback nhưng không đọc reduceMotionSV — ` +
        'Reanimated không tự áp Reduce Motion cho frame callback, chỗ này phải tự kiểm tra',
    );
  }
}

/**
 * The self-test.
 *
 * Each rule is fed the exact shape it exists to reject. The scope test is here
 * because the first version of this scan did fail that way: a fixed-width
 * character window after `useAnimatedStyle(() =>` ran past the end of the
 * callback and reported handlers from the surrounding code as animated
 * properties.
 */
const SELF = [
  ['phạm vi không tràn ra ngoài callback', () => {
    const src = 'const s = useAnimatedStyle(() => ({ opacity: o.value }));\nconst x = { height: 10, onPress: f };';
    const [{ body }] = animatedStyleBodies(src);
    return !body.includes('onPress') && !body.includes('height');
  }],
  ['bắt được layout trong callback', () => {
    const src = 'const s = useAnimatedStyle(() => ({ width: `${p.value}%` }));';
    const [{ body }] = animatedStyleBodies(src);
    return [...body.matchAll(/(?:^|[{,])\s*([A-Za-z][A-Za-z0-9]*)\s*:/g)].some((m) => LAYOUT_PROPS.has(m[1]));
  }],
  ['transform không bị coi là layout', () => {
    const src = 'const s = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], opacity: 1 }));';
    const [{ body }] = animatedStyleBodies(src);
    return ![...body.matchAll(/(?:^|[{,])\s*([A-Za-z][A-Za-z0-9]*)\s*:/g)].some((m) => LAYOUT_PROPS.has(m[1]));
  }],
  ['vòng lặp vô điều kiện bị bắt', () => {
    const src = 'useEffect(() => {\n  t.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);\n}, []);';
    const [m] = [...src.matchAll(/useEffect\(\s*\(\)\s*=>/g)];
    return !GUARD.test(balanced(src, m.index + m[0].length));
  }],
  ['vòng lặp có `if (…) return` thì không bị bắt', () => {
    const src = 'useEffect(() => {\n  if (!focused) return;\n  t.value = withRepeat(withTiming(1), -1, true);\n}, [focused]);';
    const [m] = [...src.matchAll(/useEffect\(\s*\(\)\s*=>/g)];
    return GUARD.test(balanced(src, m.index + m[0].length));
  }],
  ['vòng lặp có cancelAnimation trong nhánh if thì không bị bắt', () => {
    const src = 'useEffect(() => {\n  if (!moving) { cancelAnimation(t); return; }\n  t.value = withRepeat(withTiming(1), -1, true);\n}, [moving]);';
    const [m] = [...src.matchAll(/useEffect\(\s*\(\)\s*=>/g)];
    return GUARD.test(balanced(src, m.index + m[0].length));
  }],
  /*
    The exact miss that got past the first version: the guard is gone from the
    body but `cancelAnimation` is still imported at the top of the file. A
    file-wide search says "gated"; a body-scoped one says what is true.
  */
  ['import thừa không qua mặt được luật', () => {
    const src =
      "import { cancelAnimation, withRepeat } from 'react-native-reanimated';\n" +
      'useEffect(() => {\n  t.value = withRepeat(withTiming(1), -1, true);\n}, []);';
    const [m] = [...src.matchAll(/useEffect\(\s*\(\)\s*=>/g)];
    return !GUARD.test(balanced(src, m.index + m[0].length));
  }],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — không bắt được: ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('luật chuyển động sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

const loopFiles = files.filter((f) => /withRepeat\([\s\S]{0,200}?-1/.test(strip(read(f)))).length;
const clockFiles = files.filter((f) => /useFrameCallback/.test(strip(read(f)))).length;
console.log(
  `luật chuyển động OK — ${files.length} tệp: mọi useAnimatedStyle chỉ chạm transform/opacity ` +
    `(${Object.keys(BOUNDED_LAYOUT).length} ngoại lệ có lý do ghi lại, không cái nào lặp vô hạn); ` +
    `${loopFiles} tệp có vòng lặp vô hạn, mọi vòng đều nằm trong useEffect có điều kiện dừng; ` +
    `${clockFiles} tệp dùng frame clock và đều đọc Reduce Motion`,
);
