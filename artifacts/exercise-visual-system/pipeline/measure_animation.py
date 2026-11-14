"""Prints the movement-gate metrics of an animated exercise (motion kit).

    Blender -b --factory-startup --python pipeline/measure_animation.py -- --exercise bench-press

Samples the deform-bone joints (evs/sampling.JOINTS) on every frame of the
exercise's repetition phases (exercise.json -> movement.rep_phases) and prints
one line `METRICS {json}` with evs/movement_gate.metrics. Used by
pipeline/solve_targets.py; fast (no mesh evaluation)."""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from evs import config, movement_gate  # noqa: E402
from evs.sampling import JOINTS  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--exercise", required=True)
    args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:])
    path = config.exercise_dir(args.exercise)
    exercise = config.exercise_config(args.exercise)
    bpy.ops.wm.open_mainfile(filepath=str(path / exercise["animation_file"]))
    rig = bpy.data.objects[config.character_config()["names"]["armature_object"]]
    scene = bpy.context.scene
    fps = int(exercise["frame_rate"])
    phases = {p["id"]: p for p in exercise["exercise_phases"]}
    rep = [p for p in exercise.get("movement", {}).get("rep_phases", []) if p in phases]
    f0 = int(round(phases[rep[0]]["start_s"] * fps)) if rep else scene.frame_start
    f1 = int(round(phases[rep[-1]]["end_s"] * fps)) if rep else scene.frame_end
    samples = {k: [] for k in JOINTS}
    mw = rig.matrix_world
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        for key, (bone, tail) in JOINTS.items():
            pb = rig.pose.bones[bone]
            samples[key].append(list(mw @ (pb.tail if tail else pb.head)))
    j = {k: np.array(v) for k, v in samples.items()}
    print("METRICS " + json.dumps({k: round(v, 3) for k, v in movement_gate.metrics(j).items()}))


if __name__ == "__main__":
    main()
