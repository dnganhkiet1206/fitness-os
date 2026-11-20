"""Unit tests for the per-frame deformation reporting in
evs/validation/checks.py (skin_deformation / mesh_self_intersection).

No Blender.

    cd artifacts/exercise-visual-system && python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from evs.validation import checks  # noqa: E402

FACTS = {"bones": {"pelvis": {"parent": None, "length_m": 0.1}}, "vertices": 10}
PROFILE = {"max_p999_edge_stretch": 2.6, "max_volume_change": 0.08, "max_new_self_intersections": 60}


def _samples(deformation: dict) -> dict:
    return {"constants": {"deform_bones": ["pelvis"], "parents": {"pelvis": None},
                          "rest_bone_length_m": {"pelvis": 0.1}, "body_vertices": 10},
            "bone_length_error_m": [0.0], "deformation": deformation}


def _by_id(records: list[dict], cid: str) -> dict:
    return next(r for r in records if r["id"] == cid)


class DeformationReportTests(unittest.TestCase):
    def test_skin_deformation_detail_lists_per_frame_values(self):
        samples = _samples({
            "0": {"p999_edge_stretch": 1.02, "max_edge_stretch": 1.31, "volume_change": 0.0012, "new_self_intersections": 3},
            "120": {"p999_edge_stretch": 2.829, "max_edge_stretch": 5.12, "volume_change": 0.0501, "new_self_intersections": 403},
        })
        rec = _by_id(checks.character_checks(samples, FACTS, PROFILE, None), "skin_deformation")
        self.assertEqual(rec["status"], "FAIL")
        self.assertIn("f0 p999 1.020 max 1.310 vol +0.0012", rec["detail"])
        self.assertIn("f120 p999 2.829 max 5.120 vol +0.0501", rec["detail"])

    def test_skin_deformation_passes_within_limits(self):
        samples = _samples({
            "0": {"p999_edge_stretch": 1.02, "max_edge_stretch": 1.31, "volume_change": 0.0012, "new_self_intersections": 3},
        })
        rec = _by_id(checks.character_checks(samples, FACTS, PROFILE, None), "skin_deformation")
        self.assertEqual(rec["status"], "PASS")

    def test_self_intersection_detail_lists_per_frame_counts(self):
        samples = _samples({
            "0": {"p999_edge_stretch": 1.02, "max_edge_stretch": 1.31, "volume_change": 0.0012, "new_self_intersections": 3},
            "120": {"p999_edge_stretch": 2.829, "max_edge_stretch": 5.12, "volume_change": 0.0501, "new_self_intersections": 403},
        })
        rec = _by_id(checks.character_checks(samples, FACTS, PROFILE, None), "mesh_self_intersection")
        self.assertEqual(rec["status"], "REQUIRES_MANUAL_REVIEW")
        self.assertIn("f0 3; f120 403", rec["detail"])

    def test_deformation_not_tested_without_samples(self):
        rec = _by_id(checks.character_checks(_samples({}), FACTS, PROFILE, None), "skin_deformation")
        self.assertEqual(rec["status"], "NOT_TESTED")


if __name__ == "__main__":
    unittest.main()
