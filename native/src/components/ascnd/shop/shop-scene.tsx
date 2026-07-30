import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { G, type GProps } from 'react-native-svg';

import { HERO_W } from '@/components/ascnd/koa/koa-frame';
import { MascotFigure } from '@/components/ascnd/mascot-figure';
import {
  cameraAt,
  SCENE_H,
  SCENE_W,
  shotBetween,
  SHOTS,
  type Shot,
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

/** how long a camera move takes */
const MOVE = 620;

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
   * The move, as a pair of shots and a number between them.
   *
   * `shotBetween` interpolates the *rect* and `cameraAt` builds one matrix from
   * it, rather than lerping two matrices — a linear scale between a wide shot
   * and a close one spends most of the move already close.
   */
  const from = useRef<ShotName>(shot);
  const [pair, setPair] = useState<[Shot, Shot]>([SHOTS[shot], SHOTS[shot]]);
  const t = useSharedValue(1);

  useEffect(() => {
    if (from.current === shot) return;
    setPair([SHOTS[from.current], SHOTS[shot]]);
    from.current = shot;
    t.value = 0;
    t.value = withTiming(1, { duration: MOVE, easing: Easing.inOut(Easing.cubic) });
  }, [shot, t]);

  const camera = useAnimatedProps<{ matrix: number[] }>(() => ({
    matrix: cameraAt(shotBetween(pair[0], pair[1], t.value), width, height),
  }));

  // the same camera, as a view transform. `translate` then `scale` about the
  // origin composes to exactly `[s, 0, 0, s, tx, ty]`, which is the matrix.
  const rider = useAnimatedStyle(() => {
    const m = cameraAt(shotBetween(pair[0], pair[1], t.value), width, height);
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
