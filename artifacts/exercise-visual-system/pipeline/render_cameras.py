"""Renders an exercise from every camera preset and encodes the videos.

    Blender -b --factory-startup --python pipeline/render_cameras.py -- --exercise bench-press            # everything
    Blender -b --factory-startup --python pipeline/render_cameras.py -- --exercise bench-press --stills   # key frames only

All cameras render the same .blend on the same timeline, one after another.
Outputs in the exercise folder:

    <id>_<camera>.mp4          the whole clip, one file per camera
    <id>_<camera>_loop.mp4     one repetition that loops (cut from the same frames)
    <id>_preview.png           hero still (45-degree camera)
    camera_comparison.png      every camera at the same frames, side by side
    render_metadata.json       settings, timings, ffprobe results, file hashes
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

from evs import PIPELINE_VERSION, bl_util, config, render  # noqa: E402


def main(exercise_name: str | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exercise", default=exercise_name, required=exercise_name is None)
    parser.add_argument("--stills", action="store_true", help="only the comparison sheet and the preview still")
    parser.add_argument("--cameras", default="", help="comma-separated preset names (default: all in exercise.json)")
    parser.add_argument("--keep-frames", action="store_true")
    args = bl_util.script_args(parser)

    exercise_path = config.exercise_dir(args.exercise)
    exercise = config.exercise_config(args.exercise)
    brand = config.brand_config()
    presets = config.render_presets()
    preset = presets["render_presets"][brand["render_preset"]]
    prefix = exercise_path.name.replace("-", "_")

    bpy.ops.wm.open_mainfile(filepath=str(exercise_path / exercise["animation_file"]))
    scene = bpy.context.scene
    fps = scene.render.fps
    cameras = render.camera_objects(scene, exercise)
    if args.cameras:
        cameras = {k: v for k, v in cameras.items() if k in args.cameras.split(",")}
    phase = {p["id"]: p for p in exercise["exercise_phases"]}

    def frame(seconds: float) -> int:
        return int(round(seconds * fps))

    # Frames shown side by side: racked, lockout, half-way down, bottom, half-way up.
    ecc, con = phase["eccentric"], phase["concentric"]
    sheet_frames = [0, frame(ecc["start_s"]), frame(0.5 * (ecc["start_s"] + ecc["end_s"])), frame(ecc["end_s"]),
                    frame(0.5 * (con["start_s"] + con["end_s"]))]
    work = render.work_dir(exercise["exercise_id"])
    t_start = time.time()

    stills = {}
    for key, cam in cameras.items():
        d = work / f"stills_{key}"
        render.render_frames(scene, cam, sheet_frames, d)
        stills[key] = [d / f"{f:04d}.png" for f in sheet_frames]
    main_keys = [k for k in cameras if "follow" not in config.camera_presets()["presets"][k]]
    render.contact_sheet([stills[k] for k in main_keys], exercise_path / "camera_comparison.png", tile_width=512)
    hero = "three_quarter" if "three_quarter" in stills else next(iter(stills))
    shutil.copyfile(stills[hero][2], exercise_path / f"{prefix}_preview.png")
    print(f"[evs] stills for {list(cameras)} at frames {sheet_frames} in {time.time() - t_start:.1f}s")
    if args.stills:
        if os.environ.get("EVS_DEBUG_STILLS"):
            for key, paths in stills.items():
                for p in paths:
                    shutil.copyfile(p, exercise_path / f"_still_{key}_{p.stem}.png")
        return

    loop = exercise.get("loop_segment")
    all_frames = list(range(scene.frame_start, scene.frame_end + 1))
    outputs = {}
    for key, cam in cameras.items():
        suffix = cam["evs_file_suffix"]
        frames_dir = work / f"frames_{suffix}"
        timing = render.render_frames(scene, cam, all_frames, frames_dir)
        full = exercise_path / f"{prefix}_{suffix}.mp4"
        render.encode_mp4(frames_dir, scene.frame_start, len(all_frames), fps, full, preset["video"], brand)
        entry = {"camera": cam.name, "preset": key, "render": timing, "file": full.name, "probe": render.probe(full),
                 "sha256": config.sha256_file(full)}
        if loop:
            # The last frame of the loop equals the first, so it is left out.
            f0 = frame(phase[loop["from_phase"]]["start_s"])
            f1 = frame(phase[loop["to_phase"]]["end_s"])
            looped = exercise_path / f"{prefix}_{suffix}_loop.mp4"
            render.encode_mp4(frames_dir, f0, f1 - f0, fps, looped, preset["video"], brand)
            entry["loop"] = {"file": looped.name, "first_frame": f0, "frame_count": f1 - f0, "probe": render.probe(looped),
                             "sha256": config.sha256_file(looped)}
        outputs[key] = entry
        print(f"[evs] {full.name}: {timing['frames']} frames in {timing['seconds']}s, {entry['probe']['size_bytes']} bytes")
        if not args.keep_frames:
            render.remove_dir(frames_dir)

    metadata = {
        "pipeline_version": PIPELINE_VERSION,
        "exercise_id": exercise["exercise_id"],
        "master_character_id": exercise["master_character_id"],
        "brand_profile_id": brand["brand_profile_id"],
        "source_blend": exercise["animation_file"],
        "source_blend_sha256": config.sha256_file(exercise_path / exercise["animation_file"]),
        "blender_version": bpy.app.version_string,
        "render_preset": brand["render_preset"],
        "engine": scene.render.engine,
        "resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "frame_rate": fps,
        "frame_range": [scene.frame_start, scene.frame_end],
        "taa_render_samples": scene.eevee.taa_render_samples,
        "view_transform": scene.view_settings.view_transform,
        "lighting_preset": brand["lighting_preset"],
        "watermark_enabled": bool(brand["watermark"]["enabled"]),
        "camera_sync": "All cameras render the same scene and frame numbers; only the active camera differs.",
        "comparison_frames": sheet_frames,
        "outputs": outputs,
        "stills": {"comparison": "camera_comparison.png", "preview": f"{prefix}_preview.png"},
        "total_seconds": round(time.time() - t_start, 1),
    }
    config.save_json(exercise_path / "render_metadata.json", metadata)
    if not args.keep_frames:
        render.remove_dir(work)
    print(f"[evs] render finished in {metadata['total_seconds']}s")


if __name__ == "__main__":
    main()
