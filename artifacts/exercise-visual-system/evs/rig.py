"""Control layer on top of the 53-bone deform skeleton.

Deform bones keep their names and hierarchy, so the exported skeleton is
identical for every exercise. Controls (prefix ``ctl_``) are never exported:

    ctl_hand_l/r    IK target and orientation of the hand (wrist)
    ctl_elbow_l/r   pole target: where the elbow points
    ctl_foot_l/r    IK target and orientation of the foot (ankle)
    ctl_knee_l/r    pole target: where the knee points

Custom properties on the armature object (all 0..1, all keyable):

    ik_arm_l/r, ik_leg_l/r   1 = IK, 0 = FK (pose the deform bones directly)
    grip_l/r                 0 = open hand, 1 = fingers closed around a bar

Equipment contact uses sockets: an Empty parented to a piece of equipment
whose transform is the hand (or foot) transform that holds it. A control
follows a socket through a Copy Transforms constraint, so the contact is
exact by construction and the equipment drives the limb."""

from __future__ import annotations

import math

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

from . import bl_util

SIDES = ("l", "r")
CONTROL_COLLECTION = "Controls"
FINGERS = ("index", "middle", "ring", "pinky")
SOCKET_PREFIX = "SOCKET_"


# --------------------------------------------------------------------------
# Building the controls
# --------------------------------------------------------------------------

def _pole_angle(base, ik, pole_location: Vector) -> float:
    """Pole angle that makes Blender's IK plane pass through the pole target."""
    def signed(u: Vector, v: Vector, normal: Vector) -> float:
        angle = u.angle(v)
        return -angle if u.cross(v).angle(normal) < 1.0 else angle

    pole_normal = (ik.tail - base.head).cross(pole_location - base.head)
    projected = pole_normal.cross(base.tail - base.head)
    return signed(base.x_axis, projected, base.tail - base.head)


def add_controls(rig: bpy.types.Object, grip: dict, body: bpy.types.Object | None = None) -> dict:
    bl_util.select_only(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = rig.data.edit_bones
    pole_angles = {}
    for side in SIDES:
        for limb, upper, lower, end, default_dir in (
            ("arm", f"upperarm_{side}", f"lowerarm_{side}", f"hand_{side}", Vector((0, 1, 0))),
            ("leg", f"thigh_{side}", f"calf_{side}", f"foot_{side}", Vector((0, -1, 0))),
        ):
            ctl_name = f"ctl_{'hand' if limb == 'arm' else 'foot'}_{side}"
            pole_name = f"ctl_{'elbow' if limb == 'arm' else 'knee'}_{side}"
            target = eb.new(ctl_name)
            target.head, target.tail, target.roll = eb[end].head.copy(), eb[end].tail.copy(), eb[end].roll
            target.use_deform = False
            bend = eb[lower].head - (eb[upper].head + eb[end].head) * 0.5
            direction = bend.normalized() if bend.length > 0.02 else default_dir
            pole = eb.new(pole_name)
            pole.head = eb[lower].head + direction * 0.35
            pole.tail = pole.head + Vector((0, 0, 0.06))
            pole.use_deform = False
            pole_angles[(limb, side)] = _pole_angle(eb[upper], eb[lower], pole.head.copy())
    bpy.ops.object.mode_set(mode="OBJECT")

    controls = rig.data.collections.get(CONTROL_COLLECTION) or rig.data.collections.new(CONTROL_COLLECTION)
    for bone in rig.data.bones:
        if bone.name.startswith("ctl_"):
            controls.assign(bone)

    solved = {}
    for side in SIDES:
        for limb, lower, end in (("arm", f"lowerarm_{side}", f"hand_{side}"), ("leg", f"calf_{side}", f"foot_{side}")):
            prop = f"ik_{limb}_{side}"
            rig[prop] = 1.0
            rig.id_properties_ui(prop).update(min=0.0, max=1.0, description="1 = IK, 0 = FK")
            ctl = f"ctl_{'hand' if limb == 'arm' else 'foot'}_{side}"
            pole = f"ctl_{'elbow' if limb == 'arm' else 'knee'}_{side}"
            ik = rig.pose.bones[lower].constraints.new("IK")
            ik.name = "EVS IK"
            ik.target, ik.subtarget = rig, ctl
            ik.pole_target, ik.pole_subtarget = rig, pole
            ik.pole_angle = pole_angles[(limb, side)]
            ik.chain_count = 2
            ik.use_stretch = False
            _drive(ik, "influence", rig, prop)
            rot = rig.pose.bones[end].constraints.new("COPY_ROTATION")
            rot.name = "EVS Follow Control"
            rot.target, rot.subtarget = rig, ctl
            rot.target_space = rot.owner_space = "WORLD"
            _drive(rot, "influence", rig, prop)
        solved[side] = _add_grip(rig, side, grip, body)
    return solved


def _drive(owner, path: str, rig: bpy.types.Object, prop: str, expression: str = "v", index: int = -1) -> None:
    fcurve = owner.driver_add(path, index) if index >= 0 else owner.driver_add(path)
    driver = fcurve.driver
    driver.type = "SCRIPTED"
    var = driver.variables.new()
    var.name = "v"
    var.type = "SINGLE_PROP"
    var.targets[0].id = rig
    var.targets[0].data_path = f'["{prop}"]'
    driver.expression = expression


def palm_frame(rig: bpy.types.Object, side: str) -> dict:
    """Rest-pose geometry of the palm in armature space: the wrist, the hand's
    long axis, the direction across the knuckles (index to little finger) and
    the palmar normal (the side the fingers close towards)."""
    bones = rig.data.bones
    wrist = bones[f"hand_{side}"].head_local.copy()
    index = bones[f"index_01_{side}"].head_local
    pinky = bones[f"pinky_01_{side}"].head_local
    middle = bones[f"middle_01_{side}"].head_local
    long_axis = (middle - wrist).normalized()
    across = pinky - index
    across = (across - across.dot(long_axis) * long_axis).normalized()
    normal = long_axis.cross(across)
    # The relaxed fingers curve towards the palm.
    tip = bones[f"middle_03_{side}"].tail_local
    if normal.dot(tip - middle) < 0:
        normal = -normal
    return {"wrist": wrist, "long": long_axis, "across": across, "normal": normal, "knuckle_distance": (middle - wrist).length}


def grip_bar(rig: bpy.types.Object, side: str, grip: dict) -> tuple[Vector, Vector, float]:
    """Where the standard bar sits in the rest-pose hand (armature space):
    a point on its axis, its direction (from the index-finger side to the
    little-finger side) and its radius. The bar runs slightly diagonally:
    lower in the palm on the thumb side."""
    frame = palm_frame(rig, side)
    radius = grip["bar_diameter"] * 0.5
    diagonal = math.radians(grip.get("diagonal_deg", 0.0))
    point = frame["wrist"] + frame["long"] * grip["along_palm"] + frame["normal"] * (radius + grip["palm_depth"])
    direction = (frame["across"] * math.cos(diagonal) + frame["long"] * math.sin(diagonal)).normalized()
    return point, direction, radius


def _distance_to_line(a: Vector, b: Vector, point: Vector, direction: Vector) -> float:
    """Smallest distance between the segment a-b and an infinite line."""
    best = 1e9
    for i in range(11):
        rel = a.lerp(b, i / 10.0) - point
        best = min(best, (rel - direction * rel.dot(direction)).length)
    return best


def _pose_chain(joints: list, axes: list, angles_deg) -> list:
    """Joint positions of a finger after turning each bone about its axis."""
    pts = [p.copy() for p in joints]
    ax = [a.copy() for a in axes]
    for i, angle in enumerate(angles_deg):
        q = Quaternion(ax[i], math.radians(angle))
        for j in range(i + 1, len(pts)):
            pts[j] = pts[i] + q @ (pts[j] - pts[i])
        for j in range(i + 1, len(ax)):
            ax[j] = q @ ax[j]
    return pts


def _wrap(joints: list, axes: list, limits_deg: list, half_thickness: list, point: Vector, direction: Vector, radius: float,
          palm_point: Vector, palm_normal: Vector, palm_surface: float, fixed: dict | None = None) -> tuple[list, dict]:
    """Finger joint angles (degrees) that close the finger onto the bar.

    Searches the joint ranges for the pose whose bones lie closest to the bar
    surface without their skin entering the bar or the palm. A finger that is
    too short to reach still closes as far as it usefully can. Coarse search
    first, then a finer one around the best pose."""
    fixed = fixed or {}

    def cost(angles) -> tuple[float, float, float]:
        pts = _pose_chain(joints, axes, angles)
        into_bar = gap = into_palm = 0.0
        for i in range(len(axes)):
            if i in fixed:
                continue
            d = _distance_to_line(pts[i], pts[i + 1], point, direction)
            into_bar = max(into_bar, radius + half_thickness[i] - d)
            gap += (i + 1) * max(0.0, d - radius - half_thickness[i])
            if i > 0:  # the end bones must not dig into the palm
                for k in (0.5, 1.0):
                    height = (pts[i].lerp(pts[i + 1], k) - palm_point).dot(palm_normal)
                    into_palm = max(into_palm, palm_surface + half_thickness[i] - height)
        return max(into_bar, 0.0), gap, max(into_palm, 0.0)

    def score(angles) -> float:
        into_bar, gap, into_palm = cost(angles)
        return into_bar * 400.0 + into_palm * 200.0 + gap + 1e-5 * sum(angles)

    def grid(centre, span, step) -> list:
        ranges = []
        for i, limit in enumerate(limits_deg):
            if i in fixed:
                ranges.append([fixed[i]])
                continue
            lo = max(0.0, centre[i] - span) if centre else 0.0
            hi = min(limit, centre[i] + span) if centre else limit
            n = max(1, int(round((hi - lo) / step)))
            ranges.append([lo + (hi - lo) * k / n for k in range(n + 1)])
        best, best_score = None, 1e9
        for a in ranges[0]:
            for b in (ranges[1] if len(ranges) > 1 else [None]):
                for c in (ranges[2] if len(ranges) > 2 else [None]):
                    angles = [v for v in (a, b, c) if v is not None]
                    sc = score(angles)
                    if sc < best_score:
                        best, best_score = angles, sc
        return best

    best = grid(None, 0.0, 7.0)
    best = grid(best, 7.0, 1.75)
    best = grid(best, 1.75, 0.5)
    into_bar, gap, into_palm = cost(best)
    return [round(a, 2) for a in best], {"skin_into_bar_m": round(into_bar, 4), "skin_into_palm_m": round(into_palm, 4), "gap_score_m": round(gap, 4)}


def _add_grip(rig: bpy.types.Object, side: str, grip: dict, body: bpy.types.Object | None = None) -> dict:
    prop = f"grip_{side}"
    rig[prop] = 0.0
    rig.id_properties_ui(prop).update(min=0.0, max=1.0, description="0 = open hand, 1 = closed around the standard bar")
    frame = palm_frame(rig, side)
    point, bar_direction, radius = grip_bar(rig, side, grip)
    bones = rig.data.bones
    palm = (frame["wrist"], frame["normal"], grip["palm_surface"])

    def drive_bone(name: str, rest_axis: Vector, degrees: float) -> None:
        local = bones[name].matrix_local.to_3x3().inverted() @ rest_axis
        local.normalize()
        pb = rig.pose.bones[name]
        pb.rotation_mode = "AXIS_ANGLE"
        pb.rotation_axis_angle = (0.0, local.x, local.y, local.z)
        _drive(pb, "rotation_axis_angle", rig, prop, f"v*{math.radians(degrees):.5f}", index=0)

    def direction(name: str) -> Vector:
        bone = bones[name]  # Bone.y_axis is parent-relative, so use the joints
        return (bone.tail_local - bone.head_local).normalized()

    def chain(stem: str) -> tuple[list, list]:
        names = [f"{stem}_{j}_{side}" for j in ("01", "02", "03")]
        return names, [bones[n].head_local.copy() for n in names] + [bones[names[-1]].tail_local.copy()]

    solved = {}
    for finger in FINGERS:
        names, joints = chain(finger)
        # rotating about (direction x palm normal) bends the finger into the palm
        axes = [direction(n).cross(frame["normal"]).normalized() for n in names]
        angles, fit = _wrap(joints, axes, grip["finger_limits_deg"], grip["finger_half_thickness"], point, bar_direction, radius, *palm)
        for n, a, deg in zip(names, axes, angles):
            drive_bone(n, a, deg)
        solved[finger] = {"angles_deg": angles, **fit}

    # The thumb closes the other way round. Its first bone has to swing clear
    # of the bar before the end joints can close around it, and which way is
    # clear depends on the hand and the bar, so a fan of swing directions is
    # tried and the best fitting one kept. The end joints then curl about the
    # bar's own direction, towards the knuckles, to meet the fingers.
    names, joints = chain("thumb")
    rest_direction = direction(names[0])

    def skin_inside_bar(axes: list, angles: list) -> float:
        """Deepest the real skin of the thumb and palm gets into the bar with
        the thumb posed like this (the bone model above cannot see the pads)."""
        if body is None:
            return 0.0
        for n, a, deg in zip(names, axes, angles):
            local = bones[n].matrix_local.to_3x3().inverted() @ a
            local.normalize()
            pb = rig.pose.bones[n]
            pb.rotation_mode = "AXIS_ANGLE"
            pb.rotation_axis_angle = (math.radians(deg), local.x, local.y, local.z)
        bpy.context.view_layer.update()
        evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        co = np.empty(len(mesh.vertices) * 3)
        mesh.vertices.foreach_get("co", co)
        evaluated.to_mesh_clear()
        rel = co.reshape(-1, 3)[thumb_skin] - np.array(point)
        along = rel @ np.array(bar_direction)
        dist = np.linalg.norm(rel - np.outer(along, np.array(bar_direction)), axis=1)
        return float(max(0.0, radius - dist.min()))

    if body is not None:
        thumb_skin = bl_util.group_weights(body, [f"hand_{side}"] + names).sum(axis=1) > 0.3
        for mod in body.modifiers:
            if mod.type == "SUBSURF":
                mod.show_viewport = False
        rig[prop] = 1.0  # fingers closed while the thumb is fitted
        rig.update_tag()
    best = None
    for out in (-0.4, -0.2, 0.0, 0.3, 0.6):
        for along_palm in (-0.9, -0.6, -0.3):
            for sideways in (-0.8, -0.5, -0.2):
                target = (frame["normal"] * out + frame["long"] * along_palm + frame["across"] * sideways).normalized()
                swing_axis, swing_angle = rest_direction.rotation_difference(target).to_axis_angle()
                swing_axis = Vector(swing_axis)
                limit = min(math.degrees(swing_angle), grip["thumb_limits_deg"][0])
                if limit < 1.0:
                    continue
                # Axis that carries 'out of the palm' towards 'the knuckles', as it
                # was before the first bone swung.
                curl = Quaternion(swing_axis, math.radians(limit)).inverted() @ frame["normal"].cross(frame["long"]).normalized()
                axes = [swing_axis, curl, curl]
                angles, fit = _wrap(joints, axes, [limit] + list(grip["thumb_limits_deg"][1:]), grip["thumb_half_thickness"], point,
                                    bar_direction, radius, *palm)
                for closing in (1.0, 0.8, 0.6):
                    trial = [angles[0]] + [a * closing for a in angles[1:]]
                    inside = skin_inside_bar(axes, trial)
                    score = inside * 400.0 + fit["skin_into_palm_m"] * 200.0 + fit["gap_score_m"] + (1.0 - closing) * 0.02
                    if best is None or score < best[0]:
                        best = (score, axes, [round(a, 2) for a in trial], {**fit, "skin_into_bar_measured_m": round(inside, 4)})
    _score, axes, angles, fit = best
    for n in names:
        rig.pose.bones[n].rotation_axis_angle[0] = 0.0
    for n, a, deg in zip(names, axes, angles):
        drive_bone(n, a, deg)
    solved["thumb"] = {"angles_deg": angles, **fit}
    if body is not None:
        rig[prop] = 0.0
        rig.update_tag()
        for mod in body.modifiers:
            if mod.type == "SUBSURF":
                mod.show_viewport = True
        bpy.context.view_layer.update()
    return solved


# --------------------------------------------------------------------------
# Sockets: equipment contact
# --------------------------------------------------------------------------

def hand_matrix_for_grip(rig: bpy.types.Object, side: str, grip: dict, bar_point: Vector, bar_axis: Vector, palm_normal: Vector) -> Matrix:
    """Hand-bone matrix, in the frame the arguments are given in, that holds
    a bar in the character's standard grip.

    ``bar_point`` is the point of the bar's axis under this hand,
    ``bar_axis`` its direction from this hand's index-finger side to its
    little-finger side, ``palm_normal`` where the palm faces. Uses the same
    grip definition as the finger solver, so the closed fingers fit."""
    rest_point, rest_direction, _radius = grip_bar(rig, side, grip)
    frame = palm_frame(rig, side)
    rest = rig.data.bones[f"hand_{side}"].matrix_local

    def basis(direction: Vector, normal: Vector) -> Matrix:
        e1 = direction.normalized()
        e3 = (normal - e1 * normal.dot(e1)).normalized()
        return Matrix((e1, e3.cross(e1), e3)).transposed()

    rotation = basis(bar_axis, palm_normal) @ basis(rest_direction, frame["normal"]).inverted()
    out = (rotation @ rest.to_3x3()).to_4x4()
    out.translation = Vector(bar_point) + rotation @ (rest.translation - rest_point)
    return out


def add_socket(parent: bpy.types.Object, name: str, matrix_parent_space: Matrix) -> bpy.types.Object:
    full = SOCKET_PREFIX + name
    old = bpy.data.objects.get(full)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    socket = bpy.data.objects.new(full, None)
    socket.empty_display_type = "ARROWS"
    socket.empty_display_size = 0.05
    for coll in parent.users_collection:
        coll.objects.link(socket)
    socket.parent = parent
    socket.matrix_parent_inverse = Matrix.Identity(4)
    socket.matrix_basis = matrix_parent_space
    return socket


def attach_control(rig: bpy.types.Object, control: str, socket: bpy.types.Object, name: str = "EVS Socket") -> bpy.types.Constraint:
    """Makes a control follow a socket. The socket is expressed as the bone's
    matrix in world space, so this also works when the armature object is
    moved or rotated (a character lying on a bench)."""
    pb = rig.pose.bones[control]
    for c in list(pb.constraints):
        if c.name == name:
            pb.constraints.remove(c)
    con = pb.constraints.new("COPY_TRANSFORMS")
    con.name = name
    con.target = socket
    con.target_space = con.owner_space = "WORLD"
    return con


# --------------------------------------------------------------------------
# Posing helpers
# --------------------------------------------------------------------------

def set_control_world(rig: bpy.types.Object, control: str, world_matrix: Matrix) -> None:
    pb = rig.pose.bones[control]
    pb.matrix = rig.matrix_world.inverted() @ world_matrix
    bpy.context.view_layer.update()


def set_pole_world(rig: bpy.types.Object, control: str, world_point: Vector) -> None:
    pb = rig.pose.bones[control]
    m = pb.bone.matrix_local.copy()
    m.translation = rig.matrix_world.inverted() @ Vector(world_point)
    pb.matrix = m
    bpy.context.view_layer.update()


def bone_head_world(rig: bpy.types.Object, name: str) -> Vector:
    return rig.matrix_world @ rig.pose.bones[name].head


def bone_tail_world(rig: bpy.types.Object, name: str) -> Vector:
    return rig.matrix_world @ rig.pose.bones[name].tail


def deform_bone_names(rig: bpy.types.Object) -> list[str]:
    return [b.name for b in rig.data.bones if b.use_deform]
