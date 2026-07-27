#!/usr/bin/env python3
"""
Convert the design tool's `Koa.dc.html` export into TypeScript the app can
render.

The export is an SVG whose layers are switched by `<sc-if value="{{ flag }}">`
and animated by CSS `@keyframes`. React Native has neither, so this emits:

  * KEYFRAMES — every @keyframes as sampled data (offset, transform ops,
    opacity), so one generic interpolator can drive all of them;
  * NODES — the SVG tree, with each node's conditional flag, static or bound
    transform, and animation reference attached.

`koa-figure.tsx` evaluates the flags and walks that tree. Re-run this after
any design update instead of hand-transcribing:

    python3 tools/koa-import/import-koa.py <Koa.dc.html> src/components/ascnd/koa/koa-scene.ts
"""
import json, math, re, sys
from xml.etree import ElementTree as ET

# `--room` imports a static scene (the Mascot Room backdrop) instead of the
# character: same tree walk, no flags, no keyframes.
ROOM = '--room' in sys.argv
argv = [a for a in sys.argv[1:] if not a.startswith('--')]
SRC, OUT = argv[0], argv[1]
raw = open(SRC, encoding='utf-8').read()

# ── @keyframes ────────────────────────────────────────────────────────────
def parse_ops(css):
    """CSS/SVG transform string → [['r',deg] | ['t',x,y] | ['s',sx,sy]]"""
    ops = []
    for fn, args in re.findall(r'(rotate|translate|translateX|translateY|scale|scaleX|scaleY)\(([^)]*)\)', css):
        n = [float(x) for x in re.findall(r'-?\d*\.?\d+', args)]
        if fn == 'rotate':
            # SVG allows rotate(deg cx cy); CSS only rotate(deg)
            ops.append(['r', n[0], n[1], n[2]] if len(n) == 3 else ['r', n[0]])
        elif fn == 'translate':   ops.append(['t', n[0], n[1] if len(n) > 1 else 0])
        elif fn == 'translateX':  ops.append(['t', n[0], 0])
        elif fn == 'translateY':  ops.append(['t', 0, n[0]])
        elif fn == 'scale':       ops.append(['s', n[0], n[1] if len(n) > 1 else n[0]])
        elif fn == 'scaleX':      ops.append(['s', n[0], 1])
        elif fn == 'scaleY':      ops.append(['s', 1, n[0]])
    return ops

IDENT = {'r': ['r', 0.0], 't': ['t', 0.0, 0.0], 's': ['s', 1.0, 1.0]}

def mat(ops):
    """a transform list → [a,b,c,d,e,f]"""
    m = [1, 0, 0, 1, 0, 0]
    for o in ops:
        if o[0] == 'r':
            r = math.radians(o[1]); n = [math.cos(r), math.sin(r), -math.sin(r), math.cos(r), 0, 0]
        elif o[0] == 't':
            n = [1, 0, 0, 1, o[1], o[2]]
        else:
            n = [o[1], 0, 0, o[2], 0, 0]
        m = [m[0]*n[0] + m[2]*n[1], m[1]*n[0] + m[3]*n[1],
             m[0]*n[2] + m[2]*n[3], m[1]*n[2] + m[3]*n[3],
             m[0]*n[4] + m[2]*n[5] + m[4], m[1]*n[4] + m[3]*n[5] + m[5]]
    return m

def decompose(ops):
    """a transform list → translate · rotate · scale, CSS's own `unmatrix`"""
    a, b, c, d, e, f = mat(ops)
    sx = math.hypot(a, b)
    if sx: a, b = a / sx, b / sx
    shear = a * c + b * d
    c, d = c - a * shear, d - b * shear
    sy = math.hypot(c, d)
    if a * d - b * c < 0: sx = -sx
    return [['t', round(e, 5), round(f, 5)],
            ['r', round(math.degrees(math.atan2(b, a)), 5)],
            ['s', round(sx, 5), round(sy, 5)]]

def link(frames, name):
    """Pair every stop with the next one, matched up the way CSS matches them.

    Interpolation happens between adjacent keyframes, so the matching is
    pairwise. When the two lists name the same functions and one is merely
    shorter — `rotate(-16deg)` against `rotate(17deg) translateY(-9px)
    scale(.94)`, which is how the run legs are written — CSS pads the short
    one with identity functions. When they name different functions, it
    falls back to interpolating the decomposed matrices instead. Resolving
    both here leaves the runtime a single component-wise lerp.
    """
    for i, f in enumerate(frames[:-1]):
        x, y = f['ops'], frames[i + 1]['ops']
        n = min(len(x), len(y))
        if all(x[j][0] == y[j][0] for j in range(n)):
            sig = x if len(x) > len(y) else y
            f['to'] = y + [IDENT[o[0]] for o in sig[len(y):]]
            f['ops'] = x + [IDENT[o[0]] for o in sig[len(x):]]
        else:
            f['ops'], f['to'] = decompose(x), decompose(y)
            if name not in MIXED: MIXED.append(name)
    return frames

MIXED = []

style_css = '' if ROOM else raw[raw.find('<style>') + 7: raw.find('</style>')]
KEYFRAMES = {}
for name, body in re.findall(r'@keyframes (\w+) \{(.*?)\}\s*(?=@keyframes|\Z)', style_css, re.S):
    # One track per property, not one list of frames. CSS animates each
    # property across only the stops that declare it — `0% { transform: …;
    # opacity: 0 } 25% { opacity: .95 } 100% { transform: …; opacity: 0 }`
    # is a two-stop transform and a three-stop opacity, so the drop keeps
    # travelling through the middle stop instead of snapping back.
    tf, op = [], []
    for stops, decl in re.findall(r'([\d.%,\s]+)\{([^}]*)\}', body):
        offsets = [float(x) / 100 for x in re.findall(r'([\d.]+)%', stops)]
        mt = re.search(r'transform:([^;}]*)', decl)
        mo = re.search(r'opacity:\s*([\d.]+)', decl)
        for o in offsets:
            if mt: tf.append({'o': o, 'ops': parse_ops(mt.group(1))})
            if mo: op.append({'o': o, 'v': float(mo.group(1))})
    track = {}
    if tf: track['tf'] = link(sorted(tf, key=lambda f: f['o']), name)
    if op: track['op'] = sorted(op, key=lambda f: f['o'])
    KEYFRAMES[name] = track

# ── SVG tree ──────────────────────────────────────────────────────────────
if ROOM:
    # the page holds several <svg>s (the scene, a legend, a thumbnail); the
    # scene is the one with the most elements
    best, at = '', 0
    while True:
        i = raw.find('<svg', at)
        if i < 0: break
        j = raw.find('</svg>', i) + 6
        cand = raw[i:j]
        if cand.count('<') > best.count('<'): best = cand
        at = j
    svg = best
    m = re.search(r'viewBox="([^"]+)"', svg)
    VIEWBOX = m.group(1) if m else '0 0 360 340'
else:
    svg = raw[raw.find('<svg'): raw.find('</svg>') + 6]
# <sc-if value="{{ flag }}"> is not valid XML on its own; make it an element
svg = re.sub(r'<sc-if value="\{\{\s*(\w+)\s*\}\}"[^>]*>', r'<scif flag="\1">', svg)
svg = svg.replace('</sc-if>', '</scif>')
root = ET.fromstring(svg)

ANIM = re.compile(r'(\w+)\s+([\d.]+)s\s+([\w-]+)(?:\s+([\d.]+)s)?\s+infinite')
TAGS = {'g', 'path', 'ellipse', 'circle', 'rect', 'line', 'defs', 'clipPath',
        'polygon', 'polyline', 'text', 'tspan',
        'linearGradient', 'radialGradient', 'stop'}
NUM = {'cx','cy','rx','ry','r','x','y','width','height','stroke-width','opacity',
       'x1','y1','x2','y2','font-size','letter-spacing','stroke-dashoffset'}

def style_bits(el):
    st = el.get('style', '')
    out = {}
    m = ANIM.search(st)
    if m:
        name, dur, ease, delay = m.group(1), float(m.group(2)) * 1000, m.group(3), m.group(4)
        out['anim'] = {'k': name, 'dur': round(dur), 'delay': round(float(delay) * 1000) if delay else 0,
                       'ease': {'linear': 'lin', 'ease-out': 'out'}.get(ease, 'io')}
    m = re.search(r'transform-origin:\s*([\d.]+)px\s+([\d.]+)px', st)
    if m: out['o'] = [float(m.group(1)), float(m.group(2))]
    # the CSS `translate` property. `px` is optional on a zero and the y is
    # optional altogether — `translate:6px 0` is what the run legs use, and
    # a stricter pattern silently dropped their 6px offset
    m = re.search(r'(?:^|;)\s*translate:\s*(-?[\d.]+)(?:px)?(?:\s+(-?[\d.]+)(?:px)?)?', st)
    if m: out['tr'] = [float(m.group(1)), float(m.group(2) or 0)]
    # kept even alongside an animation: whether it survives is the runtime's
    # call, and it depends on whether that animation's keyframes touch
    # `transform` at all
    m = re.search(r'(?:^|;)\s*transform:\s*([^;]+)', st)
    if m: out['tf'] = parse_ops(m.group(1))
    return out

def walk(el):
    tag = el.tag.split('}')[-1]
    if tag == 'scif':
        kids = [walk(c) for c in el]
        return {'t': 'g', 'if': el.get('flag'), 'kids': [k for k in kids if k]}
    if tag not in TAGS:
        return None
    node = {'t': tag}
    attrs = {}
    for k, v in el.attrib.items():
        if k in ('style',): continue
        if k == 'transform':
            m = re.fullmatch(r'\{\{\s*(\w+)\s*\}\}', v.strip())
            if m: node['bind'] = m.group(1)
            else: node['tf'] = parse_ops(v)
            continue
        if k == 'id':
            node['id'] = v; continue
        m = re.fullmatch(r'\{\{\s*(\w+)\s*\}\}', v.strip())
        if m:                      # e.g. style="{{ runBob }}" handled above
            continue
        attrs[k] = float(v) if k in NUM and re.fullmatch(r'-?[\d.]+', v) else v
    node.update(style_bits(el))
    # a style="{{ binding }}" carries an animation chosen by the logic
    m = re.fullmatch(r'\{\{\s*(\w+)\s*\}\}', el.get('style', '').strip())
    if m: node['animBind'] = m.group(1)
    if attrs: node['a'] = attrs
    # <text> carries its label as character data
    if el.text and el.text.strip(): node['x'] = el.text.strip()
    kids = [walk(c) for c in el]
    kids = [k for k in kids if k]
    if kids: node['kids'] = kids
    return node

NODES = [n for n in (walk(c) for c in root) if n]

used = sorted({n for n in re.findall(r'"k":\s*"(\w+)"', json.dumps(NODES))} |
              set(re.findall(r'animation:(\w+)', raw)))
KEYFRAMES = {k: v for k, v in KEYFRAMES.items() if k in used}

def ts(o):  # compact, stable JSON for a TS literal
    return json.dumps(o, separators=(',', ':'), ensure_ascii=False)

if ROOM:
    open(OUT, 'w', encoding='utf-8').write(f'''/**
 * GENERATED — do not edit by hand.
 *
 * Source: the Mascot Room page of the design export.
 * Regenerate: python3 tools/koa-import/import-koa.py --room <Mascot Room ….html> {OUT.split('/')[-1]}
 *
 * The room backdrop: a static SVG scene, no flags and no animation, so this
 * is the tree and nothing else. `koa-room.tsx` draws it.
 */

import type {{ Node }} from '@/components/ascnd/koa/koa-scene';

export const ROOM_VIEWBOX = '{VIEWBOX}';

export const ROOM_NODES: Node[] = {ts(NODES)};
''')
    print(f'room: {len(NODES)} nodes(top)  viewBox {VIEWBOX}  bytes: {len(open(OUT,encoding="utf-8").read())}')
    sys.exit(0)

open(OUT, 'w', encoding='utf-8').write(f'''/**
 * GENERATED — do not edit by hand.
 *
 * Source: the design tool's `Koa.dc.html` export.
 * Regenerate: python3 tools/koa-import/import-koa.py <Koa.dc.html> {OUT.split('/')[-1]}
 *
 * `KEYFRAMES` holds every CSS @keyframes as data; `NODES` is the SVG tree
 * with each layer's conditional flag, transform and animation attached.
 * `koa-figure.tsx` evaluates the flags and renders this.
 */

/** one transform step: rotate(deg[,cx,cy]) | translate(x,y) | scale(sx,sy) */
export type Op = [string, ...number[]];
export interface TFrame {{
  o: number;
  ops: Op[];
  /** the next stop's list, already matched to `ops` function for function */
  to?: Op[];
}}
export interface OFrame {{ o: number; v: number }}
/**
 * One track per animated property. A track that is absent means the
 * animation leaves that property alone, so the element's own attribute
 * still applies; a track that is present replaces it outright, the way a
 * CSS animation outranks a presentation attribute.
 */
export interface Track {{ tf?: TFrame[]; op?: OFrame[] }}
export interface Anim {{ k: string; dur: number; delay: number; ease: string }}
export interface Node {{
  t: string;
  id?: string;
  /** render only when this flag is true */
  if?: string;
  a?: Record<string, string | number>;
  tf?: Op[];
  /** transform supplied by the logic layer, by name */
  bind?: string;
  /** animation supplied by the logic layer, by name */
  animBind?: string;
  anim?: Anim;
  /** CSS `translate` property — applies outside `transform` */
  tr?: [number, number];
  /** transform-origin, in the element's own coordinates */
  o?: [number, number];
  /** character data — `<text>` carries its label here */
  x?: string;
  kids?: Node[];
}}

export const KEYFRAMES: Record<string, Track> = {ts(KEYFRAMES)};

export const NODES: Node[] = {ts(NODES)};
''')
print(f'mixed-list keyframes (interpolated as matrices): {MIXED}')
print(f'keyframes: {len(KEYFRAMES)}  nodes(top): {len(NODES)}  bytes: {len(open(OUT,encoding="utf-8").read())}')
