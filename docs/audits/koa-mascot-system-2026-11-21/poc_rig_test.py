#!/usr/bin/env python3
"""PoC: rotation-only posing of the real Koa figure (KoaSceneData.json).

Question: can the shipped Koa drawing be posed into new readable poses by
rotating its existing parts only (the only mechanism the current pipeline
has), or does it need new geometry/joints?

Method: parse /tmp/koa_scene.json (parsed from KoaSceneData.swift at tip
44862412), flatten every filled leaf shape to polygons, render with PIL at
2x, apply rig-style rotations per variant, measure silhouette IoU vs the
neutral figure + head/ear bounding boxes. No new art is drawn except one
dumbbell prop (rect + circles) for the curl variant.

Limitations (honest): flat fills only — no strokes, no KoaLight procedural
shading, no gradients, no animation keyframes (frozen single frames, not the
18s run loops); face variants other than neutral excluded; wardrobe excluded.
Silhouette IoU is a shape measure, not a readability score — the visual
verdict comes from looking at the PNGs.
"""
import json, math, re, os
from PIL import Image, ImageDraw

OUT = os.path.expanduser("~/workspace/koa-mascot-research/working/poc")
os.makedirs(OUT, exist_ok=True)
W, H, S = 240, 300, 2  # frame, scale

data = json.load(open("/tmp/koa_scene.json"))

EXCLUDE_CONDS = {
    "poseRun", "poseLift", "poseStretch", "poseRelax", "legsSit",
    "turnedView", "torsoRun",
}
# neutral-face conditions allowed; everything else face/wardrobe excluded
ALLOW_CONDS = {None, "armsIdle", "legsStand", "torsoStand", "hipTuft",
               "eyesOpen", "mouthSmile", "browArc"}

def is_excluded(conds):
    for c in conds:
        if c is None:
            continue
        if c.startswith("it_") or c in EXCLUDE_CONDS:
            return True
        if c not in ALLOW_CONDS:
            return True
    return False

# ---------- path flattening ----------
NUM = re.compile(r"-?\d*\.?\d+(?:e-?\d+)?")

def parse_path(d):
    """Return list of polygons (list of (x,y)). Supports M L H V C Q A Z, absolute."""
    tokens = re.findall(r"[MLHVCQAZ]|-?\d*\.?\d+(?:e-?\d+)?", d)
    polys, cur, start = [], [], None
    i, cmd = 0, None
    x = y = 0.0
    def num():
        nonlocal i
        v = float(tokens[i]); i += 1; return v
    while i < len(tokens):
        t = tokens[i]
        if t.isalpha():
            cmd = t; i += 1
            if cmd == "Z":
                if cur:
                    polys.append(cur); cur = []
                    if start: x, y = start
                continue
            if cmd == "M":
                if cur: polys.append(cur); cur = []
                x, y = num(), num(); start = (x, y); cur = [(x, y)]
                continue
        if cmd == "L":
            x, y = num(), num(); cur.append((x, y))
        elif cmd == "H":
            x = num(); cur.append((x, y))
        elif cmd == "V":
            y = num(); cur.append((x, y))
        elif cmd == "C":
            x1, y1, x2, y2, x3, y3 = num(), num(), num(), num(), num(), num()
            p0 = cur[-1] if cur else (x, y)
            for k in range(1, 13):
                t = k / 12
                mt = 1 - t
                px = mt**3*p0[0] + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t**3*x3
                py = mt**3*p0[1] + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t**3*y3
                cur.append((px, py))
            x, y = x3, y3
        elif cmd == "Q":
            x1, y1, x2, y2 = num(), num(), num(), num()
            p0 = cur[-1] if cur else (x, y)
            for k in range(1, 11):
                t = k / 10; mt = 1 - t
                px = mt*mt*p0[0] + 2*mt*t*x1 + t*t*x2
                py = mt*mt*p0[1] + 2*mt*t*y1 + t*t*y2
                cur.append((px, py))
            x, y = x2, y2
        elif cmd == "A":
            # arc: approximate as straight line to endpoint (silhouette only)
            _rx, _ry, _rot, _laf, _sf, x, y = num(), num(), num(), num(), num(), num(), num()
            cur.append((x, y))
        else:
            raise ValueError(f"unsupported cmd {cmd} in {d[:60]}")
    if cur:
        polys.append(cur)
    return [p for p in polys if len(p) >= 3]

def shape_polys(n):
    t, a = n.get("t"), n.get("a") or {}
    if t == "path":
        return parse_path(a.get("d", ""))
    if t == "ellipse":
        cx, cy, rx, ry = a["cx"], a["cy"], a["rx"], a["ry"]
        return [[(cx + rx*math.cos(2*math.pi*k/36), cy + ry*math.sin(2*math.pi*k/36)) for k in range(36)]]
    if t == "circle":
        cx, cy, r = a["cx"], a["cy"], a["r"]
        return [[(cx + r*math.cos(2*math.pi*k/36), cy + r*math.sin(2*math.pi*k/36)) for k in range(36)]]
    if t == "rect":
        x, y, w, h = a["x"], a["y"], a["width"], a["height"]
        return [[(x, y), (x+w, y), (x+w, y+h), (x, y+h)]]
    return []

# ---------- collect leaves ----------
leaves = []  # (polys, fill, chain_ids tuple, conds tuple)
def walk(ns, chain, conds):
    for n in ns:
        t = n.get("t")
        if t in ("defs", "clipPath"):
            continue
        nid = n.get("id")
        if nid in ("koaShoeL", "koaShoeR"):
            continue
        chain2 = chain + ((nid,) if nid else ())
        conds2 = conds + ((n.get("if"),) if n.get("if") else ())
        if t in ("path", "ellipse", "circle", "rect"):
            a = n.get("a") or {}
            fill = a.get("fill")
            if fill and fill != "none" and not is_excluded(conds2):
                leaves.append((shape_polys(n), fill, chain2, conds2))
        if isinstance(n.get("kids"), list):
            walk(n["kids"], chain2, conds2)

walk(data["nodes"], (), ())
print(f"leaves kept (neutral figure): {len(leaves)}")
# Renderer-fidelity fix: the JSON lists four unnamed fur-coloured (#BFC7CF)
# ellipses exactly over the eye whites, AFTER them in tree order. In the
# real app KoaRender restructures the eye group (KoaRender.swift:188
# isEyeGroup + lash paths), so the whites paint on top and the fur ellipses
# are only a ~1px rim. A naive flat painter covers the eyes entirely, so
# drop any leaf whose bbox sits inside an eye-white bbox (+2 units).
def _bb(polys):
    xs = [p[0] for poly in polys for p in poly]
    ys = [p[1] for poly in polys for p in poly]
    return min(xs), min(ys), max(xs), max(ys)
eye_bbs = [_bb(p) for p, _, ch, _ in leaves if "eye_left" in ch or "eye_right" in ch]
before = len(leaves)
leaves = [L for L in leaves
          if not any(_bb(L[0])[0] >= e[0]-2 and _bb(L[0])[1] >= e[1]-2
                     and _bb(L[0])[2] <= e[2]+2 and _bb(L[0])[3] <= e[3]+2
                     and "eye_left" not in L[2] and "eye_right" not in L[2]
                     and "pupil_left" not in L[2] and "pupil_right" not in L[2]
                     for e in eye_bbs)]
print(f"eye-backing leaves dropped: {before - len(leaves)} (fur rims behind the eye whites)")
print(f"total polygons: {sum(len(p) for p, _, _, _ in leaves)}")

# ---------- transforms ----------
def rot(pt, cx, cy, deg):
    r = math.radians(deg)
    x, y = pt[0]-cx, pt[1]-cy
    return (cx + x*math.cos(r) - y*math.sin(r), cy + x*math.sin(r) + y*math.cos(r))

def xform(polys, fn):
    return [[fn(p) for p in poly] for poly in polys]

SH_L, SH_R = (84, 184), (156, 184)   # arm pivots (o= in data)
HIP_L, HIP_R = (104, 252), (136, 252) # leg pivots (o= in data)
NECK = (120, 180)                     # HEADRIG origin
BASE = (120, 288)                     # figure base

def variant_transform(name, polys, chain):
    has = lambda *ids: any(i in chain for i in ids)
    if name == "neutral":
        return polys
    if name == "running":
        if has("arm_left_upper"):
            polys = xform(polys, lambda p: rot(p, *SH_L, -25))
        if has("arm_right_upper"):
            polys = xform(polys, lambda p: rot(p, *SH_R, 25))
        if has("leg_left_lower"):
            polys = xform(polys, lambda p: rot(p, *HIP_L, -18))
        if has("leg_right_lower"):
            polys = xform(polys, lambda p: rot(p, *HIP_R, 18))
        if has("HEAD"):
            polys = xform(polys, lambda p: rot(p, *NECK, -5))
        if "shadow" not in chain:
            polys = xform(polys, lambda p: rot(p, *BASE, 4))
        return polys
    if name == "curl":
        if has("arm_right_upper"):
            polys = xform(polys, lambda p: rot(p, *SH_R, -85))
        return polys
    if name == "pushup":
        if "shadow" not in chain:
            polys = xform(polys, lambda p: rot(p, *BASE, 90))
        return polys
    if name == "sitting":
        if has("leg_left_lower"):
            polys = xform(polys, lambda p: rot(p, *HIP_L, 70))
        if has("leg_right_lower"):
            polys = xform(polys, lambda p: rot(p, *HIP_R, 70))
        return polys
    raise ValueError(name)

def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def render(name):
    img = Image.new("RGB", (W*S, H*S), "#FFFFFF")
    mask = Image.new("L", (W*S, H*S), 0)
    d, dm = ImageDraw.Draw(img), ImageDraw.Draw(mask)
    grip = None
    # First pass: transform, then recenter the figure bbox on the neutral
    # bbox centre (120, 156) so variants are compared in-frame, not clipped.
    transformed = []
    for polys, fill, chain, _ in leaves:
        if name == "pushup" and "shadow" in chain:
            continue  # ground shadow is meaningless for a horizontal figure
        tp = variant_transform(name, polys, chain)
        transformed.append((tp, fill, chain))
    xs = [p[0] for tp, _, ch in transformed if "shadow" not in ch for poly in tp for p in poly]
    ys = [p[1] for tp, _, ch in transformed if "shadow" not in ch for poly in tp for p in poly]
    cx, cy = (min(xs)+max(xs))/2, (min(ys)+max(ys))/2
    dx, dy = 120-cx, 156-cy
    # Fit-scale: if the recentered figure still exceeds the 240x300 frame
    # (a horizontal Koa is 281 wide), scale it to fit with a 4-unit margin.
    bw, bh = max(xs)-min(xs), max(ys)-min(ys)
    fit = min(1.0, 232/bw, 292/bh)
    print(f"{name}: recenter shift ({dx:.1f}, {dy:.1f}), fit scale {fit:.3f}")
    def place(p):
        x, y = p[0]+dx, p[1]+dy
        return (120 + (x-120)*fit, 156 + (y-156)*fit)
    for tp, fill, chain in transformed:
        if "shadow" not in chain:
            tp = [[place(p) for p in poly] for poly in tp]
        try:
            rgb = hex2rgb(fill)
        except Exception:
            continue
        for poly in tp:
            pts = [(x*S, y*S) for x, y in poly]
            d.polygon(pts, fill=rgb)
            dm.polygon(pts, fill=255)
        if name == "curl" and "arm_right_upper" in chain:
            xs2 = [p[0] for poly in tp for p in poly]
            ys2 = [p[1] for poly in tp for p in poly]
            grip = ((min(xs2)+max(xs2))/2, (min(ys2)+max(ys2))/2)
    if name == "curl" and grip:
        # dumbbell prop: bar + 2 plates, centred on the rotated hand
        gx, gy = grip
        d.rectangle([ (gx-26)*S, (gy-3)*S, (gx+26)*S, (gy+3)*S ], fill="#39424E")
        for cx in (gx-24, gx+24):
            d.ellipse([(cx-8)*S, (gy-11)*S, (cx+8)*S, (gy+11)*S], fill="#20242A")
        dm.rectangle([(gx-26)*S, (gy-11)*S, (gx+26)*S, (gy+11)*S], fill=255)
        print(f"curl grip (dumbbell centre): ({gx:.1f}, {gy:.1f})")
    return img, mask

def bbox_of(mask):
    b = mask.getbbox()
    return b  # (x0,y0,x1,y1) in scaled px

def iou(m1, m2):
    import numpy as np
    a = np.array(m1, dtype=bool)
    b = np.array(m2, dtype=bool)
    return (a & b).sum() / (a | b).sum()

results = {}
base_img, base_mask = render("neutral")
base_img.save(f"{OUT}/poc-neutral.png")
results["neutral"] = base_mask
print("neutral silhouette bbox (240x300):",
      tuple(round(v/S, 1) for v in bbox_of(base_mask)))

for name in ("running", "curl", "pushup", "sitting"):
    img, mask = render(name)
    img.save(f"{OUT}/poc-{name}.png")
    v = iou(base_mask, mask)
    bb = tuple(round(x/S, 1) for x in bbox_of(mask))
    print(f"{name}: silhouette IoU vs neutral = {v:.3f}, bbox = {bb}")
    results[name] = mask

# contact sheet
sheet = Image.new("RGB", (W*S*5, H*S), "#EEEEEE")
for i, name in enumerate(("neutral", "running", "curl", "pushup", "sitting")):
    sheet.paste(Image.open(f"{OUT}/poc-{name}.png"), (i*W*S, 0))
sheet.save(f"{OUT}/poc-contact-sheet.png")
print("saved:", OUT)
