"""Unit tests for the review-sheet helpers in pipeline/factory.py: flagged
frames from a QA report, near-flag marking, and overlay captions.

No Blender, no PIL (the overlay drawing itself is verified by eyeballing
the rendered sheets).

    cd artifacts/exercise-visual-system && python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

import factory  # noqa: E402

TEMPLATE_REPORT = {"checks": [
    {"id": "skin_stretch", "status": "FAIL", "where": {"frame": 56}},
    {"id": "joint_speed", "status": "PASS", "where": {"frame": 10}},
    {"id": "movement_knee_min_deg", "status": "REQUIRES_MANUAL_REVIEW", "where": {"frame": 56}},
    {"id": "reference_measurements", "status": "NOT_TESTED", "where": None},
    {"id": "hand_implement_contact", "status": "FAIL", "where": {"frame": 120}},
]}

BENCH_REPORT = {"checks": [
    {"id": "skin_deformation", "status": "FAIL", "category": "character", "phases": []},
    {"id": "elbow_tracking", "status": "FAIL", "category": "movement", "phases": ["eccentric"]},
    {"id": "movement_elbow_max_deg", "status": "PASS", "category": "anatomy", "phases": []},
    {"id": "motion_source", "status": "UNVERIFIED", "category": "approval", "phases": []},
    {"id": "expert_approval", "status": "REQUIRES_MANUAL_REVIEW", "category": "approval", "phases": []},
]}

METRICS = {"elbow_min_deg": 66.1, "elbow_max_deg": 66.4, "knee_min_deg": 66.1, "knee_max_deg": 66.1,
           "torso_lean_max_deg": 36.5, "hip_flex_max_deg": 108.2, "arm_elev_max_deg": 16.1}


class FlaggedFramesTests(unittest.TestCase):
    def test_template_report_groups_frames_and_ignores_passes(self):
        frames, without = factory.flagged_frames_from_report(TEMPLATE_REPORT)
        self.assertEqual(sorted(frames), [56, 120])
        self.assertEqual([c["id"] for c in frames[56]], ["skin_stretch", "movement_knee_min_deg"])
        self.assertEqual(without, [])

    def test_bench_report_has_no_structured_frames(self):
        frames, without = factory.flagged_frames_from_report(BENCH_REPORT)
        self.assertEqual(frames, {})
        self.assertEqual([c["id"] for c in without], ["skin_deformation", "elbow_tracking"])

    def test_frame_mark_flag_near_and_none(self):
        flagged = {56: [{"id": "skin_stretch", "status": "FAIL"}]}
        self.assertEqual(factory.frame_mark(56, flagged), ("flag", 56))
        self.assertEqual(factory.frame_mark(62, flagged), ("near", 56))
        self.assertIsNone(factory.frame_mark(38, flagged))
        self.assertIsNone(factory.frame_mark(62, {}))

    def test_caption_lines_with_metrics(self):
        lines = factory.caption_lines(62, "end eccentric", METRICS)
        self.assertEqual(lines[0], "f62 · end eccentric")
        self.assertIn("elbow 66°", lines[1])
        self.assertIn("knee 66°", lines[1])
        self.assertIn("trunk 37°", lines[2])
        self.assertIn("hip 108°", lines[2])
        self.assertIn("arm 16°", lines[2])

    def test_caption_lines_without_metrics(self):
        lines = factory.caption_lines(0, "start", None)
        self.assertEqual(lines[1], "angles unavailable")


if __name__ == "__main__":
    unittest.main()
