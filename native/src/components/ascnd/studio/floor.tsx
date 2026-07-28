import { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { C, STAGE_MARK, STUDIO_H, STUDIO_W } from '@/components/ascnd/studio/palette';

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
        <LinearGradient id="studioFloorSide" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.bgTop} stopOpacity={1} />
          <Stop offset="0.46" stopColor={C.bgTop} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={HORIZON} width={STUDIO_W} height={STUDIO_H - HORIZON} fill="url(#studioFloor)" />
      <Rect x={0} y={HORIZON} width={STUDIO_W} height={STUDIO_H - HORIZON} fill="url(#studioFloorSide)" />
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
        <RadialGradient id="studioVig" cx="50%" cy="42%" r="66%">
          <Stop offset="0" stopColor={C.bgTop} stopOpacity={0.02} />
          <Stop offset="0.5" stopColor={C.bgTop} stopOpacity={0.34} />
          <Stop offset="1" stopColor={C.bgTop} stopOpacity={1} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={STUDIO_W} height={STUDIO_H} fill="url(#studioVig)" />
    </>
  );
}

/** what the lamp puts on the ground, and what the ring spills back */
export function FloorLight({ glow = C.highlight, energy = 0.5 }: { glow?: string; energy?: number }) {
  const e = Math.max(0, Math.min(1, energy));
  return (
    <>
      <Ellipse cx={STAGE_MARK.x} cy={STAGE_MARK.y + 4} rx={196} ry={54} fill={C.white} opacity={0.025 + e * 0.03} />
      <Ellipse cx={STAGE_MARK.x} cy={STAGE_MARK.y + 10} rx={182} ry={62} fill={glow} opacity={0.07 + e * 0.06} />
    </>
  );
}
