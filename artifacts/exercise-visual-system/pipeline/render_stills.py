"""Renders vertical 9:16 stills of one exercise for visual review: the same
camera fit as the in-app USDZ viewer default (preset refitted for a 9:16
frame), at key frames of the repetition. The source .blend is never saved.

    Blender -b --factory-startup --python pipeline/render_stills.py -- \\
        --exercise bench-press --out-dir /tmp/stills
    Blender -b --factory-startup --python pipeline/render_stills.py -- \\
        --exercise bench-press --out-dir /tmp/stills --shots "front:120:bottom"

Default shots mirror the first 360-degree review (13/11): three-quarter at
the start position, the bottom and lockout, plus the front view at the
bottom, so re-renders compare frame-for-frame. The camera fit samples the
same three poses as pipeline/export_usdz.py (rack, start, bottom), so the
stills show exactly what the app's default view frames.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

from evs import config, studio  # noqa: E402

DEFAULT_SHOTS = "three_quarter:60:start,120:bottom,180:lockout front:120:bottom"
SHORT = {"three_quarter": "3q", "front": "front", "side": "side", "closeup_grip": "closeup"}


def sample_subject_points(scene, frame_numbers, skip_names=("EVS_Floor",)):
    """World-space mesh vertices at the given frames (mirrors
    pipeline/export_usdz.py)."""
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


def fit_camera(scene, exercise, preset_key, aspect):
    """A temp camera on the preset's azimuth/elevation/lens, refitted so the
    whole repetition stays in a frame of the given aspect."""
    presets = config.camera_presets()
    preset = presets["presets"][preset_key]
    sensor_mm = presets["sensor_width_mm"]
    fps = int(exercise["frame_rate"])
    phases = {p["id"]: p for p in exercise["exercise_phases"]}
    frames = [0]
    for name in ("start_position", "bottom"):
        phase = phases.get(name)
        if phase is not None:
            frames.append(int(round(phase["start_s"] * fps)))
    points = sample_subject_points(scene, frames)
    focus, distance = studio.fit_view(points, preset["azimuth_deg"], preset["elevation_deg"],
                                      preset["focal_length_mm"], sensor_mm, aspect, preset["margin"])
    cam = studio.add_camera(f"EVS_Still_{preset_key}", focus, preset["azimuth_deg"],
                            preset["elevation_deg"], distance, preset["focal_length_mm"])
    cam.data.sensor_width = sensor_mm
    # fit_view assumes a horizontal sensor fit (vertical FOV from the aspect
    # ratio). Blender's default AUTO fit switches to vertical in portrait
    # frames, which would crop the subject horizontally.
    cam.data.sensor_fit = "HORIZONTAL"
    return cam, focus


def parse_shots(text: str) -> dict[str, list[tuple[int, str]]]:
    shots: dict[str, list[tuple[int, str]]] = {}
    for part in text.split():
        key, _, frames = part.partition(":")
        shots[key] = [(int(f.split(":")[0]), f.split(":")[1]) for f in frames.split(",")]
    return shots


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exercise", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--shots", default=DEFAULT_SHOTS)
    parser.add_argument("--width", type=int, default=720)
    parser.add_argument("--height", type=int, default=1280)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])

    exercise_path = config.exercise_dir(args.exercise)
    exercise = config.exercise_config(args.exercise)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=str(exercise_path / exercise["animation_file"]))
    scene = bpy.context.scene
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.resolution_percentage = 100
    aspect = args.width / args.height

    for preset_key, frames in parse_shots(args.shots).items():
        cam, focus = fit_camera(scene, exercise, preset_key, aspect)
        for frame, label in frames:
            scene.frame_set(frame)
            path = out_dir / f"still_{SHORT.get(preset_key, preset_key)}_{label}.png"
            studio.render_still(scene, cam, str(path), focus)
            print(f"[evs] still: {path} (frame {frame})")


if __name__ == "__main__":
    main()
