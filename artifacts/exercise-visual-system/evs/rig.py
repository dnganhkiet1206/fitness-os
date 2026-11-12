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
from mathutils import Matrix, Vector

from . import bl_util

SIDES = ("l", "r")
CONTROL_COLLECTION = "Controls"
FINGERS = ("index", "middle", "ring", "pinky")
# Flexion in degrees at grip = 1 for a bar of about 29 mm: knuckle, middle
# joint, end joint.
FINGER_CURL_DEG = (62.0, 88.0, 46.0)
THUMB_CURL_DEG = (26.0, 24.0, 34.0)
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


def add_controls(rig: bpy.types.Object) -> None:
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
        _add_grip(rig, side)


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


def _add_grip(rig: bpy.types.Object, side: str) -> None:
    prop = f"grip_{side}"
    rig[prop] = 0.0
    rig.id_properties_ui(prop).update(min=0.0, max=1.0, description="0 = open hand, 1 = closed around a bar")
    frame = palm_frame(rig, side)

    def drive_bone(name: str, world_axis: Vector, degrees: float) -> None:
        bone = rig.data.bones[name]
        local = bone.matrix_local.to_3x3().inverted() @ world_axis
        local.normalize()
        pb = rig.pose.bones[name]
        pb.rotation_mode = "AXIS_ANGLE"
        pb.rotation_axis_angle = (0.0, local.x, local.y, local.z)
        _drive(pb, "rotation_axis_angle", rig, prop, f"v*{math.radians(degrees):.5f}", index=0)

    for finger in FINGERS:
        for joint, degrees in zip(("01", "02", "03"), FINGER_CURL_DEG):
            name = f"{finger}_{joint}_{side}"
            along = rig.data.bones[name].y_axis
            axis = along.cross(frame["normal"])  # rotating about it bends the finger into the palm
            drive_bone(name, axis.normalized(), degrees)
    # The thumb closes across the palm, towards the fingers, from the other
    # side of the bar.
    toward = (frame["normal"] * 0.75 + frame["across"] * 0.65).normalized()
    for joint, degrees in zip(("01", "02", "03"), THUMB_CURL_DEG):
        name = f"thumb_{joint}_{side}"
        along = rig.data.bones[name].y_axis
        drive_bone(name, along.cross(toward).normalized(), degrees)


# --------------------------------------------------------------------------
# Sockets: equipment contact
# --------------------------------------------------------------------------

def hand_matrix_for_grip(rig: bpy.types.Object, side: str, bar_point: Vector, across: Vector, palm_normal: Vector,
                         bar_radius: float, palm_depth: float, along_palm: float) -> Matrix:
    """Hand-bone matrix (in the frame the arguments are given in) that puts a
    bar of ``bar_radius`` through ``bar_point`` into the palm.

    ``across`` is where the knuckle line (index to little finger) must point,
    which is the bar's axis; ``palm_normal`` is where the palm faces. The bar
    centre ends up ``along_palm`` from the wrist towards the knuckles and
    ``bar_radius + palm_depth`` off the palm's bone plane."""
    frame = palm_frame(rig, side)
    rest = rig.data.bones[f"hand_{side}"].matrix_local
    across = across.normalized()
    palm_normal = (palm_normal - palm_normal.dot(across) * across).normalized()
    long_target = across.cross(palm_normal)
    rest_basis = Matrix((frame["long"], frame["across"], frame["normal"])).transposed()
    # Right-handedness of (long, across, normal) differs between the hands.
    if rest_basis.determinant() < 0:
        long_target = -long_target
    target_basis = Matrix((long_target, across, palm_normal)).transposed()
    rotation = target_basis @ rest_basis.inverted()
    wrist = bar_point - long_target * along_palm - palm_normal * (bar_radius + palm_depth)
    out = (rotation @ rest.to_3x3()).to_4x4()
    out.translation = wrist
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
