import { Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';

import { C, STAGE_MARK } from '@/components/ascnd/studio/palette';

/**
 * The podium Koa stands on — three layers, in this order:
 *
 *   1. a wide floor shadow, so the podium sits on something
 *   2. the dark cylinder
 *   3. a golden ring, thin, with one soft pass under it for the glow
 *
 * The glow is a second stroke at low opacity rather than a filter: it stays
 * a vector, and it stops short of the neon look the brief rules out.
 *
 * Sized by scanning the design down the podium's centre line, not by its
 * bounding box: the box takes in the ring's own glow and the warm pool it
 * throws on the floor, which read as 141pt tall and had this ellipse built
 * more than twice as deep as the design's 61.
 */
const CX = STAGE_MARK.x;
const CY = STAGE_MARK.y;
const RX = 137;
const RY = 31;
const DEPTH = 24;

export function Platform({ glow = C.highlight, energy = 0.5 }: { glow?: string; energy?: number }) {
  const lit = 0.16 + Math.max(0, Math.min(1, energy)) * 0.18;
  return (
    <>
      <Defs>
        <RadialGradient id="studioPool" cx="50%" cy="42%" r="62%">
          <Stop offset="0" stopColor={glow} stopOpacity={0.1} />
          <Stop offset="1" stopColor={glow} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* 1 — the floor takes the weight */}
      <Ellipse cx={CX} cy={CY + 24} rx={RX + 32} ry={RY + 16} fill={C.shadow} />

      {/* 2 — the cylinder: one side wall, one top face */}
      <Path
        d={`M ${CX - RX} ${CY} L ${CX - RX} ${CY + DEPTH}
            A ${RX} ${RY} 0 0 0 ${CX + RX} ${CY + DEPTH}
            L ${CX + RX} ${CY} A ${RX} ${RY} 0 0 1 ${CX - RX} ${CY} Z`}
        fill={C.primary}
      />
      <Ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill={C.secondary} />
      {/* a line, not a second disc: filling the middle back in with the
          floor's own colour left the podium reading as a hoop */}
      <Ellipse
        cx={CX}
        cy={CY}
        rx={RX - 14}
        ry={RY - 6}
        fill="none"
        stroke={C.primary}
        strokeWidth={1.4}
        opacity={0.55}
      />
      {/* the lamp lands here — a pool, not a highlight */}
      <Ellipse cx={CX} cy={CY} rx={RX - 12} ry={RY - 5} fill="url(#studioPool)" />

      {/* 3 — the ring, glow first */}
      <Ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke={glow} strokeWidth={22} opacity={lit} />
      <Ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke={glow} strokeWidth={5} />
    </>
  );
}
