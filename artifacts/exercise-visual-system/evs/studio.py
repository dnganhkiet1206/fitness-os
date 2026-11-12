"""Studio: seamless backdrop, light rig that follows the camera, cameras and
render settings. Colours come from the brand profile, quality from a render
preset, light placement from a lighting preset."""

from __future__ import annotations

import math

import bpy
from mathutils import Vector

from . import bl_util
from .config import hex_to_linear_rgb

LIGHT_RIG = "EVS_LightRig"
FLOOR = "EVS_Floor"
STUDIO_COLLECTION = "STUDIO"


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
    scene.eevee.shadow_ray_count = 2
    scene.eevee.shadow_step_count = 6
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


def build_floor(brand: dict, lighting: dict) -> bpy.types.Object:
    """A floor that is exactly the background colour wherever it is lit and
    only darkens in contact shadows, so there is no horizon line."""
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
    ramp = nodes.new("ShaderNodeMapRange")
    ramp.clamp = True
    ramp.interpolation_type = "SMOOTHSTEP"
    # Floor brightness (white diffuse) measured with this lighting preset:
    # about shadow_reference in full contact shadow, lit_reference when clear.
    ramp.inputs["From Min"].default_value = floor_cfg["shadow_reference"]
    ramp.inputs["From Max"].default_value = floor_cfg["lit_reference"]
    strength = nodes.new("ShaderNodeMapRange")
    strength.inputs["From Min"].default_value = 0.0
    strength.inputs["From Max"].default_value = 1.0
    strength.inputs["To Min"].default_value = 1.0 - floor_cfg["shadow_strength"]
    strength.inputs["To Max"].default_value = 1.0
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    emission = nodes.new("ShaderNodeEmission")
    links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    links.new(to_rgb.outputs["Color"], bw.inputs["Color"])
    links.new(bw.outputs["Val"], ramp.inputs["Value"])
    links.new(ramp.outputs["Result"], strength.inputs["Value"])
    a = [s for s in mix.inputs if s.name == "A" and s.enabled][0]
    b = [s for s in mix.inputs if s.name == "B" and s.enabled][0]
    fac = [s for s in mix.inputs if s.name == "Factor" and s.enabled][0]
    a.default_value = (*hex_to_linear_rgb(brand["colors"]["floor_shadow"]), 1.0)
    b.default_value = (*hex_to_linear_rgb(brand["colors"]["background"]), 1.0)
    # Far from the subject the floor is forced to the background colour, so
    # light falloff never shows up as a horizon band.
    geo = nodes.new("ShaderNodeNewGeometry")
    dist = nodes.new("ShaderNodeVectorMath")
    dist.operation = "LENGTH"
    fade = nodes.new("ShaderNodeMapRange")
    fade.clamp = True
    fade.interpolation_type = "SMOOTHSTEP"
    fade.inputs["From Min"].default_value = floor_cfg["fade_start"]
    fade.inputs["From Max"].default_value = floor_cfg["fade_end"]
    far = nodes.new("ShaderNodeMath")
    far.operation = "MAXIMUM"
    links.new(geo.outputs["Position"], dist.inputs[0])
    links.new(dist.outputs["Value"], fade.inputs["Value"])
    links.new(strength.outputs["Result"], far.inputs[0])
    links.new(fade.outputs["Result"], far.inputs[1])
    links.new(far.outputs[0], fac)
    links.new([s for s in mix.outputs if s.name == "Result" and s.enabled][0], emission.inputs["Color"])
    emission.inputs["Strength"].default_value = 1.0
    links.new(emission.outputs["Emission"], out.inputs["Surface"])
    mesh.materials.append(mat)
    floor.visible_shadow = False
    floor.hide_select = True
    return floor


def build_light_rig(lighting: dict, focus: Vector) -> bpy.types.Object:
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
        data = bpy.data.lights.new(f"EVS_{spec['name']}", "AREA")
        data.shape = "DISK"
        data.size = spec["size"]
        data.energy = spec["power"]
        data.color = hex_to_linear_rgb(spec["color"])
        data.use_shadow = True
        data.use_shadow_jitter = True
        light = bpy.data.objects.new(f"EVS_Light_{spec['name']}", data)
        coll.objects.link(light)
        light.parent = rig
        az, el, d = math.radians(spec["azimuth_deg"]), math.radians(spec["elevation_deg"]), spec["distance"]
        light.location = (d * math.cos(el) * math.sin(az), -d * math.cos(el) * math.cos(az), d * math.sin(el))
        light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat("-Z", "Y").to_euler()
    return rig


def aim_light_rig(camera: bpy.types.Object, focus: Vector | None = None) -> None:
    """Turns the light rig about the vertical axis so azimuth 0 is the camera."""
    rig = bpy.data.objects[LIGHT_RIG]
    if focus is not None:
        rig.location = focus
    to_cam = camera.matrix_world.translation - rig.location
    rig.rotation_euler = (0.0, 0.0, math.atan2(to_cam.x, -to_cam.y))


def add_camera(name: str, focus: Vector, azimuth_deg: float, elevation_deg: float, distance: float,
               focal_length: float = 85.0, ortho_scale: float | None = None) -> bpy.types.Object:
    """Azimuth 0 looks at the focus from -Y (the character's front when it
    stands in its rest pose); positive azimuth moves the camera towards +X."""
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
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    cam.location = Vector(focus) + Vector((distance * math.cos(el) * math.sin(az), -distance * math.cos(el) * math.cos(az), distance * math.sin(el)))
    bl_util.look_at(cam, focus, up="Y")
    return cam


def render_still(scene: bpy.types.Scene, camera: bpy.types.Object, path: str, focus: Vector | None = None) -> None:
    scene.camera = camera
    bpy.context.view_layer.update()
    aim_light_rig(camera, focus)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
