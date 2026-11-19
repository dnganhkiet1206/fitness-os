"""Family: bent-over row with a free weight in each hand (bent-over
two-dumbbell row; the barbell row is this template with one implement and a
pronated grip, the one-arm row adds a hand and knee on a bench).

Technique facts used (sources in the exercise spec's motion_provenance):
* the body holds a hip hinge for the whole set: knees slightly bent, back
  flat, trunk close to parallel with the floor (~70-80 deg forward), head in
  line or slightly up (free-exercise-db "Bent Over Two-Dumbbell Row", ExRx
  "Dumbbell Bent-over Row"). The hinge posture, the balance and the exact
  shoulder positions come from the hinge template;
* start: arms hang straight down under the shoulders;
* the forearm stays plumb (vertical) through the pull: the load hangs from
  the hand, the elbow leads;
* pull: the elbows travel up and back close to the body until the hands
  reach the side of the lower ribs / waist; upper arm ends about level with
  the back, elbow flexed ~90-100 deg; the trunk does not move;
* neutral grip (palms face the body), wrists straight.

Progress 0 = arms hanging, 1 = top of the pull.
"""

from __future__ import annotations

import math

import numpy as np

from .. import register
from ..primitives import LEFT, matrix, rotation, unit
from .hinge import HingeTemplate


@register("row")
class RowTemplate(HingeTemplate):
    # 15/11 Kiệt "bent over sai tư thế", re-checked on two real-person
    # videos (YouTube QFq5jdwWwX4, fFmwY2dA2ds) and coaching pages
    # (Garage Gym Reviews, PowerliftingTechnique, Muscle & Strength,
    # PureGym): torso hinged about 45-55 deg and held there, knees soft,
    # neck neutral (eyes a little ahead of the feet), elbows close to the
    # body and driven back toward the hips. The first version hinged to
    # 75 deg, flared the elbows 24 deg out (pole pulled sideways) and
    # extended the head 41 deg, which read as a rear-delt fly.
    defaults = {
        **HingeTemplate.defaults,
        # Knees bent enough that the shins stand about vertical and the hips
        # sit back (14/11 Kiệt: at 20 deg the shins sloped back and the
        # legs looked locked, the body leaning on stiff legs).
        "trunk_lean_deg": 52.0,
        "knee_flexion_deg": 26.0,
        # Flat back, chest up: the whole lean at the hips, and the spine a
        # little extended (pelvis share > 1). 14/11 Kiệt: the first version
        # bent the spine (rounded upper back, shoulders hunched) and the head
        # hung to the chest; the source says "keep the head up".
        "pelvis_share_of_lean": 1.12,
        "head_extension_share_of_lean": 0.3,
        # Shoulder blades squeeze back at the top of the pull.
        "top_scapular_retraction_deg": 16.0,
        # Top of the pull: the upper arm lies along the trunk towards the
        # hips, lifted a little above the line of the back, slightly out
        # from the side. The forearm hangs plumb the whole time (the weight
        # pulls straight down), so the hand path follows from the elbow.
        "top_upper_arm_above_back_deg": 28.0,
        "top_upper_arm_out_deg": 18.0,
        "start_elbow_flexion_deg": 7.0,
        "start_arm_out_deg": 9.0,
        "grip_half_width_m": 0.17,
    }

    def __init__(self, technique: dict, skeleton: dict):
        super().__init__(technique, skeleton)
        t = self.t
        lean, knee = t["trunk_lean_deg"], t["knee_flexion_deg"]
        self.hip, self.hips, self.knees, self.ankles, self.alpha = self.legs(lean, knee)
        self.shoulders = self._shoulders(self.hip, lean)
        self.lean = lean
        mid = 0.5 * (self.shoulders["l"] + self.shoulders["r"])
        self.up_trunk = unit(mid - self.hip)                   # hips -> shoulders
        self.dorsal = unit(np.cross(LEFT, self.up_trunk))      # back side (faces up when bent)
        if self.dorsal[2] < 0:
            self.dorsal = -self.dorsal

    def _upper(self, side: str, progress: float) -> np.ndarray:
        """Upper-arm direction: from hanging straight down (0) to the top
        position (1), turning at a steady rate in one plane."""
        t = self.t
        sign = 1.0 if side == "l" else -1.0
        down = np.array([0.0, 0.0, -1.0])
        e, o = math.radians(t["top_upper_arm_above_back_deg"]), math.radians(t["top_upper_arm_out_deg"])
        top = unit(-self.up_trunk * math.cos(e) + self.dorsal * math.sin(e) + LEFT * sign * math.tan(o))
        ang = math.acos(float(np.clip(np.dot(down, top), -1, 1)))
        axis = unit(np.cross(down, top))
        # Start a few degrees forward of plumb: a dead-straight arm sits on
        # the IK's singular point (MOTION_KIT_LESSONS.md, hinge 14/11).
        start = -t["start_elbow_flexion_deg"]
        u = rotation(axis, start + (math.degrees(ang) - start) * progress) @ down
        # Hanging arms a little out to the side, so the weights clear the
        # knees (14/11: the rear head touched the shin by 6 mm); the top
        # position carries its own lateral angle.
        return rotation(np.array([0.0, -1.0, 0.0]), sign * t["start_arm_out_deg"] * (1.0 - progress)) @ u

    def frame(self, progress: float) -> dict:
        t, s = self.t, self.s
        lean = t["trunk_lean_deg"]
        out = {"body": {"hip_centre": self.hip, "trunk_lean_deg": lean, "pelvis_share": t["pelvis_share_of_lean"],
                        "head_extension_deg": lean * t["head_extension_share_of_lean"]},
               "poles": {}, "implements": {}, "wrists": {},
               "metrics": {"trunk_lean_deg": lean, "knee_flexion_deg": t["knee_flexion_deg"], "shank_tilt_deg": self.alpha}}
        retract = progress * t["top_scapular_retraction_deg"]
        out["girdle"] = {}
        for side, sign in (("l", 1.0), ("r", -1.0)):
            sh = self.girdle_shoulder(side, self.hip, self.lean, retraction_deg=retract)
            out["girdle"][side] = {"clavicle_retraction_deg": retract}
            elbow = sh + self._upper(side, progress) * s["upper_arm_m"]
            wrist = elbow + np.array([0.0, 0.0, -1.0]) * s["forearm_m"]
            # A fixed bend side (towards the hips, up and out): a pole taken
            # from the nearly straight start arm is a tiny noisy vector and
            # flipped the upper arm 180 deg between frames (14/11).
            pole_dir = unit(-self.up_trunk * 0.5 + self.dorsal + LEFT * sign * 0.1)
            fore = unit(wrist - elbow)
            # Neutral grip: palm towards the body's midline, thumb towards
            # the head end of the trunk.
            palm = -sign * LEFT
            palm = unit(palm - fore * float(np.dot(palm, fore)))
            thumb = self.up_trunk - fore * float(np.dot(self.up_trunk, fore)) - palm * float(np.dot(self.up_trunk, palm))
            x = unit(thumb)
            z = np.cross(x, palm)
            centre = wrist + fore * t["palm_centre_beyond_wrist_m"]
            out["implements"][f"dumbbell_{side}"] = matrix(np.column_stack([x, palm, z]), centre)
            out["wrists"][f"dumbbell_{side}"] = wrist
            out["poles"][f"ctl_elbow_{side}"] = elbow + pole_dir * 0.35
            toe = math.radians(sign * t["toe_out_deg"])
            fwd = np.array([abs(math.sin(toe)) * sign, -math.cos(toe), 0.0])
            out["poles"][f"ctl_knee_{side}"] = self.knees[side] + fwd * 0.6
            out["metrics"][f"elbow_flexion_{side}"] = math.degrees(math.acos(np.clip(np.dot(unit(elbow - sh), fore), -1, 1)))
        return out
