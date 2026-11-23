"""Family: standing overhead press with a barbell (standing military press /
strict press). Legs from the hinge family (standing, balanced over the
mid-foot); arms on one bar like the squat family; the bar is pressed from
the front of the shoulders to straight arms overhead.

Technique facts used (sources in the exercise spec's motion_provenance;
videos watched 23/11, see exercise.json):
* stance about hip width, knees straight, glutes and abs tight, no lean
  back (video zSU7T1zZagQ 8 s / 14 s "squeeze glutes"; Built With Science,
  Livestrong: arching the lower back is the main fault);
* grip just outside the shoulders, about a thumb's length (video
  4LBVP2Oe7fg 2 s / 11 s, zSU7T1zZagQ 3 s "too wide" / 17 s;
  powerliftingtechnique.com, barbend.com "slightly wider than shoulder
  width");
* start: the bar rests on the front of the shoulders at the collarbones,
  forearms vertical under it from the side and from the front, elbows a
  little in front of the bar (4LBVP2Oe7fg 6 s / 8.5 s; stronglifts.com);
* the bar travels in a straight vertical line over the mid-foot
  (trainheroic.com; Starting Strength "bar over the mid-foot"; side view
  5cSo71oxLVc 0.5-3 s): the head moves back out of its way, then once the
  bar passes the forehead the head and chest come "through the window" so
  the bar locks out over the shoulders and the back of the head
  (muscleandstrength.com, humankinetics.com "move the body around the bar";
  3RdVYQ8l_V8 18 s, 5cSo71oxLVc 3 s);
* lockout: arms straight beside the ears, shoulders shrugged up (the
  scapulohumeral rhythm, primitives.scapulohumeral; stronglifts.com "shrug
  at the top").

Progress 0 = bottom (bar on the shoulders), 1 = top (arms locked out).
"""

from __future__ import annotations

import math

import numpy as np

from .. import register
from ..primitives import FORWARD, LEFT, UP, matrix, rotation, scapulohumeral, two_bone_knee, unit
from .hinge import HingeTemplate


def smooth(x: float) -> float:
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


@register("press_overhead")
class PressOverheadTemplate(HingeTemplate):
    defaults = {
        **HingeTemplate.defaults,
        "stance_half_width_m": 0.15,          # feet about hip width (3RdVYQ8l_V8 9 s)
        "toe_out_deg": 8.0,
        "knee_flexion_deg": 3.0,              # knees straight, not locked back
        "pelvis_share_of_lean": 0.5,
        # Trunk lean (+ forward, - back). Bottom: a few degrees back so the
        # face clears the bar; top: upright with the chest "through".
        "trunk_lean_bottom_deg": -4.0,
        "trunk_lean_top_deg": 1.0,
        # Head tilt (+ = back / chin up): back while the bar passes the face,
        # then forward through the arms at lockout.
        "head_extension_bottom_deg": 6.0,
        "head_extension_pass_deg": 12.0,
        "head_extension_top_deg": -6.0,
        # Hands just outside the shoulders (~0.43 m shoulder joints apart on
        # the master character; about a thumb's length outside the deltoids).
        "grip_width_between_hand_centres_m": 0.64,
        # Bar centre at the bottom relative to the mid-point of the shoulder
        # joints: resting on the front delts at collarbone height.
        "bottom_bar_forward_of_shoulders_m": 0.16,
        # The shoulder joint centre sits ~5 cm under the acromion; the bar
        # rests on the delts above it, so with a vertical forearm the elbow
        # ends a little in front of and below the shoulder.
        "bottom_bar_above_shoulders_m": 0.07,
        # Bar centre at lockout: over the shoulder joints, arms almost straight.
        "top_bar_forward_of_shoulders_m": 0.0,
        "top_elbow_flexion_deg": 6.0,
        # Bar height at lockout as a fraction of the template's full reach.
        # 23/11 QA sweep (rig vs template; the rig's shoulder ends a little
        # lower than predicted): 0.975+ the hands leave the bar (10-11 mm),
        # 0.94 the elbow stops at 158 deg; 0.955 locks the elbow straight
        # with the hands on the bar.
        "top_reach_fraction": 0.955,
        "lockout_shrug_deg": 10.0,
        # Progress where the bar has cleared the forehead and the body starts
        # to move under it.
        "head_through_from": 0.45,
        "head_through_to": 0.85,
        "wrist_from_palm_centre_m": 0.07,
        # Palm faces forward, square to the forearm, tipped up a few degrees:
        # the bar sits in the heel of the hand over the forearm (straight
        # wrist, powerliftingtechnique.com). 23/11 QA: 15 deg bent the wrist
        # 30 deg at the start of the press, 28 deg 46; 5 deg stays under 21.
        "palm_tilt_deg": 5.0,
        # Elbow pole from the shoulder: out to the side and a little forward
        # (elbows slightly in front of the bar at the bottom, 4LBVP2Oe7fg 6 s).
        "elbow_pole_out": 0.75,
        "elbow_pole_forward": 0.55,
        "elbow_pole_down": 0.25,
    }

    def __init__(self, technique: dict, skeleton: dict):
        super().__init__(technique, skeleton)
        t, s = self.t, self.s
        self.reach = math.sqrt(s["upper_arm_m"] ** 2 + s["forearm_m"] ** 2
                               + 2 * s["upper_arm_m"] * s["forearm_m"] * math.cos(math.radians(t["top_elbow_flexion_deg"])))
        # Bar's fixed line of travel: set at the bottom pose (in front of the
        # shoulders); the body moves under it towards the top.
        hip, _sh, _g = self._body(0.0)
        sh = self._shoulder_mid(hip, self._lean(0.0), elevation=30.0)
        self.bar_y_bottom = sh[1] - t["bottom_bar_forward_of_shoulders_m"]
        self.bar_z_bottom = sh[2] + t["bottom_bar_above_shoulders_m"]

    # -- body ---------------------------------------------------------------
    def _lean(self, p: float) -> float:
        t = self.t
        return t["trunk_lean_bottom_deg"] + smooth((p - t["head_through_from"]) / (t["head_through_to"] - t["head_through_from"])) * (
            t["trunk_lean_top_deg"] - t["trunk_lean_bottom_deg"])

    def _head(self, p: float) -> float:
        t = self.t
        a, b = t["head_through_from"], t["head_through_to"]
        if p < a:
            return t["head_extension_bottom_deg"] + smooth(p / a) * (t["head_extension_pass_deg"] - t["head_extension_bottom_deg"])
        return t["head_extension_pass_deg"] + smooth((p - a) / (b - a)) * (t["head_extension_top_deg"] - t["head_extension_pass_deg"])

    def _body(self, p: float):
        lean = self._lean(p)
        hip, hips, knees, ankles, alpha = self.legs(lean, self.t["knee_flexion_deg"])
        return hip, (hips, knees, ankles, alpha), lean

    def _girdle(self, elevation: float) -> dict:
        """Scapulohumeral rhythm plus the lockout shrug: past ~140 deg of arm
        elevation the shoulders shrug up towards the ears (stronglifts.com
        "shrug at the top"; zSU7T1zZagQ 20 s), which also lets the arms
        straighten under the bar."""
        g = dict(scapulohumeral(elevation))
        g["clavicle_elevation_deg"] += self.t["lockout_shrug_deg"] * smooth((elevation - 140.0) / 35.0)
        return g

    def _shoulder(self, side: str, hip, lean: float, elevation: float) -> np.ndarray:
        return self.girdle_shoulder(side, hip, lean, elevation_deg=self._girdle(elevation)["clavicle_elevation_deg"])

    def _shoulder_mid(self, hip, lean: float, elevation: float) -> np.ndarray:
        return 0.5 * (self._shoulder("l", hip, lean, elevation) + self._shoulder("r", hip, lean, elevation))

    # -- bar ----------------------------------------------------------------
    def _bar(self, p: float, hip, lean: float) -> np.ndarray:
        """Bar centre: straight up from the shoulders; it moves back only
        as much as the body comes under it (head through), finishing over
        the shoulder joints."""
        t = self.t
        top_sh = self._shoulder_mid(hip, lean, elevation=170.0)
        top_y = top_sh[1] - t["top_bar_forward_of_shoulders_m"]
        # Arm length to the hand centre, minus the sideways run from the
        # shoulder joint out to the grip: the rest is height above the joint.
        L = (self.reach + t["wrist_from_palm_centre_m"]) * t["top_reach_fraction"]
        dx = t["grip_width_between_hand_centres_m"] * 0.5 - abs(float(self._shoulder("l", hip, lean, 170.0)[0]))
        top_z = top_sh[2] + math.sqrt(max(L * L - dx * dx, 1e-6))
        z = self.bar_z_bottom + p * (top_z - self.bar_z_bottom)
        # Blend the horizontal line from the bottom value to over the
        # shoulders while the body moves under the bar.
        w = smooth((p - t["head_through_from"]) / (t["head_through_to"] - t["head_through_from"]))
        y = self.bar_y_bottom + w * (top_y - self.bar_y_bottom)
        return np.array([self.hip_rest[0], y, z])

    def _elbow(self, side: str, sh: np.ndarray, wrist: np.ndarray) -> np.ndarray:
        """Elbow on the circle the two arm bones allow, chosen so the forearm
        is as vertical as it can be (the coaching cue: "forearms vertical
        under the bar", from the side and from the front), never medial to
        the shoulder (the elbows do not cross in front of the chest)."""
        s = self.s
        sign = 1.0 if side == "l" else -1.0
        L1, L2 = s["upper_arm_m"], s["forearm_m"]
        d = min(float(np.linalg.norm(wrist - sh)), L1 + L2 - 1e-6)
        n = unit(wrist - sh)
        a = (d * d + L1 ** 2 - L2 ** 2) / (2 * d)
        h = math.sqrt(max(L1 ** 2 - a * a, 0.0))
        u = unit(np.cross(n, LEFT if abs(n[0]) < 0.9 else FORWARD))
        v = np.cross(n, u)
        # Soft choice (a weighted circular mean, not the single best angle):
        # the elbow moves smoothly from frame to frame.
        ths = np.radians(np.arange(360.0))
        es = sh + n * a + h * (np.cos(ths)[:, None] * u + np.sin(ths)[:, None] * v)
        fs = wrist - es
        fs /= np.linalg.norm(fs, axis=1, keepdims=True)
        # Vertical forearm; a tilt seen from the front costs more than one
        # seen from the side: the bar rolls in the hand to follow a sagittal
        # tilt, but a frontal one bends the wrist sideways.
        sc = fs[:, 2] - 1.5 * np.abs(fs[:, 0])
        sc -= 4.0 * np.maximum(0.0, (sh[0] - es[:, 0]) * sign + 0.02)   # medial of the shoulder
        sc -= 4.0 * np.maximum(0.0, (es[:, 1] - sh[1]) - 0.02)           # behind the shoulder
        # Soft choice (a weighted circular mean, not the single best angle):
        # the elbow moves smoothly from frame to frame.
        w = np.exp((sc - sc.max()) / 0.03)
        th = math.atan2(float(np.sum(w * np.sin(ths))), float(np.sum(w * np.cos(ths))))
        return sh + n * a + h * (math.cos(th) * u + math.sin(th) * v)

    def _arm(self, side: str, hip, lean: float, bar: np.ndarray) -> dict:
        t, s = self.t, self.s
        sign = 1.0 if side == "l" else -1.0
        grip = bar + LEFT * sign * t["grip_width_between_hand_centres_m"] * 0.5
        elevation = 60.0
        for _ in range(4):
            sh = self._shoulder(side, hip, lean, elevation)
            pole = unit(LEFT * sign * t["elbow_pole_out"] + FORWARD * t["elbow_pole_forward"] - UP * t["elbow_pole_down"])
            wrist = grip - UP * t["wrist_from_palm_centre_m"]
            for _ in range(3):
                elbow = self._elbow(side, sh, wrist)
                fore = unit(grip - elbow)
                wrist = grip - fore * t["wrist_from_palm_centre_m"]
            upper = unit(elbow - sh)
            elevation = math.degrees(math.acos(float(np.clip(np.dot(upper, -UP), -1, 1))))
        return {"shoulder": sh, "elbow": elbow, "wrist": wrist, "grip": grip, "pole": pole, "elevation": elevation,
                "girdle": self._girdle(elevation), "fore": fore,
                "elbow_flexion": math.degrees(math.acos(float(np.clip(np.dot(upper, fore), -1, 1))))}

    def _raw_roll(self, p: float) -> float:
        hip, _legs, lean = self._body(p)
        bar = self._bar(p, hip, lean)
        f = sum(self._arm(sd, hip, lean, bar)["fore"] for sd in ("l", "r")) / 2
        return math.degrees(math.atan2(-float(f[1]), float(f[2])))   # + when the forearm leans forward (-Y)

    def _roll(self, p: float) -> float:
        """Bar roll, averaged over a short window of the rep so the hands
        turn smoothly (near lockout the forearm swings upright quickly)."""
        ps = [min(1.0, max(0.0, p + d)) for d in (-0.08, -0.04, 0.0, 0.04, 0.08)]
        return sum(self._raw_roll(q) for q in ps) / len(ps)

    def frame(self, progress: float) -> dict:
        t = self.t
        p = progress
        hip, (hips, knees, ankles, alpha), lean = self._body(p)
        bar = self._bar(p, hip, lean)
        out = {"body": {"hip_centre": hip, "trunk_lean_deg": lean, "pelvis_share": t["pelvis_share_of_lean"],
                        "head_extension_deg": self._head(p)},
               "poles": {}, "implements": {}, "girdle": {},
               "metrics": {"trunk_lean_deg": lean, "head_extension_deg": self._head(p), "bar_y": float(bar[1]),
                           "bar_z": float(bar[2]), "shank_tilt_deg": alpha}}
        arms = {side: self._arm(side, hip, lean, bar) for side in ("l", "r")}
        # The bar is round: it turns about its own axis in the hands so the
        # palm stays square to the forearm (straight wrists, the bar in the
        # heel of the hand). Roll = the forearms' mean tilt in the sagittal plane.
        roll = self._roll(p)
        rot = rotation(LEFT, roll) @ np.column_stack([LEFT, -FORWARD, UP])  # handle along X
        out["implements"]["barbell"] = matrix(rot, bar)
        out["metrics"]["bar_roll_deg"] = roll
        for side, sign in (("l", 1.0), ("r", -1.0)):
            a = arms[side]
            # Pole: the elbow's offset from the arm's mid-line plus a fixed
            # lean out and forward, so it stays continuous as the arm
            # straightens (the elbow circle shrinks to a point at lockout).
            mid = 0.5 * (a["shoulder"] + a["wrist"])
            out["poles"][f"ctl_elbow_{side}"] = a["elbow"] + (a["elbow"] - mid) + a["pole"] * 0.3
            out["girdle"][side] = {"clavicle_elevation_deg": a["girdle"]["clavicle_elevation_deg"],
                                   "scapula_upward_deg": a["girdle"]["scapula_upward_deg"],
                                   "upward_rotation_deg": a["girdle"]["upward_rotation_deg"]}
            out["metrics"][f"arm_elevation_{side}_deg"] = a["elevation"]
            out["metrics"][f"elbow_flexion_{side}_deg"] = a["elbow_flexion"]
            fore = a["fore"]
            out["metrics"][f"forearm_from_vertical_{side}_deg"] = math.degrees(math.acos(float(np.clip(fore[2], -1, 1))))
            toe = math.radians(sign * t["toe_out_deg"])
            fwd = np.array([abs(math.sin(toe)) * sign, -math.cos(toe), 0.0])
            out["poles"][f"ctl_knee_{side}"] = knees[side] + fwd * 0.6
        return out

    def static(self) -> dict:
        t = self.t
        out = super().static()
        half = t["grip_width_between_hand_centres_m"] * 0.5
        rot = np.column_stack([LEFT, -FORWARD, UP])
        to_bar = np.linalg.inv(rot)
        # Palm forward (vertical forearm, straight wrist) tilted up a little:
        # the bar sits in the heel of the hand.
        palm = rotation(LEFT, t["palm_tilt_deg"]) @ FORWARD
        out["grips"] = {"barbell": {side: {"point": [sign * half, 0, 0], "axis": [sign, 0, 0],
                                           "palm": (to_bar @ palm).tolist()}
                                    for side, sign in (("l", 1.0), ("r", -1.0))}}
        return out
