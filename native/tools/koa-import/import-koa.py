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
import json, re, sys
from xml.etree import ElementTree as ET

SRC, OUT = sys.argv[1], sys.argv[2]
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

style_css = raw[raw.find('<style>') + 7: raw.find('</style>')]
KEYFRAMES = {}
for name, body in re.findall(r'@keyframes (\w+) \{(.*?)\}\s*(?=@keyframes|\Z)', style_css, re.S):
    frames = []
    for stops, decl in re.findall(r'([\d.%,\s]+)\{([^}]*)\}', body):
        offsets = [float(x) / 100 for x in re.findall(r'([\d.]+)%', stops)]
        f = {}
        m = re.search(r'transform:([^;}]*)', decl)
        if m: f['ops'] = parse_ops(m.group(1))
        m = re.search(r'opacity:\s*([\d.]+)', decl)
        if m: f['op'] = float(m.group(1))
        for o in offsets:
            frames.append(dict(f, o=o))
    KEYFRAMES[name] = sorted(frames, key=lambda f: f['o'])

# ── SVG tree ──────────────────────────────────────────────────────────────
svg = raw[raw.find('<svg'): raw.find('</svg>') + 6]
# <sc-if value="{{ flag }}"> is not valid XML on its own; make it an element
svg = re.sub(r'<sc-if value="\{\{\s*(\w+)\s*\}\}"[^>]*>', r'<scif flag="\1">', svg)
svg = svg.replace('</sc-if>', '</scif>')
root = ET.fromstring(svg)

ANIM = re.compile(r'(\w+)\s+([\d.]+)s\s+([\w-]+)(?:\s+([\d.]+)s)?\s+infinite')
TAGS = {'g', 'path', 'ellipse', 'circle', 'rect', 'line', 'defs', 'clipPath'}
NUM = {'cx','cy','rx','ry','r','x','y','width','height','stroke-width','opacity'}

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
    m = re.search(r'(?:^|;)\s*translate:\s*(-?[\d.]+)px\s+(-?[\d.]+)px', st)
    if m: out['tr'] = [float(m.group(1)), float(m.group(2))]
    m = re.search(r'(?:^|;)\s*transform:\s*([^;]+)', st)
    if m and 'anim' not in out: out['tf'] = parse_ops(m.group(1))
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
export interface Frame {{ o: number; ops?: Op[]; op?: number }}
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
  kids?: Node[];
}}

export const KEYFRAMES: Record<string, Frame[]> = {ts(KEYFRAMES)};

export const NODES: Node[] = {ts(NODES)};
''')
print(f'keyframes: {len(KEYFRAMES)}  nodes(top): {len(NODES)}  bytes: {len(open(OUT,encoding="utf-8").read())}')
