import { useEffect } from 'react';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { duration } from '@/constants/motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Apple-Fitness-style segmented energy ring. Each segment is one daily
 * signal (meal / workout / water / sleep / steps); it lights up in its
 * own colour when that signal is met today, and sits as a faint track
 * when it isn't. Purely a status glyph — the centre number is overlaid
 * by the parent so it can use themed text styles.
 *
 * ── the segment is drawn in, not switched on ──
 *
 * This was `{seg.on && <Circle/>}`: the lit arc did not exist until the
 * signal was met, then existed. Logging the first meal of the day made a
 * coloured arc appear between two frames, with no more ceremony than a
 * checkbox — and this is the app's reward moment, the one place where the
 * picture is *supposed* to say "you did the thing".
 *
 * The arc is now always mounted and revealed by `strokeDashoffset`, the same
 * way `activity-rings.tsx` and `readiness-gauge.tsx` already draw theirs, so
 * there is one idiom for a ring in this app rather than three. Offset runs
 * from `arc` (the dash pushed entirely off the path — nothing visible) to 0
 * (fully drawn), which sweeps the segment in from its start rather than fading
 * it in on the spot.
 *
 * It also runs backwards for free: delete the meal and the arc retracts along
 * the path it came in on, so undo looks like undo instead of like a redraw.
 *
 * ── why it does not sweep on first draw ──
 *
 * Same reason `bar-fill.tsx` does not fill from zero: the ring starts at
 * whatever the day already is. Five arcs sweeping in every time Today mounts
 * would be a small ceremony for information the user already had, and by the
 * evening it would be five. The sweep is spent only on the transition — the
 * moment the signal is actually met.
 *
 * `duration.appear` with an ease-out — the token for something that was not on
 * screen a moment ago, which is what the lit arc is. Picked by distance, per
 * that file's rule: one segment of a 104px ring is about 55px of travel, so the
 * short end of the scale is the honest end. Inside NN/g's 100–500ms band, and ease-out is
 * the curve for something arriving, which "allows the eye time to focus on the
 * element as it comes to rest". Reduce Motion skips to the end state.
 */
const SWEEP_MS = duration.appear;
const SWEEP_EASE = Easing.out(Easing.cubic);

function Segment({ on, color, arc, C, cx, cy, r, stroke, start }: {
  on: boolean; color: string; arc: number; C: number;
  cx: number; cy: number; r: number; stroke: number; start: number;
}) {
  const reduceMotion = useReducedMotion();
  const lit = useSharedValue(on ? 1 : 0);

  useEffect(() => {
    const to = on ? 1 : 0;
    lit.value = reduceMotion ? to : withTiming(to, { duration: SWEEP_MS, easing: SWEEP_EASE });
  }, [on, reduceMotion, lit]);

  /* offset `arc` hides the dash completely (at every point p of the path the
     pattern sits at p + arc, which is past the dash and inside the gap);
     offset 0 draws it whole. In between, the visible piece is [0, arc·lit) —
     the arc growing from its own start. */
  const sweep = useAnimatedProps(() => ({ strokeDashoffset: arc * (1 - lit.value) }));

  return (
    <G rotation={start} originX={cx} originY={cy}>
      <Circle
        cx={cx} cy={cy} r={r} fill="none" stroke="#1c1c20"
        strokeWidth={stroke} strokeDasharray={[arc, C]} strokeLinecap="round"
      />
      <AnimatedCircle
        cx={cx} cy={cy} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeDasharray={[arc, C]} strokeLinecap="round"
        animatedProps={sweep}
      />
    </G>
  );
}

export function EnergyRing({
  size = 104,
  stroke = 10,
  segments,
}: {
  size?: number;
  stroke?: number;
  segments: { on: boolean; color: string }[];
}) {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  const n = Math.max(1, segments.length);
  const gapDeg = 8;
  const segDeg = 360 / n - gapDeg;
  const arc = (C * segDeg) / 360;

  return (
    <Svg width={size} height={size}>
      {segments.map((seg, i) => (
        <Segment
          key={i}
          on={seg.on}
          color={seg.color}
          arc={arc}
          C={C}
          cx={cx}
          cy={cy}
          r={r}
          stroke={stroke}
          start={-90 + i * (360 / n) + gapDeg / 2}
        />
      ))}
    </Svg>
  );
}
