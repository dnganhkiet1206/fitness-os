import { type Flags } from '@/components/ascnd/koa/koa-flags';
import { NODES, type Node, type Op } from '@/components/ascnd/koa/koa-scene';

/**
 * Koa standing under the studio's lamp.
 *
 * The room has one light in it, hanging above the podium, and the export has
 * one flat colour per surface — a character lit the same from its ears to its
 * feet reads as pasted onto the room rather than standing in it.
 *
 * ── what this is not ──
 *
 * The first version multiplied every fill by a factor of at most 1, one
 * factor per element. Both halves of that were wrong.
 *
 * Nothing may come out *dimmer overall*. A lamp adds light; it does not take
 * the white out of a white mascot. So the ramp starts **above** 1 — the crown
 * and the ears come out brighter than the artwork and only the lower body goes
 * under. Scaling everything down turned a white koala grey, which is a
 * different character, not a lit one.
 *
 * And one factor per element cannot shade anything. An ear is a single path,
 * so a per-element factor makes it a flat tone, its top and bottom identical —
 * which is exactly the "100% / 100%" the design was complaining about. What an
 * ear needs is 105 at the top and 95 at the bottom, and that is a gradient
 * inside one shape.
 *
 * ── how ──
 *
 * Every colour becomes a two-stop vertical gradient in **user space**, running
 * the height of the figure. One gradient serves every element that shares a
 * colour and a coordinate system, which across all sixty poses comes to ten
 * gradients in total.
 *
 * Working in user space rather than per element is what makes it seamless. Two
 * shapes of the same colour that overlap take their paint from the same ramp
 * at the same place, so they agree exactly — which matters more than it
 * sounds, because the export contains shapes whose only job is to be
 * invisible. `head_top_fur` is two tufts plus `M99 38 L141 38 L141 66 L99 66
 * Z`, a plain rectangle in the head's own colour hiding where the tufts are
 * rooted; give it a fill of its own and it is a grey patch on the forehead.
 * Here it cannot be — it is painted from the head's ramp at the head's own
 * coordinates.
 *
 * Elements inside a transformed group get that same global ramp, mapped back
 * through the inverse of the transform, so the light stays vertical in the
 * room however a limb is turned.
 *
 * The one thing a browser preview cannot settle is whether `react-native-svg`
 * resolves `userSpaceOnUse` inside a nested transformed group the way the spec
 * says. Most of the figure sits at identity, where there is nothing to
 * resolve; a limb is where to look first if the device disagrees.
 */

/* ── the ramp ─────────────────────────────────────────────────────────── */

/** the figure's own viewBox is 240 × 300 */
const Y_TOP = 20;
const Y_BOT = 275;
/** above the artwork at the crown, under it at the feet */
const TOP_GAIN = 1.1;
const FOOT = 0.84;
/**
 * Below 1, so the ramp is steepest at the top.
 *
 * A straight line spends its whole range on the whole figure, which leaves any
 * one part nearly flat: the ear covers 70 of the figure's 255 points, so a
 * linear ramp gave it 102 at the top and 97 at the bottom — five points, which
 * is not enough to round it. The design asked for 105 and 95. Crowding the
 * loss into the first third gives the ear 104 → 96 and still leaves the feet
 * at 84, where a linear ramp steep enough to do the same would have taken them
 * to about 70 and put the grey back.
 */
const BIAS = 0.6;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** how much of the lamp reaches height `y`, as a multiple of the flat colour */
export function shadeAt(y: number): number {
  const t = clamp01((y - Y_TOP) / (Y_BOT - Y_TOP));
  return TOP_GAIN - (TOP_GAIN - FOOT) * Math.pow(t, BIAS);
}

/**
 * Where the gradient's stops go.
 *
 * The ramp is a curve now, so two stops no longer describe it — and it is
 * steepest at the very top, which is where the stops have to crowd. Straight
 * between 0 and 0.15 the error peaks at about 1.3% of a colour; the extra stop
 * at 0.05 takes it under half.
 */
const STOPS = [0, 0.05, 0.15, 0.35, 0.65, 1];

/**
 * The gold the podium's ring throws back up.
 *
 * The stage has a lit ring round it, so the undersides of the figure — the
 * soles, the low belly, the edge of a hand — do not sit in plain shadow: they
 * take a little of that gold back. It is worth almost nothing and it is worth
 * doing, which is a fair description of most bounce light.
 *
 * It needs no pass of its own. The ramp already paints every colour from the
 * crown down, so the bounce is a warm bias on its lower stops: mix the ring's
 * colour in at up to five percent below the chest. At the foot that moves
 * (168, 175, 181) to (172, 174, 176) — the same luminance to within half a
 * unit, and warm instead of blue. A pass would have cost gradients and shapes
 * to arrive at the same pixels.
 */
const BOUNCE_COLOUR = '#FFC24D';
const BOUNCE_TOP = 170;
const BOUNCE_MAX = 0.05;

function bounceAt(y: number): number {
  return BOUNCE_MAX * clamp01((y - BOUNCE_TOP) / (Y_BOT - BOUNCE_TOP));
}

/**
 * The export's shadow grey, and what it becomes.
 *
 * `#AEB6BF` is a *light* grey drawn at low opacity — it was designed for a
 * white page, where light grey over white darkens. On the podium's dark plum
 * it lightens: measured, it put a smudge of 108 on a surface of 50. A shadow
 * brighter than the floor it falls on is the other half of "grey has been
 * poured over Koa". It takes no ramp either; a shadow is the absence of light.
 */
const SHADOW_GREY = '#AEB6BF';
export const SHADOW_COLOUR = '#120C18';

/* ── the rim ──────────────────────────────────────────────────────────── */

/**
 * The line the lamp draws along the top of a form.
 *
 * Not a glow and not an outline: a glow spreads, an outline goes all the way
 * round, and a rim light is the top contour only — the part of the surface
 * turned toward the lamp. So it is a stroke whose paint fades out over the
 * first sixth of the shape's own height, in `objectBoundingBox` units, which
 * is what lets one gradient serve every shape whatever its size or position.
 * On a round form that first sixth is the arc within about 43° of the apex.
 *
 * It is a second stroke-only pass of the same shape rather than a replacement
 * for the shape's own stroke, so the artwork's hairline outline survives — and
 * because it sits beside the shape inside the same group, it inherits every
 * transform and every animation for free.
 *
 * `RIM_WIDTH` is in viewBox units on a 240-wide board that draws at 128, so
 * 1.8 is a little under a point on screen. Wider stops being a highlight and
 * starts being a stroke.
 */
export const RIM_GRADIENT = 'koaRim';
export const RIM_WIDTH = 1.6;
/** the lamp is #FFC24D; this is that colour coming off a near-white surface */
export const RIM_COLOUR = '#FFE9B8';
export const RIM_STOPS: [number, number][] = [
  [0, 1],
  [0.07, 0.45],
  [0.16, 0],
  [1, 0],
];

/**
 * Which shapes take one.
 *
 * By name, not by size, because a rim only means anything on a *silhouette*
 * edge. `belly` is as large as anything here and sits inside the torso, so a
 * rim along its top would be a bright line across the middle of the body; the
 * inner ears are the same. Nor can containment decide it — the ear's box sits
 * inside the head's and the ear is very much a silhouette.
 *
 * The list covers every pose: `torso_front_run` is the running body, and the
 * arms only exist as separate shapes while the character is standing.
 */
const RIM_IDS = new Set([
  'head_front',
  'ear_left',
  'ear_right',
  'torso_front',
  'torso_front_run',
  'arm_left_upper',
  'arm_right_upper',
]);

/** true when this element should carry a rim light */
export const hasRim = (n: Node): boolean => !!n.id && RIM_IDS.has(n.id);

/* ── the hot spot on the head ─────────────────────────────────────────── */

/**
 * The small bright patch a spotlight leaves on the top of a round head.
 *
 * A second pass of the head's own shapes filled with a soft radial, so it is
 * clipped to the head and needs no geometry of its own. In **user space**, not
 * the shape's box, for the reason the ramps are: `head_top_fur` includes a
 * plain rectangle in the head's colour drawn after the head, and a
 * box-relative gradient would map differently onto it and cut a notch out of
 * the patch. In user space the two agree exactly.
 */
export const GLOW_GRADIENT = 'koaGlow';
export const GLOW_COLOUR = '#FFFFFF';
/** centre and radius on the 240 × 300 board — above the middle of the skull */
export const GLOW_C: [number, number, number] = [120, 76, 62];
export const GLOW_STOPS: [number, number][] = [
  [0, 0.17],
  [0.55, 0.075],
  [1, 0],
];
const GLOW_IDS = new Set(['head_front', 'head_top_fur']);

/* ── the ears ─────────────────────────────────────────────────────────── */

/**
 * The ear is the nearest thing on the figure to the lamp and the global ramp
 * cannot say so: it covers 70 of the board's 255 points, so it takes about
 * eight points of a ramp that has the whole body to spend. Reading as "top
 * lit, underside in shadow" is the ear's own business, so this pass is in the
 * shape's **own box** — white over the upper third, dark under the lower
 * third, nothing across the middle. One gradient, both ears, whatever size
 * they are drawn at.
 */
export const FORM_GRADIENT = 'koaForm';
export const FORM_STOPS: [number, string, number][] = [
  [0, '#FFFFFF', 0.25],
  [0.4, '#FFFFFF', 0],
  [0.58, '#1A1420', 0],
  [1, '#1A1420', 0.22],
];
const FORM_IDS = new Set(['ear_left', 'ear_right']);

/**
 * The same idea across the shoulders, at half the strength.
 *
 * The torso and the upper arms are three or four times the height of an ear,
 * so the ear's amplitude spread over them fights the figure's own ramp and
 * takes the belly too dark. What the shoulders need is only the top eighth
 * lifted: the lamp is straight overhead, so that is the one part of the body
 * turned toward it.
 */
export const BODY_GRADIENT = 'koaBody';
export const BODY_STOPS: [number, string, number][] = [
  [0, '#FFFFFF', 0.28],
  [0.12, '#FFFFFF', 0.12],
  [0.28, '#FFFFFF', 0.03],
  [0.45, '#FFFFFF', 0],
  [1, '#FFFFFF', 0],
];
const BODY_IDS = new Set([
  'torso_front',
  'torso_front_run',
  'arm_left_upper',
  'arm_right_upper',
]);

/* ── the shadow on the podium ─────────────────────────────────────────── */

/**
 * Soft at the edge — but only as wide as the figure's own box allows.
 *
 * The export draws a flat ellipse 64 × 9 at one opacity — a hard-edged disc,
 * which is what a shadow looks like when the light is a point and the floor is
 * paper. Under a broad lamp on a podium it wants no edge at all, so the
 * softness is a radial: dense in the middle, nothing by the rim. There is no
 * blur to reach for; a filter is a rasterised pass. The spread multiplies
 * whatever the export drew, so the ellipse's own breathing still reads.
 *
 * **It may not be wider than 240 × 300, because that is the whole world this
 * file has.** `KoaFigure` draws into `viewBox="0 0 240 300"` and an SVG
 * viewport clips: at 2 × 2.5 this ellipse ran from −8 to 248 across and down to
 * 316, and was cut into a rectangle with hard edges on three sides. That is
 * what the user saw as "something surrounding the mascot" — not a frame around
 * it, the shadow's own straight cut. `tools/koa-studio/gaze.mjs` now measures
 * the figure's bounding box against the viewBox on every run for exactly this.
 *
 * The wide, soft pool the stage wants is a **room** shadow and lives in
 * `studio/platform.tsx`, where there are 476 units to spread in instead of six
 * below the feet. This one is the dark core that sits inside it — and it is
 * also the only shadow a picker or a grid gets, which is the other reason it
 * cannot be the stage's.
 */
export const SHADOW_GRADIENT = 'koaShadowSoft';
/**
 * Across, and along.
 *
 * Both sized to the box, not to taste. 64 × 1.15 = 74 half-width against the
 * 120 available, and 9 × 0.66 = 5.9 against the six units of floor between the
 * ellipse's centre at y=294 and the viewBox's bottom edge. The export's own
 * ry of 9 reached y=303 and was cut flat — three units of hard edge that
 * predate every change here, at 45% opacity before the gradient softened it.
 */
export const SHADOW_SPREAD: [number, number] = [1.15, 0.66];
export const SHADOW_STOPS: [number, number][] = [
  [0, 1],
  [0.4, 0.78],
  [0.72, 0.3],
  [1, 0],
];

/** true when this element is one of the export's shadow shapes */
export const isShadow = (n: Node): boolean =>
  typeof n.a?.fill === 'string' && n.a.fill.toUpperCase() === SHADOW_GREY;

/* ── coordinate systems ───────────────────────────────────────────────── */

type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];

function mul(m: M, n: M): M {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function opMat(op: Op): M {
  if (op[0] === 'r') {
    const r = (op[1] * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const m: M = [c, s, -s, c, 0, 0];
    if (op.length === 4) {
      return mul(mul([1, 0, 0, 1, op[2], op[3]], m), [1, 0, 0, 1, -op[2], -op[3]]);
    }
    return m;
  }
  if (op[0] === 't') return [1, 0, 0, 1, op[1], op[2]];
  return [op[1], 0, 0, op[2], 0, 0];
}

/**
 * The element's own static transform — its rest pose, not its animation.
 *
 * A running limb therefore carries its ramp with it rather than sliding
 * through a fixed one. The motions are a few points wide and the ramp loses a
 * quarter over 255, so that is under half a percent; holding the gradient
 * still would mean recomputing it every frame.
 */
function localMat(n: Node): M {
  let m: M = ID;
  if (n.tr) m = mul(m, [1, 0, 0, 1, n.tr[0], n.tr[1]]);
  if (n.tf) {
    let t: M = ID;
    for (const op of n.tf) t = mul(t, opMat(op));
    if (n.o) t = mul(mul([1, 0, 0, 1, n.o[0], n.o[1]], t), [1, 0, 0, 1, -n.o[0], -n.o[1]]);
    m = mul(m, t);
  }
  return m;
}

/** where a global point lands in a local coordinate system */
function invert(m: M, x: number, y: number): [number, number] {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return [x, y];
  const px = x - m[4];
  const py = y - m[5];
  return [(px * m[3] - py * m[2]) / det, (py * m[0] - px * m[1]) / det];
}

/* ── the gradients ────────────────────────────────────────────────────── */

/** `#rgb`, `#rrggbb` — anything else (a gradient ref, `none`) is left alone */
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const channels = (hex: string): [number, number, number] => {
  const h = hex.slice(1);
  const w = h.length === 3;
  const p = (i: number) => parseInt(w ? h[i].repeat(2) : h.slice(i * 2, i * 2 + 2), 16);
  return [p(0), p(1), p(2)];
};

/** the colour at height `y`: the lamp's falloff, then the ring's bounce */
function paint(hex: string, y: number): string {
  const k = shadeAt(y);
  const b = bounceAt(y);
  const c = channels(hex);
  const g = channels(BOUNCE_COLOUR);
  return `#${c
    .map((v, i) => {
      const lit = v * k * (1 - b) + g[i] * b;
      return Math.max(0, Math.min(255, Math.round(lit)))
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

export interface LightRamp {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** offset → colour, along the ramp */
  stops: [number, string][];
}

const ALL: LightRamp[] = [];
/** colour + coordinate system → the gradient that serves it */
const RAMP = new Map<string, string>();
/** which coordinate system each element is in */
const SPACE = new Map<Node, string>();
/** the head's hot spot, once per coordinate system it is needed in */
const GLOW = new Map<Node, string>();
const FORM = new Set<Node>();
const BODY = new Set<Node>();
export interface GlowSpot {
  id: string;
  cx: number;
  cy: number;
  r: number;
}
const GLOWS: GlowSpot[] = [];
const GLOW_BY_SPACE = new Map<string, string>();
const SPACE_MAT = new Map<string, M>();
/** which gradients each element wants, so a pose can ask for only its own */
const USES = new Map<Node, string[]>();

function rampFor(colour: string, space: string): string {
  const key = `${colour}@${space}`;
  const found = RAMP.get(key);
  if (found) return found;
  const m = SPACE_MAT.get(space) as M;
  const [x1, y1] = invert(m, 0, Y_TOP);
  const [x2, y2] = invert(m, 0, Y_BOT);
  const id = `koaL${ALL.length}`;
  ALL.push({
    id,
    x1,
    y1,
    x2,
    y2,
    stops: STOPS.map((o) => [o, paint(colour, Y_TOP + o * (Y_BOT - Y_TOP))]),
  });
  RAMP.set(key, id);
  return id;
}

function glowFor(space: string): string {
  const found = GLOW_BY_SPACE.get(space);
  if (found) return found;
  const m = SPACE_MAT.get(space) as M;
  const [cx, cy] = invert(m, GLOW_C[0], GLOW_C[1]);
  // a circle stays a circle under the rig's rotations and uniform scales; the
  // radius only needs the scale back out of it
  const s = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  const id = `${GLOW_GRADIENT}${GLOWS.length}`;
  GLOWS.push({ id, cx, cy, r: GLOW_C[2] / s });
  GLOW_BY_SPACE.set(space, id);
  return id;
}

/** the hot-spot gradients a pose needs, alongside its ramps */
export function glowsFor(flags: Flags): GlowSpot[] {
  const want = new Set<string>();
  (function walk(nodes: Node[]) {
    for (const n of nodes) {
      if (n.if && !flags[n.if]) continue;
      const g = GLOW.get(n);
      if (g) want.add(g);
      if (n.kids) walk(n.kids);
    }
  })(NODES);
  return GLOWS.filter((g) => want.has(g.id));
}

/** true when this element carries the head's hot spot */
export const hasGlow = (n: Node): string | undefined => GLOW.get(n);
/** true when this element carries the ear's own top-lit / underside shading */
export const hasForm = (n: Node): boolean => FORM.has(n);
/** true when this element takes the shoulders' lighter version of it */
export const hasBody = (n: Node): boolean => BODY.has(n);

// Built eagerly, not on first paint: `koa-figure.tsx` renders `<Defs>` before
// it renders the tree that would populate a lazy table, so a lazy table is
// empty exactly when it is needed and every fill resolves to a dangling
// reference. Once, at module load.
(function walk(nodes: Node[], parent: M, glowing: boolean) {
  for (const n of nodes) {
    const m = mul(parent, localMat(n));
    const key = m.map((v) => v.toFixed(3)).join(',');
    if (!SPACE_MAT.has(key)) SPACE_MAT.set(key, m);
    SPACE.set(n, key);
    // the hot spot is inherited: `head_top_fur` is a group, and it is the
    // paths inside it that have to carry the pass or the filler rectangle
    // punches a hole in it
    const lit = glowing || (!!n.id && GLOW_IDS.has(n.id));
    if (lit && n.t !== 'g' && typeof n.a?.fill === 'string' && HEX.test(n.a.fill)) {
      GLOW.set(n, glowFor(key));
    }
    if (n.id && FORM_IDS.has(n.id)) FORM.add(n);
    if (n.id && BODY_IDS.has(n.id)) BODY.add(n);
    const ids: string[] = [];
    for (const p of [n.a?.fill, n.a?.stroke]) {
      if (typeof p === 'string' && HEX.test(p) && p.toUpperCase() !== SHADOW_GREY) ids.push(rampFor(p, key));
    }
    if (ids.length) USES.set(n, ids);
    if (n.kids) walk(n.kids, m, lit);
  }
})(NODES, ID, false);

/* ── applying it ──────────────────────────────────────────────────────── */

/**
 * The gradients one set of flags actually needs.
 *
 * Every branch of the export together comes to 92 ramps, and `<Defs>` holds
 * native nodes whether or not anything references them. A pose uses ten or so,
 * and `koa-figure.tsx` already rebuilds only when the flags change, so the
 * defs are rebuilt on the same terms.
 */
export function rampsFor(flags: Flags): LightRamp[] {
  const want = new Set<string>();
  (function walk(nodes: Node[]) {
    for (const n of nodes) {
      if (n.if && !flags[n.if]) continue;
      const ids = USES.get(n);
      if (ids) for (const id of ids) want.add(id);
      if (n.kids) walk(n.kids);
    }
  })(NODES);
  return ALL.filter((r) => want.has(r.id));
}

/**
 * Put the lamp on one element's props.
 *
 * Returns the same object when there is nothing to do, which is the common
 * case: groups, and anything already filled with a gradient.
 */
export function litProps<T extends Record<string, string | number>>(n: Node, props: T): T {
  const space = SPACE.get(n);
  if (space === undefined) return props;
  let out = props;
  for (const key of ['fill', 'stroke'] as const) {
    const v = props[key];
    if (typeof v !== 'string' || !HEX.test(v)) continue;
    const paint =
      v.toUpperCase() === SHADOW_GREY ? `url(#${SHADOW_GRADIENT})` : `url(#${rampFor(v, space)})`;
    if (out === props) out = { ...props };
    (out as Record<string, string | number>)[key] = paint;
  }
  if (isShadow(n)) {
    if (out === props) out = { ...props };
    const o = out as Record<string, string | number>;
    if (typeof o.rx === 'number') o.rx *= SHADOW_SPREAD[0];
    if (typeof o.ry === 'number') o.ry *= SHADOW_SPREAD[1];
    if (typeof o.r === 'number') o.r *= SHADOW_SPREAD[0];
  }
  return out;
}
