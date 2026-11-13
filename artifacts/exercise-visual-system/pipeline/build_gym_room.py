"""A real 3D gym room around an exercise, with baked lighting, for the
in-app viewer where the camera orbits a fixed model.

    Blender -b --factory-startup --python pipeline/build_gym_room.py -- \
        --exercise bench-press --textures <Poly Haven maps> \
        --logo-light <png> --logo-dark <png> --out <folder> [--looks light,dark]

Opens the exercise's .blend (so the bench and the lifter cast real contact
shadows on the floor), builds a closed room around them (12 m square, 5 m
high: wood slats, LED coves, dumbbell racks, the app logo as a sign on the
wall that faces the default camera), bakes all lighting into textures with
Cycles, and exports ONLY the room as USDZ (Y-up, metres, same settings as the
exercise USDZ, so the two line up). The app shows the baked colour unlit:
the room looks like the render on a phone without any lighting cost.

Textures: Poly Haven, CC0 1.0. The logo comes from the app's own asset."""

from __future__ import annotations

import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import render_backdrop as rb  # noqa: E402
from evs import bl_util, config  # noqa: E402

HALF = 6.0      # half the room width, metres
HEIGHT = 5.0    # ceiling height
ROOM = "GYM_ROOM"


def link(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


def cube(name, size, location, mat, yaw, coll, bevel=True):
    obj = rb.box(name, size, location, mat, rotation=(0, 0, yaw))
    if not bevel:
        for m in list(obj.modifiers):
            obj.modifiers.remove(m)
    link(obj, coll)
    return obj


def wall_slats(prefix, center, along, normal, length, gap_half, mat, yaw, coll):
    n = int(length / 0.13)
    for i in range(-n // 2, n // 2 + 1):
        if abs(i * 0.13) < gap_half:
            continue
        p = center + along * (i * 0.13) + normal * 0.06 + Vector((0, 0, 1.6))
        cube(f"{prefix}Slat{i}", (0.05, 0.06, 3.0), p, mat, yaw, coll)


def rack(prefix, base, side, view, yaw, steel, chrome, coll):
    cube(f"{prefix}Shelf1", (0.5, 1.6, 0.05), base + Vector((0, 0, 0.45)), steel, yaw, coll)
    cube(f"{prefix}Shelf2", (0.5, 1.6, 0.05), base + Vector((0, 0, 0.85)) + view * 0.08, steel, yaw, coll)
    for leg in (-0.75, 0.75):
        cube(f"{prefix}Leg{leg}", (0.05, 0.05, 0.9), base + side * leg + Vector((0, 0, 0.45)), steel, yaw, coll)
    for row, z, size in ((0, 0.55, 0.11), (1, 0.95, 0.09)):
        for j in range(5):
            c = base + side * (-0.6 + j * 0.3) + view * (0.08 * row) + Vector((0, 0, z))
            for end in (-0.13, 0.13):
                bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=size - 0.01 * j, depth=0.07, location=c + view * end,
                                                    rotation=(math.pi / 2, 0, yaw - math.pi / 2))
                bpy.context.object.data.materials.append(steel)
                link(bpy.context.object, coll)
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.017, depth=0.22, location=c,
                                                rotation=(math.pi / 2, 0, yaw - math.pi / 2))
            bpy.context.object.data.materials.append(chrome)
            link(bpy.context.object, coll)


def plain(name, rgb, rough=0.5, metal=0.0):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def build_room(look, args, center: Vector, view: Vector, coll) -> dict:
    side = Vector((-view.y, view.x, 0))
    yaw = math.atan2(view.y, view.x)
    groups = {"floor": [], "ceiling": [], "walls": [], "slats": [], "racks": [], "leds": []}

    floor_mat = rb.pbr("Floor", args.textures, "rubber_tiles", 2.4, look["floor_tint"], look["floor_value"], 0.55)
    bpy.ops.mesh.primitive_plane_add(size=HALF * 2, location=(center.x, center.y, 0), rotation=(0, 0, yaw))
    floor = bpy.context.object
    floor.name = "Floor"
    floor.data.materials.append(floor_mat)
    link(floor, coll)
    # 1 m mat seams, square to the walls (seams are drawn into the bake).
    bm = bmesh.new()
    bm.from_mesh(floor.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=11, use_grid_fill=True)
    bm.to_mesh(floor.data)
    bm.free()
    groups["floor"].append(floor)
    seam_mat = plain("Seam", (0.02, 0.02, 0.02) if look is rb.LOOKS["dark"] else (0.09, 0.085, 0.08), 0.8)
    for i in range(-int(HALF) + 1, int(HALF)):
        for axis, other in ((view, side), (side, view)):
            s = cube(f"Seam{axis is view}{i}", (0.008, HALF * 2, 0.002), center + axis * i + Vector((0, 0, 0.001)), seam_mat,
                     math.atan2(other.y, other.x), coll, bevel=False)
            groups["floor"].append(s)

    bpy.ops.mesh.primitive_plane_add(size=HALF * 2, location=(center.x, center.y, HEIGHT), rotation=(math.pi, 0, yaw))
    ceil = bpy.context.object
    ceil.name = "Ceiling"
    ceil.data.materials.append(plain("CeilingMat", (0.05, 0.05, 0.055) if look is rb.LOOKS["dark"] else (0.9, 0.88, 0.85), 0.9))
    link(ceil, coll)
    groups["ceiling"].append(ceil)

    wall_mat = rb.pbr("Wall", args.textures, look["wall"], 0.6, look["wall_tint"], look["wall_value"])
    slat_mat = rb.pbr("Slats", args.textures, "plywood", 1.6, look["slat_tint"], look["slat_value"])
    led = rb.emissive("LED", look["led"], look["led_power"])
    steel = plain("Steel", (0.05, 0.05, 0.055), 0.35, 0.6)
    chrome = plain("Chrome", (0.8, 0.8, 0.82), 0.2, 1.0)
    walls = (("Back", view, side, 1.2), ("Front", -view, side, 0.0), ("Left", -side, view, 0.0), ("Right", side, view, 0.0))
    for name, normal_out, along, gap in walls:
        c = center + normal_out * HALF
        wyaw = math.atan2(normal_out.y, normal_out.x)
        w = cube(f"{name}Wall", (0.2, HALF * 2 + 0.4, HEIGHT), c + normal_out * 0.1 + Vector((0, 0, HEIGHT / 2)), wall_mat, wyaw, coll, bevel=False)
        groups["walls"].append(w)
        before = set(coll.objects)
        wall_slats(name, c, along, -normal_out, HALF * 2 - 0.6, gap, slat_mat, wyaw, coll)
        groups["slats"] += [o for o in coll.objects if o not in before]
        for z in (0.04, 3.15):
            groups["leds"].append(cube(f"{name}Led{z}", (0.04, HALF * 2 - 0.4, 0.025), c - normal_out * 0.09 + Vector((0, 0, z)), led, wyaw, coll, bevel=False))
        before = set(coll.objects)
        if name == "Back":
            for sgn in (-1, 1):
                rack(f"{name}{sgn}", c + along * (sgn * 2.4) - normal_out * 0.45, along, -normal_out, wyaw, steel, chrome, coll)
        elif name in ("Left", "Right"):
            for k in (-1, 1):
                rack(f"{name}{k}", c + along * (k * 2.6) - normal_out * 0.45, along, -normal_out, wyaw, steel, chrome, coll)
        groups["racks"] += [o for o in coll.objects if o not in before]

    # Logo sign on the back wall, at the gap in the slats.
    logo_png = args.logo_dark if look is rb.LOOKS["dark"] else args.logo_light
    bpy.ops.mesh.primitive_plane_add(size=1.3, location=center + view * (HALF - 0.05) + Vector((0, 0, 2.2)))
    sign = bpy.context.object
    sign.name = "Logo"
    sign.rotation_euler = (math.pi / 2, 0, yaw - math.pi / 2)
    sign.data.materials.append(rb.logo_material("LogoMat", logo_png, look["logo_emit"], look["logo_strength"], metal=look["logo_strength"] == 0))
    link(sign, coll)
    if look["halo"]:
        halo = bpy.data.lights.new("Halo", "AREA")
        halo.energy = 160 * look["halo"]
        halo.color = look["led"]
        halo.size = 1.8
        h = bpy.data.objects.new("Halo", halo)
        bpy.context.scene.collection.objects.link(h)
        h.location = center + view * (HALF - 0.5) + Vector((0, 0, 2.2))
        bl_util.look_at(h, center + view * HALF + Vector((0, 0, 2.2)))

    # Room lighting for the bake: soft ceiling panels over the training area.
    for i, offset in enumerate((Vector((0, 0, 0)), view * 3.5, -view * 3.5, side * 3.5, -side * 3.5)):
        l = bpy.data.lights.new(f"Panel{i}", "AREA")
        l.shape = "RECTANGLE"
        l.size, l.size_y = 2.4, 1.2
        l.energy = (420 if i == 0 else 220) * (1.0 if look is rb.LOOKS["light"] else 0.35)
        l.color = (1.0, 0.95, 0.88)
        o = bpy.data.objects.new(f"Panel{i}", l)
        bpy.context.scene.collection.objects.link(o)
        o.location = center + offset + Vector((0, 0, HEIGHT - 0.05))
        o.rotation_euler = (0, 0, yaw)
    return groups


def realize(objs, name, coll):
    """Apply modifiers, join into one mesh, unwrap for the lightmap."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.convert(target="MESH")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    uv = obj.data.uv_layers.new(name="Lightmap")
    obj.data.uv_layers.active = uv
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def bake(obj, size, path, samples):
    image = bpy.data.images.new(obj.name + "_bake", size, size)
    for mat in obj.data.materials:
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        uvmap = mat.node_tree.nodes.new("ShaderNodeUVMap")
        uvmap.uv_map = "Lightmap"
        mat.node_tree.links.new(uvmap.outputs["UV"], node.inputs["Vector"])
        mat.node_tree.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_diffuse = True
    scene.render.bake.use_pass_glossy = False
    scene.render.bake.use_pass_transmission = False
    scene.render.bake.use_pass_emit = True
    scene.render.bake.margin = 8
    bpy.ops.object.bake(type="COMBINED")
    image.filepath_raw = path
    image.file_format = "JPEG"
    scene.render.image_settings.quality = 88
    image.save()
    # Export material: just the baked colour (the app draws it unlit).
    out = bpy.data.materials.new(obj.name + "_Baked")
    b = out.node_tree.nodes["Principled BSDF"]
    t = out.node_tree.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(path)
    u = out.node_tree.nodes.new("ShaderNodeUVMap")
    u.uv_map = "Lightmap"
    out.node_tree.links.new(u.outputs["UV"], t.inputs["Vector"])
    out.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 1.0
    obj.data.materials.clear()
    obj.data.materials.append(out)
    # Keep only the lightmap UVs.
    for layer in list(obj.data.uv_layers):
        if layer.name != "Lightmap":
            obj.data.uv_layers.remove(layer)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exercise", default="bench-press")
    parser.add_argument("--textures", required=True)
    parser.add_argument("--logo-light", required=True)
    parser.add_argument("--logo-dark", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--looks", default="light,dark")
    parser.add_argument("--samples", type=int, default=128)
    parser.add_argument("--scale", type=float, default=1.0, help="texture size factor, 0.5 for a quick test")
    args = bl_util.script_args(parser)
    os.makedirs(args.out, exist_ok=True)
    exercise_path = config.exercise_dir(args.exercise)
    exercise = config.exercise_config(args.exercise)
    report = config.load_json(exercise_path / "usdz" / "usdz_report.json")["default_camera"]

    for look_name in args.looks.split(","):
        look = rb.LOOKS[look_name]
        bpy.ops.wm.open_mainfile(filepath=str(exercise_path / exercise["animation_file"]))
        scene = bpy.context.scene
        scene.frame_set(scene.frame_start)
        for o in list(scene.objects):
            if o.type in ("CAMERA", "LIGHT") or o.name.startswith(("EVS_Floor", "EVS_LightRig")) or o.type == "EMPTY" and o.name == "EVS_LightRig":
                bpy.data.objects.remove(o, do_unlink=True)
        scene.render.engine = "CYCLES"
        scene.cycles.device = "GPU"
        prefs = bpy.context.preferences.addons["cycles"].preferences
        try:
            prefs.compute_device_type = "METAL"
            prefs.get_devices()
            for d in prefs.devices:
                d.use = True
        except Exception:
            scene.cycles.device = "CPU"
        world = scene.world or bpy.data.worlds.new("W")
        scene.world = world
        world.node_tree.nodes.clear()
        bg = world.node_tree.nodes.new("ShaderNodeBackground")
        out = world.node_tree.nodes.new("ShaderNodeOutputWorld")
        world.node_tree.links.new(bg.outputs["Background"], out.inputs["Surface"])
        bg.inputs["Color"].default_value = (*look["world"], 1)
        bg.inputs["Strength"].default_value = look["world_strength"] * 0.5

        def zup(v):
            return Vector((v[0], -v[2], v[1]))

        cam, target = zup(report["position_m"]), zup(report["target_m"])
        view = target - cam
        view.z = 0
        view.normalize()
        center = Vector((target.x, target.y, 0))
        coll = bl_util.get_collection(ROOM)
        groups = build_room(look, args, center, view, coll)

        sizes = {"floor": 2048, "walls": 2048, "slats": 1024, "racks": 1024, "ceiling": 512, "leds": 256}
        baked = []
        for key, objs in groups.items():
            if not objs:
                continue
            obj = realize(objs, f"Room_{key}", coll)
            size = max(256, int(sizes[key] * args.scale))
            path = os.path.join(args.out, f"gym_room_{look_name}_{key}.jpg")
            bake(obj, size, path, args.samples)
            baked.append(obj)
            print(f"[evs] baked {look_name} {key} {size}px")

        bpy.ops.object.select_all(action="DESELECT")
        for o in baked + [bpy.data.objects["Logo"]]:
            o.select_set(True)
        usdz = os.path.join(args.out, f"gym_room_{look_name}.usdz")
        bpy.ops.wm.usd_export(
            filepath=usdz, selected_objects_only=True, export_animation=False, export_materials=True,
            generate_preview_surface=True, export_textures_mode="NEW", relative_paths=True,
            convert_orientation=True, export_global_forward_selection="NEGATIVE_Z", export_global_up_selection="Y",
            convert_scene_units="METERS", export_lights=False, export_cameras=False, evaluation_mode="RENDER",
            check_existing=False)
        print(f"[evs] room {look_name}: {usdz} {os.path.getsize(usdz)} bytes")


if __name__ == "__main__":
    main()
