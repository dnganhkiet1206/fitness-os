"""Builds the master character once and saves it for every exercise to reuse.

    Blender -b --factory-startup --python pipeline/build_character.py

Writes, under characters/<master_character_id>/:
    master_character.blend     editable mesh, rig, materials
    character_facts.json       measurements and the consistency fingerprint
    character_preview.png      front, three-quarter, side and back views
    muscle_atlas/              one mask image per muscle group
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from evs import bl_util, character, config, materials, studio  # noqa: E402
from evs import rig as evs_rig  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview-only", action="store_true", help="re-render the preview from the saved blend")
    parser.add_argument("--no-preview", action="store_true")
    args = bl_util.script_args(parser)

    t0 = time.time()
    cfg = config.character_config()
    brand = config.brand_config()
    out_dir = config.character_dir(cfg["master_character_id"])
    out_dir.mkdir(parents=True, exist_ok=True)
    blend_path = config.character_blend(cfg["master_character_id"])

    if args.preview_only:
        bpy.ops.wm.open_mainfile(filepath=str(blend_path))
        body = bpy.data.objects[cfg["names"]["body_object"]]
    else:
        scene = bl_util.reset_scene()
        bl_util.enable_mpfb()
        body, rig, facts = character.build_body(cfg)
        facts.update(character.make_faceless(body, cfg, facts))
        facts["nipple_vertices_faired"] = character.remove_nipples(body)
        character.drop_landmark_groups(body)
        shorts = character.build_shorts(body, rig, cfg)
        character.finish_body(body, rig, cfg)
        evs_rig.add_controls(rig)

        mats = materials.character_materials(brand)
        body.data.materials.clear()
        body.data.materials.append(mats["body"])
        shorts.data.materials.clear()
        shorts.data.materials.append(mats["apparel"])

        coll = bl_util.get_collection(cfg["names"]["collection"])
        for obj in (rig, body, shorts):
            bl_util.move_to_collection(obj, coll)

        facts.update(character.measure(body, rig))
        facts["master_character_id"] = cfg["master_character_id"]
        facts["version"] = cfg["version"]
        config.save_json(out_dir / "character_facts.json", facts)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        print(f"[evs] character built in {time.time() - t0:.1f}s: {blend_path}")
        print(f"[evs] height {facts['height_m']} m, {facts['vertices']} vertices, {facts['deform_bone_count']} deform bones")

    if not args.no_preview:
        render_preview(cfg, brand, out_dir)


def render_preview(cfg: dict, brand: dict, out_dir) -> None:
    scene = bpy.context.scene
    presets = config.render_presets()
    preset = dict(presets["render_presets"][brand["render_preset"]])
    preset["resolution"] = [640, 1100]
    preset["taa_render_samples"] = 48
    lighting = presets["lighting_presets"][brand["lighting_preset"]]
    studio.apply_render_preset(scene, preset)
    studio.build_world(scene, brand, lighting)
    studio.build_floor(brand, lighting)
    focus = Vector((0.0, 0.0, 0.93))
    studio.build_light_rig(lighting, focus)
    tiles = []
    for name, az in (("front", 0), ("three_quarter", 40), ("side", 90), ("back", 180)):
        cam = studio.add_camera(f"EVS_Preview_{name}", focus, az, 4.0, 7.2, focal_length=85.0)
        path = str(out_dir / f"_preview_{name}.png")
        studio.render_still(scene, cam, path, focus)
        tiles.append(path)
    if os.environ.get("EVS_DEBUG_HEAD"):
        head_focus = Vector((0.0, -0.03, 1.66))
        preset["resolution"] = [520, 520]
        studio.apply_render_preset(scene, preset)
        heads = []
        for name, az in (("front", 0), ("three_quarter", 40), ("side", 90)):
            cam = studio.add_camera(f"EVS_Head_{name}", head_focus, az, 4.0, 7.2, focal_length=420.0)
            path = str(out_dir / f"_head_{name}.png")
            studio.render_still(scene, cam, path, head_focus)
            heads.append(path)
        cmd = ["ffmpeg", "-loglevel", "error", "-y"]
        for t in heads:
            cmd += ["-i", t]
        subprocess.run(cmd + ["-filter_complex", "hstack=inputs=3", str(out_dir / "_head_debug.png")], check=True)
        for t in heads:
            os.remove(t)
    sheet = str(out_dir / "character_preview.png")
    cmd = ["ffmpeg", "-loglevel", "error", "-y"]
    for t in tiles:
        cmd += ["-i", t]
    cmd += ["-filter_complex", f"hstack=inputs={len(tiles)}", sheet]
    subprocess.run(cmd, check=True)
    for t in tiles:
        os.remove(t)
    print(f"[evs] preview: {sheet}")


if __name__ == "__main__":
    main()
