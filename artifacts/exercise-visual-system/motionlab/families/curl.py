"""Family: elbow flexion with a free weight, standing (biceps curl, hammer
curl; incline/preacher curls are this template with a different shoulder
position).

Technique facts used (sources in the exercise spec's motion_provenance):
* the upper arm stays by the side and nearly still; a little forward drift
  at the top is normal (ACE, ExRx);
* the elbow moves from nearly straight to about 130-145 deg of flexion,
  inside the normal elbow range 0-150 deg (AAOS);
* supinated grip for the biceps curl (palms forward at the bottom, up at
  the top), neutral grip (thumbs up) for the hammer curl;
* trunk upright and still, feet planted about hip width.

Progress 0 = bottom (arms down), 1 = top (elbows flexed).
"""

from __future__ import annotations

import numpy as np

from .. import register
from ..primitives import FORWARD, LEFT, UP, arm_directions, matrix, rotation, unit


@register("curl")
class CurlTemplate:
    defaults = {
        "elbow_flexion_bottom_deg": 12.0,
        "elbow_flexion_top_deg": 138.0,
        # 14/11: at 0 deg / 6 deg the inner dumbbell head sat 7 cm inside the
        # hip of character 003; the weights hang just outside and a little
        # in front of the thighs (MOTION_KIT_LESSONS.md).
        "shoulder_flexion_bottom_deg": 6.0,
        "shoulder_flexion_top_deg": 10.0,
        "upper_arm_abduction_deg": 12.0,
        "grip": "supinated",
        "palm_centre_beyond_wrist_m": 0.075,
        "stance_half_width_m": 0.13,
        "toe_out_deg": 8.0,
    }

    def __init__(self, technique: dict, skeleton: dict):
        """skeleton: rest-pose world positions and lengths from the rig:
        shoulder_l/r, upper_arm_m, forearm_m, ankle_l/r."""
        self.t = {**self.defaults, **technique}
        self.s = skeleton

    def frame(self, progress: float) -> dict:
        t, s = self.t, self.s
        flex = t["elbow_flexion_bottom_deg"] + progress * (t["elbow_flexion_top_deg"] - t["elbow_flexion_bottom_deg"])
        sflex = t["shoulder_flexion_bottom_deg"] + progress * (t["shoulder_flexion_top_deg"] - t["shoulder_flexion_bottom_deg"])
        out = {"implements": {}, "poles": {}, "feet": {}, "metrics": {"elbow_flexion_deg": flex, "shoulder_flexion_deg": sflex}}
        for side, sign in (("l", 1.0), ("r", -1.0)):
            upper, fore = arm_directions(side, sflex, t["upper_arm_abduction_deg"], flex)
            shoulder = np.asarray(s[f"shoulder_{side}"], float)
            elbow = shoulder + upper * s["upper_arm_m"]
            wrist = elbow + fore * s["forearm_m"]
            centre = wrist + fore * t["palm_centre_beyond_wrist_m"]
            # Implement frame (matches the hand socket in generate_exercise):
            # local +Y = where the palm faces, local -X = from the index-finger
            # side of the grip to the little-finger side.
            front = unit(-np.cross(LEFT, fore))          # front of the forearm
            if t["grip"] == "neutral":
                palm = -LEFT * sign                       # palms face the body
                x = front                                 # thumb side forward
            else:
                palm = front                              # supinated: palm on the forearm's front
                x = LEFT * sign                           # index finger lateral
            x = unit(x - palm * np.dot(x, palm))
            z = np.cross(x, palm)
            out["implements"][f"dumbbell_{side}"] = matrix(np.column_stack([x, palm, z]), centre)
            # Pole along the template's own bend direction, so the IK elbow
            # lands on the template elbow (pinned by the side), not wherever
            # a generic "behind" hint puts it.
            bend = elbow - 0.5 * (shoulder + wrist)
            bend = unit(bend) if np.linalg.norm(bend) > 1e-3 else -FORWARD
            out["poles"][f"ctl_elbow_{side}"] = elbow + bend * 0.35
            out.setdefault("wrists", {})[f"dumbbell_{side}"] = wrist
            out["metrics"][f"elbow_{side}"] = elbow
        return out

    def static(self) -> dict:
        """Things that do not move: feet planted, knees pointing forward."""
        t, s = self.t, self.s
        feet = {}
        for side, sign in (("l", 1.0), ("r", -1.0)):
            ankle = np.array([sign * t["stance_half_width_m"], s[f"ankle_{side}"][1], s[f"ankle_{side}"][2]])
            feet[f"ctl_foot_{side}"] = {"position": ankle, "toe_out_deg": sign * t["toe_out_deg"]}
            feet[f"ctl_knee_{side}"] = {"pole": ankle + np.array([sign * 0.05, -0.6, 0.5])}
        return feet
