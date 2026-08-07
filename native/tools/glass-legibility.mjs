/**
 * That you can still read the two assistant screens.
 *
 * ── why a tool, when the palette already has a comment ──
 *
 * Everywhere else in the app, secondary text sits on a card: `colors.card`,
 * dark, opaque, identical on every screen. `mutedForeground` was chosen against
 * that surface and its own comment records the measurement — 4.71:1 — along
 * with the warning that eyeballing is how it previously arrived at 3.39.
 *
 * The Health Assistant and the AI Coach have no card. `LiquidGlass` samples a
 * drifting aura, so the surface under a caption is brighter than a card, tinted
 * a different colour on every panel, and never the same twice. `#828282` lands
 * at **2.57:1** there — below even the 3:1 asked of large text. It showed as
 * the label under each metric fading into its own tile.
 *
 * `colors.glassMuted` is the answer, and this checks that it stays one. Three
 * separate things can silently invalidate it, none of them in the palette file:
 *
 *   - **the aura gets brighter.** Pool peaks live in `assistant-aura.tsx` and
 *     have already been tuned four times across this project. Raise them and
 *     every caption on both screens loses contrast, with nothing to say so.
 *   - **the glass gets lighter.** The white fill, the lit face and the tint
 *     wash all add luminance, and all three live in `liquid-glass.tsx`.
 *   - **someone reaches for `mutedForeground`.** It is the app's normal
 *     secondary colour and the obvious thing to type. On these two screens it
 *     is the wrong one.
 *
 * So this does not trust the constant. It **recomputes** the worst surface the
 * aura and the glass can produce, from their own source, and requires the text
 * colours to clear AA against it.
 *
 * ── the arithmetic is deliberately pessimistic ──
 *
 * `BlurView` is a real `UIVisualEffectView` with a dark material, and it only
 * ever *darkens* the result. It is left out of the model entirely, so every
 * number here is brighter than the phone will be — which is the safe direction
 * for light text on a dark screen.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

const chan = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const lum = (hex) => {
  const [r, g, b] = chan(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (fg, alpha, bg) => {
  const f = chan(fg);
  const b = chan(bg);
  return '#' + f.map((c, i) => Math.round((c * alpha + b[i] * (1 - alpha)) * 255).toString(16).padStart(2, '0')).join('');
};

/** WCAG 2.1 SC 1.4.3 for text below 18pt, which is every caption on both screens. */
const AA = 4.5;

const problems = [];

// ── read the room out of its own source ──
const aura = read('src/components/ascnd/assistant-aura.tsx');
const glassSrc = read('src/components/ascnd/liquid-glass.tsx');
const palette = read('src/constants/ascnd.ts');

const pools = [...aura.matchAll(/colour: (?:colors\.(\w+)|'(#[0-9a-fA-F]{6})'), peak: ([\d.]+)/g)].map((m) => ({
  named: m[1],
  hex: m[2],
  peak: Number(m[3]),
}));
const hexOf = (name) => palette.match(new RegExp(`${name}: '(#[0-9a-fA-F]{6})'`))?.[1];
for (const p of pools) if (!p.hex) p.hex = hexOf(p.named);

const pageBg = hexOf('background');
const fg = hexOf('foreground');
const glassMuted = hexOf('glassMuted');
const muted = hexOf('mutedForeground');

const fill = Number(glassSrc.match(/backgroundColor: 'rgba\(255,255,255,([\d.]+)\)'/)?.[1]);
const lit = Number(glassSrc.match(/id=\{lit\}[\s\S]*?stopOpacity=\{([\d.]+)\}/)?.[1]);
const wash = Number(glassSrc.match(/id=\{wash\}[\s\S]*?stopOpacity=\{([\d.]+)\}/)?.[1]);

if (pools.length < 4 || !pageBg || !fg || !glassMuted || ![fill, lit, wash].every(Number.isFinite)) {
  console.log(
    'không đọc được thông số phòng — aura/liquid-glass/bảng màu đã đổi hình dạng, ' +
      `(pools ${pools.length}, fill ${fill}, lit ${lit}, wash ${wash})`,
  );
  process.exit(1);
}

/**
 * The brightest surface a caption can land on.
 *
 * The brightest pool at its peak, plus the nearest neighbour's tail (0.24 on
 * the shared falloff curve — the pools sit at different centres and never
 * fully overlap), then the glass fill, then the lit face at its bright corner,
 * then the strongest tint any panel passes.
 */
function worstSurface(poolList, { fill: f, lit: l, wash: w }, tints) {
  const sorted = [...poolList].sort((a, b) => b.peak - a.peak);
  let s = pageBg;
  s = over(sorted[0].hex, sorted[0].peak, s);
  if (sorted[1]) s = over(sorted[1].hex, sorted[1].peak * 0.24, s);
  s = over('#ffffff', f, s);
  s = over('#ffffff', l, s);
  let worst = s;
  for (const t of tints) {
    const cand = over(t, w, s);
    if (lum(cand) > lum(worst)) worst = cand;
  }
  return worst;
}

/* Every colour a panel is lit by — the saturated half of each glyph gradient. */
const icons = read('src/components/ascnd/assistant-icons.tsx');
const tints = [...icons.matchAll(/\['#[0-9a-fA-F]{6}', '(#[0-9a-fA-F]{6})'\]/g)].map((m) => m[1]);
if (tints.length < 8) problems.push(`chỉ đọc được ${tints.length} màu tint từ assistant-icons — đáng lẽ phải nhiều hơn`);

const surface = worstSurface(pools, { fill, lit, wash }, tints);

for (const [name, hex] of [['foreground', fg], ['glassMuted', glassMuted]]) {
  const r = contrast(hex, surface);
  if (r < AA) {
    problems.push(
      `${name} ${hex} chỉ đạt ${r.toFixed(2)}:1 trên mặt kính sáng nhất (${surface}) — ` +
        `WCAG cần ${AA}:1. Aura sáng lên hay kính nhạt đi đều gây ra lỗi này.`,
    );
  }
}

/*
  ── the page is not the glass, and the rule has to know the difference ──

  First written as "no `mutedForeground` anywhere in these two files", which
  fired on the assistant's subtitle and its greeting paragraph — and those are
  correct. They sit on the page, not on a panel, and on the bare aura `#828282`
  measures 4.58:1. Banning it there would have pushed two perfectly legible
  paragraphs to a brighter grey for no reason, and flattened the very hierarchy
  the two colours exist to keep.

  So the rule finds each `<LiquidGlass>…</LiquidGlass>` region, collects the
  `styles.X` referenced inside it, and checks only those definitions. That is
  the actual invariant: *text on glass*.
*/
const GLASS_SCREENS = ['src/app/(tabs)/assistant.tsx', 'src/app/ai-coach.tsx'];

/** Style keys referenced anywhere inside a glass panel. */
function stylesOnGlass(src) {
  const keys = new Set();
  // `<LiquidGlass` … its matching close. These never nest on either screen.
  for (const m of src.matchAll(/<LiquidGlass\b[\s\S]*?<\/LiquidGlass>/g)) {
    for (const s of m[0].matchAll(/styles\.(\w+)/g)) keys.add(s[1]);
  }
  return keys;
}

function mutedProblems(files) {
  const bad = [];
  for (const [file, src] of files) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const key of stylesOnGlass(code)) {
      // the style's own definition, up to the closing brace of its object
      const def = code.match(new RegExp(`\\n\\s*${key}: \\{[^}]*\\}`));
      if (def && /colors\.mutedForeground/.test(def[0])) {
        bad.push(
          `${file}: styles.${key} nằm trong <LiquidGlass> nhưng dùng colors.mutedForeground — ` +
            'trên kính màu đó chỉ đạt 2.57:1. Dùng colors.glassMuted.',
        );
      }
    }
  }
  return bad;
}
problems.push(...mutedProblems(GLASS_SCREENS.map((f) => [f, read(f)])));

/*
  And the two-tier split has to stay valid at the other end: `mutedForeground`
  is what the *page* text uses, so if the aura ever brightens enough to break it
  there, raising the captions on glass will not have saved anything.
*/
{
  const bare = over(
    [...pools].sort((a, b) => b.peak - a.peak)[1].hex,
    [...pools].sort((a, b) => b.peak - a.peak)[1].peak * 0.24,
    over([...pools].sort((a, b) => b.peak - a.peak)[0].hex, [...pools].sort((a, b) => b.peak - a.peak)[0].peak, pageBg),
  );
  const r = contrast(muted, bare);
  if (r < AA) {
    problems.push(
      `mutedForeground ${muted} chỉ đạt ${r.toFixed(2)}:1 ngay trên nền aura (${bare}) — ` +
        'chữ trên trang, không phải trên kính, cũng đã hỏng. Aura đang quá sáng.',
    );
  }
}

/**
 * The self-test.
 *
 * Both rules are handed the version they exist to catch. The contrast rule gets
 * the old grey on the same computed surface; the usage rule gets a line of code
 * and then a comment mentioning the same thing, because a check that cannot be
 * documented next to gets deleted by whoever hits it.
 */
/* Shaped like the real files: one style per line, which is what the lookup
   regex anchors on. The first fixture packed them onto one line and the rule
   correctly found nothing — a self-test failing on its own fixture rather than
   on the code, which is the cheap version of the mistake this file exists to
   catch. */
const ON_GLASS = `
  <LiquidGlass style={styles.tile}><Text style={styles.hint}>x</Text></LiquidGlass>
const styles = StyleSheet.create({
  tile: { padding: 4 },
  hint: { color: colors.mutedForeground },
  sub: { color: colors.mutedForeground },
});`;

const selfTest = [
  ['màu cũ trên kính', () => (contrast(muted, surface) < AA ? ['caught'] : [])],
  ['chữ mờ trong LiquidGlass', () => mutedProblems([['x.tsx', ON_GLASS]])],
  ['aura sáng gấp đôi', () => {
    const bright = pools.map((p) => ({ ...p, peak: Math.min(1, p.peak * 3) }));
    const s = worstSurface(bright, { fill, lit, wash }, tints);
    return contrast(glassMuted, s) < AA ? ['caught'] : [];
  }],
];
/* The other half, and the half the first version got wrong: text that is *not*
   on glass must not be flagged, and neither must a comment naming the colour. */
/* Same file, same colour, used on the page instead of on a panel — the
   assistant's subtitle and greeting are exactly this, and `#828282` measures
   4.58:1 on the bare aura, so flagging it would be wrong. */
const OFF_GLASS = `
  <LiquidGlass style={styles.tile}><Text style={styles.ok}>x</Text></LiquidGlass>
  <Text style={styles.sub}>y</Text>
const styles = StyleSheet.create({
  tile: { padding: 4 },
  ok: { color: colors.foreground },
  sub: { color: colors.mutedForeground },
});`;

const quiet = [
  ['chữ mờ ngoài kính', () => mutedProblems([['x.tsx', OFF_GLASS]])],
  ['chú thích nhắc tên màu', () => mutedProblems([['x.tsx', '/* not colors.mutedForeground here */']])],
];

const missed = selfTest.filter(([, fn]) => fn().length === 0).map(([l]) => l);
const noisy = quiet.filter(([, fn]) => fn().length > 0).map(([l]) => l);
if (missed.length || noisy.length) {
  console.log(
    `tự kiểm tra hỏng — ${missed.length ? `không bắt được: ${missed.join(', ')}` : ''}` +
      `${noisy.length ? ` bắt nhầm: ${noisy.join(', ')}` : ''}`,
  );
  process.exit(2);
}

if (problems.length) {
  console.log('đọc trên kính sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `đọc trên kính OK — mặt sáng nhất ${surface} (${pools.length} pool, kính ${fill}/${lit}/${wash}, ${tints.length} tint); ` +
    `foreground ${contrast(fg, surface).toFixed(2)}:1, glassMuted ${contrast(glassMuted, surface).toFixed(2)}:1, ` +
    `cả hai vượt ${AA}:1; màu cũ ${muted} chỉ ${contrast(muted, surface).toFixed(2)}:1 và vẫn bị bắt`,
);
