"""Layered muscle sculpt (numpy only; unit-tested).

Every muscle group is split into its anatomical parts (config/muscle_parts.json).
Each part becomes its own rounded block: height 0 on the part's outline,
rising to a plateau inside,

    h(d) = 1 - exp(-(d / w)^2),   d = distance to the nearest part outline,

so two neighbouring parts meet in a groove and the skin outside every muscle
stays put. The same field drives a small displacement of the mesh (broad
forms, silhouette) and the body normal map (crisp grooves, narrower w).
"""

from __future__ import annotations

import numpy as np

LIMBS = {"upperarm": ("shoulder", "elbow"), "lowerarm": ("elbow", "wrist"), "thigh": ("hip", "knee"), "calf": ("knee", "ankle")}


def limb_coords(points: np.ndarray, joints: dict, limb: str) -> tuple[np.ndarray, np.ndarray]:
    """(t, angle) of mirrored points (x >= 0, left side) around a limb axis.
    t = 0 at the proximal joint, 1 at the distal one; angle in degrees,
    0 = front (-Y), + = lateral (+X), +-180 = back."""
    a, b = (np.asarray(joints[k], float) for k in LIMBS[limb])
    axis = b - a
    length = float(np.linalg.norm(axis))
    axis /= length
    rel = points - a
    t = rel @ axis / length
    front = np.array([0.0, -1.0, 0.0])
    front = front - axis * (front @ axis)
    front /= np.linalg.norm(front)
    lateral = np.cross(axis, front)
    if lateral[0] < 0:
        lateral = -lateral
    radial = rel - np.outer(rel @ axis, axis)
    ang = np.degrees(np.arctan2(radial @ lateral, radial @ front))
    return t, ang


def part_labels(group_index: np.ndarray, groups: list[str], points: np.ndarray, joints: dict, parts_cfg: dict) -> np.ndarray:
    """Integer part label per point; 0 = no muscle.

    group_index: index into ``groups`` per point, -1 for skin. ``points`` are
    real (not mirrored) positions: the side goes into the label."""
    labels = np.zeros(len(points), dtype=np.int64)
    side = (points[:, 0] >= 0).astype(np.int64)
    mirrored = points.copy()
    mirrored[:, 0] = np.abs(mirrored[:, 0])
    for gi, g in enumerate(groups):
        sel = group_index == gi
        if not sel.any():
            continue
        code = np.zeros(sel.sum(), dtype=np.int64)
        p = mirrored[sel]
        s = side[sel]
        for k, split in enumerate(parts_cfg.get(g, [])):
            if split["type"] == "level":
                # 'tilt' slopes the cut: + = the line descends laterally.
                z = p[:, 2] + split.get("tilt", 0.0) * p[:, 0]
                f = np.zeros(len(p))
                for sd in (0, 1):  # each side's own extent
                    m = s == sd
                    if m.any():
                        lo, hi = np.percentile(z[m], 1), np.percentile(z[m], 99)
                        f[m] = (z[m] - lo) / max(hi - lo, 1e-6)
                b = np.searchsorted(np.asarray(split["fractions"], float), f)
                active = np.ones(len(p), bool)
            else:
                t, ang = limb_coords(p, joints, split["limb"])
                # 'twist' (deg) turns the cuts along the limb: + = the cuts sit
                # more lateral at the proximal end (rectus femoris runs from
                # the hip spine, lateral, to the kneecap, front).
                ang = ang - split.get("twist", 0.0) * (0.5 - t)
                b = np.searchsorted(np.asarray(split["bounds"], float), ang)
                lo, hi = split.get("mask", [-1e9, 1e9])
                active = (t >= lo) & (t <= hi)
            code += np.where(active, b + 1, 0) * (16 ** k)
        labels[sel] = (gi + 1) * 1_000_000 + code * 2 + s
    return labels


KINDS = ("groups", "midline", "heads", "skin")


def boundary_kind(la: np.ndarray, lb: np.ndarray) -> np.ndarray:
    """0 groups (two different muscles), 1 midline (same muscle, left/right),
    2 heads (parts of one muscle), 3 skin (muscle ends: tendon, fades)."""
    ga, gb = la // 1_000_000, lb // 1_000_000
    sa, sb = la % 2, lb % 2
    kind = np.where(ga != gb, 0, np.where(sa != sb, 1, 2))
    return np.where((la == 0) | (lb == 0), 3, kind)


def boundary_points_by_kind(labels: np.ndarray, positions: np.ndarray, valid: np.ndarray, max_gap: float = 0.01) -> dict:
    out = {k: [] for k in KINDS}
    for dy, dx in ((0, 1), (1, 0)):
        la, lb = labels[: labels.shape[0] - dy, : labels.shape[1] - dx], labels[dy:, dx:]
        pa, pb = positions[: labels.shape[0] - dy, : labels.shape[1] - dx], positions[dy:, dx:]
        va, vb = valid[: labels.shape[0] - dy, : labels.shape[1] - dx], valid[dy:, dx:]
        m = va & vb & (la != lb) & ((la > 0) | (lb > 0))
        m &= np.linalg.norm(pa - pb, axis=-1) < max_gap
        kind = boundary_kind(la[m], lb[m])
        mid = 0.5 * (pa[m] + pb[m])
        for i, k in enumerate(KINDS):
            out[k].append(mid[kind == i])
    return {k: (np.concatenate(v) if v else np.zeros((0, 3))) for k, v in out.items()}


def relief(distances: dict, is_muscle: np.ndarray, profile: dict) -> np.ndarray:
    """Rounded belly per part. Muscle ends fade smoothly into the skin
    (``skin``: 1 - exp(-(d/w)^2)); between muscles a groove of the kind's
    depth: x (1 - depth * exp(-(d/w)^2)). 0 on skin."""
    p = profile["skin"]
    h = 1.0 - np.exp(-(distances["skin"] / p["width_m"]) ** 2)
    for k in ("groups", "midline", "heads"):
        p = profile[k]
        h = h * (1.0 - p["depth"] * np.exp(-(distances[k] / p["width_m"]) ** 2))
    return np.where(is_muscle, h, 0.0)


def boundary_points(labels: np.ndarray, positions: np.ndarray, valid: np.ndarray, max_gap: float = 0.01) -> np.ndarray:
    """Outline points from a label image: midpoints between 4-neighbour texels
    whose labels differ and that are close in 3D (UV seams are skipped).
    At least one of the two must be muscle (skin-skin is no outline)."""
    out = []
    for dy, dx in ((0, 1), (1, 0)):
        la, lb = labels[: labels.shape[0] - dy, : labels.shape[1] - dx], labels[dy:, dx:]
        pa, pb = positions[: labels.shape[0] - dy, : labels.shape[1] - dx], positions[dy:, dx:]
        va, vb = valid[: labels.shape[0] - dy, : labels.shape[1] - dx], valid[dy:, dx:]
        m = va & vb & (la != lb) & ((la > 0) | (lb > 0))
        m &= np.linalg.norm(pa - pb, axis=-1) < max_gap
        out.append(0.5 * (pa[m] + pb[m]))
    return np.concatenate(out) if out else np.zeros((0, 3))


def block_height(distance: np.ndarray, width: float, is_muscle: np.ndarray) -> np.ndarray:
    """0 on outlines and on skin, rising to 1 inside each part."""
    return np.where(is_muscle, 1.0 - np.exp(-(distance / width) ** 2), 0.0)
