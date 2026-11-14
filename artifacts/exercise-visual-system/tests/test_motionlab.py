"""Unit tests for Motion Lab (motionlab/, evs/motion_qa.py). No Blender."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from evs import motion_qa  # noqa: E402
from motionlab import FAMILIES, families, timing  # noqa: E402,F401
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


if __name__ == "__main__":
    unittest.main()
