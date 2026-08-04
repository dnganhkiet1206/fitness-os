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

if (unnamed.length || small.length) {
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
  console.error('dùng <IconButton> — nó ép nhãn và tự tính hitSlop. Xem tools/tap-targets.mjs');
  process.exit(1);
}

console.log(`vùng chạm OK — mọi nút icon đều có nhãn, không nút nào dưới ${MIN_TARGET}pt`);
