# Koa 3D guide built FROM THE ART: every body part is the exact front outline
# from KoaSceneData (idle pose, happy face), inflated into depth; face marks
# are decals projected onto the surface they sit on. So the 0° view is the
# drawing, and other angles keep its shapes.
#
#   Blender -b --factory-startup --python koa_guide.py -- \
#     apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Koa/KoaSceneData.swift OUT MODE
#   MODE: vector (8 SVGs + front IoU vs art) | views (shaded) | turntable
import bpy, bmesh, math, sys, os, json, re
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt

argv = sys.argv[sys.argv.index("--") + 1:]
SCENE, OUT, MODE = argv
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- art
def find(nodes, pred, acc):
    for n in nodes:
        if pred(n):
            acc.append(n)
        find(n.get("kids", []), pred, acc)
    return acc
_src = open(SCENE).read()
if SCENE.endswith(".swift"):            # the JSON literal inside KoaSceneData.swift
    _src = _src[_src.index('##"') + 3:_src.index('"##')]
ART = json.loads(_src)["nodes"]
def by_id(i):
    return find(ART, lambda n: n.get("id") == i and n["t"] in ("path", "ellipse", "circle"), [])[0]["a"]
def by_d(prefix):
    return find(ART, lambda n: n["t"] == "path" and n.get("a", {}).get("d", "").startswith(prefix), [])[0]["a"]

def sample(d, n=14):
    """SVG path (M L C Q Z, absolute) -> list of polylines in canvas units."""
    toks = re.findall(r"[MLCQZ]|-?\d*\.?\d+", d)
    out, cur, p, i = [], [], (0, 0), 0
    while i < len(toks):
        t = toks[i]; i += 1
        num = lambda k: [float(x) for x in toks[i:i + k]]
        if t == "M":
            if cur: out.append(cur)
            p = tuple(num(2)); i += 2; cur = [p]
        elif t == "L":
            p = tuple(num(2)); i += 2; cur.append(p)
        elif t == "C":
            a, b, c = [tuple(num(6)[k:k + 2]) for k in (0, 2, 4)]; i += 6
            for s in range(1, n + 1):
                u = s / n; v = 1 - u
                cur.append(tuple(v**3 * p[j] + 3 * v * v * u * a[j] + 3 * v * u * u * b[j] + u**3 * c[j] for j in (0, 1)))
            p = c
        elif t == "Q":
            a, c = [tuple(num(4)[k:k + 2]) for k in (0, 2)]; i += 4
            for s in range(1, n + 1):
                u = s / n; v = 1 - u
                cur.append(tuple(v * v * p[j] + 2 * v * u * a[j] + u * u * c[j] for j in (0, 1)))
            p = c
        elif t == "Z":
            pass
    if cur: out.append(cur)
    return out

def ellipse(cx, cy, rx, ry, rot=0.0, n=64):
    r = math.radians(rot)
    return [(cx + rx * math.cos(t) * math.cos(r) - ry * math.sin(t) * math.sin(r),
             cy + rx * math.cos(t) * math.sin(r) + ry * math.sin(t) * math.cos(r))
            for t in (2 * math.pi * k / n for k in range(n))]

def stroke(poly, w, n=10):
    """Polyline with round caps -> closed outline polygon."""
    L, R = [], []
    for k, (x, y) in enumerate(poly):
        a = poly[max(k - 1, 0)]; b = poly[min(k + 1, len(poly) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; m = math.hypot(dx, dy) or 1
        nx, ny = -dy / m * w / 2, dx / m * w / 2
        L.append((x + nx, y + ny)); R.append((x - nx, y - ny))
    def cap(c, ang):
        return [(c[0] + w / 2 * math.cos(ang + math.pi * s / n), c[1] + w / 2 * math.sin(ang + math.pi * s / n)) for s in range(1, n)]
    e = poly[-1]; d0 = math.atan2(poly[-1][1] - poly[-2][1], poly[-1][0] - poly[-2][0])
    s0 = poly[0]; d1 = math.atan2(poly[0][1] - poly[1][1], poly[0][0] - poly[1][0])
    return L + cap(e, d0 - math.pi / 2)[::-1] + R[::-1] + cap(s0, d1 - math.pi / 2)[::-1]

def W(pt, dy=0.0):          # canvas -> world (X, Z), head group offset dy
    return ((pt[0] - 120) / 100, (294 - (pt[1] + dy)) / 100)

# ---------------------------------------------------------------- materials / parts
def lin(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [(x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
PARTS, ORDER, ARTPOLY = {}, [], {}
def tag(o, part, col, op=1.0, stroke=None):
    if part not in PARTS:
        PARTS[part] = (col, op, stroke); ORDER.append(part)
    o["part"] = part
    m = bpy.data.materials.get(part) or bpy.data.materials.new(part)
    m.diffuse_color = lin(col) + [1.0]
    o.data.materials.append(m)
    return o

def mesh_obj(name, verts, faces):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    for p in me.polygons: p.use_smooth = True
    return o

def ray_r(poly, c, th):
    """Farthest hit of a ray from c at angle th with polygon (world XZ)."""
    dx, dz = math.cos(th), math.sin(th); best = 0.0
    for k in range(len(poly)):
        (x1, z1), (x2, z2) = poly[k], poly[(k + 1) % len(poly)]
        ex, ez = x2 - x1, z2 - z1
        den = dx * ez - dz * ex
        if abs(den) < 1e-12: continue
        t = ((x1 - c[0]) * ez - (z1 - c[1]) * ex) / den
        u = ((x1 - c[0]) * dz - (z1 - c[1]) * dx) / den
        if t > 0 and -1e-9 <= u <= 1 + 1e-9: best = max(best, t)
    return best

def inflate(part, col, polys_canvas, dy, depth, cy, stroke_=None, center=None, seg=96, rings=48):
    """Sphere deformed so its front silhouette is the art outline."""
    poly = [W(p, dy) for p in polys_canvas]
    ARTPOLY.setdefault(part, []).append(polys_canvas_dy(polys_canvas, dy))
    c = center and W(center, dy) or (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    rcache = {}
    for v in bm.verts:
        x, y, z = v.co
        rho = math.hypot(x, z); th = math.atan2(z, x)
        key = round(th, 5)
        if key not in rcache: rcache[key] = ray_r(poly, c, th)
        r = rcache[key]
        v.co = (c[0] + rho * r * math.cos(th), cy + y * depth, c[1] + rho * r * math.sin(th))
    me = bpy.data.meshes.new(part); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(part, me); sc.collection.objects.link(o)
    for p in me.polygons: p.use_smooth = True
    return tag(o, part, col, 1.0, stroke_)

def polys_canvas_dy(poly, dy):
    return [(x, y + dy) for x, y in poly]

def inside(poly, x, y):
    c = False
    for k in range(len(poly)):
        (x1, y1), (x2, y2) = poly[k], poly[(k + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c

def decal(part, col, poly_canvas, dy, hosts, lift, op=1.0, bulge=0.0, step=2.0):
    """Flat art shape triangulated, each vertex shot onto the host surface from the front."""
    ARTPOLY.setdefault(part, []).append(polys_canvas_dy(poly_canvas, dy))
    pts = list(poly_canvas)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    g = step
    x = min(xs) + g / 2
    while x < max(xs):
        y = min(ys) + g / 2
        while y < max(ys):
            if inside(poly_canvas, x, y): pts.append((x, y))
            y += g
        x += g
    nb = len(poly_canvas)
    edges = [(k, (k + 1) % nb) for k in range(nb)]
    res = delaunay_2d_cdt([Vector(p) for p in pts], edges, [], 2, 1e-6)
    v2, faces = res[0], res[2]
    cxs, cys = sum(xs) / len(xs), sum(ys) / len(ys)
    rmax = max(math.hypot(p[0] - cxs, p[1] - cys) for p in poly_canvas) or 1
    verts = []
    for p in v2:
        X, Z = W((p.x, p.y), dy)
        hit = None
        for h in hosts:
            r = h.ray_cast(Vector((X, -20, Z)), Vector((0, 1, 0)))
            if r[0] is not None and (hit is None or r[3] < hit[3]): hit = r
        k = 1 - min(1, (math.hypot(p.x - cxs, p.y - cys) / rmax) ** 2)
        if hit:
            nrm = hit[1].normalized()
            if nrm.y > 0: nrm = -nrm
            verts.append(tuple(hit[0] + nrm * (bulge * k) + Vector((0, -lift, 0))))  # bulge along the surface, tiny lift toward the front
        else:
            verts.append((X, -lift, Z))
    o = mesh_obj(part, verts, [tuple(f) for f in faces])
    return tag(o, part, col, op)

def bvh(o):
    return BVHTree.FromPolygons([v.co[:] for v in o.data.vertices], [p.vertices[:] for p in o.data.polygons])

# ---------------------------------------------------------------- build (idle, happy)
FUR, LIGHT, DARK, NOSE, SHADE = "#BFC7CF", "#D7DDE3", "#20242A", "#3A4654", "#A9B2BC"
FS = ("#B7BFC8", 0.45)
P1 = lambda a: sample(a["d"])[0]
EPS = 0.006

shadow = ellipse(120, 294, 64, 9)
sh = mesh_obj("shadow", [(0, 0, 0)] * len(shadow), [tuple(range(len(shadow)))])
# lay the shadow flat on the ground: art ellipse ry=9 is a perspective squash, use rx 0.64 x ry 0.35
for k, v in enumerate(sh.data.vertices):
    t = 2 * math.pi * k / len(shadow); v.co = (0.64 * math.cos(t), -0.05 + 0.35 * math.sin(t), 0.001)
tag(sh, "shadow", "#AEB6BF", 0.45); ARTPOLY["shadow"] = [shadow]

feet = [inflate(f"foot_{s}", FUR, P1(by_id(f"leg_{n}_lower")), 0, 0.24, -0.10) for s, n in (("L", "left"), ("R", "right"))]
torso = inflate("torso", FUR, P1(by_id("torso_front")), 0, 0.47, 0.03)
arms = [inflate(f"arm_{s}", FUR, P1(by_id(f"arm_{n}_upper")), 0, 0.14, -0.02) for s, n in (("L", "left"), ("R", "right"))]
ears = [inflate(f"ear_{s}", FUR, P1(by_id(f"ear_{n}")), 11, 0.11, 0.14, FS) for s, n in (("L", "left"), ("R", "right"))]
head = inflate("head", FUR, P1(by_id("head_front")), 11, 0.62, 0.0, FS)
tufts = [inflate("tuft", FUR, P1(by_d(pre)), 11, 0.07, -0.02, FS) for pre in ("M130 48", "M120 48")]
for o in tufts: o["part"] = "head"

TB, HB = bvh(torso), bvh(head)
FB = [bvh(o) for o in feet]; AB = [bvh(o) for o in arms]; EB = [bvh(o) for o in ears]

decal("belly", LIGHT, P1(by_id("belly")), 0, [TB], EPS)
decal("chin_shade", SHADE, P1(by_d("M85 174")), 0, [TB], 2 * EPS, op=0.32)
decal("leg_shade_L", SHADE, P1(by_d("M104 256")), 0, [FB[0]], EPS, op=0.5)
decal("leg_shade_R", SHADE, P1(by_d("M136 256")), 0, [FB[1]], EPS, op=0.5)
decal("arm_shade_L", SHADE, P1(by_d("M71.5 192")), 0, [AB[0]], EPS, op=0.55, step=1.0)
decal("arm_shade_R", SHADE, P1(by_d("M168.5 192")), 0, [AB[1]], EPS, op=0.55, step=1.0)
decal("ear_in_L", LIGHT, P1(by_id("ear_left_inner")), 11, [EB[0]], EPS)
decal("ear_in_R", LIGHT, P1(by_id("ear_right_inner")), 11, [EB[1]], EPS)
for s, k, sg in (("L", "left", -1), ("R", "right", 1)):
    e = by_id(f"eye_{k}"); decal(f"eye_{s}", "#FFFFFF", ellipse(e["cx"], e["cy"], e["rx"], e["ry"]), 11, [HB], EPS)
    p = by_id(f"pupil_{k}"); decal(f"pupil_{s}", DARK, ellipse(p["cx"], p["cy"], p["rx"], p["ry"]), 11, [HB], 2 * EPS)
    hx = 83.5 if s == "L" else 156.5
    decal(f"hi_{s}", "#FFFFFF", ellipse(hx, 90, 4.8, 4.8, n=32), 11, [HB], 3 * EPS, step=1.0)
    decal(f"hi2_{s}", "#FFFFFF", ellipse(92 if s == "L" else 148, 108, 2.3, 2.3, n=24), 11, [HB], 3 * EPS, op=0.9, step=0.8)
    b = by_id(f"eyebrow_{k}"); decal(f"brow_{s}", DARK, stroke(sample(b["d"])[0], 5), 11, [HB], EPS, step=1.0)
    bl = by_id(f"blush_{k}"); decal(f"blush_{s}", "#F3B5B5", ellipse(bl["cx"], bl["cy"], 8, 6, rot=10 * sg), 11, [HB], EPS, step=1.0)
nose = decal("nose", NOSE, P1(by_id("nose")), 11, [HB], EPS, bulge=0.07, step=1.5)
NB = bvh(nose)
decal("nose_hi", "#FFFFFF", ellipse(114, 94, 3.5, 5.5, rot=-18, n=32), 11, [NB], EPS, op=0.16, step=0.8)
for pre in ("M111 117", "M123 118"):
    decal("nostril", DARK, stroke(sample(by_d(pre)["d"])[0], 2.4), 11, [NB], EPS, op=0.35, step=0.6)
decal("mouth", DARK, stroke(sample("M120 126 L120 130")[0], 3.4), 11, [HB], EPS, step=0.8)
decal("mouth", DARK, P1(by_id("mouth")), 11, [HB], EPS, step=1.2)
decal("mouth", DARK, stroke(sample("M106 128 Q120 137 134 128")[0], 5), 11, [HB], 1.5 * EPS, step=1.0)
t = by_id("tongue"); decal("tongue", "#E8657B", ellipse(t["cx"], t["cy"], t["rx"], t["ry"]), 11, [HB], 2 * EPS, step=1.0)

# ---------------------------------------------------------------- render
sc.render.engine = "BLENDER_WORKBENCH"
shd = sc.display.shading; shd.color_type = "MATERIAL"
shd.background_type = "VIEWPORT"; shd.background_color = lin("#F7F5F0")
sc.view_settings.view_transform = "Standard"
bpy.ops.object.empty_add(location=(0, 0, 1.45)); pivot = bpy.context.object
bpy.ops.object.camera_add(location=(0, -10, 0), rotation=(math.radians(90), 0, 0))
cam = bpy.context.object; cam.data.type = "ORTHO"; cam.data.ortho_scale = 3.25
cam.data.clip_start, cam.data.clip_end = 5, 15
cam.parent = pivot; sc.camera = cam
NAMES = ["0-front", "45-34-right", "90-side-right", "135-34-back-right", "180-back", "225-34-back-left", "270-side-left", "315-34-left"]

if MODE in ("views", "turntable"):
    shd.light = os.environ.get("KOA_LIGHT", "STUDIO")
    shd.show_object_outline = True; shd.object_outline_color = lin("#8E98A3")
    shd.show_cavity = True; shd.cavity_type = "WORLD"
    sc.render.resolution_x, sc.render.resolution_y = 480, 600
    steps = [(i * 45, f"{i}-{n}") for i, n in enumerate(NAMES)] if MODE == "views" else [(f * 5, f"t{f:03d}") for f in range(72)]
    for ang, name in steps:
        pivot.rotation_euler = (0, 0, math.radians(ang))
        sc.render.filepath = os.path.join(OUT, name + ".png")
        bpy.ops.render.render(write_still=True)
    sys.exit(0)

Wd, Hd = 960, 1200
SCALE = 325 / Hd
shd.light = "FLAT"; shd.show_object_outline = False; shd.show_cavity = False; shd.show_specular_highlight = False
sc.display.render_aa = "OFF"; sc.render.dither_intensity = 0
sc.render.resolution_x, sc.render.resolution_y = Wd, Hd
shd.background_color = (0, 0, 0)
names = list(ORDER)
idc = {}
for i, n in enumerate(names):
    rgb = ((i * 37 + 40) % 256, (i * 91 + 80) % 256, (i * 53 + 160) % 256)
    idc[n] = rgb; bpy.data.materials[n].diffuse_color = lin("#%02X%02X%02X" % rgb) + [1.0]

NB8 = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
def trace(mask, skip_border=False):
    hgt, wid = mask.shape
    m = np.zeros((hgt + 2, wid + 2), bool); m[1:-1, 1:-1] = mask
    seen = np.zeros_like(m); out = []
    for y0, x0 in zip(*np.nonzero(m)):
        if seen[y0, x0] or m[y0, x0 - 1]: continue
        stack = [(y0, x0)]; seen[y0, x0] = True; area = 0; edge = False
        while stack:
            y, x = stack.pop(); area += 1
            if y == 1 or x == 1 or y == hgt or x == wid: edge = True
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if m[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; stack.append((yy, xx))
        if area < 12 or (skip_border and edge): continue
        pts = [(x0, y0)]; cur = (y0, x0); back = 6
        for _ in range(200000):
            for k in range(8):
                d = (back + 1 + k) % 8; yy, xx = cur[0] + NB8[d][0], cur[1] + NB8[d][1]
                if m[yy, xx]: back = (d + 4) % 8; cur = (yy, xx); break
            else: break
            if cur == (y0, x0): break
            pts.append((cur[1], cur[0]))
        out.append((area, pts))
    return out

def rdp(pts, eps):
    if len(pts) < 3: return pts
    a, b = np.array(pts[0], float), np.array(pts[-1], float); p = np.array(pts, float)
    ab = b - a; n = np.hypot(*ab)
    d = np.abs(np.cross(ab, p - a)) / n if n > 0 else np.hypot(*(p - a).T)
    i = int(np.argmax(d))
    return rdp(pts[:i + 1], eps)[:-1] + rdp(pts[i:], eps) if d[i] > eps else [pts[0], pts[-1]]

fmt = lambda v: f"{v:.1f}".rstrip("0").rstrip(".")
def to_path(pts):
    q = [(120 + (x + 0.5 - 1 - Wd / 2) * SCALE, 149 + (y + 0.5 - 1 - Hd / 2) * SCALE) for x, y in pts]
    n = len(q)
    if n < 3: return ""
    s = f"M{fmt(q[0][0])} {fmt(q[0][1])}"
    for i in range(n):
        p0, p1, p2, p3 = q[i - 1], q[i], q[(i + 1) % n], q[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        s += f" C{fmt(c1[0])} {fmt(c1[1])} {fmt(c2[0])} {fmt(c2[1])} {fmt(p2[0])} {fmt(p2[1])}"
    return s + " Z"

def raster(polys):
    """Even-odd fill of canvas polygons on the render grid."""
    gy, gx = np.mgrid[0:Hd, 0:Wd]
    cx = 120 + (gx + 0.5 - Wd / 2) * SCALE; cy = 149 + (gy + 0.5 - Hd / 2) * SCALE
    acc = np.zeros((Hd, Wd), bool)
    for poly in polys:
        m = np.zeros((Hd, Wd), bool)
        for k in range(len(poly)):
            (x1, y1), (x2, y2) = poly[k], poly[(k + 1) % len(poly)]
            if y1 == y2: continue
            c = ((y1 > cy) != (y2 > cy)) & (cx < (x2 - x1) * (cy - y1) / (y2 - y1) + x1)
            m ^= c
        acc |= m
    return acc

# Draw order of the art (KoaSceneData, idle): used inside each group and for the IoU check.
ART_ORDER = ["shadow", "foot_L", "foot_R", "leg_shade_L", "leg_shade_R", "torso", "belly", "chin_shade",
             "arm_L", "arm_R", "arm_shade_L", "arm_shade_R", "ear_L", "ear_R", "ear_in_L", "ear_in_R",
             "head", "tuft", "eye_L", "eye_R", "pupil_L", "pupil_R", "hi_L", "hi2_L", "hi_R", "hi2_R",
             "brow_L", "brow_R", "nose", "nose_hi", "nostril", "mouth", "tongue", "blush_L", "blush_R"]
assert sorted(ART_ORDER) == sorted(names), set(ART_ORDER) ^ set(names)
# Cut-out layers, like the 2D rig: each group is drawn whole, groups sorted far -> near per view.
# bias (m) nudges the sort the way the art reads: feet tuck under the body, head and ears sit on top.
GROUPS = [("shadow", ["shadow"], 99), ("foot_L", ["foot_L", "leg_shade_L"], 0.25), ("foot_R", ["foot_R", "leg_shade_R"], 0.25),
          ("torso", ["torso", "belly", "chin_shade"], 0.0), ("arm_L", ["arm_L", "arm_shade_L"], 0.0), ("arm_R", ["arm_R", "arm_shade_R"], 0.0),
          ("ear_L", ["ear_L", "ear_in_L"], -0.3), ("ear_R", ["ear_R", "ear_in_R"], -0.3),
          ("head", [p for p in ART_ORDER if ART_ORDER.index(p) >= ART_ORDER.index("head")], -0.3)]

def render_masks(visible):
    for o in sc.objects:
        if o.get("part"): o.hide_render = o["part"] not in visible
    fp = os.path.join(OUT, "id.png"); sc.render.filepath = fp
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(fp)
    px = (np.array(img.pixels[:]).reshape(Hd, Wd, 4)[::-1, :, :3] * 255 + 0.5).astype(np.int32)
    bpy.data.images.remove(img)
    code = px[..., 0] * 65536 + px[..., 1] * 256 + px[..., 2]
    return {p: code == (idc[p][0] * 65536 + idc[p][1] * 256 + idc[p][2]) for p in visible}

def enclosed(mask):
    """Pixels not reachable from the image border through ~mask (holes of mask)."""
    free = ~mask; out = np.zeros_like(mask)
    hgt, wid = mask.shape
    stack = [(y, x) for y in (0, hgt - 1) for x in range(wid) if free[y, x]] + \
            [(y, x) for x in (0, wid - 1) for y in range(hgt) if free[y, x]]
    for y, x in stack: out[y, x] = True
    while stack:
        y, x = stack.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < hgt and 0 <= xx < wid and free[yy, xx] and not out[yy, xx]:
                out[yy, xx] = True; stack.append((yy, xx))
    return free & ~out

def emit(part, mask, bg):
    col, op, st = PARTS[part]
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = max(ys.min() - 2, 0), ys.max() + 3, max(xs.min() - 2, 0), xs.max() + 3
    sub = mask[y0:y1, x0:x1]; hole = enclosed(sub)
    keep = hole & bg[y0:y1, x0:x1]          # holes where the group background shows: real holes
    filled = sub | (hole & ~keep)           # holes covered by later layers: fill them (no islands)
    sh = lambda loops: [[(x + x0, y + y0) for x, y in p] for _, p in loops]
    loops = sh(sorted(trace(filled), key=lambda t: -t[0])) + sh(trace(keep))
    d = " ".join(filter(None, (to_path(rdp(p + [p[0]], 1.0)[:-1]) for p in loops)))
    if not d: return None
    a = f'fill="{col}" fill-rule="evenodd"'
    if op < 1: a += f' opacity="{op}"'
    if part != "shadow" and op == 1:
        sc_, sw = st or (col, 0.6)
        a += f' stroke="{sc_}" stroke-width="{sw}" stroke-linejoin="round"'
    return f'    <path id="{part}" {a} d="{d}"/>'

report = {"order": {}}
for i, n in enumerate(NAMES):
    ang = math.radians(i * 45)
    pivot.rotation_euler = (0, 0, ang); bpy.context.view_layer.update()
    camdir = (cam.matrix_world.to_quaternion() @ Vector((0, 0, -1))).normalized()
    keyed = []
    for g, members, bias in GROUPS:
        objs = [o for o in sc.objects if o.get("part") == members[0]]
        c = sum((o.matrix_world @ (sum((v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)) for o in objs), Vector()) / len(objs)
        keyed.append((c.dot(camdir) + bias, g, members))
    keyed.sort(key=lambda t: -t[0])                    # far first
    report["order"][n] = [g for _, g, _ in keyed]
    body, comp, trans = [], np.full((Hd, Wd), -1, np.int32), {}
    for _, g, members in keyed:
        mk = render_masks(set(members))
        bg = ~np.logical_or.reduce([mk[p] for p in members])
        lines = []
        for p in sorted(members, key=ART_ORDER.index):
            m = mk[p] if p != members[0] else ~bg   # the base fills under its own decals
            if m.sum() < 12: continue
            line = emit(p, m, bg)
            if line: lines.append(line)
            if PARTS[p][1] == 1: comp[m] = names.index(p)
            else: trans[p] = (m, members[0])
        body.append(f'  <g id="{g}">\n' + "\n".join(lines) + "\n  </g>")
    open(os.path.join(OUT, f"{i}-{n}.svg"), "w").write(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300" width="480" height="600">\n' + "\n".join(body) + "\n</svg>\n")
    if i == 0:
        artm = {p: raster(ARTPOLY[p]) for p in ART_ORDER}
        above = np.zeros((Hd, Wd), bool); vis = {}
        for p in reversed(ART_ORDER):
            vis[p] = artm[p] & ~above
            if PARTS[p][1] == 1: above |= artm[p]
        iou = lambda a, b: float((a & b).sum()) / max(1, float((a | b).sum()))
        report["front_iou"] = {p: round(iou(vis[p], (trans[p][0] & (comp == names.index(trans[p][1]))) if p in trans else comp == names.index(p)), 3) for p in ART_ORDER if p != "shadow"}
        sil_art = np.logical_or.reduce([artm[p] for p in ART_ORDER if p != "shadow"])
        report["front_silhouette_iou"] = round(iou(sil_art, (comp >= 0) & (comp != names.index("shadow"))), 4)
        report["front_iou_min"] = min(report["front_iou"].items(), key=lambda t: t[1])
json.dump(report, open(os.path.join(OUT, "report.json"), "w"), indent=1)
