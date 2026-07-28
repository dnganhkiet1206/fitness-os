import { Defs, Ellipse, LinearGradient, Rect, Stop } from 'react-native-svg';

import { C, STAGE_MARK, STUDIO_H, STUDIO_W } from '@/components/ascnd/studio/palette';

/**
 * The floor, and the line where it meets the wall.
 *
 * Scanning the reference down a clean column finds a tonal step at y≈360
 * and a floor that is *brighter* than the wall on the lit side (+19) and
 * darker on the far left (−14). The first pass had one gradient from top to
 * bottom and measured a step of 2 — so the room had no ground, and every
 * object in it looked stuck to the wall.
 *
 * The floor is not evenly lit either: the reference drops 17 on the far left
 * and gains 19 on the far right, because the lamp and the window are both
 * over that way. A horizontal wedge takes the left back down; a flat band
 * would sit at +7 on both sides, which is what the first attempt did.
 *
 * Two ellipses do the rest: the pool the lamp throws, and the warm spill the
 * podium's ring puts back on the floor.
 */
const HORIZON = 360;

export function Floor({ glow = C.highlight, energy = 0.5 }: { glow?: string; energy?: number }) {
  const e = Math.max(0, Math.min(1, energy));
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
      {/* what the lamp puts on the ground */}
      <Ellipse cx={STAGE_MARK.x} cy={STAGE_MARK.y + 4} rx={196} ry={54} fill={C.white} opacity={0.025 + e * 0.03} />
      {/* and what the ring spills back */}
      <Ellipse cx={STAGE_MARK.x} cy={STAGE_MARK.y + 10} rx={182} ry={62} fill={glow} opacity={0.07 + e * 0.06} />
    </>
  );
}
