"""Family: standing raise with a free weight in each hand (side lateral
raise; the front raise is this template with plane_from_frontal_deg = 90).

Technique facts used (sources in the exercise spec's motion_provenance):
* the arms rise out to the sides to about shoulder height (humeral
  elevation ~80-90 deg) and no higher; above that the upper trapezius takes
  over and the shoulder shrugs (ACE exercise library; ExRx "Dumbbell Lateral
  Raise");
* the arms move a little in front of the frontal plane, in the plane of the
  scapula (~20-30 deg forward), which is the usual coaching position and
  keeps the shoulder comfortable (Kapandji; ACE);
* elbows slightly bent and fixed through the repetition (~10-20 deg);
* palms face the body at the bottom and the floor at the top: the hand turns
  with the arm, the wrist stays straight;
* trunk upright and still, feet hip width.

Progress 0 = bottom (arms down), 1 = top.

The rig has shoulder-blade bones but no automatic scapulohumeral rhythm yet
(MOTION_KIT.md roadmap 4), so the top stays at shoulder height, where the
shoulder blade has turned least.
"""

from __future__ import annotations

import math

import numpy as np

from .. import register
from ..primitives import FORWARD, LEFT, UP, matrix, rotation, unit
from .curl import CurlTemplate


def raise_arm(side: str, elevation_deg: float, plane_deg: float, elbow_flexion_deg: float) -> dict:
    """Unit directions of a raised arm. elevation 0 = hanging, 90 = level;
    plane 0 = straight out to the side, 90 = straight forward. The elbow
    bends towards the front. The palm starts facing the body and turns with
    the arm (rotation about the same axis as the elevation)."""
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
    thumb = rotation(axis, elevation_deg) @ FORWARD
    thumb = unit(thumb - fore * float(np.dot(thumb, fore)) - palm * float(np.dot(thumb, palm)))
    return {"upper": upper, "fore": fore, "palm": palm, "thumb": thumb}


@register("raise_lateral")
class RaiseTemplate(CurlTemplate):
    defaults = {
        "elevation_bottom_deg": 12.0,
        "elevation_top_deg": 84.0,
        "plane_from_frontal_deg": 22.0,
        "elbow_flexion_deg": 15.0,
        "palm_centre_beyond_wrist_m": 0.075,
        "stance_half_width_m": 0.13,
        "toe_out_deg": 8.0,
    }

    def frame(self, progress: float) -> dict:
        t, s = self.t, self.s
        elev = t["elevation_bottom_deg"] + progress * (t["elevation_top_deg"] - t["elevation_bottom_deg"])
        out = {"implements": {}, "poles": {}, "wrists": {}, "metrics": {"shoulder_elevation_deg": elev}}
        for side in ("l", "r"):
            a = raise_arm(side, elev, t["plane_from_frontal_deg"], t["elbow_flexion_deg"])
            shoulder = np.asarray(s[f"shoulder_{side}"], float)
            elbow = shoulder + a["upper"] * s["upper_arm_m"]
            wrist = elbow + a["fore"] * s["forearm_m"]
            centre = wrist + a["fore"] * t["palm_centre_beyond_wrist_m"]
            # Implement frame as in the curl: +Y = palm, X = thumb side (the
            # handle runs from the thumb to the little finger).
            x = a["thumb"]
            z = np.cross(x, a["palm"])
            out["implements"][f"dumbbell_{side}"] = matrix(np.column_stack([x, a["palm"], z]), centre)
            bend = elbow - 0.5 * (shoulder + wrist)
            bend = unit(bend) if np.linalg.norm(bend) > 1e-3 else -FORWARD
            out["poles"][f"ctl_elbow_{side}"] = elbow + bend * 0.35
            out["wrists"][f"dumbbell_{side}"] = wrist
            out["metrics"][f"elbow_{side}"] = elbow
        return out
