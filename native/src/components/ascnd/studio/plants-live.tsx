import * as React from 'react';
import { memo, useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { G, type GProps } from 'react-native-svg';

import { PLANT_REGIONS } from '@/components/ascnd/studio/live-regions';
import { LiveLayer } from '@/components/ascnd/studio/studio-live';
import { PLANT_PIVOT, PlantFoliage, PlantPot, type PlantKind } from '@/components/ascnd/studio/plant';
import { PLANTS, StudioPlants } from '@/components/ascnd/studio/plants';
import { STUDIO_H, STUDIO_W } from '@/components/ascnd/studio/palette';

/**
 * The plants, breathing in the room's air.
 *
 * **Only the foliage moves.** The pot is drawn outside the animated group: a
 * pot that rocks with its own plant reads as an earthquake rather than as a
 * draught.
 *
 * This needs a canvas of its own, between the room's back and its front, and
 * that is not tidiness. Everything on the main overlay is drawn above the
 * vignette, and the vignette takes about a third out of both plants where
 * they stand — measured at 0.32 for the floor plant and 0.33 for the shelf
 * one. Put them up there with the motes and they jump that much brighter,
 * which is far more visible than the sway. So `StageRenderer` stacks
 * back → plants → front, and this layer stays underneath the shadow the room
 * is lit out of.
 *
 * Area is what costs, and this is about 8,200 square units of leaf — the same
 * order as the stage glow, which has been running without heating anything.
 */

const AnimatedG = Animated.createAnimatedComponent(
  G as unknown as React.ComponentType<GProps & { matrix?: number[] }>,
);

/** one cycle for both plants, in ms */
const PERIOD = 15000;

/**
 * How each plant moves: sway in degrees, how many sways per cycle, how many
 * gusts per cycle, and where in the cycle its gusts fall.
 *
 * The rates differ so the two are never in step — a room where every leaf
 * moves together is a room in a wind tunnel. Both counts are whole numbers of
 * cycles in `t`, so the loop closes on itself with no jump at the seam.
 */
const SWAY: { deg: number; rate: number; gust: number; phase: number }[] = [
  { deg: 2.6, rate: 3, gust: 2, phase: 0 },
  { deg: 1.7, rate: 2, gust: 3, phase: 0.41 },
];

function useSwayClock(active = true): SharedValue<number> {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(t);
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: PERIOD, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t, active]);
  return t;
}

/**
 * One plant.
 *
 * The sway is a rotation about the pot's rim, written straight as a matrix —
 * for a pivot at `(0, p)` that is `[c, s, −s, c, p·s, p·(1−c)]`, which leaves
 * the rim exactly where it is while the tips travel furthest.
 *
 * The gust envelope is a raised cosine cubed: the plant is still for most of
 * the cycle and then moves for a few seconds. A bare sine would have both
 * plants waving without pause, which is the thing that reads as cheap.
 */
function Swaying({
  x,
  y,
  s,
  kind,
  i,
  t,
}: {
  x: number;
  y: number;
  s: number;
  kind: PlantKind;
  i: number;
  t: SharedValue<number>;
}) {
  const { deg, rate, gust, phase } = SWAY[i % SWAY.length];
  const props = useAnimatedProps<{ matrix: number[] }>(() => {
    const env = ((1 + Math.cos(2 * Math.PI * (gust * t.value + phase))) / 2) ** 3;
    const a = ((deg * env * Math.sin(2 * Math.PI * rate * t.value)) * Math.PI) / 180;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    return { matrix: [c, sn, -sn, c, PLANT_PIVOT * sn, PLANT_PIVOT * (1 - c)] };
  });
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <AnimatedG animatedProps={props}>
        <PlantFoliage kind={kind} />
      </AnimatedG>
      <PlantPot />
    </G>
  );
}

export function SwayingPlants() {
  const t = useSwayClock();
  return (
    <>
      {PLANTS.map((p, i) => (
        <Swaying key={i} {...p} i={i} t={t} />
      ))}
    </>
  );
}

/**
 * The plants' canvases, laid between the room's back and its front.
 *
 * **One canvas per plant while they are moving.** They stand at opposite
 * corners of the room — (41, 250) on the shelf and (316, 397) on the floor — so
 * a single canvas holding both is the whole screen, and every sway of one leaf
 * was redrawing all of it along with the other plant. Split, each redraw covers
 * about one percent. The regions are derived from the leaf table itself in
 * `live-regions.ts`; a canvas that does not contain its plant clips it.
 *
 * Still — a snapshot, a picker, an unfocused screen — it goes back to one
 * canvas, because nothing is being redrawn and a single view is cheaper to
 * mount than three. That one must keep `KoaStudio`'s viewBox, size and
 * `preserveAspectRatio` or the layers drift apart.
 */
function PlantsCanvasInner({
  width,
  height,
  animated,
}: {
  width: number;
  height: number;
  animated?: boolean;
}) {
  const t = useSwayClock(animated !== false);
  if (!animated) {
    return (
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${STUDIO_W} ${STUDIO_H}`}
        preserveAspectRatio="xMidYMin slice"
        pointerEvents="none">
        <StudioPlants />
      </Svg>
    );
  }
  const k = width / STUDIO_W;
  return (
    <>
      {PLANTS.map((p, i) => (
        <LiveLayer key={i} r={PLANT_REGIONS[i]} k={k}>
          <Swaying {...p} i={i} t={t} />
        </LiveLayer>
      ))}
    </>
  );
}

/**
 * Memoised for the same reason as the other two canvases: its props are
 * primitives and the stage re-renders far more often than they change.
 */
export const PlantsCanvas = memo(PlantsCanvasInner);
