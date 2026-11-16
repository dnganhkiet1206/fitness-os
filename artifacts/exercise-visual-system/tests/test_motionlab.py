"""Unit tests for Motion Lab (motionlab/, evs/motion_qa.py). No Blender."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from evs import motion_qa, muscle_sculpt  # noqa: E402
from motionlab import FAMILIES, families, tempo, timing  # noqa: E402,F401
from motionlab.primitives import arm_directions, rotation, two_bone_knee  # noqa: E402

SKELETON = {
    "shoulder_l": np.array([0.19, 0.0, 1.45]), "shoulder_r": np.array([-0.19, 0.0, 1.45]),
    "ankle_l": np.array([0.1, 0.02, 0.08]), "ankle_r": np.array([-0.1, 0.02, 0.08]),
    "upper_arm_m": 0.27, "forearm_m": 0.26,
}


class TimingTests(unittest.TestCase):
    def test_min_jerk_ends_and_symmetry(self):
        self.assertEqual(timing.min_jerk(0.0), 0.0)
        self.assertEqual(timing.min_jerk(1.0), 1.0)
        self.assertAlmostEqual(timing.min_jerk(0.5), 0.5)
        # zero slope at both ends
        self.assertLess(timing.min_jerk(0.01), 1e-4)

    def test_build_curl_timeline(self):
        ph = timing.build({"start_at": 0.0, "start_hold": 0.5, "concentric": 1.5, "top_hold": 0.3, "eccentric": 2.0,
                           "bottom_hold": 0.4, "reps": 2, "end_hold": 0.5})
        ids = [p.id for p in ph]
        self.assertEqual(ids[:5], ["start_position", "concentric", "top_hold", "eccentric", "bottom_hold"])
        self.assertEqual(ids[-1], "finish")
        self.assertAlmostEqual(timing.duration(ph), 0.5 + 2 * (1.5 + 0.3 + 2.0) + 0.4 + 0.5)
        self.assertAlmostEqual(timing.progress_at(ph, 0.5 + 1.5), 1.0)
        self.assertAlmostEqual(timing.progress_at(ph, 0.0), 0.0)

    def test_press_starts_at_top(self):
        ph = timing.build({"start_at": 1.0, "start_hold": 0.5, "eccentric": 2.0, "concentric": 2.0, "reps": 1})
        self.assertEqual(ph[1].id, "eccentric")
        self.assertAlmostEqual(timing.progress_at(ph, 0.2), 1.0)
        self.assertAlmostEqual(timing.progress_at(ph, 2.5), 0.0)


class PrimitiveTests(unittest.TestCase):
    def test_rotation_is_orthonormal(self):
        r = rotation([0.3, 0.5, 0.8], 37)
        self.assertTrue(np.allclose(r @ r.T, np.eye(3)))
        self.assertAlmostEqual(np.linalg.det(r), 1.0)

    def test_arm_directions(self):
        up, fo = arm_directions("l", 0, 0, 0)
        self.assertTrue(np.allclose(up, [0, 0, -1]) and np.allclose(fo, [0, 0, -1]))
        up, fo = arm_directions("l", 30, 0, 0)
        self.assertLess(up[1], 0)  # flexion swings forward (-Y)
        up, fo = arm_directions("l", 0, 20, 0)
        self.assertGreater(up[0], 0)  # left arm abducts towards +X
        _, fo = arm_directions("r", 0, 6, 138)
        self.assertGreater(fo[2], 0.7)  # forearm up at the top of a curl
        self.assertLess(fo[1], 0)       # and forward, not behind

    def test_two_bone_knee_lengths(self):
        k = two_bone_knee([0, 0, 0.9], [0, 0, 0.1], 0.45, 0.42)
        self.assertAlmostEqual(np.linalg.norm(k - [0, 0, 0.9]), 0.45, places=6)
        self.assertLess(k[1], 0)  # bends forward


class CurlTemplateTests(unittest.TestCase):
    def test_curl_frames(self):
        tpl = FAMILIES["curl"]({}, SKELETON)
        bottom, top = tpl.frame(0.0), tpl.frame(1.0)
        for side in ("l", "r"):
            wb, wt = bottom["wrists"][f"dumbbell_{side}"], top["wrists"][f"dumbbell_{side}"]
            self.assertGreater(wt[2], wb[2] + 0.3)  # the weight rises
            m = top["implements"][f"dumbbell_{side}"]
            self.assertTrue(np.allclose(m[:3, :3] @ m[:3, :3].T, np.eye(3), atol=1e-9))
            self.assertAlmostEqual(np.linalg.det(m[:3, :3]), 1.0)
        # Mirror symmetry
        self.assertTrue(np.allclose(top["wrists"]["dumbbell_l"] * [-1, 1, 1], top["wrists"]["dumbbell_r"]))


class MotionQaTests(unittest.TestCase):
    def test_contact_reports_frame(self):
        r = motion_qa.contact({"SOCKET_hand_l": [0.0, 0.001, 0.02, 0.0]}, 0.004)
        self.assertEqual(r["status"], "FAIL")
        self.assertEqual(r["where"], {"implement": "SOCKET_hand_l", "frame": 2})

    def test_planted_and_symmetry(self):
        p = np.zeros((5, 3)); p[3, 0] = 0.02
        r = motion_qa.planted({"foot_l": p, "foot_r": np.zeros((5, 3))}, 0.005, 0.005)
        self.assertEqual(r["status"], "FAIL")
        self.assertEqual(r["where"]["frame"], 3)
        j = {"wrist_l": np.array([[0.2, 0, 1]] * 3), "wrist_r": np.array([[-0.2, 0, 1]] * 3)}
        self.assertEqual(motion_qa.symmetry(j, 0.003)["status"], "PASS")

    def test_rotation_steps(self):
        q = np.array([[1, 0, 0, 0], [np.cos(np.radians(10)), np.sin(np.radians(10)), 0, 0]])
        r = motion_qa.rotation_steps({"b": q}, 12.0)
        self.assertAlmostEqual(r["measured"], 20.0, places=2)
        self.assertEqual(r["status"], "FAIL")


class PostureTests(unittest.TestCase):
    PROF = {"max_wrist_bend_deg": 25, "max_elbow_flexion_deg": 145, "max_elbow_medial_m": 0.02, "max_neck_flexion_deg": 30}

    def test_squat_arm_from_14_11_fails(self):
        # The arm Kiệt flagged: elbow folded in behind the shoulder, 150+ deg, wrist bent.
        j = {"shoulder_l": np.array([[0.2, 0, 1.4]]), "elbow_l": np.array([[0.13, 0.1, 1.17]]),
             "wrist_l": np.array([[0.3, 0.07, 1.38]]), "knuckle_l": np.array([[0.3, 0.0, 1.46]])}
        r = {x["id"]: x for x in motion_qa.posture(j, self.PROF)}
        self.assertEqual(r["wrist_bend"]["status"], "FAIL")
        self.assertEqual(r["elbow_flexion_anatomical"]["status"], "FAIL")
        self.assertEqual(r["elbow_inside_shoulder"]["status"], "FAIL")

    def test_head_drop_sign(self):
        j = {"pelvis": np.array([[0, 0, 1.0]] * 2), "neck": np.array([[0, 0, 1.5]] * 2),
             "head_top": np.array([[0, -0.15, 1.65], [0, 0.0, 1.72]])}
        r = motion_qa.posture(j, self.PROF)[-1]
        self.assertEqual(r["status"], "FAIL")   # chin to chest
        self.assertEqual(r["where"]["frame"], 0)

    def test_penetration_reports_implement_and_frame(self):
        r = motion_qa.penetration({"Barbell": [0.0, 0.03, 0.001]}, 0.004)
        self.assertEqual((r["status"], r["where"]["implement"], r["where"]["frame"]), ("FAIL", "Barbell", 1))


class SquatArmTests(unittest.TestCase):
    # Character 003 (16/11): shoulders, clavicle heads and the back profile
    # with the trapezius volume (the bar sits ~0.11 m behind the shoulders).
    SK = {"shoulder_l": np.array([0.215, -0.018, 1.43]), "shoulder_r": np.array([-0.215, -0.018, 1.43]),
          "clavicle_l_head": np.array([0.023, -0.024, 1.458]), "clavicle_r_head": np.array([-0.023, -0.024, 1.458]),
          "hip_l": np.array([0.1, 0.0, 0.95]), "hip_r": np.array([-0.1, 0, 0.95]),
          "ankle_l": np.array([0.1, 0.02, 0.08]), "ankle_r": np.array([-0.1, 0.02, 0.08]),
          "upper_arm_m": 0.266, "forearm_m": 0.275, "thigh_m": 0.44, "shin_m": 0.42,
          "back_profile": [[1.42, 0.114], [1.45, 0.109], [1.48, 0.091], [1.51, 0.082]]}

    def test_elbow_down_outside_wrist_straight(self):
        tpl = FAMILIES["squat"]({}, self.SK)
        arm = tpl.arms["l"]
        self.assertLess(arm["elbow"][2], self.SK["shoulder_l"][2] - 0.15)   # elbow below the shoulder
        # Not folded in: same 2 cm tolerance as the QA gate elbow_inside_shoulder
        # (elbows straight down under a retracted shoulder sit ~4 mm inside).
        self.assertGreater(arm["elbow"][0], tpl.girdle_shoulder("l")[0] - 0.02)
        # The planned angle runs ~8 deg above the posed rig (0.68 m grip:
        # plan 153, validate_motion elbow_flexion_anatomical 145.1); that QA
        # gate on the posed rig is the anatomical check, this one catches a
        # grip that closes the elbow far past it.
        self.assertLess(arm["elbow_flexion_deg"], 150)
        fore = arm["grip"] - arm["elbow"]
        self.assertAlmostEqual(float(np.dot(arm["palm"], fore / np.linalg.norm(fore))), 0.0, places=6)

    def test_bar_rests_on_skin(self):
        tpl = FAMILIES["squat"]({}, self.SK)
        r = tpl.t["bar_shaft_radius_m"] - tpl.t["bar_into_soft_tissue_m"]
        self.assertAlmostEqual(tpl.bar_rest[1], 0.091 + r, places=6)  # profile at bar height 1.48


class MuscleSculptTests(unittest.TestCase):
    def test_rectus_abdominis_rows_and_midline(self):
        groups = ["rectus_abdominis"]
        pts = np.array([[x, -0.1, z] for x in (-0.03, 0.03) for z in np.linspace(0.95, 1.25, 31)])
        cfg = {"rectus_abdominis": [{"type": "level", "fractions": [0.38, 0.6, 0.8]}]}
        lab = muscle_sculpt.part_labels(np.zeros(len(pts), int), groups, pts, {}, cfg)
        self.assertEqual(len(np.unique(lab)), 8)  # 4 rows x 2 sides

    def test_relief_grooves_and_skin_fade(self):
        prof = {"skin": {"width_m": 0.03}, "groups": {"width_m": 0.01, "depth": 0.9},
                "midline": {"width_m": 0.01, "depth": 0.7}, "heads": {"width_m": 0.01, "depth": 0.3}}
        far = np.array([1.0])
        d = {"skin": far, "groups": np.array([0.0]), "midline": far, "heads": far}
        self.assertAlmostEqual(float(muscle_sculpt.relief(d, np.array([True]), prof)[0]), 0.1, places=6)
        d = {"skin": far, "groups": far, "midline": far, "heads": np.array([0.0])}
        self.assertAlmostEqual(float(muscle_sculpt.relief(d, np.array([True]), prof)[0]), 0.7, places=6)
        self.assertEqual(float(muscle_sculpt.relief(d, np.array([False]), prof)[0]), 0.0)

    def test_boundary_kinds(self):
        a = np.array([1_000_000, 1_000_000, 1_000_000, 0])
        b = np.array([2_000_000, 1_000_001, 1_000_002, 1_000_000])
        self.assertEqual(muscle_sculpt.boundary_kind(a, b).tolist(), [0, 1, 2, 3])


CURL_TEMPO = {"start_at": 0.0, "start_hold": 0.6, "concentric": 1.6, "top_hold": 0.4, "eccentric": 2.2,
              "bottom_hold": 0.4, "reps": 2, "end_hold": 0.4}
SQUAT_TEMPO = {"start_at": 1.0, "start_hold": 0.6, "eccentric": 2.0, "bottom_hold": 0.3, "concentric": 1.6,
               "top_hold": 0.5, "reps": 2, "end_hold": 0.4}


class TempoTimelineTests(unittest.TestCase):
    def tl(self, t, cues=None):
        return tempo.timeline(timing.build(t), t, "x", 30, cues)

    def test_reps_cover_the_moving_phases_in_order(self):
        tl = self.tl(CURL_TEMPO)
        self.assertEqual(tl["schema"], "ascnd.tempo/1")
        self.assertEqual(len(tl["reps"]), 2)
        self.assertEqual([p["kind"] for p in tl["reps"][0]["phases"]], ["concentric", "top_hold", "eccentric", "bottom_hold"])
        self.assertEqual([p["kind"] for p in tl["reps"][1]["phases"]], ["concentric", "top_hold", "eccentric"])
        self.assertEqual(tl["reps"][0]["start_ms"], 600)
        self.assertEqual(tl["reps"][1]["start_ms"], tl["reps"][0]["end_ms"])
        self.assertEqual(tl["duration_ms"], int(round(timing.duration(timing.build(CURL_TEMPO)) * 1000)))

    def test_squat_starts_at_the_top_with_the_lowering(self):
        tl = self.tl(SQUAT_TEMPO)
        self.assertEqual(tl["starts_at"], "top")
        first = tl["reps"][0]["phases"][0]
        self.assertEqual((first["kind"], first["from"], first["to"], first["breath"]), ("eccentric", 1.0, 0.0, "inhale"))
        self.assertEqual(tl["notation"], "2-0.3-1.6-0.5")

    def test_marks_turn_then_complete_per_rep(self):
        tl = self.tl(CURL_TEMPO)
        self.assertEqual([(m["type"], m["rep"]) for m in tl["marks"]], [("turn", 1), ("rep_complete", 1), ("turn", 2), ("rep_complete", 2)])
        conc = tl["reps"][0]["phases"][0]
        self.assertEqual(tl["marks"][0]["at_ms"], conc["end_ms"])
        self.assertEqual(conc["breath"], "exhale")

    def test_cues_land_at_phase_starts(self):
        tl = self.tl(CURL_TEMPO, {"start_position": ["Stand tall"], "concentric": ["Elbows by the sides"]})
        self.assertEqual(tl["cues"][0], {"at_ms": 0, "rep": 0, "phase": "start_position", "text": "Stand tall"})
        self.assertEqual([c["at_ms"] for c in tl["cues"][1:]], [p["start_ms"] for r in tl["reps"] for p in r["phases"] if p["kind"] == "concentric"])

    def test_progress_curve_matches_the_generator(self):
        phases = timing.build(CURL_TEMPO)
        tl = tempo.timeline(phases, CURL_TEMPO, "x", 30)
        n = int(timing.duration(phases) * 30) + 1
        curve = tempo.progress_curve(tl, n)
        ref = [timing.progress_at(phases, f / 30) for f in range(n)]
        self.assertLess(max(abs(a - b) for a, b in zip(curve, ref)), 0.01)


class ScapulohumeralTests(unittest.TestCase):
    def test_rhythm(self):
        from motionlab.primitives import scapulohumeral
        self.assertEqual(scapulohumeral(20)["upward_rotation_deg"], 0.0)
        top = scapulohumeral(180)
        self.assertAlmostEqual(top["upward_rotation_deg"], 60.0)
        self.assertAlmostEqual(top["clavicle_elevation_deg"] + top["scapula_upward_deg"], 60.0)
        self.assertLessEqual(top["clavicle_elevation_deg"], 15.0)


class ImplementClashTests(unittest.TestCase):
    def test_overlap_fails_with_frame(self):
        r = motion_qa.implement_clash({"Dumbbell_l|Dumbbell_r": [0, 0, 12, 3]}, [0, 2, 4, 6])
        self.assertEqual(r["status"], motion_qa.FAIL)
        self.assertEqual(r["where"], {"pair": "Dumbbell_l|Dumbbell_r", "frame": 4})
        self.assertEqual(motion_qa.implement_clash({"a|b": [0, 0]}, [0, 2])["status"], motion_qa.PASS)


class PenetrationFrameTests(unittest.TestCase):
    def test_reports_the_animation_frame_not_the_sample_index(self):
        r = motion_qa.penetration({"Dumbbell_r": [0.0, 0.006, 0.001]}, 0.004, [0, 57, 115])
        self.assertEqual(r["status"], motion_qa.FAIL)
        self.assertEqual(r["where"]["frame"], 57)


class TempoSyncTests(unittest.TestCase):
    def setUp(self):
        phases = timing.build(CURL_TEMPO)
        self.tl = tempo.timeline(phases, CURL_TEMPO, "x", 30)
        self.n = int(timing.duration(phases) * 30) + 1
        self.p = np.array(tempo.progress_curve(self.tl, self.n))

    def joints(self, p):
        # wrist on an arc (non-linear in progress), elbow still
        ang = np.radians(12 + 126 * p)
        wrist = np.stack([np.full_like(p, 0.2), -0.26 * np.sin(ang), 1.1 - 0.26 * np.cos(ang)], axis=1)
        return {"hand_l": wrist, "lowerarm_l": np.tile([0.2, 0.0, 1.1], (len(p), 1))}

    def test_in_sync_passes(self):
        r = motion_qa.tempo_sync(self.joints(self.p), self.p)
        self.assertEqual(r["status"], motion_qa.PASS, r)
        self.assertEqual(r["measured"]["shift_frames"], 0)

    def test_three_frames_late_fails(self):
        late = np.concatenate([np.full(3, self.p[0]), self.p[:-3]])
        r = motion_qa.tempo_sync(self.joints(late), self.p)
        self.assertEqual(r["status"], motion_qa.FAIL)
        self.assertEqual(r["measured"]["shift_frames"], 3)

    def test_inverted_signal_is_fine(self):
        r = motion_qa.tempo_sync({"pelvis": np.stack([np.zeros(self.n), np.zeros(self.n), 1.0 - 0.4 * self.p], axis=1)}, self.p)
        self.assertEqual(r["status"], motion_qa.PASS, r)


if __name__ == "__main__":
    unittest.main()
