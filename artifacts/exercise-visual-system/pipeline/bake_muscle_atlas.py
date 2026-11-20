"""Bakes config/muscle_map.json into mask images for the master character and
renders a preview with every group in its own colour.

    Blender -b --factory-startup --python pipeline/bake_muscle_atlas.py

Run it again whenever muscle_map.json changes. The character mesh, rig and
every animation stay untouched; exercises only need their highlight map
recomposed (build_scene.py does that)."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from evs import bl_util, config, muscles, studio  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-preview", action="store_true")
    parser.add_argument("--preview-only", action="store_true", help="render the preview from the saved masks, no bake")
    parser.add_argument("--fibers", action="store_true", help="preview with the fibre stripes of every part (needs fiber_phase.npz)")
    args = bl_util.script_args(parser)

    cfg = config.character_config()
    brand = config.brand_config()
    muscle_map = config.muscle_map()
    out_dir = config.character_dir(cfg["master_character_id"])
    atlas_dir = out_dir / "muscle_atlas"
    bpy.ops.wm.open_mainfile(filepath=str(config.character_blend(cfg["master_character_id"])))
    body = bpy.data.objects[cfg["names"]["body_object"]]
    rig = bpy.data.objects[cfg["names"]["armature_object"]]

    t0 = time.time()
    if args.preview_only:
        facts = None
    else:
        facts = muscles.bake_atlas(body, rig, muscle_map, atlas_dir)
    if facts is not None:
        facts["muscle_map_id"] = muscle_map["muscle_map_id"]
        # The bake already applies neck_fan (muscle_eval): record it so trim_neck_fan.py does
        # not cut these masks a second time (review #938).
        facts["neck_fan_applied"] = {n: g["neck_fan"] for n, g in muscle_map["groups"].items() if "neck_fan" in g}
        config.save_json(atlas_dir / "atlas_facts.json", facts)
        print(f"[evs] atlas baked in {time.time() - t0:.1f}s: {facts['samples']} samples, UV coverage {facts['uv_coverage']}")
        for name, g in facts["groups"].items():
            print(f"[evs]   {name:26s} {g['texels']:8d} texels")
    if args.no_preview:
        return

    debug_png = atlas_dir / "_all_groups.png"
    muscles.write_debug_map(atlas_dir, debug_png, fibers=args.fibers)
    image = bpy.data.images.load(str(debug_png))
    mat = bpy.data.materials.new("EVS_MuscleDebug")
    tree = mat.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Cubic"
    tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.6
    body.data.materials.clear()
    body.data.materials.append(mat)
    bpy.data.objects[cfg["names"]["shorts_object"]].hide_render = True

    scene = bpy.context.scene
    presets = config.render_presets()
    preset = dict(presets["render_presets"][brand["render_preset"]])
    preset["resolution"] = [640, 1100]
    lighting = presets["lighting_presets"][brand["lighting_preset"]]
    studio.apply_render_preset(scene, preset)
    studio.build_world(scene, brand, lighting)
    studio.build_floor(brand, lighting)
    focus = Vector((0.0, 0.0, 0.93))
    studio.build_light_rig(lighting, focus)
    studio.calibrate_floor(scene)
    tiles = []
    for name, az in (("front", 0), ("left", 90), ("back", 180), ("right_front", -50)):
        cam = studio.add_camera(f"EVS_Muscle_{name}", focus, az, 4.0, 7.2, focal_length=85.0)
        path = str(out_dir / f"_muscle_{name}.png")
        studio.render_still(scene, cam, path, focus)
        tiles.append(path)
    sheet = str(out_dir / ("muscle_fiber_preview.png" if args.fibers else "muscle_map_preview.png"))
    cmd = ["ffmpeg", "-loglevel", "error", "-y"]
    for t in tiles:
        cmd += ["-i", t]
    subprocess.run(cmd + ["-filter_complex", f"hstack=inputs={len(tiles)}", sheet], check=True)
    for t in tiles:
        os.remove(t)
    # Close-ups by region (15/11, muscle_map v2 review): the full-body tiles
    # are too small to judge the boundaries between parts.
    preset["resolution"] = [720, 900]
    studio.apply_render_preset(scene, preset)
    close = []
    for name, z, az, dist in (("torso_front", 1.25, 0, 2.6), ("torso_back", 1.25, 180, 2.6),
                              ("legs_front", 0.55, 0, 3.0), ("legs_back", 0.55, 180, 3.0),
                              ("arm_side", 1.2, 70, 2.4), ("arm_back_side", 1.2, 130, 2.4)):
        f = Vector((0.0, 0.0, z))
        cam = studio.add_camera(f"EVS_MuscleClose_{name}", f, az, 4.0, dist, focal_length=85.0)
        path = str(out_dir / f"_close_{name}.png")
        studio.render_still(scene, cam, path, f)
        close.append(path)
    closeups = str(out_dir / ("muscle_fiber_closeups.png" if args.fibers else "muscle_map_closeups.png"))
    cmd = ["ffmpeg", "-loglevel", "error", "-y"]
    for t in close:
        cmd += ["-i", t]
    subprocess.run(cmd + ["-filter_complex", "[0][1][2]hstack=inputs=3[a];[3][4][5]hstack=inputs=3[b];[a][b]vstack", closeups], check=True)
    for t in close:
        os.remove(t)
    os.remove(debug_png)
    print(f"[evs] preview: {sheet} (+ {closeups})")


if __name__ == "__main__":
    main()
