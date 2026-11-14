"""Unit tests for the golden-measurements comparison (evs/reference_check.py).

No Blender.

    cd artifacts/exercise-visual-system && python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from evs import reference_check  # noqa: E402

SUMMARY = {"reps": 7, "elbow_top_2d_median": 164.9, "elbow_bottom_2d_median": 97.6}
METRICS = {"elbow_max_deg": 171.4, "elbow_min_deg": 97.0}


def _dir_with_reference(summary: dict = SUMMARY) -> tempfile.TemporaryDirectory:
    tmp = tempfile.TemporaryDirectory()
    (Path(tmp.name) / "reference_measurements.json").write_text(
        json.dumps({"summary": summary}), encoding="utf-8")
    return tmp


class ReferenceCheckTests(unittest.TestCase):
    def test_match_within_tolerance_passes(self):
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_2d_median", "tolerance": 10.0}]}, METRICS)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["outcome"], reference_check.PASS)
        self.assertEqual(res[0]["measured"], 97.0)
        self.assertEqual(res[0]["reference"], 97.6)

    def test_deviation_beyond_tolerance_fails(self):
        # The 136-deg bottom that once slipped through: elbow flexion 136
        # means interior 44 deg, far from the 97.6 reference bottom.
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_2d_median", "tolerance": 10.0}]},
                {"elbow_min_deg": 44.0})
        self.assertEqual(res[0]["outcome"], reference_check.FAIL)

    def test_exactly_at_tolerance_passes(self):
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_2d_median", "tolerance": 0.6}]}, METRICS)
        self.assertEqual(res[0]["outcome"], reference_check.PASS)

    def test_no_file_no_checks_is_not_tested(self):
        with tempfile.TemporaryDirectory() as d:
            res = reference_check.check(d, {"pattern": "squat"}, METRICS)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["outcome"], reference_check.NOT_TESTED)
        self.assertIn("No reference measurements", res[0]["detail"])

    def test_declared_checks_but_missing_file_fails(self):
        with tempfile.TemporaryDirectory() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_2d_median", "tolerance": 10.0}]}, METRICS)
        self.assertEqual(res[0]["outcome"], reference_check.FAIL)
        self.assertIn("missing", res[0]["detail"])

    def test_file_present_no_checks_is_not_tested_and_keeps_reason(self):
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_note": "Clip is wide-grip; animation is medium grip."}, METRICS)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["outcome"], reference_check.NOT_TESTED)
        self.assertIn("wide-grip", res[0]["detail"])

    def test_unknown_metric_fails(self):
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_typo_deg", "reference": "elbow_bottom_2d_median", "tolerance": 10.0}]}, METRICS)
        self.assertEqual(res[0]["outcome"], reference_check.FAIL)
        self.assertIn("unknown metric", res[0]["detail"])

    def test_unknown_reference_key_fails(self):
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_9d_median", "tolerance": 10.0}]}, METRICS)
        self.assertEqual(res[0]["outcome"], reference_check.FAIL)
        self.assertIn("unknown reference key", res[0]["detail"])

    def test_missing_tolerance_fails(self):
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_2d_median"}]}, METRICS)
        self.assertEqual(res[0]["outcome"], reference_check.FAIL)
        self.assertIn("tolerance", res[0]["detail"])

    def test_malformed_reference_file_fails(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "reference_measurements.json").write_text("{not json", encoding="utf-8")
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_2d_median", "tolerance": 10.0}]}, METRICS)
        self.assertEqual(res[0]["outcome"], reference_check.FAIL)
        self.assertIn("unreadable", res[0]["detail"])

    def test_multiple_checks_each_reported(self):
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_2d_median", "tolerance": 10.0},
                {"metric": "elbow_max_deg", "reference": "elbow_top_2d_median", "tolerance": 10.0}]}, METRICS)
        self.assertEqual([r["id"] for r in res], ["reference_elbow_min_deg", "reference_elbow_max_deg"])
        self.assertEqual([r["outcome"] for r in res], [reference_check.PASS, reference_check.PASS])


if __name__ == "__main__":
    unittest.main()
