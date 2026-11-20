"""Fills ``joint`` + ``offset`` of every technique tip in ``exercise.json`` (``app_demo.tips``),
so the tip's leader line follows the body while the exercise plays (MODULAR_3D_PLAN.md, B1,
17/11).

    Blender -b --factory-startup --python pipeline/tip_anchors.py [-- --exercise dumbbell-shoulder-press]

A tip is written as ``{"id": ..., "anchor": [x, y, z]}``: a point on the skin, metres, Y-up (the
app's world), in the pose of the FIRST frame of the clip. This script reads the joint world
positions of that frame from the very file the app plays (``<id>_motion.usdz``, or the full
USDZ of an older exercise), picks the nearest joint and stores ``offset = anchor - joint``.
The app then draws the tip at ``joint(t) + offset`` on every frame. A tip may name its joint by
hand (``"joint": "spine_03"``) or say ``"fixed": true`` (on equipment that does not move). Blender is only used for
its bundled OpenUSD (``pxr``). Text of the tips stays in Localizable.xcstrings
(``eg.demo3d.tip.<id>*``), checked by the i18n gates.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np  # noqa: E402
from pxr import Usd, UsdGeom, UsdSkel  # noqa: E402

from evs import bl_util  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT.parent.parent / "apps" / "ios" / "ASCND" / "Resources" / "ExerciseDemos"


def first_frame_joints(usdz: Path) -> tuple[list[str], np.ndarray]:
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(usdz) as z:
            z.extractall(tmp)
            root = next(n for n in z.namelist() if n.endswith((".usdc", ".usda")))
        stage = Usd.Stage.Open(str(Path(tmp) / root))
        cache = UsdSkel.Cache()
        for prim in stage.Traverse():
            if not prim.IsA(UsdSkel.Skeleton):
                continue
            query = cache.GetSkelQuery(UsdSkel.Skeleton(prim))
            anim = query.GetAnimQuery()
            samples = anim.GetJointTransformTimeSamples() if anim else []
            time = Usd.TimeCode(samples[0]) if samples else Usd.TimeCode.Default()
            xf = UsdGeom.XformCache(time)
            world = query.ComputeJointWorldTransforms(xf)
            names = [str(j) for j in query.GetJointOrder()]
            pos = np.array([[m[3][0], m[3][1], m[3][2]] for m in world], dtype=np.float64)
            return names, pos
    raise RuntimeError(f"no skeleton in {usdz}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exercise", help="folder name; default every exercise with app_demo.tips")
    parser.add_argument("--app", default=str(APP))
    args = bl_util.script_args(parser)
    app = Path(args.app)
    for ex_dir in sorted(p for p in ROOT.iterdir() if (p / "exercise.json").exists()):
        if args.exercise and ex_dir.name != args.exercise:
            continue
        path = ex_dir / "exercise.json"
        raw = path.read_text()
        exercise = json.loads(raw)
        demo = exercise.get("app_demo") or {}
        tips = demo.get("tips") or []
        if not tips:
            continue
        prefix = ex_dir.name.replace("-", "_")
        usdz = app / f"{prefix}_motion.usdz"
        if not usdz.exists():
            usdz = app / f"{demo.get('usdz', prefix + '_animation')}.usdz"
        names, pos = first_frame_joints(usdz)
        short = [n.split("/")[-1] for n in names]
        for tip in tips:
            anchor = np.asarray(tip["anchor"], dtype=np.float64)
            if tip.get("fixed"):
                # On equipment that does not move (the bench pad): stays at ``anchor``.
                tip.pop("joint", None)
                tip.pop("offset", None)
                print(f"[tips] {ex_dir.name} {tip['id']:16s} -> fixed")
                continue
            wanted = (tip.get("joint") or "").split("/")[-1]
            if wanted in short:
                i = short.index(wanted)  # joint chosen by hand (short or full name)
            else:
                i = int(np.argmin(np.linalg.norm(pos - anchor, axis=1)))
            tip["joint"] = names[i]
            tip["offset"] = [round(float(v), 4) for v in anchor - pos[i]]
            print(f"[tips] {ex_dir.name} {tip['id']:16s} -> {names[i].split('/')[-1]:20s} "
                  f"offset {np.linalg.norm(anchor - pos[i]):.3f} m")
        path.write_text(json.dumps(exercise, ensure_ascii=False, indent=2) + ("\n" if raw.endswith("\n") else ""))


if __name__ == "__main__":
    main()
