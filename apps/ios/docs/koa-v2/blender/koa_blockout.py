# Koa 3D blockout, built from KoaSceneData coordinates (240 x 300 canvas).
# X = (x-120)/100, Z = (294-y)/100, front faces -Y. Head group has +11 y offset.
import bpy, math, sys, os
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1]
MODE = sys.argv[sys.argv.index("--") + 2]  # views | turntable

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def hexcol(h, a=1.0):
    h = h.lstrip("#")
    c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return [(x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [a]

mats = {}
def mat(h):
    if h in mats: return mats[h]
    m = bpy.data.materials.new(h)
    m.diffuse_color = hexcol(h)
    mats[h] = m
    return m

def P(x, y):  # svg -> blender (X, Z)
    return (x - 120) / 100, (294 - y) / 100

def blob(name, x, y, rx, rz, ry, depth, col, rot=(0, 0, 0), seg=48):
    X, Z = P(x, y)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, location=(X, depth, Z))
    o = bpy.context.object
    o.name = name
    o.scale = (rx, ry, rz)
    o.rotation_euler = [math.radians(a) for a in rot]
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat(col))
    return o

def capsule(name, a, b, r, depth, col):
    (ax, az), (bx, bz) = P(*a), P(*b)
    va, vb = Vector((ax, depth, az)), Vector((bx, depth, bz))
    d = vb - va
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, location=(va + vb) / 2)
    c = bpy.context.object
    c.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    c.data.materials.append(mat(col))
    bpy.ops.object.shade_smooth()
    for v in (va, vb):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=v, segments=32, ring_count=16)
        s = bpy.context.object; s.data.materials.append(mat(col)); bpy.ops.object.shade_smooth()
    c.name = name

FUR, FUR2, LIGHT, DARK, NOSE = "#BFC7CF", "#B7BFC8", "#D7DDE3", "#20242A", "#3A4654"
H = 11  # head group offset in svg units

# Head: x 40..200, y 34..168 (+11). Slightly deeper than tall would read as a ball; keep it a bit flat front-to-back.
head = blob("head", 120, 101 + H, 0.80, 0.67, 0.66, 0.0, FUR)
for x, y, h in [(124, 30, .16), (114, 34, .12), (132, 36, .11)]:  # top fur tuft
    X, Z = P(x, y + H)
    bpy.ops.mesh.primitive_cone_add(radius1=0.06, depth=h * 1.6, location=(X - 0.0, -0.05, Z + 0.02))
    t = bpy.context.object; t.rotation_euler = (0, math.radians((x - 120) * 2.5), 0)
    t.data.materials.append(mat(FUR)); bpy.ops.object.shade_smooth()

# Ears: outer ~ (16..92, 12..108) around (54,58); flat discs set slightly behind the face plane, angled outwards.
for side in (-1, 1):
    x = 120 + side * -66 if False else 120 + side * 66
    e = blob(f"ear_{side}", x, 58 + H, 0.39, 0.47, 0.20, 0.16, FUR, rot=(0, 0, side * -18))
    i = blob(f"ear_in_{side}", x + side * -1, 53 + H, 0.23, 0.26, 0.05, 0.02, LIGHT, rot=(0, 0, side * -18))
    i.location.y = e.location.y - 0.10

# Face features placed on the head ellipsoid surface.
def on_head(x, y, extra=0.0):
    X, Z = P(x, y + H)
    hx, hz, hy = 0.80, 0.67, 0.66
    cz = P(120, 101 + H)[1]
    k = 1 - (X / hx) ** 2 - ((Z - cz) / hz) ** 2
    return -hy * math.sqrt(max(k, 0.01)) - extra

for side in (-1, 1):
    ex = 120 + side * 38
    blob(f"eye_{side}", ex, 96, 0.18, 0.235, 0.05, on_head(ex, 96, -0.035), "#FFFFFF").location.z = P(0, 96 + H)[1]
    px = 120 + side * 33
    p = blob(f"pupil_{side}", px, 99 + H, 0.12, 0.16, 0.035, on_head(px, 99, 0.0), DARK)
    hx = px - 3.5 * 1 if side < 0 else px - 3.5
    blob(f"hi_{side}", hx, 90 + H, 0.048, 0.048, 0.02, on_head(hx, 90, 0.03), "#FFFFFF")
    bx = 120 + side * 54
    blob(f"blush_{side}", bx, 121 + H, 0.08, 0.06, 0.02, on_head(bx, 121, 0.0), "#F3B5B5")
    # Brow arc
    blob(f"brow_{side}", 120 + side * 38.5, 61 + H, 0.075, 0.022, 0.02, on_head(120 + side * 38, 61, 0.0), DARK, rot=(0, side * 20, 0))

blob("nose", 120, 105 + H, 0.14, 0.21, 0.09, on_head(120, 105, 0.03), NOSE)
blob("mouth", 120, 136 + H, 0.13, 0.05, 0.04, on_head(120, 136, -0.01), DARK)
blob("tongue", 120, 139 + H, 0.07, 0.035, 0.03, on_head(120, 139, 0.02), "#E8657B")

# Body: torso x 63..177, y 140..279; belly lighter oval.
torso = blob("torso", 120, 210, 0.57, 0.70, 0.50, 0.05, FUR)
blob("belly", 120, 229, 0.35, 0.40, 0.12, -0.38, LIGHT)
for side in (-1, 1):
    capsule(f"arm_{side}", (120 + side * 42, 178), (120 + side * 75, 236), 0.115, -0.02, FUR)
    blob(f"foot_{side}", 120 + side * 26, 274, 0.23, 0.20, 0.28, -0.14, FUR)

# Ground shadow
bpy.ops.mesh.primitive_cylinder_add(radius=0.64, depth=0.005, location=(0, -0.05, 0.0))
sh = bpy.context.object; sh.scale = (1, 0.55, 1); sh.data.materials.append(mat("#AEB6BF"))

# Render setup: Workbench, flat-ish studio light, outline, ortho camera.
sc.render.engine = "BLENDER_WORKBENCH"
sh_ = sc.display.shading
sh_.light = os.environ.get("KOA_LIGHT", "STUDIO"); sh_.color_type = "MATERIAL"
sh_.show_object_outline = True; sh_.object_outline_color = hexcol("#8E98A3")[:3]
sh_.show_cavity = True; sh_.cavity_type = "WORLD"
sh_.background_type = "VIEWPORT"; sh_.background_color = hexcol("#F7F5F0")[:3]
sc.render.resolution_x, sc.render.resolution_y = 480, 600
sc.render.film_transparent = False
sc.view_settings.view_transform = "Standard"

bpy.ops.object.empty_add(location=(0, 0, 1.45)); pivot = bpy.context.object
bpy.ops.object.camera_add(location=(0, -10, 0), rotation=(math.radians(90), 0, 0))
cam = bpy.context.object; cam.data.type = "ORTHO"; cam.data.ortho_scale = 3.25
cam.parent = pivot; sc.camera = cam

os.makedirs(OUT, exist_ok=True)
if MODE == "views":
    names = ["0-front", "45-34-right", "90-side-right", "135-34-back-right", "180-back", "225-34-back-left", "270-side-left", "315-34-left"]
    for i, n in enumerate(names):
        pivot.rotation_euler = (0, 0, math.radians(i * 45))
        sc.render.filepath = os.path.join(OUT, f"{i}-{n}.png")
        bpy.ops.render.render(write_still=True)
else:
    for f in range(72):
        pivot.rotation_euler = (0, 0, math.radians(f * 5))
        sc.render.filepath = os.path.join(OUT, f"t{f:03d}.png")
        bpy.ops.render.render(write_still=True)
