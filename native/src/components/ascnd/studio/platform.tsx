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
 */
const CX = STAGE_MARK.x;
const CY = STAGE_MARK.y;
const RX = 136;
const RY = 68;
const DEPTH = 22;

export function Platform() {
  return (
    <>
      <Defs>
        <RadialGradient id="studioPool" cx="50%" cy="42%" r="62%">
          <Stop offset="0" stopColor={C.highlight} stopOpacity={0.1} />
          <Stop offset="1" stopColor={C.highlight} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* 1 — the floor takes the weight */}
      <Ellipse cx={CX} cy={CY + 22} rx={RX + 32} ry={RY + 4} fill={C.shadow} />

      {/* 2 — the cylinder: one side wall, one top face */}
      <Path
        d={`M ${CX - RX} ${CY} L ${CX - RX} ${CY + DEPTH}
            A ${RX} ${RY} 0 0 0 ${CX + RX} ${CY + DEPTH}
            L ${CX + RX} ${CY} A ${RX} ${RY} 0 0 1 ${CX - RX} ${CY} Z`}
        fill={C.primary}
      />
      <Ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill={C.secondary} />
      <Ellipse cx={CX} cy={CY} rx={RX - 12} ry={RY - 8} fill={C.bgBottom} />
      {/* the lamp lands here — a pool, not a highlight */}
      <Ellipse cx={CX} cy={CY} rx={RX - 12} ry={RY - 8} fill="url(#studioPool)" />

      {/* 3 — the ring, glow first */}
      <Ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke={C.highlight} strokeWidth={14} opacity={0.2} />
      <Ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke={C.highlight} strokeWidth={5} />
    </>
  );
}
