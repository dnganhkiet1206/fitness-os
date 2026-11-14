"""Checks the drawn fibre directions against anatomy, independently of
config/fiber_map.json (Kiệt 13/11: "kiểm tra xem các hướng sợi cơ đã đúng
chưa").

    Blender -b --factory-startup --python pipeline/check_fiber_directions.py

For every body triangle inside a checked muscle group:

* measured: the fibre direction the painted texture actually draws there —
  the LIC direction in UV (evs/fiber_lic.direction_from_phase on the baked
  phase atlas), carried to 3D through the triangle's UV Jacobian;
* expected: the anatomical direction from rig landmarks only, never from
  fiber_map.json. Fan muscles point at their insertion on the humerus
  (pectoralis major: lateral lip of the intertubercular groove, ~12 % down
  the humerus; anterior deltoid: deltoid tuberosity, ~45 % down); the
  triceps runs along the humerus (shoulder -> elbow). Both are projected
  onto the triangle's tangent plane.

The error is the unsigned angle between the two (fibres have no
direction), area-weighted. Results per group and per sub-region go to
characters/<id>/muscle_atlas/fiber_direction_check.json.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from evs import config, fiber_lic, muscles  # noqa: E402

# Fraction of the way from shoulder to elbow, and forward offset (m), of each
# insertion landmark. Forward is -Y in Blender (the character faces -Y).
INSERTIONS = {
    # Lateral lip of the intertubercular groove: ~5-6 cm below the top of the
    # humeral head on a ~30 cm humerus.
    "pectoralis_major": (0.17, 0.02),
    # Deltoid tuberosity: anterolateral face of the humeral shaft, mid-way.
    "deltoid_anterior": (0.45, 0.0),
}
PARALLEL_TO_HUMERUS = ("triceps_brachii",)
PASS_MEDIAN_DEG = 20.0
PASS_P90_DEG = 35.0


def weighted_percentile(values: np.ndarray, weights: np.ndarray, q: float) -> float:
    order = np.argsort(values)
    v, w = values[order], weights[order]
    c = np.cumsum(w)
    return float(v[np.searchsorted(c, q / 100.0 * c[-1])])


def main() -> None:
    cfg = config.character_config()
    atlas_dir = config.character_dir(cfg["master_character_id"]) / "muscle_atlas"
    bpy.ops.wm.open_mainfile(filepath=str(config.character_blend(cfg["master_character_id"])))
    body = bpy.data.objects[cfg["names"]["body_object"]]
    rig = bpy.data.objects[cfg["names"]["armature_object"]]
    joints = {k: np.array(v) for k, v in muscles.rest_joints(rig).items()}
    shoulder, elbow = joints["shoulder"], joints["elbow"]
    if shoulder[0] < 0:  # the check works on the +X side
        shoulder, elbow = shoulder * [-1, 1, 1], elbow * [-1, 1, 1]
    humerus = elbow - shoulder

    masks = dict(np.load(atlas_dir / "masks.npz"))
    phase = dict(np.load(atlas_dir / "fiber_phase.npz"))
    res = masks["pectoralis_major"].shape[0]
    groups = list(INSERTIONS) + list(PARALLEL_TO_HUMERUS)
    dir_path = atlas_dir / "fiber_dir.npz"
    angles = dict(np.load(dir_path)) if dir_path.exists() else {}
    source = "fiber_dir.npz (surface-baked)" if angles else "fiber_phase.npz (chart phase)"
    print(f"[evs] measured directions from {source}")
    dirs = {g: fiber_lic.direction_from_angle(angles[g]) if g in angles else fiber_lic.direction_from_phase(phase[g])
            for g in groups}

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

    centroid = P.mean(axis=1)
    tc = T.mean(axis=1)
    col = np.clip((tc[:, 0] * res).astype(int), 0, res - 1)
    row = np.clip((tc[:, 1] * res).astype(int), 0, res - 1)
    e1, e2 = P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]
    d1, d2 = T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]
    det = d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0]
    ok = np.abs(det) > 1e-12
    inv = 1.0 / np.where(ok, det, 1.0)
    dPdu = (e1 * d2[:, 1:2] - e2 * d1[:, 1:2]) * inv[:, None]
    dPdv = (e2 * d1[:, 0:1] - e1 * d2[:, 0:1]) * inv[:, None]
    normal = np.cross(e1, e2)
    area = np.linalg.norm(normal, axis=1) * 0.5
    normal /= np.maximum(np.linalg.norm(normal, axis=1, keepdims=True), 1e-12)

    # Mirror the -X side onto +X (the atlas and the anatomy are symmetric).
    flip = centroid[:, 0] < 0
    sgn = np.where(flip, -1.0, 1.0)[:, None] * np.array([1.0, 0.0, 0.0]) + np.array([0.0, 1.0, 1.0])
    centroid, dPdu, dPdv, normal = centroid * sgn, dPdu * sgn, dPdv * sgn, normal * sgn

    def tangent(v: np.ndarray) -> np.ndarray:
        v = v - (v * normal).sum(axis=1, keepdims=True) * normal
        return v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-12)

    report = {"method": __doc__.split("\n\n")[1].strip(), "measured_from": source, "pass_median_deg": PASS_MEDIAN_DEG,
              "pass_p90_deg": PASS_P90_DEG, "groups": {}}
    forward = np.array([0.0, -1.0, 0.0])
    for g in groups:
        sel = ok & (masks[g][row, col] > 127)
        dx, dy = dirs[g]
        measured = tangent(dPdu * dx[row, col][:, None] + dPdv * dy[row, col][:, None])
        if g in INSERTIONS:
            frac, fwd = INSERTIONS[g]
            target = shoulder + frac * humerus + fwd * forward
            if g == "deltoid_anterior":
                ax = humerus / np.linalg.norm(humerus)
                front = forward - forward.dot(ax) * ax
                front /= np.linalg.norm(front)
                outer = np.cross(front, ax)
                outer = outer if outer[0] > 0 else -outer
                target = target + 0.015 * (0.5 * front + 0.866 * outer)
            expected = tangent(target[None, :] - centroid)
        else:
            expected = tangent(np.broadcast_to(humerus, centroid.shape).copy())
        cosang = np.clip(np.abs((measured * expected).sum(axis=1)), 0.0, 1.0)
        err = np.degrees(np.arccos(cosang))
        e, w = err[sel], area[sel]
        entry = {"triangles": int(sel.sum()),
                 "median_deg": round(weighted_percentile(e, w, 50), 1),
                 "p90_deg": round(weighted_percentile(e, w, 90), 1),
                 "mean_deg": round(float((e * w).sum() / w.sum()), 1)}
        if g == "pectoralis_major":
            # Upper (clavicular), middle and lower thirds by height.
            z = centroid[sel, 2]
            lo, hi = np.percentile(z, [33, 67])
            for name, m in (("upper_clavicular", z >= hi), ("middle_sternal", (z >= lo) & (z < hi)), ("lower_abdominal", z < lo)):
                entry[name] = {"median_deg": round(weighted_percentile(e[m], w[m], 50), 1),
                               "p90_deg": round(weighted_percentile(e[m], w[m], 90), 1)}
        entry["pass"] = entry["median_deg"] <= PASS_MEDIAN_DEG and entry["p90_deg"] <= PASS_P90_DEG
        report["groups"][g] = entry
        print(f"[evs] {g:20s} median {entry['median_deg']:5.1f} deg, p90 {entry['p90_deg']:5.1f} deg -> {'PASS' if entry['pass'] else 'FAIL'}")
        for k in ("upper_clavicular", "middle_sternal", "lower_abdominal"):
            if k in entry:
                print(f"[evs]     {k:18s} median {entry[k]['median_deg']:5.1f}, p90 {entry[k]['p90_deg']:5.1f}")
    config.save_json(atlas_dir / "fiber_direction_check.json", report)


if __name__ == "__main__":
    main()
