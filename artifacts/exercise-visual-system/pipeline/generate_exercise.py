"""Motion Lab generator: exercise spec -> animated rig, no per-exercise script.

    Blender -b --factory-startup --python pipeline/build_scene.py -- --exercise dumbbell-curl
    Blender -b --factory-startup --python pipeline/generate_exercise.py -- --exercise dumbbell-curl

Reads <exercise>/exercise.json:
  movement.template   family template in motionlab/families (e.g. "curl")
  tempo               phase durations and reps (motionlab/timing.py)
  technique           template parameters (defaults in the template)
  equipment           implements to hold (built by build_scene.py)

Opens <exercise>/_scene.blend, measures the character's rest skeleton,
asks the template for per-frame targets, and keys them: implements move
along their computed path, hands follow sockets on the implements (IK),
elbow and knee poles point where the template says, feet stay planted. The
phase timeline is written back into exercise.json (exercise_phases) so the
validator, the cameras and the viewer share one timeline. Every camera in
camera_presets watches the same animation.

Writes <exercise>/<animation_file> and motion_metadata.json.
"""

from __future__ import annotations

import argparse
import datetime
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from evs import PIPELINE_VERSION, bl_util, config, rig as evs_rig, scene as evs_scene  # noqa: E402
from motionlab import FAMILIES, families, timing  # noqa: E402,F401


def rest_skeleton(rig) -> dict:
    head = lambda b: np.array(evs_rig.bone_head_world(rig, b))  # noqa: E731
    sk = {}
    for s in ("l", "r"):
        sk[f"shoulder_{s}"] = head(f"upperarm_{s}")
        sk[f"elbow_{s}"] = head(f"lowerarm_{s}")
        sk[f"wrist_{s}"] = head(f"hand_{s}")
        sk[f"hip_{s}"] = head(f"thigh_{s}")
        sk[f"knee_{s}"] = head(f"calf_{s}")
        sk[f"ankle_{s}"] = head(f"foot_{s}")
    sk["upper_arm_m"] = float(np.linalg.norm(sk["elbow_l"] - sk["shoulder_l"]))
    sk["forearm_m"] = float(np.linalg.norm(sk["wrist_l"] - sk["elbow_l"]))
    sk["thigh_m"] = float(np.linalg.norm(sk["knee_l"] - sk["hip_l"]))
    sk["shin_m"] = float(np.linalg.norm(sk["ankle_l"] - sk["knee_l"]))
    return sk


def to_matrix(m: np.ndarray) -> Matrix:
    return Matrix([list(r) for r in m])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--exercise", required=True)
    args = bl_util.script_args(ap)
    path = config.exercise_dir(args.exercise)
    exercise = config.exercise_config(args.exercise)
    names = config.character_config()["names"]
    grip_cfg = config.character_config()["grip"]
    fps = int(exercise["frame_rate"])

    bpy.ops.wm.open_mainfile(filepath=str(path / "_scene.blend"))
    scene = bpy.context.scene
    rig = bpy.data.objects[names["armature_object"]]
    scene.frame_set(0)
    sk = rest_skeleton(rig)

    template = FAMILIES[exercise["movement"]["template"]](exercise.get("technique", {}), sk)
    phases = timing.build(exercise["tempo"])
    end_frame = int(math.ceil(timing.duration(phases) * fps))
    scene.frame_start, scene.frame_end = 0, end_frame

    # Phases -> exercise.json, so every tool reads the same timeline.
    exercise["exercise_phases"] = timing.exercise_phases(phases, exercise.get("phase_cues"))
    exercise["animation_duration"] = round(timing.duration(phases), 3)
    config.save_json(path / "exercise.json", exercise)

    # Feet planted, knees forward.
    for key, v in template.static().items():
        if "position" in v:
            side = key[-1]
            rest = rig.data.bones[f"foot_{side}"].matrix_local
            world = Matrix.Rotation(math.radians(v["toe_out_deg"]), 4, "Z") @ rest.to_3x3().to_4x4()
            world.translation = Vector(v["position"])
            evs_rig.set_control_world(rig, key, rig.matrix_world @ world)
        if "pole" in v:
            evs_rig.set_pole_world(rig, key, Vector(v["pole"]))
    for side in ("l", "r"):
        rig[f"ik_leg_{side}"] = 1.0
        rig[f"ik_arm_{side}"] = 1.0

    # Hands on the implements: a socket per hand in the implement's frame
    # (X = handle axis, +Y = where the palm faces), the character's
    # standard closed grip.
    sockets, socket_local = {}, {}
    for item in exercise["equipment"]:
        hand = item.get("held_by")
        if not hand:
            continue
        obj = bpy.data.objects[item["id"].capitalize()]
        obj.rotation_mode = "QUATERNION"
        local = evs_rig.hand_matrix_for_grip(rig, hand, grip_cfg, bar_point=Vector((0, 0, 0)),
                                             bar_axis=Vector((-1, 0, 0)), palm_normal=Vector((0, 1, 0)))
        socket = evs_rig.add_socket(obj, f"hand_{hand}", local)
        evs_rig.attach_control(rig, f"ctl_hand_{hand}", socket)
        rig[f"grip_{hand}"] = 1.0
        sockets[item["id"]] = obj
        socket_local[item["id"]] = local

    # Per-frame targets.
    trace = []
    for f in range(0, end_frame + 1):
        p = timing.progress_at(phases, f / fps)
        fr = template.frame(p)
        scene.frame_set(f)
        for key, m in fr["implements"].items():
            obj = sockets[key]
            mw = to_matrix(m)
            wrist = fr.get("wrists", {}).get(key)
            if wrist is not None:
                # Place the implement so the hand socket's wrist lands exactly
                # on the template's wrist: the template knows the arm, the
                # socket knows the hand.
                local = socket_local[key].translation
                mw.translation = Vector(wrist) - mw.to_3x3() @ local
            obj.matrix_world = mw
            obj.keyframe_insert("location", frame=f)
            obj.keyframe_insert("rotation_quaternion", frame=f)
        for key, point in fr["poles"].items():
            evs_rig.set_pole_world(rig, key, Vector(point))
            rig.pose.bones[key].keyframe_insert("location", frame=f)
        trace.append({"frame": f, "progress": round(p, 4), **{k: round(float(v), 3) for k, v in fr["metrics"].items() if np.isscalar(v)}})

    # Cameras: every preset frames the whole repetition, all on one timeline.
    pts = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for f in (0, int(end_frame * 0.25), int(end_frame * 0.5)):
        scene.frame_set(f)
        depsgraph.update()
        for obj in scene.objects:
            if obj.type == "MESH" and not obj.name.startswith("EVS_Floor"):
                me = obj.evaluated_get(depsgraph).to_mesh()
                pts.extend(list(obj.matrix_world @ me.vertices[i].co) for i in range(0, len(me.vertices), 9))
                obj.evaluated_get(depsgraph).to_mesh_clear()
    cameras = evs_scene.build_cameras(scene, exercise, np.array(pts))
    scene.camera = cameras[exercise["camera_presets"][0]]
    scene.frame_set(0)

    out = path / exercise["animation_file"]
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    config.save_json(path / "motion_metadata.json", {
        "pipeline_version": PIPELINE_VERSION, "generator": "pipeline/generate_exercise.py",
        "template": exercise["movement"]["template"], "generated": datetime.date.today().isoformat(),
        "exercise_id": exercise["exercise_id"], "frame_rate": fps, "frame_end": end_frame,
        "phases": exercise["exercise_phases"], "technique": template.t, "skeleton": {k: (v.tolist() if hasattr(v, "tolist") else v) for k, v in sk.items()},
        "trace_every_6_frames": trace[::6]})
    print(f"[evs] generated {exercise['exercise_id']} with template {exercise['movement']['template']}: frames 0..{end_frame} -> {out}")


if __name__ == "__main__":
    main()
