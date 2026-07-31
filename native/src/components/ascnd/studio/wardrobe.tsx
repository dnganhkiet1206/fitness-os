import { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';
import { WARDROBE_H, WARDROBE_W } from '@/components/ascnd/studio/wardrobe-box';

/**
 * The wardrobe Koa changes in.
 *
 * ── what it is not ──
 *
 * **It does not show the inventory.** It would be the obvious thing to do and
 * it is the wrong thing: the shop sells a headband, a cap, sunglasses, a medal
 * and a belt, and a cabinet holding five accessories on rails reads as a
 * display case, not as a wardrobe. What makes furniture read as a wardrobe is
 * *clothes on hangers* — so it holds four plain gym pieces that are nobody's
 * inventory and never change. The grid underneath is where what you own lives.
 *
 * Drawn at the user's direction: "chỉ vẽ một vài bộ đơn giản fitness cho giống
 * tủ đồ".
 *
 * ── how it is drawn ──
 *
 * The room's idiom, not the reference's. The mockup this came from is a soft 3D
 * render in warm wood; the room is flat vector in twelve indigo-and-gold
 * colours, and a photoreal cabinet dropped into it would read as a sticker of a
 * cabinet. So this takes the reference's *structure* — arched carcass, a rail
 * of hanging clothes, a shelf above and a shelf below — and builds it from the
 * same short palette as the shelf, the podium and the window.
 *
 * Depth comes from where the room's lamp is, as it does everywhere else here: a
 * thin `highlight` line along the top and the left edge, and the interior a
 * flat step *lighter* than the carcass. Lighter, not darker, and that took a
 * render to settle — a dark cabinet with a darker inside swallowed the black
 * tank top and the dark shorts whole. The frame is the dark thing here and the
 * back panel is what everything has to read against. No gradients, because at
 * this size a gradient is a slower way to draw a flat colour.
 *
 * Local coordinates, `W × H`, drawn from its own top-left, so the caller
 * places and scales it.
 */

export { WARDROBE_H, WARDROBE_W };

/** the carcass, and the interior cut inside it */
const SHELL =
  'M 4 62 Q 4 14 84 14 Q 164 14 164 62 L 164 182 Q 164 189 157 189 L 11 189 Q 4 189 4 182 Z';
const INNER =
  'M 17 64 Q 17 27 84 27 Q 151 27 151 64 L 151 158 L 17 158 Z';

/**
 * Where the two boards and the hanging rail sit.
 *
 * The interior stops at 158 and a drawer fills the rest. The first version ran
 * the interior to the floor and left forty units of empty box under the
 * trainers — furniture is not usually storage all the way down, and an empty
 * shelf reads as a mistake rather than as room to grow.
 */
const SHELF_TOP = 84;
const RAIL = 100;
const SHELF_LOW = 152;

export function Wardrobe() {
  return (
    <G>
      {/* what it stands on — the same trick the plant pots use: a prop with no
          contact shadow floats, however solid it is drawn */}
      <Ellipse cx={84} cy={192} rx={76} ry={5} fill={C.shadow} opacity={0.3} />

      <Path d={SHELL} fill={C.primary} />
      {/* the lamp is up and to the left of everything in this room */}
      <Path
        d="M 4 62 Q 4 14 84 14 Q 164 14 164 62"
        fill="none"
        stroke={C.highlight}
        strokeWidth={1.4}
        opacity={0.34}
      />
      <Path d={INNER} fill={C.secondary} />

      {/* the knob on the arch, which is most of what says "wardrobe" and not
          "bookcase" — the reference has a hanger badge there and so does this */}
      <Path
        d="M 84 17 L 84 21 M 76 26 L 84 21 L 92 26 M 76 26 L 92 26"
        stroke={C.highlight}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.75}
      />

      {/* ── the top shelf: what goes on a head ── */}
      <Rect x={17} y={SHELF_TOP} width={134} height={4} rx={2} fill={C.primary} />
      <Cap x={48} y={SHELF_TOP} />
      <Headband x={84} y={SHELF_TOP} />
      <Beanie x={120} y={SHELF_TOP} />

      {/* ── the rail: four plain gym pieces ── */}
      <Rect x={22} y={RAIL - 1} width={124} height={2.4} rx={1.2} fill={C.soft} opacity={0.45} />
      <Hanging x={40} y={RAIL}>
        <TankTop tint={C.primary} />
      </Hanging>
      <Hanging x={69} y={RAIL}>
        <Hoodie tint={C.accent} />
      </Hanging>
      <Hanging x={99} y={RAIL}>
        <Tee tint={C.white} />
      </Hanging>
      <Hanging x={127} y={RAIL}>
        <Shorts tint={C.accent} />
      </Hanging>

      {/* ── the bottom shelf: trainers ── */}
      <Rect x={17} y={SHELF_LOW} width={134} height={4} rx={2} fill={C.primary} />
      <Trainer x={52} y={SHELF_LOW} tint={C.soft} />
      <Trainer x={78} y={SHELF_LOW} tint={C.soft} />
      <Trainer x={110} y={SHELF_LOW} tint={C.accent} />
      <Trainer x={136} y={SHELF_LOW} tint={C.accent} />

      {/* the drawer under it — what stops the carcass being a box with a gap */}
      <Rect x={17} y={164} width={134} height={20} rx={4} fill={C.secondary} />
      <Rect x={17} y={164} width={134} height={20} rx={4} fill={C.shadow} opacity={0.22} />
      <Rect x={70} y={172} width={28} height={3.4} rx={1.7} fill={C.soft} opacity={0.55} />

      {/* feet, so it stands rather than sits in the floor */}
      <Rect x={16} y={189} width={12} height={6} rx={2} fill={C.primary} />
      <Rect x={140} y={189} width={12} height={6} rx={2} fill={C.primary} />
    </G>
  );
}

/* ── the clothes ──────────────────────────────────────────────────────── */

/**
 * A hanger, and whatever is on it.
 *
 * The hook and the shoulders are one stroked path: at this size a hanger is
 * three lines, and drawing it as an outline keeps it reading as wire rather
 * than as a solid triangle. The garment hangs from y = 0, which is the rail.
 */
function Hanging({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      <Path
        d="M 0 0 Q 0 -4 3 -4 M 0 1 L -10 9 M 0 1 L 10 9 M -10 9 L 10 9"
        stroke={C.soft}
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
        opacity={0.7}
      />
      <G transform="translate(0 8)">{children}</G>
    </G>
  );
}

/**
 * A tank top: the one piece that is unmistakably gym kit at 24 units across.
 *
 * The armholes are what carry it. A vest without them is a rectangle, and a
 * rectangle on a hanger reads as a towel.
 */
function TankTop({ tint }: { tint: string }) {
  return (
    <>
      <Path
        d="M -9 1 L -5 -4 Q 0 0 5 -4 L 9 1 L 8 6 L 9 27 Q 0 30 -9 27 L -8 6 Z"
        fill={tint}
      />
      <Path d="M -8 8 Q 0 11 8 8" stroke={C.white} strokeWidth={0.8} opacity={0.13} fill="none" />
    </>
  );
}

/** a hoodie — sleeves, a hood, and two drawstrings */
function Hoodie({ tint }: { tint: string }) {
  return (
    <>
      <Path d="M -6 -3 Q 0 -9 6 -3" fill={tint} />
      <Path
        d="M -8 -2 Q -13 0 -14 5 L -16 16 L -10 18 L -10 27 Q 0 30 10 27 L 10 18 L 16 16 L 14 5 Q 13 0 8 -2 L 4 -3 Q 0 1 -4 -3 Z"
        fill={tint}
      />
      <Path d="M -3 1 L -3 8 M 3 1 L 3 8" stroke={C.white} strokeWidth={0.9} opacity={0.4} strokeLinecap="round" fill="none" />
      <Rect x={-6} y={19} width={12} height={5} rx={1.4} fill={C.white} opacity={0.08} />
    </>
  );
}

/** a short-sleeved tee, which is a hoodie with less on it */
function Tee({ tint }: { tint: string }) {
  return (
    <>
      <Path
        d="M -8 -2 Q -12 0 -13 4 L -15 12 L -9 14 L -9 26 Q 0 29 9 26 L 9 14 L 15 12 L 13 4 Q 12 0 8 -2 L 4 -3 Q 0 1 -4 -3 Z"
        fill={tint}
      />
      {/* the room's own mark, the way a gym tee carries a logo */}
      <Circle cx={0} cy={12} r={3.2} fill={C.primary} opacity={0.5} />
    </>
  );
}

/** shorts, on a clip hanger — the leg split is the whole silhouette */
function Shorts({ tint }: { tint: string }) {
  return (
    <>
      <Rect x={-9} y={0} width={18} height={4} rx={1.6} fill={C.soft} opacity={0.5} />
      <Path d="M -9 3 L 9 3 L 8 20 L 1.6 20 L 0 11 L -1.6 20 L -8 20 Z" fill={tint} />
      <Path d="M 6 6 L 6 16" stroke={C.white} strokeWidth={0.8} opacity={0.14} fill="none" />
    </>
  );
}

/* ── the shelves ──────────────────────────────────────────────────────── */

/** a peaked cap, drawn from where it rests */
function Cap({ x, y }: { x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      <Path d="M -8 0 Q -8 -9 0 -9 Q 8 -9 8 0 Z" fill={C.soft} />
      <Path d="M 6 0 Q 15 -0.5 15 2 L 6 2 Z" fill={C.soft} opacity={0.75} />
      <Path d="M 0 -9 L 0 0" stroke={C.primary} strokeWidth={0.7} opacity={0.35} fill="none" />
    </G>
  );
}

/** a headband, rolled and stood on its edge */
function Headband({ x, y }: { x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      <Path d="M -8 0 Q -8 -8 0 -8 Q 8 -8 8 0 Z" fill="none" stroke={C.highlight} strokeWidth={3} opacity={0.8} />
    </G>
  );
}

/** a beanie: a dome with a turned-up brim and a bobble */
function Beanie({ x, y }: { x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      <Path d="M -7 -2 Q -7 -11 0 -11 Q 7 -11 7 -2 Z" fill={C.accent} />
      <Rect x={-8} y={-3} width={16} height={3} rx={1.5} fill={C.accent} opacity={0.7} />
      <Circle cx={0} cy={-12} r={2} fill={C.soft} />
    </G>
  );
}

/**
 * A trainer, from the side.
 *
 * The sole is a separate lighter bar because that is the one feature that
 * survives being drawn 22 units wide — everything else about a shoe at this
 * size is a wedge.
 */
function Trainer({ x, y, tint }: { x: number; y: number; tint: string }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      {/* heel and ankle collar behind, so the shoe has a back to it */}
      <Path d="M -11 -3 Q -12 -13 -6 -14 L -2 -13 L -2 -3 Z" fill={tint} opacity={0.75} />
      {/* the upper: a wedge that rises at the heel and runs out at the toe */}
      <Path d="M -11 -3 Q -11 -11 -4 -11 L 2 -9 Q 8 -7 11 -4 Q 12.5 -3.5 12 -3 Z" fill={tint} />
      <Path d="M -6 -9 L -1 -7 M -4 -11 L 1 -9" stroke={C.white} strokeWidth={0.9} opacity={0.5} strokeLinecap="round" fill="none" />
      {/* the sole — thin, because a thick one is all you see */}
      <Path d="M -12 -3 L 12 -3 Q 13 -3 12.6 -1.4 Q 12 0 9 0 L -10 0 Q -12 0 -12 -1.6 Z" fill={C.white} opacity={0.62} />
    </G>
  );
}
