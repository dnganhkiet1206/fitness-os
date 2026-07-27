import { type ReactNode, useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { G, type GProps } from 'react-native-svg';

/**
 * Motion primitives for the code-drawn Koa.
 *
 * The spec sheet expresses every movement as a CSS `@keyframes` loop. React
 * Native has no CSS animation, so each loop becomes a linear 0→1 sawtooth
 * (`useLoop`) and the shape of the keyframes is recreated in a worklet.
 *
 * Groups animate through `matrix`, the one transform prop `RNSVGGroup`
 * accepts natively — so Reanimated writes it straight to the shadow node and
 * nothing crosses to JS per frame.
 */

/** `G` re-typed with the native props Reanimated drives (not in `GProps`). */
const AnimatedG = Animated.createAnimatedComponent(
  G as unknown as React.ComponentType<GProps & { matrix?: number[]; opacity?: number }>,
);

const TAU = Math.PI * 2;

/**
 * Affine matrix in react-native-svg order — [a, b, c, d, tx, ty] for
 *   ⎡a c tx⎤
 *   ⎣b d ty⎦
 * composing translate(dx,dy) ∘ rotate(deg) ∘ scale(sx,sy), the last two
 * about the pivot (ox,oy).
 */
export function mat(
  dx: number,
  dy: number,
  deg: number,
  sx: number,
  sy: number,
  ox: number,
  oy: number,
): number[] {
  'worklet';
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  return [a, b, c, d, dx + ox - (a * ox + c * oy), dy + oy - (b * ox + d * oy)];
}

/** a → b → a on an ease-in-out curve (the `0%,100% / 50%` keyframe shape) */
export function wave(t: number, a: number, b: number): number {
  'worklet';
  return a + (b - a) * ((1 - Math.cos(t * TAU)) / 2);
}

/**
 * Window: 0 outside [start,end], 1 in the middle, eased on the way in and
 * out. The ramps are smoothstepped, not linear — CSS applies the animation's
 * `ease-in-out` to every keyframe interval, and a lid that travels at
 * constant speed reads mechanical.
 */
export function pulse(t: number, start: number, up: number, down: number, end: number): number {
  'worklet';
  if (t <= start || t >= end) return 0;
  if (t < start + up) {
    const f = (t - start) / up;
    return f * f * (3 - 2 * f);
  }
  if (t > end - down) {
    const f = (end - t) / down;
    return f * f * (3 - 2 * f);
  }
  return 1;
}

function frac(t: number, phase: number): number {
  'worklet';
  return (t + phase) % 1;
}

/**
 * One linear 0→1 loop. Stopped (and reset) whenever `active` is false, so an
 * expression's props only cost anything while that expression is on screen.
 */
export function useLoop(duration: number, active: boolean): SharedValue<number> {
  const v = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(v);
      v.value = 0;
      return;
    }
    v.value = 0;
    v.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(v);
  }, [active, duration, v]);
  return v;
}

/**
 * §8 of the sheet, "Look Left / Right".
 *
 * A wandering gaze in −1…1 (x) and −1…1 (y). Koa mostly looks at you and
 * every few seconds glances somewhere and comes back; the hold is randomised
 * so it never reads as a loop. `resetSignal` snaps the eyes front — used when
 * the buddy is poked, so it looks at whoever just touched it.
 */
export function useGaze(active: boolean, resetSignal = 0) {
  const gx = useSharedValue(0);
  const gy = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(gx);
      cancelAnimation(gy);
      gx.value = withTiming(0, { duration: 240 });
      gy.value = withTiming(0, { duration: 240 });
      return;
    }
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const look = (front: boolean) => {
      const tx = front ? 0 : Math.random() * 2 - 1;
      const ty = front ? 0 : Math.random() * 0.9 - 0.45;
      const dur = 260 + Math.random() * 220;
      gx.value = withTiming(tx, { duration: dur, easing: Easing.out(Easing.cubic) });
      gy.value = withTiming(ty, { duration: dur, easing: Easing.out(Easing.cubic) });
      // a glance is brief; looking back at you lasts much longer
      const hold = front ? 1900 + Math.random() * 3200 : 700 + Math.random() * 1100;
      if (alive) t = setTimeout(() => look(!front), hold);
    };
    // start front, then take the first glance after a beat
    look(true);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [active, resetSignal, gx, gy]);
  return { gx, gy };
}

/** offsets its children by the gaze, scaled to each layer's travel */
export function Look({
  gx,
  gy,
  ax,
  ay,
  children,
}: {
  gx: SharedValue<number>;
  gy: SharedValue<number>;
  ax: number;
  ay: number;
  children: ReactNode;
}) {
  const p = useAnimatedProps(() => ({ matrix: mat(gx.value * ax, gy.value * ay, 0, 1, 1, 0, 0) }));
  return <AnimatedG animatedProps={p}>{children}</AnimatedG>;
}

/**
 * A one-shot 0→1→0 beat, fired every time `signal` changes. Drives §8's
 * "Cheek Pop": the reaction when the buddy is touched.
 */
export function usePop(signal: number, active: boolean): SharedValue<number> {
  const v = useSharedValue(0);
  useEffect(() => {
    if (!signal || !active) return;
    v.value = withSequence(
      withTiming(1, { duration: 130, easing: Easing.out(Easing.back(2)) }),
      withTiming(0, { duration: 340, easing: Easing.inOut(Easing.quad) }),
    );
  }, [signal, active, v]);
  return v;
}

/** scale/offset driven straight by a 0→1 value (not a loop) */
export function Pop({
  v,
  sx,
  sy,
  dy = 0,
  ox,
  oy,
  children,
}: {
  v: SharedValue<number>;
  sx: number;
  sy: number;
  dy?: number;
  ox: number;
  oy: number;
  children: ReactNode;
}) {
  const p = useAnimatedProps(() => ({
    matrix: mat(0, dy * v.value, 0, 1 + (sx - 1) * v.value, 1 + (sy - 1) * v.value, ox, oy),
  }));
  return <AnimatedG animatedProps={p}>{children}</AnimatedG>;
}

interface Base {
  v: SharedValue<number>;
  /** 0–1 offset into the loop — the CSS `animation-delay` */
  phase?: number;
  children: ReactNode;
}

/** rotate between `from` and `to` degrees about (ox,oy) */
export function Rot({
  v,
  phase = 0,
  from,
  to,
  ox,
  oy,
  children,
}: Base & { from: number; to: number; ox: number; oy: number }) {
  const p = useAnimatedProps(() => ({
    matrix: mat(0, 0, wave(frac(v.value, phase), from, to), 1, 1, ox, oy),
  }));
  return <AnimatedG animatedProps={p}>{children}</AnimatedG>;
}

/** translate between (0,0) and (dx,dy), optionally rolling ±`deg` with it */
export function Shift({
  v,
  phase = 0,
  dx = 0,
  dy = 0,
  deg = 0,
  ox = 0,
  oy = 0,
  children,
}: Base & { dx?: number; dy?: number; deg?: number; ox?: number; oy?: number }) {
  const p = useAnimatedProps(() => {
    const t = frac(v.value, phase);
    return { matrix: mat(wave(t, 0, dx), wave(t, 0, dy), wave(t, 0, deg), 1, 1, ox, oy) };
  });
  return <AnimatedG animatedProps={p}>{children}</AnimatedG>;
}

/** scale between (1,1) and (sx,sy) about (ox,oy) — the breathing rig */
export function Breathe({
  v,
  phase = 0,
  sx,
  sy,
  ox,
  oy,
  children,
}: Base & { sx: number; sy: number; ox: number; oy: number }) {
  const p = useAnimatedProps(() => {
    const t = frac(v.value, phase);
    return { matrix: mat(0, 0, 0, wave(t, 1, sx), wave(t, 1, sy), ox, oy) };
  });
  return <AnimatedG animatedProps={p}>{children}</AnimatedG>;
}

/**
 * The run cycle body: rises twice per stride and rolls a little each way —
 * `koaRunBody`'s four-step keyframe, as one sine on Y and one on rotation.
 */
export function RunBody({ v, ox, oy, children }: Base & { ox: number; oy: number }) {
  const p = useAnimatedProps(() => {
    const s = Math.sin(v.value * TAU);
    // rises on both halves of the stride, rolls one way then the other
    return { matrix: mat(0, -4 * Math.abs(s), 1.2 * s, 1, 1, ox, oy) };
  });
  return <AnimatedG animatedProps={p}>{children}</AnimatedG>;
}

/** hard shake — the angry beat, ~3 jitters per cycle */
export function Shake({ v, amp = 1.6, children }: Base & { amp?: number }) {
  const p = useAnimatedProps(() => {
    const t = v.value;
    return {
      matrix: mat(
        amp * Math.sin(t * TAU),
        amp * 0.4 * Math.cos(t * TAU * 2),
        0,
        1,
        1,
        0,
        0,
      ),
    };
  });
  return <AnimatedG animatedProps={p}>{children}</AnimatedG>;
}

/**
 * The lid drops from the brow and lifts again — one blink, or the sheet's
 * double flutter.
 *
 * Windows are `koaBlink` / `koaBlink2` from the sheet, to the frame:
 *   single — shut 4966→5044ms of a 5.2s loop  (close 130ms, open 156ms)
 *   double — shut 7874→8004 then 8483→8570 of an 8.7s loop
 * The eye must come back OPEN between the two halves of the flutter; leaving
 * it shut across the gap is what makes a blink read as a slow, sleepy droop.
 */
export function Blink({
  v,
  ox,
  oy,
  double = false,
  children,
}: Base & { ox: number; oy: number; double?: boolean }) {
  const p = useAnimatedProps(() => {
    const t = v.value;
    const s = double
      ? Math.max(pulse(t, 0.88, 0.025, 0.02, 0.94), pulse(t, 0.965, 0.01, 0.014, 1))
      : pulse(t, 0.93, 0.025, 0.03, 1);
    return { matrix: mat(0, 0, 0, 1, s, ox, oy) };
  });
  return <AnimatedG animatedProps={p}>{children}</AnimatedG>;
}

/** opacity between `from` and `to` (blush pulse) */
export function Fade({
  v,
  phase = 0,
  from,
  to,
  children,
}: Base & { from: number; to: number }) {
  const p = useAnimatedProps(() => ({ opacity: wave(frac(v.value, phase), from, to) }));
  return <AnimatedG animatedProps={p}>{children}</AnimatedG>;
}

/**
 * On/off within a window of the loop — the wink, and the mouth swap when Koa
 * catches its breath. Up to two windows, so a double wink is one node.
 */
export function Flash({
  v,
  windows,
  invert = false,
  scaleFrom,
  scaleTo,
  ox = 0,
  oy = 0,
  children,
}: Base & {
  windows: [number, number, number, number][];
  invert?: boolean;
  scaleFrom?: number;
  scaleTo?: number;
  ox?: number;
  oy?: number;
}) {
  const p = useAnimatedProps(() => {
    const t = v.value;
    let raw = 0;
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      const hit = pulse(t, w[0], w[1], w[2], w[3]);
      if (hit > raw) raw = hit;
    }
    const o = invert ? 1 - raw : raw;
    if (scaleFrom == null || scaleTo == null) return { opacity: o, matrix: mat(0, 0, 0, 1, 1, 0, 0) };
    const s = scaleFrom + (scaleTo - scaleFrom) * raw;
    return { opacity: o, matrix: mat(0, 0, 0, s, s, ox, oy) };
  });
  return <AnimatedG animatedProps={p}>{children}</AnimatedG>;
}

/**
 * A particle that drifts off and fades: steam, hearts, sweat, dust, puffs and
 * the speed lines behind a run. `start` delays it inside the loop so several
 * of them can share one clock and still stagger.
 */
export function Fly({
  v,
  phase = 0,
  start = 0,
  dx,
  dy,
  s0 = 1,
  s1 = 1,
  sx0,
  sx1,
  peak = 1,
  peakAt = 0.3,
  ease = true,
  ox = 0,
  oy = 0,
  children,
}: Base & {
  start?: number;
  dx: number;
  dy: number;
  s0?: number;
  s1?: number;
  /** independent X scale — the speed lines stretch, they do not grow */
  sx0?: number;
  sx1?: number;
  peak?: number;
  peakAt?: number;
  ease?: boolean;
  ox?: number;
  oy?: number;
}) {
  const p = useAnimatedProps(() => {
    const t = frac(v.value, phase);
    if (t < start) return { opacity: 0, matrix: mat(0, 0, 0, 1, 1, ox, oy) };
    const q = (t - start) / (1 - start);
    const e = ease ? 1 - (1 - q) * (1 - q) : q;
    const o = q < peakAt ? (peak * q) / peakAt : (peak * (1 - q)) / (1 - peakAt);
    const scx = sx0 != null && sx1 != null ? sx0 + (sx1 - sx0) * e : s0 + (s1 - s0) * e;
    const scy = s0 + (s1 - s0) * e;
    return { opacity: o, matrix: mat(dx * e, dy * e, 0, scx, scy, ox, oy) };
  });
  return <AnimatedG animatedProps={p}>{children}</AnimatedG>;
}

export { AnimatedG };
