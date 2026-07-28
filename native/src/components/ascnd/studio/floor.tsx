import { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { C, SCENE_BOTTOM, STAGE_MARK, STUDIO_H, STUDIO_W } from '@/components/ascnd/studio/palette';

/**
 * The ground, the vignette, and the light on the floor — in three pieces,
 * because they belong at three different depths.
 *
 * Reading tone off the design rather than positions: the room is lit from
 * the middle and everything else falls away. Across the wall it runs
 * 27 · 34 · 47 · 49 · 56 · 52 · 27 from edge to edge, so the props sit only
 * a little above the wall they hang on. The first pass had them at 95–106
 * against a wall of 29–58 — twice as bright as the design, which is why the
 * room read flat and the character stopped being the brightest thing in it.
 *
 * `Vignette` is what fixes that: it goes over the wall and everything
 * standing against it, and under the lamp and the podium, so the light lands
 * on top of a room that has already fallen into shadow.
 */
const HORIZON = 360;

export function FloorPlane() {
  return (
    <>
      <Defs>
        <LinearGradient id="studioFloor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.secondary} stopOpacity={0.95} />
          <Stop offset="0.45" stopColor={C.secondary} stopOpacity={0.38} />
          <Stop offset="1" stopColor={C.secondary} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="studioFloorTint" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.accent} stopOpacity={0.14} />
          <Stop offset="0.12" stopColor={C.accent} stopOpacity={0.06} />
          <Stop offset="0.24" stopColor={C.accent} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="studioFloorSide" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.bgTop} stopOpacity={1} />
          <Stop offset="0.46" stopColor={C.bgTop} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={HORIZON} width={STUDIO_W} height={STUDIO_H - HORIZON} fill="url(#studioFloor)" />
      <Rect x={0} y={HORIZON} width={STUDIO_W} height={STUDIO_H - HORIZON} fill="url(#studioFloorSide)" />
      {/* The design's floor is violet, not the panels' blue: 253 · 29 · 19
          against the 238 · 23 · 13 this came out at. `accent` is hue 251, so
          a thin pass of it turns the ground the right way and lifts it at the
          same time, rather than spending a colour or dragging `secondary` —
          which is also the shelf, the shade and the sign — round with it.

          It fades out downward. Flat, it lifted the two bottom corners from
          25.7 and 32.7 to 29.9 and 36.3 against the design's 25.4 and 25, and
          the corners are the one place the room has to go dark. */}
      <Rect x={0} y={HORIZON} width={STUDIO_W} height={STUDIO_H - HORIZON} fill="url(#studioFloorTint)" />
    </>
  );
}

/**
 * The room falling away from the light.
 *
 * The design's corners sit at 0.61 of its centre; a flat wash would kill the
 * contrast instead of shaping it, so this is radial — nothing in the middle,
 * heavy at the edges — and it is drawn before the lamp so the beam is not
 * dimmed by it.
 */
export function Vignette() {
  return (
    <>
      <Defs>
        <RadialGradient id="studioVig" cx="50%" cy="50%" r="82%">
          <Stop offset="0" stopColor={C.bgTop} stopOpacity={0.02} />
          <Stop offset="0.5" stopColor={C.bgTop} stopOpacity={0.34} />
          <Stop offset="1" stopColor={C.edge} stopOpacity={1} />
        </RadialGradient>
      </Defs>
      {/* `SCENE_BOTTOM`, not `STUDIO_H`. A radial gradient in objectBounding
          units is stretched to its box, so measuring it against the 844pt
          artboard gave it a vertical radius of 557 — the room is 476 tall, so
          its bottom corners sat less than a fifth of the way into the falloff
          and stayed at 30 and 36 while the top two reached 22. In the design
          all four are within three units of each other. */}
      <Rect x={0} y={0} width={STUDIO_W} height={SCENE_BOTTOM} fill="url(#studioVig)" />
    </>
  );
}

/** what the lamp puts on the ground, and what the ring spills back */
export function FloorLight({ glow = C.highlight, energy = 0.5 }: { glow?: string; energy?: number }) {
  const e = Math.max(0, Math.min(1, energy));
  return (
    <>
      {/* `lit`, not white — white here put the floor at 8% saturation
          against the design's 29% while matching its luminance exactly */}
      <Ellipse cx={STAGE_MARK.x} cy={STAGE_MARK.y + 4} rx={150} ry={44} fill={C.lit} opacity={0.34 + e * 0.14} />
      <Ellipse cx={STAGE_MARK.x} cy={STAGE_MARK.y + 10} rx={182} ry={62} fill={glow} opacity={0.045 + e * 0.035} />
    </>
  );
}
