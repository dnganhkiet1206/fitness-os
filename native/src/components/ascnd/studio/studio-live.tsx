import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { type SharedValue } from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { FlyingBugs } from '@/components/ascnd/studio/bugs-live';
import { LampPulse, LiveStageGlow, useLightClock } from '@/components/ascnd/studio/light-drift';
import { BEAM, BUGS, SKY, STAGE, type Region } from '@/components/ascnd/studio/live-regions';
import { DriftingMotes } from '@/components/ascnd/studio/motes-drift';
import { LiveSky, useSkyClock } from '@/components/ascnd/studio/sky-live';
import { STUDIO_W } from '@/components/ascnd/studio/palette';

/**
 * Everything in the room that moves — each on a canvas its own size.
 *
 * **This is a performance boundary, not a tidy-up**, and it has taken three
 * goes.
 *
 * `react-native-svg` rasterises a whole `<Svg>` again whenever any child prop
 * changes — an animated group invalidates up to the root. With the motes, the
 * beam and the glow animating *inside* `KoaStudio`, every shape in the room was
 * redrawn each frame, over full-canvas gradients, under a character already
 * running its own clock at the display's rate. The Mascot Room went visibly
 * laggy.
 *
 * Moving them to an overlay fixed the lag and **the phone still ran hot**,
 * because the cone stack came with them: nine full-height gradient-filled
 * trapezoids at 60fps. Shape *count* is not the cost — covered area is. So the
 * beam went back to the static canvas.
 *
 * Then the weather and the insects arrived, and the overlay — still one canvas
 * the size of the screen — went from a dozen shapes to about a hundred and
 * ninety. The whole screen was being redrawn sixty times a second so that six
 * stars could blink inside a window covering five percent of it, and the phone
 * ran hot again.
 *
 * **The rule this time: a canvas is the size of what moves on it.** The regions
 * are in `live-regions.ts`, derived from the geometry rather than typed, and
 * each one is a `<View>` placed at `region · k` holding an `<Svg>` whose viewBox
 * *is* that region. Every layer therefore lands on exactly the pixels it landed
 * on before — the split changes what gets redrawn, not what is drawn.
 *
 * The old rule still holds on top of it: never animate anything that covers a
 * large part of the screen. Not the cones, not the vignette, not the wall or
 * the floor.
 *
 * Order matters and is the order it was: sky, then the lamp and its motes, then
 * the insects, then the stage's glow last.
 */

/**
 * One region's canvas.
 *
 * `k` is the room's scale — `width / STUDIO_W` — and the parent stack draws its
 * 390 × 844 viewBox with `xMidYMin slice` at that same width, so an artboard
 * point lands at exactly `(x · k, y · k)` on screen. Placing a sub-canvas is
 * then arithmetic rather than a guess.
 *
 * **The box is snapped to whole points and the viewBox is derived back from
 * it**, not the other way round. `region · k` is almost never an integer, and a
 * canvas laid out at 118.65pt rasterises its contents against a grid half a
 * pixel off the one the full-screen canvas used — which shows up as a hairline
 * of difference along every edge in the room. Snapping the *view* and solving
 * the viewBox for it keeps `x · k` exact while putting the raster grid back
 * where it was. A pixel diff of the two layouts at 361pt found this and nothing
 * else; it is the only way the split can move anything.
 */
export function LiveLayer({ r, k, children }: { r: Region; k: number; children: ReactNode }) {
  const left = Math.floor(r.x * k);
  const top = Math.floor(r.y * k);
  const w = Math.ceil((r.x + r.w) * k) - left;
  const h = Math.ceil((r.y + r.h) * k) - top;
  return (
    <View style={{ position: 'absolute', left, top, width: w, height: h }} pointerEvents="none">
      <Svg width={w} height={h} viewBox={`${left / k} ${top / k} ${w / k} ${h / k}`}>
        {children}
      </Svg>
    </View>
  );
}

function StudioLiveInner({
  width,
  glow,
  energy,
  bugs,
  pause,
}: {
  width: number;
  glow?: string;
  energy?: number;
  /** the insects' clock, owned by `StageRenderer` so the mascot shares it */
  bugs: SharedValue<number>;
  /** the page is mid-scroll, as a shared value — every clock below holds on it */
  pause?: SharedValue<boolean>;
}) {
  // Every loop clock holds in place while the page scrolls, so these canvases
  // stop redrawing under the ScrollView instead of repainting each one every
  // frame on the thread the scroll runs on. `pause` is a shared value read on
  // the UI thread, so the freeze lands the frame the drag begins with no React
  // render in between; the clocks are accumulators, so they resume untouched.
  // See loop-clock.ts.
  const t = useLightClock(pause);
  const sky = useSkyClock(pause);
  const k = width / STUDIO_W;
  return (
    <>
      {/* the window's sky — most of the room's animated shapes, on 4.7% of it */}
      <LiveLayer r={SKY} k={k}>
        <LiveSky t={sky} />
      </LiveLayer>
      {/* the lamp's mouth and the motes in its beam, which overlap */}
      <LiveLayer r={BEAM} k={k}>
        <LampPulse t={t} glow={glow} />
        <DriftingMotes pause={pause} />
      </LiveLayer>
      {/* A bee and two butterflies. Their canvas is the whole room, because that
          is what their routes cross, so its redraw is screen-sized — but the
          shared bug clock holds on `pause` like the rest, so during a scroll
          this layer is a frozen bitmap the compositor just translates, not a
          per-frame redraw. See bugs-live.tsx. */}
      <LiveLayer r={BUGS} k={k}>
        <FlyingBugs t={bugs} />
      </LiveLayer>
      <LiveLayer r={STAGE} k={k}>
        <LiveStageGlow t={t} glow={glow} energy={energy} />
      </LiveLayer>
    </>
  );
}

/**
 * Memoised: every prop is a primitive, and `StageRenderer` re-renders on each
 * emotion tick, poke and celebration signal — without this, each of those
 * rebuilt this canvas's whole element tree for nothing.
 */
export const StudioLive = memo(StudioLiveInner);
