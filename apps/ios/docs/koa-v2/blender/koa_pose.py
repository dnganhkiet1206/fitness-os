# Thư viện dáng Koa cho storyboard (Koa V2, 05/11/2026).
#
# Mẫu 3D dựng từ đúng đường viền bản vẽ (koa_model.py), gắn bộ xương đơn giản:
#   root → hips → chest → head
#                      ↳ upper.L/R → fore.L/R  (tay hai đoạn, khuỷu ở giữa)
#   root → foot.L/R
# Mặt lấy từ biểu cảm của app (faces.json, do KoaRender xuất) hoặc biểu cảm vẽ thêm
# (koa_faces_gym.py). Mỗi dáng chụp ở nhiều góc máy storyboard.
#
#   Blender -b --factory-startup --python koa_pose.py -- KoaSceneData.swift faces.json nose.json OUT [MODE] [ONLY]
#   MODE: poses (mặc định) | faces (cận mặt mọi biểu cảm)
import bpy, bmesh, math, os, sys, json
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import koa_model as km
import koa_faces_gym as gym

argv = sys.argv[sys.argv.index("--") + 1:]
SCENE, FACES_JSON, NOSE_JSON, OUT = argv[:4]
MODE = argv[4] if len(argv) > 4 else "poses"
ONLY = argv[5].split(",") if len(argv) > 5 and argv[5] else None
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = km.scene()
km.load(SCENE)
APP_FACES = json.load(open(FACES_JSON))
NOSE = json.load(open(NOSE_JSON))

FUR, LIGHT, DARK, NOSEC, SHADE = "#BFC7CF", "#D7DDE3", "#20242A", "#3A4654", "#A9B2BC"
FS = ("#B7BFC8", 0.45)
P1 = lambda a: km.sample(a["d"])[0]
EPS = 0.006

# ---------------------------------------------------------------- body (như v4)
shadow = km.ellipse(120, 294, 64, 9)
sh = km.mesh_obj("shadow", [(0, 0, 0)] * len(shadow), [tuple(range(len(shadow)))])
for k, v in enumerate(sh.data.vertices):
    t = 2 * math.pi * k / len(shadow); v.co = (0.64 * math.cos(t), -0.05 + 0.35 * math.sin(t), 0.001)
km.tag(sh, "shadow", "#AEB6BF", 0.45)

feet = [km.inflate(f"foot_{s}", FUR, P1(km.by_id(f"leg_{n}_lower")), 0, 0.24, -0.10) for s, n in (("L", "left"), ("R", "right"))]
torso = km.inflate("torso", FUR, P1(km.by_id("torso_front")), 0, 0.47, 0.03)
arms = [km.inflate(f"arm_{s}", FUR, P1(km.by_id(f"arm_{n}_upper")), 0, 0.14, -0.02) for s, n in (("L", "left"), ("R", "right"))]
ears = [km.inflate(f"ear_{s}", FUR, P1(km.by_id(f"ear_{n}")), 11, 0.11, 0.14, FS) for s, n in (("L", "left"), ("R", "right"))]
head = km.inflate("head", FUR, P1(km.by_id("head_front")), 11, 0.62, 0.0, FS)
tufts = [km.inflate("tuft", FUR, P1(km.by_d(pre)), 11, 0.07, -0.02, FS) for pre in ("M130 48", "M120 48")]
TB, HB = km.bvh(torso), km.bvh(head)
FB = [km.bvh(o) for o in feet]; AB = [km.bvh(o) for o in arms]; EB = [km.bvh(o) for o in ears]
belly = km.decal("belly", LIGHT, P1(km.by_id("belly")), 0, [TB], EPS)
chin = km.decal("chin_shade", "#B5BDC6", P1(km.by_d("M85 174")), 0, [TB], 2 * EPS)
legsh = [km.decal(f"leg_shade_{s}", "#B4BCC5", P1(km.by_d(p)), 0, [FB[i]], EPS) for i, (s, p) in enumerate((("L", "M104 256"), ("R", "M136 256")))]
armsh = [km.decal(f"arm_shade_{s}", "#B2BAC3", P1(km.by_d(p)), 0, [AB[i]], EPS, step=1.0) for i, (s, p) in enumerate((("L", "M71.5 192"), ("R", "M168.5 192")))]
earin = [km.decal(f"ear_in_{s}", LIGHT, P1(km.by_id(f"ear_{n}_inner")), 11, [EB[i]], EPS) for i, (s, n) in enumerate((("L", "left"), ("R", "right")))]


# ---------------------------------------------------------------- face
def hexrgb(h):
    h = h.lstrip("#"); return [int(h[i:i + 2], 16) for i in (0, 2, 4)]
def blend(fg, bg, a):
    f, b = hexrgb(fg), hexrgb(bg)
    return "#%02X%02X%02X" % tuple(round(b[i] + (f[i] - b[i]) * a) for i in range(3))

NOSE_BOX = (104, 136, 93, 142)
def in_nose(lines):
    xs = [p[0] for l in lines for p in l]; ys = [p[1] for l in lines for p in l]
    return min(xs) >= NOSE_BOX[0] and max(xs) <= NOSE_BOX[1] and min(ys) >= NOSE_BOX[2] and max(ys) <= NOSE_BOX[3]

def gym_shapes(name):
    """Biểu cảm vẽ thêm → cùng dạng với faces.json (toạ độ tuyệt đối, đã cộng 11)."""
    out = []
    for s in gym.FACES[name]:
        lines = [[(x, y + 11) for x, y in l] for l in km.sample(s["d"])]
        d = dict(lines=lines, opacity=1.0)
        if s.get("fill") and s["fill"] != "none": d["fill"] = s["fill"]; d["fillAlpha"] = 1.0
        if s.get("stroke"): d["stroke"] = s["stroke"]; d["strokeWidth"] = s["width"]; d["strokeAlpha"] = 1.0
        out.append(d)
    return out + NOSE

FACE_OBJS = []
def build_face(name):
    for o in FACE_OBJS:
        bpy.data.objects.remove(o, do_unlink=True)
    FACE_OBJS.clear()
    shapes = gym_shapes(name) if name in gym.FACES else APP_FACES[name]
    nose_bvh = None
    for i, s in enumerate(shapes):
        lift = 0.0025 + 0.0011 * i
        nose_part = in_nose(s["lines"])
        hosts = [HB] + ([nose_bvh] if nose_bvh and nose_part else [])
        polys = []
        if s.get("fill"):
            col = s["fill"]; a = s.get("fillAlpha", 1) * s.get("opacity", 1)
            if a < 0.99: col = blend(col, NOSEC if nose_part and col != NOSEC else FUR, a)
            polys += [(col, l[:-1] if l[0] == l[-1] else l) for l in s["lines"] if len(l) >= 3]
        if s.get("stroke"):
            col = s["stroke"]; a = s.get("strokeAlpha", 1) * s.get("opacity", 1)
            if a < 0.99: col = blend(col, NOSEC if nose_part else FUR, a)
            polys += [(col, km.stroke(l, s["strokeWidth"])) for l in s["lines"] if len(l) >= 2]
        for col, poly in polys:
            xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
            size = max(max(xs) - min(xs), max(ys) - min(ys))
            if size < 0.8: continue
            is_nose = s.get("fill") == NOSEC and nose_part
            try:
                o = km.decal(f"face{i}", col, poly, 0, hosts, lift, bulge=0.07 if is_nose else 0.0,
                             step=max(0.6, min(2.0, size / 6)))
            except Exception:
                continue
            FACE_OBJS.append(o)
            if is_nose: nose_bvh = km.bvh(o)
    return FACE_OBJS


# ---------------------------------------------------------------- rig
def Wv(x, y, depth=0.0):
    X, Z = km.W((x, y)); return Vector((X, depth, Z))

arm_data = bpy.data.armatures.new("rig")
rig = bpy.data.objects.new("rig", arm_data); sc.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig; rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
def bone(name, h, t, parent=None, connect=False):
    b = eb.new(name); b.head = h; b.tail = t
    if parent: b.parent = eb[parent]; b.use_connect = connect
    return b
bone("root", (0, 0, 0), (0, 0, 0.25))
bone("hips", (0, 0.02, 0.35), (0, 0.02, 0.95), "root")
bone("chest", (0, 0.02, 0.95), (0, 0.02, 1.17), "hips", True)
bone("head", (0, 0, 1.17), (0, 0, 2.2), "chest")
SHOULDER, ELBOW, HAND = (80, 178), (61, 210), (46, 236)
for s, sg in (("L", 1), ("R", -1)):
    mx = lambda p: (240 - p[0], p[1]) if sg < 0 else p
    bone(f"upper.{s}", Wv(*mx(SHOULDER), -0.02), Wv(*mx(ELBOW), -0.02), "chest")
    bone(f"fore.{s}", Wv(*mx(ELBOW), -0.02), Wv(*mx(HAND), -0.02), f"upper.{s}", True)
    fx = -0.255 * sg
    bone(f"foot.{s}", (fx, -0.05, 0.27), (fx, -0.27, 0.12), "root")
    # đùi (vẽ thêm, 05/11): khuất trong thân khi đứng, lộ ra khi bàn chân rời khỏi hông
    bone(f"thigh.{s}", (-0.19 * sg, 0.0, 0.50), (fx, -0.05, 0.27), "hips")
bpy.ops.object.mode_set(mode="OBJECT")
for s in ("L", "R"):
    c = rig.pose.bones[f"thigh.{s}"].constraints.new("STRETCH_TO")
    c.target = rig; c.subtarget = f"foot.{s}"; c.volume = "NO_VOLUME"

def parent_bone(o, b):
    mw = o.matrix_world.copy()
    o.parent = rig; o.parent_type = "BONE"; o.parent_bone = b
    bb = arm_data.bones[b]
    o.matrix_parent_inverse = (rig.matrix_world @ bb.matrix_local @ Matrix.Translation((0, bb.length, 0))).inverted()
    o.matrix_world = mw

def skin_arm(o, s):
    """Tay một mảnh của bản vẽ → hai nhóm đỉnh, khuỷu mềm ở giữa."""
    a = arm_data.bones[f"upper.{s}"].head_local; c = arm_data.bones[f"fore.{s}"].tail_local
    axis = c - a; L2 = axis.length_squared
    up, fo = o.vertex_groups.new(name=f"upper.{s}"), o.vertex_groups.new(name=f"fore.{s}")
    for v in o.data.vertices:
        t = max(0.0, min(1.0, (v.co - a).dot(axis) / L2))
        w = max(0.0, min(1.0, (t - 0.42) / 0.26)); w = w * w * (3 - 2 * w)
        up.add([v.index], 1 - w, "REPLACE"); fo.add([v.index], w, "REPLACE")
    m = o.modifiers.new("rig", "ARMATURE"); m.object = rig
    o.parent = rig

def thigh_mesh(s):
    """Đoạn đùi tròn màu lông dọc xương `thigh.{s}`, gắn trọn vào xương ấy."""
    b = arm_data.bones[f"thigh.{s}"]
    a, c = b.head_local, b.tail_local
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
    axis = (c - a); L = axis.length; q = axis.to_track_quat("Z", "Y")
    for v in bm.verts:
        x, y, z = v.co
        z2 = z * 0.5 + 0.5                      # 0 ở hông, 1 ở bàn chân
        v.co = a + q @ Vector((x * 0.15, y * 0.15, z2 * L))
    me = bpy.data.meshes.new(f"thigh_{s}"); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(f"thigh_{s}", me); sc.collection.objects.link(o)
    for p in me.polygons: p.use_smooth = True
    km.tag(o, f"thigh_{s}", FUR)
    g = o.vertex_groups.new(name=f"thigh.{s}"); g.add([v.index for v in me.vertices], 1.0, "REPLACE")
    m = o.modifiers.new("rig", "ARMATURE"); m.object = rig
    o.parent = rig
    return o

thighs = [thigh_mesh(s) for s in ("L", "R")]
for i, s in enumerate(("L", "R")):
    skin_arm(arms[i], s); skin_arm(armsh[i], s)
    parent_bone(feet[i], f"foot.{s}"); parent_bone(legsh[i], f"foot.{s}")
for o in (torso, belly, chin):
    parent_bone(o, "hips")
for o in [head] + tufts + ears + earin:
    parent_bone(o, "head")
parent_bone(sh, "root")


# ---------------------------------------------------------------- props (bảng màu Koa)
def mat_obj(o, part, col):
    km.tag(o, part, col)
    for p in o.data.polygons: p.use_smooth = True
    return o

def cyl(part, col, r, depth, loc, rot=(0, 0, 0), verts=40):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=[math.radians(a) for a in rot], vertices=verts)
    return mat_obj(bpy.context.object, part, col)

def ball(part, col, r, loc, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=32, ring_count=16)
    o = bpy.context.object; o.scale = scale
    return mat_obj(o, part, col)

PROP_OBJS = []
def hand_pos(s):
    return arm_data.bones[f"fore.{s}"].tail_local + Vector((0, 0, 0.02))

def prop(kind, s="R"):
    """Đạo cụ trong tay `s`, dựng ở tư thế nghỉ rồi gắn vào xương cẳng tay."""
    h = hand_pos(s) if s else None; objs = []
    if kind == "dumbbell":   # tay cầm thanh ngang, đĩa hai đầu (trục trước – sau)
        objs.append(cyl("bar", "#8E98A3", 0.028, 0.36, h, (90, 0, 0)))
        for dy in (-0.15, 0.15):
            objs.append(cyl("plate", "#3A4654", 0.10, 0.07, h + Vector((0, dy, 0)), (90, 0, 0)))
            objs.append(cyl("plate_rim", "#E8842A", 0.06, 0.075, h + Vector((0, dy, 0)), (90, 0, 0)))
    elif kind == "barbell":  # thanh dài ngang vai, đĩa lớn
        c = Vector((0, h.y, h.z))
        objs.append(cyl("bar", "#8E98A3", 0.025, 2.1, c, (0, 90, 0)))
        for dx in (-0.88, 0.88):
            objs.append(cyl("plate", "#3A4654", 0.26, 0.09, c + Vector((dx, 0, 0)), (0, 90, 0)))
            objs.append(cyl("plate_rim", "#E8842A", 0.16, 0.095, c + Vector((dx, 0, 0)), (0, 90, 0)))
    elif kind == "kettlebell":
        c = Vector((0, h.y - 0.05, h.z - 0.16))
        objs.append(ball("kettle", "#3A4654", 0.15, c))
        bpy.ops.mesh.primitive_torus_add(major_radius=0.09, minor_radius=0.022, location=c + Vector((0, 0, 0.15)), rotation=(math.radians(90), 0, 0))
        objs.append(mat_obj(bpy.context.object, "kettle_handle", "#3A4654"))
        objs.append(ball("kettle_mark", "#E8842A", 0.05, c + Vector((0, -0.135, 0)), (1, 0.3, 1)))
    elif kind in ("bottle", "trophy"):
        # dựng dọc theo cẳng tay, nhô ra khỏi nắm tay: tay giơ lên thì cúp ở trên, tay đưa tới miệng thì
        # miệng chai hướng về mặt
        bb = arm_data.bones[f"fore.{s}"]; d = (bb.tail_local - bb.head_local).normalized()
        M = Matrix.Translation(h) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4() @ Matrix.Scale(1.5 if kind == "trophy" else 1.3, 4)
        parts = ([("bottle", "#7CC6EE", 0.06, 0.26, 0.10), ("bottle_band", "#FFFFFF", 0.062, 0.05, 0.05),
                  ("bottle_cap", "#E8842A", 0.042, 0.06, 0.26)] if kind == "bottle" else
                 [("trophy_base", "#3A4654", 0.08, 0.06, 0.03), ("trophy_stem", "#E8B23A", 0.025, 0.12, 0.12)])
        for part, col, r, depth, z in parts:
            o = cyl(part, col, r, depth, (0, 0, 0)); o.matrix_world = M @ Matrix.Translation((0, 0, z)); objs.append(o)
        if kind == "trophy":
            bpy.ops.mesh.primitive_cone_add(radius1=0.06, radius2=0.15, depth=0.2, location=(0, 0, 0), vertices=40)
            o = mat_obj(bpy.context.object, "trophy_cup", "#E8B23A"); o.matrix_world = M @ Matrix.Translation((0, 0, 0.28)); objs.append(o)
            for side in (-1, 1):
                bpy.ops.mesh.primitive_torus_add(major_radius=0.05, minor_radius=0.014, location=(0, 0, 0))
                o = mat_obj(bpy.context.object, "trophy_handle", "#E8B23A")
                o.matrix_world = M @ Matrix.Translation((0.15 * side, 0, 0.30)) @ Matrix.Rotation(math.radians(90), 4, "X")
                objs.append(o)
    elif kind == "mat":       # thảm tập dưới sàn (không gắn tay)
        bpy.ops.mesh.primitive_cube_add(location=(0, -0.15, 0.006)); o = bpy.context.object
        o.scale = (0.55, 0.95, 0.006); objs.append(mat_obj(o, "mat", "#E8842A"))
        PROP_OBJS.extend(objs); return objs
    for o in objs:
        parent_bone(o, f"fore.{s}")
    PROP_OBJS.extend(objs)
    return objs

def clear_props():
    for o in PROP_OBJS:
        bpy.data.objects.remove(o, do_unlink=True)
    PROP_OBJS.clear()


# ---------------------------------------------------------------- posing (quay theo TRỤC THẾ GIỚI)
# X sang phải màn, Y ra sau (máy quay trước ở −Y), Z lên trên.
#   cúi / ngả tới trước: +X · tay đưa ra trước: −X · nghiêng sang phải: +Y · quay mặt sang phải màn: +Z
#   tay TRÁI (bên trái màn) giơ ngang ra ngoài: +Y ; tay PHẢI: −Y
ORDER = ["root", "hips", "chest", "head", "upper.L", "fore.L", "upper.R", "fore.R", "foot.L", "foot.R"]

def arm_dir(side, fwd, s):
    """Hướng tuyệt đối của một đoạn tay: `side` độ giơ ngang ra ngoài (0 buông thõng, 90 ngang vai,
    180 thẳng lên, >180 vắt qua đầu, âm là khép vào trong), `fwd` độ đưa ra trước (âm là ra sau)."""
    v = Vector((0, 0, -1))
    v.rotate(Matrix.Rotation(math.radians(side) * (1 if s == "L" else -1), 3, "Y"))
    v.rotate(Matrix.Rotation(math.radians(-fwd), 3, "X"))
    return v

def apply_pose(pose):
    rig.data.pose_position = "POSE"
    deltas = {}
    for name in ORDER:
        pb = rig.pose.bones[name]; b = pb.bone
        dp = deltas[b.parent.name] if b.parent else Matrix.Identity(4)
        spec = pose.get(name, {})
        if isinstance(spec, tuple): spec = {"rot": spec}
        h = dp @ b.head_local
        if "dir" in spec:
            cur = ((dp @ b.tail_local) - h).normalized()
            R = cur.rotation_difference(arm_dir(*spec["dir"], name[-1])).to_matrix().to_4x4()
        else:
            rx, ry, rz = spec.get("rot", (0, 0, 0))
            R = Euler((math.radians(rx), math.radians(ry), math.radians(rz)), "XYZ").to_matrix().to_4x4()
        D = Matrix.Translation(Vector(spec.get("loc", (0, 0, 0)))) @ Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ dp
        deltas[name] = D
        pb.matrix = D @ b.matrix_local
        bpy.context.view_layer.update()

def rest_pose():
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()

def body_objects():
    return [o for o in sc.objects if o.type == "MESH" and o.get("part") not in (None, "shadow", "mat")]

def world_bounds(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9)); hi = -lo
    for o in objs:
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        mw = ev.matrix_world
        for v in me.vertices:
            p = mw @ v.co
            lo = Vector(map(min, lo, p)); hi = Vector(map(max, hi, p))
        ev.to_mesh_clear()
    return lo, hi

def ground(pose, air=0.0):
    """Hạ / nâng cả hình để điểm thấp nhất chạm sàn (rồi bay lên `air` nếu đang nhảy)."""
    lo, _ = world_bounds(body_objects())
    r = dict(pose.get("root", {})) if isinstance(pose.get("root", {}), dict) else {"rot": pose["root"]}
    loc = list(r.get("loc", (0, 0, 0))); loc[2] += -lo.z + air
    r["loc"] = tuple(loc); p = dict(pose); p["root"] = r
    apply_pose(p)
    return p


# ---------------------------------------------------------------- dáng
# face: tên biểu cảm (app hoặc vẽ thêm) · props: đạo cụ · air: cao khỏi sàn (m)
def arms_(l=None, lf=None, r=None, rf=None):
    """Tay theo hướng tuyệt đối (side, fwd) — xem `arm_dir`. `lf` / `rf`: cẳng tay; thiếu thì thẳng theo bắp tay."""
    out = {}
    for s, up, fo in (("L", l, lf), ("R", r, rf)):
        if up: out[f"upper.{s}"] = {"dir": up}; out[f"fore.{s}"] = {"dir": fo or up}
    return out

POSES = [
    ("idle", "Đứng chào", "happy", {}, []),
    ("wave", "Vẫy tay", "happy", {**arms_(r=(100, 12), rf=(140, 18)), "head": (0, -8, 0)}, []),
    ("curl", "Cuốn tạ tay", "grit", {"chest": (-6, 0, 0), "head": (6, 0, 8), **arms_(r=(4, 12), rf=(6, 150))}, [("dumbbell", "R")]),
    ("press", "Đẩy tạ vai", "strain", {**arms_(l=(100, 8), lf=(160, 8), r=(100, 8), rf=(160, 8)), "head": (-10, 0, 0)},
     [("dumbbell", "L"), ("dumbbell", "R")]),
    ("squat", "Squat", "focus", {"hips": {"rot": (28, 0, 0), "loc": (0, 0.28, -0.34)}, "head": (-24, 0, 0),
                                 **arms_(l=(8, 85), r=(8, 85)),
                                 "foot.L": {"loc": (-0.06, -0.02, 0)}, "foot.R": {"loc": (0.06, -0.02, 0)}}, [("mat", None)]),
    ("deadlift", "Deadlift", "grit", {"hips": {"rot": (48, 0, 0), "loc": (0, 0.22, -0.20)}, "head": (-40, 0, 0),
                                      **arms_(l=(8, 0), r=(8, 0))}, [("barbell", "R")]),
    ("swing", "Vung tạ ấm", "focus", {"hips": {"rot": (10, 0, 0), "loc": (0, 0.08, -0.08)},
                                      **arms_(l=(-12, 48), r=(-12, 48))}, [("kettlebell", "R")]),
    ("plank", "Plank", "strain", {"root": (74, 0, 0), "head": (-55, 0, 0), **arms_(l=(6, 0), lf=(4, 90), r=(6, 0), rf=(4, 90))},
     [("mat", None)]),
    ("lunge", "Lunge", "focus", {"hips": {"loc": (0, 0.02, -0.26)},
                                 "foot.L": {"loc": (0, -0.62, 0)}, "foot.R": {"rot": (-30, 0, 0), "loc": (0, 0.62, 0.06)},
                                 **arms_(l=(48, -10), lf=(-55, 0), r=(48, -10), rf=(-55, 0))}, [("mat", None)]),
    ("jog", "Chạy bộ", "pant", {"hips": (12, 0, 0), "head": (-8, 0, 0), **arms_(l=(10, 50), lf=(10, 140), r=(10, -40), rf=(10, 60)),
                                "foot.R": {"rot": (-50, 0, 0), "loc": (0, 0.42, 0.30)}, "foot.L": {"loc": (0, -0.30, 0)}}, []),
    ("cheer", "Nhảy ăn mừng", "roar", {**arms_(l=(132, 10), lf=(145, 10), r=(132, 10), rf=(145, 10)), "head": (-12, 0, 0),
                                       "foot.L": {"rot": (-30, 0, 0), "loc": (-0.08, 0.10, 0.12)},
                                       "foot.R": {"rot": (-30, 0, 0), "loc": (0.08, 0.10, 0.12)}}, [], 0.32),
    ("flex", "Gồng tay khoe", "smug", {"chest": (-5, 0, 0), **arms_(l=(92, 6), lf=(168, 30), r=(92, 6), rf=(168, 30))}, []),
    ("stretch", "Giãn cơ nghiêng", "content", {"hips": (0, -10, 0), "chest": (0, -14, 0), "head": (0, -10, 0),
                                               **arms_(l=(150, 4), lf=(205, 4), r=(38, -8), rf=(-50, 0))}, [("mat", None)]),
    ("water", "Uống nước", "warm", {"head": (-16, 0, 0), **arms_(r=(-10, 82), rf=(-28, 122))}, [("bottle", "R")]),
    ("rest", "Ngồi nghỉ mệt", "pant", {"hips": {"rot": (-8, 0, 0), "loc": (0, 0.06, -0.40)}, "chest": (14, 0, 0),
                                       "head": (16, 0, 0), "foot.L": {"rot": (-70, 0, 0), "loc": (-0.04, -0.55, 0.0)},
                                       "foot.R": {"rot": (-70, 0, 0), "loc": (0.04, -0.55, 0.0)},
                                       **arms_(l=(28, 8), r=(28, 8))}, [("bottle", "L")]),
    ("meditate", "Thiền", "meditate", {"hips": {"loc": (0, 0, -0.42)}, "foot.L": {"rot": (0, 0, -55), "loc": (0.18, -0.36, 0)},
                                       "foot.R": {"rot": (0, 0, 55), "loc": (-0.18, -0.36, 0)},
                                       **arms_(l=(26, 35), lf=(12, 80), r=(26, 35), rf=(12, 80))}, [("mat", None)]),
    ("trophy", "Nâng cúp", "delighted", {**arms_(r=(105, 12), rf=(148, 14), l=(30, 40), lf=(-10, 120)), "head": (-10, 0, -8)},
     [("trophy", "R")]),
]

# Góc máy storyboard: (tên, nhãn, góc quanh hình °, độ cao máy °, tiêu cự mm, khung)
# góc dương: máy đứng bên tay PHẢI của hình (bên phải màn ở mặt trước), âm: bên tay trái
CAMS = [
    ("front", "Trước · ngang mắt", 0, 4, 50, 1.15),
    ("q34r", "3/4 phải", 38, 8, 50, 1.15),
    ("q34l", "3/4 trái", -38, 8, 50, 1.15),
    ("side", "Nghiêng phải", 90, 4, 50, 1.15),
    ("back34", "3/4 sau", 145, 10, 50, 1.15),
    ("low", "Góc thấp (anh hùng)", 28, -18, 35, 1.25),
    ("high", "Góc cao (nhìn xuống)", -32, 42, 50, 1.2),
]

# ---------------------------------------------------------------- render
sc.render.engine = "BLENDER_WORKBENCH"
shd = sc.display.shading
shd.light = "FLAT"; shd.color_type = "MATERIAL"
shd.show_object_outline = True; shd.object_outline_color = km.lin("#5E6773")
shd.show_cavity = False; shd.show_specular_highlight = False
shd.background_type = "VIEWPORT"; shd.background_color = km.lin("#F7F5F0")
sc.view_settings.view_transform = "Standard"
sc.display.render_aa = "16"
sc.render.resolution_x = sc.render.resolution_y = 720
bpy.ops.object.empty_add(location=(0, 0, 1)); aim = bpy.context.object
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
tr = cam.constraints.new("TRACK_TO"); tr.target = aim; tr.track_axis = "TRACK_NEGATIVE_Z"; tr.up_axis = "UP_Y"

def shoot(path, yaw, elev, lens, fit, objs, target=None):
    lo, hi = world_bounds(objs)
    c = target if target is not None else (lo + hi) / 2
    r = max((hi - lo).length / 2, 0.4) * fit
    cam.data.lens = lens
    fov = 2 * math.atan(18 / lens)              # sensor 36 mm, khung vuông
    dist = r / math.sin(fov / 2)
    y, e = math.radians(yaw), math.radians(elev)
    aim.location = c
    cam.location = c + dist * Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
    cam.data.clip_start, cam.data.clip_end = 0.05, dist * 4
    bpy.context.view_layer.update()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)

report = {}
if MODE == "faces":
    names = list(APP_FACES) + list(gym.FACES)
    for n in names:
        if ONLY and n not in ONLY: continue
        rest_pose(); build_face(n)
        for o in FACE_OBJS: parent_bone(o, "head")
        for cname, yaw in (("front", 0), ("q34", -32)):
            lo, hi = world_bounds([head] + ears)
            shoot(os.path.join(OUT, f"face-{n}-{cname}.png"), yaw, 4, 85, 1.05, [head] + ears)
    json.dump({"faces": names}, open(os.path.join(OUT, "faces.json"), "w"), indent=1)
    sys.exit(0)

current_face = None
for entry in POSES:
    key, label, face, pose, props = entry[:5]
    air = entry[5] if len(entry) > 5 else 0.0
    if ONLY and key not in ONLY: continue
    rest_pose(); clear_props()
    if face != current_face:
        build_face(face); current_face = face
        for o in FACE_OBJS: parent_bone(o, "head")
    for kind, side in props: prop(kind, side)
    apply_pose(pose)
    ground(pose, air)
    for cname, clabel, yaw, elev, lens, fit in CAMS:
        shoot(os.path.join(OUT, f"{key}-{cname}.png"), yaw, elev, lens, fit, body_objects() + PROP_OBJS)
    report[key] = dict(label=label, face=face, props=[k for k, _ in props])
json.dump({"poses": report, "cams": [(c[0], c[1]) for c in CAMS]}, open(os.path.join(OUT, "poses.json"), "w"), indent=1, ensure_ascii=False)
