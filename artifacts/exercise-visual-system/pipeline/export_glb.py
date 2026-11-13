"""Exports the master character and an exercise as binary glTF.

    Blender -b --factory-startup --python pipeline/export_glb.py -- --exercise bench-press

Writes into the exercise folder:
    master_character.glb          mesh, skeleton, skin weights, rest pose (no animation)
    <exercise>_animation.glb      character + equipment + one baked animation clip,
                                  with two material variants: muscle_highlight and neutral
    glb_report.json               what is really inside both files, and a re-import test

Only the 53 deform bones are exported. Controls, sockets, cameras, lights and
the floor stay in the .blend."""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from evs import PIPELINE_VERSION, bl_util, config, glb, muscle_eval, pngio  # noqa: E402

TEXTURE_SIZE = 1024


def export_material(name: str, base_hex: str, roughness: float, image: bpy.types.Image | None) -> bpy.types.Material:
    """Plain glTF-friendly material: a colour or one base-colour texture."""
    old = bpy.data.materials.get(name)
    if old is not None:
        bpy.data.materials.remove(old)
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    if image is None:
        bsdf.inputs["Base Color"].default_value = (*config.hex_to_linear_rgb(base_hex), 1.0)
    else:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def gltf_export(path: str, animations: bool) -> None:
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials="EXPORT", export_image_format="AUTO",
        export_cameras=False, export_lights=False, export_extras=False, export_skins=True, export_all_influences=False,
        export_def_bones=True, export_hierarchy_flatten_bones=False, export_leaf_bone=False, export_morph=False,
        export_animations=animations, export_animation_mode="SCENE", export_anim_scene_split_object=False,
        export_force_sampling=True, export_bake_animation=animations, export_frame_range=True, export_frame_step=1,
        export_optimize_animation_size=True, export_reset_pose_bones=True, export_rest_position_armature=True,
        export_draco_mesh_compression_enable=False)


def select(objects) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def base_mesh_only(objects) -> None:
    """Export the base mesh, not the render subdivision: about a quarter of
    the triangles, which is what a phone should skin every frame."""
    for o in objects:
        for mod in o.modifiers:
            if mod.type == "SUBSURF":
                mod.show_viewport = False


def reimport(path: str) -> dict:
    """Loads the GLB into an empty Blender scene, as a consumer would."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    actions = list(bpy.data.actions)
    last = max((a.frame_range[1] for a in actions), default=0.0)
    skinned = [o for o in meshes if any(m.type == "ARMATURE" for m in o.modifiers)]
    return {"armatures": len(armatures), "bones": len(armatures[0].data.bones) if armatures else 0, "mesh_objects": len(meshes),
            "skinned_mesh_objects": len(skinned), "mesh_vertices": int(sum(len(o.data.vertices) for o in meshes)),
            "actions": len(actions), "last_animation_frame": float(last), "materials": len(bpy.data.materials)}


def main(exercise_name: str | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exercise", default=exercise_name, required=exercise_name is None)
    args = bl_util.script_args(parser)
    exercise_path = config.exercise_dir(args.exercise)
    exercise = config.exercise_config(args.exercise)
    brand = config.brand_config()
    colors = brand["colors"]
    cfg = config.character_config()
    names = cfg["names"]
    prefix = exercise_path.name.replace("-", "_")
    report = {"pipeline_version": PIPELINE_VERSION, "exercise_id": exercise["exercise_id"], "master_character_id": cfg["master_character_id"], "files": {}}

    # ---- master character: rest pose, no animation ------------------------
    bpy.ops.wm.open_mainfile(filepath=str(config.character_blend(cfg["master_character_id"])))
    body, shorts, rig = (bpy.data.objects[names[k]] for k in ("body_object", "shorts_object", "armature_object"))
    base_mesh_only((body, shorts))
    for obj, key, rough in ((body, "character_body", 0.5), (shorts, "character_apparel", 0.72)):
        obj.data.materials.clear()
        obj.data.materials.append(export_material(f"EVS_{'Body' if obj is body else 'Apparel'}_Export", colors[key], rough, None))
    select([rig, body, shorts])
    character_glb = exercise_path / "master_character.glb"
    gltf_export(str(character_glb), animations=False)
    report["files"][character_glb.name] = glb.summarize(character_glb)

    # ---- exercise: character + equipment + animation -----------------------
    bpy.ops.wm.open_mainfile(filepath=str(exercise_path / exercise["animation_file"]))
    scene = bpy.context.scene
    body, shorts, rig = (bpy.data.objects[names[k]] for k in ("body_object", "shorts_object", "armature_object"))
    base_mesh_only((body, shorts))
    highlight = pngio.read_png(exercise_path / "muscle_highlight_map.png")
    f = highlight.shape[0] // TEXTURE_SIZE
    small = highlight.reshape(TEXTURE_SIZE, f, TEXTURE_SIZE, f, 3).mean(axis=(1, 3)).astype(np.uint8) if f > 1 else highlight
    textures = {}
    for key, base_key, gain in (("Body", "character_body", 1.0), ("Apparel", "character_apparel", 0.8)):
        albedo = muscle_eval.albedo_from_highlight(small, colors[base_key], colors["muscle_primary"], colors["muscle_secondary"],
                                                    colors["muscle_stabilizer"], gain)
        path = exercise_path / f"_glb_{key.lower()}_albedo.png"
        pngio.write_png(path, albedo)
        textures[key] = bpy.data.images.load(str(path))
    for obj, key, base_key, rough in ((body, "Body", "character_body", 0.5), (shorts, "Apparel", "character_apparel", 0.72)):
        obj.data.materials.clear()
        obj.data.materials.append(export_material(f"EVS_{key}_Export", colors[base_key], rough, textures[key]))
    equipment_objects = [o for o in scene.objects if o.type == "MESH" and o.get("evs_equipment")]
    select([rig, body, shorts, *equipment_objects])
    scene.frame_set(scene.frame_start)
    raw = exercise_path / f"_{prefix}_animation_raw.glb"
    gltf_export(str(raw), animations=True)
    animation_glb = exercise_path / f"{prefix}_animation.glb"
    glb.add_material_variants(raw, animation_glb, {
        "muscle_highlight": {"EVS_Body_Export": {"same": True}, "EVS_Apparel_Export": {"same": True}},
        "neutral": {
            "EVS_Body_Export": {"base_color": [*config.hex_to_linear_rgb(colors["character_body"]), 1.0]},
            "EVS_Apparel_Export": {"base_color": [*config.hex_to_linear_rgb(colors["character_apparel"]), 1.0]},
        },
    })
    os.remove(raw)
    for key in ("Body", "Apparel"):
        os.remove(exercise_path / f"_glb_{key.lower()}_albedo.png")
    summary = glb.summarize(animation_glb)
    report["files"][animation_glb.name] = summary
    expected_duration = (scene.frame_end - scene.frame_start) / scene.render.fps
    expected_frames = scene.frame_end - scene.frame_start + 1
    deform = sum(1 for b in rig.data.bones if b.use_deform)

    # ---- read both files back in, as a consumer would -----------------------
    report["reimport"] = {character_glb.name: reimport(str(character_glb)), animation_glb.name: reimport(str(animation_glb))}
    clip = summary["animations"][0] if summary["animations"] else {}
    report["expectations"] = {
        "deform_bones": deform,
        "animation_duration_s": round(expected_duration, 4),
        "animation_frames": expected_frames,
        "clip_duration_s": clip.get("duration_s"),
        "clip_max_keys": clip.get("max_keys"),
    }
    for name, s in report["files"].items():
        s.pop("node_names", None)
        print(f"[evs] {name}: {s['size_bytes']} bytes, {s['vertices']} vertices, {s['triangles']} triangles, skins {s['skins']}, "
              f"animations {s['animations']}, variants {s['material_variants']}, errors {s['errors']}")
    print(f"[evs] reimport: {report['reimport']}")
    config.save_json(exercise_path / "glb_report.json", report)


if __name__ == "__main__":
    main()
