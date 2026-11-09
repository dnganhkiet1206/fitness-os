# Koa 3D guide model, built from KoaSceneData coordinates (240 x 300 canvas).
# X = (x-120)/100, Z = (294-y)/100, front faces -Y. Head group has +11 y offset.
#
# Usage (Blender 5.2, background):
#   Blender -b --factory-startup --python koa_blockout.py -- OUT MODE
# MODE:
#   views      8 shaded renders (KOA_LIGHT=STUDIO|FLAT)
#   turntable  72 shaded frames, 5 degrees apart
#   vector     8 SVGs in canvas coordinates: each part's visible region traced
#              from a flat ID render, filled with the Koa palette
import bpy, bmesh, math, sys, os, json
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
OUT, MODE = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return [(x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

FUR, LIGHT, DARK, NOSE = "#BFC7CF", "#D7DDE3", "#20242A", "#3A4654"
PARTS = {}  # part name -> palette colour; objects carry obj["part"]

def tag(o, part, col):
    PARTS.setdefault(part, col)
    o["part"] = part
    m = bpy.data.materials.get(part) or bpy.data.materials.new(part)
    m.diffuse_color = lin(col) + [1.0]
    o.data.materials.append(m)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth()
    return o

def P(x, y):
    return (x - 120) / 100, (294 - y) / 100

def blob(part, col, x, y, rx, rz, ry, depth, rot=(0, 0, 0), seg=48):
    X, Z = P(x, y)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, location=(X, depth, Z))
    o = bpy.context.object
    o.scale = (rx, ry, rz)
    o.rotation_euler = [math.radians(a) for a in rot]
    return tag(o, part, col)

def capsule(part, col, a, b, ra, rb, depth):
    (ax, az), (bx, bz) = P(*a), P(*b)
    va, vb = Vector((ax, depth, az)), Vector((bx, depth, bz))
    d = vb - va
    bpy.ops.mesh.primitive_cone_add(radius1=ra, radius2=rb, depth=d.length, location=(va + vb) / 2, vertices=48)
    c = bpy.context.object
    c.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    tag(c, part, col)
    for v, r in ((va, ra), (vb, rb)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=v, segments=32, ring_count=16)
        tag(bpy.context.object, part, col)

H = 11
HX, HZ, HY = 0.80, 0.66, 0.64
HC = P(120, 103 + H)

def on_head(x, y, lift=0.0):
    X, Z = P(x, y + H)
    k = 1 - (X / HX) ** 2 - ((Z - HC[1]) / HZ) ** 2
    return -HY * math.sqrt(max(k, 0.01)) - lift

def half(o, keep_below=True):
    """Cut a blob in half through its centre along Z (for a D-shaped mouth)."""
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0),
                           plane_no=(0, 0, 1), clear_outer=keep_below, clear_inner=not keep_below)
    bmesh.ops.contextual_create(bm, geom=[e for e in bm.edges if e.is_boundary])
    bm.to_mesh(o.data); bm.free()

# Head: ball plus two cheek bulges (the 2D head is widest low, around y 118).
blob("head", FUR, 120, 103 + H, HX, HZ, HY, 0.0)
for s in (-1, 1):
    blob("head", FUR, 120 + s * 46, 128 + H, 0.36, 0.30, 0.42, -0.10)
# Soft top tuft: three leaning locks.
for x, y, r, lean in [(124, 26, .055, 10), (115, 31, .045, -18), (133, 33, .04, 28)]:
    blob("head", FUR, x, y + H, r, r * 2.1, r, -0.10, rot=(0, lean, 0), seg=24)

# Ears: thick discs with a scalloped fluffy rim on the outer side.
for s in (-1, 1):
    ex, ey = 120 + s * 66, 58 + H
    blob(f"ear_{'L' if s < 0 else 'R'}", FUR, ex, ey, 0.38, 0.45, 0.20, 0.16, rot=(0, 0, s * -18))
    for a in range(-150, 31, 30):  # bumps around the outer rim
        ang = math.radians(a)
        bx = ex - math.cos(ang) * 35 if s < 0 else ex + math.cos(ang) * 35
        by = ey - math.sin(ang) * 42
        blob(f"ear_{'L' if s < 0 else 'R'}", FUR, bx, by, 0.065, 0.065, 0.14, 0.16, seg=20)
    inner = blob(f"ear_in_{'L' if s < 0 else 'R'}", LIGHT, ex - s * 4, ey - 5, 0.23, 0.26, 0.05, 0.02, rot=(0, 0, s * -18))
    inner.location.y = 0.16 - 0.17

# Face.
for s in (-1, 1):
    k = 'L' if s < 0 else 'R'
    ex = 120 + s * 38
    blob(f"eye_{k}", "#FFFFFF", ex, 96 + H, 0.18, 0.235, 0.04, on_head(ex, 96, -0.012))
    px = 120 + s * 33
    blob(f"pupil_{k}", DARK, px, 99 + H, 0.11, 0.15, 0.03, on_head(px, 99, 0.012))
    hx = px - 3.5
    blob(f"hi_{k}", "#FFFFFF", hx, 90 + H, 0.048, 0.048, 0.02, on_head(hx, 90, 0.04))
    bx = 120 + s * 54
    blob(f"blush_{k}", "#F3B5B5", bx, 121 + H, 0.08, 0.06, 0.04, on_head(bx, 121, 0.10))
    # Brow: a thick stroke along an arc, lifted just off the head surface.
    pts = []
    for t in range(9):
        u = t / 8
        bx2 = 120 + s * (47 - 17 * u)
        by2 = 65 - 8 * math.sin(math.pi * u)
        X, Z = P(bx2, by2 + H)
        pts.append((X, on_head(bx2, by2, 0.012), Z))
    cu = bpy.data.curves.new(f"brow_{k}", "CURVE"); cu.dimensions = "3D"
    cu.bevel_depth = 0.028; cu.bevel_resolution = 4; cu.use_fill_caps = True
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
    for pt, (x, y, z) in zip(sp.points, pts):
        pt.co = (x, y, z, 1)
    ob = bpy.data.objects.new(f"brow_{k}", cu); bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    tag(bpy.context.object, f"brow_{k}", DARK)

blob("nose", NOSE, 120, 105 + H, 0.14, 0.21, 0.09, on_head(120, 105, 0.03))
blob("nose_hi", "#FFFFFF", 114, 94 + H, 0.035, 0.055, 0.02, on_head(114, 94, 0.10), rot=(0, 18, 0), seg=16)
m = blob("mouth", DARK, 120, 128 + H, 0.15, 0.17, 0.06, on_head(120, 128, 0.0))
half(m)
blob("tongue", "#E8657B", 120, 139 + H, 0.085, 0.045, 0.03, on_head(120, 139, 0.09))

# Body.
blob("torso", FUR, 120, 210, 0.56, 0.70, 0.50, 0.05)
blob("belly", LIGHT, 120, 229, 0.35, 0.41, 0.12, -0.37)
for s in (-1, 1):
    k = 'L' if s < 0 else 'R'
    capsule(f"arm_{k}", FUR, (120 + s * 40, 176), (120 + s * 74, 232), 0.15, 0.13, 0.0)
    blob(f"foot_{k}", FUR, 120 + s * 29, 274, 0.25, 0.20, 0.29, -0.14)

bpy.ops.mesh.primitive_cylinder_add(radius=0.64, depth=0.005, location=(0, -0.05, 0.0), vertices=64)
sh = bpy.context.object; sh.scale = (1, 0.55, 1); tag(sh, "shadow", "#AEB6BF")

# ---- render setup
sc.render.engine = "BLENDER_WORKBENCH"
shd = sc.display.shading
shd.color_type = "MATERIAL"
shd.background_type = "VIEWPORT"; shd.background_color = lin("#F7F5F0")
sc.view_settings.view_transform = "Standard"
bpy.ops.object.empty_add(location=(0, 0, 1.45)); pivot = bpy.context.object
bpy.ops.object.camera_add(location=(0, -10, 0), rotation=(math.radians(90), 0, 0))
cam = bpy.context.object; cam.data.type = "ORTHO"; cam.data.ortho_scale = 3.25
cam.parent = pivot; sc.camera = cam
os.makedirs(OUT, exist_ok=True)

NAMES = ["0-front", "45-34-right", "90-side-right", "135-34-back-right", "180-back", "225-34-back-left", "270-side-left", "315-34-left"]

def shaded():
    shd.light = os.environ.get("KOA_LIGHT", "STUDIO")
    shd.show_object_outline = True; shd.object_outline_color = lin("#8E98A3")
    shd.show_cavity = True; shd.cavity_type = "WORLD"
    sc.render.resolution_x, sc.render.resolution_y = 480, 600

if MODE == "views":
    shaded()
    for i, n in enumerate(NAMES):
        pivot.rotation_euler = (0, 0, math.radians(i * 45))
        sc.render.filepath = os.path.join(OUT, f"{i}-{n}.png")
        bpy.ops.render.render(write_still=True)
    sys.exit(0)
if MODE == "turntable":
    shaded()
    for f in range(72):
        pivot.rotation_euler = (0, 0, math.radians(f * 5))
        sc.render.filepath = os.path.join(OUT, f"t{f:03d}.png")
        bpy.ops.render.render(write_still=True)
    sys.exit(0)

# ---- vector mode
import numpy as np
W, Hh = 960, 1200
SCALE = 325 / Hh                     # canvas units per pixel (ortho 3.25 m over 1200 px)
shd.light = "FLAT"; shd.show_object_outline = False; shd.show_cavity = False
shd.show_specular_highlight = False
sc.display.render_aa = "OFF"; sc.render.dither_intensity = 0
sc.render.resolution_x, sc.render.resolution_y = W, Hh
shd.background_color = (0, 0, 0)
names = sorted(PARTS)
ids = {}
for i, n in enumerate(names):          # well-separated exact ID colours
    rgb = ((i * 37 + 40) % 256, (i * 91 + 80) % 256, (i * 53 + 160) % 256)
    ids[n] = rgb
    bpy.data.materials[n].diffuse_color = lin("#%02X%02X%02X" % rgb) + [1.0]
idarr = np.array([ids[n] for n in names], dtype=np.int32)

def trace(mask, skip_border=False):
    """Outer boundaries of each connected component (Moore tracing), pixel coords."""
    hgt, wid = mask.shape
    m = np.zeros((hgt + 2, wid + 2), bool); m[1:-1, 1:-1] = mask
    seen = np.zeros_like(m)
    out = []
    ys, xs = np.nonzero(m)
    nb = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0] or m[y0, x0 - 1]:
            continue
        # flood fill to mark the component (and its holes count as inside)
        stack = [(y0, x0)]; seen[y0, x0] = True; area = 0; edge = False
        while stack:
            y, x = stack.pop(); area += 1
            if y == 1 or x == 1 or y == hgt or x == wid:
                edge = True
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if m[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True; stack.append((yy, xx))
        if area < 30 or (skip_border and edge):
            continue
        # Moore neighbour trace from the leftmost pixel of this scan row
        pts = [(x0, y0)]; cur = (y0, x0); back = 6  # came from the west
        for _ in range(200000):
            found = False
            for k in range(8):
                d = (back + 1 + k) % 8
                yy, xx = cur[0] + nb[d][0], cur[1] + nb[d][1]
                if m[yy, xx]:
                    back = (d + 4) % 8; cur = (yy, xx); found = True; break
            if not found or cur == (y0, x0):
                break
            pts.append((cur[1], cur[0]))
        out.append((area, pts))
    return out

def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0], float), np.array(pts[-1], float)
    p = np.array(pts, float)
    ab = b - a; n = np.hypot(*ab)
    d = np.abs(np.cross(ab, p - a)) / n if n > 0 else np.hypot(*(p - a).T)
    i = int(np.argmax(d))
    if d[i] > eps:
        return rdp(pts[:i + 1], eps)[:-1] + rdp(pts[i:], eps)
    return [pts[0], pts[-1]]

def to_path(pts):
    # pixel -> canvas; closed Catmull-Rom -> cubic Bezier
    q = [(120 + (x + 0.5 - 1 - W / 2) * SCALE, 149 + (y + 0.5 - 1 - Hh / 2) * SCALE) for x, y in pts]
    n = len(q)
    if n < 3:
        return ""
    f = lambda v: f"{v:.1f}".rstrip("0").rstrip(".")
    s = f"M{f(q[0][0])} {f(q[0][1])}"
    for i in range(n):
        p0, p1, p2, p3 = q[i - 1], q[i], q[(i + 1) % n], q[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        s += f" C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}"
    return s + " Z"

STROKE = {"#BFC7CF": ("#A9B2BC", 1.2), "#D7DDE3": ("#C3CAD2", 0.8)}
report = {}
for i, n in enumerate(NAMES):
    pivot.rotation_euler = (0, 0, math.radians(i * 45))
    bpy.context.view_layer.update()
    fp = os.path.join(OUT, f"id-{i}.png")
    sc.render.filepath = fp
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(fp)
    px = (np.array(img.pixels[:]).reshape(Hh, W, 4)[::-1, :, :3] * 255 + 0.5).astype(np.int32)
    bpy.data.images.remove(img)
    # nearest ID colour per pixel, background = -1
    code = px[..., 0] * 65536 + px[..., 1] * 256 + px[..., 2]
    lab = np.full((Hh, W), -1, np.int32)
    for j, rgb in enumerate(idarr):
        lab[code == rgb[0] * 65536 + rgb[1] * 256 + rgb[2]] = j
    stray = int(((code > 0) & (lab < 0)).sum())
    camz = cam.matrix_world.to_translation()
    order = []
    for j, part in enumerate(names):
        mask = lab == j
        if mask.sum() < 30:
            continue
        objs = [o for o in bpy.data.objects if o.get("part") == part]
        c = sum((o.matrix_world.to_translation() for o in objs), Vector()) / len(objs)
        order.append(((c - camz).length, part, mask))
    order.sort(key=lambda t: (-1e9 if t[1] == "shadow" else -t[0]))
    body = []
    for _, part, mask in order:
        col = PARTS[part]
        st = STROKE.get(col)
        ys, xs = np.nonzero(mask)
        y0, y1, x0, x1 = ys.min() - 2, ys.max() + 3, xs.min() - 2, xs.max() + 3
        sub = mask[y0:y1, x0:x1]
        holes = [(a, [(x + x0, y + y0) for x, y in p]) for a, p in trace(~sub, skip_border=True)]
        loops = [p for _, p in sorted(trace(mask), key=lambda t: -t[0])] + [p for _, p in holes]
        d = " ".join(filter(None, (to_path(rdp(p + [p[0]], 1.1)[:-1]) for p in loops)))
        if not d:
            continue
        attrs = f'fill="{col}" fill-rule="evenodd"'
        if part == "shadow":
            attrs += ' opacity="0.45"'
        else:
            sc_, sw = st or (col, 0.6)
            attrs += f' stroke="{sc_}" stroke-width="{sw}" stroke-linejoin="round"'
        body.append(f'  <path id="{part}" {attrs} d="{d}"/>')
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300" width="480" height="600">\n'
           + "\n".join(body) + "\n</svg>\n")
    open(os.path.join(OUT, f"{i}-{n}.svg"), "w").write(svg)
    report[n] = {"order": [p for _, p, _ in order], "stray_px": stray}
json.dump(report, open(os.path.join(OUT, "parts.json"), "w"), indent=1)
