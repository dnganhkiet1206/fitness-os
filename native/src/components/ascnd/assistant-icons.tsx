import { useId } from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * The assistant screen's own glyphs.
 *
 * ── why these are not `lucide` ──
 *
 * Lucide is a uniform 2pt outline set, and an outline has almost no surface.
 * On this screen every icon sits on glass and is supposed to *light* the panel
 * it sits on — a hairline stroke has nothing for that light to come from, so
 * the tint under it reads as a coloured smudge with an unrelated wire drawing
 * on top.
 *
 * These are solid, and each one carries a two-stop gradient running the same
 * way as the room's key light: bright at the upper left, saturated toward the
 * lower right. That is the same diagonal `GlassCard` lights its face along, so
 * an icon and the card under it agree about where the light is.
 *
 * ── the shapes are drawn, not traced ──
 *
 * Every path here is written by hand on a 24 grid. Three of them were wrong the
 * first time and the render caught them: `spark`'s second star landed outside
 * its own bounds, and the gear was unusable enough that it became the sliders
 * glyph the reference actually uses. The sliders' knobs are solid discs rather
 * than rings, because a ring drawn with `evenodd` over the bar it sits on turns
 * the overlap into a hole — the bar showed *through* the knob.
 */

export type GlyphName =
  | 'heart'
  | 'moon'
  | 'flame'
  | 'bolt'
  | 'leaf'
  | 'pulse'
  | 'spark'
  | 'gauge'
  | 'sliders'
  | 'arrow'
  | 'camera'
  | 'home';

const disc = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const bar = (y: number) =>
  `M4.1 ${y - 1.15}h15.8a1.15 1.15 0 0 1 0 2.3H4.1a1.15 1.15 0 0 1 0-2.3Z`;

const PATHS: Record<GlyphName, string> = {
  heart:
    'M12 21.2C12 21.2 2.8 14.6 2.8 8.9 2.8 6.1 5 3.9 7.8 3.9c1.8 0 3.3 1 4.2 2.3.9-1.4 2.4-2.3 4.2-2.3 2.8 0 5 2.2 5 5 0 5.7-9.2 12.3-9.2 12.3Z',
  moon: 'M21 14.7A9.1 9.1 0 0 1 9.3 3a9.1 9.1 0 1 0 11.7 11.7Z',
  flame:
    'M12 22.3c4 0 7.2-2.9 7.2-6.7 0-4.8-4.4-6.6-5.4-11.9-.1-.7-.9-.9-1.3-.4-2.3 2.2-3.8 4.8-3.8 7 0 .9.2 1.8.5 2.5-1-.3-1.9-1.1-2.3-2.2-.2-.5-.9-.6-1.3-.1a8.2 8.2 0 0 0-1.8 5.1c0 3.8 3.2 6.7 7.2 6.7Z',
  bolt: 'M13.6 1.9 5.4 13.5c-.35.5 0 1.2.65 1.2h4.2l-1 7.3c-.1.75.9 1.1 1.3.5l8.2-11.6c.35-.5 0-1.2-.65-1.2h-4.2l1-7.3c.1-.75-.9-1.1-1.3-.5Z',
  leaf: 'M21.3 2.9c-10.2 0-16 4.6-16 11.4 0 1.6.35 3 1 4.2l-2.6 2.6a1.1 1.1 0 0 0 1.55 1.55l2.6-2.6c1.2.65 2.6 1 4.2 1 6.8 0 9.6-5.8 9.6-16 0-1.2-.15-2.15-.35-2.15Z',
  pulse:
    'M2.9 12.9a1.15 1.15 0 0 1 0-2.3h3.4l2.6-6.4c.4-1 1.85-.95 2.2.07l3.5 10.4 1.75-3.9c.2-.42.6-.68 1.05-.68h3.7a1.15 1.15 0 0 1 0 2.3h-3l-2.7 6c-.42.95-1.8.9-2.15-.08L9.75 8.2l-1.6 3.95c-.18.44-.6.73-1.07.73Z',
  spark:
    'M10.2 2.2c.42 0 .78.28.9.68l1.15 3.75 3.75 1.15a.94.94 0 0 1 0 1.8l-3.75 1.15-1.15 3.75a.94.94 0 0 1-1.8 0L8.15 10.73 4.4 9.58a.94.94 0 0 1 0-1.8l3.75-1.15L9.3 2.88c.12-.4.48-.68.9-.68ZM17.8 13.4c.34 0 .64.23.74.55l.52 1.6 1.6.52a.78.78 0 0 1 0 1.48l-1.6.52-.52 1.6a.78.78 0 0 1-1.48 0l-.52-1.6-1.6-.52a.78.78 0 0 1 0-1.48l1.6-.52.52-1.6c.1-.32.4-.55.74-.55Z',
  gauge:
    'M12 3.2A9.6 9.6 0 0 0 3.4 17.1a1.4 1.4 0 0 0 2.5-1.3 6.8 6.8 0 1 1 12.2 0 1.4 1.4 0 0 0 2.5 1.3A9.6 9.6 0 0 0 12 3.2Zm3.6 4.6-4.5 3.3a2 2 0 1 0 2.1 2.1l3.3-4.5a.6.6 0 0 0-.9-.9Z',
  sliders:
    bar(6.4) + bar(12) + bar(17.6) + disc(15.2, 6.4, 3.05) + disc(8.4, 12, 3.05) + disc(16.4, 17.6, 3.05),
  /* Body plus a lens punched through it. The lens is a second subpath and the
     glyph is drawn `evenodd`, so the hole shows the card's glass rather than a
     disc of some background colour that would only be right on one screen. */
  camera:
    'M4.4 6.5h3.05l1.1-1.95c.3-.53.87-.85 1.48-.85h4.24c.61 0 1.18.32 1.48.85l1.1 1.95H19.6A2.4 2.4 0 0 1 22 8.9v8.7a2.4 2.4 0 0 1-2.4 2.4H4.4A2.4 2.4 0 0 1 2 17.6V8.9a2.4 2.4 0 0 1 2.4-2.4ZM8.6 13.4a3.4 3.4 0 1 0 6.8 0 3.4 3.4 0 1 0-6.8 0Z',
  home:
    'M11.06 2.98a1.5 1.5 0 0 1 1.88 0l7.5 6.02c.36.28.56.71.56 1.17V19.2a2.4 2.4 0 0 1-2.4 2.4h-3.7v-5.5a1.2 1.2 0 0 0-1.2-1.2h-3.4a1.2 1.2 0 0 0-1.2 1.2v5.5H5.4A2.4 2.4 0 0 1 3 19.2v-9.03c0-.46.2-.89.56-1.17Z',
  arrow:
    'M12 3.4c.3 0 .6.12.82.34l6.3 6.3a1.16 1.16 0 0 1-1.64 1.64L13.16 7.4V19.4a1.16 1.16 0 0 1-2.32 0V7.4l-4.32 4.28A1.16 1.16 0 0 1 4.88 10l6.3-6.26c.22-.22.52-.34.82-.34Z',
};

/**
 * Each glyph's two stops: a pale highlight and the colour it is known by.
 *
 * The second value is the one the card's glass picks up, so these are the
 * app's own palette entries rather than free choices — a tile tinted a colour
 * that appears nowhere else would be a fifth accent nobody agreed to.
 */
export const GLYPH_TINT: Record<GlyphName, readonly [string, string]> = {
  heart: ['#ff8fa8', '#ff3b5c'],
  moon: ['#d9c4ff', '#8b5cff'],
  flame: ['#ffd08a', '#ff9130'],
  bolt: ['#fff0a8', '#ffd93d'],
  leaf: ['#a8ffd9', '#2bf5a8'],
  pulse: ['#a8d4ff', '#3ba6ff'],
  spark: ['#e0c4ff', '#b45cff'],
  gauge: ['#a8ffd9', '#2bf5a8'],
  sliders: ['#e8e8ee', '#a8afbd'],
  arrow: ['#ffffff', '#c8ccd4'],
  camera: ['#ffd08a', '#ff9130'],
  home: ['#f2f3f6', '#a8afbd'],
};

/** Glyphs whose shape needs a hole punched through it. */
const EVENODD: Partial<Record<GlyphName, true>> = { camera: true };

/**
 * `useId` on every gradient, without exception.
 *
 * SVG ids are document-global on native rather than scoped to the `<Svg>` they
 * are written in, and this set renders eight times on one screen. Hardcoded
 * ids would mean the first heart's gradient painting every glyph after it.
 * This has cost the project three separate debugging sessions in other
 * components.
 */
export function Glyph({
  name,
  size = 22,
  colour,
}: {
  name: GlyphName;
  size?: number;
  /** override the gradient with a flat colour — used where the tint is carried elsewhere */
  colour?: string;
}) {
  const uid = useId();
  const id = `gl-${name}-${uid}`;
  const [from, to] = GLYPH_TINT[name];

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {colour ? null : (
        <Defs>
          <LinearGradient id={id} x1="0.15" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
      )}
      <Path
        d={PATHS[name]}
        fill={colour ?? `url(#${id})`}
        fillRule={EVENODD[name] ? 'evenodd' : 'nonzero'}
      />
    </Svg>
  );
}
