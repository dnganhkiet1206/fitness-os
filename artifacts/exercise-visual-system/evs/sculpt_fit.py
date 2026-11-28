"""Fits the MakeHuman body to a sculpted body (character 005, Kiệt 23/11).

The MakeHuman base keeps everything the pipeline relies on (topology, UVs,
rig, weights, helper bones, muscle atlas, shorts); only its SHAPE below the
neck is taken from the sculpt:

1. the sculpt (T-pose) is loaded and scaled to the MakeHuman body's height;
2. the MakeHuman arms are posed into the same T-pose through the rig;
3. every posed vertex moves to the nearest point of the sculpt's surface,
   fully on the body and fading out over the base of the neck, so the head
   and neck stay MakeHuman's (23/11: grafting at the base of the neck reads
   naturally; a cut under the jaw looked "stuck on");
4. the moved vertices are taken back to the rest (A) pose by inverting each
   vertex's linear-blend skinning matrix.
"""
from __future__ import annotations

import math

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

from . import bl_util, config


def _load(path, name: str) -> bpy.types.Object:
    with bpy.data.libraries.load(str(path), link=False) as (src, dst):
        dst.objects = [name]
    obj = dst.objects[0]
    bpy.context.scene.collection.objects.link(obj)
    return obj


def align_offset(rest: np.ndarray, tco: np.ndarray, lo: float = 0.9, hi: float = 1.3) -> Vector:
    """Translation putting the sculpt on the MakeHuman body: x/y from the centroid of the trunk band
    (hips to chest, the same whatever the arms do; 23/11: the all-vertex centroid differs between a
    T-pose and an A-pose and pushed the sculpt 17-20 cm forward of the skeleton), z from the soles."""
    rb = rest[(rest[:, 2] > lo) & (rest[:, 2] < hi) & (np.abs(rest[:, 0]) < 0.2)]
    tb = tco[(tco[:, 2] > lo) & (tco[:, 2] < hi) & (np.abs(tco[:, 0]) < 0.2)]
    return Vector((float(rb[:, 0].mean() - tb[:, 0].mean()), float(rb[:, 1].mean() - tb[:, 1].mean()),
                   float(rest[:, 2].min() - tco[:, 2].min())))


def _neck_z(co: np.ndarray, lo: float, hi: float) -> float:
    best = (1e9, 0.5 * (lo + hi))
    for z in np.arange(lo, hi, 0.003):
        s = co[np.abs(co[:, 2] - z) < 0.003]
        s = s[np.abs(s[:, 0]) < 0.15]
        if len(s) >= 8 and np.ptp(s[:, 0]) < best[0]:
            best = (float(np.ptp(s[:, 0])), float(z))
    return best[1]


def _axis(points: np.ndarray, along: int) -> tuple[np.ndarray, np.ndarray]:
    """Line through the centroids of slices of a limb: (point, unit direction)."""
    t = points[:, along]
    bins = np.linspace(t.min(), t.max(), 12)
    cents = []
    for a, b in zip(bins[:-1], bins[1:]):
        m = (t >= a) & (t < b)
        if m.sum() > 10:
            cents.append(points[m].mean(0))
    c = np.array(cents)
    mid = c.mean(0)
    u, sv, vt = np.linalg.svd(c - mid)
    d = vt[0]
    return mid, d / np.linalg.norm(d)


def _aim(rig: bpy.types.Object, bone: str, direction: Vector) -> None:
    """Rotates a pose bone about its head so head->tail points along ``direction``."""
    bpy.context.view_layer.update()
    pb = rig.pose.bones[bone]
    head = rig.matrix_world @ pb.head
    d = ((rig.matrix_world @ pb.tail) - head).normalized()
    want = direction.normalized()
    if d.dot(want) < 0:
        want = -want
    q = d.rotation_difference(want)
    pb.matrix = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ pb.matrix
    bpy.context.view_layer.update()


def _pose_like_sculpt(rig: bpy.types.Object, tco: np.ndarray, bones: dict) -> dict:
    """Poses the MakeHuman arms and legs along the sculpt's limb axes (it stands in a
    T-pose, feet apart): upper arm and forearm on the arm axis, thigh and shin on the leg axis."""
    out = {}
    x, z = tco[:, 0], tco[:, 2]
    for side, sign in (("l", 1.0), ("r", -1.0)):
        arm = tco[(x * sign > 0.30) & (x * sign < 0.70) & (z > 1.2)]
        _p, ad = _axis(arm, 0)
        ad = ad if ad[0] * sign > 0 else -ad
        leg = tco[(x * sign > 0.02) & (z > 0.12) & (z < 0.80)]
        _p, ld = _axis(leg, 2)
        ld = ld if ld[2] < 0 else -ld
        for b in bones["arm"][side]:
            _aim(rig, b, Vector(ad))
        for b in bones["leg"][side]:
            _aim(rig, b, Vector(ld))
        out[side] = {"arm_dir": [round(float(v), 3) for v in ad], "leg_dir": [round(float(v), 3) for v in ld]}
    return out


def fit_to_sculpt(body: bpy.types.Object, rig: bpy.types.Object, cfg: dict) -> dict:
    sf = cfg.get("sculpt_fit") or {}
    if not sf.get("enabled"):
        return {}
    target = _load(config.ROOT / sf["source_blend"], sf["object"])
    mesh = body.data
    rest = bl_util.mesh_coords(mesh).astype(float)
    h = float(rest[:, 2].max() - rest[:, 2].min())
    tco = np.array([tuple(target.matrix_world @ v.co) for v in target.data.vertices])
    k = h * sf.get("height_ratio", 1.0) / float(np.ptp(tco[:, 2]))
    target.data.transform(Matrix.Scale(k, 4))
    tco = np.array([tuple(v.co) for v in target.data.vertices])
    target.data.transform(Matrix.Translation(align_offset(rest, tco)))
    target.matrix_world = Matrix.Identity(4)

    # Posed (T) MakeHuman surface, through the armature modifier.
    tco_now = np.array([tuple(v.co) for v in target.data.vertices])
    pose_facts = _pose_like_sculpt(rig, tco_now, sf["bones"])
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me_ev = ev.to_mesh()
    posed = np.array([tuple(v.co) for v in me_ev.vertices])
    ev.to_mesh_clear()
    if len(posed) != len(rest):
        raise RuntimeError("armature-only evaluation expected (no topology-changing modifiers)")

    # Neck: MakeHuman's own above the base of the sculpt's neck.
    top = float(posed[:, 2].max())
    neck = _neck_z(posed, top - 0.32, top - 0.16)
    lo = neck - sf.get("neck_base_below_m", 0.065)
    w = np.clip((lo + sf.get("neck_blend_m", 0.04) - posed[:, 2]) / sf.get("neck_blend_m", 0.04), 0.0, 1.0)
    w = w * w * (3 - 2 * w)

    # Hands and feet stay MakeHuman's (the sculpt's are simpler and its arm length differs).
    keep_names = [g.name for g in body.vertex_groups if any(k in g.name for k in sf.get("keep_bone_keywords", []))]
    keep = bl_util.group_weights(body, keep_names).sum(axis=1) if keep_names else np.zeros(len(rest))
    w = w * (1.0 - np.clip(keep * 1.5, 0.0, 1.0))

    me_ev = ev.to_mesh()
    nrm = np.array([tuple(v.normal) for v in me_ev.vertices])
    ev.to_mesh_clear()
    bvh = BVHTree.FromObject(target, dg)
    reach = sf.get("max_reach_m", 0.07)
    disp = np.zeros_like(posed)
    hit_ok = np.zeros(len(posed), bool)
    # Trunk (spine, pelvis, clavicles, chest, shoulder blades): nearest surface point (it is convex
    # enough not to fold); limbs: along the normal (nearest point flattened them into ribbons).
    trunk_names = [g.name for g in body.vertex_groups if any(g.name.startswith(k) for k in sf.get("trunk_bone_prefixes", []))]
    trunk = bl_util.group_weights(body, trunk_names).sum(axis=1) > 0.5 if trunk_names else np.zeros(len(rest), bool)
    for i in np.flatnonzero((w > 0) & trunk):
        hit = bvh.find_nearest(Vector(posed[i]), reach)
        if hit[0] is not None:
            disp[i] = np.array(hit[0]) - posed[i]
            hit_ok[i] = True
    for i in np.flatnonzero((w > 0) & ~trunk):
        p = Vector(posed[i]); n = Vector(nrm[i])
        best = None
        for d in (n, -n):
            loc, hn, _idx, dist = bvh.ray_cast(p, d, reach)
            if loc is not None and hn.dot(n) > 0.3 and (best is None or dist < best[1]):
                best = (loc, dist)
        if best is not None:
            disp[i] = np.array(best[0]) - posed[i]
            hit_ok[i] = True
    # Vertices with no good hit take the average displacement of their neighbours.
    nb = [[] for _ in range(len(posed))]
    for e in mesh.edges:
        a, b = e.vertices
        nb[a].append(b); nb[b].append(a)
    todo = np.flatnonzero((w > 0) & ~hit_ok)
    for _ in range(40):
        if not len(todo):
            break
        new = disp.copy()
        for i in todo:
            if nb[i]:
                new[i] = disp[nb[i]].mean(0)
        disp = new
    # a light relax of the displacement field removes single-vertex spikes
    for _ in range(3):
        new = disp.copy()
        for i in np.flatnonzero(w > 0):
            if nb[i]:
                new[i] = 0.5 * disp[i] + 0.5 * disp[nb[i]].mean(0)
        disp = new
    moved = posed + w[:, None] * disp

    # Back to rest: invert each vertex's skinning matrix (linear blend skinning).
    deform = {b.name: b for b in rig.data.bones if b.use_deform}
    gname = {g.index: g.name for g in body.vertex_groups}
    skin = {}
    for name, b in deform.items():
        pb = rig.pose.bones[name]
        skin[name] = np.array(rig.matrix_world @ pb.matrix @ b.matrix_local.inverted() @ rig.matrix_world.inverted())
    new_rest = rest.copy()
    for i, v in enumerate(mesh.vertices):
        if w[i] <= 0:
            continue
        m = np.zeros((4, 4))
        tot = 0.0
        for g in v.groups:
            n = gname.get(g.group)
            if n in skin and g.weight > 0:
                m += g.weight * skin[n]
                tot += g.weight
        if tot <= 1e-6:
            continue
        m /= tot
        p = np.linalg.solve(m, np.append(moved[i], 1.0))
        new_rest[i] = p[:3]
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bl_util.set_mesh_coords(mesh, new_rest.astype(np.float32))
    mesh.update()
    tmesh = target.data
    bpy.data.objects.remove(target)
    bpy.data.meshes.remove(tmesh)
    return {"sculpt_fit": {"source": sf["source_blend"], "vertices_moved": int((w > 0).sum()), "pose": pose_facts,
                           "normal_hits": int(hit_ok.sum()),
                           "scale": round(k, 4), "neck_z": round(neck, 4)}}
