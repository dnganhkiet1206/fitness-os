# Beat board màn nghỉ "Leo đỉnh ASCND" (07/11/2026, Kiệt duyệt hồ sơ tiền kỳ v18).
#
# Nháp dáng + cảnh cho từng nhịp story: mẫu 3D Koa của koa_pose.py (đường viền bản vẽ, tay có khuỷu, mặt app),
# thêm dáng mới, cảnh trạm núi dựng khối thô 3 lớp (gần / giữa / xa) và màu theo color script. Mỗi khung một
# góc máy có lý do. Đây là NHÁP để duyệt dáng / cảnh / máy, không phải hình cuối.
#
#   Blender -b --factory-startup --python koa_beatboard.py -- KoaSceneData.swift faces.json nose.json OUT
import bpy, math, os, sys, json
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
src = open(os.path.join(HERE, "koa_pose.py")).read().split("report = {}")[0]
argv = sys.argv[sys.argv.index("--") + 1:]
sys.argv = sys.argv[:sys.argv.index("--") + 1] + argv[:4] + ["poses"]
g = {"__file__": os.path.join(HERE, "koa_pose.py"), "__name__": "koa_pose_lib"}
exec(compile(src, "koa_pose.py", "exec"), g)
OUT = argv[3]
km, sc, cam, aim = g["km"], g["sc"], g["cam"], g["aim"]
arms_, prop, apply_pose, ground, rest_pose = g["arms_"], g["prop"], g["apply_pose"], g["ground"], g["rest_pose"]
build_face, parent_bone, cyl, ball, mat_obj = g["build_face"], g["parent_bone"], g["cyl"], g["ball"], g["mat_obj"]
body_objects, world_bounds, clear_props, PROP_OBJS = g["body_objects"], g["world_bounds"], g["clear_props"], g["PROP_OBJS"]

W, H = 720, 936          # sân khấu ≈ 60 % màn dọc
sc.render.resolution_x, sc.render.resolution_y = W, H
shd = sc.display.shading

# ---------------------------------------------------------------- dáng mới
SIT = {"hips": {"rot": (-8, 0, 0), "loc": (0, 0.06, -0.40)}, "chest": (10, 0, 0),
       "foot.L": {"rot": (-70, 0, 0), "loc": (-0.04, -0.55, 0.0)}, "foot.R": {"rot": (-70, 0, 0), "loc": (0.04, -0.55, 0.0)}}
POSES = {
    "tie": {"hips": {"rot": (34, 0, 0), "loc": (0, 0.16, -0.36)}, "head": (-18, 0, 0),
            "foot.R": {"loc": (0.04, -0.22, 0)}, **arms_(l=(12, 62), lf=(8, 18), r=(12, 62), rf=(8, 18))},
    "point": {"chest": (-8, 0, 0), "head": (-26, 0, -16), **arms_(r=(108, 26), rf=(150, 36), l=(14, 10)),
              "foot.L": {"loc": (0, -0.12, 0)}},
    "walkA": {"hips": (8, 0, 0), "head": (-10, 0, 0), **arms_(l=(10, 30), lf=(10, 70), r=(10, -24), rf=(10, 10)),
              "foot.R": {"rot": (-30, 0, 0), "loc": (0, 0.20, 0.14)}, "foot.L": {"loc": (0, -0.22, 0)}},
    "sitdrink": {**SIT, "head": (-18, 0, 0), **arms_(r=(-10, 82), rf=(-28, 122), l=(28, 8))},
    "balance": {"hips": (0, 10, 0), "chest": (0, -6, 0), "head": (0, 8, 0), **arms_(l=(96, 6), lf=(110, 6), r=(84, 6), rf=(70, 6)),
                "foot.R": {"rot": (-24, 0, 0), "loc": (0.06, 0.06, 0.16)}},
    "fall": {"hips": {"rot": (-26, 0, 0), "loc": (0, 0.14, -0.42)}, "chest": (-10, 0, 0), "head": (6, 0, 10),
             "foot.L": {"rot": (-100, 0, 0), "loc": (-0.06, -0.50, 0.22)}, "foot.R": {"rot": (-85, 0, 0), "loc": (0.08, -0.48, 0.12)},
             **arms_(l=(34, -40), lf=(26, -60), r=(34, -40), rf=(26, -60))},
    "shelter": {"head": (14, 0, 0), **arms_(r=(150, 12), rf=(172, 12), l=(14, 30), lf=(10, 70))},
    "lookup": {**SIT, "head": (-30, 0, 6), **arms_(l=(24, 30), lf=(10, 70), r=(24, 30), rf=(10, 70))},
    "sincere": {**SIT, "head": (-4, 0, 0), **arms_(l=(22, 30), lf=(10, 75), r=(30, 40), rf=(60, 120))},
    "standup": {"hips": {"rot": (24, 0, 0), "loc": (0, 0.12, -0.22)}, "head": (-24, 0, 0),
                **arms_(l=(18, 40), lf=(8, 10), r=(18, 40), rf=(8, 10))},
    "go": {"chest": (-4, 0, 0), "head": (-12, 0, 0), **arms_(r=(18, 30), rf=(24, 120), l=(30, -20)),
           "foot.R": {"rot": (-20, 0, 0), "loc": (0, -0.20, 0.06)}},
    "flag": {"chest": (-8, 0, 0), "head": (-16, 0, 0), **arms_(l=(150, 14), lf=(160, 14), r=(140, 14), rf=(150, 14)),
             "foot.L": {"loc": (-0.04, -0.10, 0)}},
}

# ---------------------------------------------------------------- đạo cụ riêng của beat board
def own_prop(kind):
    h = g["hand_pos"]("R"); objs = []
    if kind == "leaf":
        o = ball("leaf", "#5FAE5A", 0.95, h + Vector((0, 0, 0.2)), (1.3, 1.0, 0.16)); objs.append(o)
        objs.append(cyl("stem", "#3F7A3C", 0.02, 0.3, h + Vector((0, 0, -0.02))))
    elif kind == "flag":
        objs.append(cyl("pole", "#8E98A3", 0.035, 3.0, h + Vector((0, 0, 0.8))))
        bpy.ops.mesh.primitive_plane_add(size=1, location=h + Vector((0.62, 0, 1.9)), rotation=(math.radians(90), 0, 0))
        o = bpy.context.object; o.scale = (1.2, 0.75, 1); objs.append(mat_obj(o, "flag", "#E8842A"))
    for o in objs:
        parent_bone(o, "fore.R")
    PROP_OBJS.extend(objs)

# ---------------------------------------------------------------- cảnh (3 lớp) + màu theo color script
ENV = []
def env_obj(o, part, col):
    mat_obj(o, part, col); ENV.append(o); return o

def box(part, col, loc, scale, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=[math.radians(a) for a in rot]); o = bpy.context.object
    o.scale = scale; return env_obj(o, part, col)

def cone(part, col, loc, r, h, verts=6, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(radius1=r, depth=h, location=loc, vertices=verts, rotation=[math.radians(a) for a in rot])
    return env_obj(bpy.context.object, part, col)

def rock(loc, s, col):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=s, location=loc); o = bpy.context.object
    o.scale = (1.3, 1.0, 0.7); return env_obj(o, "rock", col)

PAL = {  # trời, núi xa, núi giữa, đất, đá, nhấn
    "dawn":   ("#AFC6DE", "#8EA6C2", "#7E93A9", "#9AA88A", "#7D8792", "#E8842A"),
    "morning":("#F3DFA6", "#D9B98A", "#A9B98C", "#9FB47E", "#8C939A", "#4FA7D9"),
    "storm":  ("#9C98AE", "#7D7A93", "#6D7186", "#7E8C78", "#6A707A", "#C9C3D9"),
    "rain":   ("#A7B4BE", "#8696A2", "#7A8D86", "#7E9A78", "#6F7880", "#5FAE5A"),
    "sunset": ("#F2A97E", "#C8798A", "#9E6A7C", "#8E7E6A", "#7A6C70", "#FFD38A"),
    "summit": ("#FFD97A", "#F0B45A", "#D99A5A", "#C8B08A", "#9C8A7A", "#E8842A"),
}

def clear_env():
    for o in ENV: bpy.data.objects.remove(o, do_unlink=True)
    ENV.clear()

def build_env(station, H):
    clear_env()
    sky, far, mid, earth, stone, acc = PAL[{"base": "dawn", "stream": "morning", "bridge": "storm", "tree": "rain",
                                           "ledge": "sunset", "top": "summit"}[station]]
    shd.background_color = km.lin(sky)
    u = H  # 1 = chiều cao Koa
    # lớp xa: dãy núi + đỉnh ASCND
    for x, r, h in ((-9, 5, 7), (-2, 4, 5.5), (6, 5.5, 8), (13, 4, 5)):
        cone("far", far, (x * u, 30 * u, h * u / 2 - 1 * u), r * u, h * u, verts=5)
    if station != "top":
        cone("peak", "#F4F1EA", (2.5 * u, 26 * u, 6.5 * u), 3.2 * u, 13 * u, verts=5)
    # lớp giữa: sườn đồi
    box("hill", mid, (0, 12 * u, -1.2 * u), (24 * u, 4 * u, 2 * u), (0, 0, 0))
    # sàn
    box("ground", earth, (0, 2 * u, -0.05 * u), (14 * u, 10 * u, 0.05 * u))
    if station == "base":
        cone("tent", "#E8842A", (-1.6 * u, 1.2 * u, 0.55 * u), 0.9 * u, 1.1 * u, verts=4)
        box("sign", "#8B6A4A", (1.1 * u, 0.4 * u, 0.5 * u), (0.04 * u, 0.04 * u, 0.5 * u))
        box("sign_board", "#C9A27A", (1.25 * u, 0.4 * u, 0.9 * u), (0.3 * u, 0.03 * u, 0.12 * u), (0, 0, 8))
    if station == "stream":
        box("water", "#6FB8E0", (0, 1.4 * u, 0.0), (14 * u, 0.55 * u, 0.06 * u))
        rock((-0.9 * u, 0.9 * u, 0.05 * u), 0.42 * u, stone)
        rock((1.5 * u, 1.3 * u, 0.0), 0.3 * u, stone)
    if station == "bridge":
        box("cliffL", stone, (-3.6 * u, 0.5 * u, -2 * u), (2 * u, 2 * u, 2 * u))
        box("cliffR", stone, (3.6 * u, 0.5 * u, -2 * u), (2 * u, 2 * u, 2 * u))
        for i in range(-8, 9):
            box("plank", "#A57E57", (i * 0.2 * u, 0.0, -0.06 * u - 0.12 * u * (1 - (i / 8) ** 2)), (0.08 * u, 0.42 * u, 0.025 * u), (0, 4 * (i % 2), 0))
        for y in (-0.45, 0.45):
            env_obj(cyl("rope", "#7A5A3A", 0.018 * u, 7 * u, (0, y * u, 0.36 * u), (0, 90, 0)), "rope", "#7A5A3A")
        # vực bên dưới: sàn hạ thấp
        for o in ENV:
            if o.get("part") == "ground": o.location.z = -4 * u
    if station == "tree":
        env_obj(cyl("trunk", "#7A5A3A", 0.25 * u, 3 * u, (2.2 * u, 1.8 * u, 1.5 * u)), "trunk", "#7A5A3A")
        rock((2.2 * u, 1.8 * u, 3.3 * u), 1.4 * u, "#4E8E52")
        for i in range(14):   # mưa: vệt mảnh
            box("rain", "#D6E2EA", ((-3 + i * 0.45) * u, (-0.4 + (i % 3) * 0.9) * u, (2.6 - (i % 4) * 0.5) * u), (0.006 * u, 0.006 * u, 0.22 * u), (8, 0, 0))
    if station == "ledge":
        box("ledge", stone, (0, 0.6 * u, -0.6 * u), (2.6 * u, 1.6 * u, 0.6 * u), (0, 0, 4))
        for o in ENV:
            if o.get("part") == "ground": o.location.z = -3 * u
        for o in ENV:
            if o.get("part") == "peak": o.location = (0.0, -10 * u, 2.5 * u); o.scale = (0.5, 0.5, 0.75)
    if station == "top":
        cone("summit", "#E9E4DA", (0, 2 * u, -2.2 * u), 3.6 * u, 4.4 * u, verts=6)
        for o in ENV:
            if o.get("part") == "ground": o.location.z = -6 * u
    # lớp gần: đá / cỏ sát máy (mờ đậm hơn để tách lớp)
    # (lớp gần thật sẽ là cỏ / cành ở mép khung trong bản vẽ; khối thô che máy nên bỏ ở nháp)
    return acc

# ---------------------------------------------------------------- máy quay
def shot(path, target, yaw, elev, dist, lens=50, roll=0.0):
    cam.data.lens = lens
    cam.data.sensor_fit = "VERTICAL"
    y, e = math.radians(yaw), math.radians(elev)
    aim.location = target
    cam.location = target + dist * Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
    cam.location.z = max(cam.location.z, FLOOR + 0.06 * HKOA)
    cam.data.clip_start, cam.data.clip_end = 0.05, 400
    cam.rotation_mode = "XYZ"
    for c in list(cam.constraints):
        c.influence = 1
    bpy.context.view_layer.update()
    if roll:
        tr = cam.constraints[0]; mw = cam.matrix_world.copy(); tr.influence = 0
        cam.matrix_world = mw @ Matrix.Rotation(math.radians(roll), 4, "Z")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if roll: cam.constraints[0].influence = 1

# ---------------------------------------------------------------- 12 khung
# (mã, trạm, dáng, mặt, đạo cụ, máy: (yaw, elev, xa ×H, tiêu cự, nghiêng, tâm ×H), chữ)
BEATS = [
    ("01", "base", "tie", "happy", [], (22, 12, 3.0, 35, 0, 0.42), "Chân núi · Ngày xưa… · TOÀN CẢNH: buộc dây giày, đỉnh ASCND phía sau"),
    ("02", "base", "point", "grin", [], (30, -14, 2.8, 28, 0, 0.62), "Chân núi · MÁY THẤP: chỉ lên đỉnh, \"Hôm nay mình lên tới đó!\""),
    ("03", "stream", "sitdrink", "warm", [("bottle", "R")], (14, 6, 2.4, 50, 0, 0.42), "Trạm 1 · Mồi · TRUNG CẢNH: ngồi đá uống nước, \"+2,5 kg! Ghê chưa\""),
    ("04", "stream", "walkA", "confident", [], (60, 6, 3.4, 40, 0, 0.5), "Trạm 1 · Vỡ ra · MÁY TRƯỢT NGANG theo Koa: \"Đẩy bằng gót nhé. Đi thôi!\""),
    ("05", "bridge", "balance", "surprised", [], (-18, 34, 6.0, 35, -3, 0.2), "Cầu khỉ (set khó) · Xung đột · GÓC CAO, NGHIÊNG: cầu chao, Koa dang tay giữ thăng bằng"),
    ("06", "bridge", "balance", "plead", [], (6, 14, 2.6, 85, 4, 0.55), "Cầu khỉ · CẬN MẶT: \"Đừng nhìn xuống… đừng nhìn xuống…\""),
    ("07", "bridge", "fall", "sheepish", [], (30, 26, 3.4, 40, 0, 0.3), "Cầu khỉ · Vỡ ra · TRUNG CẢNH: qua được, ngã ngồi, cười trừ. \"Set nặng nhất xong rồi!\""),
    ("08", "tree", "shelter", "tired", [], (-16, 8, 3.4, 40, 0, 0.5), "Trạm mưa · Vì thế… · TRUNG CẢNH: trú dưới lá, tai cụp. \"Nghỉ thêm 15 giây cũng được\""),
    ("09", "ledge", "lookup", "content", [], (168, 6, 3.6, 30, 0, 0.9), "Sát đỉnh · Cho tới cuối cùng… · TOÀN CẢNH SAU LƯNG, hoàng hôn: Koa nhỏ, đỉnh rất gần"),
    ("10", "ledge", "sincere", "warm", [], (4, 2, 2.5, 85, 0, 0.7), "Sát đỉnh · CẬN MẶT (nghiêm túc, ấm): \"Set cuối rồi. Cảm ơn vì đã không bỏ cuộc.\""),
    ("11", "ledge", "standup", "strain", [], (-26, -22, 2.8, 28, 2, 0.55), "Sát đỉnh · MÁY THẤP: đứng dậy giữa gió, \"Lên nào!\""),
    ("12", "top", "flag", "delighted", [], (20, -6, 3.2, 30, 0, 0.75), "Đỉnh · Từ đó về sau… · TOÀN CẢNH NGƯỢC SÁNG: cắm cờ → màn xong buổi"),
]

FLOOR = 0.0
rest_pose()
lo, hi = world_bounds(body_objects())
HKOA = hi.z - lo.z
meta = []
for code, station, pose_key, face, props, camspec, text in BEATS:
    clear_env()   # cảnh cũ không được tính vào "chân chạm sàn" của dáng mới
    rest_pose(); clear_props()
    build_face(face)
    for o in g["FACE_OBJS"]: parent_bone(o, "head")
    for kind, side in props: prop(kind, side)
    if pose_key == "shelter": own_prop("leaf")
    if pose_key == "flag": own_prop("flag")
    pose = POSES[pose_key]
    apply_pose(pose); ground(pose, 0.0)
    if station == "bridge":
        # đứng trên cầu: hạ cả hình xuống mặt ván
        for o in [g["rig"]]:
            o.location.z = -0.18 * HKOA
        bpy.context.view_layer.update()
    build_env(station, HKOA)
    FLOOR = -0.18 * HKOA if station == "bridge" else 0.0
    yaw, elev, dist, lens, roll, tz = camspec
    target = Vector((0, 0, tz * HKOA))
    shot(os.path.join(OUT, f"beat-{code}.png"), target, yaw, elev, dist * HKOA, lens, roll)
    g["rig"].location = (0, 0, 0)
    meta.append({"code": code, "station": station, "pose": pose_key, "face": face, "text": text})
json.dump(meta, open(os.path.join(OUT, "beats.json"), "w"), ensure_ascii=False, indent=1)
