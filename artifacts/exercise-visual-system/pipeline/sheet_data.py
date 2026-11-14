"""Sample joint angles at given frames for the review-sheet overlay.

    Blender -b --factory-startup --python pipeline/sheet_data.py -- \\
        --exercise back-squat --frames 0,38,62 --out _sheet/angles.json

Opens the exercise .blend, samples the joint positions at each listed
frame (the same JOINTS mapping as pipeline/validate_motion.py) and writes
evs/movement_gate.metrics per frame. The factory overlays these numbers on
the review sheet so a reviewer sees the measured angles on the picture
instead of opening a report. Whole-clip metrics (hip_drop_m, root_rise_m,
wrist_travel_m) are meaningless for a single frame and are dropped. The
source .blend is never saved.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from evs import bl_util, config, movement_gate  # noqa: E402
from evs.sampling import JOINTS  # noqa: E402

DROP = ("hip_drop_m", "root_rise_m", "wrist_travel_m")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--exercise", required=True)
    ap.add_argument("--frames", required=True, help="comma-separated scene frame numbers")
    ap.add_argument("--out", required=True)
    args = bl_util.script_args(ap)
    path = config.exercise_dir(args.exercise)
    ex = config.exercise_config(args.exercise)
    names = config.character_config()["names"]
    bpy.ops.wm.open_mainfile(filepath=str(path / ex["animation_file"]))
    scene = bpy.context.scene
    rig = bpy.data.objects[names["armature_object"]]
    mw = rig.matrix_world
    frames = [int(f) for f in args.frames.split(",") if f.strip() != ""]
    out = []
    for f in frames:
        scene.frame_set(f)
        j = {}
        for k, (bone, tail) in JOINTS.items():
            pb = rig.pose.bones[bone]
            j[k] = np.array([list(mw @ (pb.tail if tail else pb.head))])
        metrics = {k: v for k, v in movement_gate.metrics(j).items() if k not in DROP}
        out.append({"frame": f, "metrics": metrics})
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"exercise": args.exercise, "frames": out}, indent=2) + "\n", encoding="utf-8")
    print(f"[evs] sheet angles: {len(out)} frames -> {out_path}")


if __name__ == "__main__":
    main()
