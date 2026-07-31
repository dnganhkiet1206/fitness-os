import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Protein, carbs, fat and fibre, drawn.
 *
 * Not `lucide` picks. The set has no drumstick, no wheat ear and no avocado,
 * so a macro row built from it ends up as four abstractions — a flame, a
 * droplet, a leaf, a circle — that have to be learned before they mean
 * anything. These are the foods themselves, which do not.
 *
 * ── how they are drawn ──
 *
 * On a 24-unit box, one silhouette each, one accent stroke each, and nothing
 * else. They sit at 14–16 points beside a label, which is a size where a third
 * detail is a smudge — the same reason the wardrobe's trainers are a wedge and
 * a sole and no laces.
 *
 * They take `color` and paint the silhouette with it, so each one inherits the
 * macro's own colour from the card rather than carrying a palette of its own.
 * The accent is drawn in the background colour at partial opacity, so it reads
 * as a cut *into* the shape at any tint — a second hard-coded colour would fight
 * whatever the caller passed.
 *
 * ── they are `<Svg>`, not `Icon` ──
 *
 * `Icon` wraps a `lucide` component and takes one. These take the same props it
 * does — `size`, `color` — so swapping one for the other at a call site is a
 * one-word change, but they are their own SVG because there is nothing to wrap.
 */

interface MacroIconProps {
  size?: number;
  color?: string;
  /** what the accent cuts through to — the surface behind the icon */
  cut?: string;
}

const BOX = 24;

/**
 * A drumstick — one round mass and one bone, and nothing else.
 *
 * The first version built the meat out of two overlapping curves with a wedge
 * of shadow between them. At 96 points that was a piece of chicken; at 14 it
 * was a spanner. A circle is not a subtler drawing than those two curves — it
 * is the only one of the three that survives being small.
 */
export function ProteinIcon({ size = 16, color = '#fff', cut = '#0b0b0d' }: MacroIconProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
      {/* the bone first, so the meat covers where it enters */}
      <Path d="M11.4 13.2 5.6 19" stroke={color} strokeWidth={3.6} strokeLinecap="round" fill="none" />
      <Circle cx={4.5} cy={18.4} r={2.2} fill={color} />
      <Circle cx={5.7} cy={20.1} r={2.2} fill={color} />
      <Path d="M5.1 18.9 3.5 20.5" stroke={cut} strokeWidth={1} opacity={0.55} strokeLinecap="round" />
      {/* the meat */}
      <Circle cx={15} cy={9} r={6.5} fill={color} />
      <Path d="M12.4 4.5a5 5 0 0 0-2.2 3" stroke={cut} strokeWidth={1.2} opacity={0.32} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/**
 * An ear of wheat: a stalk and four pairs of grains.
 *
 * The rows are written out rather than generated from a list. They were
 * generated, through a template literal with each row's `y` interpolated into
 * the path — so `tools/macro-icons.mjs` pulled out a `d` still containing
 * `${y}`, the browser threw the path away, and the preview showed a bare stalk
 * with no grains on it. The artwork was right; the only thing wrong was that it
 * could not be looked at. Four literal lines cost less than a tool clever
 * enough to evaluate them.
 */
export function CarbIcon({ size = 16, color = '#fff', cut = '#0b0b0d' }: MacroIconProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
      {/* the stalk runs the whole height, so the grains have something to hang
          off rather than floating in pairs */}
      <Path d="M12 3.2 V21" stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <Path d="M12 3.4c-2.6 0-4.3 1.4-4.3 3 0 .5.1 1 .3 1.4 2.6 0 4-1.5 4-3.1 0 1.6 1.4 3.1 4 3.1.2-.4.3-.9.3-1.4 0-1.6-1.7-3-4.3-3z" fill={color} />
      <Path d="M12 7.6c-2.6 0-4.3 1.4-4.3 3 0 .5.1 1 .3 1.4 2.6 0 4-1.5 4-3.1 0 1.6 1.4 3.1 4 3.1.2-.4.3-.9.3-1.4 0-1.6-1.7-3-4.3-3z" fill={color} />
      <Path d="M12 11.8c-2.6 0-4.3 1.4-4.3 3 0 .5.1 1 .3 1.4 2.6 0 4-1.5 4-3.1 0 1.6 1.4 3.1 4 3.1.2-.4.3-.9.3-1.4 0-1.6-1.7-3-4.3-3z" fill={color} />
      <Path d="M12 16c-2.6 0-4.3 1.4-4.3 3 0 .5.1 1 .3 1.4 2.6 0 4-1.5 4-3.1 0 1.6 1.4 3.1 4 3.1.2-.4.3-.9.3-1.4 0-1.6-1.7-3-4.3-3z" fill={color} />
      <Path d="M12 6 V19" stroke={cut} strokeWidth={0.8} opacity={0.35} fill="none" />
    </Svg>
  );
}

/**
 * An avocado: half, with the stone.
 *
 * Not a droplet. A droplet is oil and would be right, except this app already
 * spends one on water — two droplets in the same column of numbers is one
 * droplet too many.
 */
export function FatIcon({ size = 16, color = '#fff', cut = '#0b0b0d' }: MacroIconProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
      {/* Wide at the bottom. The first one was nine units across and came out
          as a peanut with a hole in it — a pear has to be visibly *pear*-shaped
          or it is a blob, and at this size the difference is three units. */}
      <Path
        d="M12 2.4c2.6 0 4.6 2 4.6 4.4 0 1.4-.7 2.4-.7 3.5 0 1.6 2.6 2.7 2.6 6 0 3.5-2.9 6.1-6.5 6.1s-6.5-2.6-6.5-6.1c0-3.3 2.6-4.4 2.6-6 0-1.1-.7-2.1-.7-3.5 0-2.4 2-4.4 4.6-4.4z"
        fill={color}
      />
      <Circle cx={12} cy={16.3} r={3.2} fill={cut} opacity={0.5} />
    </Svg>
  );
}

/** broccoli: a head of three florets on a stem */
export function FiberIcon({ size = 16, color = '#fff', cut = '#0b0b0d' }: MacroIconProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
      <Path
        d="M12 2.3c1.7 0 3.1 1 3.6 2.4 1.9-.3 3.6 1.1 3.6 3 0 1.3-.8 2.4-2 2.9v.6c0 .8-.7 1.5-1.5 1.5h-7.4c-.8 0-1.5-.7-1.5-1.5v-.6c-1.2-.5-2-1.6-2-2.9 0-1.9 1.7-3.3 3.6-3 .5-1.4 1.9-2.4 3.6-2.4z"
        fill={color}
      />
      {/* the stem, and the two leaves that stop it reading as a mushroom */}
      <Path d="M12 12.8 V21" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <Path
        d="M12 16.4c-1.4-1.6-3-1.9-4-1.7.2 1.4 1.4 2.9 4 3.1M12 18.4c1.4-1.6 3-1.9 4-1.7-.2 1.4-1.4 2.9-4 3.1"
        fill={color}
        opacity={0.75}
      />
      <Path
        d="M9.4 6.2c.6-.6 1.4-1 2.6-1M14.9 8.4c.7.2 1.3.7 1.7 1.3"
        stroke={cut}
        strokeWidth={0.9}
        opacity={0.4}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/** by macro key, for callers that iterate rather than name them */
export const MACRO_ICON = {
  protein: ProteinIcon,
  carbs: CarbIcon,
  fat: FatIcon,
  fiber: FiberIcon,
} as const;
