# Dựng Koa 3D từ ĐÚNG đường viền của bản vẽ (KoaSceneData): mảng thân phồng thành khối,
# mảng mặt dán lên bề mặt. Tách từ koa_guide.py (v4) để koa_pose.py dùng lại.
import bpy, bmesh, math, json, re
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt

sc = None
def scene():
    global sc
    sc = bpy.context.scene
    return sc

# ---------------------------------------------------------------- art
def find(nodes, pred, acc):
    for n in nodes:
        if pred(n):
            acc.append(n)
        find(n.get("kids", []), pred, acc)
    return acc
ART = []
def load(path):
    """Đọc cây cảnh từ KoaSceneData.swift (hoặc JSON)."""
    global ART
    s = open(path).read()
    if path.endswith(".swift"):
        s = s[s.index('##"') + 3:s.index('"##')]
    ART[:] = json.loads(s)["nodes"]
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
