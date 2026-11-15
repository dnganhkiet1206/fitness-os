"""Family: seated overhead press with a free weight in each hand (seated
dumbbell shoulder press; the standing and barbell versions are this template
with other parameters).

Technique facts used (sources in the exercise spec's motion_provenance):
* seated on a bench with the back pad upright, back against the pad, feet
  flat on the floor (free-exercise-db "Dumbbell Shoulder Press", ACE);
* bench back pad at 70 deg (20 deg off vertical), back and head on the pad;
  shoulder blades held down (depressed) the whole set (14/11 Kiệt);
* start: deep, the dumbbells come down almost to the shoulders, upper arm
  ~37 deg from the side, forearms vertical under the weights, palms forward
  but turned slightly in (~20 deg). Earlier versions stopped at ear height
  (78 deg), much shallower than coaches demonstrate;
* press: the weights go up until the arms are almost straight and the
  dumbbells meet above the head, slightly in front of it; then back down;
* the shoulder girdle moves with the arm: the shoulder blade turns upward
  about 1 deg for every 2 deg the arm rises past ~30 deg (Inman 1944,
  primitives.scapulohumeral). Without it an overhead arm pokes out of a
  frozen shoulder.

Progress 0 = bottom (dumbbells at the shoulders), 1 = top. The bench is
placed by the template against the body (static "place").
"""

from __future__ import annotations

import math

import numpy as np

from .. import register
from ..primitives import FORWARD, LEFT, UP, matrix, rotation, scapulohumeral, two_bone_knee, unit
from .hinge import HingeTemplate


@register("press_vertical")
class PressVerticalTemplate(HingeTemplate):
    defaults = {
        **HingeTemplate.defaults,
        "seat_top_m": 0.45,               # must match the bench spec in exercise.json
        "hip_joint_above_seat_m": 0.09,   # hip joint above the compressed seat skin
        "trunk_lean_deg": -19.0,          # back along the pad (bench at 70 deg, 14/11 Kiệt)
        "back_pad_angle_from_vertical_deg": 20.0,  # must match utility_bench_70
        "pelvis_share_of_lean": 0.6,
        "head_extension_share_of_lean": 0.0,
        "seated_ankle_half_width_m": 0.20,
        "seated_toe_out_deg": 12.0,
        # Start: upper arm a little below level, forearm vertical, so the
        # handles sit at ear height beside the head (ACE; free-exercise-db
        # "dumbbells at shoulder height").
        "bottom_upper_arm_elevation_deg": 37.0,   # deep: dumbbells come down almost to the shoulders (Kiệt 14/11)
        "top_upper_arm_elevation_deg": 172.0,
        "top_forearm_in_deg": 6.0,
        "arm_plane_from_frontal_deg": 35.0,       # elbows "tucked", scapular plane 30-45 deg forward (video + ACE)
        "grip_turn_in_deg": 20.0,                 # palms turned slightly in from straight forward
        "scapular_depression_deg": 6.0,           # shoulders held down, away from the ears
        # Dumbbells "touch at the top": the inner heads meet, so the handle
        # centres sit one half-length (0.15 m) from the midline. 14/11
        # Kiệt's recording: at 0.10 the two dumbbells passed through each other.
        "top_wrist_half_gap_m": 0.155,
        "top_wrist_in_front_m": 0.06,
        "top_reach_fraction": 0.988,
        "bottom_forearm_in_deg": 8.0,
        "palm_centre_beyond_wrist_m": 0.075,
    }

    def __init__(self, technique: dict, skeleton: dict):
        super().__init__(technique, skeleton)
        t, s = self.t, self.s
        self.hip = np.array([self.hip_rest[0], self.hip_rest[1], t["seat_top_m"] + t["hip_joint_above_seat_m"]])
        self.lean = t["trunk_lean_deg"]

    # Shoulder joint for a given girdle pose, through the same chain the
    # generator uses: clavicle elevation in the rest frame, then the trunk.
    def shoulder(self, side: str, clav_deg: float) -> np.ndarray:
        return self.girdle_shoulder(side, self.hip, self.lean, elevation_deg=clav_deg)

    def _arm(self, side: str, progress: float) -> dict:
        """The press as a coach describes it: the forearm stays vertical
        under the weight and the upper arm rises in its plane (15 deg in
        front of the frontal plane) from just below level to almost
        overhead; the elbow straightens by itself because the hand stays
        over it. Only near lockout the forearms lean in a little so the
        weights finish over the shoulders, close but not touching.
        14/11 Kiệt ("sai hoàn toàn"): the first versions moved the wrist on
        a straight diagonal from the wide bottom to a meeting point overhead,
        so the forearms leaned in the whole way (a V-shaped lift) and the two
        dumbbells passed through each other at the top."""
        t, s = self.t, self.s
        sign = 1.0 if side == "l" else -1.0
        L1, L2 = s["upper_arm_m"], s["forearm_m"]
        elev = t["bottom_upper_arm_elevation_deg"] + progress * (t["top_upper_arm_elevation_deg"] - t["bottom_upper_arm_elevation_deg"])
        g = dict(scapulohumeral(elev))
        # Shoulders held down (scapular depression): the clavicle sits
        # below the rhythm's value the whole set.
        g["clavicle_elevation_deg"] -= t["scapular_depression_deg"]
        sh = self.shoulder(side, g["clavicle_elevation_deg"])
        phi = math.radians(t["arm_plane_from_frontal_deg"])
        horiz = unit(sign * LEFT * math.cos(phi) + FORWARD * math.sin(phi))
        axis = unit(np.cross(-UP, horiz))
        upper = rotation(axis, elev) @ (-UP)
        elbow = sh + upper * L1
        lean_in = math.radians(t["top_forearm_in_deg"]) * max(0.0, (progress - 0.6) / 0.4) ** 2
        fore = unit(UP - sign * LEFT * math.tan(lean_in))
        wrist = elbow + fore * L2
        # Elbow bends out to the side and a little down/back.
        pole_dir = unit(horiz - UP * 0.4 - FORWARD * 0.2)
        return {"shoulder": sh, "elbow": elbow, "wrist": wrist, "elevation": elev, "girdle": g, "pole": pole_dir}

    def frame(self, progress: float) -> dict:
        t, s = self.t, self.s
        out = {"body": {"hip_centre": self.hip, "trunk_lean_deg": self.lean, "pelvis_share": t["pelvis_share_of_lean"],
                        "head_extension_deg": 0.0},
               "poles": {}, "implements": {}, "wrists": {}, "girdle": {}, "metrics": {}}
        for side, sign in (("l", 1.0), ("r", -1.0)):
            a = self._arm(side, progress)
            fore = unit(a["wrist"] - a["elbow"])
            # Palms forward, turned slightly in towards the midline
            # (semi-pronated grip); the thumb end of the handle moves back.
            gi = math.radians(t["grip_turn_in_deg"])
            palm = FORWARD * math.cos(gi) - sign * LEFT * math.sin(gi)
            palm = unit(palm - fore * float(np.dot(palm, fore)))
            # Handle level whatever the forearm's tilt: the wrist takes the
            # small sideways bend, the weight does not tip.
            x = -sign * LEFT * math.cos(gi) - FORWARD * math.sin(gi)  # thumb towards the midline
            x = unit(x - palm * float(np.dot(x, palm)))
            z = np.cross(x, palm)
            centre = a["wrist"] + fore * t["palm_centre_beyond_wrist_m"]
            out["implements"][f"dumbbell_{side}"] = matrix(np.column_stack([x, palm, z]), centre)
            out["wrists"][f"dumbbell_{side}"] = a["wrist"]
            out["poles"][f"ctl_elbow_{side}"] = a["elbow"] + a["pole"] * 0.35
            out["girdle"][side] = a["girdle"]
            out["metrics"][f"arm_elevation_{side}_deg"] = a["elevation"]
            out["metrics"][f"scapula_upward_{side}_deg"] = a["girdle"]["upward_rotation_deg"]
            out["metrics"][f"elbow_flexion_{side}_deg"] = math.degrees(math.acos(float(np.clip(np.dot(unit(a["elbow"] - a["shoulder"]), fore), -1, 1))))
            out["poles"][f"ctl_knee_{side}"] = self._seated_legs()[1][side] + np.array([sign * 0.1, -0.6, 0.2])
        return out

    def _seated_legs(self) -> tuple[dict, dict]:
        t, s = self.t, self.s
        ankles, knees = {}, {}
        for side, sign in (("l", 1.0), ("r", -1.0)):
            hip_side = self.hip + (np.asarray(s[f"hip_{side}"], float) - self.hip_rest)
            ankle = np.array([sign * t["seated_ankle_half_width_m"], hip_side[1] - 0.92 * s["thigh_m"], s[f"ankle_{side}"][2]])
            ankles[side] = ankle
            knees[side] = two_bone_knee(hip_side, ankle, s["thigh_m"], s["shin_m"], forward=unit(FORWARD + UP))
        return ankles, knees

    def static(self) -> dict:
        t, s = self.t, self.s
        ankles, _knees = self._seated_legs()
        out = {f"ctl_foot_{side}": {"position": ankles[side], "toe_out_deg": sign * t["seated_toe_out_deg"]}
               for side, sign in (("l", 1.0), ("r", -1.0))}
        # Bench: its back pad's front face touches the posed upper back.
        prof = s.get("back_profile") or []
        pts = {f"b{i}": np.array([0.0, y, z]) for i, (z, y) in enumerate(prof)}
        posed = self._shoulders(self.hip, self.lean, pts) if pts else {}
        tan = math.tan(math.radians(t["back_pad_angle_from_vertical_deg"]))
        seat = t["seat_top_m"]
        if posed:
            y_b = max(p[1] - tan * (p[2] - seat - 0.01) for p in posed.values())
        else:
            y_b = self.hip[1] + 0.15
        out["place"] = {"bench": matrix(np.eye(3), np.array([0.0, y_b, 0.0]))}
        return out
