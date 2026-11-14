"""Bakes the fibre DIRECTION of every muscle group into the UV atlas,
computed on the 3D surface (13/11/2026, after the direction check).

    Blender -b --factory-startup --python pipeline/bake_fiber_directions.py

Why: the phase atlas (bake_fiber_fields.py) builds each fan in a flattened
chart (a cylinder unrolled around the humerus, or the front torso plane). A
straight line to the insertion in that flat chart is a curve on the real
skin wherever the surface is not a cylinder — over the shoulder cap and the
top of the chest. pipeline/check_fiber_directions.py measured 25-27 degrees
of error there. Here the direction is taken on the surface itself:

* fan: towards the group's insertion point (the same ``center`` as in
  config/fiber_map.json, turned into a 3D point), projected onto the
  triangle's tangent plane, so the fibres converge on the insertion along
  the skin;
* parallel: along the chart axis turned into 3D (limb axis / around-limb
  direction, torso x / z), projected the same way.

Each triangle's 3D direction is carried into UV with the inverse of its UV
Jacobian and splatted in doubled-angle form (a fibre has no sign). Stored
as ``fiber_dir.npz`` next to the masks: per group, the UV angle in
[0, pi) as uint8. evs/fiber_lic.py prefers it over the phase-derived
direction. The mesh, rig, masks and phase atlas are untouched.
"""

from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from evs import config, fiber_fields, muscle_eval, muscles  # noqa: E402

SUBDIV = 10  # barycentric grid per triangle for the splat
# Distance of a limb insertion from the bone axis (humeral shaft radius ~1.2-1.5 cm).
BONE_RADIUS_M = 0.015


def fan_target(spec: dict, frames: dict) -> np.ndarray:
    """The fan centre (chart-native) as a 3D point on the +X side."""
    chart, c = spec["chart"], spec["center"]
    if chart in fiber_fields.TORSO_CHARTS:
        # Torso charts are (x, z); the insertion sits at the humerus, so take
        # the depth of the shoulder joint.
        return np.array([c[0], frames["shoulder"].start[1], c[1]])
    if chart == fiber_fields.AROUND_CHART:
        a = np.radians(c[0])
        r = muscle_eval.TORSO_RADIUS
        return np.array([np.sin(a) * r, muscle_eval.TORSO_AXIS_Y - np.cos(a) * r, c[1]])
    f = frames[chart]
    a = np.radians(c[1])
    # Limb insertions are on the bone (e.g. the deltoid tuberosity), not on
    # the skin: the chart's radius_m is the skin radius used for arc metres.
    return f.start + c[0] * f.length * f.axis + BONE_RADIUS_M * (np.cos(a) * f.front + np.sin(a) * f.outer)


def parallel_dirs(spec: dict, frames: dict, points: np.ndarray) -> np.ndarray:
    au, av = spec["axis"]
    chart = spec["chart"]
    if chart in fiber_fields.TORSO_CHARTS:
        return np.broadcast_to(np.array([au, 0.0, av]), points.shape).copy()
    if chart == fiber_fields.AROUND_CHART:
        rel = points - np.array([0.0, muscle_eval.TORSO_AXIS_Y, 0.0])
        around = np.stack([-rel[:, 1], rel[:, 0], np.zeros(len(points))], axis=1)
        around /= np.maximum(np.linalg.norm(around, axis=1, keepdims=True), 1e-9)
        return au * around + av * np.array([0.0, 0.0, 1.0])
    f = frames[chart]
    _s, ang, _r = f.coords(points)
    a = np.radians(ang)[:, None]
    around = -np.sin(a) * f.front + np.cos(a) * f.outer
    return au * f.axis + av * around


def main() -> None:
    cfg = config.character_config()
    fiber_map = config.fiber_map()
    atlas_dir = config.character_dir(cfg["master_character_id"]) / "muscle_atlas"
    bpy.ops.wm.open_mainfile(filepath=str(config.character_blend(cfg["master_character_id"])))
    body = bpy.data.objects[cfg["names"]["body_object"]]
    rig = bpy.data.objects[cfg["names"]["armature_object"]]
    frames = muscle_eval.limb_frames(muscles.rest_joints(rig))
    masks = muscles.load_masks(atlas_dir)
    masks.pop("_side_left", None)
    res = next(iter(masks.values())).shape[0]

    t0 = time.time()
    mesh = body.data
    mesh.calc_loop_triangles()
    mw = np.array(body.matrix_world)
    co = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
    uv = np.empty(len(mesh.loops) * 2)
    mesh.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    tri_v = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int64)
    tri_l = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int64)
    mesh.loop_triangles.foreach_get("vertices", tri_v)
    mesh.loop_triangles.foreach_get("loops", tri_l)
    P = co[tri_v.reshape(-1, 3)]
    T = uv[tri_l.reshape(-1, 3)]

    # Mirror onto +X like the muscle map; the Jacobian is mirrored with it.
    flip = P.mean(axis=1)[:, 0] < 0
    P = np.where(flip[:, None, None], P * np.array([-1.0, 1.0, 1.0]), P)
    centroid = P.mean(axis=1)
    e1, e2 = P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]
    d1, d2 = (T[:, 1] - T[:, 0]) * res, (T[:, 2] - T[:, 0]) * res
    J = np.stack([e1, e2], axis=2) @ np.linalg.pinv(np.stack([d1, d2], axis=2))  # 3x2: texel -> metres
    normal = np.cross(e1, e2)
    normal /= np.maximum(np.linalg.norm(normal, axis=1, keepdims=True), 1e-12)

    # Barycentric grid for the splat.
    g = np.array([(i, j) for i in range(SUBDIV + 1) for j in range(SUBDIV + 1 - i)], dtype=np.float64) / SUBDIV
    bary = np.stack([1.0 - g[:, 0] - g[:, 1], g[:, 0], g[:, 1]], axis=1)
    texel = np.einsum("sk,fkc->fsc", bary, T * res)  # (faces, samples, 2)
    cols = np.clip(texel[..., 0].astype(np.int64), 0, res - 1)
    rows = np.clip(texel[..., 1].astype(np.int64), 0, res - 1)

    Jinv = np.linalg.pinv(J)  # (faces, 2, 3): metres -> texels
    packed = {}
    for name, spec in fiber_map["groups"].items():
        inside = masks[name][rows, cols] > 0
        hit = inside.any(axis=1)
        # Direction per sample point (not per triangle): triangles are large.
        pts = np.einsum("sk,fkc->fsc", bary, P[hit]).reshape(-1, 3)
        nrm = np.repeat(normal[hit], bary.shape[0], axis=0)
        if spec["type"] == "fan":
            d3 = fan_target(spec, frames)[None, :] - pts
        else:
            d3 = parallel_dirs(spec, frames, pts)
        d3 = d3 - (d3 * nrm).sum(axis=1, keepdims=True) * nrm
        duv = np.einsum("nij,nj->ni", np.repeat(Jinv[hit], bary.shape[0], axis=0), d3)
        ang2 = 2.0 * np.arctan2(duv[:, 1], duv[:, 0])
        flat = (rows[hit] * res + cols[hit]).ravel()
        c, s = np.cos(ang2), np.sin(ang2)
        cs = np.zeros((res, res, 2), dtype=np.float32)
        cs[..., 0] = np.bincount(flat, weights=c, minlength=res * res).reshape(res, res)
        cs[..., 1] = np.bincount(flat, weights=s, minlength=res * res).reshape(res, res)
        valid = np.hypot(cs[..., 0], cs[..., 1]) > 0
        cs = muscles._dilate(cs, valid, 6)
        ang = (0.5 * np.arctan2(cs[..., 1], cs[..., 0])) % np.pi
        packed[name] = np.where(masks[name] > 0, (ang / np.pi * 255.0 + 0.5).astype(np.uint8), 0).astype(np.uint8)
        print(f"[evs]   {name:26s} {spec['type']:8s} {int(hit.sum())} triangles")
    np.savez_compressed(atlas_dir / "fiber_dir.npz", **packed)
    print(f"[evs] fibre directions baked in {time.time() - t0:.1f}s -> {atlas_dir / 'fiber_dir.npz'}")


if __name__ == "__main__":
    main()
