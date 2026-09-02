import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
  type GProps,
} from 'react-native-svg';

import {
  koaFlags,
  type Flags,
  type KoaExpression,
  type KoaPose,
  type Worn,
} from '@/components/ascnd/koa/koa-flags';
import { CLOCK_RESET, stepClock } from '@/components/ascnd/koa/figure-clock';
import {
  BODY_GRADIENT,
  BODY_STOPS,
  FORM_GRADIENT,
  FORM_STOPS,
  glowsFor,
  GLOW_COLOUR,
  GLOW_STOPS,
  hasBody,
  hasForm,
  hasGlow,
  hasRim,
  litProps,
  rampsFor,
  RIM_COLOUR,
  RIM_GRADIENT,
  RIM_STOPS,
  RIM_WIDTH,
  SHADOW_COLOUR,
  SHADOW_GRADIENT,
  SHADOW_STOPS,
} from '@/components/ascnd/koa/koa-light';
import {
  eyeMatOf,
  gazeAt,
  headMatOf,
  SMILE,
  SMILE_COLOUR,
  SMILE_WIDTH,
  SWAP_MOUTHS,
  type Gaze,
} from '@/components/ascnd/koa/koa-gaze';
import { KOA_ASPECT, KOA_INSET_MAT, KOA_VIEWBOX } from '@/components/ascnd/koa/koa-frame';
import {
  DRESS_ARM_AT,
  DRESS_ARM_HIDE,
  DRESS_BLEND,
  DRESS_BY_ID,
  dressMat,
  type DressPart,
} from '@/components/ascnd/koa/koa-dress';
import { restsAt, REST_MAT } from '@/components/ascnd/koa/koa-pose';
import { reduceMotionSV } from '@/hooks/use-reduced-motion';
import { attrs, SHAPES } from '@/components/ascnd/koa/svg-shapes';
import {
  KEYFRAMES,
  NODES,
  type Anim,
  type Node,
  type OFrame,
  type Op,
  type TFrame,
} from '@/components/ascnd/koa/koa-scene';

/**
 * Koa — rendered straight from the design tool's export.
 *
 * `koa-scene.ts` is that export turned into data by
 * `tools/koa-import/import-koa.py`: the SVG tree, each layer's conditional
 * flag, and every CSS `@keyframes` sampled into frames. `koa-flags.ts` is
 * the export's own `renderVals()`. This file is the runtime that puts the
 * two together, so a design update is a re-run of the importer instead of a
 * hand-transcription — which is where the errors kept coming from.
 *
 * Motion: one `useFrameCallback` clock on the UI thread feeds every animated
 * layer; each takes `(clock − delay) % duration` and interpolates its own
 * frames. Groups animate through `matrix`, the one transform prop
 * `RNSVGGroup` accepts natively, so nothing crosses to JS per frame.
 */

const AnimatedG = Animated.createAnimatedComponent(
  G as unknown as React.ComponentType<GProps & { matrix?: number[]; opacity?: number }>,
);

/**
 * The figure's frame rate, as a cap.
 *
 * It used to be 30 — a deliberate halving of every downstream cost, since the
 * clock drives every animated layer's worklet run, matrix maths and native
 * prop commit. At the user's request (2026-07-29) it now runs at the display's
 * own rate, so `stepClock` advances only on the frames this allows.
 *
 * ── 120 → 60, và vì sao ──
 *
 * Con số này từng là 120, "to bring the character up to match" các lớp live của
 * phòng, kèm đúng một câu dặn: *"It is the one number to turn back down if a
 * device runs hot."* Báo cáo ấy đã tới: app nóng khi mở lâu trên iPhone 16 Pro
 * Max — tức một màn ProMotion, đúng loại máy duy nhất mà 120 khác 60.
 *
 * Đo trên harness, Today ĐỨNG YÊN 8 giây không chạm gì: ~696 lần ghi style mỗi
 * giây, và năm phần tử đầu bảng đều là nhân vật này. Nó là thứ chạy liên tục
 * lớn nhất trên màn hình mà người ta để mở.
 *
 * Câu cuối của đoạn cũ cũng cần đọc lại: *"the cost is only paid on a still
 * screen"* — được viết như một sự trấn an, nhưng màn hình đứng yên CHÍNH LÀ
 * trạng thái của một app đang mở lâu. Nó không phải ngoại lệ, nó là mặc định.
 *
 * 60 chứ không thấp hơn: nhịp thở và cú nghiêng người thì 30 cũng đủ, nhưng cú
 * chớp mắt chỉ dài hơn một phần mười giây — ở 30fps nó còn ba khung hình và đọc
 * ra là giật. 60 giữ nguyên mọi thứ mắt thấy được và bỏ đúng một nửa số lần
 * tính lại trên máy ProMotion. Trên máy 60Hz thì không đổi gì cả.
 *
 * Đây là nửa đo được của bài toán nhiệt, không phải cả bài toán: nhân vật vẫn
 * chạy MÃI khi màn hình đứng yên, kể cả lúc đã cuộn ra khỏi tầm nhìn. Lớp aura
 * đã có luật "ngoài màn thì dừng"; nhân vật thì chưa.
 */
const FIGURE_FPS = 60;
const FRAME_MS = 1000 / FIGURE_FPS;

export { KOA_ASPECT, KOA_VIEWBOX } from '@/components/ascnd/koa/koa-frame';

/* ── matrices ─────────────────────────────────────────────────────────── */

const IDENTITY = [1, 0, 0, 1, 0, 0];

function mul(m: number[], n: number[]): number[] {
  'worklet';
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** one transform step → matrix; `rotate` may carry its own centre (SVG form) */
function opMat(op: Op): number[] {
  'worklet';
  if (op[0] === 'r') {
    const r = (op[1] * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const m = [c, s, -s, c, 0, 0];
    if (op.length === 4) {
      const cx = op[2];
      const cy = op[3];
      return mul(mul([1, 0, 0, 1, cx, cy], m), [1, 0, 0, 1, -cx, -cy]);
    }
    return m;
  }
  if (op[0] === 't') return [1, 0, 0, 1, op[1], op[2]];
  return [op[1], 0, 0, op[2], 0, 0];
}

/** compose a transform list about an origin */
function opsMat(ops: Op[] | undefined, ox: number, oy: number): number[] {
  'worklet';
  if (!ops || ops.length === 0) return IDENTITY;
  let m = IDENTITY;
  for (let i = 0; i < ops.length; i++) m = mul(m, opMat(ops[i]));
  if (ox === 0 && oy === 0) return m;
  return mul(mul([1, 0, 0, 1, ox, oy], m), [1, 0, 0, 1, -ox, -oy]);
}

/* ── keyframe sampling ────────────────────────────────────────────────── */

/**
 * CSS's own timing functions, not lookalikes.
 *
 * `ease-out` is cubic-bezier(0, 0, .58, 1) and `ease-in-out` is
 * cubic-bezier(.42, 0, .58, 1); the quadratic and smoothstep curves that
 * stood in for them drifted the particle layers by up to 3px mid-flight.
 * Newton's method on x(s) = t converges in a handful of steps.
 */
function bezier(t: number, ax: number, bx: number, cx: number, ay: number, by: number, cy: number) {
  'worklet';
  let s = t;
  for (let i = 0; i < 5; i++) {
    const d = (3 * ax * s + 2 * bx) * s + cx;
    if (d < 1e-6 && d > -1e-6) break;
    s -= (((ax * s + bx) * s + cx) * s - t) / d;
  }
  return ((ay * s + by) * s + cy) * s;
}

function ease(t: number, kind: string): number {
  'worklet';
  if (kind === 'lin') return t;
  if (kind === 'out') return bezier(t, -0.74, 1.74, 0, -2, 3, 0);
  return bezier(t, 0.52, -0.78, 1.26, -2, 3, 0);
}

/** one op, interpolated between two keyframes, straight to a matrix */
function lerpOpMat(pa: Op, pb: Op | undefined, f: number): number[] {
  'worklet';
  const v = (j: number) => {
    const a = pa[j] as number;
    const b = pb && pb.length > j ? (pb[j] as number) : a;
    return a + (b - a) * f;
  };
  if (pa[0] === 'r') {
    const r = (v(1) * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    if (pa.length === 4) {
      const cx = v(2);
      const cy = v(3);
      return [c, s, -s, c, cx - (c * cx - s * cy), cy - (s * cx + c * cy)];
    }
    return [c, s, -s, c, 0, 0];
  }
  if (pa[0] === 't') return [1, 0, 0, 1, v(1), v(2)];
  return [v(1), 0, 0, v(2), 0, 0];
}

/** the pair of stops a track straddles at `t`, and the eased fraction between */
function span(frames: { o: number }[], t: number, kind: string): [number, number, number] {
  'worklet';
  let i = 0;
  let j = frames.length - 1;
  for (let k = 0; k < frames.length - 1; k++) {
    if (t >= frames[k].o && t <= frames[k + 1].o) {
      i = k;
      j = k + 1;
      break;
    }
  }
  const w = frames[j].o - frames[i].o;
  return [i, j, w > 0 ? ease((t - frames[i].o) / w, kind) : 0];
}

/**
 * Sample a transform track at 0..1 straight into a matrix.
 *
 * Deliberately allocation-light: this runs for every animated layer on
 * every tick, so it walks the ops in place instead of building an
 * intermediate `Op[]` and composing it afterwards.
 */
function sampleMat(frames: TFrame[], t: number, kind: string, ox: number, oy: number): number[] {
  'worklet';
  const s = span(frames, t, kind);
  const a = frames[s[0]];
  const b = a.to ?? a.ops;
  const f = s[2];
  if (a.ops.length === 0) return IDENTITY;
  let m = IDENTITY;
  for (let i = 0; i < a.ops.length; i++) m = mul(m, lerpOpMat(a.ops[i], b[i], f));
  if (ox !== 0 || oy !== 0) {
    m = mul(mul([1, 0, 0, 1, ox, oy], m), [1, 0, 0, 1, -ox, -oy]);
  }
  return m;
}

function sampleOp(frames: OFrame[], t: number, kind: string): number {
  'worklet';
  const s = span(frames, t, kind);
  return frames[s[0]].v + (frames[s[1]].v - frames[s[0]].v) * s[2];
}

function AnimGroup({
  clock,
  anim,
  origin,
  base,
  over,
  ownOpacity,
  gProps,
  children,
}: {
  clock: SharedValue<number>;
  anim: Anim;
  origin: [number, number] | undefined;
  /** transform that applies whatever the animation does — the CSS `translate` property */
  base: Op[];
  /** the layer's own transform, which the animation replaces once it starts */
  over: Op[];
  /** the layer's own opacity, likewise */
  ownOpacity: number;
  /** the layer's own presentation attributes — fill, stroke, clip-path … */
  gProps: Record<string, string | number>;
  children: ReactNode;
}) {
  const track = KEYFRAMES[anim.k];
  const tf = track?.tf;
  const op = track?.op;
  const ox = origin ? origin[0] : 0;
  const oy = origin ? origin[1] : 0;
  // neither changes for a mounted layer — compose them once, not 30× a second
  const baseM = useMemo(() => opsMat(base, 0, 0), [base]);
  // `transform-origin` is the layer's, not the animation's: an eyelid whose
  // own style is `scaleY(0)` collapses onto the lash line at y=72, not onto
  // the top of the viewBox
  const beforeM = useMemo(() => mul(baseM, opsMat(over, ox, oy)), [baseM, over, ox, oy]);
  const isBase = baseM === IDENTITY;
  const delay = anim.delay;
  // whether this layer animates its opacity is fixed for its lifetime, so
  // the prop set stays stable even though the two branches differ
  const props = useAnimatedProps<{ matrix: number[]; opacity: number }>(() => {
    const c = clock.value;
    // `animation-fill-mode` is `none` throughout this export, so until the
    // delay is up the animation contributes nothing at all — the layer sits
    // on its own transform and opacity, not on the 0% keyframe
    if (c < delay) return op && op.length > 0 ? { matrix: beforeM, opacity: ownOpacity } : { matrix: beforeM };
    const elapsed = c - delay;
    // exactly on an iteration boundary the loop is at the end of the cycle
    // it just finished, not the start of the next one
    const r = elapsed % anim.dur;
    const t = r === 0 && elapsed > 0 ? 1 : r / anim.dur;
    const m = tf && tf.length > 0 ? sampleMat(tf, t, anim.ease, ox, oy) : IDENTITY;
    const matrix = isBase ? m : mul(baseM, m);
    if (!op || op.length === 0) return { matrix };
    return { matrix, opacity: sampleOp(op, t, anim.ease) };
  });
  return (
    <AnimatedG {...gProps} animatedProps={props}>
      {children}
    </AnimatedG>
  );
}

/* ── the glance ───────────────────────────────────────────────────────── */

/**
 * Koa noticing an insect that has landed somewhere in the room.
 *
 * The four pieces below all read the **insects' own clock**, handed down from
 * `StageRenderer`, and everything they do comes out of `koa-gaze.ts`. Nothing
 * here holds state and nothing crosses to JS: the same `t` always gives the
 * same look, so the character and the butterfly cannot drift apart the way
 * they would on two clocks.
 *
 * They are wrappers rather than edits to the rig's own matrices because the
 * rig is generated — `koa-scene.ts` is the design export — and a look composed
 * on top of `koaBob` survives the next re-import, where a look folded into it
 * would not.
 *
 * They take a **resolved look**, not the clock. `gazeAt` walks every insect's
 * route to find the one sitting still, and four wrappers each calling it is
 * that walk four times a frame for one answer — so `KoaFigure` resolves it once
 * into a derived value and these read `.value.k` and friends.
 */

/** the head: a roll into the look, plus a small shift */
function GazeHead({ look, children }: { look: SharedValue<Gaze>; children: ReactNode }) {
  const props = useAnimatedProps<{ matrix: number[] }>(() => ({ matrix: headMatOf(look.value) }));
  return <AnimatedG animatedProps={props}>{children}</AnimatedG>;
}

/**
 * One part of the dressing pose.
 *
 * A wrapper, for the same reason the glance is one: `koa-scene.ts` is the
 * design export, and a pose composed *on top of* the rig survives the next
 * re-import where a pose folded into it would not.
 *
 * `matrix` is the only transform `RNSVGGroup` animates natively, which is why
 * every moving part of this figure rides one — and why, on web, all of them
 * including this hold their t=0 frame. See `koa-dress.ts`.
 */
function DressG({
  part,
  clock,
  blend,
  live,
  children,
}: {
  part: DressPart;
  clock: SharedValue<number>;
  /** 0 → the pose is not there at all; 1 → full. See `koa-dress.ts`. */
  blend: SharedValue<number>;
  live: boolean;
  children: ReactNode;
}) {
  const props = useAnimatedProps<{ matrix: number[] }>(() => ({
    matrix: dressMat(part, clock.value, blend.value),
  }));
  // frozen: the same first frame every other layer draws at t=0, so a still
  // figure is one plain `<G>` rather than an animated component doing nothing
  if (!live) return <G transform={`matrix(${dressMat(part, 0).join(' ')})`}>{children}</G>;
  return <AnimatedG animatedProps={props}>{children}</AnimatedG>;
}

/** the pupils and their catchlights, which travel further than the head */
function GazeEyes({ look, children }: { look: SharedValue<Gaze>; children: ReactNode }) {
  const props = useAnimatedProps<{ matrix: number[] }>(() => ({ matrix: eyeMatOf(look.value) }));
  return <AnimatedG animatedProps={props}>{children}</AnimatedG>;
}

/** the open mouth, on its way out */
function GazeMouth({ look, children }: { look: SharedValue<Gaze>; children: ReactNode }) {
  const props = useAnimatedProps<{ opacity: number }>(() => ({ opacity: 1 - look.value.k }));
  return <AnimatedG animatedProps={props}>{children}</AnimatedG>;
}

/** and the closed one, on its way in */
function GazeSmile({ look }: { look: SharedValue<Gaze> }) {
  const props = useAnimatedProps<{ opacity: number }>(() => ({ opacity: look.value.k }));
  return (
    <AnimatedG animatedProps={props}>
      <Path d={SMILE} stroke={SMILE_COLOUR} strokeWidth={SMILE_WIDTH} strokeLinecap="round" fill="none" />
    </AnimatedG>
  );
}

/**
 * The eyes move as one group, not two.
 *
 * `#pupil_left` and `#pupil_right` share a parent with the four catchlight
 * circles that sit on them. Shifting the pupils alone leaves the highlights
 * behind, which at this size reads as the eyes coming apart rather than as
 * them moving — so the group is the unit, and it is found by its children
 * because the export never gave it an id.
 */
const isEyeGroup = (n: Node) => !!n.kids && n.kids.some((k) => k.id === 'pupil_left');

/* ── strings handed down by the logic layer ───────────────────────────── */

function parseOps(css: string): Op[] {
  const ops: Op[] = [];
  const re = /(rotate|translate|translateX|translateY|scale|scaleX|scaleY)\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const n = (m[2].match(/-?\d*\.?\d+/g) ?? []).map(Number);
    if (m[1] === 'rotate') ops.push(n.length === 3 ? ['r', n[0], n[1], n[2]] : ['r', n[0]]);
    else if (m[1] === 'translate') ops.push(['t', n[0], n.length > 1 ? n[1] : 0]);
    else if (m[1] === 'translateX') ops.push(['t', n[0], 0]);
    else if (m[1] === 'translateY') ops.push(['t', 0, n[0]]);
    else if (m[1] === 'scale') ops.push(['s', n[0], n.length > 1 ? n[1] : n[0]]);
    else if (m[1] === 'scaleX') ops.push(['s', n[0], 1]);
    else ops.push(['s', 1, n[0]]);
  }
  return ops;
}

/** an animation handed down by name (`handAnim`, `runBob`, …) */
function parseAnim(css: string): { anim: Anim; origin?: [number, number]; tr?: Op[] } | null {
  const m = /(\w+)\s+([\d.]+)s\s+([\w-]+)(?:\s+([\d.]+)s)?\s+infinite/.exec(css);
  if (!m) return null;
  const o = /transform-origin:\s*([\d.]+)px\s+([\d.]+)px/.exec(css);
  // `px` is optional on a zero, and the y is optional altogether
  const tr = /(?:^|;)\s*translate:\s*(-?[\d.]+)(?:px)?(?:\s+(-?[\d.]+)(?:px)?)?/.exec(css);
  return {
    anim: {
      k: m[1],
      dur: Math.round(parseFloat(m[2]) * 1000),
      delay: m[4] ? Math.round(parseFloat(m[4]) * 1000) : 0,
      ease: m[3] === 'linear' ? 'lin' : m[3] === 'ease-out' ? 'out' : 'io',
    },
    origin: o ? [parseFloat(o[1]), parseFloat(o[2])] : undefined,
    tr: tr ? [['t', parseFloat(tr[1]), tr[2] ? parseFloat(tr[2]) : 0]] : undefined,
  };
}

/* ── static rendering ─────────────────────────────────────────────────── */

/** the layer's own `transform`, whether written inline or handed down by name */
function own_tf(n: Node, flags: Flags): Op[] {
  // an inline style outranks the presentation attribute a `bind` comes from
  if (n.tf) return n.tf;
  return n.bind ? parseOps(String(flags[n.bind] ?? '')) : [];
}

function matrixTransform(ops: Op[], origin: [number, number] | undefined): string | undefined {
  if (ops.length === 0) return undefined;
  return `matrix(${opsMat(ops, origin ? origin[0] : 0, origin ? origin[1] : 0).join(' ')})`;
}

function RenderNode({
  n,
  flags,
  clock,
  live,
  gaze,
  swapMouth,
  rest,
  dress,
  blend,
  armPart,
  armHidden,
}: {
  n: Node;
  flags: Flags;
  clock: SharedValue<number>;
  /** false → draw the first frame as plain SVG, with no animated components */
  live: boolean;
  /** the resolved look, when this figure is glancing at anything */
  gaze?: SharedValue<Gaze>;
  /** whether this pose's mouth is one the glance may close */
  swapMouth: boolean;
  /** whether this pose stands, and so gets the resting lean */
  rest: boolean;
  /** whether the dressing pose's wrappers are mounted — see `koa-dress.ts` */
  dress: boolean;
  /** how much of that pose is showing, 0 → 1, so it can fade in and out */
  blend: SharedValue<number>;
  /**
   * Which arm this node belongs to, when its parent is `ARMS`.
   *
   * The arms carry shading paths with no `id`, so the only way to move them
   * with the arm they shade is by their position in that group. The parent
   * works it out and hands it down; nothing else in the tree ever sets it.
   */
  armPart?: DressPart;
  /**
   * An arm-shading crease, while the arms are raised.
   *
   * Drawn for an arm hanging straight down, so at 34° it is a hard line lying
   * across the shape rather than a fold in it. There is no id to reach it by
   * and no version of it that is right at that angle, so it is dropped.
   */
  armHidden?: boolean;
}) {
  if (n.if && !flags[n.if]) return null;
  if (armHidden) return null;

  let kids = n.kids
    ? n.kids.map((k, i) => (
        <RenderNode
          key={i}
          n={k}
          flags={flags}
          clock={clock}
          live={live}
          gaze={gaze}
          swapMouth={swapMouth}
          rest={rest}
          dress={dress}
          blend={blend}
          armPart={dress && n.id === 'ARMS' ? DRESS_ARM_AT[i] : undefined}
          armHidden={dress && n.id === 'ARMS' && DRESS_ARM_HIDE.indexOf(i) >= 0}
        />
      ))
    : null;
  // the pleased little smile goes inside `#FACE`, so it rides the head's own
  // translate and everything the glance does to the rig above it
  if (gaze && swapMouth && n.id === 'FACE' && kids) {
    kids = [...kids, <GazeSmile key="gaze-smile" look={gaze} />];
  }

  if (n.t === 'defs') return <Defs>{kids}</Defs>;
  if (n.t === 'clipPath') return <ClipPath id={String(n.id ?? '')}>{kids}</ClipPath>;

  // a bound style carries either an animation or a plain `opacity:0`
  const bound = n.animBind ? String(flags[n.animBind] ?? '') : '';
  if (/opacity:\s*0/.test(bound)) return null;
  const boundAnim = bound ? parseAnim(bound) : null;

  const anim = n.anim ?? boundAnim?.anim;
  const origin = n.o ?? boundAnim?.origin;
  const track = anim ? KEYFRAMES[anim.k] : undefined;
  // A CSS animation outranks a presentation attribute, so a keyframe set
  // that touches `transform` replaces this layer's own `transform` outright
  // — it does not compose with it. Same for `opacity`. The CSS `translate`
  // property is a different property and survives either way.
  const drivesTf = !!track?.tf?.length;
  const drivesOp = !!track?.op?.length;

  // what the animation cannot touch, and what it replaces once it starts
  const base: Op[] = [
    ...(n.tr ? ([['t', n.tr[0], n.tr[1]]] as Op[]) : []),
    ...(boundAnim?.tr ?? []),
    ...(drivesTf ? [] : own_tf(n, flags)),
  ];
  const over: Op[] = drivesTf ? own_tf(n, flags) : [];

  // presentation attributes belong to the layer whether it is a shape or a
  // group — a `<g fill="none" stroke="#AEB6BF">` is what makes its children
  // strokes rather than black fills
  // the studio's lamp, folded into the fills — see `koa-light.ts`
  const own = litProps(n, attrs(n.a, drivesOp));
  const ownOpacity = drivesOp && n.a?.opacity != null ? Number(n.a.opacity) : 1;
  const isShape = !!SHAPES[n.t];
  const gProps = isShape ? {} : own;

  const body = isShape ? (
    (() => {
      const Shape = SHAPES[n.t];
      // Each extra pass is the same shape again with a different paint, so it
      // is clipped to the shape for free and needs no geometry — see
      // `koa-light.ts`. Order: the hot spot and the ear's own modelling sit
      // under the rim, which is the last thing the light does.
      const glow = hasGlow(n);
      if (!glow && !hasForm(n) && !hasBody(n) && !hasRim(n)) return <Shape {...own} />;
      return (
        <>
          <Shape {...own} />
          {glow ? <Shape {...own} fill={`url(#${glow})`} stroke="none" /> : null}
          {hasForm(n) ? <Shape {...own} fill={`url(#${FORM_GRADIENT})`} stroke="none" /> : null}
          {hasBody(n) ? <Shape {...own} fill={`url(#${BODY_GRADIENT})`} stroke="none" /> : null}
          {hasRim(n) ? (
            <Shape {...own} fill="none" stroke={`url(#${RIM_GRADIENT})`} strokeWidth={RIM_WIDTH} />
          ) : null}
        </>
      );
    })()
  ) : n.t === 'g' ? (
    kids
  ) : (
    <Fragment>{kids}</Fragment>
  );

  /**
   * The layer as the export draws it, before the glance goes on top.
   *
   * A local rather than five returns, because the glance has to wrap whatever
   * this node turned out to be — animated, frozen, transformed or bare — and
   * repeating the wrap at each exit is how one of the four branches ends up
   * without it.
   */
  const el: ReactNode = (() => {
    if (anim && live) {
      return (
        <AnimGroup
          clock={clock}
          anim={anim}
          origin={origin}
          base={base}
          over={over}
          ownOpacity={ownOpacity}
          gProps={gProps}>
          {body}
        </AnimGroup>
      );
    }
    if (anim) {
      // frozen: the clock never leaves 0, so every layer sits where it does at
      // t=0 — inside its delay that is its own transform, outside it the 0%
      // keyframe. A grid of thumbnails then costs nothing per frame.
      const early = anim.delay > 0;
      const ox = origin ? origin[0] : 0;
      const oy = origin ? origin[1] : 0;
      const m = mul(
        opsMat(base, 0, 0),
        early
          ? opsMat(over, ox, oy)
          : track?.tf?.length
            ? sampleMat(track.tf, 0, anim.ease, ox, oy)
            : IDENTITY,
      );
      const frozenOp: { opacity?: number } = track?.op?.length
        ? { opacity: early ? ownOpacity : sampleOp(track.op, 0, anim.ease) }
        : {};
      return (
        <G {...gProps} {...frozenOp} transform={`matrix(${m.join(' ')})`}>
          {body}
        </G>
      );
    }
    const t = matrixTransform(base, origin);
    if (t) return <G {...gProps} transform={t}>{body}</G>;
    if (Object.keys(gProps).length > 0) return <G {...gProps}>{body}</G>;
    // A group with no transform, no animation and no attributes draws exactly
    // what its children draw. The export has ~20 of them per pose — every
    // `<sc-if>` is one — and each would otherwise be a native view that
    // costs mounting and layout to do nothing.
    return <>{body}</>;
  })();

  // The resting lean goes *inside* the glance, so a look composes on top of a
  // pose rather than replacing it — and it is a plain `<G>`, static, costing
  // nothing per frame. See `koa-pose.ts`.
  const leaned =
    rest && n.id && REST_MAT[n.id] ? <G transform={REST_MAT[n.id]}>{el}</G> : el;

  // The dressing pose goes outside the resting lean and inside the glance, the
  // same place in the stack the lean itself occupies — it *is* a lean, one that
  // moves. `rest` is off whenever this is on, so the two never stack.
  const part = dress ? (armPart ?? (n.id ? DRESS_BY_ID[n.id] : undefined)) : undefined;
  const moved = part ? (
    <DressG part={part} clock={clock} blend={blend} live={live}>{leaned}</DressG>
  ) : dress && isEyeGroup(n) ? (
    <DressG part="eyes" clock={clock} blend={blend} live={live}>{leaned}</DressG>
  ) : (
    leaned
  );

  if (!gaze) return moved;
  if (n.id === 'HEADRIG') return <GazeHead look={gaze}>{moved}</GazeHead>;
  if (isEyeGroup(n)) return <GazeEyes look={gaze}>{moved}</GazeEyes>;
  if (swapMouth && n.if && SWAP_MOUTHS.indexOf(n.if) >= 0) {
    return <GazeMouth look={gaze}>{moved}</GazeMouth>;
  }
  return moved;
}

/* ── the figure ───────────────────────────────────────────────────────── */

export interface KoaFigureProps {
  expression?: KoaExpression;
  pose?: KoaPose;
  /**
   * Trying clothes on.
   *
   * Not a `KoaPose`: that type is the design export's list and this pose is
   * the app's own. It composes on top of whichever pose is set — in practice
   * `idle`, whose arms and legs are the ones it moves. See `koa-dress.ts`.
   */
  dress?: boolean;
  /** one item per slot: head / face / top / bottom / shoes / back / hand */
  worn?: Worn;
  /** rendered width in px (height = width × 1.25) */
  size?: number;
  /** freeze every loop — for static grids and pickers */
  animated?: boolean;
  /**
   * Pause the clock **in place**, without changing what is drawn.
   *
   * `animated` and this are not the same switch. `animated=false` draws the
   * frozen t=0 frame — a different, cheaper tree with no animated groups, for
   * pickers and grids; going through it mid-motion snaps the figure to that
   * pose and re-renders. This leaves the animated tree exactly as it is and
   * only stops the clock feeding it, so every layer holds the frame it was on
   * and resumes from there (the clock accumulates — see `figure-clock.ts`).
   *
   * It is a **shared value**, not a prop, on purpose: the Stage sets it while
   * the page scrolls, and reading it inside the frame callback freezes the
   * figure on the frame the drag begins with no React render in between — the
   * character is translating with the ScrollView anyway, so a paused idle is
   * invisible, and not re-rasterising this ~120-element SVG every frame is what
   * gives the scroll its headroom back. Left out (pickers, celebrations) the
   * figure simply never pauses.
   */
  hold?: SharedValue<boolean>;
  /**
   * The insects' clock, if this figure is standing in the room with them.
   *
   * Given one, it glances at whichever of them is sitting still. Left out —
   * every picker, grid and celebration — the character never looks away from
   * the viewer, which is what those want anyway.
   */
  gaze?: SharedValue<number>;
}

export function KoaFigure({
  expression = 'happy',
  pose = 'idle',
  dress = false,
  worn,
  size = 160,
  animated = true,
  hold,
  gaze,
}: KoaFigureProps) {
  const height = size * KOA_ASPECT;
  // `worn` arrives as a fresh object on most renders, so identity is no use
  // as a dependency — but there are only ever seven slots in it.
  const wornKey = worn ? JSON.stringify(worn) : '';
  const flags = useMemo(() => {
    const f = koaFlags(expression, pose, worn);
    /**
     * The dressing mouth is an "o", at the user's direction.
     *
     * It is an override rather than an expression because no expression in the
     * sheet is the combination this wants: `surprised` carries the "o" but also
     * brings wide eyes and raised brows, which is alarm rather than interest.
     * What the pose needs is `happy`'s eyes and brows with `surprised`'s mouth
     * and `delighted`'s hearts — the small "oh" of noticing what you have on,
     * and liking it. Four flags say that exactly, where an eleventh expression
     * would have to be drawn, named and kept in step with the export.
     */
    if (dress) {
      f.mouthSmile = false;
      f.mouthGrin = false;
      f.mouthO = true;
      // `delighted`'s own two hearts, which float up on a 2200ms loop — the
      // same period the pose runs at, so the bounce and the hearts share a
      // beat. Cheaper and more legible than anything a transform can say.
      f.showHearts = true;
    }
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expression, pose, wornKey, dress]);

  // One clock for the whole figure, on the UI thread: 36 loops, one frame
  // callback, nothing crossing to JS.
  // The clock is the whole figure's cost driver: every animated layer
  // recomputes when it moves. It runs at the display's rate (FIGURE_FPS caps
  // at 120), and stops while the app is backgrounded. Screen
  // focus is handled by the caller through `animated` — a stack screen
  // stays mounted underneath whatever is pushed on top of it, and this
  // component also renders outside the navigator (the unlock celebration),
  // where a focus hook would throw.
  const clock = useSharedValue(0);
  const last = useSharedValue(CLOCK_RESET);
  const frameCb = useFrameCallback((frame) => {
    'worklet';
    // The scroll pause is read here, on the UI thread, so the figure freezes on
    // the frame the drag begins with no React render involved. Holding it keeps
    // `last` current, so the clock resumes without a jump and the render path
    // (`live={animated}`) never changes — the figure holds its frame rather
    // than snapping to t=0.
    // Reduced motion is a pause that never lifts. It takes the same path as
    // the scroll hold — keep `last` current so nothing lurches if the setting
    // is turned back off — because a figure holding its frame is what this
    // clock already knows how to do. `useFrameCallback` is outside Reanimated's
    // reduce-motion handling, so this is the only place it can be honoured.
    if (reduceMotionSV.value || (hold && hold.value)) {
      last.value = frame.timeSinceFirstFrame;
      return;
    }
    stepClock(clock, last, frame.timeSinceFirstFrame, FRAME_MS);
  }, false);

  const active = useRef(false);
  useEffect(() => {
    const apply = () => {
      // NOT `=== 'active'`: iOS reports 'unknown' on the first render and
      // then never fires a change event if the app was already frontmost,
      // which left the clock switched off and the figure frozen.
      const on = animated && AppState.currentState !== 'background';
      if (on === active.current) return;
      active.current = on;
      // the callback's `timeSinceFirstFrame` restarts at 0 on every
      // activation, so the previous run's total must not be carried in
      if (on) last.value = CLOCK_RESET;
      frameCb.setActive(on);
    };
    apply();
    const sub = AppState.addEventListener('change', apply);
    return () => {
      sub.remove();
      if (active.current) {
        active.current = false;
        frameCb.setActive(false);
      }
    };
  }, [animated, frameCb, last]);

  // The tree is ~90 elements at rest and 130 mid-run, and it only depends on
  // the flags. Rebuilding it every time a parent re-renders — the Stage does
  // so on every emotion, energy and XP change — is pure waste, and the clock
  // drives the motion without React seeing any of it.
  // the lamp's gradients, on the same terms as the tree: only what this pose
  // uses, rebuilt only when the flags change
  const ramps = useMemo(() => rampsFor(flags), [flags]);
  const glows = useMemo(() => glowsFor(flags), [flags]);
  /**
   * The look, resolved once a frame.
   *
   * `gazeAt` walks all three insect routes to find whichever one has landed;
   * the four things the glance moves would each have done that walk on every
   * frame, for the same answer. One derived value instead — and when there is
   * no clock to glance on it has no dependency, so the worklet runs once at
   * mount and never again.
   */
  const clockOrNull = animated ? gaze : undefined;
  const resolved = useDerivedValue<Gaze>(() =>
    clockOrNull ? gazeAt(clockOrNull.value) : { x: 0, y: 0, k: 0 },
  );
  const look = clockOrNull ? resolved : undefined;
  const swapMouth = SWAP_MOUTHS.some((f) => !!flags[f]);
  /**
   * The dressing pose fades in and out rather than being switched.
   *
   * `blend` is the amount showing and every number in `dressMat` scales by it,
   * so 0 is the identity matrix and there is no separate transition to keep in
   * step with the pose. `mounted` is what keeps the wrappers in the tree while
   * that fade runs *out* — dropping them the instant `dress` goes false would
   * cut from mid-sway back to idle, which is the jump the fade exists to avoid.
   */
  const blend = useSharedValue(dress ? 1 : 0);
  const [mounted, setMounted] = useState(dress);
  useEffect(() => {
    blend.value = withTiming(dress ? 1 : 0, { duration: DRESS_BLEND });
    if (dress) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), DRESS_BLEND);
    return () => clearTimeout(t);
  }, [dress, blend]);

  // The resting lean and the dressing pose drive the same nodes, so they never
  // both apply: one is a still figure's asymmetry, the other is a moving one's.
  const rest = restsAt(flags) && !mounted;
  const tree = useMemo(
    () =>
      NODES.map((n, i) => (
        <RenderNode
          key={i}
          n={n}
          flags={flags}
          clock={clock}
          live={animated}
          gaze={look}
          swapMouth={swapMouth}
          rest={rest}
          dress={mounted}
          blend={blend}
        />
      )),
    [flags, clock, animated, look, swapMouth, rest, mounted, blend],
  );

  return (
    <View style={{ width: size, height }} pointerEvents="none">
      <Svg width={size} height={height} viewBox={KOA_VIEWBOX} preserveAspectRatio="xMidYMax meet">
        {/* the lamp — one vertical ramp per colour, see `koa-light.ts` */}
        <Defs>
          {ramps.map((r) => (
            <LinearGradient
              key={r.id}
              id={r.id}
              gradientUnits="userSpaceOnUse"
              x1={r.x1}
              y1={r.y1}
              x2={r.x2}
              y2={r.y2}>
              {r.stops.map(([o, c]) => (
                <Stop key={o} offset={o} stopColor={c} />
              ))}
            </LinearGradient>
          ))}
          {glows.map((g) => (
            <RadialGradient key={g.id} id={g.id} gradientUnits="userSpaceOnUse" cx={g.cx} cy={g.cy} r={g.r}>
              {GLOW_STOPS.map(([o, a]) => (
                <Stop key={o} offset={o} stopColor={GLOW_COLOUR} stopOpacity={a} />
              ))}
            </RadialGradient>
          ))}
          <LinearGradient id={FORM_GRADIENT} x1="0" y1="0" x2="0" y2="1">
            {FORM_STOPS.map(([o, c, a]) => (
              <Stop key={o} offset={o} stopColor={c} stopOpacity={a} />
            ))}
          </LinearGradient>
          <LinearGradient id={BODY_GRADIENT} x1="0" y1="0" x2="0" y2="1">
            {BODY_STOPS.map(([o, c, a]) => (
              <Stop key={o} offset={o} stopColor={c} stopOpacity={a} />
            ))}
          </LinearGradient>
          <RadialGradient id={SHADOW_GRADIENT}>
            {SHADOW_STOPS.map(([o, a]) => (
              <Stop key={o} offset={o} stopColor={SHADOW_COLOUR} stopOpacity={a} />
            ))}
          </RadialGradient>
          <LinearGradient id={RIM_GRADIENT} x1="0" y1="0" x2="0" y2="1">
            {RIM_STOPS.map(([o, a]) => (
              <Stop key={o} offset={o} stopColor={RIM_COLOUR} stopOpacity={a} />
            ))}
          </LinearGradient>
        </Defs>
        {/* the artwork, inset in its box so the head has room to move —
            see `koa-frame.ts`. A static group; it costs nothing per frame. */}
        <G transform={KOA_INSET_MAT}>{tree}</G>
      </Svg>
    </View>
  );
}
