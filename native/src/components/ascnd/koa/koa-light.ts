import { NODES, type Node, type Op } from '@/components/ascnd/koa/koa-scene';

/**
 * Koa standing under the studio's lamp.
 *
 * The room has one light in it, hanging above the podium, and the figure was
 * being drawn at full strength from its ears to its feet — every surface the
 * same, which is what makes flat art look pasted on rather than lit. This
 * shades each part by where it sits under that lamp.
 *
 * ── why the colours and not an overlay ──
 *
 * The obvious way is a gradient painted over the figure, clipped to it. SVG
 * has no clip for "whatever this group happens to cover": `clip-path` wants a
 * shape, and `mask` wants the figure drawn a second time inside the mask.
 * That doubles ~130 animated elements on a screen that already had to be
 * pulled back for heat. An unclipped gradient rectangle is not an option
 * either — the figure's `Svg` is transparent, so the rectangle would sit over
 * the room as a visible pane.
 *
 * So the light goes into the fills. Every leaf's own colour is multiplied by
 * a factor once, when the tree is built, and the result is a plain hex that
 * costs nothing to draw. Scaling all three channels is also the only darkener
 * that keeps a colour's saturation — the same reason `shadow` is black in the
 * studio's palette.
 *
 * ── the falloff ──
 *
 * Two terms, not one distance. A single radial falloff from a lamp above the
 * head sounds right and does not work: put the lamp far enough away for the
 * light to be even and the sides of the body land within three percent of its
 * middle, and put it close enough to separate them and the crown blows past
 * the chin. Height and width are simply different problems — one is how far
 * the light has travelled, the other is how far the surface has turned away
 * from it — so they get a term each.
 *
 * Measured off the elements that actually get drawn, not off sample points:
 * crown 100, ears 95, head 96, torso 83, belly 81, arms 80, legs 74. Past
 * about a quarter the legs stop looking shaded and start looking like a
 * different character.
 */

/**
 * The figure's own viewBox is 240 × 300. `TOP` is not the crown but the brow:
 * the shading is per element and the head is a single path, so it can only
 * take one value, and anchoring at the crown put that value — the largest
 * surface on the character — at 93%. The whole figure then read dimmer rather
 * than lit. From the brow down, the head lands at 95 and only the ear tufts
 * above it reach 100.
 */
const TOP = 80;
const BOTTOM = 270;
const MID_X = 120;
const HALF = 88;
/** how much is lost from crown to feet, and from the middle to the flank */
const DROP_V = 0.25;
const DROP_H = 0.09;
/**
 * The ramp's shape. It is 1 — a straight line — and it was worth trying to
 * bend: an exponent above 1 holds the head flat and dumps the loss into the
 * legs, which is what a light close overhead does. But with `TOP` already at
 * the brow the head is flat anyway, and every curve above 1.1 took the feet
 * under 72 before the torso had moved. Kept as a constant because it is the
 * knob to reach for if the rig's proportions change.
 */
const CURVE = 1;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function shadeAt(x: number, y: number): number {
  const v = Math.pow(clamp01((y - TOP) / (BOTTOM - TOP)), CURVE);
  const h = clamp01(Math.abs(x - MID_X) / HALF);
  return 1 - DROP_V * v - DROP_H * h * h;
}

/* ── where each element is ────────────────────────────────────────────── */

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

/** the element's own static transform — its rest pose, not any animation */
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

const num = (v: unknown): number => {
  const f = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(f) ? f : 0;
};

/**
 * Anchor points of a path, in its own coordinates.
 *
 * Endpoints only — a curve's control points can sit well outside the ink, and
 * all this needs is somewhere near the middle of the shape.
 */
const ARGS: Record<string, number> = { m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0 };

function pathPoints(d: string): [number, number][] {
  const out: [number, number][] = [];
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) return out;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  let i = 0;
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i];
      i += 1;
      if (cmd === 'z' || cmd === 'Z') {
        x = sx;
        y = sy;
        continue;
      }
    }
    const k = cmd.toLowerCase();
    const n = ARGS[k];
    if (n === undefined) return out;
    const rel = cmd === k;
    const p: number[] = [];
    for (let j = 0; j < n; j++) p.push(parseFloat(tokens[i + j]));
    i += n;
    if (p.some((v) => !Number.isFinite(v))) return out;
    if (k === 'h') x = rel ? x + p[0] : p[0];
    else if (k === 'v') y = rel ? y + p[0] : p[0];
    else {
      const ex = p[n - 2];
      const ey = p[n - 1];
      x = rel ? x + ex : ex;
      y = rel ? y + ey : ey;
    }
    if (k === 'm') {
      sx = x;
      sy = y;
      // a second coordinate pair after M is an implicit L
      cmd = rel ? 'l' : 'L';
    }
    out.push([x, y]);
  }
  return out;
}

type Box = [number, number, number, number];

/** the element's bounding box, in its own coordinates */
function localBox(n: Node): Box | null {
  const a = n.a ?? {};
  switch (n.t) {
    case 'circle': {
      const r = num(a.r);
      return [num(a.cx) - r, num(a.cy) - r, num(a.cx) + r, num(a.cy) + r];
    }
    case 'ellipse':
      return [num(a.cx) - num(a.rx), num(a.cy) - num(a.ry), num(a.cx) + num(a.rx), num(a.cy) + num(a.ry)];
    case 'rect':
      return [num(a.x), num(a.y), num(a.x) + num(a.width), num(a.y) + num(a.height)];
    case 'line':
      return [
        Math.min(num(a.x1), num(a.x2)), Math.min(num(a.y1), num(a.y2)),
        Math.max(num(a.x1), num(a.x2)), Math.max(num(a.y1), num(a.y2)),
      ];
    case 'polygon':
    case 'polyline': {
      const v = String(a.points ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if (v.length < 2) return null;
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
      return hull(pts);
    }
    case 'path':
      return hull(pathPoints(String(a.d ?? '')));
    default:
      return null;
  }
}

function hull(pts: [number, number][]): Box | null {
  if (!pts.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/* ── the shade map ────────────────────────────────────────────────────── */

/** what the lamp gives one element — for the tooling that reports the profile */
export const shadeOf = (n: Node): number | undefined => SHADE.get(n);

/** `#rgb`, `#rrggbb` — anything else (a gradient ref, `none`) is left alone */
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;


const SHADE = new Map<Node, number>();

interface Placed {
  n: Node;
  box: Box;
  fill: string;
}
const placed: Placed[] = [];
/** for the tooling only */

function walk(nodes: Node[], parent: M) {
  for (const n of nodes) {
    const m = mul(parent, localMat(n));
    const b = localBox(n);
    if (b) {
      // axis-aligned, which is all this needs: nothing in the rig is rotated
      // far enough at rest for the difference to change a shade
      const xs = [b[0], b[2]].map((x) => x);
      const ys = [b[1], b[3]].map((y) => y);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const x of xs) {
        for (const y of ys) {
          const px = m[0] * x + m[2] * y + m[4];
          const py = m[1] * x + m[3] * y + m[5];
          if (px < x0) x0 = px;
          if (px > x1) x1 = px;
          if (py < y0) y0 = py;
          if (py > y1) y1 = py;
        }
      }
      const box: Box = [x0, y0, x1, y1];
      SHADE.set(n, shadeAt((x0 + x1) / 2, (y0 + y1) / 2));
      const fill = typeof n.a?.fill === 'string' ? n.a.fill : '';
      if (HEX.test(fill)) placed.push({ n, box, fill });
    }
    if (n.kids) walk(n.kids, m);
  }
}
walk(NODES, ID);

/**
 * Shapes whose whole job is to be invisible against the one beneath them.
 *
 * `head_top_fur` is three paths: two tufts that stick up out of the skull,
 * and `M99 38 L141 38 L141 66 L99 66 Z` — a plain rectangle in the head's own
 * colour, there to hide where the tufts are rooted. It cost nothing while
 * every fill was identical. Shade it by its own centre and it becomes a grey
 * rectangle across the forehead, which is exactly what the first pass drew.
 *
 * The test is containment, not overlap: an arm is the same colour as the
 * torso and overlaps it, and a step between them is wanted — it is the only
 * thing separating the two. A shape sealed *inside* a larger one of the same
 * colour is a different animal, and there is nothing it can be but a patch.
 */
const area = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);
const TOL = 0.5;
const host = new Map<Node, Node>();
for (const inner of placed) {
  let best: Placed | null = null;
  for (const outer of placed) {
    if (outer === inner || outer.fill !== inner.fill) continue;
    if (
      outer.box[0] <= inner.box[0] + TOL &&
      outer.box[1] <= inner.box[1] + TOL &&
      outer.box[2] >= inner.box[2] - TOL &&
      outer.box[3] >= inner.box[3] - TOL &&
      area(outer.box) > area(inner.box) &&
      (!best || area(outer.box) < area(best.box))
    ) {
      best = outer;
    }
  }
  if (best) host.set(inner.n, best.n);
}
// follow the chain to the outermost shape before reading any shade, so a
// patch inside a patch inside a body part still ends on the body part
for (const { n } of placed) {
  let h = host.get(n);
  if (!h) continue;
  const seen = new Set<Node>([n]);
  for (;;) {
    const next = host.get(h);
    if (!next || seen.has(h)) break;
    seen.add(h);
    h = next;
  }
  SHADE.set(n, SHADE.get(h) as number);
}

function darken(hex: string, k: number): string {
  const h = hex.slice(1);
  const w = h.length === 3;
  const p = (i: number) => {
    const s = w ? h[i].repeat(2) : h.slice(i * 2, i * 2 + 2);
    return Math.max(0, Math.min(255, Math.round(parseInt(s, 16) * k)));
  };
  return `#${[p(0), p(1), p(2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const cache = new Map<string, string>();

/**
 * Apply the lamp to one element's props.
 *
 * Mutates nothing: it returns the same object when there is nothing to do,
 * which is the common case for groups and for anything filled with a
 * gradient.
 */
export function litProps<T extends Record<string, string | number>>(n: Node, props: T): T {
  const k = SHADE.get(n);
  if (k === undefined || k >= 0.999) return props;
  let out = props;
  for (const key of ['fill', 'stroke'] as const) {
    const v = props[key];
    if (typeof v !== 'string' || !HEX.test(v)) continue;
    const id = `${v}|${k.toFixed(3)}`;
    let lit = cache.get(id);
    if (lit === undefined) {
      lit = darken(v, k);
      cache.set(id, lit);
    }
    if (out === props) out = { ...props };
    (out as Record<string, string | number>)[key] = lit;
  }
  return out;
}
