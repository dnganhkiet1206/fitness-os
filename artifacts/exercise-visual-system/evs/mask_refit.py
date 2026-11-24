"""Moves the muscle-group borders of the atlas onto the real grooves of the
sculpt (24/11, Kiệt: "vẽ các nhóm cơ phải bám theo đúng nhóm cơ thật của
charactor").

The atlas regions come from muscle_map.json (cylinder charts and polygons), so
their borders are only roughly where the sculpt's muscles meet. The sculpt's
ambient-occlusion and normal maps show those meeting lines as grooves. A
marker-controlled watershed re-draws every border inside a band around the old
one: each group keeps the core of its old region as a seed and floods outward
in order of groove height, so neighbours meet in the groove between them. A
group may move its border at most ``band_px`` texels from where it was, so the
anatomy of the map is kept and only the outline snaps.

Pure numpy (runs in Blender's Python and in plain Python)."""

from __future__ import annotations

import heapq

import numpy as np

NEIGHBOURS = ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1))


def box_blur(a: np.ndarray, r: int) -> np.ndarray:
    """Mean over a (2r+1)² window, edge-clamped (summed-area table)."""
    if r <= 0:
        return a.astype(np.float32)
    p = np.pad(a.astype(np.float64), r + 1, mode="edge")
    s = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    out = s[k:, k:] - s[:-k, k:] - s[k:, :-k] + s[:-k, :-k]
    return (out[: a.shape[0], : a.shape[1]] / (k * k)).astype(np.float32)


def erode(mask: np.ndarray, passes: int) -> np.ndarray:
    m = mask.copy()
    for _ in range(passes):
        e = m.copy()
        e[1:] &= m[:-1]
        e[:-1] &= m[1:]
        e[:, 1:] &= m[:, :-1]
        e[:, :-1] &= m[:, 1:]
        m = e
    return m


def groove_height(ao: np.ndarray, normal: np.ndarray, valid: np.ndarray, ao_radius: int = 10) -> np.ndarray:
    """0..1, high in the grooves between muscles. ``ao`` is 0..1 (dark = occluded); ``normal`` is the
    tangent-space map in -1..1 with rows running along +v. A groove is darker than its surroundings
    (AO high-pass) and has converging normals (negative divergence)."""
    inner = erode(valid, 3)
    a = np.where(valid, ao, 1.0).astype(np.float32)
    dark = np.clip(box_blur(a, ao_radius) - a, 0.0, None)
    nx = box_blur(normal[..., 0], 2)
    ny = box_blur(normal[..., 1], 2)
    div = np.zeros_like(nx)
    div[:, 1:-1] += 0.5 * (nx[:, 2:] - nx[:, :-2])
    div[1:-1] += 0.5 * (ny[2:] - ny[:-2])
    conv = np.clip(-box_blur(div, 2), 0.0, None)
    out = np.zeros_like(a)
    for g in (dark, conv):
        g = np.where(inner, g, 0.0)
        hi = float(np.percentile(g[inner], 99.0)) if inner.any() else 1.0
        out += np.clip(g / max(hi, 1e-6), 0.0, 1.0)
    return np.where(inner, 0.5 * out, 1.0).astype(np.float32)


def distance_to_border(labels: np.ndarray, region: np.ndarray, cap: int) -> np.ndarray:
    """Chessboard distance (texels, capped) from every texel of ``region`` to the nearest texel whose
    label differs from a neighbour's."""
    edge = np.zeros(labels.shape, bool)
    for dy, dx in ((1, 0), (0, 1)):
        a = labels[dy:, dx:] if dy or dx else labels
        b = labels[: labels.shape[0] - dy, : labels.shape[1] - dx]
        diff = (a != b) & region[dy:, dx:] & region[: labels.shape[0] - dy, : labels.shape[1] - dx]
        edge[dy:, dx:] |= diff
        edge[: labels.shape[0] - dy, : labels.shape[1] - dx] |= diff
    dist = np.full(labels.shape, cap, np.int32)
    front = edge
    seen = edge.copy()
    for d in range(cap):
        dist[front] = d
        grown = front.copy()
        grown[1:] |= front[:-1]
        grown[:-1] |= front[1:]
        grown[:, 1:] |= front[:, :-1]
        grown[:, :-1] |= front[:, 1:]
        front = grown & ~seen
        seen |= grown
    return dist


def watershed(labels: np.ndarray, region: np.ndarray, height: np.ndarray, band_px: int, seed_fraction: float = 0.6,
              stray_cost: float = 0.35) -> tuple[np.ndarray, dict]:
    """Re-draws ``labels`` (int, 0 = no muscle) inside ``region``. Texels farther than ``band_px``
    from any border keep their label and seed the flood; so does the inner ``seed_fraction`` of
    groups too thin to have such texels. Each flood step may leave its group's old region by at most
    ``band_px`` texels, and pays ``stray_cost`` x (steps / band_px) on its priority for it, so on a flat
    surface (no groove) the border stays near where it was instead of wandering."""
    h, w = labels.shape
    dist = distance_to_border(labels, region, band_px)
    n_lab = int(labels.max()) + 1
    max_d = np.zeros(n_lab, np.int32)
    np.maximum.at(max_d, labels[region], dist[region])
    # distances are capped at band_px: a group that reaches the cap seeds beyond the band, a thinner one
    # seeds its inner seed_fraction
    thresh = np.where(max_d >= band_px, band_px, np.maximum(1, np.floor(max_d * seed_fraction))).astype(np.int32)
    seed = region & (dist >= thresh[labels])
    out = np.where(seed | ~region, labels, -1).astype(np.int32)
    steps = np.zeros(labels.shape, np.int32)
    flat_h = height.ravel()
    flat_out = out.ravel()
    flat_orig = labels.ravel()
    flat_region = region.ravel()
    flat_steps = steps.ravel()
    heap: list = []
    counter = 0
    ys, xs = np.nonzero(seed)
    # only seeds that touch an unknown texel start the flood
    unknown = region & ~seed
    near = np.zeros_like(unknown)
    near[1:] |= unknown[:-1]
    near[:-1] |= unknown[1:]
    near[:, 1:] |= unknown[:, :-1]
    near[:, :-1] |= unknown[:, 1:]
    for idx in np.flatnonzero((seed & near).ravel()):
        heapq.heappush(heap, (float(flat_h[idx]), counter, int(idx)))
        counter += 1
    claimed = 0
    while heap:
        _, _, idx = heapq.heappop(heap)
        lab = flat_out[idx]
        y, x = divmod(idx, w)
        for dy, dx in NEIGHBOURS:
            yy, xx = y + dy, x + dx
            if yy < 0 or yy >= h or xx < 0 or xx >= w:
                continue
            j = yy * w + xx
            if not flat_region[j] or flat_out[j] >= 0:
                continue
            # "no muscle" (label 0) only holds its seeds: it may not run along the narrow gaps the
            # chart shapes leave between muscles, which the muscles on either side fill instead
            s = flat_steps[idx] + 1 if lab == 0 else (0 if flat_orig[j] == lab else flat_steps[idx] + 1)
            if s > band_px:
                continue
            flat_out[j] = lab
            flat_steps[j] = s
            claimed += 1
            heapq.heappush(heap, (float(flat_h[j]) + stray_cost * s / band_px, counter, j))
            counter += 1
    left = region & (out < 0)
    out[left] = labels[left]
    changed = int((region & (out != labels)).sum())
    return out, {"band_px": band_px, "seeds": int(seed.sum()), "flooded": claimed, "unreached_kept": int(left.sum()),
                 "texels_changed": changed, "region_texels": int(region.sum())}


def dilate_into(image: np.ndarray, valid: np.ndarray, passes: int) -> np.ndarray:
    """Same as evs.muscles._dilate: grows values into texels outside ``valid`` (UV-seam padding)."""
    image = image.astype(np.float32)
    valid = valid.copy()
    for _ in range(passes):
        acc = np.zeros_like(image)
        cnt = np.zeros(valid.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                sv = np.roll(np.roll(valid, dy, 0), dx, 1)
                acc += np.where(sv, np.roll(np.roll(image, dy, 0), dx, 1), 0.0)
                cnt += sv
        fill = (~valid) & (cnt > 0)
        image[fill] = acc[fill] / cnt[fill]
        valid |= fill
    return image


def majority_smooth(labels: np.ndarray, region: np.ndarray, radius: int, passes: int = 2) -> np.ndarray:
    """Removes the staircase of the flood: every texel of ``region`` takes the label most common in
    its (2r+1)² window (box-blurred one-hot per label present)."""
    out = labels.copy()
    ids = np.unique(labels[region])
    for _ in range(passes):
        best = np.full(labels.shape, -1.0, np.float32)
        pick = out.copy()
        for i in ids:
            score = box_blur((out == i).astype(np.float32), radius)
            better = score > best
            best = np.where(better, score, best)
            pick = np.where(better, i, pick)
        out = np.where(region, pick, out)
    return out


def components(mask: np.ndarray) -> tuple[np.ndarray, int]:
    """4-connected components of ``mask`` (int32 ids from 1, 0 outside). Union-find in numpy."""
    h, w = mask.shape
    idx = np.arange(h * w, dtype=np.int64).reshape(h, w)
    parent = np.arange(h * w, dtype=np.int64)

    def find(a):
        while True:
            p = parent[a]
            if np.array_equal(p, a):
                return a
            parent[a] = parent[p]
            a = parent[a]

    pairs = []
    pairs.append((idx[:, :-1][mask[:, :-1] & mask[:, 1:]], idx[:, 1:][mask[:, :-1] & mask[:, 1:]]))
    pairs.append((idx[:-1][mask[:-1] & mask[1:]], idx[1:][mask[:-1] & mask[1:]]))
    for _ in range(64):
        changed = False
        for a, b in pairs:
            ra, rb = find(a), find(b)
            diff = ra != rb
            if diff.any():
                changed = True
                lo = np.minimum(ra[diff], rb[diff])
                hi = np.maximum(ra[diff], rb[diff])
                np.minimum.at(parent, hi, lo)
        if not changed:
            break
    roots = find(idx[mask])
    out = np.zeros(h * w, np.int32)
    uniq, inv = np.unique(roots, return_inverse=True)
    out[idx[mask]] = inv.astype(np.int32) + 1
    return out.reshape(h, w), len(uniq)


def flood(markers: np.ndarray, region: np.ndarray, height: np.ndarray) -> np.ndarray:
    """Plain marker watershed: grows ``markers`` (>0) over ``region`` in order of ``height``."""
    h, w = markers.shape
    out = np.where(markers > 0, markers, -1).astype(np.int32).ravel()
    flat_h = height.ravel()
    flat_region = region.ravel()
    heap: list = []
    counter = 0
    for i in np.flatnonzero(markers.ravel() > 0):
        heap.append((float(flat_h[i]), counter, int(i)))
        counter += 1
    heapq.heapify(heap)
    while heap:
        _, _, i = heapq.heappop(heap)
        lab = out[i]
        y, x = divmod(i, w)
        for dy, dx in NEIGHBOURS[:4]:
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w:
                j = yy * w + xx
                if flat_region[j] and out[j] < 0:
                    out[j] = lab
                    heapq.heappush(heap, (float(flat_h[j]), counter, j))
                    counter += 1
    return out.reshape(h, w)


def snap_to_bellies(labels: np.ndarray, region: np.ndarray, height: np.ndarray, flat_level: float = 0.12,
                    min_belly_px: int = 150, dominance: float = 0.6) -> tuple[np.ndarray, np.ndarray, dict]:
    """Splits ``region`` into bellies (watershed basins between grooves, seeded by the flat areas
    below ``flat_level``) and gives every belly that one group dominates (share >= ``dominance``)
    entirely to that group. Bellies with no clear owner keep the old labels, so a border with no groove
    under it stays where muscle_map.json put it."""
    flat = erode(region & (height < flat_level), 2)
    seeds, n = components(flat)
    sizes = np.bincount(seeds.ravel(), minlength=n + 1)
    small = sizes < min_belly_px
    small[0] = True
    seeds[small[seeds]] = 0
    bellies = flood(seeds, region, height)
    out = labels.copy()
    ids = bellies[region]
    labs = labels[region]
    n_lab = int(labels.max()) + 1
    nb = int(bellies.max()) + 1
    votes = np.zeros((nb, n_lab), np.int64)
    np.add.at(votes, (np.clip(ids, 0, None), labs), 1)
    total = votes.sum(1)
    owner = votes.argmax(1)
    share = votes.max(1) / np.maximum(total, 1)
    take = share >= dominance
    take[0] = False
    b = np.clip(bellies, 0, None)
    snap = region & (bellies > 0) & take[b]
    out[snap] = owner[b][snap]
    return out, bellies, {"bellies": int(take.sum()), "belly_candidates": int(nb - 1),
                          "texels_changed": int((region & (out != labels)).sum())}
