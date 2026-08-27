/**
 * The rules that make motion feel smooth, kept true as the app grows.
 *
 * ── what this is ──
 *
 * Mostly rules, and a very small table. The rules are the part that makes an
 * app feel smooth; the table only makes it consistent, which is a different and
 * lesser thing.
 *
 *   1. animation touches the compositor, never the layout engine
 *   2. nothing animates while nobody is looking at it
 *   3. the system's Reduce Motion setting is honoured even where the animation
 *      library does not do it for you
 *   4. the response band speaks with four named durations
 *   5. the two micro-interaction primitives keep their non-obvious guards
 *   6. a press is answered by one component, at one of two depths
 *
 * All of these except 4 are worth a tool because they fail *invisibly*: the
 * screen looks exactly as designed and the battery goes, or the frame budget
 * goes, or a counter quietly swallows the tap meant for the card underneath it,
 * and there is nothing in a diff to review.
 *
 * ── why the table is small on purpose ──
 *
 * Because most of this app's numbers are *compositions* rather than instances
 * of a scale, and a scale is the wrong container for them. The aura's pools
 * drift at 17s / 23s / 29s because co-prime periods stop four lights
 * resynchronising into a visible loop. The arrival is one cascade — tab bar at
 * 300, cards at 340, light at 420 — whose entire meaning is the gaps and the
 * order. Koa's blink at 90ms and nod at 110ms are two beats of one gesture.
 *
 * Flattened into `duration.slow` none of that survives; the numbers would come
 * out the other side looking arbitrary, which is precisely the state a design
 * system is supposed to rescue you from. So rule 4 covers the band where the
 * app was genuinely just picking numbers — a tap being answered — and the rig
 * and the cascade are exempt, by name, with their reasons attached.
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
  'src/components/ascnd/expander.tsx':
    'mở một mục bằng height thật, vì đó chính là cơ chế: chỉ có height mới đẩy được ' +
    'phần bên dưới xuống theo từng frame — today-meals.tsx đã đo LinearTransition và ' +
    'nó để lại khoảng hở 94px',
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
/**
 * Ngoại lệ, và vì sao chúng phải có tên.
 *
 * Luật trên đúng cho MOTION: thứ chuyển động để trông đẹp. Nó sai cho một
 * frame clock đang làm một việc CHỨC NĂNG mà người dùng đang trực tiếp điều
 * khiển — ở đó "đóng băng" không phải là một sự nhường nhịn, nó là gỡ mất tính
 * năng, tức đổi một sự loại trừ này lấy một sự loại trừ khác. Chính tệp
 * `use-reduced-motion.ts` nói ra nguyên tắc ấy khi từ chối giấu Koa đi.
 *
 * Nên ngoại lệ được liệt kê kèm lý do, và kèm một điều kiện MẠNH HƠN vế nó
 * miễn: đồng hồ phải có cổng bật/tắt (`setActive`). Một frame clock chạy suốt
 * đời màn hình không được núp sau danh sách này.
 */
const FRAME_CLOCK_EXEMPT = {
  'src/components/ascnd/drag-reorder.tsx':
    'đồng hồ này chỉ chạy trong lúc một ngón tay đang giữ một thẻ, và việc duy nhất nó làm là CUỘN ' +
    'trang khi ngón tay tới mép — đóng băng nó là làm người bật Reduce Motion không kéo được thẻ ra ' +
    'khỏi vùng nhìn thấy, tức gỡ mất tính năng chứ không phải giảm chuyển động',
};

for (const f of files) {
  const code = strip(read(f));
  if (!/useFrameCallback/.test(code)) continue;
  if (f.endsWith('use-reduced-motion.ts')) continue;
  if (FRAME_CLOCK_EXEMPT[f]) {
    /* Vế đánh đổi: được miễn đọc Reduce Motion, nhưng KHÔNG được chạy tự do. */
    if (!/\.setActive\(/.test(code)) {
      problems.push(
        `${f}: được miễn luật Reduce Motion vì "${FRAME_CLOCK_EXEMPT[f]}", nhưng đồng hồ không có cổng ` +
          '`setActive` — một frame clock chạy suốt đời màn hình không được núp sau ngoại lệ đó',
      );
    }
    continue;
  }
  if (!/reduceMotionSV/.test(code)) {
    problems.push(
      `${f}: dùng useFrameCallback nhưng không đọc reduceMotionSV — ` +
        'Reanimated không tự áp Reduce Motion cho frame callback, chỗ này phải tự kiểm tra',
    );
  }
}

/* Một lý do để lại cho mã không còn làm việc đó tệ hơn không có lý do. */
for (const f of Object.keys(FRAME_CLOCK_EXEMPT)) {
  if (!/useFrameCallback/.test(strip(read(f)))) {
    problems.push(`${f}: nằm trong FRAME_CLOCK_EXEMPT nhưng không còn frame clock nào — gỡ khỏi danh sách`);
  }
}

/**
 * ── rule 4: the response band speaks with four words ──
 *
 * A survey found the app answering taps at 180, 200, 240 and 320 across seven
 * places — already close to a vocabulary, just an unnamed one. `constants/motion`
 * names those four. This rule is what stops the eighth place inventing 190.
 *
 * ── what it deliberately does not police ──
 *
 * The character rig, and the arrival cascade. Koa's blink at 90ms and nod at
 * 110ms are two beats of one gesture rather than two picks off a scale, and the
 * cascade (tab bar 300 → cards 340 → light 420) is a composition whose whole
 * meaning is the gaps between its numbers. Forcing either through a token table
 * would delete the reasoning and leave the numbers looking arbitrary, which is
 * the opposite of what a system is for.
 *
 * So: rig directories are exempt wholesale, and the two cascade sites are named
 * with their reason — the same shape as `BOUNDED_LAYOUT`, for the same reason.
 * A number that is part of a composition should be next to the comment
 * explaining the composition.
 */
const RIG = /mascot|koa\/|studio\/|celebration|stage-renderer/;
/*
  Response-band literals that are part of a composition, not a pick.

  Keyed by file *and value*. Exempting a whole file is the same looseness that
  let a stale import satisfy rule 2 — it would mean settle.tsx could grow a
  second, unrelated duration and never be asked about it.
*/
const COMPOSED = {
  'src/components/ascnd/settle.tsx': {
    220: 'nhịp giữa của cascade vào trang: tab bar 300 → thẻ 340 (220 + stagger 30/thẻ) → ánh sáng 420',
  },
  'src/components/ascnd/assistant-aura.tsx': {
    420: 'nhịp cuối của cascade — ánh sáng phải xong sau thẻ 80ms, đó mới là thứ tự của một lần bước vào phòng',
  },
};
const TOKENS = new Set([180, 200, 240, 320]);
for (const f of files) {
  if (RIG.test(f)) continue;
  const code = strip(read(f));
  for (const m of code.matchAll(/duration:\s*(\d+)/g)) {
    const v = Number(m[1]);
    if (v === 0 || v > 800) continue;
    const line = code.slice(0, m.index).split('\n').length;
    if (COMPOSED[f]?.[v]) continue;
    problems.push(
      TOKENS.has(v)
        ? `${f}:${line}: duration: ${v} viết thẳng số — đã có token cho đúng giá trị này trong constants/motion, dùng nó`
        : `${f}:${line}: duration: ${v} không thuộc bốn nhịp phản hồi (180/200/240/320) — ` +
            'chọn nhịp gần nhất theo "màn hình đổi bao nhiêu", hoặc nếu nó là một phần của bố cục nhịp thì ghi vào COMPOSED kèm lý do',
    );
  }
}

/* ── the same rule, for the two ways a duration gets past it ──

   The rule above reads `duration: <số>`. Three durations written this session
   walked straight through it, and not by being clever:

     const SLIDE_MS = 220;  …  withTiming(x, { duration: SLIDE_MS })
     FadeIn.duration(140)

   Neither form is a literal after `duration:`, so neither was ever asked which
   of the four beats it was. That is the rule's own stated purpose — "what stops
   the eighth place inventing 190" — defeated by naming a constant, which is the
   thing a careful author is most likely to do.

   ── why the existing sites are grandfathered, and labelled as debt ──

   Closing the hole exposes 19 files that predate this rule. `constants/motion`
   is explicit about what a mass migration would cost: "the first time somebody
   'harmonised' them the sequence would be gone." So they are listed, and the
   list says plainly what it is — not reviewed, not justified, just older than
   the rule. Inventing a reason for each would be worse than admitting there
   isn't one: a false explanation reads exactly like a true one.

   The twentieth site still gets stopped, which is the whole job. */
const LEGACY = new Set([
  'src/app/(tabs)/assistant.tsx', 'src/app/food-list.tsx', 'src/app/water.tsx',
  'src/components/ascnd/assistant-aura.tsx', 'src/components/ascnd/day-plan.tsx',
  'src/components/ascnd/help-button.tsx', 'src/components/ascnd/koa-companion.tsx',
  'src/components/ascnd/line-chart.tsx', 'src/components/ascnd/liquid-tab-bar.tsx',
  'src/components/ascnd/onboarding-flow.tsx', 'src/components/ascnd/readiness-gauge.tsx',
  'src/components/ascnd/rest-timer.tsx', 'src/components/ascnd/studio/sky-live.tsx',
  'src/components/ascnd/template-list.tsx', 'src/components/ascnd/today-meals.tsx',
  'src/components/ascnd/water-chart.tsx', 'src/components/ascnd/weight-log-list.tsx',
]);
for (const f of files) {
  if (RIG.test(f) || LEGACY.has(f)) continue;
  const code = strip(read(f));
  /* only same-file numeric consts; `const X = duration.move` resolves to
     nothing here, which is exactly the shape we want to stop asking about */
  const named = {};
  for (const m of code.matchAll(/const ([A-Za-z_$][\w$]*) = (\d+);/g)) named[m[1]] = Number(m[2]);
  const sites = [
    ...code.matchAll(/\.duration\(\s*(\d+|[A-Za-z_$][\w$]*)\s*\)/g),
    ...code.matchAll(/duration:\s*([A-Za-z_$][\w$]*)[,\s}]/g),
  ];
  for (const m of sites) {
    const v = /^\d+$/.test(m[1]) ? Number(m[1]) : named[m[1]];
    if (v == null || v === 0 || v > 800 || TOKENS.has(v)) continue;
    if (COMPOSED[f]?.[v]) continue;
    const line = code.slice(0, m.index).split('\n').length;
    problems.push(
      `${f}:${line}: nhịp ${v} (qua \`${m[1]}\`) không thuộc bốn nhịp phản hồi (180/200/240/320) — ` +
        'đặt tên cho một con số không làm nó thoát khỏi thang nhịp, mà đó chính là cách ba nhịp mới ' +
        'lọt qua luật này. Chọn nhịp gần nhất theo "màn hình đổi bao nhiêu", hoặc ghi vào COMPOSED kèm lý do',
    );
  }
}

/* A grandfather list that outlives its file is the same stale-reason problem as
   COMPOSED, one level up. */
for (const f of LEGACY) {
  if (!files.includes(f)) {
    problems.push(`LEGACY còn ghi ${f} nhưng tệp đó không còn — xoá dòng đó đi`);
  }
}

/* Same staleness guard as BOUNDED_LAYOUT: a reason outlives the code it
   describes far too easily, and then it is just a false statement in a file. */
for (const [f, allowed] of Object.entries(COMPOSED)) {
  const code = strip(read(f));
  for (const v of Object.keys(allowed)) {
    if (!new RegExp(`duration:\\s*${v}\\b`).test(code)) {
      problems.push(`COMPOSED còn ghi ${f} có duration ${v} nhưng không còn nữa — xoá dòng ngoại lệ đi`);
    }
  }
}

/**
 * ── rule 5: the micro-interaction primitives keep their non-obvious guards ──
 *
 * Two components carry the app's smallest motions — the press and the counter —
 * and each has a guard that looks like boilerplate and is not.
 *
 * `AnimatedNumber` is a `TextInput` wearing a `Text`'s clothes, because that is
 * the only content React Native will animate off the JS thread. Borrowing it
 * brings two problems that produce no error when you forget them:
 *
 *   - without `pointerEvents="none"` it is a live text field sitting on top of
 *     a card, and it silently eats the tap meant for the card. Every counter in
 *     this app is inside something pressable, so the symptom is "the dashboard
 *     stopped opening" with nothing in the logs.
 *   - without `accessibilityLabel` a screen reader announces a *text field* and
 *     reads whichever digit the animation is passing through. The number is the
 *     one thing on that screen somebody needs, and it would be the one thing
 *     assistive tech could not state.
 *
 * `PressScale` puts its animated style on the `Pressable` itself. A wrapper
 * `View` is the obvious build and it shifts layout at some fraction of fifty
 * call sites, because `flex`, `alignSelf` and margins all behave differently
 * one node down — and each shift is a pixel or two, which is exactly the size
 * of thing that gets shipped.
 */
{
  const NUM = 'src/components/ascnd/animated-number.tsx';
  const code = strip(read(NUM));
  for (const [what, re, why] of [
    ['pointerEvents="none"', /pointerEvents="none"/, 'ô số sẽ nuốt mất cú chạm dành cho thẻ chứa nó'],
    ['accessibilityLabel', /accessibilityLabel=/, 'trình đọc màn hình sẽ đọc con số đang chạy dở thay vì giá trị thật'],
    ['editable={false}', /editable=\{false\}/, 'người dùng gõ được vào một con số chỉ để đọc'],
  ]) {
    if (!re.test(code)) problems.push(`${NUM}: thiếu ${what} — ${why}`);
  }
  /* The worklet and the label must format through one function, or the settled
     value and the animated digits can disagree about the separator. */
  if ((code.match(/format\(/g) ?? []).length < 3) {
    problems.push(`${NUM}: nhãn và worklet phải dùng chung một hàm format, nếu không hai bên hiển thị khác nhau`);
  }
  if (!/'worklet'/.test(code)) {
    problems.push(`${NUM}: hàm format không được đánh dấu 'worklet' — nó chạy trên UI thread`);
  }

  const PRESS = 'src/components/ascnd/press-scale.tsx';
  const pcode = strip(read(PRESS));
  /* `\w*Pressable`, không phải `Pressable` nguyên văn.

     Luật này từng khớp đúng chuỗi `createAnimatedComponent(Pressable)`. File đó
     nay dựng HAI bản — một của React Native, một của gesture-handler, đặt tên
     `RNPressable` và `GHPressable` — và luật lập tức đỏ dù hành vi không đổi
     một chút nào. Nó đang canh cách viết một cái tên, không canh việc style động
     nằm ở đâu. Cùng một lỗi, lần thứ bảy trong repo này. */
  if (!/createAnimatedComponent\(\s*\w*Pressable\s*\)/.test(pcode)) {
    problems.push(`${PRESS}: style động phải nằm trên chính Pressable — bọc thêm View sẽ xê dịch bố cục ở hàng chục chỗ gọi`);
  }
  /* Và nó phải THẬT SỰ đeo style đó. Một `createAnimatedComponent` được dựng ra
     rồi render một `<View style={anim}>` bọc ngoài sẽ qua được phép kiểm trên mà
     vẫn đúng cái bố cục bị xê dịch mà luật này sinh ra để chặn. */
  {
    const rendered = pcode.match(/return \(\s*<(\w+)[\s\S]{0,400}?>/);
    const tag = rendered?.[1];
    const wearsStyle = tag && new RegExp(`<${tag}[^>]*style=\\{\\[`).test(pcode);
    if (!wearsStyle) {
      problems.push(`${PRESS}: component được render không đeo style động — style nằm ở đâu đó khác`);
    }
  }
  for (const token of ['press.spring', 'press.opacity']) {
    if (!pcode.includes(token)) {
      problems.push(`${PRESS}: không dùng ${token} — độ lún và độ mờ phải có một nguồn duy nhất, đó là lý do file token tồn tại`);
    }
  }
  if (!/haptic = 'none'/.test(pcode)) {
    problems.push(
      `${PRESS}: haptic mặc định không phải 'none' — 70 tệp đã tự gọi Haptics, bật sẵn là rung hai lần mỗi lần chạm`,
    );
  }
  /*
    ── the press must multiply the caller's opacity, not replace it ──

    The animated style is applied last, so an `opacity` inside it beats anything
    the call site passed in. The first version wrote a flat `1 - t * …`, which
    at rest is exactly 1 — and 22 styles in this app carry an opacity between
    0.35 and 0.55 whose entire job is to say "you cannot press this". Every one
    of them was being overwritten. No error, no warning, no wrong pixel in
    isolation: a disabled button just looks live, on about twenty screens.

    Checked as a pair — the flatten that reads the caller's value, and the
    multiplication that respects it — because either one alone does nothing.
  */
  if (!/StyleSheet\.flatten\(style\)/.test(pcode)) {
    problems.push(
      `${PRESS}: không đọc opacity mà chỗ gọi đã đặt — style động ghi đè nó, và mọi nút disabled sẽ hết mờ`,
    );
  }
  if (!/opacity: baseOpacity \*/.test(pcode)) {
    problems.push(
      `${PRESS}: opacity phải NHÂN với baseOpacity chứ không thay thế — ` +
        'thay thế là xoá sạch trạng thái disabled của 22 style trong app',
    );
  }
}

/**
 * ── rule 6: a press is answered in one place ──
 *
 * `style={({ pressed }) => [x, pressed && styles.pressed]}` is not an
 * animation. It is a static style swapped in by a re-render, so the surface
 * jumps to its pressed size and jumps back with nothing in between. 188 sites
 * across 64 files did exactly that, at nine different depths, and every one of
 * them read as "already handled" to anybody scanning the file.
 *
 * The depth is the part that cannot be fixed locally: 0.92 lurches on a
 * full-width card and is invisible on a 24pt icon, because the eye reads
 * distance and not ratio. That judgement belongs to one place — `press` in
 * `constants/motion` — and a call site re-deciding it is how the app ended up
 * with 0.88, 0.9, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98 and 0.995 all meaning
 * "pressed".
 *
 * ── what stays, and why it is not a shortfall ──
 *
 * A press does not have to be a scale. A row inside a picker highlights its
 * *background* instead, which is what a table row has always done and what
 * scaling a full-width row would look wrong doing. Those keep the callback,
 * because the callback is carrying something a scale cannot.
 */
const PRESS_CALLBACK = /style=\{\(\{\s*pressed\s*\}\)|\{\(\{\s*pressed\s*\}\)\s*=>/;
const AD_HOC_OK = {
  'src/components/app-tabs.web.tsx': 'thanh tab bản web, không dùng chung với native',
  'src/components/ascnd/liquid-tab-bar.tsx': 'hàng trong menu sáng nền — thu nhỏ cả hàng ngang đọc ra sai',
  'src/components/ascnd/week-plan.tsx': 'hàng chọn buổi tập sáng nền, giống hàng trong bảng',
  'src/components/ascnd/press-scale.tsx': 'chính nó, và đoạn mã cũ nằm trong doc-comment',
};
for (const f of files) {
  const code = strip(read(f));
  if (!PRESS_CALLBACK.test(code)) continue;
  if (AD_HOC_OK[f]) continue;
  const line = code.split('\n').findIndex((l) => PRESS_CALLBACK.test(l)) + 1;
  problems.push(
    `${f}:${line}: còn tự làm hiệu ứng nhấn bằng \`({ pressed })\` — đó là style tĩnh, nó nhảy chứ không chạy; ` +
      'dùng PressScale, hoặc nếu phản hồi là đổi nền chứ không phải thu nhỏ thì ghi lý do vào AD_HOC_OK',
  );
}
/* And the depth is decided once. A call site passing a bare number is the same
   drift the token was created to end. */
for (const f of files) {
  if (f.endsWith('constants/motion.ts')) continue;
  const code = strip(read(f));
  for (const m of code.matchAll(/<PressScale[^>]*?\bto=\{([^}]*)\}/g)) {
    if (!m[1].includes('press.')) {
      const line = code.slice(0, m.index).split('\n').length;
      problems.push(`${f}:${line}: PressScale to={${m[1]}} là số trần — độ lún chỉ có hai giá trị, press.scale và press.deep`);
    }
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
  /* Rule 4, both directions: a number off the scale, and a number that *is* a
     token but written as a literal — the second is the one that would quietly
     leave the vocabulary half-adopted. */
  ['số lạ ngoài thang bị bắt', () => !TOKENS.has(190)],
  ['số đúng token nhưng viết thẳng vẫn bị bắt', () => {
    const src = 'x.value = withTiming(1, { duration: 240 });';
    const m = [...src.matchAll(/duration:\s*(\d+)/g)][0];
    return TOKENS.has(Number(m[1]));
  }],
  ['ngoại lệ COMPOSED khớp theo giá trị, không theo tệp', () => {
    const fake = { 'a.tsx': { 220: 'lý do' } };
    return fake['a.tsx']?.[220] && !fake['a.tsx']?.[999];
  }],
  ['tệp rig được miễn', () => RIG.test('src/components/ascnd/mascot.tsx') && !RIG.test('src/app/water.tsx')],
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

const pressScaleCount = files.reduce((n, f) => n + (read(f).match(/<PressScale/g) ?? []).length, 0);
const loopFiles = files.filter((f) => /withRepeat\([\s\S]{0,200}?-1/.test(strip(read(f)))).length;
const clockFiles = files.filter((f) => /useFrameCallback/.test(strip(read(f)))).length;
console.log(
  `luật chuyển động OK — ${files.length} tệp: mọi useAnimatedStyle chỉ chạm transform/opacity ` +
    `(${Object.keys(BOUNDED_LAYOUT).length} ngoại lệ có lý do ghi lại, không cái nào lặp vô hạn); ` +
    `${loopFiles} tệp có vòng lặp vô hạn, mọi vòng đều nằm trong useEffect có điều kiện dừng; ` +
    `${clockFiles} tệp dùng frame clock và đều đọc Reduce Motion; ` +
    `dải phản hồi chỉ dùng ${TOKENS.size} nhịp có tên (${[...TOKENS].join('/')}) — kể cả khi nhịp đó được ĐẶT TÊN cho một hằng số hay đi qua .duration(), hai lối mà ba nhịp mới đã lọt qua trong phiên này; ${LEGACY.size} tệp có trước luật được ghi thẳng là NỢ CHƯA DUYỆT chứ không bịa lý do, ` +
    `${Object.values(COMPOSED).reduce((n, o) => n + Object.keys(o).length, 0)} số thuộc cascade được miễn kèm lý do, rig nhân vật không bị ép vào thang; ` +
    'PressScale và AnimatedNumber giữ đủ chốt chặn (không nuốt chạm, đọc được bằng screen reader, không rung hai lần); ' +
    `${pressScaleCount} chỗ nhấn dùng PressScale, ${Object.keys(AD_HOC_OK).length - 1} chỗ giữ callback vì phản hồi là đổi nền`,
);
