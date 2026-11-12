"""Barbell bench press: one repetition with setup, unrack and re-rack.

    Blender -b --factory-startup --python bench-press/animate_bench_press.py

Opens bench-press/_scene.blend (made by build_scene.py), lays the master
character on the bench, closes its hands around the bar and keys the motion.
Writes bench_press_master.blend and motion_metadata.json.

MOTION SOURCE: hand-keyed from the technique parameters in exercise.json and
the references in reference_notes.json. It is NOT motion capture and it has
NOT been reviewed by a qualified professional:

    UNVERIFIED — NOT APPROVED FOR PRODUCTION

What is animated (and therefore editable in Blender's graph editor):
    Barbell            location Y and Z: the bar path
    ctl_elbow_l/r      location: where the elbows point
Everything else follows: the hands are bound to grip sockets on the bar, the
arms are solved by IK, the feet are pinned to the floor by IK."""

from __future__ import annotations

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from evs import PIPELINE_VERSION, UNVERIFIED_LABEL, config, motion  # noqa: E402
from evs import rig as evs_rig  # noqa: E402
from evs import scene as evs_scene  # noqa: E402

KEY_STEP = 3  # frames between keys while something moves


def world_vertices(obj: bpy.types.Object) -> np.ndarray:
    """Deformed vertex positions in world space (modifiers applied)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    co = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", co)
    evaluated.to_mesh_clear()
    co = co.reshape(-1, 3)
    m = np.array(obj.matrix_world)
    return co @ m[:3, :3].T + m[:3, 3]


def lie_on_bench(rig, body, exercise: dict, pad_top: float, pad_half_width: float, head_end_y: float) -> dict:
    """Supine on the pad: head towards +Y, face up. The trunk is pitched until
    both the upper back and the glutes rest on the pad, then the neck is
    extended until the head rests on it too."""
    tech, place = exercise["technique"], exercise["placement"]
    rest = np.array([v.co[:] for v in body.data.vertices])
    standing_top = float(rest[:, 2].max())

    # Arch and shoulder position are set before the body is put down.
    for bone in ("spine_02", "spine_03"):
        motion.rotate_bone_about_armature_axis(rig, bone, Vector((1, 0, 0)), -tech["thoracic_extension_deg"] * 0.5)
    motion.rotate_bone_about_armature_axis(rig, "clavicle_l", Vector((0, 0, 1)), tech["scapular_retraction_deg"])
    motion.rotate_bone_about_armature_axis(rig, "clavicle_r", Vector((0, 0, 1)), -tech["scapular_retraction_deg"])

    rig.rotation_mode = "XYZ"
    rig.rotation_euler = (-math.pi / 2, 0.0, 0.0)
    rig.location = (0.0, head_end_y - place["head_from_pad_head_end_m"] - standing_top, pad_top + 0.12)
    bpy.context.view_layer.update()

    target = pad_top - place["pad_compression_m"]

    def lowest(mask_fn) -> tuple[float, float]:
        co = world_vertices(body)
        sel = co[mask_fn(co)]
        i = int(sel[:, 2].argmin())
        return float(sel[i, 2]), float(sel[i, 1])

    shoulder_y = evs_rig.bone_head_world(rig, "upperarm_l").y
    hip_y = evs_rig.bone_head_world(rig, "thigh_l").y
    on_pad = lambda co: np.abs(co[:, 0]) < pad_half_width  # noqa: E731
    upper_back = lambda co: on_pad(co) & (co[:, 1] > shoulder_y - 0.22) & (co[:, 1] < shoulder_y + 0.05)  # noqa: E731
    glutes = lambda co: on_pad(co) & (co[:, 1] > hip_y - 0.12) & (co[:, 1] < hip_y + 0.1)  # noqa: E731
    for _ in range(4):
        zb, yb = lowest(upper_back)
        zg, yg = lowest(glutes)
        pitch = math.atan2(zg - zb, yb - yg)  # raise the lower end
        pivot = Vector((0.0, yb, zb))
        rot = Matrix.Translation(pivot) @ Matrix.Rotation(pitch, 4, "X") @ Matrix.Translation(-pivot)
        rig.matrix_world = rot @ rig.matrix_world
        bpy.context.view_layer.update()
        zb, _ = lowest(upper_back)
        rig.location.z += target - zb
        bpy.context.view_layer.update()

    # Head: extend the neck until the back of the head reaches the pad.
    head_y = evs_rig.bone_head_world(rig, "head").y
    back_of_head = lambda co: on_pad(co) & (co[:, 1] > head_y)  # noqa: E731
    lo, hi = 0.0, 30.0
    base_neck = rig.pose.bones["neck_01"].rotation_quaternion.copy()
    base_head = rig.pose.bones["head"].rotation_quaternion.copy()
    neck_angle = 0.0
    for _ in range(12):
        neck_angle = 0.5 * (lo + hi)
        rig.pose.bones["neck_01"].rotation_quaternion = base_neck
        rig.pose.bones["head"].rotation_quaternion = base_head
        motion.rotate_bone_about_armature_axis(rig, "neck_01", Vector((1, 0, 0)), -neck_angle * 0.6)
        motion.rotate_bone_about_armature_axis(rig, "head", Vector((1, 0, 0)), -neck_angle * 0.4)
        bpy.context.view_layer.update()
        z, _ = lowest(back_of_head)
        if z > target + 0.004:
            lo = neck_angle
        else:
            hi = neck_angle
    return {
        "trunk_pitch_deg": round(math.degrees(rig.rotation_euler.x) + 90.0, 3),
        "neck_extension_deg": round(neck_angle, 2),
        "rig_location": [round(c, 4) for c in rig.location],
    }


def plant_feet(rig, exercise: dict) -> dict:
    tech = exercise["technique"]
    out = {}
    for side, sign in (("l", 1.0), ("r", -1.0)):
        hip = evs_rig.bone_head_world(rig, f"thigh_{side}")
        rest = rig.data.bones[f"foot_{side}"].matrix_local  # standing: sole flat on z = 0
        ankle_height = rest.translation.z
        ankle = Vector((sign * tech["foot_half_spacing_m"], hip.y - tech["ankle_towards_feet_from_hip_m"], ankle_height))
        world = Matrix.Rotation(sign * math.radians(tech["toe_out_deg"]), 4, "Z") @ rest.to_3x3().to_4x4()
        world.translation = ankle
        evs_rig.set_control_world(rig, f"ctl_foot_{side}", world)
        evs_rig.set_pole_world(rig, f"ctl_knee_{side}", Vector((sign * 0.62, hip.y - 0.85, 1.25)))
        out[side] = [round(c, 4) for c in ankle]
    return out


def make_grip(rig, bar, exercise: dict) -> dict:
    """Sockets on the bar that hold the hand bones in a closed, pronated grip
    with the bar low in the palm and the wrist slightly extended."""
    tech = exercise["technique"]
    radius = float(bar["evs_shaft_radius"])
    half = tech["grip_width_between_hand_centres_m"] * 0.5
    ext = math.radians(tech["wrist_extension_deg"])
    palm_normal = Vector((0.0, -math.cos(ext), math.sin(ext)))  # towards the feet, tipped up
    wrist_offset = {}
    for side, sign in (("l", 1.0), ("r", -1.0)):
        matrix = evs_rig.hand_matrix_for_grip(
            rig, side, bar_point=Vector((sign * half, 0.0, 0.0)), across=Vector((sign, 0.0, 0.0)), palm_normal=palm_normal,
            bar_radius=radius, palm_depth=tech["palm_depth_m"], along_palm=tech["bar_low_in_palm_from_wrist_m"])
        socket = evs_rig.add_socket(bar, f"hand_{side}", matrix)
        evs_rig.attach_control(rig, f"ctl_hand_{side}", socket)
        rig[f"grip_{side}"] = 1.0
        wrist_offset[side] = matrix.translation.copy()  # wrist relative to the bar centre
    return wrist_offset


def chest_height_under_bar(body, bar_y: float) -> float:
    co = world_vertices(body)
    sel = (np.abs(co[:, 1] - bar_y) < 0.015) & (np.abs(co[:, 0]) < 0.16)
    return float(co[sel, 2].max())


def main() -> None:
    exercise = config.load_json(os.path.join(HERE, "exercise.json"))
    tech = exercise["technique"]
    fps = int(exercise["frame_rate"])
    bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, "_scene.blend"))
    scene = bpy.context.scene
    names = config.character_config()["names"]
    rig = bpy.data.objects[names["armature_object"]]
    body = bpy.data.objects[names["body_object"]]
    bar = bpy.data.objects["Barbell"]
    pad_top = scene["evs_bench_pad_top"]
    racked = Vector(scene["evs_bench_racked_bar_center"])
    lip_top = scene["evs_bench_lip_top"]
    radius = float(bar["evs_shaft_radius"])

    scene.frame_set(0)
    placement = lie_on_bench(rig, body, exercise, pad_top, scene["evs_bench_pad_half_width"], scene["evs_bench_head_end_y"])
    feet = plant_feet(rig, exercise)
    bar.location = racked
    wrist_offset = make_grip(rig, bar, exercise)
    bpy.context.view_layer.update()

    upper = rig.data.bones["upperarm_l"].length
    lower = rig.data.bones["lowerarm_l"].length
    shoulder = {s: evs_rig.bone_head_world(rig, f"upperarm_{s}") for s in ("l", "r")}
    sy = 0.5 * (shoulder["l"].y + shoulder["r"].y)
    sz = 0.5 * (shoulder["l"].z + shoulder["r"].z)

    # ---- key positions of the bar centre (x is always 0) -----------------
    def wrist_at(bar_pos: Vector, side: str) -> Vector:
        return bar_pos + wrist_offset[side]

    def reach(bar_pos: Vector) -> float:
        return (wrist_at(bar_pos, "l") - shoulder["l"]).length

    elbow = math.radians(tech["elbow_extension_at_lockout_deg"])
    lock_reach = math.sqrt(upper * upper + lower * lower - 2 * upper * lower * math.cos(elbow))
    top_y = sy + tech["lockout_over_shoulder_offset_m"]
    w = wrist_offset["l"]
    dx = w.x - shoulder["l"].x
    dy = top_y + w.y - sy
    top = Vector((0.0, top_y, sz + math.sqrt(lock_reach ** 2 - dx * dx - dy * dy) - w.z))

    bottom_y = sy - tech["touch_point_below_shoulder_joint_m"]
    bottom = Vector((0.0, bottom_y, pad_top + 0.26))
    for _ in range(3):  # the chest moves a little with the arms, so settle
        bar.location = bottom
        bpy.context.view_layer.update()
        bottom.z = chest_height_under_bar(body, bottom_y) + radius + tech["chest_clearance_m"]

    clear = Vector((0.0, racked.y, lip_top + radius + tech["rack_clearance_m"]))
    for label, pos in (("racked", racked), ("clear of the rests", clear), ("lockout", top)):
        if reach(pos) > upper + lower - 0.003:
            raise RuntimeError(f"the arms cannot reach the bar at '{label}' ({reach(pos):.3f} m > {upper + lower:.3f} m): "
                               "lower rack_height or move the lifter towards the rack")

    # ---- the bar path as a function of time ------------------------------
    phase = {p["id"]: p for p in exercise["exercise_phases"]}
    lift_share = 0.34  # part of unrack / re-rack spent lifting off or setting down

    def ease(t: float, t0: float, t1: float) -> float:
        return motion.smootherstep((t - t0) / (t1 - t0))

    def path_between(u: float, exponent: float, towards_top_first: bool) -> Vector:
        """Point at height fraction u (0 = chest, 1 = lockout)."""
        k = 1.0 - (1.0 - u) ** exponent if towards_top_first else u ** exponent
        return Vector((0.0, bottom.y + (top.y - bottom.y) * k, bottom.z + (top.z - bottom.z) * u))

    def bar_at(t: float) -> Vector:
        un, ec, bo, co, lo, fi = (phase[k] for k in ("unrack", "eccentric", "bottom", "concentric", "lockout", "finish"))
        if t <= un["start_s"]:
            return racked.copy()
        if t < un["end_s"]:
            split = un["start_s"] + lift_share * (un["end_s"] - un["start_s"])
            if t < split:
                return racked.lerp(clear, ease(t, un["start_s"], split))
            return clear.lerp(top, ease(t, split, un["end_s"]))
        if t <= ec["start_s"]:
            return top.copy()
        if t < ec["end_s"]:
            return path_between(1.0 - ease(t, ec["start_s"], ec["end_s"]), tech["descent_path_exponent"], False)
        if t <= bo["end_s"]:
            return bottom.copy()
        if t < co["end_s"]:
            return path_between(ease(t, co["start_s"], co["end_s"]), tech["ascent_path_exponent"], True)
        if t <= lo["end_s"]:
            return top.copy()
        settled = fi["end_s"] - 0.25  # the bar rests in the rack for the last quarter second
        split = settled - lift_share * (settled - fi["start_s"])
        if t < split:
            return top.lerp(clear, ease(t, fi["start_s"], split))
        if t < settled:
            return clear.lerp(racked, ease(t, split, settled))
        return racked.copy()

    last = scene.frame_end
    key_frames = set()
    for p in exercise["exercise_phases"]:
        f0, f1 = motion.frame_of(p["start_s"], fps), motion.frame_of(p["end_s"], fps)
        key_frames.update((f0, f1))
        if p["id"] in ("unrack", "eccentric", "concentric", "finish"):
            key_frames.update(range(f0, f1, KEY_STEP))
    key_frames = sorted(f for f in key_frames if 0 <= f <= last)

    elbow_check = []
    for f in key_frames:
        pos = bar_at(f / fps)
        if reach(pos) > upper + lower - 0.002:
            raise RuntimeError(f"frame {f}: bar out of reach ({reach(pos):.3f} m)")
        motion.key_object_location(bar, f, pos)
        for side in ("l", "r"):
            # Elbow as low as the arm allows: this is what keeps the forearm
            # upright under the bar through the whole repetition.
            e, angle = motion.two_bone_elbow(shoulder[side], wrist_at(pos, side), upper, lower, Vector((0, 0, -1)))
            mid = (shoulder[side] + wrist_at(pos, side)) * 0.5
            evs_rig.set_pole_world(rig, f"ctl_elbow_{side}", e + (e - mid).normalized() * 0.4)
            motion.key_bone_location(rig, f"ctl_elbow_{side}", f)
            if side == "l":
                elbow_check.append((f, e.copy(), angle))

    # ---- verify the solved arm against the intended elbow ------------------
    worst = 0.0
    for f, intended, _angle in elbow_check:
        scene.frame_set(f)
        worst = max(worst, (evs_rig.bone_head_world(rig, "lowerarm_l") - intended).length)
    print(f"[evs] largest distance between solved and intended elbow: {worst * 1000:.2f} mm")

    scene.frame_set(0)
    motion.add_phase_markers(scene, exercise["exercise_phases"], fps)
    grip_point = bar.matrix_world @ Vector((tech["grip_width_between_hand_centres_m"] * 0.5, 0.0, 0.0))
    cameras = evs_scene.build_cameras(scene, exercise, follow_targets={"hand_l": (bar, grip_point)})
    scene.camera = cameras[exercise["camera_presets"][0]]

    scene["evs_motion_source_verification"] = exercise["motion_source_verification"]
    scene["evs_status"] = exercise["status"]
    out = os.path.join(HERE, exercise["animation_file"])
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=out)

    frames = {name: motion.frame_of(p["start_s"], fps) for name, p in phase.items()}
    shoulder_distance = (shoulder["l"] - shoulder["r"]).length
    metadata = {
        "pipeline_version": PIPELINE_VERSION,
        "exercise_id": exercise["exercise_id"],
        "master_character_id": exercise["master_character_id"],
        "motion_source_id": exercise["motion_source_id"],
        "motion_source_type": exercise["motion_source_type"],
        "motion_source_license": exercise["motion_source_license"],
        "motion_source_verification": UNVERIFIED_LABEL,
        "status": exercise["status"],
        "frame_rate": fps,
        "frame_start": scene.frame_start,
        "frame_end": scene.frame_end,
        "duration_s": round((scene.frame_end - scene.frame_start) / fps, 4),
        "phases": [dict(id=p["id"], name=p["name"], start_s=p["start_s"], end_s=p["end_s"],
                        start_frame=motion.frame_of(p["start_s"], fps), end_frame=motion.frame_of(p["end_s"], fps),
                        cues=p["cues"], checks=p["checks"]) for p in exercise["exercise_phases"]],
        "loop_segment_frames": [frames[exercise["loop_segment"]["from_phase"]],
                                motion.frame_of(phase[exercise["loop_segment"]["to_phase"]]["end_s"], fps)],
        "animated_channels": {
            "Barbell": "location (bar path; x fixed at 0, no rotation keys)",
            "ctl_elbow_l, ctl_elbow_r": "location (elbow direction)",
            "everything else": "static pose; arms and legs solved by IK, hands bound to grip sockets on the bar",
        },
        "keyframes": len(key_frames),
        "key_step_frames": KEY_STEP,
        "technique_parameters": {k: v for k, v in tech.items() if k != "comment"},
        "derived": {
            "bar_racked_m": [round(c, 4) for c in racked],
            "bar_clear_of_rests_m": [round(c, 4) for c in clear],
            "bar_lockout_m": [round(c, 4) for c in top],
            "bar_bottom_m": [round(c, 4) for c in bottom],
            "bar_vertical_range_m": round(top.z - bottom.z, 4),
            "bar_horizontal_range_m": round(abs(top.y - bottom.y), 4),
            "shoulder_joint_l_m": [round(c, 4) for c in shoulder["l"]],
            "shoulder_joint_distance_m": round(shoulder_distance, 4),
            "grip_width_over_shoulder_joint_distance": round(tech["grip_width_between_hand_centres_m"] / shoulder_distance, 3),
            "wrist_relative_to_bar_centre_l_m": [round(c, 4) for c in wrist_offset["l"]],
            "elbow_angle_racked_deg": round(next(a for f, _e, a in elbow_check if f == 0), 1),
            "elbow_angle_lockout_deg": round(next(a for f, _e, a in elbow_check if f == frames["start_position"]), 1),
            "elbow_angle_bottom_deg": round(next(a for f, _e, a in elbow_check if f == frames["bottom"]), 1),
            "solved_vs_intended_elbow_max_mm": round(worst * 1000, 3),
            "placement": placement,
            "ankles_m": feet,
        },
        "cameras": {k: {"object": c.name, "file_suffix": c["evs_file_suffix"]} for k, c in cameras.items()},
        "source_blend": exercise["animation_file"],
    }
    config.save_json(os.path.join(HERE, "motion_metadata.json"), metadata)
    print(f"[evs] saved {out}")
    for k, v in metadata["derived"].items():
        if not isinstance(v, dict):
            print(f"[evs]   {k}: {v}")


if __name__ == "__main__":
    main()
