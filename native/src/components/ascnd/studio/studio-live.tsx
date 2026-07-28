import Svg from 'react-native-svg';

import { LampPulse, LiveStageGlow, useLightClock } from '@/components/ascnd/studio/light-drift';
import { DriftingMotes } from '@/components/ascnd/studio/motes-drift';
import { STUDIO_H, STUDIO_W } from '@/components/ascnd/studio/palette';

/**
 * Everything in the room that moves, on its own canvas above the studio.
 *
 * **This is a performance boundary, not a tidy-up**, and it took two goes.
 *
 * `react-native-svg` rasterises a whole `<Svg>` again whenever any child prop
 * changes — an animated group invalidates up to the root. With the motes, the
 * beam and the glow animating *inside* `KoaStudio`, every shape in the room
 * was redrawn each frame, over full-canvas gradients, under a character
 * already running its own 30fps clock. The Mascot Room went visibly laggy.
 *
 * Moving them to this canvas fixed the lag and **the phone still ran hot**,
 * because the cone stack came with them: nine full-height gradient-filled
 * trapezoids at 60fps. Shape *count* is not the cost — covered area is. So
 * the beam went back to the static canvas and what moves here is small: a
 * glow at the lamp's mouth, nine motes, and the stage's glow.
 *
 * **The rule that came out of it: never animate anything that covers a large
 * part of the screen.** Not the cones, not the vignette, not the wall or the
 * floor.
 *
 * Lifting the motes and the glow above `FloorLight` and `Platform` costs
 * nothing visible, and that was checked rather than assumed: no mote sits
 * inside the podium's box. **Re-check if one is moved down.**
 *
 * The viewBox, size and `preserveAspectRatio` must stay identical to
 * `KoaStudio`'s or the two layers drift apart.
 */
export function StudioLive({
  width,
  height,
  glow,
  energy,
}: {
  width: number;
  height: number;
  glow?: string;
  energy?: number;
}) {
  const t = useLightClock();
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${STUDIO_W} ${STUDIO_H}`}
      preserveAspectRatio="xMidYMin slice"
      pointerEvents="none">
      <LampPulse t={t} glow={glow} />
      <DriftingMotes />
      <LiveStageGlow t={t} glow={glow} energy={energy} />
    </Svg>
  );
}
