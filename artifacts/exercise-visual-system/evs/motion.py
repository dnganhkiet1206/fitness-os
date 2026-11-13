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


def elbow_under_wrist(shoulder: Vector, wrist: Vector, upper: float, lower: float) -> tuple[Vector, float, Vector]:
    """Elbow position of a two-segment arm and its interior angle in degrees.

    The two segment lengths leave the elbow free on a circle around the
    shoulder-wrist line. This picks the point where the elbow is straight
    under (or over) the wrist when seen from the front (same x), and of the
    two such points the one towards the feet. Where the arm is too straight for that,
    it takes the point of the circle closest to it. The result moves
    continuously as the wrist moves. The third value is the unit direction
    from the shoulder-wrist line towards the elbow, which stays defined even
    when the arm is straight; use it to place an IK pole target."""
    line = wrist - shoulder
    d = min(line.length, upper + lower - 1e-6)
    n = line.normalized()
    a = (d * d + upper * upper - lower * lower) / (2.0 * d)
    rho = math.sqrt(max(upper * upper - a * a, 0.0))
    centre = shoulder + n * a
    x = Vector((1.0, 0.0, 0.0))
    e1 = x - n * x.dot(n)
    cos_angle = (upper * upper + lower * lower - d * d) / (2.0 * upper * lower)
    interior = math.degrees(math.acos(max(-1.0, min(1.0, cos_angle))))
    if e1.length < 1e-9:
        down = Vector((0.0, 0.0, -1.0))
        v = (down - n * down.dot(n)).normalized()
        return centre + v * rho, interior, v
    e1.normalize()
    e2 = n.cross(e1)
    c = max(-1.0, min(1.0, (wrist.x - centre.x) / (rho * e1.x))) if abs(e1.x) > 1e-9 and rho > 1e-9 else 1.0
    s = math.sqrt(max(1.0 - c * c, 0.0))
    v1 = e1 * c + e2 * s
    v2 = e1 * c - e2 * s
    # Of the two, the one towards the feet (-y): the elbow tucks down and
    # back, never flips towards the head, and the choice never switches.
    v = v1 if v1.y <= v2.y else v2
    # Near full extension the elbow's direction is free (the circle is tiny)
    # and following the rule would spin the upper arm. Blend towards a fixed
    # 'down and towards the feet' direction there instead.
    rest_dir = Vector((0.0, -0.5, -1.0))
    rest_dir = rest_dir - n * rest_dir.dot(n)
    if rest_dir.length > 1e-9:
        t = min(1.0, max(0.0, (rho / upper - 0.12) / (0.4 - 0.12)))
        t = t * t * (3.0 - 2.0 * t)
        v = (rest_dir.normalized() * (1.0 - t) + v * t).normalized()
    return centre + v * rho, interior, v


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
