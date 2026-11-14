"""Anatomy gate: does the figure actually do THIS kind of exercise?

Plain numpy, no bpy, unit-tested outside Blender. Part of the ASCND Motion
Kit (docs/exercise-visual-system/MOTION_KIT.md).

The joint checks in evs/validation/checks.py prove the skeleton is sound;
they cannot tell a squat from a hinge, or a bench press whose elbows drop
far behind the chest from a good one. This gate measures the movement from
the same sampled joint positions and bounds the metrics that define each
movement family (config/movement_patterns.json). The idea of a per-family
movement gate was learned from studying OpenGym3D's public design notes;
the metrics, the bounds and the code here are ASCND's own, with the bounds
taken from cited research where it exists and marked provisional where not.

Coordinates: metres, Z up, the figure faces -Y in its rest frame. Joint
arrays are (frames, 3). Angles are degrees; "interior" angles are 180 when
a limb is straight.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

REQUIRED = ("shoulder_l", "shoulder_r", "elbow_l", "elbow_r", "wrist_l", "wrist_r",
            "hip_l", "hip_r", "knee_l", "knee_r", "ankle_l", "ankle_r", "pelvis", "neck", "head")


def _unit(v: np.ndarray) -> np.ndarray:
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


def _angle(u: np.ndarray, v: np.ndarray) -> np.ndarray:
    return np.degrees(np.arccos(np.clip((_unit(u) * _unit(v)).sum(-1), -1.0, 1.0)))


def _interior(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    return _angle(a - b, c - b)


def thorax_frame(j: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per-frame (long, lateral, anterior) unit axes of the trunk: long =
    pelvis -> neck, lateral = right -> left shoulder made perpendicular,
    anterior = the chest side."""
    long = _unit(j["neck"] - j["pelvis"])
    lat = j["shoulder_l"] - j["shoulder_r"]
    lat = _unit(lat - (lat * long).sum(-1, keepdims=True) * long)
    ant = np.cross(lat, long)
    return long, lat, ant


def metrics(j: dict) -> dict[str, float]:
    """Movement metrics over the whole clip (or the slice given)."""
    missing = [k for k in REQUIRED if k not in j]
    if missing:
        raise KeyError(f"joint samples missing {missing}")
    up = np.array([0.0, 0.0, 1.0])
    long, lat, ant = thorax_frame(j)
    out: dict[str, float] = {}
    elbows = np.concatenate([_interior(j[f"shoulder_{s}"], j[f"elbow_{s}"], j[f"wrist_{s}"]) for s in "lr"])
    knees = np.concatenate([_interior(j[f"hip_{s}"], j[f"knee_{s}"], j[f"ankle_{s}"]) for s in "lr"])
    out["elbow_min_deg"] = float(elbows.min())
    out["elbow_max_deg"] = float(elbows.max())
    out["elbow_flexion_max_deg"] = float(180.0 - elbows.min())
    out["knee_min_deg"] = float(knees.min())
    out["knee_max_deg"] = float(knees.max())
    trunk = j["neck"] - j["pelvis"]
    # Hip flexion: angle between the trunk and the thigh, 0 standing straight.
    hipflex = np.concatenate([180.0 - _angle(trunk, j[f"knee_{s}"] - j[f"hip_{s}"]) for s in "lr"])
    out["hip_flex_max_deg"] = float(hipflex.max())
    lean = _angle(trunk, np.broadcast_to(up, trunk.shape))
    out["torso_lean_max_deg"] = float(lean.max())
    out["torso_lean_min_deg"] = float(lean.min())
    out["hip_drop_m"] = float(j["pelvis"][:, 2].max() - j["pelvis"][:, 2].min())
    wrist_z = np.maximum(j["wrist_l"][:, 2], j["wrist_r"][:, 2])
    out["wrist_over_head_m"] = float((wrist_z - j["head"][:, 2]).max())
    out["wrist_over_shoulder_m"] = float((wrist_z - np.maximum(j["shoulder_l"][:, 2], j["shoulder_r"][:, 2])).min())
    # Arm elevation: humerus against the trunk's long axis pointing down
    # (0 = arm by the side, 90 = horizontal, 180 = overhead).
    hum = {s: _unit(j[f"elbow_{s}"] - j[f"shoulder_{s}"]) for s in "lr"}
    elev = np.concatenate([_angle(hum[s], -long) for s in "lr"])
    out["arm_elev_max_deg"] = float(elev.max())
    out["arm_elev_min_deg"] = float(elev.min())
    # How much of the elevation is sideways (frontal plane) vs forwards.
    lat_part = np.concatenate([np.abs((hum["l"] * lat).sum(-1)), np.abs((hum["r"] * lat).sum(-1))])
    fwd_part = np.concatenate([np.abs((hum["l"] * ant).sum(-1)), np.abs((hum["r"] * ant).sum(-1))])
    at_peak = np.argmax(elev)
    out["arm_lateral_frac"] = float(lat_part[at_peak] / max(lat_part[at_peak] + fwd_part[at_peak], 1e-9))
    # Humerus against the thorax frontal plane: + in front of the chest, -
    # behind it (a supine press with elbows dropping towards the floor).
    depth = np.concatenate([np.degrees(np.arcsin(np.clip((hum[s] * ant).sum(-1), -1.0, 1.0))) for s in "lr"])
    out["humerus_depth_min_deg"] = float(depth.min())
    # At the deepest elbow bend (the bottom of a press, the top of a curl):
    # arm elevation (shoulder abduction for a press) and forearm tilt.
    n = len(j["pelvis"])
    k = int(np.argmin(elbows)) % n
    elev_k = [float(_angle(hum[s][k], -long[k])) for s in "lr"]
    up_k = np.array([0.0, 0.0, 1.0])
    fore_k = [float(_angle(j[f"wrist_{s}"][k] - j[f"elbow_{s}"][k], up_k)) for s in "lr"]
    out["arm_elev_at_max_flexion_deg"] = float(np.mean(elev_k))
    out["forearm_from_vertical_at_max_flexion_deg"] = float(min(np.mean(fore_k), 180.0 - np.mean(fore_k)))
    out["foot_split_m"] = float(np.abs(j["ankle_l"][:, 1] - j["ankle_r"][:, 1]).max())
    out["foot_spread_m"] = float(np.abs(j["ankle_l"][:, 0] - j["ankle_r"][:, 0]).max())
    wrist_mid = 0.5 * (j["wrist_l"] + j["wrist_r"])
    out["wrist_travel_m"] = float(np.linalg.norm(wrist_mid.max(0) - wrist_mid.min(0)))
    out["root_rise_m"] = float(j["pelvis"][:, 2].max() - j["pelvis"][0, 2])
    return out


def load_patterns(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def rules_for(patterns: dict, movement: dict) -> dict:
    """Bounds of the exercise's pattern, with the exercise's own overrides."""
    name = movement["pattern"]
    if name not in patterns["patterns"]:
        raise KeyError(f"unknown movement pattern {name!r}; known: {sorted(patterns['patterns'])}")
    rules = {k: list(v) for k, v in patterns["patterns"][name]["bounds"].items()}
    for k, v in movement.get("qa", {}).items():
        rules[k] = list(v)
    return rules


def evaluate(j: dict, patterns: dict, movement: dict) -> list[dict]:
    """One result per bounded metric: measured value, [lo, hi], pass."""
    m = metrics(j)
    pattern = patterns["patterns"][movement["pattern"]]
    out = []
    for key, (lo, hi) in rules_for(patterns, movement).items():
        if key not in m:
            raise KeyError(f"pattern {movement['pattern']!r} bounds unknown metric {key!r}")
        v = m[key]
        ok = (lo is None or v >= lo) and (hi is None or v <= hi)
        out.append({"metric": key, "measured": round(v, 3), "limit": [lo, hi], "pass": bool(ok),
                    "provisional": key in pattern.get("provisional", []) or pattern.get("status") == "provisional",
                    "source": pattern.get("sources", {}).get(key, "")})
    return out
