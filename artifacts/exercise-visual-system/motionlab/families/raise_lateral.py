"""Family: standing raise with a free weight in each hand (side lateral
raise; the front raise is this template with the top plane forward).

Technique, checked against the ExRx "Dumbbell Lateral Raise" instructions
and photos (14/11 Kiệt: "đối chiếu hình ảnh"):
* preparation: dumbbells held IN FRONT OF THE THIGHS, elbows slightly bent;
  bend over slightly with hips and knees bent slightly;
* execution: with the elbows fixed slightly bent, raise the upper arms out
  to the sides until the ELBOWS are at shoulder height, elbows pointing
  back; at the top the elbows are directly lateral to the shoulders and the
  forearms angle forward;
* the dumbbells rise by shoulder abduction, not external rotation: the
  hand turns with the arm, palms end facing the floor, the handle stays
  level;
* the shoulder girdle follows the arm (primitives.scapulohumeral).
The first version (14/11) started with the weights at the sides, the trunk
and knees straight, and raised the arms 22 deg in front of the frontal
plane, so the elbows never reached a true side position.

Progress 0 = bottom (weights in front of the thighs), 1 = top.
"""

from __future__ import annotations

import math

import numpy as np

from .. import register
from ..primitives import FORWARD, LEFT, UP, matrix, rotation, scapulohumeral, unit
from .hinge import HingeTemplate


def raise_arm(side: str, elevation_deg: float, plane_deg: float, elbow_flexion_deg: float) -> dict:
    """Unit directions of a raised arm. elevation 0 = hanging, 90 = level;
    plane 0 = straight out to the side, 90 = straight forward. The forearm
    bends forward from the upper arm. The palm starts facing the body's
    midline and turns with the arm; the handle stays level, pointing
    forward (thumb side forward)."""
    s = 1.0 if side == "l" else -1.0
    down = -UP
    phi = math.radians(plane_deg)
    horiz = unit(s * LEFT * math.cos(phi) + FORWARD * math.sin(phi))
    axis = unit(np.cross(down, horiz))
    upper = rotation(axis, elevation_deg) @ down
    f = FORWARD - upper * float(np.dot(FORWARD, upper))
    f = unit(f) if np.linalg.norm(f) > 1e-6 else -UP
    b = math.radians(elbow_flexion_deg)
    fore = unit(upper * math.cos(b) + f * math.sin(b))
    palm = rotation(axis, elevation_deg) @ (-s * LEFT)
    palm = unit(palm - fore * float(np.dot(palm, fore)))
    thumb = unit(FORWARD - fore * float(np.dot(FORWARD, fore)) - palm * float(np.dot(FORWARD, palm)))
    return {"upper": upper, "fore": fore, "palm": palm, "thumb": thumb}


@register("raise_lateral")
class RaiseTemplate(HingeTemplate):
    defaults = {
        **HingeTemplate.defaults,
        "trunk_lean_deg": 10.0,           # "bend over slightly"
        "knee_flexion_deg": 12.0,         # "knees bent slightly"
        "pelvis_share_of_lean": 1.0,
        "head_extension_share_of_lean": 0.6,
        "elevation_bottom_deg": 20.0,
        "elevation_top_deg": 90.0,        # elbows at shoulder height
        "plane_bottom_deg": 118.0,        # past straight-forward: hands in front of the thighs, close together
        "plane_top_deg": 0.0,             # elbows directly lateral at the top
        "elbow_flexion_deg": 20.0,
        "palm_centre_beyond_wrist_m": 0.075,
        "stance_half_width_m": 0.13,
        "toe_out_deg": 8.0,
    }

    def __init__(self, technique: dict, skeleton: dict):
        super().__init__(technique, skeleton)
        t = self.t
        self.lean = t["trunk_lean_deg"]
        self.hip, self.hips, self.knees, self.ankles, self.alpha = self.legs(self.lean, t["knee_flexion_deg"])

    def frame(self, progress: float) -> dict:
        t, s = self.t, self.s
        elev = t["elevation_bottom_deg"] + progress * (t["elevation_top_deg"] - t["elevation_bottom_deg"])
        # The arm swings out to the side early in the lift (the plane turns
        # faster than the arm rises), as the photos show.
        plane = t["plane_bottom_deg"] + (t["plane_top_deg"] - t["plane_bottom_deg"]) * (1.0 - (1.0 - progress) ** 2)
        g = scapulohumeral(elev)
        out = {"body": {"hip_centre": self.hip, "trunk_lean_deg": self.lean, "pelvis_share": t["pelvis_share_of_lean"],
                        "head_extension_deg": self.lean * t["head_extension_share_of_lean"]},
               "implements": {}, "poles": {}, "wrists": {}, "girdle": {},
               "metrics": {"shoulder_elevation_deg": elev, "arm_plane_deg": plane, "scapula_upward_deg": g["upward_rotation_deg"]}}
        for side, sign in (("l", 1.0), ("r", -1.0)):
            a = raise_arm(side, elev, plane, t["elbow_flexion_deg"])
            shoulder = self.girdle_shoulder(side, self.hip, self.lean, elevation_deg=g["clavicle_elevation_deg"])
            elbow = shoulder + a["upper"] * s["upper_arm_m"]
            wrist = elbow + a["fore"] * s["forearm_m"]
            centre = wrist + a["fore"] * t["palm_centre_beyond_wrist_m"]
            x = a["thumb"]
            z = np.cross(x, a["palm"])
            out["implements"][f"dumbbell_{side}"] = matrix(np.column_stack([x, a["palm"], z]), centre)
            # Elbow points back and out (ExRx: "elbows pointed back").
            pole_dir = unit(a["upper"] * 0.0 - FORWARD + sign * LEFT * 0.3 - UP * 0.2)
            out["poles"][f"ctl_elbow_{side}"] = elbow + pole_dir * 0.35
            out["wrists"][f"dumbbell_{side}"] = wrist
            out["girdle"][side] = g
            out["metrics"][f"elbow_{side}"] = elbow
            toe = math.radians(sign * t["toe_out_deg"])
            out["poles"][f"ctl_knee_{side}"] = self.knees[side] + np.array([abs(math.sin(toe)) * sign, -math.cos(toe), 0.0]) * 0.6
        return out
