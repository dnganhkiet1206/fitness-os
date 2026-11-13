"""Studio: seamless backdrop, light rig that follows the camera, cameras and
render settings. Colours come from the brand profile, quality from a render
preset, light placement from a lighting preset."""

from __future__ import annotations

import math
import os
import tempfile

import bpy
import numpy as np
from mathutils import Vector

from . import bl_util
from .config import hex_to_linear_rgb

LIGHT_RIG = "EVS_LightRig"
FLOOR = "EVS_Floor"
STUDIO_COLLECTION = "STUDIO"
FLOOR_SHADOW_NODE = "EVS Shadow Level"
FLOOR_LIT_NODE = "EVS Lit Level"


def apply_render_preset(scene: bpy.types.Scene, preset: dict) -> None:
    scene.render.engine = preset["engine"]
    scene.render.resolution_x, scene.render.resolution_y = preset["resolution"]
    scene.render.resolution_percentage = 100
    scene.render.fps = int(preset["frame_rate"])
    scene.render.fps_base = 1.0
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 60
    scene.render.use_file_extension = True
    scene.eevee.taa_render_samples = int(preset["taa_render_samples"])
    scene.eevee.use_raytracing = bool(preset.get("use_raytracing", False))
    scene.eevee.use_shadows = True
    scene.eevee.shadow_ray_count = int(preset.get("shadow_ray_count", 2))
    scene.eevee.shadow_step_count = int(preset.get("shadow_step_count", 6))
    scene.eevee.use_fast_gi = True
    scene.display_settings.display_device = "sRGB"
    scene.view_settings.view_transform = preset["view_transform"]
    scene.view_settings.look = preset.get("look", "None")
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0


def build_world(scene: bpy.types.Scene, brand: dict, lighting: dict) -> None:
    """Camera sees the flat brand background; the scene is lit by a neutral
    ambient term, so changing the background colour does not tint the model."""
    world = bpy.data.worlds.get("EVS_World") or bpy.data.worlds.new("EVS_World")
    scene.world = world
    tree = world.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputWorld")
    mix = tree.nodes.new("ShaderNodeMixShader")
    path = tree.nodes.new("ShaderNodeLightPath")
    ambient = tree.nodes.new("ShaderNodeBackground")
    backdrop = tree.nodes.new("ShaderNodeBackground")
    ambient.inputs["Color"].default_value = (*hex_to_linear_rgb(lighting["ambient_color"]), 1.0)
    ambient.inputs["Strength"].default_value = lighting["ambient_strength"]
    backdrop.inputs["Color"].default_value = (*hex_to_linear_rgb(brand["colors"]["background"]), 1.0)
    backdrop.inputs["Strength"].default_value = 1.0
    tree.links.new(path.outputs["Is Camera Ray"], mix.inputs["Fac"])
    tree.links.new(ambient.outputs["Background"], mix.inputs[1])
    tree.links.new(backdrop.outputs["Background"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], out.inputs["Surface"])


def _floor_material(brand: dict, floor_cfg: dict) -> bpy.types.Material:
    """Emits exactly the background colour wherever the floor is fully lit and
    blends towards the shadow colour where light is blocked. The lit and
    shadow levels are measured for the light rig by calibrate_floor()."""
    mat = bpy.data.materials.get("EVS_Floor")
    if mat is not None:
        bpy.data.materials.remove(mat)
    mat = bpy.data.materials.new("EVS_Floor")
    tree = mat.node_tree
    tree.nodes.clear()
    nodes, links = tree.nodes, tree.links
    out = nodes.new("ShaderNodeOutputMaterial")
    diffuse = nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (1, 1, 1, 1)
    to_rgb = nodes.new("ShaderNodeShaderToRGB")
    bw = nodes.new("ShaderNodeRGBToBW")
    shadow_level = nodes.new("ShaderNodeValue")
    shadow_level.name = shadow_level.label = FLOOR_SHADOW_NODE
    lit_level = nodes.new("ShaderNodeValue")
    lit_level.name = lit_level.label = FLOOR_LIT_NODE
    shadow_level.outputs[0].default_value = 0.4
    lit_level.outputs[0].default_value = 0.9
    ramp = nodes.new("ShaderNodeMapRange")
    ramp.clamp = True  # linear: the result is the fraction of key light that arrives
    strength = nodes.new("ShaderNodeMapRange")
    strength.inputs["To Min"].default_value = 1.0 - floor_cfg["shadow_strength"]
    strength.inputs["To Max"].default_value = 1.0
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    emission = nodes.new("ShaderNodeEmission")
    links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    links.new(to_rgb.outputs["Color"], bw.inputs["Color"])
    links.new(bw.outputs["Val"], ramp.inputs["Value"])
    links.new(shadow_level.outputs[0], ramp.inputs["From Min"])
    links.new(lit_level.outputs[0], ramp.inputs["From Max"])
    links.new(ramp.outputs["Result"], strength.inputs["Value"])
    a = [s for s in mix.inputs if s.name == "A" and s.enabled][0]
    b = [s for s in mix.inputs if s.name == "B" and s.enabled][0]
    fac = [s for s in mix.inputs if s.name == "Factor" and s.enabled][0]
    a.default_value = (*hex_to_linear_rgb(brand["colors"]["floor_shadow"]), 1.0)
    b.default_value = (*hex_to_linear_rgb(brand["colors"]["background"]), 1.0)
    links.new(strength.outputs["Result"], fac)
    links.new([s for s in mix.outputs if s.name == "Result" and s.enabled][0], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], out.inputs["Surface"])
    return mat


def build_floor(brand: dict, lighting: dict) -> bpy.types.Object:
    floor_cfg = lighting["floor"]
    coll = bl_util.get_collection(STUDIO_COLLECTION)
    old = bpy.data.objects.get(FLOOR)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    mesh = bpy.data.meshes.new(FLOOR)
    r = floor_cfg["radius"]
    mesh.from_pydata([(-r, -r, 0), (r, -r, 0), (r, r, 0), (-r, r, 0)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new(FLOOR, mesh)
    coll.objects.link(floor)
    mesh.materials.append(_floor_material(brand, floor_cfg))
    floor.visible_shadow = False
    floor.hide_select = True
    floor["evs_lit_tolerance"] = floor_cfg["lit_tolerance"]
    return floor


def build_light_rig(lighting: dict, focus: Vector) -> bpy.types.Object:
    """Sun lamps: parallel light without falloff, so the exposure of the
    subject and the brightness of the floor are the same everywhere."""
    coll = bl_util.get_collection(STUDIO_COLLECTION)
    old = bpy.data.objects.get(LIGHT_RIG)
    if old is not None:
        for child in list(old.children):
            bpy.data.objects.remove(child, do_unlink=True)
        bpy.data.objects.remove(old, do_unlink=True)
    rig = bpy.data.objects.new(LIGHT_RIG, None)
    rig.empty_display_size = 0.3
    rig.location = focus
    coll.objects.link(rig)
    for spec in lighting["lights"]:
        data = bpy.data.lights.new(f"EVS_{spec['name']}", "SUN")
        data.energy = spec["strength"]
        data.angle = math.radians(spec["angle_deg"])
        data.color = hex_to_linear_rgb(spec["color"])
        data.use_shadow = bool(spec.get("cast_shadow", True))
        data.use_shadow_jitter = True
        data.shadow_jitter_overblur = 10.0
        data.shadow_filter_radius = 3.0
        light = bpy.data.objects.new(f"EVS_Light_{spec['name']}", data)
        coll.objects.link(light)
        light.parent = rig
        az, el = math.radians(spec["azimuth_deg"]), math.radians(spec["elevation_deg"])
        light.location = (4.0 * math.cos(el) * math.sin(az), -4.0 * math.cos(el) * math.cos(az), 4.0 * math.sin(el))
        light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat("-Z", "Y").to_euler()
    return rig


def calibrate_floor(scene: bpy.types.Scene) -> dict:
    """Measures how bright a white floor is under the current lights, once
    with every light and once with the shadow-casting lights switched off
    (tiny top-down renders of an empty corner of the floor), and stores both
    levels in the floor material. Between them the material reads the
    fraction of shadow-casting light that arrives. Measuring instead of
    computing keeps the floor seamless whatever the light units or settings."""
    floor = bpy.data.objects[FLOOR]
    mat = floor.data.materials[0]
    probe_mat = bpy.data.materials.new("EVS_FloorProbe")
    tree = probe_mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    diffuse = tree.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (1, 1, 1, 1)
    tree.links.new(diffuse.outputs["BSDF"], out.inputs["Surface"])
    floor.data.materials[0] = probe_mat

    half = abs(floor.data.vertices[0].co.x)
    cam_data = bpy.data.cameras.new("EVS_FloorProbe")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 1.0
    cam = bpy.data.objects.new("EVS_FloorProbe", cam_data)
    scene.collection.objects.link(cam)
    cam.location = Vector((half - 1.5, half - 1.5, 3.0))
    saved = (scene.camera, scene.render.resolution_x, scene.render.resolution_y, scene.render.filepath,
             scene.render.image_settings.file_format, scene.render.image_settings.color_mode, scene.eevee.taa_render_samples)
    path = os.path.join(tempfile.gettempdir(), "evs_floor_probe.exr")
    casters = [o for o in bpy.data.objects[LIGHT_RIG].children if o.data.use_shadow]

    def measure() -> float:
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(path)
        px = np.array(image.pixels[:]).reshape(-1, 4)[:, :3]
        bpy.data.images.remove(image)
        return float(np.median(px @ np.array([0.2126, 0.7152, 0.0722])))

    try:
        scene.camera = cam
        scene.render.resolution_x = scene.render.resolution_y = 32
        scene.render.image_settings.file_format = "OPEN_EXR"
        scene.render.image_settings.color_mode = "RGB"
        scene.eevee.taa_render_samples = 16
        scene.render.filepath = path
        lit = measure()
        for o in casters:
            o.hide_render = True
        shadowed = measure()
    finally:
        for o in casters:
            o.hide_render = False
        (scene.camera, scene.render.resolution_x, scene.render.resolution_y, scene.render.filepath,
         scene.render.image_settings.file_format, scene.render.image_settings.color_mode, scene.eevee.taa_render_samples) = saved
        floor.data.materials[0] = mat
        bpy.data.objects.remove(cam, do_unlink=True)
        bpy.data.cameras.remove(cam_data)
        bpy.data.materials.remove(probe_mat)
        if os.path.exists(path):
            os.remove(path)
    # A little below the measured level still counts as fully lit, so render
    # noise never tints the open floor.
    upper = lit - (lit - shadowed) * floor["evs_lit_tolerance"]
    mat.node_tree.nodes[FLOOR_SHADOW_NODE].outputs[0].default_value = shadowed
    mat.node_tree.nodes[FLOOR_LIT_NODE].outputs[0].default_value = upper
    floor["evs_measured_lit_level"] = lit
    floor["evs_measured_shadow_level"] = shadowed
    return {"lit_level": round(lit, 4), "shadow_level": round(shadowed, 4)}


def aim_light_rig(camera: bpy.types.Object, focus: Vector | None = None) -> None:
    """Turns the light rig about the vertical axis so azimuth 0 is the camera."""
    rig = bpy.data.objects[LIGHT_RIG]
    if focus is not None:
        rig.location = focus
    to_cam = camera.matrix_world.translation - rig.location
    rig.rotation_euler = (0.0, 0.0, math.atan2(to_cam.x, -to_cam.y))


def camera_direction(azimuth_deg: float, elevation_deg: float) -> Vector:
    """Unit vector from the subject to the camera. Azimuth 0 looks at the
    subject's front (from -Y); positive azimuth moves towards +X."""
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    return Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))


def add_camera(name: str, focus: Vector, azimuth_deg: float, elevation_deg: float, distance: float,
               focal_length: float = 85.0, ortho_scale: float | None = None) -> bpy.types.Object:
    coll = bl_util.get_collection(STUDIO_COLLECTION)
    old = bpy.data.objects.get(name)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    data = bpy.data.cameras.new(name)
    if ortho_scale is not None:
        data.type = "ORTHO"
        data.ortho_scale = ortho_scale
    else:
        data.lens = focal_length
        data.sensor_width = 36.0
    data.clip_start = 0.1
    data.clip_end = 100.0
    cam = bpy.data.objects.new(name, data)
    coll.objects.link(cam)
    cam.location = Vector(focus) + camera_direction(azimuth_deg, elevation_deg) * distance
    bl_util.look_at(cam, focus, up="Y")
    return cam


def fit_view(points: np.ndarray, azimuth_deg: float, elevation_deg: float, focal_length: float, sensor: float,
             aspect: float, margin: float) -> tuple[Vector, float]:
    """Target point and distance at which a camera looking from the given
    direction shows all ``points`` centred, filling the frame up to
    ``margin`` (1.0 = touching the frame edge)."""
    direction = np.array(camera_direction(azimuth_deg, elevation_deg))
    forward = -direction
    right = np.cross(forward, np.array([0.0, 0.0, 1.0]))
    right /= np.linalg.norm(right)
    up = np.cross(right, forward)
    tan_h = (sensor * 0.5) / focal_length
    tan_v = tan_h / aspect
    target = 0.5 * (points.max(axis=0) + points.min(axis=0))
    distance = float(np.linalg.norm(points.max(axis=0) - points.min(axis=0))) / tan_v
    for _ in range(24):
        cam = target + direction * distance
        rel = points - cam
        depth = rel @ forward
        x = (rel @ right) / depth
        y = (rel @ up) / depth
        cx, cy = 0.5 * (x.max() + x.min()), 0.5 * (y.max() + y.min())
        target = target + (right * cx + up * cy) * distance
        scale = max((x.max() - x.min()) * 0.5 / tan_h, (y.max() - y.min()) * 0.5 / tan_v) * margin
        distance *= scale
    return Vector(target), distance


def render_still(scene: bpy.types.Scene, camera: bpy.types.Object, path: str, focus: Vector | None = None) -> None:
    scene.camera = camera
    bpy.context.view_layer.update()
    aim_light_rig(camera, focus)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
