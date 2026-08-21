/**
 * That the assistant's background stops when nobody is looking at it.
 *
 * ── the bug this exists for ──
 *
 * Reported as "máy khá là nóng" after sitting on the Health Assistant, and the
 * cause was not the sitting. Every pool and every dust layer started with a
 * bare `withRepeat(…, -1)` on mount and **nothing ever stopped them**: four
 * pools and four dust layers kept compositing full-screen translucent layers
 * for the rest of the app's life — on the Today tab, on Nutrition, underneath
 * every pushed screen. Both assistant screens mount an aura, so opening the
 * coach over the assistant had sixteen animations running to draw two rooms,
 * one of which was covered.
 *
 * ── why it needs a tool ──
 *
 * This is the least visible class of defect in the whole app. There is no
 * wrong pixel, no error, nothing in a diff: the screen looks exactly as
 * designed and the battery goes. Nobody reviewing `withRepeat(..., -1)` reads
 * it as "forever, including while the user is three tabs away", because in the
 * file it sits next to a comment about seventeen-second drift.
 *
 * And it regresses in one line. Deleting a `moving` prop, or passing `true`,
 * restores the old behaviour with no visible change whatsoever.
 *
 * ── what is checked ──
 *
 * 1. every infinite animation is behind a gate, and cancelled when the gate shuts
 * 2. the gate is the screen's focus, and the system's reduce-motion setting
 * 3. the four fortnight queries only run for the tile being shown
 * 4. the signal those memos depend on is itself memoised
 *
 * Rule 4 exists because I wrote the bug it catches. `useAssistantSignal`
 * returned a fresh object literal every render, and the screen then wrapped
 * three pure functions in `useMemo(…, [signal])`. Every dependency changed
 * every render, so nothing was memoised — but the file now read as though the
 * cost had been dealt with, which is worse than leaving it alone.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const AURA = 'src/components/ascnd/assistant-aura.tsx';
const SCREEN = 'src/app/(tabs)/assistant.tsx';
const SIGNAL = 'src/hooks/use-assistant-signal.ts';

const problems = [];

/*
  ── 1: every endless animation has an off switch ──

  Counted rather than spot-checked. A fifth pool or a fifth dust layer added
  later would come with its own `withRepeat`, and the natural way to write it
  is the way the first four were written.
*/
function gateProblems(src) {
  const bad = [];
  const code = strip(src);
  const loops = [...code.matchAll(/withRepeat\(/g)].length;
  const cancels = [...code.matchAll(/cancelAnimation\(/g)].length;

  if (loops === 0) {
    bad.push('aura: không còn withRepeat nào — nếu ánh sáng thôi chuyển động thì sửa luật này, đừng bỏ nó');
    return bad;
  }
  /*
    Every loop needs its own switch, and the count is what says so.

    This read `cancels < 2`, which was the number of looping components on the
    day it was written. A third arrived — `AuraFigure`, the background figure —
    and the rule went quiet about it: with three loops and only two cancels the
    comparison is still false, so removing the figure's off switch left this
    step green. The paragraph above already claimed to be counting *"a fifth
    pool or a fifth dust layer added later"*, so the rule was not doing what it
    said about itself.

    Tying the floor to `loops` is the shape of the fault rather than a bigger
    constant: whatever gets added next brings its own `withRepeat`, and the
    check moves with it.
  */
  if (cancels < loops) {
    bad.push(
      `aura: ${loops} vòng lặp vô hạn nhưng chỉ ${cancels} chỗ cancelAnimation — ` +
        'mỗi thành phần lặp mãi phải có chỗ dừng riêng, nếu không nó chạy suốt đời app',
    );
  }
  /* Each looping component takes the gate and returns early. Checked as a
     pair, because a `moving` prop that is read and ignored is the same as no
     prop at all. */
  for (const [what, re] of [
    ['LightPool', /function LightPool\(\{[^}]*moving[^}]*\}/],
    ['DustField', /function DustField\(\{[\s\S]{0,200}?moving[\s\S]{0,200}?\}\)/],
    ['AuraFigure', /function AuraFigure\(\{[^}]*moving[^}]*\}/],
  ]) {
    if (!re.test(code)) bad.push(`aura: ${what} không nhận cờ dừng — nó sẽ chạy kể cả khi màn hình bị che`);
  }
  const guards = [...code.matchAll(/if \(!moving\) \{\s*cancelAnimation/g)].length;
  if (guards < loops) {
    bad.push(`aura: ${loops} vòng lặp nhưng chỉ ${guards} chỗ thật sự dừng khi !moving — cờ được truyền vào mà không dùng thì vô nghĩa`);
  }
  return bad;
}
problems.push(...gateProblems(read(AURA)));

/*
  ── 2: the gate is focus, and the system setting ──

  Focus is the one that saves the battery. Reduce Motion is the one the
  platform already offers for this exact complaint, and honouring it gives
  somebody a way to turn the whole thing off without the app inventing a
  setting of its own.
*/
{
  const code = strip(read(AURA));
  if (!/const moving = focused && !reduceMotion/.test(code)) {
    problems.push(
      'aura: cờ dừng không phải là `focused && !reduceMotion` — ' +
        'thiếu focus thì nó chạy ở tab khác, thiếu reduce-motion thì bỏ qua cài đặt hệ thống',
    );
  }
  if (!/useIsFocused\(\)/.test(code)) problems.push('aura: không đọc useIsFocused');
  if (!/useReducedMotion\(\)/.test(code)) problems.push('aura: không đọc useReducedMotion');
}

/*
  ── 3: one fortnight, not four ──

  The panel draws one metric. All four queries used to run on every visit — and
  the comment above them claimed the opposite, which is worse than no comment,
  because it is the thing anybody optimising this would read and believe.
*/
{
  const code = strip(read(SCREEN));
  const HISTORIES = [
    ['useReadinessHistory', "'readiness'"],
    ['useSleepDurationHistory', "'sleep'"],
    ['useKcalHistory', "'kcal'"],
    ['useBiometricHistory', "'hr'"],
  ];
  for (const [hook, kind] of HISTORIES) {
    const call = code.match(new RegExp(`${hook}\\(([^)]*)\\)`))?.[1] ?? null;
    if (call === null) {
      problems.push(`${SCREEN}: không còn gọi ${hook}`);
    } else if (!call.includes(`selected === ${kind}`)) {
      problems.push(
        `${SCREEN}: ${hook} chạy không kèm điều kiện \`selected === ${kind}\` — ` +
          'mở trang là tải cả bốn khoảng hai tuần để vẽ một biểu đồ',
      );
    }
  }
}

/*
  ── 4: a memo whose dependency changes every render is not a memo ──

  The screen memoises the briefing, the chips and the chart analysis on
  `[signal]`. That is only worth anything if `useAssistantSignal` returns the
  same object between renders — and its first version did not, it built a fresh
  literal each time. Three `useMemo`s that recompute every render regardless,
  and a file that reads as though somebody had already looked at this.

  Checked from the hook's side, because that is where the property lives: the
  returned object has to come out of a `useMemo` keyed on the query results.
*/
function signalProblems(src) {
  const bad = [];
  const code = strip(src);
  const body = code.match(/export function useAssistantSignal\(\)[\s\S]*$/)?.[0] ?? '';
  if (!body) return ['use-assistant-signal: không tìm thấy hàm — luật này cần được sửa lại chứ không phải bỏ đi'];

  const memo = body.match(/return useMemo\(\(\) => \{[\s\S]*?\}, \[([^\]]*)\]\);/);
  if (!memo) {
    bad.push(
      'use-assistant-signal: trả về vật thể mới mỗi lần render — ' +
        'mọi useMemo([signal]) ở màn assistant sẽ tính lại mỗi render mà trông như đã được nhớ',
    );
    return bad;
  }
  for (const dep of ['dailyLog', 'profile', 'workouts']) {
    if (!memo[1].includes(dep)) {
      bad.push(`use-assistant-signal: useMemo thiếu phụ thuộc "${dep}" — dữ liệu đổi mà tín hiệu không đổi theo`);
    }
  }
  return bad;
}
problems.push(...signalProblems(read(SIGNAL)));

/*
  And the screen actually leans on it. If these stop being memoised the hook
  above is just an object with extra steps.

  `[^;]` rather than `[\s\S]` is the whole rule. The first version searched a
  160-character window that happily crossed newlines, so when I deleted the
  memo around `suggestionsFor` the *previous statement's* `useMemo(` — one line
  up — matched instead and the tool reported clean. A window that can span
  statements answers "is there a useMemo near this call", which is not the
  question. Stopping at the semicolon keeps it inside one statement.
*/
function memoProblems(code) {
  const bad = [];
  for (const what of ['suggestionsFor', 'briefFor', 'analyse']) {
    if (!new RegExp(`useMemo\\(\\s*\\(\\) =>[^;]{0,160}?${what}\\(`).test(code)) {
      bad.push(`${SCREEN}: ${what}(...) chạy ngoài useMemo — nó tính lại mỗi lần render trang`);
    }
  }
  return bad;
}
problems.push(...memoProblems(strip(read(SCREEN))));

/**
 * The self-test.
 *
 * The gate rule is the one worth proving, because the regression is a deletion
 * rather than an addition — and a deletion leaves code that reads perfectly
 * well. The signal rule is proved against the exact version I shipped by
 * mistake, since the point of it is that that version looks correct.
 */
const BROKEN_AURA = `
function LightPool({ pool, tint }) {
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: pool.ms }), -1, true);
  }, []);
}
function DustField({ layer, height, width }) {
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: layer.ms }), -1, false);
  }, []);
}
`;
const caught = gateProblems(BROKEN_AURA);
if (caught.length < 3) {
  console.error(
    `phép tự kiểm hỏng — bản aura chạy mãi chỉ bị bắt ${caught.length}/3 lỗi, đừng tin kết quả`,
  );
  process.exit(2);
}

/** The signal as it was actually written: a plain object literal, no memo. */
const BROKEN_SIGNAL = `
export function useAssistantSignal(): AssistantSignal {
  const { data: dailyLog } = useDailyLog();
  const macros = macroTargetsFor(profile);
  return {
    name: '',
    steps: Number(dailyLog?.steps) || 0,
  };
}
`;
/** And one that memoises but forgets a source, so the chips go stale. */
const PARTIAL_SIGNAL = `
export function useAssistantSignal(): AssistantSignal {
  return useMemo(() => {
    return { name: '' };
  }, [dailyLog, profile]);
}
`;
for (const [label, src, least] of [
  ['tín hiệu không nhớ', BROKEN_SIGNAL, 1],
  ['tín hiệu nhớ thiếu nguồn', PARTIAL_SIGNAL, 1],
]) {
  const got = signalProblems(src);
  if (got.length < least) {
    console.error(`phép tự kiểm hỏng — "${label}" không bị bắt, đừng tin kết quả`);
    process.exit(2);
  }
}

/*
  The one that already got past this tool once. `suggestionsFor` is bare, but
  the statement above it ends in `useMemo(() => …)` — with a window that could
  cross a newline the tool matched that one and said everything was fine.
*/
const NEIGHBOUR_MEMO = `
  const hour = useMemo(() => new Date().getHours(), [signal]);
  const suggestions = suggestionsFor(signal);
  const brief = useMemo(() => briefFor(signal, hour, vi), [signal, hour, vi]);
  const analysis = useMemo(
    () => analyse({ kind: selected, points, today: new Date() }),
    [selected],
  );
`;
if (!memoProblems(NEIGHBOUR_MEMO).some((p) => p.includes('suggestionsFor'))) {
  console.error(
    'phép tự kiểm hỏng — lời gọi trần đứng ngay dưới một useMemo khác không bị bắt, ' +
      'đúng lỗi mà luật này từng bỏ sót; đừng tin kết quả',
  );
  process.exit(2);
}

if (problems.length) {
  console.log('chi phí aura sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  'chi phí aura OK — mọi vòng lặp vô hạn đều dừng khi màn hình bị che hoặc khi bật Reduce Motion; ' +
    'bốn truy vấn hai tuần chỉ chạy cho đúng ô đang xem; ' +
    'tín hiệu được nhớ theo cả ba nguồn nên ba useMemo ở màn hub là thật chứ không phải trang trí ' +
    '(bản trần núp dưới useMemo hàng trên vẫn bị bắt)',
);
