# Beat board màn nghỉ giữa hiệp "90 giây của Koa" (07/11/2026).
#
# Kiệt: "làm story cho phần nghỉ giữa hiệp mà" — story diễn ra TRONG quãng nghỉ, trong phòng tập, cạnh thanh tạ
# (không phải chuyến phiêu lưu ở nơi khác). Mồi – Xung đột – Bước ngoặt – Vỡ ra trong 90 giây.
# Nháp: mẫu 3D Koa của koa_pose.py (đường viền bản vẽ, tay có khuỷu, mặt app / gym), phòng tập khối thô.
#
#   Blender -b --factory-startup --python koa_beatboard_gym.py -- KoaSceneData.swift faces.json nose.json OUT
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
km, sc, cam, aim, rig = g["km"], g["sc"], g["cam"], g["aim"], g["rig"]
arms_, prop, apply_pose, ground, rest_pose = g["arms_"], g["prop"], g["apply_pose"], g["ground"], g["rest_pose"]
build_face, parent_bone, cyl, ball, mat_obj = g["build_face"], g["parent_bone"], g["cyl"], g["ball"], g["mat_obj"]
body_objects, world_bounds, clear_props, PROP_OBJS = g["body_objects"], g["world_bounds"], g["clear_props"], g["PROP_OBJS"]

W, H = 720, 936
sc.render.resolution_x, sc.render.resolution_y = W, H
shd = sc.display.shading

SIT = {"hips": {"rot": (-8, 0, 0), "loc": (0, 0.06, -0.40)}, "chest": (10, 0, 0),
       "foot.L": {"rot": (-70, 0, 0), "loc": (-0.04, -0.55, 0.0)}, "foot.R": {"rot": (-70, 0, 0), "loc": (0.04, -0.55, 0.0)}}
POSES = {
    # đặt tạ lên giá: người hơi cúi, tay cầm tạ đưa ra trước
    "rack": {"hips": (12, 0, 0), "chest": (8, 0, 0), "head": (-6, 0, 0), **arms_(r=(18, 72), rf=(14, 66), l=(14, 20))},
    # nằm vật ngửa trên ghế, tay buông hai bên
    "sprawl": {"root": {"rot": (-86, 0, 0)}, "head": (-10, 0, 14), **arms_(l=(70, -30), lf=(60, -50), r=(70, -30), rf=(60, -50)),
               "foot.L": {"rot": (20, 0, 0)}, "foot.R": {"rot": (-10, 0, 0)}},
    # ngồi bệt dựa ghế, hai tay đặt trên gối, thở
    "breathe": {**SIT, "head": (8, 0, 0), **arms_(l=(24, 30), lf=(10, 72), r=(24, 30), rf=(10, 72))},
    "drink": {**SIT, "head": (-20, 0, 0), **arms_(r=(-10, 82), rf=(-28, 124), l=(26, 10))},
    # ôm khăn như gối, đầu ngả
    "doze": {**SIT, "head": (16, 22, 0), "chest": (16, 0, 0), **arms_(l=(18, 64), lf=(40, 112), r=(18, 64), rf=(40, 112))},
    # giật mình ngồi thẳng
    "alert": {**SIT, "chest": (-6, 0, 0), "head": (-14, 0, 0), **arms_(l=(48, 18), lf=(60, 30), r=(48, 18), rf=(60, 30))},
    # xoa phấn: hai tay chụm trước ngực
    "chalk": {"head": (6, 0, 0), **arms_(l=(16, 58), lf=(44, 96), r=(16, 58), rf=(44, 96))},
    # nhìn thanh tạ (máy qua vai)
    "eye": {"head": (-4, 0, 0), **arms_(l=(10, 0), r=(10, 0))},
    # cúi nắm tạ dưới sàn
    "grip": {"hips": {"rot": (36, 0, 0), "loc": (0, 0.14, -0.30)}, "head": (-34, 0, 0),
             **arms_(l=(10, 30), lf=(8, 20), r=(10, 30), rf=(8, 20))},
    # nhấc tạ, quay sang bạn
    "lift": {"chest": (-6, 0, 0), "head": (6, 0, 14), **arms_(r=(4, 12), rf=(6, 150), l=(30, 20), lf=(40, 30))},
}

# ---------------------------------------------------------------- phòng tập
ENV = []
def env(o, part, col):
    mat_obj(o, part, col); ENV.append(o); return o
def box(part, col, loc, scale, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=[math.radians(a) for a in rot]); o = bpy.context.object
    o.scale = scale; return env(o, part, col)
def clear_env():
    for o in ENV: bpy.data.objects.remove(o, do_unlink=True)
    ENV.clear()

# ánh sáng theo nhịp: mệt (tối, lạnh) → tỉnh (sáng, ấm)
MOOD = {"done": "#E9E1D3", "tired": "#B9B7C2", "warm": "#EFE3CC", "spark": "#F6E7C4", "go": "#FFE3B0"}
def build_gym(u, mood, bench=True, rack=True, floor_dumbbell=False):
    clear_env()
    wall = MOOD[mood]
    shd.background_color = km.lin(wall)
    box("floor", "#C49A6C", (0, CY + 1.5 * u, -0.02 * u), (8 * u, CY + 6 * u, 0.02 * u))
    box("wall", wall, (0, CY + 4.0 * u, 2.0 * u), (8 * u, CY + 0.05 * u, 3 * u))
    box("mirror", "#CFDCE4", (0, CY + 3.94 * u, 1.3 * u), (3.2 * u, CY + 0.02 * u, 0.8 * u))
    box("stripe", "#E8842A", (0, CY + 3.93 * u, 0.25 * u), (8 * u, CY + 0.02 * u, 0.05 * u))
    # đồng hồ treo tường: mặt tròn + kim
    env(cyl("clock", "#FFFFFF", 0.32 * u, 0.05 * u, (2.3 * u, CY + 3.9 * u, 2.4 * u), (90, 0, 0)), "clock", "#FFFFFF")
    env(cyl("clock_rim", "#3A4654", 0.35 * u, 0.04 * u, (2.3 * u, CY + 3.92 * u, 2.4 * u), (90, 0, 0)), "clock_rim", "#3A4654")
    box("hand", "#20242A", (2.3 * u, CY + 3.86 * u, 2.5 * u), (0.012 * u, CY + 0.01 * u, 0.12 * u))
    if bench == "long":   # ghế dọc (Koa nằm vật trên đó)
        box("bench_pad", "#3A4654", (0, CY + 0.75 * u, 0.36 * u), (0.32 * u, 0.9 * u, 0.06 * u))
        for y in (-0.05, 1.55):
            box("bench_leg", "#8E98A3", (0, CY + y * u, 0.15 * u), (0.05 * u, 0.05 * u, 0.15 * u))
    elif bench:   # ghế ngang sau lưng Koa (tựa lưng khi ngồi)
        box("bench_pad", "#3A4654", (0, CY + 0.75 * u, 0.36 * u), (0.95 * u, 0.28 * u, 0.06 * u))
        for x in (-0.8, 0.8):
            box("bench_leg", "#8E98A3", (x * u, CY + 0.75 * u, 0.15 * u), (0.05 * u, 0.05 * u, 0.15 * u))
    if rack:    # giá tạ bên phải
        box("rack", "#3A4654", (1.7 * u, CY + 1.0 * u, 0.32 * u), (0.9 * u, CY + 0.25 * u, 0.04 * u))
        box("rack2", "#3A4654", (1.7 * u, CY + 1.0 * u, 0.62 * u), (0.9 * u, CY + 0.25 * u, 0.04 * u))
        for i in range(4):
            for z in (0.4, 0.7):
                x = (1.05 + i * 0.42) * u
                env(cyl("db_bar", "#8E98A3", 0.03 * u, 0.36 * u, (x, CY + 1.0 * u, z * u), (90, 0, 0)), "db_bar", "#8E98A3")
                for dy in (-0.15, 0.15):
                    env(cyl("db_plate", "#20242A", 0.09 * u, 0.06 * u, (x, CY + (1.0 + dy) * u, z * u), (90, 0, 0)), "db_plate", "#20242A")
    if floor_dumbbell:  # tạ đang chờ dưới sàn trước mặt Koa
        env(cyl("fdb_bar", "#8E98A3", 0.03 * u, 0.36 * u, (0.25 * u, CY + -0.45 * u, 0.09 * u), (90, 0, 0)), "fdb_bar", "#8E98A3")
        for dy in (-0.15, 0.15):
            env(cyl("fdb_plate", "#E8842A", 0.09 * u, 0.06 * u, (0.25 * u, CY + (-0.45 + dy) * u, 0.09 * u), (90, 0, 0)), "fdb_plate", "#E8842A")
    # bình nước và hũ phấn trên sàn
    env(cyl("bottle_floor", "#7CC6EE", 0.06 * u, 0.26 * u, (-0.75 * u, CY + 0.2 * u, 0.13 * u)), "bottle_floor", "#7CC6EE")
    env(cyl("chalk_bowl", "#E9E4DA", 0.14 * u, 0.1 * u, (-1.05 * u, CY + 0.6 * u, 0.05 * u)), "chalk_bowl", "#E9E4DA")

def extra(kind, u):
    """Đạo cụ / hiệu ứng riêng của khung."""
    h = g["hand_pos"]("R")
    if kind == "towel":
        bpy.ops.mesh.primitive_cube_add(location=(0, CY - 0.5 * u, 0.36 * u)); o = bpy.context.object
        o.scale = (0.2 * u, 0.08 * u, 0.13 * u); env(o, "towel", "#F4F1EA")
    if kind == "chalk":
        for i, (dx, dz, r) in enumerate(((-0.1, 0.12, 0.09), (0.1, 0.18, 0.07), (0.0, 0.3, 0.06), (0.16, 0.36, 0.05), (-0.14, 0.4, 0.04))):
            env(ball("chalk_puff", "#FFFFFF", r * u, (dx * u, CY + -0.55 * u, (0.95 + dz) * u)), "chalk_puff", "#FFFFFF")
    if kind == "zzz":
        for i in range(3):
            box("z", "#6E7A8A", ((0.5 + 0.18 * i) * u, CY - 0.2 * u, (1.25 + 0.2 * i) * u), ((0.05 + 0.02 * i) * u, 0.01 * u, 0.012 * u), (0, 20, 0))
    if kind == "card":   # thẻ "+2,5 kg so với lần trước" sáng lên trên đồng hồ treo tường
        box("card", "#E8842A", (2.3 * u, CY + 3.8 * u, 1.75 * u), (0.55 * u, CY + 0.02 * u, 0.16 * u))
    if kind == "sweat":
        for dx, dz in ((0.42, 1.05), (-0.4, 1.0)):
            env(ball("sweat", "#9ED8FF", 0.05 * u, (dx * u, CY + -0.3 * u, dz * u), (0.8, 0.8, 1.3)), "sweat", "#9ED8FF")

def shot(path, target, yaw, elev, dist, lens=50, roll=0.0):
    cam.data.lens = lens; cam.data.sensor_fit = "VERTICAL"
    y, e = math.radians(yaw), math.radians(elev)
    aim.location = target
    cam.location = target + dist * Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
    cam.location.z = max(cam.location.z, 0.06 * HKOA)
    cam.data.clip_start, cam.data.clip_end = 0.05, 400
    bpy.context.view_layer.update()
    tr = cam.constraints[0]
    if roll:
        mw = cam.matrix_world.copy(); tr.influence = 0
        cam.matrix_world = mw @ Matrix.Rotation(math.radians(roll), 4, "Z")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    tr.influence = 1

# (mã, nhịp, dáng, mặt, đạo cụ tay, phụ, ánh sáng, cảnh: (ghế, giá, tạ sàn), máy: (yaw, elev, xa ×H, tiêu cự, nghiêng, tâm ×H),
#  nâng Koa ×H, chữ)
BEATS = [
    ("01", "MỒI", "rack", "puff", [("dumbbell", "R")], [], "done", (True, True, False), (-22, 8, 4.2, 35, 0, 0.5), 0,
     "Set vừa xong · TOÀN CẢNH: Koa đặt tạ lên giá, \"cạch\", thở phù"),
    ("02", "MỒI", "sprawl", "pant", [], ["sweat"], "tired", ("long", True, False), (8, 62, 4.2, 35, 6, 0.3), 0.42,
     "· GÓC TỪ TRÊN XUỐNG (hài): nằm vật ra ghế, lưỡi thè, mồ hôi"),
    ("03", "XUNG ĐỘT", "breathe", "tired", [], [], "tired", (True, True, False), (16, 6, 3.0, 45, 0, 0.42), 0,
     "Hồi sức · TRUNG CẢNH, máy đẩy chậm: ngồi dựa ghế thở, \"hít vào… thở ra…\""),
    ("04", "XUNG ĐỘT", "drink", "warm", [("bottle", "R")], [], "warm", (True, True, False), (10, 4, 3.0, 70, 0, 0.5), 0,
     "· CẬN: tu một ngụm nước, \"Ahh…\""),
    ("05", "XUNG ĐỘT", "doze", "sleepy", [], ["towel", "zzz"], "tired", (True, True, False), (-14, 10, 2.8, 50, -4, 0.45), 0,
     "Cám dỗ · TRUNG CẢNH, nghiêng nhẹ: ôm khăn như gối, \"Năm phút nữa thôi…\""),
    ("06", "BƯỚC NGOẶT", "alert", "surprised", [], ["card"], "spark", (True, True, False), (6, 4, 2.8, 85, 0, 0.55), 0,
     "· CẬN MẶT: đồng hồ \"tích\", thẻ \"+2,5 kg so với lần trước\" sáng lên, Koa mở choàng mắt"),
    ("07", "VỠ RA", "chalk", "confident", [], ["chalk"], "warm", (False, True, True), (24, -12, 3.0, 30, 0, 0.55), 0,
     "· MÁY THẤP: đứng dậy xoa phấn, bụi phấn bay"),
    ("08", "VỠ RA", "eye", "focus", [], [], "warm", (False, True, True), (158, 12, 2.6, 35, 0, 0.55), 0,
     "· QUA VAI KOA: nhìn tạ dưới sàn, \"Đẩy bằng gót. Lưng thẳng.\""),
    ("09", "ĐẾM NGƯỢC", "grip", "grit", [], [], "go", (False, True, True), (-28, -16, 2.6, 28, 3, 0.4), 0,
     "3 giây cuối · MÁY THẤP ANH HÙNG: cúi nắm tạ, 3… 2… 1…"),
    ("10", "HẾT GIỜ", "lift", "grin", [("dumbbell", "R")], [], "go", (False, True, False), (12, 6, 3.4, 40, 0, 0.55), 0,
     "0 s · TOÀN CẢNH: nhấc tạ, quay sang bạn \"Lượt mình!\" → vào set tiếp"),
]

rest_pose()
lo, hi = world_bounds(body_objects())
HKOA = hi.z - lo.z
tlo, thi = world_bounds([g["torso"]])
CY = (tlo.y + thi.y) / 2   # mọi đồ vật đặt theo chỗ thân Koa đứng thật
print("DBG CY", CY, "torso", tuple(tlo), tuple(thi), "H", HKOA)
meta = []
for code, act, pose_key, face, props, extras, mood, (bench, rack, fdb), camspec, lift, text in BEATS:
    clear_env(); rest_pose(); clear_props()
    build_face(face)
    for o in g["FACE_OBJS"]: parent_bone(o, "head")
    for kind, side in props: prop(kind, side)
    pose = POSES[pose_key]
    apply_pose(pose); ground(pose, 0.0)
    rig.location = (0, 0.75 * HKOA if pose_key == "sprawl" else 0, lift * HKOA)
    bpy.context.view_layer.update()
    build_gym(HKOA, mood, bench, rack, fdb)
    for k in extras: extra(k, HKOA)
    yaw, elev, dist, lens, roll, tz = camspec
    shot(os.path.join(OUT, f"gym-{code}.png"), Vector((0, CY + (0.75 * HKOA if pose_key == "sprawl" else 0), tz * HKOA)), yaw, elev, dist * HKOA, lens, roll)
    rig.location = (0, 0, 0)
    meta.append({"code": code, "act": act, "text": text})
json.dump(meta, open(os.path.join(OUT, "beats.json"), "w"), ensure_ascii=False, indent=1)
