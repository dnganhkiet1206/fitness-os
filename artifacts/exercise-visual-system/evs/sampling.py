"""Samples an animated exercise scene frame by frame into plain numbers that
the validation checks (plain Python, evs/validation) can judge. Needs bpy.

Nothing here decides whether a value is good or bad. It only measures."""

from __future__ import annotations

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from . import bl_util
from . import rig as evs_rig

JOINTS = {
    "pelvis": ("pelvis", False), "chest": ("spine_03", False), "neck": ("neck_01", False), "head": ("head", False), "head_top": ("head", True),
    "shoulder_l": ("upperarm_l", False), "elbow_l": ("lowerarm_l", False), "wrist_l": ("hand_l", False), "knuckle_l": ("middle_01_l", False),
    "shoulder_r": ("upperarm_r", False), "elbow_r": ("lowerarm_r", False), "wrist_r": ("hand_r", False), "knuckle_r": ("middle_01_r", False),
    "hip_l": ("thigh_l", False), "knee_l": ("calf_l", False), "ankle_l": ("foot_l", False), "toe_l": ("ball_l", False),
    "hip_r": ("thigh_r", False), "knee_r": ("calf_r", False), "ankle_r": ("foot_r", False), "toe_r": ("ball_r", False),
}
HAND_BONES = ("hand", "index_01", "index_02", "index_03", "middle_01", "middle_02", "middle_03", "ring_01", "ring_02", "ring_03",
              "pinky_01", "pinky_02", "pinky_03", "thumb_01", "thumb_02", "thumb_03")


def _weights(body, stems, sided=True) -> np.ndarray:
    names = [f"{s}_{side}" for s in stems for side in ("l", "r")] if sided else list(stems)
    return bl_util.group_weights(body, names).sum(axis=1)


def _world_coords(obj) -> np.ndarray:
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    mesh = ev.to_mesh()
    co = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", co)
    ev.to_mesh_clear()
    m = np.array(obj.matrix_world)
    return co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]


def _deformation(body, edges, rest_len, rest_volume, rest_crossings) -> dict:
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    mesh = ev.to_mesh()
    co = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    ratio = np.linalg.norm(co[edges[:, 0]] - co[edges[:, 1]], axis=1) / rest_len
    bm = bmesh.new()
    bm.from_mesh(mesh)
    volume = bm.calc_volume(signed=True)
    tree = BVHTree.FromBMesh(bm)
    bm.faces.ensure_lookup_table()
    crossing = sum(1 for a, b in tree.overlap(tree)
                   if a < b and not set(v.index for v in bm.faces[a].verts) & set(v.index for v in bm.faces[b].verts))
    bm.free()
    ev.to_mesh_clear()
    return {"p999_edge_stretch": round(float(np.percentile(ratio, 99.9)), 4), "max_edge_stretch": round(float(ratio.max()), 4),
            "volume_change": round(float(volume / rest_volume - 1.0), 5) if rest_volume else 0.0,
            "new_self_intersections": int(crossing - rest_crossings)}


def _rest_deformation_baseline(body) -> tuple[np.ndarray, np.ndarray, float, int]:
    mesh = body.data
    edges = np.array([e.vertices[:] for e in mesh.edges])
    co = bl_util.mesh_coords(mesh)
    rest_len = np.linalg.norm(co[edges[:, 0]] - co[edges[:, 1]], axis=1)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    volume = bm.calc_volume(signed=True)
    tree = BVHTree.FromBMesh(bm)
    bm.faces.ensure_lookup_table()
    crossing = sum(1 for a, b in tree.overlap(tree)
                   if a < b and not set(v.index for v in bm.faces[a].verts) & set(v.index for v in bm.faces[b].verts))
    bm.free()
    return edges, rest_len, float(volume), int(crossing)


def sample_scene(scene, rig, body, bar, exercise: dict, deformation_frames: list[int]) -> dict:
    """Returns per-frame measurements of the whole clip."""
    for mod in body.modifiers:
        if mod.type == "SUBSURF":
            mod.show_viewport = False  # measure the skinned base mesh
    fps = scene.render.fps
    frames = list(range(scene.frame_start, scene.frame_end + 1))
    radius = float(bar["evs_shaft_radius"])
    pad_top = float(scene["evs_bench_pad_top"])
    pad_half = float(scene["evs_bench_pad_half_width"])
    pad_y = (float(scene["evs_bench_foot_end_y"]), float(scene["evs_bench_head_end_y"]))
    racked = Vector(scene["evs_bench_racked_bar_center"])
    lip_top = float(scene["evs_bench_lip_top"])

    arm_w = _weights(body, ("upperarm", "lowerarm") + HAND_BONES)
    hand_w = {s: bl_util.group_weights(body, [f"{b}_{s}" for b in HAND_BONES]).sum(axis=1) for s in ("l", "r")}
    foot_w = {s: bl_util.group_weights(body, [f"foot_{s}", f"ball_{s}"]).sum(axis=1) for s in ("l", "r")}
    head_w = _weights(body, ("head",), sided=False)
    leg_w = _weights(body, ("thigh", "calf", "foot", "ball"))
    torso = (arm_w < 0.3) & (leg_w < 0.5) & (head_w < 0.5)
    hands = {s: hand_w[s] > 0.6 for s in ("l", "r")}
    feet = {s: foot_w[s] > 0.6 for s in ("l", "r")}

    deform = evs_rig.deform_bone_names(rig)
    rest_local = {}
    for name in deform:
        b = rig.data.bones[name]
        rest_local[name] = (b.parent.matrix_local.inverted() @ b.matrix_local) if b.parent else b.matrix_local.copy()
    palm = {s: evs_rig.palm_frame(rig, s) for s in ("l", "r")}
    palm_local = {s: {k: rig.data.bones[f"hand_{s}"].matrix_local.to_3x3().inverted() @ palm[s][k] for k in ("long", "across", "normal")}
                  for s in ("l", "r")}
    sockets = {s: bpy.data.objects.get(f"{evs_rig.SOCKET_PREFIX}hand_{s}") for s in ("l", "r")}
    plates = [o for o in bar.children if o.type == "MESH"]
    plate_rest = {p.name: (bar.matrix_world.inverted() @ p.matrix_world).copy() for p in plates}
    static_objects = [o for o in scene.objects if o.type == "MESH" and o.get("evs_equipment") == "bench_rack"]
    static_rest = {o.name: o.matrix_world.copy() for o in static_objects}
    edges, rest_len, rest_volume, rest_crossings = _rest_deformation_baseline(body)

    out = {
        "fps": fps, "frames": frames,
        "joints": {k: [] for k in JOINTS},
        "bar": {"center": [], "axis": []},
        "hand": {s: {"long": [], "across": [], "normal": [], "socket_distance_m": [], "socket_angle_deg": [],
                     "min_distance_to_bar_axis_m": [], "skin_inside_bar_m": [], "grip_centre_on_bar_m": []} for s in ("l", "r")},
        "foot": {s: {"sole_min_z_m": []} for s in ("l", "r")},
        "bench": {"head_gap_m": [], "upper_back_gap_m": [], "glute_gap_m": [], "body_into_pad_m": []},
        "bar_into_torso_m": [], "bar_to_rest_clearance_m": [],
        "bone_step_deg": {name: [] for name in deform}, "bone_length_error_m": [],
        "plate_drift_m": [], "static_equipment_drift_m": [],
        "deformation": {},
        "constants": {"bar_radius_m": radius, "pad_top_m": pad_top, "pad_half_width_m": pad_half, "racked_bar_center_m": list(racked),
                      "lip_top_m": lip_top, "deform_bones": deform, "rest_bone_length_m": {n: rig.data.bones[n].length for n in deform},
                      "parents": {n: (rig.data.bones[n].parent.name if rig.data.bones[n].parent else None) for n in deform},
                      "body_vertices": len(body.data.vertices)},
    }
    previous = {}
    shoulder_y = hip_y = head_y = None
    for f in frames:
        scene.frame_set(f)
        bpy.context.view_layer.update()
        mw = rig.matrix_world
        for key, (bone, tail) in JOINTS.items():
            pb = rig.pose.bones[bone]
            out["joints"][key].append([round(c, 5) for c in (mw @ (pb.tail if tail else pb.head))])
        bm_world = bar.matrix_world
        centre = bm_world.translation.copy()
        axis = (bm_world.to_3x3() @ Vector((1, 0, 0))).normalized()
        out["bar"]["center"].append([round(c, 5) for c in centre])
        out["bar"]["axis"].append([round(c, 6) for c in axis])

        co = _world_coords(body)
        c = np.array(centre)
        a = np.array(axis)
        rel = co - c
        along = rel @ a
        dist = np.linalg.norm(rel - np.outer(along, a), axis=1)  # distance of every skin vertex to the bar's axis

        for s in ("l", "r"):
            pb = rig.pose.bones[f"hand_{s}"]
            rot = (mw @ pb.matrix).to_3x3()
            for k in ("long", "across", "normal"):
                out["hand"][s][k].append([round(v, 5) for v in (rot @ palm_local[s][k]).normalized()])
            sock = sockets[s]
            if sock is not None:
                sm = sock.matrix_world
                out["hand"][s]["socket_distance_m"].append(round(((mw @ pb.matrix).translation - sm.translation).length, 6))
                out["hand"][s]["socket_angle_deg"].append(round(float(np.degrees(rot.to_quaternion().rotation_difference(sm.to_3x3().to_quaternion()).angle)), 4))
            hd = dist[hands[s]]
            out["hand"][s]["min_distance_to_bar_axis_m"].append(round(float(hd.min()), 5))
            out["hand"][s]["skin_inside_bar_m"].append(round(float(max(0.0, radius - hd.min())), 5))
            near = hands[s] & (dist < radius + 0.02)
            out["hand"][s]["grip_centre_on_bar_m"].append(round(float(along[near].mean()) if near.any() else float("nan"), 5))
            out["foot"][s]["sole_min_z_m"].append(round(float(co[feet[s], 2].min()), 5))

        if shoulder_y is None:
            shoulder_y = out["joints"]["shoulder_l"][0][1]
            hip_y = out["joints"]["hip_l"][0][1]
            head_y = out["joints"]["head"][0][1]
        on_pad = np.abs(co[:, 0]) < pad_half
        regions = {
            "head_gap_m": on_pad & (co[:, 1] > head_y),
            "upper_back_gap_m": on_pad & (co[:, 1] > shoulder_y - 0.22) & (co[:, 1] < shoulder_y + 0.05),
            "glute_gap_m": on_pad & (co[:, 1] > hip_y - 0.12) & (co[:, 1] < hip_y + 0.1),
        }
        for key, sel in regions.items():
            out["bench"][key].append(round(float(co[sel, 2].min() - pad_top), 5))
        in_pad = on_pad & (co[:, 1] > pad_y[0]) & (co[:, 1] < pad_y[1])
        out["bench"]["body_into_pad_m"].append(round(float(max(0.0, pad_top - co[in_pad, 2].min())), 5))
        t = torso & (np.abs(along) < 0.6)
        out["bar_into_torso_m"].append(round(float(max(0.0, radius - dist[t].min())), 5))

        # Clearance between the bar and the lip of the rests while the bar is
        # in front of them: positive = the bar's underside is above the lip.
        y, z = centre.y, centre.z
        over_lip = abs(y - (racked.y - 0.045)) < radius + 0.008 and abs(y - racked.y) > 1e-4
        resting_or_inside = y > racked.y - 0.03
        if over_lip and not (resting_or_inside and z <= racked.z + 1e-4):
            out["bar_to_rest_clearance_m"].append(round((z - radius) - lip_top, 5))
        else:
            out["bar_to_rest_clearance_m"].append(None)

        length_error = 0.0
        for name in deform:
            pb = rig.pose.bones[name]
            length_error = max(length_error, abs((pb.tail - pb.head).length - rig.data.bones[name].length))
            local = (pb.parent.matrix.inverted() @ pb.matrix) if pb.parent else pb.matrix.copy()
            q = (rest_local[name].inverted() @ local).to_quaternion()
            if name in previous:
                out["bone_step_deg"][name].append(round(float(np.degrees(previous[name].rotation_difference(q).angle)), 4))
            previous[name] = q
        out["bone_length_error_m"].append(round(length_error, 7))
        out["plate_drift_m"].append(round(max(((bar.matrix_world.inverted() @ p.matrix_world).translation - plate_rest[p.name].translation).length for p in plates), 7) if plates else 0.0)
        out["static_equipment_drift_m"].append(round(max((o.matrix_world.translation - static_rest[o.name].translation).length for o in static_objects), 7) if static_objects else 0.0)
        if f in deformation_frames:
            out["deformation"][str(f)] = _deformation(body, edges, rest_len, rest_volume, rest_crossings)
    return out


def scene_inventory(scene, exercise: dict) -> dict:
    """What exists in the saved scene: objects, cameras, animation data."""
    from . import motion

    meshes = [o for o in scene.objects if o.type == "MESH"]
    cameras = {o.get("evs_preset", o.name): o.name for o in scene.objects if o.type == "CAMERA"}
    animated = {}
    for o in scene.objects:
        curves = motion.fcurves_of(o)
        if curves:
            animated[o.name] = {"fcurves": len(curves), "keyframes": int(max(len(c.keyframe_points) for c in curves)),
                                "paths": sorted({c.data_path for c in curves})[:12]}
    dims = {}
    for o in meshes:
        if o.get("evs_equipment"):
            dims[o.name] = [round(float(d), 4) for d in o.dimensions]
    return {
        "mesh_objects": [o.name for o in meshes],
        "objects_without_material": [o.name for o in meshes if not o.data.materials or any(m is None for m in o.data.materials)],
        "objects_without_faces": [o.name for o in meshes if len(o.data.polygons) == 0],
        "armatures": [o.name for o in scene.objects if o.type == "ARMATURE"],
        "cameras": cameras,
        "animated_objects": animated,
        "timeline_markers": {m.name: m.frame for m in scene.timeline_markers},
        "frame_range": [scene.frame_start, scene.frame_end],
        "frame_rate": scene.render.fps,
        "resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "equipment_dimensions_m": dims,
        "master_character_id": scene.get("evs_master_character_id"),
    }
