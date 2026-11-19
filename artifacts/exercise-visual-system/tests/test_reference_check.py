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
# Số đo TẠI đỉnh / đáy (reference_check.metrics_at) — các khoá *_top_* / *_bottom_* so ở đây.
AT = {"top": METRICS, "bottom": METRICS}


def _dir_with_reference(summary: dict = SUMMARY) -> tempfile.TemporaryDirectory:
    tmp = tempfile.TemporaryDirectory()
    (Path(tmp.name) / "reference_measurements.json").write_text(
        json.dumps({"summary": summary}), encoding="utf-8")
    return tmp


class ReferenceCheckTests(unittest.TestCase):
    def test_match_within_tolerance_passes(self):
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_2d_median", "tolerance": 10.0}]}, METRICS, at=AT)
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
                {"elbow_min_deg": 44.0}, at={"bottom": {"elbow_min_deg": 44.0}})
        self.assertEqual(res[0]["outcome"], reference_check.FAIL)

    def test_exactly_at_tolerance_passes(self):
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_2d_median", "tolerance": 0.6}]}, METRICS, at=AT)
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
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_2d_median", "tolerance": 10.0}]}, METRICS, at=AT)
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
                {"metric": "elbow_typo_deg", "reference": "elbow_bottom_2d_median", "tolerance": 10.0}]}, METRICS, at=AT)
        self.assertEqual(res[0]["outcome"], reference_check.FAIL)
        self.assertIn("unknown metric", res[0]["detail"])

    def test_unknown_reference_key_fails(self):
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_9d_median", "tolerance": 10.0}]}, METRICS, at=AT)
        self.assertEqual(res[0]["outcome"], reference_check.FAIL)
        self.assertIn("unknown reference key", res[0]["detail"])

    def test_missing_tolerance_fails(self):
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_2d_median"}]}, METRICS, at=AT)
        self.assertEqual(res[0]["outcome"], reference_check.FAIL)
        self.assertIn("tolerance", res[0]["detail"])

    def test_malformed_reference_file_fails(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "reference_measurements.json").write_text("{not json", encoding="utf-8")
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_2d_median", "tolerance": 10.0}]}, METRICS, at=AT)
        self.assertEqual(res[0]["outcome"], reference_check.FAIL)
        self.assertIn("unreadable", res[0]["detail"])

    def test_multiple_checks_each_reported(self):
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_min_deg", "reference": "elbow_bottom_2d_median", "tolerance": 10.0},
                {"metric": "elbow_max_deg", "reference": "elbow_top_2d_median", "tolerance": 10.0}]}, METRICS, at=AT)
        self.assertEqual([r["id"] for r in res], ["reference_elbow_min_deg", "reference_elbow_max_deg"])
        self.assertEqual([r["outcome"] for r in res], [reference_check.PASS, reference_check.PASS])


if __name__ == "__main__":
    unittest.main()


class PositionTests(unittest.TestCase):
    """Devin #890: a reference measured AT the top/bottom is compared with the angle at
    that pose, not with the extreme of every frame of the rep."""

    def test_top_reference_uses_the_angle_at_the_top_not_the_extreme(self):
        # Video: 165 deg at the top. Animation: 165 at the top, 175 at a transition frame.
        with _dir_with_reference({"reps": 3, "elbow_top_2d_median": 165.0}) as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_max_deg", "reference": "elbow_top_2d_median", "tolerance": 5.0}]},
                {"elbow_max_deg": 175.0}, at={"top": {"elbow_max_deg": 165.0}})
        self.assertEqual(res[0]["outcome"], reference_check.PASS)
        self.assertEqual(res[0]["measured"], 165.0)
        self.assertIn("at the top", res[0]["detail"])

    def test_positional_reference_without_pose_metrics_fails_loudly(self):
        with _dir_with_reference() as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_max_deg", "reference": "elbow_top_2d_median", "tolerance": 10.0}]}, METRICS)
        self.assertEqual(res[0]["outcome"], reference_check.FAIL)
        self.assertIn("refusing", res[0]["detail"])

    def test_non_positional_reference_still_uses_the_extreme(self):
        with _dir_with_reference({"reps": 3, "elbow_range_max": 171.0}) as d:
            res = reference_check.check(d, {"reference_checks": [
                {"metric": "elbow_max_deg", "reference": "elbow_range_max", "tolerance": 1.0}]}, METRICS)
        self.assertEqual(res[0]["outcome"], reference_check.PASS)

    def test_explicit_at_overrides_the_key(self):
        self.assertEqual(reference_check.position_of("elbow_peak", {"at": "bottom"}), "bottom")
        self.assertEqual(reference_check.position_of("elbow_top_2d_median", {}), "top")
        self.assertEqual(reference_check.position_of("knee_bottom", {}), "bottom")
        self.assertIsNone(reference_check.position_of("elbow_range_max", {}))

    def test_position_frames_from_phases(self):
        phases = [{"id": "setup", "start_s": 0, "end_s": 0.5}, {"id": "eccentric", "start_s": 0.5, "end_s": 1.5},
                  {"id": "concentric", "start_s": 1.5, "end_s": 2.5}, {"id": "eccentric_2", "start_s": 2.5, "end_s": 3.5},
                  {"id": "concentric_2", "start_s": 3.5, "end_s": 4.5}]
        self.assertEqual(reference_check.position_frames(phases, 30), {"bottom": [45, 105], "top": [75, 135]})

    def test_metrics_at_is_the_median_over_the_given_frames(self):
        joints = {"a": [10.0, 50.0, 20.0, 30.0]}
        fn = lambda j: {"m": float(j["a"][0])}  # noqa: E731
        self.assertEqual(reference_check.metrics_at(joints, [0, 2, 3, 99], fn), {"m": 20.0})
        self.assertEqual(reference_check.metrics_at(joints, [], fn), {})
