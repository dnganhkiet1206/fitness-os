"""Evaluates muscle-map patches at surface points. Plain numpy, no bpy, so it
is unit-tested outside Blender.

All inputs describe the REST pose mirrored onto the character's left side:
``points`` and ``normals`` use |x|, weights are left + right sums. Every
muscle group is therefore bilateral and exactly symmetric by construction."""

from __future__ import annotations

import numpy as np

WEIGHT_CHANNELS = ("arm", "leg", "head")  # skin-weight sums used as gates
TORSO_AXIS_Y = -0.02  # vertical axis of the trunk for the torso_around chart
TORSO_RADIUS = 0.15  # metres; turns degrees around the trunk into arc length


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def polygon_signed_distance(pts: np.ndarray, poly: np.ndarray) -> np.ndarray:
    """Signed distance (positive inside) from (N, 2) points to a polygon."""
    a = poly[None, :, :]
    b = np.roll(poly, -1, axis=0)[None, :, :]
    p = pts[:, None, :]
    ab = b - a
    t = np.clip(((p - a) * ab).sum(axis=2) / ((ab * ab).sum(axis=2) + 1e-30), 0.0, 1.0)
    dist = np.linalg.norm(a + ab * t[:, :, None] - p, axis=2).min(axis=1)
    x, y = pts[:, 0:1], pts[:, 1:2]
    x0, y0 = poly[None, :, 0], poly[None, :, 1]
    x1, y1 = np.roll(poly[:, 0], -1)[None, :], np.roll(poly[:, 1], -1)[None, :]
    crossing = ((y0 > y) != (y1 > y)) & (x < (x1 - x0) * (y - y0) / (y1 - y0 + 1e-30) + x0)
    inside = crossing.sum(axis=1) % 2 == 1
    return np.where(inside, dist, -dist)


class LimbFrame:
    """Cylinder coordinates around a limb segment, from its two joints."""

    def __init__(self, start, end):
        self.start = np.asarray(start, dtype=np.float64)
        end = np.asarray(end, dtype=np.float64)
        self.length = float(np.linalg.norm(end - self.start))
        self.axis = (end - self.start) / self.length
        front = np.array([0.0, -1.0, 0.0])  # the character faces -Y
        front = front - front.dot(self.axis) * self.axis
        self.front = front / np.linalg.norm(front)
        outer = np.cross(self.front, self.axis)
        if outer[0] < 0:  # left side: the outer face points towards +x
            outer = -outer
        self.outer = outer / np.linalg.norm(outer)

    def coords(self, points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        rel = points - self.start
        along = rel @ self.axis
        radial = rel - np.outer(along, self.axis)
        angle = np.degrees(np.arctan2(radial @ self.outer, radial @ self.front))
        return along / self.length, angle, np.linalg.norm(radial, axis=1)


def limb_frames(joints: dict) -> dict:
    """``joints`` holds rest-pose world positions of the left-side joints."""
    return {
        "shoulder": LimbFrame(joints["shoulder"], joints["elbow"]),
        "upperarm": LimbFrame(joints["shoulder"], joints["elbow"]),
        "lowerarm": LimbFrame(joints["elbow"], joints["wrist"]),
        "thigh": LimbFrame(joints["hip"], joints["knee"]),
        "calf": LimbFrame(joints["knee"], joints["ankle"]),
    }


def _band(patch: dict, frame: LimbFrame, points: np.ndarray, feather: float) -> np.ndarray:
    s, angle, radius = frame.coords(points)
    s0, s1 = patch["s"]
    span = s1 - s0
    # 0 at the near end, 1 at the far end; the belly narrows towards the ends.
    u = np.clip((s - s0) / span, 0.0, 1.0)
    near, far = patch.get("taper_near", 0.0), patch.get("taper_far", 0.0)
    shape = 1.0 - near * np.clip(1.0 - 2.0 * u, 0.0, 1.0) ** 2 - far * np.clip(2.0 * u - 1.0, 0.0, 1.0) ** 2
    half = patch["half_width"] * shape
    delta = np.abs((angle - patch["angle"] + 180.0) % 360.0 - 180.0)
    r = patch.get("radius", 0.05)
    d_angle = np.radians(half - delta) * r if patch["half_width"] < 180 else np.full_like(s, 1.0)
    d_along = np.minimum(s - s0, s1 - s) * frame.length
    mask = smoothstep(0.0, feather, np.minimum(d_angle, d_along))
    if "max_radius" in patch:
        mask = mask * (1.0 - smoothstep(patch["max_radius"] - 0.01, patch["max_radius"], radius))
    return mask


def evaluate_groups(muscle_map: dict, joints: dict, points: np.ndarray, normals: np.ndarray, weights: np.ndarray) -> dict[str, np.ndarray]:
    """Mask value (0..1) of every group at every point.

    ``weights`` has one column per name in WEIGHT_CHANNELS."""
    frames = limb_frames(joints)
    arm, leg, head = (weights[:, i] for i in range(3))
    trunk = 1.0 - smoothstep(0.35, 0.65, arm + leg + head)
    trunk_with_legs = 1.0 - smoothstep(0.35, 0.65, arm + head)
    gates = {
        "torso_front": trunk * smoothstep(0.0, 0.3, -normals[:, 1]),
        "torso_back": trunk * smoothstep(0.0, 0.3, normals[:, 1]),
        # Back-facing or upward-facing, and behind the front of the neck, so the
        # trapezius never spills over the collar bones.
        "torso_back_top": (1.0 - smoothstep(0.35, 0.65, arm + leg)) * smoothstep(0.0, 0.3, np.maximum(normals[:, 1] + 0.25, normals[:, 2] - 0.35))
        * smoothstep(-0.05, -0.02, points[:, 1]),
        "torso_around": trunk,
        "shoulder": np.ones(len(points)),
        "upperarm": smoothstep(0.3, 0.6, arm),
        "lowerarm": smoothstep(0.3, 0.6, arm),
        "thigh": smoothstep(0.3, 0.6, leg),
        "calf": smoothstep(0.3, 0.6, leg),
    }
    flat = {
        "torso_front": points[:, [0, 2]],
        "torso_back": points[:, [0, 2]],
        "torso_back_top": points[:, [0, 2]],
    }
    around_deg = np.degrees(np.arctan2(points[:, 0], -(points[:, 1] - TORSO_AXIS_Y)))
    default_feather = muscle_map["default_feather_m"]

    raw: dict[str, np.ndarray] = {}
    for name, group in muscle_map["groups"].items():
        total = np.zeros(len(points))
        for patch in group["patches"]:
            chart = patch["chart"]
            feather = patch.get("feather", default_feather)
            if "polygon" in patch:
                poly = np.asarray(patch["polygon"], dtype=np.float64)
                if chart == "torso_around":
                    scale = np.radians(1.0) * TORSO_RADIUS  # degrees to metres of arc
                    pts = np.stack([around_deg * scale, points[:, 2]], axis=1)
                    poly = poly * np.array([scale, 1.0])
                    gate = trunk_with_legs if patch.get("include_legs") else gates[chart]
                else:
                    pts = flat[chart]
                    gate = gates[chart]
                mask = smoothstep(-0.5 * feather, 0.5 * feather, polygon_signed_distance(pts, poly)) * gate
            else:
                mask = _band(patch, frames[chart], points, feather) * gates[chart]
            total = np.maximum(total, mask)
        raw[name] = total

    out: dict[str, np.ndarray] = {}
    for name, group in muscle_map["groups"].items():
        mask = raw[name]
        for other in group.get("minus", []):
            mask = mask * (1.0 - raw[other])
        out[name] = np.clip(mask, 0.0, 1.0)
    return out


def compose_highlight(masks: dict[str, np.ndarray], primary: list[str], secondary: list[str], stabilizing: list[str]) -> np.ndarray:
    """RGB image for the highlight shader: red = primary, green = secondary,
    blue = stabilisers. A texel claimed by a higher role is removed from the
    lower ones, so colours never mix into a third hue."""
    first = next(iter(masks.values()))

    def union(names: list[str]) -> np.ndarray:
        acc = np.zeros(first.shape, dtype=np.float32)
        for n in names:
            if n not in masks:
                raise KeyError(f"muscle group {n!r} is not in the muscle map")
            acc = np.maximum(acc, masks[n].astype(np.float32) / (255.0 if masks[n].dtype == np.uint8 else 1.0))
        return acc

    red = union(primary)
    green = union(secondary) * (1.0 - red)
    blue = union(stabilizing) * (1.0 - red) * (1.0 - green)
    return (np.stack([red, green, blue], axis=-1) * 255.0 + 0.5).astype(np.uint8)


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(np.asarray(c, dtype=np.float64), 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1.0 / 2.4) - 0.055)


def hex_rgb(value: str) -> np.ndarray:
    value = value.lstrip("#")
    return np.array([int(value[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float64) / 255.0


def albedo_from_highlight(highlight_rgb: np.ndarray, base_hex: str, primary_hex: str, secondary_hex: str,
                          stabilizer_hex: str, gain: float = 1.0) -> np.ndarray:
    """Flat colour texture (sRGB, uint8) with the muscle highlight painted in,
    for viewers that cannot run the Blender shader (glTF). Mixes in linear
    light in the same order as the shader: stabiliser, secondary, primary."""
    mask = highlight_rgb.astype(np.float64) / 255.0 * gain
    color = np.broadcast_to(srgb_to_linear(hex_rgb(base_hex)), mask.shape).copy()
    for channel, hex_value in ((2, stabilizer_hex), (1, secondary_hex), (0, primary_hex)):
        a = np.clip(mask[..., channel : channel + 1], 0.0, 1.0)
        color = color * (1.0 - a) + srgb_to_linear(hex_rgb(hex_value)) * a
    return (linear_to_srgb(color) * 255.0 + 0.5).astype(np.uint8)


def emission_from_highlight(highlight_rgb: np.ndarray, primary_hex: str, secondary_hex: str,
                            stabilizer_hex: str, gain: float = 1.0) -> np.ndarray:
    """Emission texture (sRGB, uint8) for export materials that cannot run the
    Blender shader: black where no muscle is highlighted, the role colour
    where it is, mixed in the same order as the shader (stabiliser,
    secondary, primary) so it matches the albedo highlight exactly. Fibre
    striations baked into the highlight map show up as glowing fibres."""
    mask = highlight_rgb.astype(np.float64) / 255.0 * gain
    color = np.zeros(mask.shape, dtype=np.float64)
    for channel, hex_value in ((2, stabilizer_hex), (1, secondary_hex), (0, primary_hex)):
        a = np.clip(mask[..., channel : channel + 1], 0.0, 1.0)
        color = color * (1.0 - a) + srgb_to_linear(hex_rgb(hex_value)) * a
    return (linear_to_srgb(color) * 255.0 + 0.5).astype(np.uint8)
