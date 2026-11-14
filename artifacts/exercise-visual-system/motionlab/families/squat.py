"""Family: bilateral squat with the load on the upper back (barbell back
squat; front and goblet squats are this template with a different load
position and therefore a more upright trunk).

Technique facts used (sources in the exercise spec's motion_provenance):
* parallel-depth back squat: knee flexion about 110-125 deg, ankle
  dorsiflexion about 30-35 deg, trunk lean about 40-45 deg from vertical
  with a high-bar position (Schoenfeld 2010, JSCR 24(12); Escamilla 2001);
* balance: the bar stays over the middle of the foot through the whole
  repetition. The trunk lean is NOT a parameter here: each frame it is
  solved so the bar is over the mid-foot;
* feet about shoulder width, toes out ~20-30 deg, knees track over the toes;
* arms (14/11 fix): hands outside the shoulders, elbows pointing down and
  a little back under the bar, wrists straight (in line with the forearm).
  The elbow is solved with a two-bone chain towards a pole below and behind
  the hand, and the palm angle follows the solved forearm, so the wrist is
  never bent by a fixed number;
* head: neutral-to-slightly-up gaze (Donnelly et al. 2006, JSCR 20(1):
  upward gaze gives less trunk flexion than downward gaze): the neck and
  head extend by a share of the trunk lean so the face does not drop to the
  floor.

Progress 1 = standing, 0 = bottom (the repetition starts standing).
"""

from __future__ import annotations

import math

import numpy as np

from .. import register
from ..primitives import FORWARD, LEFT, UP, matrix, two_bone_knee, unit


@register("squat")
class SquatTemplate:
    defaults = {
        "knee_flexion_bottom_deg": 115.0,
        "ankle_dorsiflexion_bottom_deg": 32.0,
        "knee_flexion_top_deg": 4.0,
        "ankle_dorsiflexion_top_deg": 2.0,
        "stance_half_width_m": 0.21,
        "toe_out_deg": 22.0,
        "midfoot_forward_of_ankle_m": 0.05,
        "bar_behind_shoulders_m": 0.065,  # used only when no skin profile is given
        "bar_above_shoulders_m": 0.05,
        "bar_shaft_radius_m": 0.0145,
        "bar_into_soft_tissue_m": 0.003,
        "grip_width_between_hand_centres_m": 0.8,
        "pelvis_share_of_lean": 0.8,
        "head_extension_share_of_lean": 0.35,
        "elbow_pole_from_hand_m": [0.22, 0.16, -0.55],
        "wrist_from_palm_centre_m": 0.075,
        "palm_tilt_deg": 0.0,
    }

    def __init__(self, technique: dict, skeleton: dict):
        self.t = {**self.defaults, **technique}
        self.s = skeleton
        s = skeleton
        self.hip_rest = 0.5 * (np.asarray(s["hip_l"]) + np.asarray(s["hip_r"]))
        shoulders = 0.5 * (np.asarray(s["shoulder_l"]) + np.asarray(s["shoulder_r"]))
        self.bar_rest = shoulders + np.array([0.0, self.t["bar_behind_shoulders_m"], self.t["bar_above_shoulders_m"]])
        prof = s.get("back_profile")
        if prof:
            # The bar rests on the skin of the upper trapezius: its centre is
            # one shaft radius behind the rearmost skin within the bar's
            # height, minus a little soft-tissue compression.
            p = np.asarray(prof, float)
            r = self.t["bar_shaft_radius_m"]
            near = p[np.abs(p[:, 0] - self.bar_rest[2]) <= r + 0.005]
            back = float(near[:, 1].max()) if len(near) else float(np.interp(self.bar_rest[2], p[:, 0], p[:, 1]))
            self.bar_rest[1] = back + r - self.t["bar_into_soft_tissue_m"]
        self.trunk_to_bar = float(np.linalg.norm(self.bar_rest - self.hip_rest))
        # Angle of the hip->bar line from vertical at rest (the bar sits a
        # little behind the hip line even standing).
        d = self.bar_rest - self.hip_rest
        self.bar_offset_deg = math.degrees(math.atan2(-d[1], d[2]))  # + = forward of the hip
        self.arms = {side: self._arm(side) for side in ("l", "r")}

    def _arm(self, side: str) -> dict:
        """Rest-frame arm on the bar (the bar rides with the trunk, so this
        holds for every frame): hand centre, elbow, wrist, palm normal."""
        t, s = self.t, self.s
        sign = 1.0 if side == "l" else -1.0
        sh = np.asarray(s[f"shoulder_{side}"], float)
        grip = self.bar_rest + np.array([sign * t["grip_width_between_hand_centres_m"] * 0.5, 0.0, 0.0])
        off = np.array(t["elbow_pole_from_hand_m"], float) * [sign, 1.0, 1.0]
        wrist = grip - UP * t["wrist_from_palm_centre_m"]
        for _ in range(4):  # the wrist sits on the forearm's line below the palm
            elbow = two_bone_knee(sh, wrist, s["upper_arm_m"], s["forearm_m"], forward=unit(grip + off - sh))
            fore = unit(grip - elbow)
            wrist = grip - fore * t["wrist_from_palm_centre_m"]
        # Straight wrist: the palm faces forward, perpendicular to the forearm
        # and to the bar.
        palm = unit(np.cross(LEFT, fore))
        if palm[1] > 0:
            palm = -palm
        # Fine tune measured on the character (the hand's rest offset from
        # the forearm line differs per mesh): + turns the palm upward.
        from ..primitives import rotation
        palm = rotation(LEFT, t["palm_tilt_deg"]) @ palm
        return {"grip": grip, "elbow": elbow, "wrist": wrist, "palm": palm, "pole_offset": grip + off - sh,
                "elbow_flexion_deg": math.degrees(math.acos(np.clip(np.dot(unit(elbow - sh), fore), -1, 1)))}

    def _ankles(self) -> dict:
        t, s = self.t, self.s
        return {side: np.array([sign * t["stance_half_width_m"], s[f"ankle_{side}"][1], s[f"ankle_{side}"][2]])
                for side, sign in (("l", 1.0), ("r", -1.0))}

    def frame(self, progress: float) -> dict:
        t, s = self.t, self.s
        depth = 1.0 - progress
        knee = t["knee_flexion_top_deg"] + depth * (t["knee_flexion_bottom_deg"] - t["knee_flexion_top_deg"])
        ankle = t["ankle_dorsiflexion_top_deg"] + depth * (t["ankle_dorsiflexion_bottom_deg"] - t["ankle_dorsiflexion_top_deg"])
        alpha, beta = math.radians(ankle), math.radians(knee - ankle)  # shin and thigh angles from vertical
        ankles = self._ankles()
        hips = {}
        for side in ("l", "r"):
            a = ankles[side]
            # The feet are wider than the hips: part of each segment's length
            # runs sideways. Split the lateral offset along the leg and keep
            # only the sagittal part in the chain, or the hip lands farther
            # than the leg can reach (the foot lifts).
            dx = abs(a[0] - s[f"hip_{side}"][0])
            total = s["shin_m"] + s["thigh_m"]
            shin = math.sqrt(max(s["shin_m"] ** 2 - (dx * s["shin_m"] / total) ** 2, 1e-6))
            thigh = math.sqrt(max(s["thigh_m"] ** 2 - (dx * s["thigh_m"] / total) ** 2, 1e-6))
            # Sagittal chain: shin leans forward by alpha, thigh leans back by beta.
            k = a + np.array([0.0, -math.sin(alpha), math.cos(alpha)]) * shin
            hips[side] = k + np.array([0.0, math.sin(beta), math.cos(beta)]) * thigh
        hip = 0.5 * (hips["l"] + hips["r"])
        hip[0] = self.hip_rest[0]
        midfoot_y = 0.5 * (ankles["l"][1] + ankles["r"][1]) - t["midfoot_forward_of_ankle_m"]
        # Bar over mid-foot: hip_y - L*sin(lean + offset) = midfoot_y.
        x = np.clip((hip[1] - midfoot_y) / self.trunk_to_bar, -1.0, 1.0)
        lean = max(math.degrees(math.asin(x)) - self.bar_offset_deg, 0.0)
        hip_flex = lean + math.degrees(beta)
        out = {"body": {"hip_centre": hip, "trunk_lean_deg": lean, "pelvis_share": t["pelvis_share_of_lean"],
                        "head_extension_deg": lean * t["head_extension_share_of_lean"]},
               "poles": {}, "implements": {},
               "metrics": {"knee_flexion_deg": knee, "ankle_dorsiflexion_deg": ankle, "trunk_lean_deg": lean, "hip_flexion_deg": hip_flex}}
        for side, sign in (("l", 1.0), ("r", -1.0)):
            toe = math.radians(sign * t["toe_out_deg"])
            fwd = np.array([math.sin(toe) * sign * sign, -math.cos(toe), 0.0])
            fwd[0] = abs(fwd[0]) * sign
            out["poles"][f"ctl_knee_{side}"] = ankles[side] + np.array([0, 0, s["shin_m"]]) + fwd * 0.6
            # Elbows down and back, in the trunk's frame: the pole rides with
            # the shoulder as the trunk drops and leans (generator applies it).
            out.setdefault("poles_trunk", {})[f"ctl_elbow_{side}"] = (f"upperarm_{side}", self.arms[side]["pole_offset"])
        return out

    def static(self) -> dict:
        t = self.t
        out = {}
        for side, sign in (("l", 1.0), ("r", -1.0)):
            out[f"ctl_foot_{side}"] = {"position": self._ankles()[side], "toe_out_deg": sign * t["toe_out_deg"]}
        # The bar rides on the upper back: parented to spine_03 at its rest
        # position; the hands hold it with a pronated grip, palms forward.
        rot = np.column_stack([LEFT, -FORWARD, UP])  # handle along X
        out["attached"] = {"barbell": {"bone": "spine_03", "matrix": matrix(rot, self.bar_rest)}}
        half = t["grip_width_between_hand_centres_m"] * 0.5
        # Palm normal in the bar's frame (X = LEFT, Y = -FORWARD, Z = UP).
        to_bar = np.linalg.inv(rot)
        out["grips"] = {"barbell": {side: {"point": [sign * half, 0, 0], "axis": [sign, 0, 0],
                                           "palm": (to_bar @ self.arms[side]["palm"]).tolist()}
                                    for side, sign in (("l", 1.0), ("r", -1.0))}}
        return out
