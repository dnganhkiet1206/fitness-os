"""Motion Lab validator: generic QA for any generated exercise.

    Blender -b --factory-startup --python pipeline/validate_motion.py -- --exercise dumbbell-curl

Samples the animation once (joints, bone rotations, hand-to-socket
distances, feet, skin stretch at a few frames) and runs evs/motion_qa.py
(stages A-C) and evs/movement_gate.py (stage D). Failures name the frame
and joint. Writes <exercise>/qa_report.json. Thresholds come from
exercise.json -> validation_profile (keys below) with Motion Lab defaults.
The bench press keeps its own, deeper validator (validate_animation.py).
"""

from __future__ import annotations

import argparse
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402

from evs import bl_util, config, motion_qa as Q, movement_gate  # noqa: E402
from evs.sampling import JOINTS  # noqa: E402

DEFAULTS = {"max_joint_speed_m_s": 2.5, "max_frame_to_frame_joint_jump_deg": 12.0, "max_hand_to_socket_m": 0.004,
            "max_foot_slide_m": 0.005, "max_foot_lift_m": 0.005, "max_left_right_position_difference_m": 0.003,
            "max_p999_edge_stretch": 2.6,
            # Whole-body posture (14/11, MOTION_KIT_LESSONS.md): soft-tissue
            # elbow limit ~145 deg (AAOS active range 0-150), straight wrists
            # under load, no elbow folding behind the shoulder line, head not
            # dropped to the chest; no implement inside the skin.
            "max_wrist_bend_deg": 25.0, "max_elbow_flexion_deg": 145.0, "max_elbow_medial_m": 0.02,
            "max_neck_flexion_deg": 30.0, "max_implement_penetration_m": 0.004}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--exercise", required=True)
    args = bl_util.script_args(ap)
    path = config.exercise_dir(args.exercise)
    ex = config.exercise_config(args.exercise)
    prof = {**DEFAULTS, **ex.get("validation_profile", {})}
    names = config.character_config()["names"]
    bpy.ops.wm.open_mainfile(filepath=str(path / ex["animation_file"]))
    scene = bpy.context.scene
    rig, body = bpy.data.objects[names["armature_object"]], bpy.data.objects[names["body_object"]]
    fps = scene.render.fps
    frames = list(range(scene.frame_start, scene.frame_end + 1))
    deform = [b.name for b in rig.data.bones if b.use_deform]
    sockets = {o.name: o for o in bpy.data.objects if o.name.startswith("SOCKET_")}

    joints = {k: [] for k in JOINTS}
    quats = {b: [] for b in deform}
    dist = {s: [] for s in sockets}
    feet = {"foot_l": [], "foot_r": []}
    mw = rig.matrix_world
    for f in frames:
        scene.frame_set(f)
        for k, (bone, tail) in JOINTS.items():
            pb = rig.pose.bones[bone]
            joints[k].append(list(mw @ (pb.tail if tail else pb.head)))
        for b in deform:
            # Evaluated local rotation (after IK and constraints), relative
            # to the evaluated parent: matrix_basis would miss every IK pose.
            pb = rig.pose.bones[b]
            m = pb.parent.matrix.inverted() @ pb.matrix if pb.parent else pb.matrix
            q = m.to_quaternion()
            quats[b].append([q.w, q.x, q.y, q.z])
        for s, obj in sockets.items():
            hand = s.replace("SOCKET_", "")
            wrist = mw @ rig.pose.bones[hand].head
            dist[s].append((wrist - obj.matrix_world.translation).length)
        for k in feet:
            feet[k].append(list(mw @ rig.pose.bones[k].head))
    j = {k: np.array(v) for k, v in joints.items()}

    # Skin stretch at start, quarter, half (mesh evaluation is slow).
    rest = body.data
    edges = np.array([e.vertices[:] for e in rest.edges])
    co0 = np.array([v.co[:] for v in rest.vertices])
    rl = np.linalg.norm(co0[edges[:, 0]] - co0[edges[:, 1]], axis=1)
    stretch = []
    for f in (frames[0], frames[len(frames) // 4], frames[len(frames) // 2]):
        scene.frame_set(f)
        ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ev.to_mesh()
        co = np.array([v.co[:] for v in me.vertices])
        ev.to_mesh_clear()
        r = np.linalg.norm(co[edges[:, 0]] - co[edges[:, 1]], axis=1) / rl
        stretch.append((float(np.percentile(r, 99.9)), f))
    worst_stretch = max(stretch)

    # Implement inside the skin (bar through the neck/traps, dumbbell through
    # the thigh): body vertices behind the nearest implement face, at the
    # same sample frames plus the deepest point of the repetition.
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    ids = [e["id"].capitalize() for e in ex.get("equipment", []) if not any(k in e["id"] for k in ("bench", "rack", "machine"))]
    implements = [o for o in scene.objects if o.type == "MESH" and any(o.name.startswith(i) for i in ids)]
    low = int(np.argmin(j["pelvis"][:, 2]))
    depths = {o.name: [] for o in implements}
    for f in sorted({stretch_f for _s, stretch_f in stretch} | {frames[low]}):
        scene.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        # Implement vertices inside the skin. Tested from the implement's
        # side against the body, whose normals are consistent: implements
        # are built from separate pieces with inner caps, so their own
        # normals cannot say inside/outside (14/11: false 4.9 cm at the
        # throat). Hands are excluded: they close around the handle by design
        # (the grip is checked by hand_implement_contact).
        bm = bmesh.new()
        bm.from_object(body, dg)
        bm.transform(body.matrix_world)
        skin = BVHTree.FromBMesh(bm)
        bm.free()
        wrists = [mw @ rig.pose.bones[h].head for h in ("hand_l", "hand_r")]
        for o in implements:
            me = o.evaluated_get(dg).to_mesh()
            deep = 0.0
            for v in me.vertices:
                p = o.matrix_world @ v.co
                if min((p - w).length for w in wrists) < 0.13:
                    continue
                hit = skin.find_nearest(p, 0.08)
                if hit[0] is not None and (p - hit[0]).dot(hit[1]) < 0:
                    deep = max(deep, hit[3])
            o.evaluated_get(dg).to_mesh_clear()
            depths[o.name].append(deep)

    records = [
        Q.rec("frames", "A", "Animation has frames and finite joint data",
              Q.PASS if len(frames) > 1 and all(np.isfinite(v).all() for v in j.values()) else Q.FAIL, len(frames)),
        Q.joint_speed(j, fps, prof["max_joint_speed_m_s"]),
        Q.rotation_steps(quats, prof["max_frame_to_frame_joint_jump_deg"]),
        Q.contact(dist, prof["max_hand_to_socket_m"]) if dist else Q.rec("hand_implement_contact", "B", "Hands on implements", Q.NOT_TESTED),
        Q.planted(feet, prof["max_foot_slide_m"], prof["max_foot_lift_m"]),
        Q.symmetry(j, prof["max_left_right_position_difference_m"]),
        Q.penetration(depths, prof["max_implement_penetration_m"]) if depths else Q.rec("implement_penetration", "C", "Implements do not pass through the body", Q.NOT_TESTED),
        *Q.posture(j, prof),
        Q.rec("skin_stretch", "C", "Skin stretch stays within limits", Q.PASS if worst_stretch[0] <= prof["max_p999_edge_stretch"] else Q.FAIL,
              round(worst_stretch[0], 3), prof["max_p999_edge_stretch"], {"frame": worst_stretch[1]}, "p99.9 edge stretch"),
    ]
    movement = ex.get("movement", {})
    if movement.get("pattern"):
        patterns = movement_gate.load_patterns(config.CONFIG_DIR / "movement_patterns.json")
        phases = {p["id"]: p for p in ex["exercise_phases"]}
        rep = [p for p in movement.get("rep_phases", []) if p in phases]
        if rep:
            f0, f1 = int(round(phases[rep[0]]["start_s"] * fps)), int(round(phases[rep[-1]]["end_s"] * fps))
            jr = {k: v[f0:f1 + 1] for k, v in j.items()}
        else:
            jr = j
        for r in movement_gate.evaluate(jr, patterns, movement):
            status = Q.PASS if r["pass"] else (Q.REVIEW if r["provisional"] else Q.FAIL)
            records.append(Q.rec(f"movement_{r['metric']}", "D", f"{movement['pattern']}: {r['metric']} inside the family bounds", status,
                                 r["measured"], r["limit"], None, (r["source"] or "provisional bound")))
    report = {"tool": "pipeline/validate_motion.py", "date": datetime.date.today().isoformat(), "exercise_id": ex["exercise_id"],
              "frames": len(frames), "fps": fps, "summary": Q.summary(records), "checks": records}
    config.save_json(path / "qa_report.json", report)
    print("[evs] QA", report["summary"]["counts"])
    for r in records:
        if r["status"] != Q.PASS:
            print(f"[evs]   {r['status']:22s} {r['stage']} {r['id']}: measured {r['measured']} limit {r['limit']} at {r['where']}")


if __name__ == "__main__":
    main()
