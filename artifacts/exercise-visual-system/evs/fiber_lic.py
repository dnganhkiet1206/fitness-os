"""Painted muscle-fibre detail by line integral convolution (LIC). Plain
numpy, no bpy, no scipy, so it is unit-tested outside Blender.

Kiệt (13/11) asked for fibres drawn like a hand-painted anatomy plate: the
muscle stays one saturated colour, and fine dark fibre lines plus coarser
fascicle grooves follow the fibre direction, with relief under the light.
The previous striations (``evs/fibers.py``) were one sine band per phase
cycle, which reads as corduroy, not fibres.

How it works, all in the UV atlas:

1. Direction. The baked phase atlas (``fiber_phase.npz``) stores, per group,
   a phase whose iso-lines are the fibres. The fibre direction is therefore
   perpendicular to the phase gradient. The phase is a wrapped fraction, so
   the gradient is taken on ``exp(2*pi*i*phase)``, which has no seam.
2. Streaks. White noise is convolved along the streamline through each texel
   (LIC; Cabral and Leedom 1993). Long kernels give long coherent fibres; a
   second pass with coarser noise gives fascicle bundles.
3. Shading. A high-passed streak value becomes a height map (fibres raised,
   grooves sunk), a darkening map for the albedo, and a tangent-space normal
   map. Texels near the mask edge darken, which separates neighbouring
   muscles the way the painted plates do.

The algorithm is the published LIC method; the code is original. No asset,
mesh or texture from a third party is used.
"""

from __future__ import annotations

import numpy as np


def box_blur(img: np.ndarray, radius: int) -> np.ndarray:
    """Separable box blur with edge clamping, via cumulative sums."""
    if radius <= 0:
        return img.astype(np.float64)
    out = img.astype(np.float64)
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (radius + 1, radius)
        p = np.pad(out, pad, mode="edge")
        c = np.cumsum(p, axis=axis)
        n = out.shape[axis]
        hi = np.take(c, np.arange(2 * radius + 1, 2 * radius + 1 + n), axis=axis)
        lo = np.take(c, np.arange(0, n), axis=axis)
        out = (hi - lo) / (2 * radius + 1)
    return out


def direction_from_phase(frac: np.ndarray, smooth: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """Unit fibre direction (dx, dy) in texel space from a phase fraction
    image (uint8, 0..255 = one cycle). Fibres run along iso-phase lines, so
    the direction is the phase gradient turned by 90 degrees. The field is
    smoothed in doubled-angle form, where a direction and its opposite are
    the same value, so the smoothing never cancels opposite signs."""
    phase = frac.astype(np.float64) / 255.0
    re, im = np.cos(2 * np.pi * phase), np.sin(2 * np.pi * phase)
    dre_y, dre_x = np.gradient(re)
    dim_y, dim_x = np.gradient(im)
    gx = re * dim_x - im * dre_x
    gy = re * dim_y - im * dre_y
    # Fibre direction: perpendicular to the gradient.
    dx, dy = -gy, gx
    ang2 = 2.0 * np.arctan2(dy, dx)
    mag = np.hypot(dx, dy)
    c = box_blur(np.cos(ang2) * mag, smooth)
    s = box_blur(np.sin(ang2) * mag, smooth)
    ang = 0.5 * np.arctan2(s, c)
    return np.cos(ang), np.sin(ang)


def direction_from_angle(angle_u8: np.ndarray, smooth: int = 4) -> tuple[np.ndarray, np.ndarray]:
    """Unit fibre direction from the surface-baked angle atlas
    (``fiber_dir.npz``: UV angle in [0, pi) as uint8), smoothed in
    doubled-angle form."""
    ang2 = angle_u8.astype(np.float64) / 255.0 * 2.0 * np.pi
    c = box_blur(np.cos(ang2), smooth)
    s = box_blur(np.sin(ang2), smooth)
    ang = 0.5 * np.arctan2(s, c)
    return np.cos(ang), np.sin(ang)


def lic(noise: np.ndarray, dx: np.ndarray, dy: np.ndarray, mask: np.ndarray, length: int, step: float = 1.0) -> np.ndarray:
    """Line integral convolution of ``noise`` along the direction field,
    only for texels where ``mask`` is set. Streamlines are traced both ways
    with a Hann window; each step keeps the sign of the previous one, since
    the field is an undirected line field."""
    h, w = noise.shape
    ys, xs = np.nonzero(mask)
    out = np.zeros_like(noise, dtype=np.float64)
    if ys.size == 0:
        return out
    total = np.zeros(ys.size)
    weight_sum = np.zeros(ys.size)
    for sign in (1.0, -1.0):
        py, px = ys.astype(np.float64), xs.astype(np.float64)
        prev_x = dx[ys, xs] * sign
        prev_y = dy[ys, xs] * sign
        for k in range(length + 1):
            wgt = 0.5 + 0.5 * np.cos(np.pi * k / (length + 1))
            if sign < 0 and k == 0:
                # The centre texel was counted by the forward pass.
                py = py + prev_y * step
                px = px + prev_x * step
                continue
            iy = np.clip(np.rint(py).astype(int), 0, h - 1)
            ix = np.clip(np.rint(px).astype(int), 0, w - 1)
            total += noise[iy, ix] * wgt
            weight_sum += wgt
            vx, vy = dx[iy, ix], dy[iy, ix]
            flip = (vx * prev_x + vy * prev_y) < 0
            vx = np.where(flip, -vx, vx)
            vy = np.where(flip, -vy, vy)
            prev_x, prev_y = vx, vy
            px = px + vx * step
            py = py + vy * step
    out[ys, xs] = total / np.maximum(weight_sum, 1e-9)
    return out


def _normalize(v: np.ndarray, mask: np.ndarray) -> np.ndarray:
    sel = v[mask]
    if sel.size == 0:
        return v
    lo, hi = np.percentile(sel, 2), np.percentile(sel, 98)
    return np.clip((v - lo) / max(hi - lo, 1e-9), 0.0, 1.0)


def fiber_height(frac: np.ndarray, mask: np.ndarray, seed: int = 11, fine_len: int = 18, coarse_len: int = 34,
                 direction: tuple[np.ndarray, np.ndarray] | None = None) -> np.ndarray:
    """Height in [0, 1] inside ``mask``: fine fibres plus coarser fascicle
    bundles, both following the fibre field, high-passed so the muscle's
    overall shape stays with the mesh and only the fibre relief is added."""
    rng = np.random.default_rng(seed)
    dx, dy = direction if direction is not None else direction_from_phase(frac)
    sel = mask > 0
    # Pad the work area by the streak length so streaks reach the edge.
    ys, xs = np.nonzero(sel)
    if ys.size == 0:
        return np.zeros(frac.shape)
    pad = coarse_len + 4
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, frac.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, frac.shape[1])
    sub = (slice(y0, y1), slice(x0, x1))
    m, sdx, sdy = sel[sub], dx[sub], dy[sub]
    # Fibres are drawn about 2-3 texels wide and fascicle bundles about 6:
    # one-texel lines vanish once the texture is minified in the viewer.
    fine_noise = box_blur(rng.random(m.shape), 1)
    coarse_noise = box_blur(rng.random(m.shape), 3)
    fine = lic(fine_noise, sdx, sdy, m, fine_len)
    coarse = lic(coarse_noise, sdx, sdy, m, coarse_len, step=1.5)
    fine = fine - box_blur(fine, 5)
    coarse = coarse - box_blur(coarse, 12)
    hgt = 0.35 * _normalize(fine, m) + 0.65 * _normalize(coarse, m)
    out = np.zeros(frac.shape)
    out[sub] = np.where(m, hgt, 0.0)
    return out


def edge_falloff(mask: np.ndarray, radius: int = 10) -> np.ndarray:
    """1 deep inside the mask, falling towards 0 at its edge; a cheap stand-in
    for a distance transform (no scipy)."""
    m = (mask > 0).astype(np.float64)
    b = box_blur(box_blur(m, radius // 2), radius // 2)
    return np.clip((b - 0.5) * 2.0, 0.0, 1.0) * m


def normal_map(height: np.ndarray, strength: float = 2.5) -> np.ndarray:
    """Tangent-space normal map (RGB 0..1, OpenGL Y+) from a height map whose
    rows run along +v (the atlas order, before the PNG flip)."""
    gy, gx = np.gradient(height)
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(height)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / n, ny / n, nz / n], axis=-1) * 0.5 + 0.5


def flatten_points(normal: np.ndarray, uv_points, radius: int = 6) -> np.ndarray:
    """Flat normal (0.5, 0.5, 1) around UV points (atlas order, row = v).
    The faceless head patch has no UV footprint: all its faces sample one
    texel, so any relief there tilts the whole face (14/11: a flat patch
    with a jagged edge on the face in the app)."""
    out = normal.copy()
    res = normal.shape[0]
    for u, v in uv_points or []:
        c, r = int(u * res), int(v * res)
        out[max(r - radius, 0):r + radius + 1, max(c - radius, 0):c + radius + 1] = (0.5, 0.5, 1.0)
    return out


def crisp_mask(mask: np.ndarray, blur: int = 3) -> np.ndarray:
    """Smooth but sharp muscle outline in [0, 1]: the baked masks have ragged,
    feathered edges; blurring then a narrow smoothstep around 50 % gives a
    clean anti-aliased outline like a painted plate."""
    m = box_blur(box_blur(mask.astype(np.float64) / 255.0, blur), blur)
    t = np.clip((m - 0.40) / 0.20, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def painted_maps(masks: dict[str, np.ndarray], phase: dict[str, np.ndarray], groups: list[str], seed: int = 11,
                 relief: float = 10.0, angles: dict[str, np.ndarray] | None = None,
                 base_height: np.ndarray | None = None, base_relief: float = 0.0
                 ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Shade (0..1, multiplies the muscle colour), tangent normal map (RGB
    0..1) and rim (0..1, a thin band just inside each muscle outline, drawn
    as a glow so the groups read at a glance) for the highlighted ``groups``.
    Outside every group the shade is 1, the normal flat and the rim 0, so the
    skin is untouched."""
    first = next(iter(masks.values()))
    height = np.zeros(first.shape)
    shade = np.ones(first.shape)
    rim = np.zeros(first.shape)
    for i, g in enumerate(groups):
        if g not in phase:
            raise KeyError(f"muscle group {g!r} is not in the fibre phase atlas")
        c = crisp_mask(masks[g])
        m = c > 0.0
        # Prefer the surface-baked directions (pipeline/bake_fiber_directions.py):
        # the phase atlas is built in flattened charts and bends over the
        # shoulder cap and the upper chest.
        direction = direction_from_angle(angles[g]) if angles is not None and g in angles else None
        h = fiber_height(phase[g], m, seed=seed + i, direction=direction)
        e = edge_falloff(c > 0.5, 12)
        height = np.where(m, h * c, height)
        # Fibre grooves darken by up to ~45 %, towards the edge by up to ~20 %;
        # ridges brighten a little so the colour stays vivid on average.
        local = (0.55 + 0.60 * h) * (0.80 + 0.20 * e)
        shade = np.where(m, shade * (1.0 - c) + local * c, shade)
        band = c * (1.0 - edge_falloff(c > 0.5, 6))
        rim = np.maximum(rim, band)
    # The layered-muscle sculpt (pipeline/sculpt_muscles.py) shapes every
    # muscle block, highlighted or not; the fibres ride on top of it.
    total = height * relief
    if base_height is not None:
        total = total + base_height.astype(np.float64) * base_relief
    return shade, normal_map(total), rim
