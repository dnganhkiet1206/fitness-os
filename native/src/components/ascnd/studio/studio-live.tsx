import Svg from 'react-native-svg';

import { LiveLight, LiveStageGlow, useLightClock } from '@/components/ascnd/studio/light-drift';
import { DriftingMotes } from '@/components/ascnd/studio/motes-drift';
import { STUDIO_H, STUDIO_W } from '@/components/ascnd/studio/palette';

/**
 * Everything in the room that moves, on its own canvas above the studio.
 *
 * **This is a performance boundary, not a tidy-up.** `react-native-svg`
 * rasterises a whole `<Svg>` again whenever any child prop changes — an
 * animated group invalidates up to the root. With the motes, the beam and the
 * glow animating *inside* `KoaStudio`, all 191 of its shapes were being
 * redrawn every frame, over full-canvas gradients, under a character already
 * running its own 30fps clock. The Mascot Room went visibly laggy the moment
 * that landed. Here the same animations redraw ~35 shapes and the studio's
 * canvas goes back to never redrawing at all.
 *
 * The order is the order they had inside the scene — cones, lamp, motes,
 * glow. Lifting them above `FloorLight` and `Platform` costs nothing visible,
 * and that was checked rather than assumed: the beam's gradient is fully
 * transparent by y325 and the podium's top edge is at y381, and no mote sits
 * inside the podium's box. **Re-check both if the beam's tail is carried
 * lower or a mote is moved down.**
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
      <LiveLight t={t} />
      <DriftingMotes />
      <LiveStageGlow t={t} glow={glow} energy={energy} />
    </Svg>
  );
}
