import { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { CURTAIN, PUCK_Y } from '@/components/ascnd/shop/shop-plan';
import { C } from '@/components/ascnd/studio/palette';

/**
 * What a fitting room is made of.
 *
 * Everything here is drawn in the room's own coordinates or from its own
 * top-left, and everything obeys the same two rules the studio obeys: depth
 * comes from a contact shadow rather than an outline, and the warm edge on a
 * prop faces whichever light is nearest it. There are two lights in this room —
 * the lamp over the podium at x 195, and the pair of pucks over the wardrobe —
 * so props on the left take their highlight from the left and props in the
 * fitting bay take theirs from above.
 */

/* ── the drape behind the podium ──────────────────────────────────────── */

/**
 * The curtain, which is the single prop that makes this a changing room.
 *
 * Without it the stage bay is a podium against a blank wall, and the argument
 * for putting the wardrobe and the podium in one room falls apart — they look
 * like two rooms again, just without the seam. With it, Koa is standing in
 * front of a fitting-room curtain and the wardrobe down the wall is obviously
 * part of the same place.
 *
 * ── how it is drawn ──
 *
 * A fill, then folds, then a hem, and nothing else. The fill is one horizontal
 * gradient that lifts under the lamp and falls away at both ends, which is what
 * a lit drape does and what nine separate panel shapes would only approximate
 * more expensively.
 *
 * The folds splay: each one leans away from the centre in proportion to how far
 * out it is, because cloth hung from a straight rod hangs plumb at the middle
 * and swings outward at the ends. Drawn parallel they read as a barcode. Each
 * fold is a dark stroke with a thin warm one just inside it — the shadow in the
 * pleat and the light on its near edge, which is the whole of what makes fabric
 * look like fabric at this scale.
 */
const FOLD_GAP = 26;
const FOLDS = Math.round((CURTAIN.x1 - CURTAIN.x0) / FOLD_GAP);
const MID = (CURTAIN.x0 + CURTAIN.x1) / 2;

export function Curtain() {
  const top = CURTAIN.rod + 3;
  const { hem } = CURTAIN;
  return (
    <G>
      <Defs>
        <LinearGradient id="shopDrape" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.primary} />
          <Stop offset="0.26" stopColor={C.primary} />
          <Stop offset="0.5" stopColor={C.secondary} />
          <Stop offset="0.74" stopColor={C.primary} />
          <Stop offset="1" stopColor={C.primary} />
        </LinearGradient>
        {/* the drape is furthest from the lamp at its feet, and cloth pools
            there — the one place it must not fade into the floor */}
        <LinearGradient id="shopDrapeFoot" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.shadow} stopOpacity={0} />
          <Stop offset="1" stopColor={C.shadow} stopOpacity={0.45} />
        </LinearGradient>
        <LinearGradient id="shopDrapeCast" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.shadow} stopOpacity={0.42} />
          <Stop offset="1" stopColor={C.shadow} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      <Rect
        x={CURTAIN.x0}
        y={top}
        width={CURTAIN.x1 - CURTAIN.x0}
        height={hem - top}
        fill="url(#shopDrape)"
      />

      {Array.from({ length: FOLDS - 1 }, (_, i) => {
        const x = CURTAIN.x0 + (i + 1) * ((CURTAIN.x1 - CURTAIN.x0) / FOLDS);
        // plumb at the middle, swinging out at the ends
        const lean = ((x - MID) / (CURTAIN.x1 - MID)) * 9;
        return (
          <G key={x}>
            <Path
              d={`M ${x} ${top} L ${x + lean} ${hem}`}
              stroke={C.shadow}
              strokeWidth={7}
              opacity={0.23}
            />
            <Path
              d={`M ${x + 5} ${top} L ${x + lean + 5} ${hem}`}
              stroke={C.highlight}
              strokeWidth={1.1}
              opacity={0.075}
            />
          </G>
        );
      })}

      <Rect
        x={CURTAIN.x0}
        y={hem - 54}
        width={CURTAIN.x1 - CURTAIN.x0}
        height={54}
        fill="url(#shopDrapeFoot)"
      />
      {/* what the cloth throws onto the floor in front of it. Without this the
          hem was a straight horizontal edge the width of the bay and the drape
          read as a painted flat — the floor started under it rather than the
          cloth ending on it. */}
      <Rect
        x={CURTAIN.x0 - 8}
        y={hem}
        width={CURTAIN.x1 - CURTAIN.x0 + 16}
        height={26}
        fill="url(#shopDrapeCast)"
      />

      {/* the rod, and the two finials that stop it being a pipe */}
      <Rect
        x={CURTAIN.x0 - 12}
        y={CURTAIN.rod - 3}
        width={CURTAIN.x1 - CURTAIN.x0 + 24}
        height={5}
        rx={2.5}
        fill={C.secondary}
      />
      <Path
        d={`M ${CURTAIN.x0 - 12} ${CURTAIN.rod - 3} L ${CURTAIN.x1 + 12} ${CURTAIN.rod - 3}`}
        stroke={C.highlight}
        strokeWidth={1}
        opacity={0.3}
      />
      <Circle cx={CURTAIN.x0 - 13} cy={CURTAIN.rod - 0.5} r={4} fill={C.highlight} opacity={0.55} />
      <Circle cx={CURTAIN.x1 + 13} cy={CURTAIN.rod - 0.5} r={4} fill={C.highlight} opacity={0.55} />
    </G>
  );
}

/* ── the fitting bay ──────────────────────────────────────────────────── */

/**
 * A full-length mirror on a stand.
 *
 * The glass is a gradient rather than a reflection: a real reflection means
 * drawing the room twice, and at this size what reads as a mirror is a bright
 * slab with a hard diagonal across it. The diagonal is the whole illusion.
 *
 * It is the brightest thing in the fitting bay on purpose. A mirror is the one
 * object in a room that is *made* of the light reaching it, so it is what ties
 * this end of the room back to the lamp over the podium.
 */
export function Mirror({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <G transform={`translate(${x} ${y + h})`}>
      <Defs>
        <LinearGradient id="shopGlass" x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor={C.soft} stopOpacity={0.32} />
          <Stop offset="0.45" stopColor={C.white} stopOpacity={0.13} />
          <Stop offset="1" stopColor={C.accent} stopOpacity={0.2} />
        </LinearGradient>
      </Defs>
      <Ellipse cx={w / 2} cy={2} rx={w * 0.6} ry={6} fill={C.shadow} opacity={0.34} />
      <Rect x={0} y={-h} width={w} height={h} rx={w / 2} fill={C.secondary} />
      <Rect x={5} y={-h + 5} width={w - 10} height={h - 12} rx={(w - 10) / 2} fill="url(#shopGlass)" />
      {/* the one hard diagonal that says "glass" */}
      <Path
        d={`M 8 ${-h + 58} L ${w - 8} ${-h + 14} L ${w - 8} ${-h + 34} L 8 ${-h + 78} Z`}
        fill={C.white}
        opacity={0.17}
      />
      {/* the warm edge on the frame's crown, facing back toward the podium's
          lamp. It was a full arc across the glass and read as a halo hovering
          in front of the mirror rather than as light on its rim. */}
      <Path
        d={`M 2 ${-h + 30} A ${w / 2} ${w / 2} 0 0 1 ${w / 2} ${-h + 1}`}
        fill="none"
        stroke={C.highlight}
        strokeWidth={1.3}
        strokeLinecap="round"
        opacity={0.35}
      />
      <Rect x={w / 2 - 14} y={-8} width={28} height={7} rx={3} fill={C.primary} />
    </G>
  );
}

/** a wall rail with two things left on it, so the room looks used */
export function WallRail({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      <Rect x={0} y={0} width={w} height={2.6} rx={1.3} fill={C.soft} opacity={0.4} />
      {[w * 0.28, w * 0.66].map((hx, i) => (
        <G key={hx} transform={`translate(${hx} 1)`}>
          <Path
            d="M 0 0 Q 0 -4 3 -4 M 0 1 L -9 8 M 0 1 L 9 8 M -9 8 L 9 8"
            stroke={C.soft}
            strokeWidth={1.1}
            strokeLinecap="round"
            fill="none"
            opacity={0.6}
          />
          {/* `soft` and `accent`, not `secondary`. The pair used to be one
              bright garment and one in `secondary`, and against this wall the
              second one measured almost nothing — a hanger with a hole under
              it. Both are lit now; they differ in hue, not in whether they
              are visible. */}
          <Path
            d="M -8 8 Q -12 10 -13 14 L -14 24 L -9 26 L -9 40 Q 0 43 9 40 L 9 26 L 14 24 L 13 14 Q 12 10 8 8 L 4 7 Q 0 11 -4 7 Z"
            fill={i === 0 ? C.accent : C.soft}
            opacity={i === 0 ? 0.9 : 0.72}
          />
        </G>
      ))}
    </G>
  );
}

/** the stool you sit on to put shoes on */
export function Stool({ x, y }: { x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      <Ellipse cx={0} cy={0} rx={22} ry={5} fill={C.shadow} opacity={0.3} />
      <Path
        d="M -14 -2 L -10 -22 M 14 -2 L 10 -22"
        stroke={C.primary}
        strokeWidth={3.4}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse cx={0} cy={-24} rx={19} ry={7} fill={C.accent} opacity={0.85} />
      <Ellipse cx={0} cy={-26} rx={19} ry={7} fill={C.soft} opacity={0.5} />
      <Circle cx={-6} cy={-27} r={2.4} fill={C.white} opacity={0.18} />
    </G>
  );
}

/**
 * A puck light over the wardrobe, and the wash it throws down.
 *
 * The room's lamp is at x 195 and the wardrobe is three hundred units away from
 * it, so without these the "Tủ đồ" tab pushes in on the darkest corner of the
 * room. Two small fixtures are also what a shop actually puts over a display
 * unit, which is the reason this looks right rather than merely bright.
 *
 * The wash is a trapezoid under a gradient, the same construction the podium's
 * beam uses — one shape, no filter, and it stays a vector.
 */
export function Puck({ x, reach }: { x: number; reach: number }) {
  return (
    <G>
      <Path
        d={`M ${x - 7} ${PUCK_Y} L ${x + 7} ${PUCK_Y} L ${x + 30} ${PUCK_Y + reach} L ${x - 30} ${PUCK_Y + reach} Z`}
        fill="url(#shopPuck)"
      />
      <Rect x={x - 9} y={PUCK_Y - 9} width={18} height={9} rx={3} fill={C.secondary} />
      <Rect x={x - 10} y={PUCK_Y - 1.5} width={20} height={3} rx={1.5} fill={C.highlight} opacity={0.85} />
    </G>
  );
}

export function PuckDefs() {
  return (
    <Defs>
      <LinearGradient id="shopPuck" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={C.highlight} stopOpacity={0.17} />
        <Stop offset="0.45" stopColor={C.highlight} stopOpacity={0.06} />
        <Stop offset="1" stopColor={C.highlight} stopOpacity={0} />
      </LinearGradient>
    </Defs>
  );
}

/** what the fitting bay stands on */
export function Rug({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  return (
    <G>
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={C.accent} opacity={0.11} />
      <Ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="none"
        stroke={C.soft}
        strokeWidth={1.2}
        opacity={0.22}
      />
      <Ellipse
        cx={cx}
        cy={cy}
        rx={rx - 12}
        ry={ry - 4}
        fill="none"
        stroke={C.soft}
        strokeWidth={0.8}
        opacity={0.14}
      />
    </G>
  );
}
