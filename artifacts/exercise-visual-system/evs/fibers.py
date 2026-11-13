"""Muscle-fibre striations for the highlight map. Plain numpy, no bpy, so it
is unit-tested outside Blender.

The flat role tint of ``muscle_eval.compose_highlight`` reads as painted-on
colour. Lyfta-style demos instead show the fibres themselves: fine striations
that follow each muscle's fibre direction and light up where the muscle
works. This module draws those striations into the highlight map, so every
consumer of the map — the Blender shader (tint + emission), the GLB albedo
bake and the USDZ export materials — shows fibres without any change to its
own code, and the muscle atlas regions themselves are never touched.

Direction: the atlas stores only masks, no fibre directions, so each group's
fibre axis is the principal axis of its own mask (weighted PCA over texels),
computed separately for the left and right halves of the body (the atlas
``_side_left`` mask) because one mask covers both sides. Fan-shaped muscles
(pectoralis major) get one average axis; that is an approximation, recorded
here, not anatomy. Groups too small for a stable axis fall back to vertical
stripes plus noise.

The striation field varies across the fibre direction, so the visible lines
run along the fibres. A seeded value-noise wobble keeps the lines organic
instead of mechanically parallel. Output is deterministic for a given seed.
"""

from __future__ import annotations

import numpy as np

# Striation valleys never drop below this fraction of the role mask, so the
# highlight stays readable at small sizes and mip levels keep some signal.
DEFAULT_FLOOR = 0.45
# Stripes across a muscle: enough to read as fibres, never so fine that a
# texel cannot resolve them (sub-texel spacing aliases into flat noise).
TARGET_STRIPES = 16
MIN_SPACING_PX = 3.0
# Minimum texels (above half mask) for a side to get its own PCA axis.
MIN_SIDE_TEXELS = 200


def _pca_axis(coords: np.ndarray, weights: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """Principal axis, perpendicular axis, weighted centroid and the
    perpendicular extent (4 sigma) of weighted 2D points."""
    total = float(weights.sum())
    centroid = (coords * weights[:, None]).sum(axis=0) / total
    centred = coords - centroid
    cov = (centred * weights[:, None]).T @ centred / total
    values, vectors = np.linalg.eigh(cov)
    order = np.argsort(values)[::-1]
    values, vectors = values[order], vectors[:, order]
    axis = vectors[:, 0]
    perp = vectors[:, 1]
    extent = 4.0 * float(np.sqrt(max(values[1], 0.0)))
    return axis, perp, centroid, extent


def _value_noise(shape: tuple[int, int], cells: int, rng: np.random.Generator) -> np.ndarray:
    """Smooth random field in [0, 1]: coarse random grid, bilinearly upsampled."""
    grid = rng.random((cells + 1, cells + 1))
    ys = np.linspace(0, cells, shape[0])
    xs = np.linspace(0, cells, shape[1])
    y0 = np.clip(np.floor(ys).astype(int), 0, cells - 1)
    x0 = np.clip(np.floor(xs).astype(int), 0, cells - 1)
    fy = np.clip(ys - y0, 0.0, 1.0)[:, None]
    fx = np.clip(xs - x0, 0.0, 1.0)[None, :]
    top = grid[y0][:, x0] * (1 - fx) + grid[y0][:, x0 + 1] * fx
    bottom = grid[y0 + 1][:, x0] * (1 - fx) + grid[y0 + 1][:, x0 + 1] * fx
    return top * (1 - fy) + bottom * fy


def _side_field(mask: np.ndarray, side: np.ndarray, is_left: bool, rng: np.random.Generator) -> np.ndarray:
    """Striation field in [0, 1] for one half of one muscle group. Zeros
    outside the group's bbox; the caller applies it only inside the mask."""
    h, w = mask.shape
    region = (mask > 127) & (side if is_left else ~side)
    ys, xs = np.nonzero(region)
    if len(xs) < MIN_SIDE_TEXELS:
        # Too small for a stable axis: vertical stripes plus noise.
        field = 0.5 + 0.5 * np.sin(2.0 * np.pi * np.arange(w, dtype=np.float64)[None, :] / max(w / 16.0, 1.0))
        return np.broadcast_to(field, (h, w)).copy() * (0.9 + 0.1 * _value_noise((h, w), 8, rng))
    step = max(1, len(xs) // 20000)
    coords = np.stack([xs[::step], ys[::step]], axis=1).astype(np.float64)
    weights = mask[ys[::step], xs[::step]].astype(np.float64)
    _axis, perp, centroid, extent = _pca_axis(coords, weights)
    # Bounding box of the region, padded by one stripe, to keep the work small.
    pad = 24
    x0, x1 = max(0, int(xs.min()) - pad), min(w, int(xs.max()) + pad + 1)
    y0, y1 = max(0, int(ys.min()) - pad), min(h, int(ys.max()) + pad + 1)
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float64)
    across = (xx - centroid[0]) * perp[0] + (yy - centroid[1]) * perp[1]
    spacing = max(extent / TARGET_STRIPES, MIN_SPACING_PX) if extent > 0 else MIN_SPACING_PX
    wobble = (_value_noise((y1 - y0, x1 - x0), 6, rng) - 0.5) * 2.0
    field = np.zeros((h, w), dtype=np.float64)
    field[y0:y1, x0:x1] = 0.5 + 0.5 * np.sin(2.0 * np.pi * across / spacing + wobble)
    grain = 0.92 + 0.08 * _value_noise((y1 - y0, x1 - x0), 24, rng)
    field[y0:y1, x0:x1] *= grain
    return field


def group_fiber_field(mask: np.ndarray, side: np.ndarray | None, rng: np.random.Generator) -> np.ndarray:
    """Striation field in [0, 1] for one muscle group, both sides combined.
    ``mask`` is uint8 (row 0 = v 0, as in masks.npz); ``side`` is the atlas
    ``_side_left`` mask or None to treat the body as one piece."""
    mask = np.asarray(mask)
    if side is None:
        side = np.ones(mask.shape, dtype=bool)
    else:
        side = np.asarray(side) >= 128
    left = _side_field(mask, side, True, rng)
    right = _side_field(mask, side, False, rng)
    return np.where(side, left, right)


def apply_fibers(rgb: np.ndarray, masks: dict[str, np.ndarray], roles: dict[str, list[str]],
                 seed: int = 7, floor: float = DEFAULT_FLOOR) -> np.ndarray:
    """Modulates a composed highlight RGB image with per-group fibre
    striations. ``roles`` maps 'primary'/'secondary'/'stabilizing' to group
    names (the same lists given to ``compose_highlight``); the side mask is
    taken from ``masks['_side_left']`` when present. Channel values outside
    every group mask stay exactly as composed; inside a group they range
    between ``floor`` and the full mask value, following the striations."""
    rng = np.random.default_rng(seed)
    side = masks.get("_side_left")
    out = rgb.astype(np.float64).copy()
    for channel, role in enumerate(("primary", "secondary", "stabilizing")):
        names = roles.get(role, [])
        if not names:
            continue
        field = np.zeros(rgb.shape[:2], dtype=np.float64)
        for name in names:
            if name not in masks:
                raise KeyError(f"muscle group {name!r} is not in the muscle map")
            field = np.maximum(field, group_fiber_field(masks[name], side, rng))
        out[..., channel] *= floor + (1.0 - floor) * field
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def fiber_detail_image(masks: dict[str, np.ndarray], names: list[str], seed: int = 7) -> np.ndarray:
    """Grayscale inspection image: the striation field of the named groups,
    white where no group is present, for checking fibre direction by eye."""
    rng = np.random.default_rng(seed)
    side = masks.get("_side_left")
    first = next(iter(masks.values()))
    detail = np.full(first.shape, 255.0, dtype=np.float64)
    for name in names:
        field = group_fiber_field(masks[name], side, rng)
        present = masks[name].astype(np.float64) / 255.0
        detail = detail * (1.0 - present) + (field * 255.0) * present
    return detail.astype(np.uint8)
