/**
 * Every icon-only button must have a name, and every button must be reachable
 * by a thumb.
 *
 * ── the two rules ──
 *
 * 1. A `Pressable` containing an icon and no text needs an
 *    `accessibilityLabel`. VoiceOver reads an unnamed button as "button" —
 *    WCAG 2.1 SC 4.1.2 Name, Role, Value, Level A. The audit found 56 of 59.
 * 2. A `Pressable` whose style fixes `width` and `height` below 44 needs enough
 *    `hitSlop` to make up the difference. Apple HIG's floor is 44×44. The audit
 *    found 7 that did not, the worst a 24×24 checkbox with no slop at all.
 *
 * Neither was 56 people being careless. A label is invisible while you develop
 * by looking at a screen, and nothing failed without one, so it never entered
 * anyone's idea of "done". `IconButton` makes both structural — the label is a
 * required prop and the slop is computed — and this file stops the hand-rolled
 * version from creeping back.
 *
 * ── on parsing JSX with a regex, which is a bad idea ──
 *
 * It is, and the first version of this measurement was wrong because of it:
 * `<Pressable(.*?)>` stops at the first `>`, and the first `>` in almost every
 * Pressable here is the arrow in `onPress={() => …}`. So the attributes were
 * being read up to the arrow and `hitSlop` was invisible past it. It reported
 * 18 failures where there were 7 — it flagged controls that were already fine.
 *
 * `openTags` walks forward tracking brace depth and stops at the first `>` at
 * depth zero, which is the real end of the opening tag. The self-test below
 * locks that in, using the exact shape that broke it.
 *
 * ── what it still cannot see ──
 *
 * Text rendered conditionally. The tab bar draws its label only for the active
 * tab, so every inactive tab had no text in the tree and no label either — and
 * this file counted it as "has text" and said nothing, because the `<Text>` is
 * right there in the source. That one was found by reading, not by running.
 * A control whose label is conditional needs `accessibilityLabel` regardless;
 * the checker cannot tell you so.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src');
const MIN_TARGET = 44;


/**
 * `hitSlop` in either form it is written.
 *
 * `hitSlop={8}` grows the target by eight on every side. `hitSlop={{ top: 8,
 * bottom: 8 }}` grows it vertically only, which is the right thing for a
 * control in a tight horizontal row: adding the same eight points sideways
 * would make it overlap its neighbour, and a tap landing in two targets at
 * once resolves by tree order rather than by intent.
 *
 * Reading only the first form is why this check once demanded a change that
 * would have made the screen worse.
 */
function readSlop(attrs) {
  const flat = attrs.match(/hitSlop=\{(\d+)\}/);
  if (flat) {
    const n = Number(flat[1]);
    return { top: n, bottom: n, left: n, right: n };
  }
  const obj = attrs.match(/hitSlop=\{\{([^}]*)\}\}/);
  const side = (name) => {
    const m = obj ? obj[1].match(new RegExp(`${name}:\\s*(\\d+)`)) : null;
    return m ? Number(m[1]) : 0;
  };
  return { top: side('top'), bottom: side('bottom'), left: side('left'), right: side('right') };
}

/** `IconButton` is the sanctioned way; it enforces both rules by construction. */
const EXEMPT = [path.join('src', 'components', 'ascnd', 'icon-button.tsx')];

/** Yield `{ start, attrs, body }` for every `<Pressable …>…</Pressable>`. */
function pressables(text) {
  const out = [];
  for (const m of text.matchAll(/<Pressable\b/g)) {
    let i = m.index + m[0].length;
    let depth = 0;
    let attrsEnd = -1;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) {
        attrsEnd = i;
        break;
      }
    }
    if (attrsEnd === -1) continue;
    const close = text.indexOf('</Pressable>', attrsEnd);
    out.push({
      start: m.index,
      attrs: text.slice(m.index + m[0].length, attrsEnd),
      body: close === -1 ? '' : text.slice(attrsEnd, close),
      selfClosing: text[attrsEnd - 1] === '/',
    });
  }
  return out;
}

// ── self-test: the shape that broke the first attempt ──────────────────
{
  const sample = `
    <Pressable
      accessibilityLabel="Edit"
      hitSlop={10}
      onPress={() => {
        doThing();
      }}
      style={({ pressed }) => [styles.rowBtn, pressed && styles.pressed]}>
      <Icon icon={Pencil} size={15} />
    </Pressable>`;
  const [p] = pressables(sample);
  const ok = p && p.attrs.includes('hitSlop') && p.attrs.includes('styles.rowBtn');
  if (!ok) {
    console.error('tự kiểm tra hỏng: không đọc được hết thuộc tính qua dấu => trong onPress');
    process.exit(1);
  }
}

// ── self-test: slop, in both forms and in both axes ─────────────────────
{
  const cases = [
    ['không có slop', 'onPress={() => x()}', { top: 0, bottom: 0, left: 0, right: 0 }],
    ['số trần', 'hitSlop={10}', { top: 10, bottom: 10, left: 10, right: 10 }],
    ['chỉ dọc', 'hitSlop={{ top: 8, bottom: 8 }}', { top: 8, bottom: 8, left: 0, right: 0 }],
    ['đủ bốn cạnh', 'hitSlop={{ top: 1, bottom: 2, left: 3, right: 4 }}', { top: 1, bottom: 2, left: 3, right: 4 }],
  ];
  for (const [what, attrs, want] of cases) {
    const got = readSlop(attrs);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      console.error(`tự kiểm tra hỏng: đọc slop "${what}" ra ${JSON.stringify(got)}, đáng lẽ ${JSON.stringify(want)}`);
      process.exit(1);
    }
  }

  /*
    And the reason the two axes are judged apart: a 44×32 button with eight
    points above and below is a legal 44×48 target, while the same slop on a
    20-wide one is still too narrow. Collapsing to `min(w, h) + 2 * slop` calls
    the first one a failure and the second one a pass — both wrong, and the
    first is what sent this check chasing a change that would have made two
    steppers overlap.
  */
  const vertical = readSlop('hitSlop={{ top: 8, bottom: 8 }}');
  const wide = { w: 44 + vertical.left + vertical.right, h: 32 + vertical.top + vertical.bottom };
  const narrow = { w: 20 + vertical.left + vertical.right, h: 32 + vertical.top + vertical.bottom };
  if (!(wide.w >= MIN_TARGET && wide.h >= MIN_TARGET) || narrow.w >= MIN_TARGET) {
    console.error('tự kiểm tra hỏng: hai chiều không được xét riêng, đừng tin kết quả');
    process.exit(1);
  }
  const collapsed = Math.min(44, 32) + 2 * 8;
  if (collapsed !== 48) {
    console.error('tự kiểm tra hỏng: cách tính gộp cũ không còn tái dựng được');
    process.exit(1);
  }
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

const unnamed = [];
const small = [];
const shortLabelled = [];

for (const file of walk(SRC)) {
  const rel = path.relative(NATIVE, file);
  if (EXEMPT.includes(rel)) continue;
  const text = readFileSync(file, 'utf8');
  const styles = Object.fromEntries([...text.matchAll(/(\w+):\s*\{([^{}]*)\}/g)].map((m) => [m[1], m[2]]));
  const lineOf = (i) => text.slice(0, i).split('\n').length;

  for (const p of pressables(text)) {
    const attrs = p.attrs;
    // comments inside the body are not content
    const body = p.body.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

    const hasIcon = /<Icon\b|icon=\{/.test(body);
    const hasText = /<Text\b|<Animated\.Text\b/.test(body);
    const named = /accessibilityLabel/.test(attrs);
    if (hasIcon && !hasText && !named) {
      unnamed.push(`${rel}:${lineOf(p.start)}`);
    }

    const styleRef = attrs.match(/styles\.(\w+)/);
    if (styleRef) {
      const decl = styles[styleRef[1]] ?? '';
      const w = decl.match(/\bwidth:\s*(\d+)/);
      const h = decl.match(/\bheight:\s*(\d+)/);

      /*
        ── the check used to skip anything without a fixed width ──

        Below, both dimensions are required before a pressable is measured at
        all. That quietly excused the most common shape in this app: a control
        laid out with `flex: 1` and a `height`. Every segmented control, every
        full-width row, every pill sized by its own text has no `width:` in its
        style, so none of them were ever measured — and several are 34pt tall
        with no `hitSlop`, which is a 34pt-tall touch target on a control that
        spans the screen.

        Height can be judged on its own: a target that is wide enough and too
        short is still too short. So the vertical check runs whenever there is a
        `height`, and the width check keeps waiting for a `width` because a
        `flex: 1` control's width genuinely is not knowable from the source.

        This is what the user meant by the buttons feeling small. The tool said
        44 everywhere because it was not looking at them.
      */
      if (h && !w) {
        const slop = readSlop(attrs);
        const effH = Number(h[1]) + slop.top + slop.bottom;
        if (effH < MIN_TARGET) {
          shortLabelled.push(
            `${rel}:${lineOf(p.start)}  ${styleRef[1]} cao ${h[1]}pt` +
              (slop.top + slop.bottom ? ` +slop ${slop.top}/${slop.bottom} → ${effH}pt` : ' (không có hitSlop)'),
          );
        }
      }

      if (w && h) {
        const slop = readSlop(attrs);
        /*
          Width and height are judged separately, because slop is.

          The two dimensions were collapsed to `min(w, h) + 2 * slop`, which
          only works while slop is one number. It reads a 44×32 stepper with
          eight points above and below as a 32pt target and demands the fix it
          has already been given — and the fix it *would* accept, a plain
          `hitSlop={8}`, is worse: the steppers sit two points apart, so eight
          points of slop on each side makes their targets overlap, and a tap in
          the overlap goes to whichever happens to be later in the tree.
        */
        const eff = {
          w: Number(w[1]) + slop.left + slop.right,
          h: Number(h[1]) + slop.top + slop.bottom,
        };
        if (eff.w < MIN_TARGET || eff.h < MIN_TARGET) {
          small.push(
            `${rel}:${lineOf(p.start)}  ${styleRef[1]} ${w[1]}×${h[1]} ` +
              `+slop ${slop.left}/${slop.right}/${slop.top}/${slop.bottom} → ${eff.w}×${eff.h}pt`,
          );
        }
      }
    }
  }
}

/*
  ── a row of abstract glyphs in a header is a memory test ──

  One icon button in a header is a convention people already know: a gear, a
  plus, a close. A *list* of them is not. Nutrition carried a pill and a
  trolley; Progress carried sparkles, a target, crossed swords and a medal —
  four 17pt glyphs standing for weekly review, smart goals, challenges and
  awards, none of them guessable, and one of them (sparkles) a glyph this app
  already uses for something else entirely.

  Both are `ShortcutRow`s now: name written out, current state beside it. The
  rule is about the shape that produced them — a `headerRight` that *maps over
  a list* to draw icons — because that is the thing that grows from two to four
  without anybody deciding to.

  A single icon button in a header is untouched.
*/
const headerRows = [];
for (const file of walk(SRC)) {
  const rel = path.relative(NATIVE, file);
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const at = text.indexOf('headerRight={');
  if (at < 0) continue;
  /* Read to the end of the prop rather than a fixed slice: these blocks are
     twenty lines and a window would either miss the map or run into the page. */
  let depth = 0;
  let end = at + 'headerRight='.length;
  for (; end < text.length; end++) {
    const c = text[end];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  const prop = text.slice(at, end);
  if (/\.map\(/.test(prop) && /<Icon\b/.test(prop) && !/<Text\b/.test(prop)) {
    headerRows.push(
      `${rel}:${text.slice(0, at).split('\n').length}  headerRight vẽ một DÃY icon không chữ — ` +
        'dùng ShortcutRow ở cuối trang, có tên và có trạng thái',
    );
  }
}

/*
  ── the blind spot this file already documents, closed for the buttons in it ──

  The note at the top of this file says it plainly: a control whose label is
  rendered conditionally needs an `accessibilityLabel` regardless, and this
  checker cannot tell you so.

  The five save buttons were sitting in exactly that hole. Each renders

      isSuccess ? <Icon Check/> : isPending ? <ActivityIndicator/> : <Text>Save</Text>

  so in two of the three branches there is no text in the tree at all, and the
  most important button on each sheet announced itself as an unnamed element at
  precisely the two moments — saving, saved — when a person most needs to know
  what it is doing. Combined with a toast that said nothing, tapping Save gave a
  VoiceOver user a haptic and no information whatsoever.

  Named files rather than a general rule, because the general rule is the thing
  this checker cannot do. Each entry is a button that changes what it renders.
*/
const conditional = [];
const CONDITIONAL_LABEL = [
  'src/app/log-meal.tsx',
  'src/app/log-workout.tsx',
  'src/app/log-sleep.tsx',
  'src/app/log-biometrics.tsx',
  'src/app/log-measurement.tsx',
];
for (const file of CONDITIONAL_LABEL) {
  const src = readFileSync(path.join(NATIVE, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const at = src.indexOf('styles.saveButton');
  if (at < 0) {
    conditional.push(`${file}: không còn thấy nút lưu — luật nhãn-có-điều-kiện đã lạc mục tiêu`);
    continue;
  }
  /* Look just above the style line: that is where the element's own props are,
     and a label belonging to some other control on the page must not count. */
  const head = src.slice(Math.max(0, at - 400), at);
  if (!head.includes('accessibilityLabel')) {
    conditional.push(
      `${file}: nút lưu không có accessibilityLabel — nhánh đang gửi và đã xong không có <Text> nào, ` +
        'nên nó tự giới thiệu là một phần tử không tên đúng lúc quan trọng nhất',
    );
  }
}

/*
  And the one surface that announces results at all has to announce them.

  `neon-toast` is the app's sole channel for "đã lưu", "đã xếp hàng offline" and
  every `toast.error` — the sheets pop themselves on success, so nothing else is
  left on screen to read. It also removes itself after three seconds, which is
  shorter than it takes to navigate to it, so the announcement has to be pushed
  rather than offered.
*/
{
  /* Comments stripped. The first version read the raw file and passed with the
     call deleted — because the comment above it *names* the API while
     explaining why it is there. Third time this file family has been fooled by
     its own prose; it is a rule about code, so it reads code. */
  const toastHost = readFileSync(path.join(NATIVE, 'src/components/ascnd/neon-toast.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  if (!/announceForAccessibility/.test(toastHost)) {
    conditional.push(
      'neon-toast.tsx: không đọc thông báo lên — đây là kênh xác nhận DUY NHẤT của app, ' +
        'và nó tự biến mất sau 3 giây nên không thể điều hướng tới kịp',
    );
  }
  if (!/accessibilityLiveRegion/.test(toastHost)) {
    conditional.push('neon-toast.tsx: thiếu accessibilityLiveRegion (nửa Android của cùng một ý)');
  }
}

if (unnamed.length || small.length || shortLabelled.length || headerRows.length || conditional.length) {
  if (unnamed.length) {
    console.error(`nút chỉ có icon mà không có accessibilityLabel (${unnamed.length}):\n`);
    for (const u of unnamed) console.error(`  ${u}`);
    console.error('');
  }
  if (small.length) {
    console.error(`vùng chạm nhỏ hơn ${MIN_TARGET}pt (${small.length}):\n`);
    for (const s of small) console.error(`  ${s}`);
    console.error('');
  }
  if (headerRows.length) {
    console.error(`dãy icon không nhãn trong header (${headerRows.length}):\n`);
    for (const h of headerRows) console.error(`  ${h}`);
    console.error('');
  }
  if (shortLabelled.length) {
    console.error(`chiều cao vùng chạm dưới ${MIN_TARGET}pt (${shortLabelled.length}) — các control rộng theo flex, trước đây bị bỏ qua vì không có width cố định:\n`);
    for (const s of shortLabelled) console.error(`  ${s}`);
    console.error('');
  }
  if (conditional.length) {
    console.error(`nhãn phụ thuộc điều kiện (${conditional.length}) — điểm mù mà chính file này ghi ra:\n`);
    for (const c of conditional) console.error(`  ${c}`);
    console.error('');
  }
  console.error('dùng <IconButton> — nó ép nhãn và tự tính hitSlop. Xem tools/tap-targets.mjs');
  process.exit(1);
}

console.log(
  `vùng chạm OK — mọi nút icon đều có nhãn, không vùng chạm nào dưới ${MIN_TARGET}pt, ` +
    `${CONDITIONAL_LABEL.length} nút lưu có nhãn cố định (nhánh đang gửi/đã xong không có chữ nào để đọc), ` +
    'toast đọc được nội dung lên cho trình đọc màn hình, ' +
    'các control rộng theo flex (segment, hàng, pill) cũng được đo chiều cao — trước đây chúng bị bỏ qua vì không có width cố định — ' +
    'và không header nào vẽ một dãy icon không chữ',
);
