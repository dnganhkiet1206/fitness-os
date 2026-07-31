import { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { CURTAIN } from '@/components/ascnd/shop/shop-plan';
import { C } from '@/components/ascnd/studio/palette';
import { WARDROBE_INNER } from '@/components/ascnd/studio/wardrobe';

/**
 * What a fitting room is made of.
 *
 * Everything here is drawn in the room's own coordinates or from its own
 * top-left, and everything obeys the same two rules the studio obeys: depth
 * comes from a contact shadow rather than an outline, and the warm edge on a
 * prop faces whichever light is nearest it.
 *
 * There are two lights. The lamp hangs over the podium at x 195, and the
 * wardrobe lights its own inside. The wardrobe used to be lit by a pair of
 * pucks on the wall above it, which stopped working the moment the drape became
 * the whole wall: a ceiling fixture floating in front of a curtain has nothing
 * to be mounted on. A lit display cabinet needs no ceiling and is what a shop
 * would have anyway.
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
      {/* The rod runs wall to wall, and its finials sit *inside* the room. They
          used to be twelve units past each end, which was fine when the drape
          was a panel in the middle of a wider room and put both of them off the
          artboard the moment it became the wall itself. */}
      <Rect
        x={CURTAIN.x0}
        y={CURTAIN.rod - 3}
        width={CURTAIN.x1 - CURTAIN.x0}
        height={5}
        rx={2.5}
        fill={C.secondary}
      />
      <Path
        d={`M ${CURTAIN.x0} ${CURTAIN.rod - 3} L ${CURTAIN.x1} ${CURTAIN.rod - 3}`}
        stroke={C.highlight}
        strokeWidth={1}
        opacity={0.3}
      />
      <Circle cx={CURTAIN.x0 + 7} cy={CURTAIN.rod - 0.5} r={4} fill={C.highlight} opacity={0.55} />
      <Circle cx={CURTAIN.x1 - 7} cy={CURTAIN.rod - 0.5} r={4} fill={C.highlight} opacity={0.55} />
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
          <Stop offset="0" stopColor={C.soft} stopOpacity={0.42} />
          <Stop offset="0.45" stopColor={C.white} stopOpacity={0.2} />
          <Stop offset="1" stopColor={C.accent} stopOpacity={0.26} />
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
 * The light inside the wardrobe.
 *
 * Drawn over the carcass's own interior path, in the room's coordinates, and
 * drawn *after* the vignette — a glow painted under the thing that darkens the
 * room is a glow that has already been darkened. Brightest at the arch and
 * falling away down the back panel, because a cabinet light is at the top of
 * the cabinet.
 */
export function ClosetGlow({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${scale})`}>
      <Defs>
        <LinearGradient id="shopClosetLit" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.highlight} stopOpacity={0.2} />
          <Stop offset="0.35" stopColor={C.highlight} stopOpacity={0.08} />
          <Stop offset="1" stopColor={C.highlight} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      <Path d={WARDROBE_INNER} fill="url(#shopClosetLit)" />
      {/* the strip itself, tucked under the arch */}
      <Rect x={30} y={30} width={108} height={2.6} rx={1.3} fill={C.highlight} opacity={0.7} />
    </G>
  );
}
