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

/** the far half of the rim, and the near half — drawn at different weights */
const FAR = `M ${CX - RX} ${CY} A ${RX} ${RY} 0 0 1 ${CX + RX} ${CY}`;
const NEAR = `M ${CX - RX} ${CY} A ${RX} ${RY} 0 0 0 ${CX + RX} ${CY}`;

export function Platform({ glow = C.highlight, energy = 0.5 }: { glow?: string; energy?: number }) {
  const lit = 0.1 + Math.max(0, Math.min(1, energy)) * 0.12;
  return (
    <>
      <Defs>
        <RadialGradient id="studioPool" cx="50%" cy="28%" r="72%">
          <Stop offset="0" stopColor={glow} stopOpacity={0.08} />
          <Stop offset="0.6" stopColor={glow} stopOpacity={0.07} />
          <Stop offset="1" stopColor={glow} stopOpacity={0.03} />
        </RadialGradient>
        <RadialGradient id="studioCast">
          {CAST_STOPS.map(([o, a]) => (
            <Stop key={o} offset={o} stopColor={C.shadow} stopOpacity={a} />
          ))}
        </RadialGradient>
      </Defs>

      {/* 1 — the floor takes the weight */}
      <Ellipse cx={CX} cy={CY + 24} rx={RX + 32} ry={RY + 16} fill={C.shadow} opacity={0.18} />

      {/* 2 — the cylinder: one side wall, one top face */}
      <Path
        d={`M ${CX - RX} ${CY} L ${CX - RX} ${CY + DEPTH}
            A ${RX} ${RY} 0 0 0 ${CX + RX} ${CY + DEPTH}
            L ${CX + RX} ${CY} A ${RX} ${RY} 0 0 1 ${CX - RX} ${CY} Z`}
        fill={C.primary}
      />
      {/* The side takes a second pass of the contact shadow. The top face is
          lit and the side is not, and that difference is the only thing
          making this read as a solid rather than a disc lying on the floor —
          so it is worth widening. The top ellipse is drawn after, so this
          only darkens what stays visible. */}
      <Path
        d={`M ${CX - RX} ${CY} L ${CX - RX} ${CY + DEPTH}
            A ${RX} ${RY} 0 0 0 ${CX + RX} ${CY + DEPTH}
            L ${CX + RX} ${CY} A ${RX} ${RY} 0 0 1 ${CX - RX} ${CY} Z`}
        fill={C.shadow}
        opacity={0.18}
      />
      {/* The top face is a lit surface and the floor is not — that is the
          whole reason the podium reads as solid. Left at the floor's own
          tone it came out a hoop with the ground showing through.

          It is `lit`, flat. Built as `secondary` under 11% white it measured
          hue 327 at 2% saturation and 34% lightness against the design's
          296 / 10 / 20 — a pale grey disc where the design has a dark plum
          one, and the single largest colour error in the room. White is what
          a lit surface is not: it keeps the luminance and takes the hue. */}
      <Ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill={C.lit} />
      {/* a line, not a second disc: filling the middle back in with the
          floor's own colour left the podium reading as a hoop. It is drawn in
          `glow`, because the design's is a *bright* line — 68 against a face
          of 42–44 where this had a dark one at 49 against 55. */}
      <Ellipse
        cx={CX}
        cy={CY}
        rx={RX - 14}
        ry={RY - 9}
        fill="none"
        stroke={glow}
        strokeWidth={1.4}
        opacity={0.17}
      />
      {/* the lamp lands here — a pool, not a highlight */}
      <Ellipse cx={CX} cy={CY} rx={RX - 6} ry={RY - 2} fill="url(#studioPool)" />

      {/* 3 — the ring, glow first.

          Two arcs, not one ellipse, because the design's ring is not the same
          weight all the way round. Down its centre line the far edge is a
          single point of 194 and the near edge three of 200 · 191 · 203 — a
          band seen almost edge-on at the back and nearly face-on at the front,
          which is most of what makes the podium read as a disc lying down
          rather than a hoop drawn on the floor. A uniform 3.4 stroke put a
          three-point far edge across the widest, flattest part of the ellipse
          and took the row mean at y380 to 64 against the design's 33.

          Same reason the glow is split: 2.5 points of it above, 4 below.
          Light pools at the near edge. */}
      <Path d={FAR} fill="none" stroke={glow} strokeWidth={4} opacity={lit * 1.7} strokeLinecap="round" />
      <Path d={NEAR} fill="none" stroke={glow} strokeWidth={9} opacity={lit * 1.7} strokeLinecap="round" />
      <Path d={FAR} fill="none" stroke={glow} strokeWidth={1.6} strokeLinecap="round" />
      <Path d={NEAR} fill="none" stroke={glow} strokeWidth={3.6} strokeLinecap="round" />

      {/* 4 — what the buddy casts on the face it is standing on.

          This is the room's shadow, not the character's, and it is here for a
          reason that took a bug to find. The figure carries one of its own in
          `koa-light.ts`, but that one is trapped in a 240 × 300 viewBox with
          six units of floor below the feet — widened to what a broad overhead
          lamp actually throws it ran past three edges and the viewport cut it
          into a rectangle, which read as a box drawn around the mascot.

          A cast shadow belongs to the surface it falls on. Out here it has the
          whole room, it lands on the podium's lit face where it can be seen,
          and it stays under the buddy because the buddy is a layer above every
          studio canvas. The figure's own is now the dark core inside this. */}
      <Ellipse cx={CX} cy={CY + 3} rx={64} ry={13} fill="url(#studioCast)" opacity={0.5} />
    </>
  );
}

/**
 * The cast shadow's falloff.
 *
 * Denser in the middle than a linear ramp and reaching zero well before the
 * rim, so there is no edge anywhere — the same shape `koa-light.ts` uses, for
 * the same reason. The two are separate constants on purpose: this one is
 * sized to the podium and that one to the figure's box, and tying them
 * together is how the clipped-shadow bug would come back.
 */
const CAST_STOPS: [number, number][] = [
  [0, 0.85],
  [0.35, 0.62],
  [0.68, 0.25],
  [1, 0],
];

/**
 * The glow the stage gives back, as geometry and a resting strength.
 *
 * Exported rather than inlined so `light-drift.tsx` can breathe it without
 * restating where it sits — the same split as `Cones` and `Lamp`. The glow
 * belongs to the scene, so a still of the room has it; only the breathing is
 * animated.
 */
export const STAGE_GLOW = { cx: CX, cy: CY - 2, rx: 124, ry: 26 };

export const stageGlowOpacity = (energy = 0.5) =>
  0.06 + Math.max(0, Math.min(1, energy)) * 0.05;

export function StageGlow({ glow = C.highlight, energy = 0.5 }: { glow?: string; energy?: number }) {
  return <Ellipse {...STAGE_GLOW} fill={glow} opacity={stageGlowOpacity(energy)} />;
}
