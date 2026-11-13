"""Exports one exercise to USDZ (zipped USD) for the in-app RealityKit
viewer: a skinned, animated character the user orbits freely in a vertical
9:16 frame.

Mirrors pipeline/export_glb.py: it opens the exercise .blend and swaps in
flat export materials for the body and shorts, because neither glTF nor USD
can run the Blender shader node tree. The USDZ materials carry both the
baked albedo and the baked emission texture, so the fibre striations in
the highlight map glow in RealityKit (UsdPreviewSurface emissiveColor);
the flat GLB bake has albedo only. Equipment keeps its scene materials.
Only deform bones are exported, the subdivision modifier is off (base
mesh), and the scene is converted to Y-up metres, the coordinate system
RealityKit expects. The source .blend is never saved.

Usage (Blender 5.2, headless):
    blender -b --factory-startup --python pipeline/export_usdz.py -- \
        --exercise bench-press --out-dir bench-press/usdz
"""

import argparse
import json
import math
import sys
import zipfile
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

from evs import PIPELINE_VERSION, config, muscle_eval, pngio  # noqa: E402
from evs.studio import fit_view  # noqa: E402

TEXTURE_SIZE = 1024
# Same glow as the Blender shader (evs/materials.py: Emission Strength).
EMISSION_STRENGTH = 0.35


def blender_to_realitykit(v: Vector) -> list[float]:
    """Blender Z-up (x, y, z) to RealityKit Y-up (x, z, -y)."""
    return [round(float(v.x), 4), round(float(v.z), 4), round(float(-v.y), 4)]


def export_material(name: str, roughness: float, albedo: bpy.types.Image, emission: bpy.types.Image) -> bpy.types.Material:
    """Plain USD-friendly material: albedo + emission textures, the same
    bake the GLB export uses plus the glow the shader adds on top."""
    old = bpy.data.materials.get(name)
    if old is not None:
        bpy.data.materials.remove(old)
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.35
    bsdf.inputs["Emission Strength"].default_value = EMISSION_STRENGTH
    albedo_tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    albedo_tex.image = albedo
    mat.node_tree.links.new(albedo_tex.outputs["Color"], bsdf.inputs["Base Color"])
    emission_tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    emission_tex.image = emission
    mat.node_tree.links.new(emission_tex.outputs["Color"], bsdf.inputs["Emission Color"])
    return mat


def select(objects) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def base_mesh_only(objects) -> None:
    """Export the base mesh, not the render subdivision (same as the GLB
    export). Both visibility flags, because the USD exporter evaluates in
    render mode."""
    for o in objects:
        for mod in o.modifiers:
            if mod.type == "SUBSURF":
                mod.show_viewport = False
                mod.show_render = False


def sample_subject_points(scene, frame_numbers, skip_names=("EVS_Floor",)):
    """World-space mesh vertices at the rack, at lockout and on the chest,
    the same three poses the camera fit in the animate script uses, so the
    default view frames the whole repetition."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for f in frame_numbers:
        scene.frame_set(f)
        depsgraph.update()
        for obj in scene.objects:
            if obj.type == "MESH" and obj.name not in skip_names:
                ev = obj.evaluated_get(depsgraph)
                me = ev.to_mesh()
                points.extend(obj.matrix_world @ me.vertices[i].co for i in range(0, len(me.vertices), 7))
                ev.to_mesh_clear()
    scene.frame_set(scene.frame_start)
    return np.array([[p.x, p.y, p.z] for p in points])


def default_camera(scene, exercise, aspect):
    """The three-quarter hero preset refitted for a vertical frame: same
    azimuth/elevation/lens as the app's current default, distance refitted
    so the whole repetition stays in a 9:16 frame. Returned in RealityKit
    Y-up coordinates with the vertical field of view for the Swift camera."""
    presets = config.camera_presets()
    preset = presets["presets"]["three_quarter"]
    sensor_mm = presets["sensor_width_mm"]
    fps = int(exercise["frame_rate"])
    phases = {p["id"]: p for p in exercise["exercise_phases"]}
    frames = [0]
    for name in ("start_position", "bottom"):
        phase = phases.get(name)
        if phase is not None:
            frames.append(int(round(phase["start_s"] * fps)))
    points = sample_subject_points(scene, frames)
    focus, distance = fit_view(points, preset["azimuth_deg"], preset["elevation_deg"],
                               preset["focal_length_mm"], sensor_mm, aspect, preset["margin"])
    direction = Vector((math.cos(math.radians(preset["elevation_deg"])) * math.sin(math.radians(preset["azimuth_deg"])),
                        -math.cos(math.radians(preset["elevation_deg"])) * math.cos(math.radians(preset["azimuth_deg"])),
                        math.sin(math.radians(preset["elevation_deg"]))))
    position = focus + direction * distance
    half_h = math.atan(sensor_mm / 2.0 / preset["focal_length_mm"])
    vertical_fov_deg = math.degrees(2.0 * math.atan(math.tan(half_h) / aspect))
    return {
        "preset_id": "three_quarter",
        "position_m": blender_to_realitykit(position),
        "target_m": blender_to_realitykit(focus),
        "distance_m": round(float(distance), 4),
        "vertical_fov_deg": round(vertical_fov_deg, 2),
        "aspect": aspect,
    }


def reimport(path: str) -> dict:
    """Loads the USDZ into an empty Blender scene, as a consumer would."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.usd_import(filepath=path)
    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    actions = list(bpy.data.actions)
    last = max((a.frame_range[1] for a in actions), default=0.0)
    skinned = [o for o in meshes if any(m.type == "ARMATURE" for m in o.modifiers)]
    return {"armatures": len(armatures), "bones": len(armatures[0].data.bones) if armatures else 0,
            "mesh_objects": len(meshes), "skinned_mesh_objects": len(skinned),
            "mesh_vertices": int(sum(len(o.data.vertices) for o in meshes)),
            "actions": len(actions), "last_animation_frame": float(last),
            "materials": len(bpy.data.materials)}


def main(exercise_name: str | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exercise", default=exercise_name, required=exercise_name is None)
    parser.add_argument("--out-dir", default=None)
    parser.add_argument("--size", type=int, default=TEXTURE_SIZE)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])

    exercise_path = config.exercise_dir(args.exercise)
    exercise = config.exercise_config(args.exercise)
    brand = config.brand_config()
    colors = brand["colors"]
    cfg = config.character_config()
    names = cfg["names"]
    out_dir = Path(args.out_dir) if args.out_dir else exercise_path
    out_dir.mkdir(parents=True, exist_ok=True)
    prefix = exercise_path.name.replace("-", "_")

    bpy.ops.wm.open_mainfile(filepath=str(exercise_path / exercise["animation_file"]))
    scene = bpy.context.scene
    body, shorts, rig = (bpy.data.objects[names[k]] for k in ("body_object", "shorts_object", "armature_object"))
    base_mesh_only((body, shorts))

    highlight = pngio.read_png(exercise_path / "muscle_highlight_map.png")
    f = highlight.shape[0] // args.size
    small = highlight.reshape(args.size, f, args.size, f, 3).mean(axis=(1, 3)).astype(np.uint8) if f > 1 else highlight
    tmp = []
    for obj, key, base_key, gain, rough in ((body, "Body", "character_body", 1.0, 0.5),
                                            (shorts, "Apparel", "character_apparel", 0.8, 0.72)):
        albedo = muscle_eval.albedo_from_highlight(small, colors[base_key], colors["muscle_primary"],
                                                   colors["muscle_secondary"], colors["muscle_stabilizer"], gain)
        emission = muscle_eval.emission_from_highlight(small, colors["muscle_primary"],
                                                       colors["muscle_secondary"], colors["muscle_stabilizer"], gain)
        ap, ep = out_dir / f"_usdz_{key.lower()}_albedo.png", out_dir / f"_usdz_{key.lower()}_emission.png"
        pngio.write_png(ap, albedo)
        pngio.write_png(ep, emission)
        tmp.extend([ap, ep])
        obj.data.materials.clear()
        obj.data.materials.append(export_material(f"EVS_{key}_USDZ", rough,
                                                  bpy.data.images.load(str(ap)), bpy.data.images.load(str(ep))))

    equipment_objects = [o for o in scene.objects if o.type == "MESH" and o.get("evs_equipment")]
    select([rig, body, shorts, *equipment_objects])
    scene.frame_set(scene.frame_start)
    usdz_path = out_dir / f"{prefix}_animation.usdz"
    bpy.ops.wm.usd_export(
        filepath=str(usdz_path),
        selected_objects_only=True,
        export_animation=True,
        export_armatures=True,
        only_deform_bones=True,
        export_shapekeys=False,
        export_materials=True,
        generate_preview_surface=True,
        export_textures_mode="NEW",
        relative_paths=True,
        convert_orientation=True,
        export_global_forward_selection="NEGATIVE_Z",
        export_global_up_selection="Y",
        convert_scene_units="METERS",
        export_lights=False,
        export_cameras=False,
        evaluation_mode="RENDER",
        check_existing=False,
    )
    for p in tmp:
        p.unlink()

    camera = default_camera(scene, exercise, 9.0 / 16.0)
    with zipfile.ZipFile(usdz_path) as zf:
        members = zf.namelist()
    deform = sum(1 for b in rig.data.bones if b.use_deform)
    report = {"pipeline_version": PIPELINE_VERSION, "exercise_id": exercise["exercise_id"],
              "master_character_id": cfg["master_character_id"],
              "usdz": usdz_path.name, "size_bytes": usdz_path.stat().st_size,
              "zip_members": members, "default_camera": camera,
              "expectations": {"deform_bones": deform,
                               "animation_duration_s": round((scene.frame_end - scene.frame_start) / scene.render.fps, 4),
                               "animation_frames": scene.frame_end - scene.frame_start + 1}}
    report["reimport"] = reimport(str(usdz_path))
    config.save_json(out_dir / "usdz_report.json", report)
    print(f"[evs] {usdz_path.name}: {report['size_bytes']} bytes, members {members}")
    print(f"[evs] default camera: {camera}")
    print(f"[evs] reimport: {report['reimport']}")


if __name__ == "__main__":
    main()
