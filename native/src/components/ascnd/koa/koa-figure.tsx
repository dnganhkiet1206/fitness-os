import { Fragment, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  Path,
  Rect,
  type GProps,
} from 'react-native-svg';

import {
  koaFlags,
  type Flags,
  type KoaExpression,
  type KoaPose,
  type Worn,
} from '@/components/ascnd/koa/koa-flags';
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
 * The character is a cartoon; 30 is plenty and it halves every downstream
 * cost — worklet runs, matrix maths and native prop commits all scale off
 * this one number.
 */
const FIGURE_FPS = 30;
const FRAME_MS = 1000 / FIGURE_FPS;

export const KOA_VIEWBOX = '0 0 240 300';
export const KOA_ASPECT = 300 / 240;

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

const SHAPES: Record<string, React.ComponentType<Record<string, unknown>>> = {
  path: Path as never,
  ellipse: Ellipse as never,
  circle: Circle as never,
  rect: Rect as never,
  line: Line as never,
};

/** react-native-svg wants camelCase where SVG uses kebab-case */
const ATTR: Record<string, string> = {
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'clip-path': 'clipPath',
  'clip-rule': 'clipRule',
  'fill-rule': 'fillRule',
  'stroke-dasharray': 'strokeDasharray',
};

function attrs(a: Record<string, string | number> | undefined, dropOpacity: boolean) {
  if (!a) return {};
  const out: Record<string, string | number> = {};
  for (const k of Object.keys(a)) {
    if (dropOpacity && k === 'opacity') continue;
    out[ATTR[k] ?? k] = a[k];
  }
  return out;
}

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
}: {
  n: Node;
  flags: Flags;
  clock: SharedValue<number>;
  /** false → draw the first frame as plain SVG, with no animated components */
  live: boolean;
}) {
  if (n.if && !flags[n.if]) return null;

  const kids = n.kids
    ? n.kids.map((k, i) => <RenderNode key={i} n={k} flags={flags} clock={clock} live={live} />)
    : null;

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
  const own = attrs(n.a, drivesOp);
  const ownOpacity = drivesOp && n.a?.opacity != null ? Number(n.a.opacity) : 1;
  const isShape = !!SHAPES[n.t];
  const gProps = isShape ? {} : own;

  const body = isShape ? (
    (() => {
      const Shape = SHAPES[n.t];
      return <Shape {...own} />;
    })()
  ) : n.t === 'g' ? (
    kids
  ) : (
    <Fragment>{kids}</Fragment>
  );

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
}

/* ── the figure ───────────────────────────────────────────────────────── */

export interface KoaFigureProps {
  expression?: KoaExpression;
  pose?: KoaPose;
  /** one item per slot: head / face / top / bottom / shoes / back / hand */
  worn?: Worn;
  /** rendered width in px (height = width × 1.25) */
  size?: number;
  /** freeze every loop — for static grids and pickers */
  animated?: boolean;
}

export function KoaFigure({
  expression = 'happy',
  pose = 'idle',
  worn,
  size = 160,
  animated = true,
}: KoaFigureProps) {
  const height = size * KOA_ASPECT;
  // `worn` arrives as a fresh object on most renders, so identity is no use
  // as a dependency — but there are only ever seven slots in it.
  const wornKey = worn ? JSON.stringify(worn) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flags = useMemo(() => koaFlags(expression, pose, worn), [expression, pose, wornKey]);

  // One clock for the whole figure, on the UI thread: 36 loops, one frame
  // callback, nothing crossing to JS.
  // The clock is the whole figure's cost driver: every animated layer
  // recomputes when it moves. So it ticks at FIGURE_FPS rather than the
  // display's 60–120, and stops while the app is backgrounded. Screen
  // focus is handled by the caller through `animated` — a stack screen
  // stays mounted underneath whatever is pushed on top of it, and this
  // component also renders outside the navigator (the unlock celebration),
  // where a focus hook would throw.
  const clock = useSharedValue(0);
  const last = useSharedValue(0);
  const frameCb = useFrameCallback((frame) => {
    'worklet';
    const t = frame.timeSinceFirstFrame;
    if (t - last.value < FRAME_MS) return;
    last.value = t;
    clock.value = t;
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
  }, [animated, frameCb]);

  // The tree is ~90 elements at rest and 130 mid-run, and it only depends on
  // the flags. Rebuilding it every time a parent re-renders — the Stage does
  // so on every emotion, energy and XP change — is pure waste, and the clock
  // drives the motion without React seeing any of it.
  const tree = useMemo(
    () => NODES.map((n, i) => <RenderNode key={i} n={n} flags={flags} clock={clock} live={animated} />),
    [flags, clock, animated],
  );

  return (
    <View style={{ width: size, height }} pointerEvents="none">
      <Svg width={size} height={height} viewBox={KOA_VIEWBOX} preserveAspectRatio="xMidYMax meet">
        {tree}
      </Svg>
    </View>
  );
}
