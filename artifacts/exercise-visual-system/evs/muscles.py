"""Muscle atlas: bakes the muscle map of a character into one mask image per
group (in the character's UV space) and composes per-exercise highlight maps
from them. The character mesh is never modified."""

from __future__ import annotations

from pathlib import Path

import bpy
import numpy as np

from . import bl_util, fibers as fibers_mod, muscle_eval, pngio

ARM_BONES = ("upperarm", "lowerarm", "hand", "index_01", "index_02", "index_03", "middle_01", "middle_02", "middle_03",
             "ring_01", "ring_02", "ring_03", "pinky_01", "pinky_02", "pinky_03", "thumb_01", "thumb_02", "thumb_03")
LEG_BONES = ("thigh", "calf", "foot", "ball")
HEAD_BONES = ("head",)


def rest_joints(rig: bpy.types.Object) -> dict:
    return {
        "shoulder": list(bl_util.bone_world(rig, "upperarm_l")),
        "elbow": list(bl_util.bone_world(rig, "lowerarm_l")),
        "wrist": list(bl_util.bone_world(rig, "hand_l")),
        "hip": list(bl_util.bone_world(rig, "thigh_l")),
        "knee": list(bl_util.bone_world(rig, "calf_l")),
        "ankle": list(bl_util.bone_world(rig, "foot_l")),
    }


def _gate_weights(body: bpy.types.Object) -> np.ndarray:
    def total(stems: tuple[str, ...], sided: bool = True) -> np.ndarray:
        names = [f"{s}_{side}" for s in stems for side in ("l", "r")] if sided else list(stems)
        return bl_util.group_weights(body, names).sum(axis=1)

    return np.stack([total(ARM_BONES), total(LEG_BONES), total(HEAD_BONES, sided=False)], axis=1).astype(np.float32)


def _surface_samples(body: bpy.types.Object, resolution: int, chunk: int = 300_000):
    """Yields batches of surface samples that cover every texel the body's UV
    map uses: (points, normals, gate weights, texel column, texel row, side).
    Each face is sampled on a bilinear grid a little denser than its texels."""
    mesh = body.data
    co = bl_util.mesh_coords(mesh).astype(np.float32)
    no = bl_util.mesh_normals(mesh).astype(np.float32)
    gate = _gate_weights(body)
    uv = np.empty(len(mesh.loops) * 2, dtype=np.float32)
    mesh.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)

    corners_v, corners_uv = [], []
    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        if len(loops) == 3:
            loops.append(loops[2])
        elif len(loops) != 4:
            continue
        corners_v.append([mesh.loops[i].vertex_index for i in loops])
        corners_uv.append(uv[loops])
    corners_v = np.asarray(corners_v)
    corners_uv = np.asarray(corners_uv) * resolution
    span = (corners_uv.max(axis=1) - corners_uv.min(axis=1)).max(axis=1)
    keep = span > 1e-4  # faces without a real UV footprint (the new face patch)
    corners_v, corners_uv, span = corners_v[keep], corners_uv[keep], span[keep]
    steps = np.clip(np.ceil(span * 1.5).astype(int) + 2, 2, 160)

    for n in np.unique(steps):
        sel = np.flatnonzero(steps == n)
        t = np.linspace(0.0, 1.0, int(n), dtype=np.float32)
        a, b = np.meshgrid(t, t)
        w = np.stack([(1 - a) * (1 - b), a * (1 - b), a * b, (1 - a) * b], axis=-1).reshape(-1, 4)  # (n*n, 4)
        per_batch = max(1, chunk // len(w))
        for start in range(0, len(sel), per_batch):
            faces = sel[start : start + per_batch]
            v = corners_v[faces]  # (F, 4)
            points = np.einsum("sk,fkc->fsc", w, co[v]).reshape(-1, 3)
            normals = np.einsum("sk,fkc->fsc", w, no[v]).reshape(-1, 3)
            normals /= np.linalg.norm(normals, axis=1, keepdims=True) + 1e-12
            weights = np.einsum("sk,fkc->fsc", w, gate[v]).reshape(-1, gate.shape[1])
            texel = np.einsum("sk,fkc->fsc", w, corners_uv[faces]).reshape(-1, 2)
            col = np.clip(texel[:, 0].astype(int), 0, resolution - 1)
            row = np.clip(texel[:, 1].astype(int), 0, resolution - 1)
            yield points, normals, weights, col, row


def _dilate(image: np.ndarray, valid: np.ndarray, passes: int) -> np.ndarray:
    """Grows the baked area outwards so bilinear filtering and mip levels do
    not pull in empty texels along UV seams."""
    image = image.astype(np.float32)
    valid = valid.copy()
    for _ in range(passes):
        acc = np.zeros_like(image)
        cnt = np.zeros(valid.shape, dtype=np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                shifted_valid = np.roll(np.roll(valid, dy, axis=0), dx, axis=1)
                shifted = np.roll(np.roll(image, dy, axis=0), dx, axis=1)
                acc += np.where(shifted_valid[..., None] if image.ndim == 3 else shifted_valid, shifted, 0.0)
                cnt += shifted_valid
        fill = (~valid) & (cnt > 0)
        if image.ndim == 3:
            image[fill] = acc[fill] / cnt[fill][:, None]
        else:
            image[fill] = acc[fill] / cnt[fill]
        valid |= fill
    return image


def bake_atlas(body: bpy.types.Object, rig: bpy.types.Object, muscle_map: dict, out_dir: Path) -> dict:
    """Writes masks.npz (all groups, uint8, row 0 = v 0) and one PNG per group
    for inspection. Returns coverage facts for the character report."""
    res = int(muscle_map["atlas_resolution"])
    joints = rest_joints(rig)
    names = list(muscle_map["groups"].keys())
    masks = {n: np.zeros((res, res), dtype=np.uint8) for n in names}
    side = np.zeros((res, res), dtype=np.uint8)
    valid = np.zeros((res, res), dtype=bool)
    samples = 0
    for points, normals, weights, col, row in _surface_samples(body, res):
        left = points[:, 0] >= 0.0
        mirrored = points.astype(np.float64)
        mirrored[:, 0] = np.abs(mirrored[:, 0])
        n_m = normals.astype(np.float64)
        n_m[:, 0] = np.where(left, n_m[:, 0], -n_m[:, 0])
        values = muscle_eval.evaluate_groups(muscle_map, joints, mirrored, n_m, weights.astype(np.float64))
        for n in names:
            masks[n][row, col] = (values[n] * 255.0 + 0.5).astype(np.uint8)
        side[row, col] = np.where(left, 255, 0)
        valid[row, col] = True
        samples += len(points)

    out_dir.mkdir(parents=True, exist_ok=True)
    facts = {"atlas_resolution": res, "samples": int(samples), "uv_coverage": round(float(valid.mean()), 4), "groups": {}}
    packed = {}
    for n in names:
        m = np.clip(_dilate(masks[n], valid, 6) + 0.5, 0, 255).astype(np.uint8)
        packed[n] = m
        pngio.write_png(out_dir / f"{n}.png", np.flipud(m)[::2, ::2])
        facts["groups"][n] = {"texels": int((m > 127).sum()), "label": muscle_map["groups"][n]["label"]}
    packed["_side_left"] = np.clip(_dilate(side, valid, 6) + 0.5, 0, 255).astype(np.uint8)
    np.savez_compressed(out_dir / "masks.npz", **packed)
    return facts


def load_masks(atlas_dir: Path) -> dict[str, np.ndarray]:
    with np.load(Path(atlas_dir) / "masks.npz") as data:
        return {k: data[k] for k in data.files}


def write_highlight_map(atlas_dir: Path, path: Path, primary: list[str], secondary: list[str], stabilizing: list[str], size: int | None = None,
                        fibers: bool = False, fiber_seed: int = 7) -> np.ndarray:
    """Composes and saves the RGB highlight map of one exercise. With
    ``fibers``, the role channels are modulated by fibre striations: from
    the baked phase atlas (origin/insertion fields, see evs/fiber_fields.py)
    when the atlas has one, otherwise from the per-group PCA fallback in
    evs/fibers.py. The atlas regions themselves are untouched either way."""
    masks = load_masks(atlas_dir)
    side = masks.get("_side_left")
    masks.pop("_side_left", None)
    rgb = muscle_eval.compose_highlight(masks, primary, secondary, stabilizing)
    if fibers:
        phase = fibers_mod.load_phase_fields(atlas_dir)
        roles = {"primary": primary, "secondary": secondary, "stabilizing": stabilizing}
        if phase is not None:
            print("[evs] highlight: fibre striations from the baked phase atlas (origin/insertion fields)")
            rgb = fibers_mod.apply_fiber_phase(rgb, phase, roles, seed=fiber_seed)
        else:
            print("[evs] highlight: fibre striations from the PCA fallback (no fiber_phase.npz in the atlas)")
            with_side = dict(masks)
            if side is not None:
                with_side["_side_left"] = side
            rgb = fibers_mod.apply_fibers(rgb, with_side, roles, seed=fiber_seed)
    if size and size < rgb.shape[0]:
        f = rgb.shape[0] // size
        rgb = rgb.reshape(size, f, size, f, 3).mean(axis=(1, 3)).astype(np.uint8)
    pngio.write_png(path, np.flipud(rgb))
    return rgb


DEBUG_COLORS = [
    (230, 60, 50), (240, 150, 40), (250, 210, 60), (120, 200, 80), (60, 180, 160), (70, 140, 230), (150, 100, 220),
    (220, 90, 170), (160, 110, 70), (90, 90, 200), (200, 200, 90), (80, 200, 220), (230, 120, 110), (110, 160, 60),
    (180, 60, 120), (60, 110, 110), (250, 170, 120), (130, 220, 160), (200, 130, 240), (40, 60, 150), (250, 240, 150),
]


def write_debug_map(atlas_dir: Path, path: Path) -> None:
    """Every group in its own colour on a grey body, for checking placement."""
    masks = load_masks(atlas_dir)
    masks.pop("_side_left", None)
    first = next(iter(masks.values()))
    rgb = np.full(first.shape + (3,), 128.0, dtype=np.float32)
    for i, (_name, m) in enumerate(masks.items()):
        a = (m.astype(np.float32) / 255.0)[..., None]
        rgb = rgb * (1 - a) + np.array(DEBUG_COLORS[i % len(DEBUG_COLORS)], dtype=np.float32) * a
    pngio.write_png(path, np.flipud(rgb.astype(np.uint8)))
