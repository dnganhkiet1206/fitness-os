/**
 * That a worklet reading a measurement is not mounted before the measurement.
 *
 * ── the bug this was written for ──
 *
 * Every macro bar on the nutrition card sat **full** on a day with nothing
 * logged. The arithmetic was right and reading it a dozen times proved nothing,
 * because the fault is not in the expression — it is in *when* the expression is
 * first evaluated.
 *
 * `useAnimatedStyle` computes its `initial` style once, on the hook's first
 * render, and keeps it in a `useRef`:
 *
 *     if (!animatedUpdaterData.current) {
 *       const initialStyle = initialUpdaterRun(updater);   // ← once, ever
 *
 * (`react-native-reanimated/lib/module/hook/useAnimatedStyle.js`). That frozen
 * value is re-applied as the view's base style on every later re-render, and the
 * only thing that overwrites it is the mapper — which `startMapper(fun, inputs)`
 * drives from the **shared values** in the closure. A plain React state variable
 * in that closure is not a shared value and drives nothing.
 *
 * `ProgressBar` measured its own track into `useState(0)` and read that state
 * inside the worklet, in the same component. First render: `track === 0`, so
 * `translateX: -0 * (1 - 0/100)` froze at `0` — a fill sitting over the whole
 * track. At any non-zero percentage the animated value really travels, so the
 * mapper runs and puts the bar right on its first frame; at **0%** it animates
 * from 0 to 0, never moves, and nothing ever corrects the frozen style. The bar
 * was full precisely on the days it should have been empty.
 *
 * ── the rule ──
 *
 * In one component: a `useState` that is written from an `onLayout` handler and
 * read inside a `useAnimatedStyle` worklet. That is the shape, and it is a bug
 * every time the resting value depends on the measurement — which is what a
 * measurement is usually for.
 *
 * The fix is always the same and is structural: put the worklet in a child that
 * is not mounted until the measurement exists, and pass the number in as a prop.
 * Then the frozen first evaluation is the correct one.
 *
 * ── what this does NOT complain about ──
 *
 * Measuring into state and using it for ordinary layout — a width handed to an
 * `<Svg>`, a pill's width, a chart's domain. Those re-render normally and have
 * no frozen copy. Only the combination with a worklet is the trap.
 *
 * ── the two that are allowed, and why ──
 *
 * The rule's first run over the app found two more places with this exact
 * shape. Both were read line by line and neither is a live bug, for the same
 * reason in both cases: **the value the worklet computes with the measurement
 * still at 0 is the same value the correct resting state wants.**
 *
 *   - `scroll-progress`: with `track === 0` the thumb is 0 too, so `room` is 0,
 *     the guard returns `translateX: 0` — and 0 is where a thumb at the start of
 *     its track belongs anyway.
 *   - `today-meals`: `height: grow.value * bodyH` is `0 * 0`, and a closed card
 *     is 0 tall.
 *
 * That is a coincidence of arithmetic rather than a design, which is why they
 * are listed rather than quietly ignored, and it is a judgement made by reading
 * — this file does not and cannot verify it. If either ever grows a resting
 * position that is not zero it becomes the same bug, and the entry should come
 * off this list rather than be widened.
 *
 * They are not restructured today because the fix that works for `ProgressBar`
 * does not fit either of them: `today-meals` has to keep its inner view mounted
 * in order to measure it at all, and `scroll-progress` would gain a component
 * for no change in what appears on screen. The alternative fix for that case is
 * to hold the measurement in a `useSharedValue` instead of `useState`, which
 * makes it a real mapper input.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

/** comments stripped — the note above this rule quotes the code it forbids */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * State variables written from a layout callback.
 *
 * Two spellings are accepted because both are in this codebase: the setter
 * called directly in an inline `onLayout={(e) => setX(...)}`, and a named
 * handler that takes a `LayoutChangeEvent`. Either way what is looked for is a
 * setter invoked in the same statement as `nativeEvent.layout`, so a setter that
 * merely *exists* near an onLayout is not enough.
 */
function measuredState(src) {
  const setters = new Map(); // setterName -> stateName
  for (const m of src.matchAll(/const\s*\[\s*(\w+)\s*,\s*(set\w+)\s*\]\s*=\s*useState/g)) {
    setters.set(m[2], m[1]);
  }

  const measured = new Set();
  for (const [setter, state] of setters) {
    // the setter's call and a read of nativeEvent.layout inside the same
    // function body — approximated by "within 200 characters of each other",
    // which is the whole of a measure handler in every case here
    const re = new RegExp(
      `(nativeEvent\\.layout[\\s\\S]{0,200}?\\b${setter}\\s*\\()|(\\b${setter}\\s*\\([\\s\\S]{0,200}?nativeEvent\\.layout)`,
    );
    if (re.test(src)) measured.add(state);
  }
  return measured;
}

/** every `useAnimatedStyle(…)` / `useAnimatedProps(…)` worklet body in the file */
function worklets(src) {
  const out = [];
  for (const m of src.matchAll(/use(?:AnimatedStyle|AnimatedProps)\s*\(/g)) {
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
      i++;
    }
    out.push(src.slice(m.index, i));
  }
  return out;
}

/**
 * The file cut into top-level components.
 *
 * Necessary, not tidy-minded: the fix for this bug is *a second component in
 * the same file* that takes the measurement as a prop, and a prop is very
 * naturally given the same name as the state it came from. A file-wide scan
 * therefore reports the fixed version as broken — the first draft of this rule
 * did exactly that, and a rule that fails on the correct code is a rule that
 * gets deleted. Splitting on top-level declarations is enough to tell "the
 * component that measures" from "the component that animates".
 */
function components(src) {
  const starts = [...src.matchAll(/^(?:export\s+)?(?:function|const)\s+\w+/gm)].map((m) => m.index);
  if (starts.length === 0) return [src];
  const out = [];
  if (starts[0] > 0) out.push(src.slice(0, starts[0]));
  for (let i = 0; i < starts.length; i++) {
    out.push(src.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : src.length));
  }
  return out;
}

/**
 * Judged benign, with the reasoning in the note at the top of this file.
 *
 * Named files, not a pattern: each entry is one reading of one worklet, and a
 * pattern would silently cover the next one nobody read.
 */
const ALLOWED = new Set([
  'src/components/ascnd/scroll-progress.tsx',
  'src/components/ascnd/today-meals.tsx',
]);

function problems(file, raw) {
  const bad = [];
  for (const src of components(strip(raw))) {
    const measured = measuredState(src);
    if (measured.size === 0) continue;

    for (const w of worklets(src)) {
      for (const state of measured) {
        if (!new RegExp(`\\b${state}\\b`).test(w)) continue;
        bad.push(
          `${file}: worklet đọc "${state}", mà "${state}" là useState được ghi từ onLayout trong cùng component — ` +
            'useAnimatedStyle đóng băng style của lần render ĐẦU TIÊN, lúc đó số đo còn là 0, và giá trị đóng băng đó ' +
            'được áp lại ở mọi lần re-render sau. Mapper chỉ chạy theo shared value, nên khi giá trị động không nhúc ' +
            'nhích (ví dụ 0%) thì không có gì sửa lại. Tách phần worklet ra một component con chỉ mount khi đã đo xong, ' +
            'và truyền số đo vào bằng prop',
        );
      }
    }
  }
  return bad;
}

/* Fixtures, and they are wrapped in components on purpose.

   The rule reads the file one top-level declaration at a time, so a fixture
   written as three bare statements is split into three pieces and nothing is
   ever seen together — which is how the first draft of these fixtures reported
   the *broken* case as clean. A fixture has to have the same shape as the code,
   not just the same lines. */
{
  const broken = [
    'export function ProgressBar() {',
    '  const [track, setTrack] = useState(0);',
    '  const measure = (e: LayoutChangeEvent) => { const { width } = e.nativeEvent.layout; setTrack(width); };',
    '  const fill = useAnimatedStyle(() => ({ transform: [{ translateX: -track * (1 - p.value / 100) }] }));',
    '  return <View onLayout={measure}>{track > 0 ? <Animated.View style={fill} /> : null}</View>;',
    '}',
  ].join('\n');

  const fixed = [
    'export function ProgressBar() {',
    '  const [track, setTrack] = useState(0);',
    '  const measure = (e: LayoutChangeEvent) => { const { width } = e.nativeEvent.layout; setTrack(width); };',
    '  return <View onLayout={measure}>{track > 0 ? <Fill track={track} /> : null}</View>;',
    '}',
    'function Fill({ track }: { track: number }) {',
    '  const fill = useAnimatedStyle(() => ({ transform: [{ translateX: -track }] }));',
    '  return <Animated.View style={fill} />;',
    '}',
  ].join('\n');

  const plainLayout = [
    'export function Bmi() {',
    '  const [w, setW] = useState(0);',
    '  const measure = (e: LayoutChangeEvent) => { const { width } = e.nativeEvent.layout; setW(width); };',
    '  return <View onLayout={measure}><Svg width={w} /></View>;',
    '}',
  ].join('\n');

  const cases = [
    ['bản ProgressBar đã ship', broken, 1],
    ['bản đã tách component con', fixed, 0],
    ['đo để dựng layout thường, không có worklet', plainLayout, 0],
  ];
  const wrong = cases.filter(([, src, n]) => problems('x.tsx', src).length !== n);
  if (wrong.length) {
    console.log(`tự kiểm tra hỏng — sai ở: ${wrong.map(([l]) => l).join(', ')}, đừng tin kết quả`);
    process.exit(2);
  }
}

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', 'src/**/*.tsx'],
  { cwd: NATIVE, encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean)
  .filter((f) => existsSync(path.join(NATIVE, f)));

const all = [];
let scanned = 0;
let withWorklets = 0;
let allowed = 0;
for (const f of files) {
  const raw = read(f);
  if (!/useAnimatedStyle|useAnimatedProps/.test(raw)) continue;
  withWorklets++;
  if (/onLayout/.test(raw)) scanned++;
  const found = problems(f, raw);
  if (found.length && ALLOWED.has(f)) {
    allowed++;
    continue;
  }
  all.push(...found);
}

if (all.length) {
  console.log('worklet đọc số đo quá sớm:\n');
  for (const p of all) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `worklet đo được OK — ${withWorklets} tệp có worklet, ${scanned} trong số đó cũng tự đo bằng onLayout; ` +
    `${allowed} tệp được miễn kèm lý do đã đọc tay (giá trị lúc số đo còn 0 trùng đúng với vị trí nghỉ đúng); ` +
    'bản ProgressBar đã ship (thanh 0% hiện ĐẦY vì useAnimatedStyle đóng băng style của lần render đầu, ' +
    'lúc track còn 0) vẫn bị bắt, và 3 ca tự kiểm chạy trên component mẫu chứ không trên file thật',
);
