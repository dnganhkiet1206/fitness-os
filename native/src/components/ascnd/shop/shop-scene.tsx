import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

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
 * The room is a fitting room — see `shop-room.tsx` — and the tabs are four
 * places to stand in it. Nothing unmounts when you switch; the room is
 * continuous and you travel through it, which is the whole point and the only
 * thing that makes this better than four grids.
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
 * a window on the scene's top-left corner, on a room whose floor does not start
 * until y 360. The podium was never off; it was never on screen.
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
 * `outfit` shot is framed around. One transform carries both, so the room and
 * the character cannot drift apart no matter what the camera does.
 *
 * ── everything is drawn at `SS` and scaled down, room included ──
 *
 * A `<View>` is rasterised once at its **layout** size and the GPU scales that
 * bitmap; it is not re-drawn when an ancestor's transform changes. So a scene
 * laid out at 390 units wide and then magnified 1.97× by the closest shot is a
 * bitmap magnified 1.97×, and it looks it — on a real device the character came
 * out soft, which is what prompted this.
 *
 * The wrapper is therefore laid out at `SS` times scene units and the camera
 * scales by `m[0] / SS`. The widest shot is 1:1 and the closest is a very
 * slight *reduction*, which is always the safe direction. The room pays for it
 * in one rasterisation of a larger canvas — a cost paid once, at mount, on a
 * scene where nothing inside the SVG ever changes.
 */

/** how far above scene resolution the whole scene is drawn — see above */
const SS = 2;

/** the page the scene fades into — `stage-renderer.tsx`'s own constant */
const PAGE = '#070708';

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
  dress = false,
}: {
  shot: ShotName;
  mascot: MascotDef;
  width: number;
  height: number;
  level?: number;
  equipped?: Set<string>;
  skin?: string;
  energy?: number;
  /**
   * Playing the dressing reaction.
   *
   * It used to be `shot === 'closet'` — derived here, so opening a tab put him
   * in the pose and kept him there. That is a costume, not a reaction. It is
   * the page's call now, and the page raises it when a garment actually lands
   * on him. Everywhere else, every tab, he idles.
   */
  dress?: boolean;
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
    // `/ SS` because the wrapper is laid out at SS times scene units — see above
    return { transform: [{ translateX: m[4] }, { translateY: m[5] }, { scale: m[0] / SS }] };
  });

  const figure = Math.round(HERO_W * SS);

  return (
    <View style={{ width, height, overflow: 'hidden' }}>
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
          camera,
        ]}>
        <Svg width={SCENE_W * SS} height={SCENE_H * SS} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>
          <ShopRoom skin={skin} energy={energy} />
        </Svg>

        {/* placed from `FIGURE_BOX`, the same rectangle the camera frames the
            close shot around — so "the shot contains the character" is one
            number in one file rather than two calculations that agree today */}
        <View
          style={{
            position: 'absolute',
            left: FIGURE_BOX.x * SS,
            top: FIGURE_BOX.y * SS,
            width: figure,
          }}>
            {/* Alive, and idling exactly as he does in the Mascot Room — one
                clock on the UI thread driving 36 loops, which is what that room
                spent three fixes getting down to. `dress` swaps the idle for
                the dressing pose on the shot that is about it. */}
            <MascotFigure
              mascot={mascot}
              size={figure}
              level={level}
              equippedOutfits={equipped}
              /**
               * Idle, always — the Emotion Engine does not get a say in here.
               *
               * Left to the engine, the dressing room showed whatever the day
               * had earned: `tired` and `sleep` both map to `relaxing`, which
               * is Koa sitting down. A sitting character in a fitting room
               * hides the clothes you came to look at, and `curl` and `run`
               * are no better — this is a room for standing still in while
               * somebody dresses you.
               *
               * `idle` is `{ happy, idle }` in `koa-emotion.ts`, so this pins
               * both the pose and the face without inventing either.
               */
              emotion="idle"
              dress={dress}
            />
        </View>
      </Animated.View>

      {/* The room's floor runs into the page rather than stopping on a line.
          The same two gradients the Mascot Room's stage uses, and for the same
          reason: the scene is the top of a scrolling page, not a picture with a
          border, and a hard bottom edge is what makes it look like one.

          It sits *outside* the camera group, so it stays put while the camera
          moves — a fade that panned with the room would be a grey shape sliding
          across the floor. */}
      <Svg
        width={width}
        height={height}
        style={StyleSheet.absoluteFill}
        pointerEvents="none">
        <Defs>
          <LinearGradient id="shopFadeV" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={PAGE} stopOpacity={0} />
            {/* 0.83, not 0.74. A longer ramp swallowed the podium's base and
                the room read as dissolving rather than as running off the
                bottom of the picture. */}
            <Stop offset="0.83" stopColor={PAGE} stopOpacity={0} />
            <Stop offset="1" stopColor={PAGE} stopOpacity={1} />
          </LinearGradient>
          <LinearGradient id="shopFadeH" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={PAGE} stopOpacity={0.55} />
            <Stop offset="0.09" stopColor={PAGE} stopOpacity={0} />
            <Stop offset="0.91" stopColor={PAGE} stopOpacity={0} />
            <Stop offset="1" stopColor={PAGE} stopOpacity={0.55} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#shopFadeH)" />
        <Rect x={0} y={0} width={width} height={height} fill="url(#shopFadeV)" />
      </Svg>
    </View>
  );
}
