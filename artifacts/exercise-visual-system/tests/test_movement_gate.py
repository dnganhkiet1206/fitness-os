"""Unit tests for the anatomy gate (evs/movement_gate.py). No Blender.

    cd artifacts/exercise-visual-system && python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from evs import movement_gate  # noqa: E402

PATTERNS = movement_gate.load_patterns(ROOT / "config" / "movement_patterns.json")


def standing(n: int = 20) -> dict:
    """A static standing figure, arms by the sides (Z up, facing -Y)."""
    pts = {
        "pelvis": [0, 0, 1.0], "neck": [0, 0, 1.5], "head": [0, 0, 1.65],
        "shoulder_l": [0.2, 0, 1.45], "shoulder_r": [-0.2, 0, 1.45],
        "elbow_l": [0.22, 0, 1.17], "elbow_r": [-0.22, 0, 1.17],
        "wrist_l": [0.23, 0, 0.9], "wrist_r": [-0.23, 0, 0.9],
        "hip_l": [0.1, 0, 0.95], "hip_r": [-0.1, 0, 0.95],
        "knee_l": [0.1, 0, 0.5], "knee_r": [-0.1, 0, 0.5],
        "ankle_l": [0.1, 0, 0.08], "ankle_r": [-0.1, 0, 0.08],
    }
    return {k: np.tile(np.array(v, dtype=float), (n, 1)) for k, v in pts.items()}


class MovementGateTests(unittest.TestCase):
    def test_every_pattern_bounds_known_metrics(self):
        names = set(movement_gate.metrics(standing()).keys())
        for pat, spec in PATTERNS["patterns"].items():
            for metric in spec["bounds"]:
                self.assertIn(metric, names, f"{pat} bounds unknown metric {metric}")

    def test_standing_metrics(self):
        m = movement_gate.metrics(standing())
        self.assertGreater(m["knee_min_deg"], 175)
        self.assertLess(m["torso_lean_max_deg"], 1)
        self.assertLess(m["arm_elev_max_deg"], 10)
        self.assertAlmostEqual(m["hip_drop_m"], 0.0)

    def test_squat_passes_and_standing_fails_squat(self):
        j = standing(30)
        t = np.linspace(0, np.pi, 30)
        drop = 0.4 * np.sin(t)
        for k in j:
            if k not in ("ankle_l", "ankle_r"):
                j[k] = j[k].copy()
                j[k][:, 2] -= drop if not k.startswith("knee") else 0.5 * drop
        # Knees forward as the hips drop so the knee bends.
        for s in "lr":
            j[f"knee_{s}"][:, 1] -= 0.35 * np.sin(t)
        res = movement_gate.evaluate(j, PATTERNS, {"pattern": "squat"})
        self.assertTrue(all(r["pass"] for r in res), res)
        res_static = movement_gate.evaluate(standing(), PATTERNS, {"pattern": "squat"})
        self.assertFalse(all(r["pass"] for r in res_static))

    def test_overrides_and_unknown_pattern(self):
        rules = movement_gate.rules_for(PATTERNS, {"pattern": "squat", "qa": {"knee_min_deg": [None, 80]}})
        self.assertEqual(rules["knee_min_deg"], [None, 80])
        with self.assertRaises(KeyError):
            movement_gate.rules_for(PATTERNS, {"pattern": "moonwalk"})

    def test_humerus_depth_sign(self):
        # Supine figure: chest faces +Z. Elbow below the shoulder = behind the chest plane.
        n = 5
        j = {k: np.zeros((n, 3)) for k in movement_gate.REQUIRED}
        j["pelvis"][:] = [0, -0.5, 0.5]
        j["neck"][:] = [0, 0.0, 0.5]
        j["head"][:] = [0, 0.15, 0.5]
        j["shoulder_l"][:] = [0.2, 0, 0.5]
        j["shoulder_r"][:] = [-0.2, 0, 0.5]
        for s, x in (("l", 0.4), ("r", -0.4)):
            j[f"elbow_{s}"][:] = [x, -0.05, 0.4]
            j[f"wrist_{s}"][:] = [x, -0.05, 0.7]
        for s, x in (("l", 0.1), ("r", -0.1)):
            j[f"hip_{s}"][:] = [x, -0.5, 0.5]
            j[f"knee_{s}"][:] = [x, -0.9, 0.5]
            j[f"ankle_{s}"][:] = [x, -1.0, 0.0]
        m = movement_gate.metrics(j)
        self.assertLess(m["humerus_depth_min_deg"], -20)


if __name__ == "__main__":
    unittest.main()
