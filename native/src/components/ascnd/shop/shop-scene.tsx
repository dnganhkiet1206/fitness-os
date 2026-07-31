import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { HERO_W } from '@/components/ascnd/koa/koa-frame';
import { MascotFigure } from '@/components/ascnd/mascot-figure';
import {
  cameraAt,
  FIGURE_BOX,
  SCENE_H,
  SCENE_W,
  SHOTS,
  type ShotName,
} from '@/components/ascnd/shop/shop-camera';
import { ShopRoom } from '@/components/ascnd/shop/shop-room';
import type { MascotDef } from '@/lib/mascots';

/**
 * One room, and a camera that moves between the shop's tabs.
 *
 * The room is a fitting room — see `shop-room.tsx` — and the tabs are three
 * places to stand in it. Nothing unmounts when you switch; the room is
 * continuous and you travel through it, which is the whole point and the only
 * thing that makes this better than three grids.
 *
 * ── the camera moves the picture, not the drawing ──
 *
 * The scene is drawn once, at its own size, and a `<View>` around it carries the
 * shot. It is emphatically **not** a `matrix` on a `<G>` inside a band-sized
 * `<Svg>`, which is what this was first written as, for two independent reasons.
 *
 * The first is that it did not work at all on web. `matrix` is a
 * `react-native-svg` prop, not an SVG attribute; the web renderer's `prepare`
 * step only translates `transform` and the individual `translate`/`scale`/
 * `rotation`/`skew` props, so `matrix` lands in the DOM as an attribute no
 * browser has ever heard of and is dropped. The group measured
 * `matrix="0.951,0,0,0.951,-5.03,-154.13"` and a `getScreenCTM()` of
 * `[1,0,0,1,16,65]` — the band's own offset and not one thing more. The room sat
 * at scene `0,0` through every tab, which put the visible window at
 * `0 → 361 × 282` on a scene whose floor does not start until y 360. The podium
 * was never off; it was never on screen.
 *
 * The second reason is the one that matters on the phone the app actually ships
 * to. `react-native-svg` re-rasterises an entire `<Svg>` when any prop under it
 * changes, so animating a camera matrix inside one repaints every shape in the
 * room on every frame of the zoom — the exact cost model that made this room
 * drop frames and heat the device, paid again at the worst moment. Transforming
 * the wrapping `<View>` is a GPU composite of a bitmap that was rasterised once
 * and never touched again.
 *
 * ── the character is not in the SVG ──
 *
 * `MascotFigure` is its own `<Svg>` and cannot be nested in this one, so it sits
 * inside the same wrapper the scene does, at `FIGURE_BOX` — the rectangle the
 * `shop` shot is framed around. One transform carries both, so the room and the
 * character cannot drift apart no matter what the camera does.
 *
 * He is drawn at `SS` times scene units and scaled back down. A `<View>` is
 * rasterised at its layout size and then scaled on the GPU, and the closest shot
 * is a 1.36× push-in; drawn at scene size he would be resampled *up* and go soft
 * exactly when he is largest. The room does not need the same treatment — it is
 * scenery, it is 12× the area, and the device's own pixel ratio already gives it
 * more than the 1.36× back.
 */

/** how far above scene resolution the character is drawn — see above */
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
  skin,
  energy = 0.5,
}: {
  shot: ShotName;
  mascot: MascotDef;
  width: number;
  height: number;
  level?: number;
  equipped?: Set<string>;
  skin?: string;
  energy?: number;
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

  // `translate` then `scale` about the origin composes to exactly
  // `[s, 0, 0, s, tx, ty]`, which is the matrix `cameraAt` returns.
  const camera = useAnimatedStyle(() => {
    const m = cameraAt({ x: sx.value, y: sy.value, w: sw.value, h: sh.value }, width, height);
    return { transform: [{ translateX: m[4] }, { translateY: m[5] }, { scale: m[0] }] };
  });

  const figure = Math.round(HERO_W * SS);

  return (
    <View style={{ width, height, overflow: 'hidden', borderRadius: 18 }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            width: SCENE_W,
            height: SCENE_H,
            transformOrigin: '0px 0px',
          },
          camera,
        ]}>
        <Svg width={SCENE_W} height={SCENE_H} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>
          <ShopRoom skin={skin} energy={energy} />
        </Svg>

        {/* placed from `FIGURE_BOX`, the same rectangle the camera frames the
            close shot around — so "the shot contains the character" is one
            number in one file rather than two calculations that agree today */}
        <View
          style={{
            position: 'absolute',
            left: FIGURE_BOX.x,
            top: FIGURE_BOX.y,
            width: FIGURE_BOX.w,
            height: FIGURE_BOX.h,
          }}>
          <View style={{ width: figure, transform: [{ scale: 1 / SS }], transformOrigin: '0px 0px' }}>
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
        </View>
      </Animated.View>
    </View>
  );
}
