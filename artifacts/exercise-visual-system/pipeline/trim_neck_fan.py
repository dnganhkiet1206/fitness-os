"""Applies the ``neck_fan`` limit of muscle_map.json to the masks already baked, without a full
re-bake (17/11: the upper trapezius coloured the whole side of the neck up under the ear).

    Blender -b --factory-startup --python pipeline/trim_neck_fan.py [-- --dry-run]

Why not bake_muscle_atlas.py: a full bake takes ~18 min and, on 17/11, did not reproduce the
committed masks (trapezius_upper 86k texels against 161k), so it would change every muscle at
once. This script touches only the groups that have ``neck_fan`` (and the aggregates that
contain them), on the texels of the neck triangles, with the same function the bake now uses
(``muscle_eval.neck_fan``). Run export_muscle_shader_maps.py afterwards for the app maps.
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from evs import bl_util, config, muscle_eval, pngio  # noqa: E402

# The bake dilates every mask 6 texels past the UV islands (muscles._dilate); the factor is
# carried into that padding the same way so seams do not keep the old colour.
PADDING = 6


def neck_texels(body: bpy.types.Object, res: int, min_z: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Rest-pose 3D point of every texel centre covered by a triangle reaching above ``min_z``.
    Rows count from v = 0, like masks.npz."""
    me = body.data
    me.calc_loop_triangles()
    uv = me.uv_layers.active.data
    P = np.array([body.matrix_world @ v.co for v in me.vertices])
    rows, cols, pts = [], [], []
    for t in me.loop_triangles:
        p = P[list(t.vertices)]
        if p[:, 2].max() < min_z:
            continue
        q = np.array([uv[i].uv for i in t.loops]) * res
        x0, y0 = np.floor(q.min(0)).astype(int)
        x1, y1 = np.ceil(q.max(0)).astype(int)
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        xs, ys = xs.ravel(), ys.ravel()
        (ax, ay), (bx, by), (cx, cy) = q
        det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(det) < 1e-12:
            continue
        w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / det
        w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / det
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not inside.any():
            continue
        pts.append(w0[inside, None] * p[0] + w1[inside, None] * p[1] + w2[inside, None] * p[2])
        cols.append(np.clip(np.floor(xs[inside]).astype(int), 0, res - 1))
        rows.append(np.clip(np.floor(ys[inside]).astype(int), 0, res - 1))
    return np.concatenate(rows), np.concatenate(cols), np.concatenate(pts)


def spread_into_padding(factor: np.ndarray, covered: np.ndarray, steps: int) -> np.ndarray:
    """Carries the factor of covered texels into the uncovered ones next to them (min of the
    3x3 neighbourhood), ``steps`` texels deep."""
    out = factor.copy()
    known = covered.copy()
    for _ in range(steps):
        best = np.where(known, out, 2.0)
        neighbour = np.full_like(out, 2.0)
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                neighbour = np.minimum(neighbour, np.roll(np.roll(best, dr, 0), dc, 1))
        grow = ~known & (neighbour <= 1.0)
        out[grow] = neighbour[grow]
        known |= grow
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="print the texel counts, write nothing")
    args = bl_util.script_args(parser)

    cfg = config.character_config()
    muscle_map = config.muscle_map()
    atlas_dir = config.character_dir(cfg["master_character_id"]) / "muscle_atlas"
    bpy.ops.wm.open_mainfile(filepath=str(config.character_blend(cfg["master_character_id"])))
    body = bpy.data.objects[cfg["names"]["body_object"]]

    fans = {n: g["neck_fan"] for n, g in muscle_map["groups"].items() if "neck_fan" in g}
    if not fans:
        print("[evs] no group has neck_fan, nothing to do")
        return
    masks = dict(np.load(atlas_dir / "masks.npz"))
    res = next(iter(masks.values())).shape[0]
    min_z = min(fan["half_angle_deg"][0][0] for fan in fans.values()) - 0.02
    rows, cols, points = neck_texels(body, res, min_z)
    covered = np.zeros((res, res), dtype=bool)
    covered[rows, cols] = True

    facts = config.load_json(atlas_dir / "atlas_facts.json")
    for name, fan in fans.items():
        factor = np.ones((res, res), dtype=np.float64)
        f = muscle_eval.neck_fan(fan, points)
        # Two triangles can share a texel centre on a seam: keep the smaller factor.
        np.minimum.at(factor, (rows, cols), f)
        factor = spread_into_padding(factor, covered, PADDING)
        targets = [name] + [a for a, parts in muscle_map.get("aggregates", {}).items() if name in parts]
        for target in targets:
            before = int((masks[target] > 127).sum())
            masks[target] = np.clip(masks[target] * factor + 0.5, 0, 255).astype(np.uint8)
            after = int((masks[target] > 127).sum())
            print(f"[evs] {target:20s} {before:8d} -> {after:8d} texels")
            if target in facts.get("groups", {}):
                facts["groups"][target]["texels"] = after
            if not args.dry_run and (atlas_dir / f"{target}.png").exists():
                pngio.write_png(atlas_dir / f"{target}.png", np.flipud(masks[target])[::2, ::2])
    if args.dry_run:
        return
    np.savez_compressed(atlas_dir / "masks.npz", **masks)
    config.save_json(atlas_dir / "atlas_facts.json", facts)
    print(f"[evs] wrote {atlas_dir / 'masks.npz'}")


if __name__ == "__main__":
    main()
