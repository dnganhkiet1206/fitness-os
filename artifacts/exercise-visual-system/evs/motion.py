"""Small motion-authoring helpers shared by exercise animation scripts."""

from __future__ import annotations

import math

import bpy
from mathutils import Quaternion, Vector


def smootherstep(t: float) -> float:
    """Quintic ease with zero velocity and acceleration at both ends."""
    t = min(1.0, max(0.0, t))
    return t * t * t * (t * (6.0 * t - 15.0) + 10.0)


def frame_of(seconds: float, fps: int) -> int:
    return int(round(seconds * fps))


def two_bone_elbow(shoulder: Vector, wrist: Vector, upper: float, lower: float, prefer: Vector) -> tuple[Vector, float]:
    """Elbow position of a two-segment limb and its interior joint angle in
    degrees. Of all positions the two segment lengths allow (a circle around
    the shoulder-wrist line), returns the one furthest along ``prefer``."""
    line = wrist - shoulder
    d = min(line.length, upper + lower - 1e-6)
    n = line.normalized()
    a = (d * d + upper * upper - lower * lower) / (2.0 * d)
    rho = math.sqrt(max(upper * upper - a * a, 0.0))
    centre = shoulder + n * a
    v = prefer - n * prefer.dot(n)
    v = v.normalized() if v.length > 1e-9 else n.orthogonal().normalized()
    cos_angle = (upper * upper + lower * lower - d * d) / (2.0 * upper * lower)
    return centre + v * rho, math.degrees(math.acos(max(-1.0, min(1.0, cos_angle))))


def rotate_bone_about_armature_axis(rig: bpy.types.Object, bone: str, axis: Vector, degrees: float) -> None:
    """Rotates a pose bone about an axis given in armature (rest) space."""
    pb = rig.pose.bones[bone]
    local = pb.bone.matrix_local.to_3x3().inverted() @ Vector(axis)
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = Quaternion(local.normalized(), math.radians(degrees)) @ pb.rotation_quaternion


def key_object_location(obj: bpy.types.Object, frame: int, location: Vector) -> None:
    obj.location = location
    obj.keyframe_insert("location", frame=frame)


def key_bone_location(rig: bpy.types.Object, bone: str, frame: int) -> None:
    rig.pose.bones[bone].keyframe_insert("location", frame=frame)


def add_phase_markers(scene: bpy.types.Scene, phases: list[dict], fps: int) -> None:
    for m in list(scene.timeline_markers):
        scene.timeline_markers.remove(m)
    for p in phases:
        scene.timeline_markers.new(p["id"], frame=frame_of(p["start_s"], fps))


def fcurves_of(id_block) -> list:
    """All F-curves animating an ID, for both layered and legacy actions."""
    ad = id_block.animation_data
    if ad is None or ad.action is None:
        return []
    action = ad.action
    if hasattr(action, "layers") and len(action.layers):
        from bpy_extras import anim_utils

        bag = anim_utils.action_get_channelbag_for_slot(action, ad.action_slot)
        return list(bag.fcurves) if bag else []
    return list(action.fcurves)
