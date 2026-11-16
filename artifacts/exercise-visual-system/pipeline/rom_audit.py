"""Range-of-motion audit of the master character (Kiệt 15/11: "làm thêm xương
cho toàn bộ các hướng cơ để chuyển động của charactor chính xác hơn cho các
bài tương lai").

    Blender -b <character.blend> --python pipeline/rom_audit.py -- <out_dir>

Puts every joint through its end range (shoulder, elbow, wrist, spine, neck,
shrug, hip, knee, ankle, deep squat) with the IK controls muted, so the
deform bones move directly; helper-bone constraints stay on. For each pose
it measures the skin (cage mesh, no subdivision) against the rest pose:

* stretch: p99.9 and max edge-length ratio, and the bone pairs where the
  worst edges sit;
* squash: edges shorter than 0.35 of rest (skin collapsing into a fold);

and writes rom_audit.json plus a contact sheet of every pose (front and
side) for the eye check. Ranges are typical adult active ranges (AAOS /
Norkin & White): shoulder flexion 170, abduction 170, extension 50, elbow
flexion 145, wrist flexion 80 / extension 70, hip flexion 120, extension 20,
abduction 45, knee flexion 135, ankle dorsiflexion 20 / plantarflexion 45,
spine flexion ~60 over the lumbar/thoracic bones, neck flexion 45.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from evs import config  # noqa: E402

X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
FWD, UP = Vector((0, -1, 0)), Vector((0, 0, 1))

# (bone, world axis, degrees, direction the bone tail should move toward).
# Sides are mirrored for the right: x of the axis and target flips sign.
POSES = {
    # Scapulohumeral rhythm (Inman 1944): about 2:1 glenohumeral to
    # scapulothoracic, so the clavicle rises and the scapula rotates upward
    # with the arm (evs primitives.scapulohumeral uses the same split).
    "shoulder_flexion": [("clavicle", Y, 15, UP), ("scapula", Y, 30, UP), ("upperarm", X, 110, FWD + UP)],
    "shoulder_abduction": [("clavicle", Y, 15, UP), ("scapula", Y, 30, UP), ("upperarm", Y, 90, UP)],
    # Bar on the back (squat), overhead press start: arm out to the side,
    # elbow bent, forearm turned up and back (external rotation ~85 deg).
    # 16/11: missing here, so the shoulder ballooned in the squat unseen.
    "shoulder_external_rotation": [("clavicle", Y, 10, UP), ("scapula", Y, 20, UP), ("upperarm", Y, 75, UP),
                                   ("lowerarm", "local_x", 90, FWD), ("upperarm", "local_y", 85, "child_up")],
    "shoulder_extension": [("upperarm", X, 45, -FWD)],
    "arm_across_chest": [("upperarm", X, 70, FWD), ("upperarm", Z, 45, "in")],
    "elbow_flexion": [("lowerarm", "local_x", 140, "to_shoulder")],
    "wrist_flexion": [("hand", "local_x", 75, -FWD)],
    "wrist_extension": [("hand", "local_x", 65, FWD)],
    "shrug": [("clavicle", Y, 18, UP)],
    "hip_flexion": [("thigh", X, 115, FWD), ("calf", X, 110, -FWD)],
    "hip_extension": [("thigh", X, 20, -FWD)],
    "hip_abduction": [("thigh", Y, 40, "out")],
    "knee_flexion": [("calf", X, 135, -FWD)],
    "deep_squat": [("thigh", X, 120, FWD), ("calf", X, 135, -FWD), ("foot", X, 20, UP)],
    "ankle_plantarflexion": [("foot", X, 40, -UP)],
    "spine_flexion": [("spine_01", X, 18, FWD), ("spine_02", X, 18, FWD), ("spine_03", X, 18, FWD)],
    "spine_extension": [("spine_01", X, 10, -FWD), ("spine_02", X, 10, -FWD), ("spine_03", X, 10, -FWD)],
    "spine_side_bend": [("spine_01", Y, 10, None), ("spine_02", Y, 10, None), ("spine_03", Y, 10, None)],
    "spine_rotation": [("spine_01", Z, 12, None), ("spine_02", Z, 12, None), ("spine_03", Z, 12, None)],
    "neck_flexion": [("neck_01", X, 25, FWD), ("head", X, 20, FWD)],
    "neck_rotation": [("neck_01", Z, 35, None), ("head", Z, 35, None)],
}
SIDED = {"upperarm", "lowerarm", "hand", "clavicle", "scapula", "thigh", "calf", "foot"}
# Close-up camera per pose: (bone to frame, view azimuth, distance).
FOCUS = {"shoulder_external_rotation": ("upperarm_l", 20, 1.3), "shoulder_flexion": ("upperarm_l", 60, 1.3), "shoulder_abduction": ("upperarm_l", 150, 1.3),
         "shoulder_extension": ("upperarm_l", 90, 1.3), "arm_across_chest": ("upperarm_l", 20, 1.3),
         "elbow_flexion": ("lowerarm_l", 70, 1.0), "wrist_flexion": ("hand_l", 60, 0.8), "wrist_extension": ("hand_l", 60, 0.8),
         "shrug": ("neck_01", 160, 1.2), "hip_flexion": ("thigh_l", 70, 1.6), "hip_extension": ("thigh_l", 120, 1.6),
         "hip_abduction": ("pelvis", 0, 1.8), "knee_flexion": ("calf_l", 90, 1.3), "deep_squat": ("pelvis", 45, 2.2),
         "ankle_plantarflexion": ("foot_l", 80, 0.9), "spine_flexion": ("spine_02", 90, 1.8), "spine_extension": ("spine_02", 90, 1.8),
         "spine_side_bend": ("spine_02", 0, 1.8), "spine_rotation": ("spine_02", 30, 1.8), "neck_flexion": ("neck_01", 90, 1.0),
         "neck_rotation": ("neck_01", 20, 1.0)}


def mute_ik(rig) -> None:
    """Mute everything that drives deform bones from the controls (IK,
    Copy Rotation/Transforms from ctl_ bones, grip); keep the helper and
    twist bones' own Copy Rotation, which follow deform bones."""
    for pb in rig.pose.bones:
        for c in pb.constraints:
            sub = getattr(c, "subtarget", "") or ""
            # Helper bones follow deform bones with Copy Rotation or, for the
            # upper-arm swing bone, Damped Track to the elbow (PR #909 review:
            # muting it froze the swing bone, so the audit missed the skin).
            if c.type not in ("COPY_ROTATION", "DAMPED_TRACK") or sub.startswith(("ctl_", "mch_")):
                c.mute = True


def rest_pose(rig) -> None:
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def rotate(rig, name: str, axis, deg: float, toward, side_sign: float) -> None:
    """Rotates bone ``name`` by ``deg`` about a world ``axis`` through its head
    (or its own local X, the hinge axis of the elbow and wrist). With a
    ``toward`` direction the sign is chosen so the bone tail moves that way,
    which mirrors the right side automatically; without one the angle is used
    as given (midline bones)."""
    pb = rig.pose.bones[name]
    mw = rig.matrix_world
    head, tail = mw @ pb.head, mw @ pb.tail
    if axis in ("local_x", "local_y"):
        ax = (mw.to_3x3() @ pb.matrix.to_3x3() @ (X if axis == "local_x" else Vector((0.0, 1.0, 0.0)))).normalized()
    else:
        ax = Vector(axis)
    sign = 1.0
    if toward is not None:
        if toward == "to_shoulder":
            want = ((mw @ pb.parent.head) - tail).normalized()
        elif toward == "child_up":
            want = Vector((0.0, 0.0, 1.0))
        elif toward in ("out", "in"):
            want = Vector((side_sign if toward == "out" else -side_sign, 0.0, 0.0))
        else:
            want = Vector((toward.x * side_sign, toward.y, toward.z)).normalized()
        if toward == "child_up":
            # Twist about the bone's own axis: judge by the child's tail
            # (the forearm) moving up.
            want = Vector((0.0, 0.0, 1.0))
            tail = mw @ next(c for c in pb.children if c.name.startswith(("lowerarm", "calf"))).tail
        probe = Matrix.Rotation(math.radians(5.0), 3, ax) @ (tail - head)
        sign = 1.0 if (probe - (tail - head)).dot(want) >= 0 else -1.0
    rot = Matrix.Translation(head) @ Matrix.Rotation(math.radians(deg * sign), 4, ax) @ Matrix.Translation(-head)
    pb.matrix = mw.inverted() @ rot @ mw @ pb.matrix
    bpy.context.view_layer.update()


def measure(body, edges, rest_len, names_top) -> dict:
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    co = np.array([v.co[:] for v in me.vertices])[: len(body.data.vertices)]
    ev.to_mesh_clear()
    r = np.linalg.norm(co[edges[:, 0]] - co[edges[:, 1]], axis=1) / rest_len
    worst = Counter()
    for i in np.argsort(-r)[:40]:
        a, b = edges[i]
        worst["/".join(sorted({names_top[a], names_top[b]}))] += 1
    squash = Counter()
    for i in np.where(r < 0.35)[0]:
        a, b = edges[i]
        squash["/".join(sorted({names_top[a], names_top[b]}))] += 1
    return {"p999": round(float(np.percentile(r, 99.9)), 3), "max": round(float(r.max()), 2),
            "squash_edges": int((r < 0.35).sum()), "worst_regions": worst.most_common(4),
            "squash_regions": squash.most_common(4)}


def main() -> None:
    out_dir = sys.argv[sys.argv.index("--") + 1]
    os.makedirs(out_dir, exist_ok=True)
    cfg = config.character_config()
    body = bpy.data.objects[cfg["names"]["body_object"]]
    rig = bpy.data.objects[cfg["names"]["armature_object"]]
    for m in body.modifiers:
        if m.type == "SUBSURF":
            m.show_viewport = False
    mute_ik(rig)
    rest_pose(rig)
    edges = np.array([e.vertices[:] for e in body.data.edges])
    co0 = np.array([v.co[:] for v in body.data.vertices])
    rest_len = np.linalg.norm(co0[edges[:, 0]] - co0[edges[:, 1]], axis=1)
    gnames = {g.index: g.name for g in body.vertex_groups}
    top = []
    for v in body.data.vertices:
        gs = sorted(((g.weight, gnames[g.group]) for g in v.groups), reverse=True)
        top.append(gs[0][1] if gs else "-")

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x, scene.render.resolution_y = 360, 360
    cam_data = bpy.data.cameras.new("rom")
    cam_data.lens = 50
    cam = bpy.data.objects.new("rom", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    results, tiles = {}, []
    only = [x for x in os.environ.get("ROM_ONLY", "").split(",") if x]
    for pose, moves in POSES.items():
        if only and pose not in only:
            continue
        rest_pose(rig)
        for side, sgn in (("l", 1.0), ("r", -1.0)):
            for bone, axis, deg, toward in moves:
                name = f"{bone}_{side}" if bone in SIDED else bone
                if bone not in SIDED and side == "r":
                    continue
                rotate(rig, name, axis, deg, toward, sgn)
        results[pose] = measure(body, edges, rest_len, top)
        print(f"[rom] {pose:22s} p99.9 {results[pose]['p999']:.2f} max {results[pose]['max']:.1f} "
              f"squash {results[pose]['squash_edges']} {results[pose]['worst_regions'][:2]}")
        bone, az, dist = FOCUS[pose]
        focus = rig.matrix_world @ rig.pose.bones[bone].head
        for k, daz in enumerate((0, 50)):
            a = math.radians(az + daz)
            cam.location = focus + Vector((math.sin(a), -math.cos(a), 0.15)) * dist
            cam.rotation_euler = (focus - cam.location).to_track_quat("-Z", "Y").to_euler()
            path = os.path.join(out_dir, f"_{pose}_{k}.png")
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            tiles.append(path)
    rest_pose(rig)
    with open(os.path.join(out_dir, "rom_audit.json"), "w") as f:
        json.dump(results, f, indent=1)
    # Contact sheet: one row per 5 poses (front+side each).
    per_row = min(10, len(tiles))
    rows = []
    for i in range(0, len(tiles), per_row):
        chunk = tiles[i:i + per_row]
        while len(chunk) < per_row:
            chunk.append(chunk[-1])
        row = os.path.join(out_dir, f"_row{i}.png")
        cmd = ["ffmpeg", "-loglevel", "error", "-y"]
        for t in chunk:
            cmd += ["-i", t]
        subprocess.run(cmd + ["-filter_complex", f"hstack=inputs={per_row}", row], check=True)
        rows.append(row)
    sheet = os.path.join(out_dir, "rom_sheet.png")
    if len(rows) == 1:  # vstack needs at least two inputs
        os.replace(rows[0], sheet)
    else:
        cmd = ["ffmpeg", "-loglevel", "error", "-y"]
        for r_ in rows:
            cmd += ["-i", r_]
        subprocess.run(cmd + ["-filter_complex", f"vstack=inputs={len(rows)}", sheet], check=True)
    for t in tiles + rows:
        if os.path.exists(t):
            os.remove(t)
    print("[rom] sheet", os.path.join(out_dir, "rom_sheet.png"))


if __name__ == "__main__":
    main()
