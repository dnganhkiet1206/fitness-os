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
  type Frame,
  type Node,
  type Op,
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

function ease(t: number, kind: string): number {
  'worklet';
  if (kind === 'lin') return t;
  if (kind === 'out') return 1 - (1 - t) * (1 - t);
  return t * t * (3 - 2 * t); // ease-in-out
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

/**
 * Sample a frame list at 0..1 straight into a matrix.
 *
 * Deliberately allocation-light: this runs for every animated layer on
 * every tick, so it walks the ops in place instead of building an
 * intermediate `Op[]` and composing it afterwards.
 */
function sampleMat(
  frames: Frame[],
  t: number,
  kind: string,
  ox: number,
  oy: number,
): { m: number[]; op: number } {
  'worklet';
  let a = frames[0];
  let b = frames[frames.length - 1];
  for (let i = 0; i < frames.length - 1; i++) {
    if (t >= frames[i].o && t <= frames[i + 1].o) {
      a = frames[i];
      b = frames[i + 1];
      break;
    }
  }
  const span = b.o - a.o;
  const f = span > 0 ? ease((t - a.o) / span, kind) : 0;

  const oa = a.op == null ? 1 : a.op;
  const ob = b.op == null ? 1 : b.op;
  const op = oa + (ob - oa) * f;

  if (!a.ops || a.ops.length === 0) return { m: IDENTITY, op };
  const sameShape = !!b.ops && b.ops.length === a.ops.length;
  let m = IDENTITY;
  for (let i = 0; i < a.ops.length; i++) {
    m = mul(m, lerpOpMat(a.ops[i], sameShape ? b.ops![i] : undefined, sameShape ? f : 0));
  }
  if (ox !== 0 || oy !== 0) {
    m = mul(mul([1, 0, 0, 1, ox, oy], m), [1, 0, 0, 1, -ox, -oy]);
  }
  return { m, op };
}

function AnimGroup({
  clock,
  anim,
  origin,
  base,
  children,
}: {
  clock: SharedValue<number>;
  anim: Anim;
  origin: [number, number] | undefined;
  /** static transform applied outside the animation (SVG attr / CSS translate) */
  base: Op[];
  children: ReactNode;
}) {
  const frames = KEYFRAMES[anim.k];
  const ox = origin ? origin[0] : 0;
  const oy = origin ? origin[1] : 0;
  // `base` never changes for a mounted layer — compose it once, not 60× a second
  const baseM = useMemo(() => opsMat(base, 0, 0), [base]);
  const isBase = baseM === IDENTITY;
  const props = useAnimatedProps(() => {
    if (!frames || frames.length === 0) return { matrix: IDENTITY, opacity: 1 };
    const elapsed = clock.value - anim.delay;
    const t = elapsed <= 0 ? 0 : (elapsed % anim.dur) / anim.dur;
    const s = sampleMat(frames, t, anim.ease, ox, oy);
    return { matrix: isBase ? s.m : mul(baseM, s.m), opacity: s.op };
  });
  return <AnimatedG animatedProps={props}>{children}</AnimatedG>;
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
  const tr = /(?:^|;)\s*translate:\s*(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(css);
  return {
    anim: {
      k: m[1],
      dur: Math.round(parseFloat(m[2]) * 1000),
      delay: m[4] ? Math.round(parseFloat(m[4]) * 1000) : 0,
      ease: m[3] === 'linear' ? 'lin' : m[3] === 'ease-out' ? 'out' : 'io',
    },
    origin: o ? [parseFloat(o[1]), parseFloat(o[2])] : undefined,
    tr: tr ? [['t', parseFloat(tr[1]), parseFloat(tr[2])]] : undefined,
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

function attrs(a: Record<string, string | number> | undefined) {
  if (!a) return {};
  const out: Record<string, string | number> = {};
  for (const k of Object.keys(a)) out[ATTR[k] ?? k] = a[k];
  return out;
}

function matrixTransform(ops: Op[]): string | undefined {
  if (ops.length === 0) return undefined;
  return `matrix(${opsMat(ops, 0, 0).join(' ')})`;
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

  const base: Op[] = [
    ...(n.tr ? ([['t', n.tr[0], n.tr[1]]] as Op[]) : []),
    ...(boundAnim?.tr ?? []),
    ...(n.tf ?? []),
    ...(n.bind ? parseOps(String(flags[n.bind] ?? '')) : []),
  ];
  const anim = n.anim ?? boundAnim?.anim;
  const origin = n.o ?? boundAnim?.origin;

  const body =
    n.t === 'g' ? (
      kids
    ) : SHAPES[n.t] ? (
      (() => {
        const Shape = SHAPES[n.t];
        return <Shape {...attrs(n.a)} />;
      })()
    ) : (
      <Fragment>{kids}</Fragment>
    );

  if (anim && live) {
    return (
      <AnimGroup clock={clock} anim={anim} origin={origin} base={base}>
        {body}
      </AnimGroup>
    );
  }
  if (anim) {
    // frozen: bake the first frame in, so a grid of thumbnails costs
    // nothing per frame and mounts no animated views
    const frames = KEYFRAMES[anim.k];
    const s0 = frames?.length
      ? sampleMat(frames, 0, anim.ease, origin ? origin[0] : 0, origin ? origin[1] : 0)
      : { m: IDENTITY, op: 1 };
    const m = mul(opsMat(base, 0, 0), s0.m);
    return (
      <G transform={`matrix(${m.join(' ')})`} opacity={s0.op}>
        {body}
      </G>
    );
  }
  const t = matrixTransform(base);
  if (t) return <G transform={t}>{body}</G>;
  return n.t === 'g' ? <G>{body}</G> : <>{body}</>;
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
  const flags = koaFlags(expression, pose, worn);
  const height = size * KOA_ASPECT;

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
      const on = animated && AppState.currentState === 'active';
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

  return (
    <View style={{ width: size, height }} pointerEvents="none">
      <Svg width={size} height={height} viewBox={KOA_VIEWBOX} preserveAspectRatio="xMidYMax meet">
        {NODES.map((n, i) => (
          <RenderNode key={i} n={n} flags={flags} clock={clock} live={animated} />
        ))}
      </Svg>
    </View>
  );
}
