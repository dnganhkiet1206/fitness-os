"""Nướng biến dạng thân thành blend shape cho một bài (24/11, Kiệt chọn "Nướng sẵn + blend shape").

    blender -b <bài>/<bài>_master.blend --python pipeline/bake_corrective.py -- --exercise <bài> [--max-shapes 32]

Vì sao: RealityKit chỉ có skinning tuyến tính (LBS). Ở khớp gập nhiều (vai giơ qua đầu, nách) LBS
làm da sụp, teo khúc, dính hai mặt da vào nhau — Kiệt: "cơ liên sườn dính vào cơ ngực", "tay kì".

Cách làm, mỗi khung:
1. P = vị trí LBS (như app thấy). M_i = ma trận skin trộn của đỉnh i.
2. Giải lại bề mặt (Laplacian surface editing): giữ "tọa độ vi phân" δ = L·X của tư thế gốc — tức hình
   khối cơ, rãnh cơ, nếp — chỉ XOAY theo phần quay thuần của M_i (phân rã cực), và kéo về P bằng neo
   mềm: đỉnh chỉ một xương điều khiển neo chặt, đỉnh ở khớp (trọng số trộn) thả lỏng, da dưới quần
   neo chặt (quần là khối riêng, không có hiệu chỉnh).
       min ||L x − R δ||² + Σ a_i ||x_i − P_i||²
3. Hiệu chỉnh trong không gian gốc: c_i = M_i⁻¹ (x_i − P_i) — app cộng c vào đỉnh TRƯỚC skinning
   (RealityKit áp blend shape trước skin), nên LBS(X + c) = x.
4. Mọi khung → PCA → K blend shape (`evs_c00`…) + trọng số từng khung.

Ra: `<bài>/usdz/<bài>_body_<nv>.usdz` (thân + khung xương + blend shape) và
`<bài>/usdz/<bài>_blendshapes.json` ({schema, fps, names, frames}); `export_app_demos.py` chép vào app.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "pipeline"))
if os.environ.get("EVS_PYLIB"):
    sys.path.insert(0, os.environ["EVS_PYLIB"])

import scipy.sparse as sp  # noqa: E402  (pip install --target $EVS_PYLIB scipy, dùng python của Blender)
import scipy.sparse.linalg as spla  # noqa: E402

from evs import bl_util, config  # noqa: E402


def polar_rot(M: np.ndarray) -> np.ndarray:
    """Phần quay thuần của từng ma trận 3x3 (n,3,3)."""
    U, _s, Vt = np.linalg.svd(M)
    R = U @ Vt
    bad = np.linalg.det(R) < 0
    if bad.any():
        U[bad, :, -1] *= -1
        R[bad] = U[bad] @ Vt[bad]
    return R


def skin_matrices(body, rig, W: np.ndarray, names: list[str]) -> np.ndarray:
    """Ma trận skin trộn (n,3,4) trong hệ thân, như modifier Armature (LBS)."""
    bw = np.array(body.matrix_world)
    bwi = np.linalg.inv(bw)
    rw = np.array(rig.matrix_world)
    mats = []
    for nm in names:
        pb = rig.pose.bones.get(nm)
        if pb is None:
            mats.append(np.eye(4))
            continue
        m = bwi @ rw @ np.array(pb.matrix) @ np.linalg.inv(np.array(pb.bone.matrix_local)) @ np.linalg.inv(rw) @ bw
        mats.append(m)
    B = np.stack(mats)[:, :3, :]  # (b,3,4)
    tot = W.sum(1, keepdims=True)
    Wn = W / np.maximum(tot, 1e-9)
    return np.einsum("nb,bij->nij", Wn, B)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--exercise", required=True)
    ap.add_argument("--max-shapes", type=int, default=32)
    ap.add_argument("--tol-mm", type=float, default=0.6)
    ap.add_argument("--anchor", type=float, default=float(os.environ.get("EVS_ANCHOR", "2.0")))
    ap.add_argument("--anchor-power", type=float, default=float(os.environ.get("EVS_ANCHOR_POW", "8")))
    ap.add_argument("--no-export", action="store_true")
    args = bl_util.script_args(ap)
    t0 = time.time()
    scene = bpy.context.scene
    body = max((o for o in bpy.data.objects if o.type == "MESH" and o.find_armature()), key=lambda o: len(o.data.vertices))
    rig = body.find_armature()
    shorts = [o for o in bpy.data.objects if o.type == "MESH" and o is not body and o.find_armature() is rig]
    me = body.data
    n = len(me.vertices)
    X = bl_util.mesh_coords(me).astype(float)
    E = np.array([e.vertices[:] for e in me.edges])

    names = [b.name for b in rig.data.bones if b.use_deform and b.name in body.vertex_groups]
    col = {body.vertex_groups[nm].index: j for j, nm in enumerate(names)}
    W = np.zeros((n, len(names)))
    for v in me.vertices:
        for g in v.groups:
            j = col.get(g.group)
            if j is not None:
                W[v.index, j] = g.weight
    Wn = W / np.maximum(W.sum(1, keepdims=True), 1e-9)

    # neo: đỉnh một xương (w_max≈1) neo chặt, đỉnh khớp thả lỏng
    wmax = Wn.max(1)
    a = args.anchor * wmax ** args.anchor_power
    # da dưới quần: neo chặt (quần không có hiệu chỉnh, không được xuyên)
    if shorts:
        from mathutils import kdtree
        sc = np.concatenate([np.array([tuple(shorts[0].matrix_world @ v.co) for v in s.data.vertices]) for s in shorts])
        kd = kdtree.KDTree(len(sc))
        for i, c in enumerate(sc):
            kd.insert(c, i)
        kd.balance()
        bw = np.array(body.matrix_world)
        Xw = X @ bw[:3, :3].T + bw[:3, 3]
        near = np.array([kd.find(c)[2] < 0.025 for c in Xw])
        a[near] = np.maximum(a[near], 50.0)
    # Laplacian đồng đều
    deg = np.bincount(E.ravel(), minlength=n).astype(float)
    rows = np.concatenate([E[:, 0], E[:, 1], np.arange(n)])
    cols = np.concatenate([E[:, 1], E[:, 0], np.arange(n)])
    vals = np.concatenate([-1.0 / deg[E[:, 0]], -1.0 / deg[E[:, 1]], np.ones(n)])
    L = sp.csr_matrix((vals, (rows, cols)), shape=(n, n))
    delta = L @ X
    A = (L.T @ L + sp.diags(a)).tocsc()
    lu = spla.splu(A)
    print(f"[corr] {n} verts, factorised in {time.time() - t0:.1f}s; free (a<0.1): {(a < 0.1).sum()}")

    arm_mod = next(m for m in body.modifiers if m.type == "ARMATURE")
    others = [m for m in body.modifiers if m is not arm_mod and m.show_viewport]
    for m in others:
        m.show_viewport = False
    f0, f1 = scene.frame_start, scene.frame_end
    # Nguồn MHR (24/11): dịch chuyển thế giới từng khung do hình sửa của MHR (fit_mhr.py), thay cho giải Laplacian.
    ext = np.load(os.environ["EVS_CORR_NPZ"])["D"] if os.environ.get("EVS_CORR_NPZ") else None
    gain = float(os.environ.get("EVS_CORR_GAIN", "1.0"))
    C = []
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        S = skin_matrices(body, rig, W, names)
        M3 = S[:, :, :3]
        if ext is not None:
            c = np.einsum("nij,nj->ni", np.linalg.inv(M3), ext[f - f0].astype(float) * gain)
            C.append(c.ravel())
            continue
        P = np.einsum("nij,nj->ni", M3, X) + S[:, :, 3]
        R = polar_rot(M3)
        rd = np.einsum("nij,nj->ni", R, delta)
        rhs = L.T @ rd + a[:, None] * P
        x = np.stack([lu.solve(rhs[:, k]) for k in range(3)], 1)
        c = np.einsum("nij,nj->ni", np.linalg.inv(M3), x - P)
        C.append(c.ravel())
    for m in others:
        m.show_viewport = True
    C = np.array(C)
    print(f"[corr] {len(C)} frames solved in {time.time() - t0:.1f}s; max |c| {np.abs(C).max() * 1000:.1f} mm")

    # PCA
    U, s, Vt = np.linalg.svd(C, full_matrices=False)
    K = 0
    for k in range(1, min(args.max_shapes, len(s)) + 1):
        err = np.abs(C - (U[:, :k] * s[:k]) @ Vt[:k]).reshape(len(C), n, 3)
        if np.linalg.norm(err, axis=2).max() * 1000 <= args.tol_mm:
            K = k
            break
        K = k
    coef = U[:, :K] * s[:K]
    scale = np.maximum(np.abs(coef).max(0), 1e-9)
    weights = coef / scale
    comps = Vt[:K] * scale[:, None]
    err = np.linalg.norm((C - weights @ comps).reshape(len(C), n, 3), axis=2).max() * 1000
    print(f"[corr] PCA: {K} shapes, max reconstruction error {err:.2f} mm")

    if body.data.shape_keys is None:
        body.shape_key_add(name="Basis", from_mix=False)
    snames = []
    for k in range(K):
        nm = f"evs_c{k:02d}"
        key = body.data.shape_keys.key_blocks.get(nm) or body.shape_key_add(name=nm, from_mix=False)
        key.data.foreach_set("co", (X + comps[k].reshape(n, 3)).astype(np.float32).ravel())
        snames.append(nm)
    # điều khiển trong Blender (để soi / QA): driver theo khung → fcurve trực tiếp
    for k, nm in enumerate(snames):
        kb = body.data.shape_keys.key_blocks[nm]
        kb.slider_min, kb.slider_max = -10.0, 10.0
        for i, f in enumerate(range(f0, f1 + 1)):
            kb.value = float(weights[i, k])
            kb.keyframe_insert("value", frame=f)
    ex = args.exercise
    exdir = ROOT / ex
    char_id = config.load_json(exdir / "exercise.json").get("master_character_id", "master_character_003")
    num = char_id.rsplit("_", 1)[-1]
    prefix = ex.replace("-", "_")
    track = {"schema": 1, "fps": scene.render.fps / scene.render.fps_base, "names": snames,
             "frames": [[round(float(v), 5) for v in row] for row in weights]}
    (exdir / "usdz").mkdir(exist_ok=True)
    (exdir / "usdz" / f"{prefix}_blendshapes.json").write_text(json.dumps(track, separators=(",", ":")))
    facts = {"shapes": K, "frames": len(C), "max_error_mm": round(float(err), 3),
             "max_correction_mm": round(float(np.abs(C).max() * 1000), 1), "anchor": args.anchor,
             "anchor_power": args.anchor_power}
    (exdir / "corrective_facts.json").write_text(json.dumps(facts, indent=1))
    bpy.ops.wm.save_mainfile()
    if not args.no_export:
        from export_usdz import USD_EXPORT
        scene.frame_set(f0)
        for kb in body.data.shape_keys.key_blocks:
            kb.value = 0.0 if kb.name != "Basis" else kb.value
        bpy.ops.object.select_all(action="DESELECT")
        rig.select_set(True)
        body.select_set(True)
        bpy.context.view_layer.objects.active = body
        opts = dict(USD_EXPORT)
        opts["export_shapekeys"] = True
        out = exdir / "usdz" / f"{prefix}_body_{num}.usdz"
        bpy.ops.wm.usd_export(filepath=str(out), export_animation=False, **opts)
        print(f"[corr] body {out} {out.stat().st_size} bytes")
    print(f"[corr] done in {time.time() - t0:.1f}s {facts}")


if __name__ == "__main__":
    main()
