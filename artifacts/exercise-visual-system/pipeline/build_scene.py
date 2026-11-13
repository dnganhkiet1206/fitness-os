"""Builds the scene of one exercise from reusable parts and saves it without
animation: master character (appended, never rebuilt), brand materials, the
exercise's muscle highlight map, equipment, studio, cameras.

    Blender -b --factory-startup --python pipeline/build_scene.py -- --exercise bench-press

Writes <exercise>/_scene.blend, which the exercise's animate script opens."""

from __future__ import annotations

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

from evs import bl_util, config, scene as evs_scene  # noqa: E402


def main(exercise_name: str | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exercise", default=exercise_name, required=exercise_name is None)
    args = bl_util.script_args(parser)

    t0 = time.time()
    exercise_path = config.exercise_dir(args.exercise)
    exercise = config.exercise_config(args.exercise)
    brand = config.brand_config()
    if exercise["brand_profile_id"] != brand["brand_profile_id"]:
        print(f"[evs] note: exercise names brand profile {exercise['brand_profile_id']!r}, rendering with {brand['brand_profile_id']!r}")

    scene = bl_util.reset_scene()
    scene.name = exercise["exercise_id"]
    character = evs_scene.append_character(exercise["master_character_id"])
    mats = evs_scene.apply_brand_materials(character, brand)
    highlight = evs_scene.apply_highlight(mats, exercise, exercise_path)
    built = evs_scene.build_equipment(exercise, brand)
    floor = evs_scene.build_studio(scene, exercise, brand)
    print(f"[evs] floor levels measured: lit {floor['lit_level']}, in key-light shadow {floor['shadow_level']}")
    frames = evs_scene.set_timeline(scene, exercise)

    scene["evs_exercise_id"] = exercise["exercise_id"]
    scene["evs_master_character_id"] = exercise["master_character_id"]
    scene["evs_brand_profile_id"] = brand["brand_profile_id"]
    for key, item in built.items():
        for k, v in item.items():
            if isinstance(v, (int, float)):
                scene[f"evs_{key}_{k}"] = float(v)
        if "racked_bar_center" in item:
            scene[f"evs_{key}_racked_bar_center"] = list(item["racked_bar_center"])

    out = exercise_path / "_scene.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    print(f"[evs] scene built in {time.time() - t0:.1f}s: {out}")
    print(f"[evs] timeline 0..{frames} at {scene.render.fps} fps, highlight map {highlight.name}")
    print(f"[evs] objects: {sorted(o.name for o in bpy.data.objects)}")


if __name__ == "__main__":
    main()
