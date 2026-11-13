"""Premium gym backdrop for the in-app 3D viewer, light and dark.

    Blender -b --factory-startup --python pipeline/render_backdrop.py -- \
        --textures <folder with the Poly Haven maps> --logo-light <png> --logo-dark <png> --out <folder>

A small studio corner of a gym: rubber-tile floor, a wall with vertical wood
slats and LED coves, the app logo as a backlit sign. The camera is the 3D
viewer's default camera (bench-press/usdz/usdz_report.json, Y-up there,
converted to Blender's Z-up here), so the model the app draws on top stands on
this floor. Depth of field keeps the room soft behind the model.

Textures: Poly Haven, CC0 1.0 (rubber_tiles, concrete_wall_008,
white_plaster_02, plywood; 1K JPG). The logo is read from the app's own asset,
never baked into the character or the motion."""

from __future__ import annotations

import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from evs import bl_util, config  # noqa: E402

LOOKS = {
    "light": {
        "wall": "white_plaster_02", "wall_tint": (1.0, 0.97, 0.93), "wall_value": 1.0,
        "slat_tint": (1.0, 0.86, 0.68), "slat_value": 1.05,
        "floor_value": 5.0, "floor_tint": (1.0, 0.95, 0.89),
        "led": (1.0, 0.86, 0.66), "led_power": 6.0,
        "logo_emit": (0.12, 0.11, 0.1), "logo_strength": 0.0, "halo": 0.0,
        "sun": 2.2, "world": (0.95, 0.93, 0.9), "world_strength": 0.9, "exposure": 0.25,
    },
    "dark": {
        "wall": "concrete_wall_008", "wall_tint": (0.55, 0.53, 0.5), "wall_value": 0.35,
        "slat_tint": (0.42, 0.3, 0.22), "slat_value": 0.45,
        "floor_value": 1.5, "floor_tint": (1, 1, 1),
        "led": (1.0, 0.62, 0.3), "led_power": 30.0,
        "logo_emit": (1.0, 0.93, 0.85), "logo_strength": 6.0, "halo": 1.0,
        "sun": 0.35, "world": (0.06, 0.06, 0.07), "world_strength": 0.6, "exposure": 0.0,
    },
}


def pbr(name: str, textures: str, asset: str, scale: float, tint, value: float, rough_scale: float = 1.0) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    tree = mat.node_tree
    nodes, links = tree.nodes, tree.links
    bsdf = nodes["Principled BSDF"]
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])

    def tex(kind: str, colorspace: str):
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(os.path.join(textures, f"{asset}_{kind}.jpg"))
        node.image.colorspace_settings.name = colorspace
        node.projection = "BOX"
        node.projection_blend = 0.2
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node

    diff = tex("diff", "sRGB")
    hsv = nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Value"].default_value = value
    links.new(diff.outputs["Color"], hsv.inputs["Color"])
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    [s for s in mix.inputs if s.name == "Factor" and s.enabled][0].default_value = 1.0
    links.new(hsv.outputs["Color"], [s for s in mix.inputs if s.name == "A" and s.enabled][0])
    [s for s in mix.inputs if s.name == "B" and s.enabled][0].default_value = (*tint, 1.0)
    links.new([s for s in mix.outputs if s.name == "Result" and s.enabled][0], bsdf.inputs["Base Color"])
    rough = tex("rough", "Non-Color")
    rmath = nodes.new("ShaderNodeMath")
    rmath.operation = "MULTIPLY"
    rmath.inputs[1].default_value = rough_scale
    links.new(rough.outputs["Color"], rmath.inputs[0])
    links.new(rmath.outputs[0], bsdf.inputs["Roughness"])
    nor = tex("nor", "Non-Color")
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.8
    links.new(nor.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def emissive(name: str, color, strength: float) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Emission Color"].default_value = (*color, 1)
    bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def box(name: str, size, location, mat, rotation=(0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Bevel", "BEVEL")
    bevel.width = min(min(size) * 0.25, 0.01)
    bevel.segments = 2
    return obj


def logo_material(name: str, png: str, color, strength: float, metal: bool) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    tree = mat.node_tree
    nodes, links = tree.nodes, tree.links
    bsdf = nodes["Principled BSDF"]
    img = nodes.new("ShaderNodeTexImage")
    img.image = bpy.data.images.load(png)
    img.extension = "CLIP"
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = 0.9 if metal else 0.0
    bsdf.inputs["Roughness"].default_value = 0.35
    bsdf.inputs["Emission Color"].default_value = (*color, 1)
    bsdf.inputs["Emission Strength"].default_value = strength
    links.new(img.outputs["Alpha"], bsdf.inputs["Alpha"])
    mat.surface_render_method = "DITHERED"
    return mat


def build(look: dict, args) -> None:
    scene = bl_util.reset_scene()
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.use_raytracing = True
    scene.eevee.taa_render_samples = 96
    scene.eevee.use_shadows = True
    scene.render.resolution_x, scene.render.resolution_y = args.width, args.height
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = look["exposure"]
    world = bpy.data.worlds.new("W")
    scene.world = world
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*look["world"], 1)
    bg.inputs["Strength"].default_value = look["world_strength"]

    # Camera: the viewer's default camera, glTF Y-up -> Blender Z-up.
    report = config.load_json(config.exercise_dir("bench-press") / "usdz" / "usdz_report.json")["default_camera"]

    def zup(v):
        return Vector((v[0], -v[2], v[1]))

    cam_pos, target = zup(report["position_m"]), zup(report["target_m"])
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.sensor_fit = "VERTICAL"
    # Same horizontal field of view as the 9:16 preset, full-screen height:
    # the app's 3D view fills the screen with the same rule.
    tan_h = math.tan(math.radians(report["vertical_fov_deg"]) / 2) * report["aspect"]
    cam_data.angle_y = 2 * math.atan(tan_h / (args.width / args.height))
    cam_data.dof.use_dof = True
    cam_data.dof.focus_distance = (target - cam_pos).length + 0.6
    cam_data.dof.aperture_fstop = 2.2
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = cam_pos
    bl_util.look_at(cam, target, up="Y")
    scene.camera = cam

    # The wall faces the camera across the room, square to the view on the ground.
    view = (target - cam_pos)
    view.z = 0
    view.normalize()
    side = Vector((-view.y, view.x, 0))
    wall_center = target + view * args.wall_distance
    wall_center.z = 0
    yaw = math.atan2(view.y, view.x)

    floor_mat = pbr("Floor", args.textures, "rubber_tiles", 2.4, look["floor_tint"], look["floor_value"], 0.55)
    # 1 m x 1 m interlocking gym mats: dark seams multiplied into the colour.
    ft = floor_mat.node_tree
    bsdf = ft.nodes["Principled BSDF"]
    base_link = bsdf.inputs["Base Color"].links[0]
    color_src = base_link.from_socket
    ft.links.remove(base_link)
    coord = ft.nodes.new("ShaderNodeTexCoord")
    brick = ft.nodes.new("ShaderNodeTexBrick")
    brick.offset = 0.0
    brick.squash = 1.0
    brick.inputs["Scale"].default_value = 1.0
    brick.inputs["Mortar Size"].default_value = 0.006
    brick.inputs["Brick Width"].default_value = 1.0
    brick.inputs["Row Height"].default_value = 1.0
    brick.inputs["Color1"].default_value = (1, 1, 1, 1)
    brick.inputs["Color2"].default_value = (0.94, 0.94, 0.94, 1)
    brick.inputs["Mortar"].default_value = (0.35, 0.35, 0.35, 1)
    seam_map = ft.nodes.new("ShaderNodeMapping")
    seam_map.inputs["Rotation"].default_value = (0, 0, -yaw)  # mats square to the wall
    ft.links.new(coord.outputs["Object"], seam_map.inputs["Vector"])
    ft.links.new(seam_map.outputs["Vector"], brick.inputs["Vector"])
    mul = ft.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    [x for x in mul.inputs if x.name == "Factor" and x.enabled][0].default_value = 1.0
    ft.links.new(color_src, [x for x in mul.inputs if x.name == "A" and x.enabled][0])
    ft.links.new(brick.outputs["Color"], [x for x in mul.inputs if x.name == "B" and x.enabled][0])
    ft.links.new([x for x in mul.outputs if x.name == "Result" and x.enabled][0], bsdf.inputs["Base Color"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.6
    bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 0, 0))
    bpy.context.object.data.materials.append(floor_mat)

    wall_mat = pbr("Wall", args.textures, look["wall"], 0.6, look["wall_tint"], look["wall_value"])
    height = 4.2
    box("Wall", (0.2, 14, height), wall_center + view * 0.1 + Vector((0, 0, height / 2)), wall_mat, rotation=(0, 0, yaw))
    # Side wall closing the corner on the left of the frame.
    left = wall_center - side * 3.4 - view * 2.6
    box("SideWall", (0.2, 6, height), left + Vector((0, 0, height / 2)), wall_mat, rotation=(0, 0, yaw + math.pi / 2))

    # Vertical wood slats across the back wall, a gap in the middle for the sign.
    slat_mat = pbr("Slats", args.textures, "plywood", 1.6, look["slat_tint"], look["slat_value"])
    for i in range(-22, 23):
        if abs(i) <= 5:
            continue
        p = wall_center + side * (i * 0.13) - view * 0.04 + Vector((0, 0, 1.55))
        box(f"Slat{i}", (0.05, 0.06, 2.9), p, slat_mat, rotation=(0, 0, yaw))

    # LED coves: along the floor and above the slats.
    led = emissive("LED", look["led"], look["led_power"])
    box("LedLow", (0.04, 12, 0.025), wall_center - view * 0.08 + Vector((0, 0, 0.04)), led, rotation=(0, 0, yaw))
    box("LedHigh", (0.04, 12, 0.025), wall_center - view * 0.08 + Vector((0, 0, 3.05)), led, rotation=(0, 0, yaw))

    # Backlit sign with the app logo in the slat gap.
    logo = args.logo_dark if look is LOOKS["dark"] else args.logo_light
    bpy.ops.mesh.primitive_plane_add(size=1.05, location=wall_center - view * 0.05 + Vector((0, 0, 1.9)))
    sign = bpy.context.object
    sign.rotation_euler = (math.pi / 2, 0, yaw - math.pi / 2)
    sign.data.materials.append(logo_material("Logo", logo, look["logo_emit"], look["logo_strength"], metal=look["logo_strength"] == 0))
    if look["halo"]:
        halo = bpy.data.lights.new("Halo", "AREA")
        halo.energy = 120 * look["halo"]
        halo.color = look["led"]
        halo.size = 1.6
        h = bpy.data.objects.new("Halo", halo)
        scene.collection.objects.link(h)
        h.location = wall_center - view * 0.4 + Vector((0, 0, 1.9))
        bl_util.look_at(h, wall_center + Vector((0, 0, 1.9)))

    # Dumbbell racks on both sides of the sign: a dark steel frame with two
    # rows of hex dumbbells, soft in the background.
    steel = bpy.data.materials.new("Steel")
    steel.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.05, 0.055, 1)
    steel.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 0.6
    steel.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.35
    chrome = bpy.data.materials.new("Chrome")
    chrome.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.8, 0.8, 0.82, 1)
    chrome.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 1.0
    chrome.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.2
    for sgn in (-1, 1):
        base = wall_center + side * (sgn * 2.1) - view * 0.45
        box(f"Rack{sgn}", (0.5, 1.6, 0.05), base + Vector((0, 0, 0.45)), steel, rotation=(0, 0, yaw))
        box(f"Rack{sgn}b", (0.5, 1.6, 0.05), base + Vector((0, 0, 0.85)) + view * 0.08, steel, rotation=(0, 0, yaw))
        for leg in (-0.75, 0.75):
            box(f"Leg{sgn}{leg}", (0.05, 0.05, 0.9), base + side * leg + Vector((0, 0, 0.45)), steel, rotation=(0, 0, yaw))
        for row, z, size in ((0, 0.55, 0.11), (1, 0.95, 0.09)):
            for j in range(5):
                c = base + side * (-0.6 + j * 0.3) + view * (0.08 * row) + Vector((0, 0, z))
                for end in (-0.13, 0.13):
                    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=size - 0.01 * j, depth=0.07,
                                                        location=c + view * end, rotation=(math.pi / 2, 0, yaw - math.pi / 2))
                    bpy.context.object.data.materials.append(steel)
                bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.017, depth=0.22, location=c,
                                                    rotation=(math.pi / 2, 0, yaw - math.pi / 2))
                bpy.context.object.data.materials.append(chrome)

    # A soft key from above the camera, so the floor reads under the model.
    key = bpy.data.lights.new("Key", "AREA")
    key.energy = 900 * look["sun"]
    key.size = 5
    k = bpy.data.objects.new("Key", key)
    scene.collection.objects.link(k)
    k.location = target + Vector((0, 0, 4.5)) - view * 1.0
    bl_util.look_at(k, target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--textures", required=True)
    parser.add_argument("--logo-light", required=True)
    parser.add_argument("--logo-dark", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--width", type=int, default=1179)
    parser.add_argument("--height", type=int, default=2556)
    parser.add_argument("--wall-distance", type=float, default=4.4)
    parser.add_argument("--looks", default="light,dark")
    args = bl_util.script_args(parser)
    os.makedirs(args.out, exist_ok=True)
    for name in args.looks.split(","):
        build(LOOKS[name], args)
        scene = bpy.context.scene
        scene.render.image_settings.file_format = "JPEG"
        scene.render.image_settings.quality = 88
        scene.render.filepath = os.path.join(args.out, f"gym_backdrop_{name}.jpg")
        bpy.ops.render.render(write_still=True)
        print(f"[evs] backdrop {name}: {scene.render.filepath}")


if __name__ == "__main__":
    main()
