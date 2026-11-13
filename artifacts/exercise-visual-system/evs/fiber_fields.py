"""Muscle-fibre direction fields from origin/insertion anatomy. Plain numpy,
no bpy, so it is unit-tested outside Blender.

The previous striations (``evs/fibers.py``) used one average PCA axis per
muscle group. That cannot draw a fan: the pectoralis major reads as parallel
corduroy stripes instead of fibres converging on the humerus. This module
replaces the guess with a field per group, defined in the SAME chart space
as the muscle map (``config/muscle_map.json``), from the group's documented
origin and insertion (``config/fiber_map.json``):

* ``fan`` — fibres converge on one insertion point. The striation phase is
  the angle around that point, so the visible lines are radial: they fan out
  from the insertion across the whole origin, like the pectoralis major,
  latissimus dorsi and trapezius.
* ``parallel`` — fibres run along one axis. The phase is the distance across
  that axis, so the lines run along the muscle, like the triceps or the
  rectus abdominis.

Everything is computed on the rest pose mirrored onto the left side, exactly
like the muscle map, so fields are bilateral and symmetric by construction.
The output is a phase in striation cycles; ``sin(2 * pi * phase)`` is the
striation field, and the bake step (``pipeline/bake_fiber_fields.py``) stores
the phase fraction per texel so the highlight composition never needs 3D.
"""

from __future__ import annotations

import math

import numpy as np

from . import muscle_eval

TORSO_CHARTS = ("torso_front", "torso_back", "torso_back_top")
AROUND_CHART = "torso_around"
LIMB_CHARTS = ("shoulder", "upperarm", "lowerarm", "thigh", "calf")
ALL_CHARTS = TORSO_CHARTS + (AROUND_CHART,) + LIMB_CHARTS

# A fan whose unwrapped span reaches this is not a fan: the centre is inside
# the muscle or the cut ray crosses it. Degrees.
MAX_FAN_SPAN_DEG = 270.0
# Striations closer together than this near a fan centre alias into flat
# noise at atlas resolution. Metres of arc between neighbouring striations.
MIN_ARC_SPACING_M = 0.001


def _wrap_deg(angle: np.ndarray | float, centre: float) -> np.ndarray | float:
    """Angles unwrapped around ``centre`` into [centre - 180, centre + 180)."""
    return centre + ((np.asarray(angle) - centre + 180.0) % 360.0 - 180.0)


def _unwrap_around_cut(theta: np.ndarray, cut_deg: float) -> np.ndarray:
    """Angles unwrapped into [cut, cut + 360), so the branch cut — the only
    discontinuity — sits exactly on the cut ray, pointing away from the
    muscle. A muscle that does not straddle the cut ray gets one continuous
    span; a muscle that does gets a span near 360 degrees."""
    return cut_deg + ((np.asarray(theta) - cut_deg) % 360.0)


def chart_metric_coords(chart: str, points: np.ndarray, frames: dict, spec: dict) -> np.ndarray:
    """(N, 2) metric coordinates of rest-pose surface points in one chart.

    ``points`` must already be mirrored onto the left side (|x| >= 0), as in
    ``muscle_eval.evaluate_groups``. Torso charts are already in metres;
    ``torso_around`` turns degrees into arc metres with TORSO_RADIUS; limb
    charts turn (s, angle) into (s * segment length, arc metres), with the
    angle unwrapped around the spec's ``angle_center``."""
    points = np.asarray(points, dtype=np.float64)
    if chart in TORSO_CHARTS:
        return points[:, [0, 2]].copy()
    if chart == AROUND_CHART:
        around = np.degrees(np.arctan2(points[:, 0], -(points[:, 1] - muscle_eval.TORSO_AXIS_Y)))
        scale = math.radians(1.0) * muscle_eval.TORSO_RADIUS
        return np.stack([around * scale, points[:, 2]], axis=1)
    if chart in LIMB_CHARTS:
        frame = frames[chart]
        s, angle, _radius = frame.coords(points)
        unwrapped = _wrap_deg(angle, float(spec["angle_center"]))
        return np.stack([s * frame.length, np.radians(unwrapped) * float(spec["radius_m"])], axis=1)
    raise ValueError(f"unknown chart {chart!r}")


def spec_center_metric(spec: dict, frames: dict) -> np.ndarray:
    """A fan centre stored in chart-native coordinates, in metric coords."""
    chart = spec["chart"]
    centre = np.asarray(spec["center"], dtype=np.float64)
    if chart in TORSO_CHARTS:
        return centre
    if chart == AROUND_CHART:
        return np.array([math.radians(centre[0]) * muscle_eval.TORSO_RADIUS, centre[1]])
    if chart in LIMB_CHARTS:
        angle = float(_wrap_deg(centre[1], float(spec["angle_center"])))
        return np.array([centre[0] * frames[chart].length, math.radians(angle) * float(spec["radius_m"])])
    raise ValueError(f"unknown chart {chart!r}")


def fan_phase(spec: dict, metric: np.ndarray, centre: np.ndarray) -> np.ndarray:
    """Striation phase in cycles for a fan field. The phase is the angle
    around the insertion point, unwrapped so the cut ray (``cut_deg``) never
    crosses the muscle; lines of constant phase are radial, i.e. the fibres
    converge on the insertion."""
    rel = np.asarray(metric, dtype=np.float64) - np.asarray(centre, dtype=np.float64)
    theta = np.degrees(np.arctan2(rel[:, 1], rel[:, 0]))
    unwrapped = _unwrap_around_cut(theta, float(spec["cut_deg"]))
    return (unwrapped - float(spec["cut_deg"])) / float(spec["angular_spacing_deg"])


def parallel_spacing_m(spec: dict) -> float:
    """Effective stripe spacing. With ``wrap``, the spacing is quantised so a
    whole number of striations fits around the limb: otherwise the field
    jumps where the angle wraps from +180 to -180."""
    spacing = float(spec["spacing_m"])
    if spec.get("wrap"):
        circumference = 2.0 * math.pi * float(spec["radius_m"])
        cycles = max(1, round(circumference / spacing))
        spacing = circumference / cycles
    return spacing


def parallel_phase(spec: dict, metric: np.ndarray) -> np.ndarray:
    """Striation phase in cycles for a parallel field: distance across the
    fibre axis, in units of the stripe spacing."""
    axis = np.asarray(spec["axis"], dtype=np.float64)
    axis = axis / np.linalg.norm(axis)
    normal = np.array([-axis[1], axis[0]])
    origin = np.asarray(spec.get("origin_point", [0.0, 0.0]), dtype=np.float64)
    across = (np.asarray(metric, dtype=np.float64) - origin) @ normal
    return across / parallel_spacing_m(spec)


def fiber_phase(spec: dict, metric: np.ndarray, frames: dict | None = None) -> np.ndarray:
    """Striation phase in cycles for one group at metric chart coordinates.
    ``frames`` is only needed for fan centres on limb charts."""
    if spec["type"] == "fan":
        return fan_phase(spec, metric, spec_center_metric(spec, frames or {}))
    if spec["type"] == "parallel":
        return parallel_phase(spec, metric)
    raise ValueError(f"unknown fibre field type {spec['type']!r}")


def _native_to_metric(chart: str, native: np.ndarray, frames: dict, spec: dict) -> np.ndarray:
    """Chart-native points (as stored in a patch or a spec) to metric."""
    native = np.asarray(native, dtype=np.float64)
    if chart in TORSO_CHARTS:
        return native
    if chart == AROUND_CHART:
        scale = math.radians(1.0) * muscle_eval.TORSO_RADIUS
        out = native.copy()
        out[:, 0] = native[:, 0] * scale
        return out
    if chart in LIMB_CHARTS:
        s = native[:, 0] * frames[chart].length
        angle = _wrap_deg(native[:, 1], float(spec["angle_center"]))
        return np.stack([s, np.radians(angle) * float(spec["radius_m"])], axis=1)
    raise ValueError(f"unknown chart {chart!r}")


def patch_region_points(patch: dict, chart: str, frames: dict, spec: dict) -> np.ndarray:
    """Metric points sampling the patch's chart region: polygon vertices, or
    the corners and edge midpoints of a band rectangle."""
    if "polygon" in patch:
        return _native_to_metric(chart, np.asarray(patch["polygon"], dtype=np.float64), frames, spec)
    s0, s1 = patch["s"]
    centre, half = patch["angle"], patch["half_width"]
    smid = 0.5 * (s0 + s1)
    native = np.array([[s0, centre - half], [s0, centre + half], [s1, centre - half], [s1, centre + half],
                       [smid, centre - half], [smid, centre + half], [s0, centre], [s1, centre], [smid, centre]])
    return _native_to_metric(chart, native, frames, spec)


def fan_span_check(spec: dict, group: dict, frames: dict) -> tuple[float, float]:
    """(unwrapped angular span in degrees, smallest distance in metres from
    the fan centre to the region) for a fan spec against its muscle-map
    patches. A span near 360 means the cut ray crosses the muscle or the
    centre sits inside it; a tiny distance means striations alias near the
    centre."""
    centre = spec_center_metric(spec, frames)
    points = np.concatenate([patch_region_points(p, spec["chart"], frames, spec) for p in group["patches"]])
    rel = points - centre
    theta = np.degrees(np.arctan2(rel[:, 1], rel[:, 0]))
    unwrapped = _unwrap_around_cut(theta, float(spec["cut_deg"]))
    span = float(unwrapped.max() - unwrapped.min())
    return span, float(np.linalg.norm(rel, axis=1).min())


def validate_fiber_map(fiber_map: dict, muscle_map: dict, frames: dict) -> list[str]:
    """Every group needs exactly one spec, on a chart the group uses, with
    sane numbers; every fan must clear the span check. Returns problems."""
    problems: list[str] = []
    groups = muscle_map["groups"]
    specs = fiber_map.get("groups", {})
    for name in groups:
        if name not in specs:
            problems.append(f"muscle group {name!r} has no fibre spec")
    for name, spec in specs.items():
        if name not in groups:
            problems.append(f"fibre spec {name!r} names no muscle group")
            continue
        chart = spec.get("chart")
        if chart not in ALL_CHARTS:
            problems.append(f"{name}: unknown chart {chart!r}")
            continue
        if chart not in [p["chart"] for p in groups[name]["patches"]]:
            problems.append(f"{name}: chart {chart!r} is not used by any patch of the group")
        if chart in LIMB_CHARTS:
            if "angle_center" not in spec:
                problems.append(f"{name}: limb chart {chart!r} needs 'angle_center'")
            if not spec.get("radius_m", 0) > 0:
                problems.append(f"{name}: limb chart {chart!r} needs 'radius_m' > 0")
        kind = spec.get("type")
        if kind == "fan":
            if "center" not in spec or len(spec["center"]) != 2:
                problems.append(f"{name}: fan needs a 2-number 'center'")
                continue
            if not -180.0 <= float(spec.get("cut_deg", 999.0)) <= 180.0:
                problems.append(f"{name}: 'cut_deg' must be in [-180, 180]")
            spacing = float(spec.get("angular_spacing_deg", 0.0))
            if not 0.0 < spacing <= 30.0:
                problems.append(f"{name}: 'angular_spacing_deg' must be in (0, 30]")
                continue
            span, nearest = fan_span_check(spec, groups[name], frames)
            if span > MAX_FAN_SPAN_DEG:
                problems.append(f"{name}: fan span {span:.1f} deg exceeds {MAX_FAN_SPAN_DEG:.0f} — cut ray crosses the muscle or the centre is inside it")
            arc = nearest * math.radians(spacing)
            if arc < MIN_ARC_SPACING_M:
                problems.append(f"{name}: nearest striation arc spacing {arc * 1000:.2f} mm is below {MIN_ARC_SPACING_M * 1000:.0f} mm — move the centre away from the region")
        elif kind == "parallel":
            axis = np.asarray(spec.get("axis", []), dtype=np.float64)
            if axis.shape != (2,) or np.linalg.norm(axis) == 0:
                problems.append(f"{name}: parallel needs a nonzero 2-number 'axis'")
            if not spec.get("spacing_m", 0) > 0:
                problems.append(f"{name}: parallel needs 'spacing_m' > 0")
            if spec.get("wrap") and chart not in LIMB_CHARTS:
                problems.append(f"{name}: 'wrap' only makes sense on a limb chart")
        else:
            problems.append(f"{name}: unknown fibre field type {kind!r}")
    return problems
