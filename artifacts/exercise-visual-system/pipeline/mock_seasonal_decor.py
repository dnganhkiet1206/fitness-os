"""Mock for Kiệt (16/11, MODULAR_3D_PLAN.md step 3): seasonal decor packs
placed on anchor points of the existing gym room, rendered from the app's
default camera of an exercise. Nothing here ships: the decision (which packs,
which anchors) comes first, then the packs become their own USDZ files that
the viewer adds by date.

    Blender -b --factory-startup --python pipeline/mock_seasonal_decor.py -- \
        --exercise back-squat --out <folder>

Anchors (derived from the room: the logo sign on the back wall):
* lantern_l / lantern_r: hanging from the ceiling either side of the logo,
* wall_l / wall_r: on the back wall beside the logo,
* floor_l / floor_r: back corners on the floor,
* string: along the top of the back-wall slats.
All decor is modelled here from primitives (no third-party assets)."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "..", "..", "apps", "ios", "ASCND", "Resources", "ExerciseDemos")


def zup(v):
    return Vector((v[0], -v[2], v[1]))


def mat(name, rgb, emit=0.0, rough=0.5, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*rgb, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m


def put(obj, m, coll):
    obj.data.materials.append(m)
    for c in obj.users_collection:
        c.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


def sphere(loc, r, m, coll, scale=(1, 1, 1), seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=loc)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.shade_smooth()
    return put(o, m, coll)


def cyl(loc, r, depth, m, coll, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    return put(bpy.context.object, m, coll)


def cone(loc, r, depth, m, coll):
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=r, radius2=0, depth=depth, location=loc)
    bpy.ops.object.shade_smooth()
    return put(bpy.context.object, m, coll)


def torus(loc, r, t, m, coll, rot):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=t, location=loc, rotation=rot)
    bpy.ops.object.shade_smooth()
    return put(bpy.context.object, m, coll)


def lantern(top, M, coll):
    """Vietnamese red lantern (đèn lồng): cord, gold caps, glowing body, tassel."""
    cyl(top - Vector((0, 0, 0.35)), 0.006, 0.7, M["cord"], coll)
    body = top - Vector((0, 0, 0.95))
    sphere(body, 0.26, M["red_glow"], coll, scale=(1, 1, 0.82))
    for dz in (0.23, -0.23):
        cyl(body + Vector((0, 0, dz)), 0.13, 0.05, M["gold"], coll)
    for k in range(10):  # ribs
        a = 2 * math.pi * k / 10
        torus(body, 0.262, 0.006, M["gold"], coll, rot=(math.pi / 2, 0, a))
    cyl(body - Vector((0, 0, 0.42)), 0.035, 0.32, M["tassel"], coll)


def mai_tree(base, M, coll, height=1.6):
    """Hoa mai (yellow apricot blossom) in a glazed pot."""
    cyl(base + Vector((0, 0, 0.22)), 0.24, 0.44, M["pot"], coll)
    import random
    rnd = random.Random(7)
    tips = []
    for i in range(7):
        a = 2 * math.pi * i / 7 + rnd.uniform(-0.3, 0.3)
        lean = rnd.uniform(0.25, 0.6)
        start = base + Vector((0, 0, 0.44))
        d = Vector((math.cos(a) * lean, math.sin(a) * lean, 1.0)).normalized()
        L = height * rnd.uniform(0.7, 1.0)
        mid = start + d * L * 0.5
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.018, depth=L, location=mid)
        o = bpy.context.object
        o.rotation_mode = "QUATERNION"
        o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
        put(o, M["branch"], coll)
        for t in (0.45, 0.6, 0.75, 0.88, 1.0):
            tips.append(start + d * L * t)
    for p in tips:
        for j in range(5):
            q = p + Vector((rnd.uniform(-0.12, 0.12), rnd.uniform(-0.12, 0.12), rnd.uniform(-0.08, 0.1)))
            sphere(q, rnd.uniform(0.025, 0.04), M["mai"], coll, seg=8)


def xmas_tree(base, M, coll, height=2.2):
    cyl(base + Vector((0, 0, 0.15)), 0.22, 0.3, M["pot"], coll)
    for k, (z, r) in enumerate(((0.55, 0.85), (1.15, 0.65), (1.7, 0.45))):
        cone(base + Vector((0, 0, z + 0.35)), r, 0.9, M["pine"], coll)
    import random
    rnd = random.Random(3)
    for i in range(70):
        z = rnd.uniform(0.5, height - 0.2)
        r = 0.85 * (1 - (z - 0.4) / (height - 0.2)) + 0.05
        a = rnd.uniform(0, 2 * math.pi)
        sphere(base + Vector((math.cos(a) * r, math.sin(a) * r, z)), 0.03,
               M["bulb_warm"] if i % 3 else M["bulb_red"], coll, seg=8)
    sphere(base + Vector((0, 0, height + 0.05)), 0.09, M["gold_glow"], coll, seg=12)


def wreath(center, normal, M, coll):
    rot = Vector((0, 0, 1)).rotation_difference(normal).to_euler()
    torus(center, 0.32, 0.08, M["pine"], coll, rot=rot)
    import random
    rnd = random.Random(5)
    for i in range(14):
        a = 2 * math.pi * i / 14
        side = normal.cross(Vector((0, 0, 1))).normalized()
        p = center + (side * math.cos(a) + Vector((0, 0, 1)) * math.sin(a)) * 0.32 + normal * 0.07
        sphere(p, 0.03, M["bulb_red"] if i % 2 else M["gold_glow"], coll, seg=8)
    sphere(center - Vector((0, 0, 0.3)) + normal * 0.08, 0.07, M["red"], coll, scale=(1.6, 1, 1), seg=12)


def string_lights(a, b, M, coll, n=28, sag=0.25):
    for i in range(n + 1):
        t = i / n
        p = a.lerp(b, t) - Vector((0, 0, sag * 4 * t * (1 - t)))
        sphere(p, 0.025, (M["bulb_warm"], M["bulb_red"], M["bulb_green"])[i % 3], coll, seg=8)


def banner(center, normal, width, M, coll):
    """Red and gold Tết banner (no text: the copy is a later decision)."""
    side = normal.cross(Vector((0, 0, 1))).normalized()
    bpy.ops.mesh.primitive_plane_add(size=1, location=center + normal * 0.03)
    o = bpy.context.object
    o.scale = (width, 0.5, 1)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(normal) @ Vector((1, 0, 0)).rotation_difference(
        (Vector((0, 0, 1)).rotation_difference(normal).inverted() @ side))
    put(o, M["red"], coll)
    for dz in (0.27, -0.27):
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.02, depth=width * 1.05,
                                            location=center + normal * 0.05 + Vector((0, 0, dz)))
        g = bpy.context.object
        g.rotation_mode = "QUATERNION"
        g.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(side)
        put(g, M["gold"], coll)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--exercise", default="back-squat")
    ap.add_argument("--out", required=True)
    ap.add_argument("--look", default="dark")
    ap.add_argument("--samples", type=int, default=64)
    args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:])
    os.makedirs(args.out, exist_ok=True)

    sys.path.insert(0, ROOT)
    from evs import config
    ex = config.exercise_config(args.exercise)
    report = json.load(open(os.path.join(ROOT, args.exercise, "usdz", "usdz_report.json")))
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, args.exercise, ex["animation_file"]))
    scene = bpy.context.scene
    for o in list(scene.objects):  # studio floor / backdrop of the exercise scene
        if o.type in ("LIGHT", "CAMERA") or o.name.startswith(("EVS_Floor", "Backdrop", "EVS_Backdrop")):
            o.hide_render = True
    before = set(bpy.data.objects)
    bpy.ops.wm.usd_import(filepath=os.path.join(APP, f"gym_room_{args.look}.usdz"))
    room = [o for o in bpy.data.objects if o not in before]
    # Baked room: show it unlit, as the app does.
    for o in room:
        for slot in getattr(o, "material_slots", []):
            m = slot.material
            if not m or not m.use_nodes:
                continue
            nt = m.node_tree
            tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None)
            out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
            em = nt.nodes.new("ShaderNodeEmission")
            if tex:
                nt.links.new(tex.outputs["Color"], em.inputs["Color"])
            nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    # USD import drops the object names: the logo sign is the 1.3 m square
    # plane on the back wall at 2.2 m (build_gym_room.py).
    logo = next(o for o in room if o.type == "MESH" and abs(o.dimensions.x - 1.3) < 0.05
                and o.dimensions.z < 0.01 and abs(o.matrix_world.translation.z - 2.2) < 0.1)
    logo_p = logo.matrix_world.translation.copy()
    # The app draws the logo with its alpha (BrandMark); the imported plane
    # lost it, so mix in a transparent shader by the texture alpha.
    for slot in logo.material_slots:
        nt = slot.material.node_tree
        tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None)
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        if tex:
            mix = nt.nodes.new("ShaderNodeMixShader")
            tr = nt.nodes.new("ShaderNodeBsdfTransparent")
            em = out.inputs["Surface"].links[0].from_node
            nt.links.new(tex.outputs["Alpha"], mix.inputs["Fac"])
            nt.links.new(tr.outputs[0], mix.inputs[1])
            nt.links.new(em.outputs[0], mix.inputs[2])
            nt.links.new(mix.outputs[0], out.inputs["Surface"])
    cam_p, target = zup(report["default_camera"]["position_m"]), zup(report["default_camera"]["target_m"])
    view = Vector((logo_p.x - target.x, logo_p.y - target.y, 0)).normalized()
    side = view.cross(Vector((0, 0, 1))).normalized()
    wall_in = -view
    anchors = {
        "lantern_l": logo_p + side * 1.5 + Vector((0, 0, 5.0 - logo_p.z)) - view * 0.6,
        "lantern_r": logo_p - side * 1.5 + Vector((0, 0, 5.0 - logo_p.z)) - view * 0.6,
        "wall_l": logo_p + side * 1.6 - view * 0.06,
        "wall_r": logo_p - side * 1.6 - view * 0.06,
        "floor_l": Vector((logo_p.x, logo_p.y, 0)) + side * 3.2 - view * 0.9,
        "floor_r": Vector((logo_p.x, logo_p.y, 0)) - side * 3.2 - view * 0.9,
        "string_a": logo_p + side * 5.4 + Vector((0, 0, 3.05 - logo_p.z)) - view * 0.15,
        "string_b": logo_p - side * 5.4 + Vector((0, 0, 3.05 - logo_p.z)) - view * 0.15,
    }
    M = {
        "red_glow": mat("RedGlow", (0.85, 0.05, 0.04), emit=2.5, rough=0.6),
        "red": mat("Red", (0.7, 0.04, 0.04), rough=0.6),
        "gold": mat("Gold", (0.9, 0.65, 0.2), rough=0.3, metal=1.0),
        "gold_glow": mat("GoldGlow", (1.0, 0.75, 0.25), emit=4.0),
        "tassel": mat("Tassel", (0.75, 0.05, 0.05), rough=0.9),
        "cord": mat("Cord", (0.1, 0.05, 0.03), rough=0.9),
        "pot": mat("Pot", (0.08, 0.12, 0.28), rough=0.25),
        "branch": mat("Branch", (0.12, 0.07, 0.04), rough=0.9),
        "mai": mat("Mai", (1.0, 0.78, 0.08), emit=0.6, rough=0.6),
        "pine": mat("Pine", (0.03, 0.18, 0.07), rough=0.8),
        "bulb_warm": mat("BulbWarm", (1.0, 0.7, 0.3), emit=6.0),
        "bulb_red": mat("BulbRed", (1.0, 0.1, 0.08), emit=5.0),
        "bulb_green": mat("BulbGreen", (0.2, 1.0, 0.3), emit=4.0),
    }
    packs = {}
    for name in ("tet", "noel"):
        c = bpy.data.collections.new(f"Decor_{name}")
        scene.collection.children.link(c)
        packs[name] = c
    lantern(anchors["lantern_l"], M, packs["tet"])
    lantern(anchors["lantern_r"], M, packs["tet"])
    mai_tree(anchors["floor_l"], M, packs["tet"])
    mai_tree(anchors["floor_r"], M, packs["tet"])
    banner(logo_p - Vector((0, 0, 1.0)) - view * 0.05, wall_in, 2.2, M, packs["tet"])
    xmas_tree(anchors["floor_l"] - side * 0.9, M, packs["noel"])  # inside the wide frame
    wreath(anchors["wall_l"], wall_in, M, packs["noel"])
    wreath(anchors["wall_r"], wall_in, M, packs["noel"])
    string_lights(anchors["string_a"], anchors["string_b"], M, packs["noel"])

    cam_data = bpy.data.cameras.new("MockCam")
    cam = bpy.data.objects.new("MockCam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = cam_p
    cam.rotation_euler = (target - cam_p).to_track_quat("-Z", "Y").to_euler()
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle_y = math.radians(report["default_camera"]["vertical_fov_deg"])
    cam_data.clip_end = 40.0
    scene.camera = cam
    for (k, l) in (("Key", (2.5, -2.0, 3.5)), ("Fill", (-2.5, -1.0, 2.5))):
        ld = bpy.data.lights.new(k, "AREA")
        ld.energy, ld.size = (350, 120)[k == "Fill"], 2.0
        lo = bpy.data.objects.new(k, ld)
        scene.collection.objects.link(lo)
        lo.location = target + Vector(l)
        lo.rotation_euler = (target - lo.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys() else "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 720, 1280
    scene.frame_set(scene.frame_start + 20)
    # Two shots: the app's default view, and pulled back (pinch out / orbit)
    # where the decor on the back wall shows.
    wide = target + (cam_p - target) * 1.35 + Vector((0, 0, 0.2))  # stays inside the 12 m room
    for shot, loc in (("default", cam_p), ("wide", wide)):
        cam.location = loc
        cam_data.angle_y = math.radians(report["default_camera"]["vertical_fov_deg"] * (1.45 if shot == "wide" else 1.0))
        cam.rotation_euler = (target + Vector((0, 0, 0.6 if shot == "wide" else 0)) - loc).to_track_quat("-Z", "Y").to_euler()
        for name in ("none", "tet", "noel"):
            for k, c in packs.items():
                c.hide_render = k != name
            scene.render.filepath = os.path.join(args.out, f"decor_{shot}_{name}.png")
            bpy.ops.render.render(write_still=True)
            print(f"[evs] mock decor {shot} {name}: {scene.render.filepath}")


if __name__ == "__main__":
    main()
