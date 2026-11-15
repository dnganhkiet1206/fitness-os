"""Family: hip hinge with the weights hanging from straight arms
(stiff-legged / Romanian deadlift with dumbbells; the barbell versions are
this template with one implement held in both hands).

Technique facts used (sources in the exercise spec's motion_provenance):
* the movement is hip flexion with a neutral spine: the pelvis tilts
  forward and the back stays flat, the lumbar spine flexes little (McGill,
  Low Back Disorders; NSCA Essentials 4th ed.);
* knees soft at the top (~5 deg) and slightly bent at the bottom: about
  15-20 deg for the stiff-legged version, 20-30 deg for the Romanian (ExRx; Lee et al. 2018, J Exerc
  Rehabil 14(3) for RDL kinematics);
* bottom: trunk about 70-90 deg forward with the weights near mid-shin,
  as far as the hamstrings allow with a flat back;
* balance: the weights travel close to the legs and the body's centre of
  mass stays over the middle of the foot, so the hips move BACK as the
  trunk goes forward. The hip position is NOT a parameter: each frame the
  shank tilt is solved so the whole-body centre of mass (segment masses and
  centres from Winter 2009, Biomechanics and Motor Control of Human
  Movement, table 4.1) plus the weights sits over the mid-foot;
* arms straight and vertical (they hang), hands just in front of the legs,
  pronated grip (palms face the thighs);
* neck neutral: the head stays in line with the trunk, gaze down-forward.

Progress 1 = standing (lockout), 0 = bottom (the repetition starts standing,
lowering first).
"""

from __future__ import annotations

import math

import numpy as np

from .. import register
from ..primitives import FORWARD, LEFT, UP, matrix, unit

# Winter 2009 table 4.1: fraction of body mass, centre from the proximal end
# as a fraction of the segment length.
HAT = (0.678, 0.626)   # head-arms-trunk, from the hip towards the shoulder
THIGH = (0.100, 0.433)
SHANK = (0.0465, 0.433)
FOOT = 0.0145


def balance_shank_tilt(lean_deg: float, knee_deg: float, shin: float, thigh: float, trunk: float,
                       ankle_y: float, midfoot_y: float, load_frac: float, load_y_of, target_y: float | None = None) -> float:
    """Shank tilt from vertical (deg, + = knee forward of the ankle) that puts
    the whole-body centre of mass over the mid-foot. ``load_y_of(hip, lean)``
    gives the weights' y for a hip position (they hang under the shoulders).
    Bisection: moving the knee back moves everything above it back."""
    def com_y(alpha: float) -> float:
        a, b = math.radians(alpha), math.radians(knee_deg - alpha)
        knee = np.array([ankle_y - math.sin(a) * shin, math.cos(a) * shin])
        hip = knee + np.array([math.sin(b) * thigh, math.cos(b) * thigh])
        lean = math.radians(lean_deg)
        hat = hip[0] - math.sin(lean) * trunk * HAT[1]
        y = (2 * FOOT * (midfoot_y) + 2 * SHANK[0] * (ankle_y + (knee[0] - ankle_y) * (1 - SHANK[1]))
             + 2 * THIGH[0] * (knee[0] + (hip[0] - knee[0]) * (1 - THIGH[1])) + HAT[0] * hat)
        y += load_frac * load_y_of(hip, lean_deg)
        return y / (1.0 + load_frac)

    if target_y is not None:
        midfoot_y = target_y
    lo, hi = -40.0, 40.0
    # com_y decreases (moves forward, -Y) as alpha grows: knee forward.
    for _ in range(50):
        mid = 0.5 * (lo + hi)
        if com_y(mid) > midfoot_y:   # centre of mass behind the mid-foot -> knee forward
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


@register("hinge")
class HingeTemplate:
    defaults = {
        "trunk_lean_bottom_deg": 80.0,
        "trunk_lean_top_deg": 2.0,
        "knee_flexion_top_deg": 6.0,
        "knee_flexion_bottom_deg": 18.0,
        "pelvis_share_of_lean": 0.85,
        "head_extension_share_of_lean": 0.12,
        "stance_half_width_m": 0.13,
        "toe_out_deg": 6.0,
        "midfoot_forward_of_ankle_m": 0.05,
        "grip_half_width_m": 0.19,
        # Gap between the front skin of the leg and the handle axis: the hex
        # head's inscribed radius plus a few millimetres (the weights brush
        # the legs, they do not press into them).
        "handle_clearance_from_skin_m": 0.072,
        # With a pronated grip the handle sits in the palm, i.e. BEHIND the
        # line of the forearm, between the hand and the legs (14/11: the
        # inner head went 3 cm into the thigh when the handle was assumed on
        # the arm line). Half a hand's thickness plus the handle radius.
        "handle_behind_arm_line_m": 0.04,
        "elbow_flexion_deg": 8.0,
        "palm_centre_beyond_wrist_m": 0.075,
    }

    def __init__(self, technique: dict, skeleton: dict):
        self.t = {**self.defaults, **technique}
        self.s = s = skeleton
        self.hip_rest = 0.5 * (np.asarray(s["hip_l"]) + np.asarray(s["hip_r"]))
        self.sh_rest = 0.5 * (np.asarray(s["shoulder_l"]) + np.asarray(s["shoulder_r"]))
        self.trunk = float(np.linalg.norm(self.sh_rest - self.hip_rest))
        a, b = s["upper_arm_m"], s["forearm_m"]
        # Shoulder-to-wrist distance of a nearly straight arm: a fully
        # straight one sits on the IK's singular point and the hand drifts
        # off the handle (14/11: 3 cm at the bottom).
        self.arm = math.sqrt(a * a + b * b + 2 * a * b * math.cos(math.radians(self.t["elbow_flexion_deg"])))
        self.front = s.get("leg_front_profile")

    def _ankles(self) -> dict:
        t, s = self.t, self.s
        return {side: np.array([sign * t["stance_half_width_m"], s[f"ankle_{side}"][1], s[f"ankle_{side}"][2]])
                for side, sign in (("l", 1.0), ("r", -1.0))}

    def _shoulders(self, hip: np.ndarray, lean_deg: float) -> dict:
        """Shoulder joints for a trunk lean, posed the way the generator
        poses it (pipeline/generate_exercise.py pose_body): the pelvis turns
        by lean x pelvis_share about its head, each spine bone by an equal
        part of the rest about its own head, then everything moves so the
        hip centre lands on ``hip``. With the chain heads from the rig the
        prediction is exact; without them, a rigid trunk about the hips (a
        few centimetres off, enough to pull the hands off the handles)."""
        s, t = self.s, self.t
        pts = {side: np.asarray(s[f"shoulder_{side}"], float) for side in ("l", "r")}
        hips_rest = self.hip_rest.copy()
        if "pelvis_head" not in s:
            pivots = [(self.hip_rest, lean_deg)]
        else:
            share = t["pelvis_share_of_lean"]
            spine = [b for b in ("spine_01", "spine_02", "spine_03") if f"{b}_head" in s]
            pivots = [(np.asarray(s["pelvis_head"], float), lean_deg * share)]
            pivots += [(np.asarray(s[f"{b}_head"], float), lean_deg * (1 - share) / len(spine)) for b in spine]
        moved = [p for p, _a in pivots]
        for i, (_p, ang) in enumerate(pivots):
            # Right-handed turn about +X, as pose_body does: a point above
            # the pivot moves to -Y (forward).
            r = math.radians(ang)
            c, si = math.cos(r), math.sin(r)
            piv = moved[i]

            def rot(q: np.ndarray, piv=piv, c=c, si=si) -> np.ndarray:
                d = q - piv
                return piv + np.array([d[0], d[1] * c - d[2] * si, d[1] * si + d[2] * c])
            for side in pts:
                pts[side] = rot(pts[side])
            moved = moved[: i + 1] + [rot(m) for m in moved[i + 1:]]
            if i == 0:
                hips_rest = rot(hips_rest)
        return {side: p + (hip - hips_rest) for side, p in pts.items()}

    def _front_y(self, z: float, hip: np.ndarray, knee: np.ndarray, ankle: np.ndarray) -> float:
        """y of the front skin of the posed leg at height z (the handle must
        stay in front of it)."""
        for seg, (pa, pb) in (("thigh", (hip, knee)), ("shank", (knee, ankle))):
            if min(pa[2], pb[2]) - 1e-6 <= z <= max(pa[2], pb[2]) + 1e-6:
                u = (z - pa[2]) / (pb[2] - pa[2]) if abs(pb[2] - pa[2]) > 1e-6 else 0.0
                line_y = pa[1] + u * (pb[1] - pa[1])
                if self.front and self.front.get(seg):
                    prof = np.asarray(self.front[seg], float)
                    off = float(np.interp(u, prof[:, 0], prof[:, 1]))
                else:
                    off = 0.08 if seg == "thigh" else 0.06
                # The offset was measured perpendicular to the bone; at a
                # horizontal distance it is longer by 1 / cos(tilt).
                d = pb - pa
                tilt = math.atan2(abs(d[1]), abs(d[2]))
                return line_y - off / max(math.cos(tilt), 0.3)
        return ankle[1] - 0.1

    def _hand(self, side: str, shoulder: np.ndarray, hip: np.ndarray, knee: np.ndarray, ankle: np.ndarray) -> np.ndarray:
        """Wrist of a nearly straight hanging arm with the handle just in
        front of the leg's skin: the arm points straight down unless that
        puts the weight into the leg, then it swings forward just enough."""
        t = self.t
        sign = 1.0 if side == "l" else -1.0
        L = self.arm
        reach = L + t["palm_centre_beyond_wrist_m"]  # shoulder -> handle
        dx = sign * t["grip_half_width_m"] - shoulder[0]
        dy = 0.0
        for _ in range(6):
            h = math.sqrt(max(reach * reach - dx * dx - dy * dy, 1e-6))
            z = shoulder[2] - h
            y_max = self._front_y(z, hip, knee, ankle) - t["handle_clearance_from_skin_m"] - t["handle_behind_arm_line_m"]
            dy = min(0.0, y_max - shoulder[1])
        h = math.sqrt(max(reach * reach - dx * dx - dy * dy, 1e-6))
        direction = unit(np.array([dx, dy, -h]))
        return shoulder + direction * L

    def legs(self, lean: float, knee_deg: float) -> tuple[np.ndarray, dict, dict, dict, float]:
        t, s = self.t, self.s
        ankles = self._ankles()
        midfoot_y = 0.5 * (ankles["l"][1] + ankles["r"][1]) - t["midfoot_forward_of_ankle_m"]
        dx = abs(ankles["l"][0] - s["hip_l"][0])
        total = s["shin_m"] + s["thigh_m"]
        shin = math.sqrt(max(s["shin_m"] ** 2 - (dx * s["shin_m"] / total) ** 2, 1e-6))
        thigh = math.sqrt(max(s["thigh_m"] ** 2 - (dx * s["thigh_m"] / total) ** 2, 1e-6))
        # The weights (two dumbbells, ~15-20 % of body mass) hang close to
        # the legs near the mid-foot, so they barely move the balance: the
        # body alone is balanced.
        # Target: where the centre of mass is when standing tall at the top
        # (hip over the ankle). The rest pose of the character stands with
        # its centre of mass a little behind the textbook mid-foot point;
        # balancing to that point would tip the whole standing body forward
        # (14/11: shank 11 deg forward at lockout). What matters is that the
        # centre of mass does not move as the trunk goes down.
        ay = float(ankles["l"][1])
        k0 = t["knee_flexion_top_deg"]
        a0, b0 = math.radians(k0 / 2), math.radians(k0 / 2)
        knee0 = np.array([ay - math.sin(a0) * shin, math.cos(a0) * shin])
        hip0 = knee0 + np.array([math.sin(b0) * thigh, math.cos(b0) * thigh])
        lean0 = math.radians(t["trunk_lean_top_deg"])
        target = ((2 * FOOT * midfoot_y + 2 * SHANK[0] * (ay + (knee0[0] - ay) * (1 - SHANK[1]))
                   + 2 * THIGH[0] * (knee0[0] + (hip0[0] - knee0[0]) * (1 - THIGH[1]))
                   + HAT[0] * (hip0[0] - math.sin(lean0) * self.trunk * HAT[1])))
        alpha = balance_shank_tilt(lean, knee_deg, shin, thigh, self.trunk, ay, midfoot_y,
                                   0.0, lambda _hip, _lean: 0.0, target_y=target)
        a, b = math.radians(alpha), math.radians(knee_deg - alpha)
        hips, knees = {}, {}
        for side in ("l", "r"):
            an = ankles[side]
            k = an + np.array([0.0, -math.sin(a), math.cos(a)]) * shin
            knees[side] = k
            hips[side] = k + np.array([0.0, math.sin(b), math.cos(b)]) * thigh
        hip = 0.5 * (hips["l"] + hips["r"])
        hip[0] = self.hip_rest[0]
        return hip, hips, knees, ankles, alpha

    def frame(self, progress: float) -> dict:
        t = self.t
        depth = 1.0 - progress
        lean = t["trunk_lean_top_deg"] + depth * (t["trunk_lean_bottom_deg"] - t["trunk_lean_top_deg"])
        knee = t["knee_flexion_top_deg"] + depth * (t["knee_flexion_bottom_deg"] - t["knee_flexion_top_deg"])
        hip, hips, knees, ankles, alpha = self.legs(lean, knee)
        shoulders = self._shoulders(hip, lean)
        out = {"body": {"hip_centre": hip, "trunk_lean_deg": lean, "pelvis_share": t["pelvis_share_of_lean"],
                        "head_extension_deg": lean * t["head_extension_share_of_lean"]},
               "poles": {}, "implements": {}, "wrists": {},
               "metrics": {"trunk_lean_deg": lean, "knee_flexion_deg": knee, "shank_tilt_deg": alpha,
                           "hip_flexion_deg": lean + knee - alpha}}
        for side, sign in (("l", 1.0), ("r", -1.0)):
            sh = shoulders[side]
            wrist = self._hand(side, sh, hips[side], knees[side], ankles[side])
            arm = unit(wrist - sh)
            # Pronated grip: palm towards the legs (+Y), thumb medial.
            palm = np.array([0.0, 1.0, 0.0])
            palm = unit(palm - arm * float(np.dot(palm, arm)))
            x = -sign * LEFT
            x = unit(x - arm * float(np.dot(x, arm)) - palm * float(np.dot(x, palm)))
            z = np.cross(x, palm)
            centre = wrist + arm * t["palm_centre_beyond_wrist_m"]
            out["implements"][f"dumbbell_{side}"] = matrix(np.column_stack([x, palm, z]), centre)
            out["wrists"][f"dumbbell_{side}"] = wrist
            # Nearly straight arm: pole behind the elbow, out to the side.
            elbow = sh + arm * self.s["upper_arm_m"]
            out["poles"][f"ctl_elbow_{side}"] = elbow + np.array([sign * 0.25, 0.35, 0.0])
            toe = math.radians(sign * t["toe_out_deg"])
            fwd = np.array([abs(math.sin(toe)) * sign, -math.cos(toe), 0.0])
            out["poles"][f"ctl_knee_{side}"] = knees[side] + fwd * 0.6
        return out

    def static(self) -> dict:
        t = self.t
        return {f"ctl_foot_{side}": {"position": self._ankles()[side], "toe_out_deg": sign * t["toe_out_deg"]}
                for side, sign in (("l", 1.0), ("r", -1.0))}
