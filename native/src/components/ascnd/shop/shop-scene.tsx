import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { G, type GProps } from 'react-native-svg';

import { HERO_W } from '@/components/ascnd/koa/koa-frame';
import { MascotFigure } from '@/components/ascnd/mascot-figure';
import {
  cameraAt,
  SCENE_H,
  SCENE_W,
  SHOTS,
  type ShotName,
} from '@/components/ascnd/shop/shop-camera';
import { DressingRoom } from '@/components/ascnd/studio/dressing';
import { StudioContent } from '@/components/ascnd/studio/koa-studio';
import { STAGE_MARK } from '@/components/ascnd/studio/palette';
import type { MascotDef } from '@/lib/mascots';

/**
 * One room, and a camera that moves between the shop's tabs.
 *
 * `x 0 → 390` is the Mascot Room itself, unchanged, and the dressing annex is
 * beside it; the tabs are three places to stand in it. Nothing unmounts when
 * you switch — the room is continuous and you travel through it, which is the
 * whole point and the only thing that makes this better than three grids.
 *
 * ── the character is not in the SVG ──
 *
 * `MascotFigure` is its own `<Svg>` and cannot be nested in this one, so it
 * rides a `<View>` that carries **the same camera transform**. The wrapper is
 * the scene's size in scene units and the figure sits at `STAGE_MARK` inside
 * it, so the two are placed from the same number and cannot drift — the
 * discipline the whole room is built on.
 *
 * The wrapper is laid out at `SS` times scene units and scaled back down by the
 * same factor. A `<View>` is rasterised at its layout size and then scaled on
 * the GPU, and the closest shot is a 1.6× push-in; drawn at scene size the
 * character would be resampled *up* and go soft exactly when it is largest.
 * Drawing at 2× and scaling down is always the safe direction.
 */

const AnimatedG = Animated.createAnimatedComponent(
  G as unknown as React.ComponentType<GProps & { matrix?: number[] }>,
);

/** how far above scene resolution the figure is drawn — see above */
const SS = 2;

/**
 * How the camera moves.
 *
 * A spring, and not because it should bounce — this one does not. `damping` is
 * set past critical (ζ ≈ 1.2), so it eases in, eases out and never overshoots,
 * which for a zoom is the difference between a camera and a yo-yo.
 *
 * The reason it is a spring at all is **interruption**. Tap a second tab while
 * the first move is still running and `withSpring` re-targets from the value the
 * camera is at *and the velocity it is carrying*; a `withTiming` restarted from
 * 0 cannot do either. The first version jumped on every mid-move tap, and the
 * cheap fix — reading the live position and lerping from there — still stopped
 * the camera dead at the moment of the tap before re-accelerating.
 */
const SPRING = { damping: 26, stiffness: 120, mass: 1 } as const;

export function ShopScene({
  shot,
  mascot,
  width,
  height,
  level,
  equipped,
  streak,
  skin,
  energy = 0.5,
  moonPhase,
}: {
  shot: ShotName;
  mascot: MascotDef;
  width: number;
  height: number;
  level?: number;
  equipped?: Set<string>;
  streak?: number;
  skin?: string;
  energy?: number;
  moonPhase?: number;
}) {
  /**
   * The shot itself is the animated thing — four springs, one per edge.
   *
   * Not a progress number between a stored pair. A pair needs somewhere to put
   * "where we started", and on an interrupted move the honest answer is a
   * position no `SHOTS` entry holds; storing the old *target* instead is
   * precisely the jump. Springing the rect removes the question — there is no
   * start to remember, only a current value and a target, and re-targeting
   * mid-flight is the one thing springs are for.
   *
   * The rect is what is interpolated and `cameraAt` builds one matrix from it,
   * rather than interpolating two matrices: a linear scale between a wide shot
   * and a close one spends most of the move already close.
   */
  const sx = useSharedValue(SHOTS[shot].x);
  const sy = useSharedValue(SHOTS[shot].y);
  const sw = useSharedValue(SHOTS[shot].w);
  const sh = useSharedValue(SHOTS[shot].h);

  useEffect(() => {
    const to = SHOTS[shot];
    sx.value = withSpring(to.x, SPRING);
    sy.value = withSpring(to.y, SPRING);
    sw.value = withSpring(to.w, SPRING);
    sh.value = withSpring(to.h, SPRING);
  }, [shot, sx, sy, sw, sh]);

  const camera = useAnimatedProps<{ matrix: number[] }>(() => ({
    matrix: cameraAt({ x: sx.value, y: sy.value, w: sw.value, h: sh.value }, width, height),
  }));

  // the same camera, as a view transform. `translate` then `scale` about the
  // origin composes to exactly `[s, 0, 0, s, tx, ty]`, which is the matrix.
  const rider = useAnimatedStyle(() => {
    const m = cameraAt({ x: sx.value, y: sy.value, w: sw.value, h: sh.value }, width, height);
    return {
      transform: [{ translateX: m[4] }, { translateY: m[5] }, { scale: m[0] / SS }],
    };
  });

  const figure = Math.round(HERO_W * SS);

  return (
    <View style={{ width, height, overflow: 'hidden', borderRadius: 18 }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <AnimatedG animatedProps={camera}>
          <StudioContent streak={streak} skin={skin} energy={energy} moonPhase={moonPhase} />
          <DressingRoom />
        </AnimatedG>
      </Svg>

      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            width: SCENE_W * SS,
            height: SCENE_H * SS,
            transformOrigin: '0px 0px',
          },
          rider,
        ]}>
        <View
          style={{
            position: 'absolute',
            left: STAGE_MARK.x * SS - figure / 2,
            top: STAGE_MARK.y * SS - figure * 1.25 + 6 * SS,
            width: figure,
          }}>
          {/* Still. This sits above a scrolling list, and a live character
              behind one is the budget the room spent three fixes getting back. */}
          <MascotFigure
            mascot={mascot}
            size={figure}
            level={level}
            equippedOutfits={equipped}
            animated={false}
          />
        </View>
      </Animated.View>
    </View>
  );
}
