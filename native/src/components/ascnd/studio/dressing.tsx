import { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { ANNEX_W, ROOM_W, SCENE_H } from '@/components/ascnd/shop/shop-camera';
import { HORIZON } from '@/components/ascnd/studio/floor';
import { C } from '@/components/ascnd/studio/palette';
import { Wardrobe, WARDROBE_H, WARDROBE_W } from '@/components/ascnd/studio/wardrobe';

/**
 * The dressing room, next door to the stage.
 *
 * It is drawn **in the scene's own coordinates**, starting where the Mascot
 * Room ends, because the two are one room and not two pictures side by side.
 * The wall gradient, the floor line and the skirting all continue across the
 * join; a viewer panning from the podium to the wardrobe should never find a
 * seam, which is the only reason the camera idea is worth anything.
 *
 * ── what is in it ──
 *
 * A wardrobe, a full-length mirror, a rail with two spare things on it, a
 * changing stool and a rug. Nothing that duplicates the studio: no lamp (the
 * studio's is the room's one light source and this end is lit by what reaches
 * it), no window, no plant, no equipment. A second room that repeats the first
 * room's furniture reads as a copy rather than as another part of the same
 * flat.
 *
 * ── the light ──
 *
 * The studio's lamp hangs over the podium at x 195, so this end is *away* from
 * it. Everything here is a step darker than its equivalent on the stage side,
 * and the warm edge lines all face left, back toward the lamp. The mirror is
 * the one bright thing, because a mirror at the dark end of a room is exactly
 * what catches the light from the lit end.
 */

const X0 = ROOM_W;
const X1 = ROOM_W + ANNEX_W;
/** the floor line — imported, never guessed; see `HORIZON` in `floor.tsx` */
const FLOOR = HORIZON;

export function DressingRoom() {
  return (
    <G>
      <Defs>
        <LinearGradient id="dressWall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.bgTop} />
          <Stop offset="1" stopColor={C.bgBottom} />
        </LinearGradient>
        {/* what little of the studio's lamp reaches this far, coming from the
            left — the annex has no light of its own */}
        <LinearGradient id="dressSpill" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.highlight} stopOpacity={0.075} />
          <Stop offset="1" stopColor={C.highlight} stopOpacity={0} />
        </LinearGradient>
        {/* The studio's vignette ends on `edge` at x = 390, so the annex has
            to *start* there and open out, or the join is a step from black to
            lit. It closes again at the far wall, which is what keeps the
            dressing room feeling like the dark end of one room rather than a
            second lit room. */}
        <LinearGradient id="dressVig" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.edge} stopOpacity={0.95} />
          <Stop offset="0.3" stopColor={C.edge} stopOpacity={0.2} />
          <Stop offset="0.82" stopColor={C.edge} stopOpacity={0.3} />
          <Stop offset="1" stopColor={C.edge} stopOpacity={0.8} />
        </LinearGradient>
        <LinearGradient id="dressGlass" x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor={C.soft} stopOpacity={0.3} />
          <Stop offset="0.45" stopColor={C.white} stopOpacity={0.12} />
          <Stop offset="1" stopColor={C.accent} stopOpacity={0.18} />
        </LinearGradient>
      </Defs>

      {/* wall and floor, continuing the studio's own */}
      <Rect x={X0} y={0} width={ANNEX_W} height={SCENE_H} fill="url(#dressWall)" />
      {/* the studio's own floor paint, by id — an `objectBoundingBox` gradient
          ramps to each shape's own box, so the same two fills over the same
          band give the annex a floor identical to the room's */}
      <Rect x={X0} y={FLOOR} width={ANNEX_W} height={SCENE_H - FLOOR} fill="url(#studioFloor)" />
      <Rect x={X0} y={FLOOR} width={ANNEX_W} height={SCENE_H - FLOOR} fill="url(#studioFloorTint)" />
      <Rect x={X0} y={0} width={130} height={SCENE_H} fill="url(#dressSpill)" />
      {/* the skirting is what actually sells the join: one unbroken line */}
      <Rect x={X0 - 40} y={FLOOR - 4} width={ANNEX_W + 40} height={4} fill={C.primary} opacity={0.8} />

      {/* the rail, on the wall by the join */}
      <Rail x={X0 + 34} y={176} />

      {/* the mirror — the bright thing at the dark end */}
      <Mirror x={X0 + 32} y={FLOOR} />

      {/* the wardrobe, against the far wall */}
      <G transform={`translate(${X1 - WARDROBE_W * 0.94 - 18} ${FLOOR - WARDROBE_H * 0.94}) scale(0.94)`}>
        <Wardrobe />
      </G>

      <Stool x={X0 + 116} y={FLOOR} />

      {/* the rug both of them stand on */}
      <Ellipse cx={X0 + 96} cy={FLOOR + 26} rx={92} ry={20} fill={C.accent} opacity={0.16} />
      <Ellipse
        cx={X0 + 96}
        cy={FLOOR + 26}
        rx={92}
        ry={20}
        fill="none"
        stroke={C.soft}
        strokeWidth={1.2}
        opacity={0.22}
      />

      {/* last: the ambient, over everything this end holds */}
      <Rect x={X0} y={0} width={ANNEX_W} height={SCENE_H} fill="url(#dressVig)" />
    </G>
  );
}

/**
 * A full-length mirror on a stand.
 *
 * The glass is a gradient rather than a reflection: a real reflection means
 * drawing the room twice, and at this size what reads as a mirror is a bright
 * slab with a hard diagonal across it. The diagonal is the whole illusion.
 */
function Mirror({ x, y }: { x: number; y: number }) {
  const w = 62;
  const h = 148;
  return (
    <G transform={`translate(${x} ${y})`}>
      <Ellipse cx={w / 2} cy={2} rx={w * 0.6} ry={6} fill={C.shadow} opacity={0.34} />
      {/* the frame, and its foot */}
      <Rect x={0} y={-h} width={w} height={h} rx={w / 2} fill={C.secondary} />
      <Rect x={5} y={-h + 5} width={w - 10} height={h - 12} rx={(w - 10) / 2} fill="url(#dressGlass)" />
      {/* the one hard diagonal that says "glass" */}
      <Path
        d={`M 8 ${-h + 58} L ${w - 8} ${-h + 14} L ${w - 8} ${-h + 34} L 8 ${-h + 78} Z`}
        fill={C.white}
        opacity={0.16}
      />
      {/* the warm edge on the frame's crown, facing back toward the studio's
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
function Rail({ x, y }: { x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      <Rect x={0} y={0} width={96} height={2.6} rx={1.3} fill={C.soft} opacity={0.4} />
      {[18, 62].map((hx, i) => (
        <G key={hx} transform={`translate(${hx} 1)`}>
          <Path
            d="M 0 0 Q 0 -4 3 -4 M 0 1 L -9 8 M 0 1 L 9 8 M -9 8 L 9 8"
            stroke={C.soft}
            strokeWidth={1.1}
            strokeLinecap="round"
            fill="none"
            opacity={0.6}
          />
          <Path
            d="M -8 8 Q -12 10 -13 14 L -14 24 L -9 26 L -9 40 Q 0 43 9 40 L 9 26 L 14 24 L 13 14 Q 12 10 8 8 L 4 7 Q 0 11 -4 7 Z"
            fill={i === 0 ? C.accent : C.secondary}
            opacity={0.9}
          />
        </G>
      ))}
    </G>
  );
}

/** the stool you sit on to put shoes on */
function Stool({ x, y }: { x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      <Ellipse cx={0} cy={0} rx={22} ry={5} fill={C.shadow} opacity={0.3} />
      <Path d="M -14 -2 L -10 -22 M 14 -2 L 10 -22" stroke={C.primary} strokeWidth={3.4} strokeLinecap="round" fill="none" />
      <Ellipse cx={0} cy={-24} rx={19} ry={7} fill={C.accent} opacity={0.85} />
      <Ellipse cx={0} cy={-26} rx={19} ry={7} fill={C.soft} opacity={0.5} />
      <Circle cx={-6} cy={-27} r={2.4} fill={C.white} opacity={0.18} />
    </G>
  );
}
