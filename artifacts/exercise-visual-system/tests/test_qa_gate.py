"""Unit tests for pipeline/check_qa_gate.py (no Blender).

    cd artifacts/exercise-visual-system && python3 -m unittest discover -s tests -v

The gate is loaded from its file path (pipeline/ has no package) and
exercised against synthetic qa_report.json files in temporary trees.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location(
    "check_qa_gate", ROOT / "pipeline" / "check_qa_gate.py")
assert _spec is not None and _spec.loader is not None
check_qa_gate = importlib.util.module_from_spec(_spec)
sys.modules["check_qa_gate"] = check_qa_gate
_spec.loader.exec_module(check_qa_gate)


def _report(*checks: tuple[str, str]) -> dict:
    return {"checks": [{"id": check_id, "status": status,
                        "measured": 1, "limit": 2} for check_id, status in checks]}


def _make_kit(tmp: Path, reports: dict[str, dict | None]) -> Path:
    kit = tmp / "kit"
    for exercise, report in reports.items():
        exercise_dir = kit / exercise
        exercise_dir.mkdir(parents=True)
        if report is not None:
            (exercise_dir / "qa_report.json").write_text(json.dumps(report), encoding="utf-8")
    return kit


class QaGateTests(unittest.TestCase):
    def test_all_pass_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            kit = _make_kit(Path(tmp), {
                "back-squat": _report(("frames", "PASS")),
                "dumbbell-curl": _report(("frames", "PASS")),
            })
            violations, _ = check_qa_gate.check(kit)
            self.assertEqual(violations, [])

    def test_known_failure_passes_with_no_violation(self):
        # The real known failure (back-squat skin_stretch) must not block.
        with tempfile.TemporaryDirectory() as tmp:
            kit = _make_kit(Path(tmp), {
                "back-squat": _report(("skin_stretch", "FAIL")),
                "dumbbell-curl": _report(("frames", "PASS")),
            })
            violations, warnings = check_qa_gate.check(kit)
            self.assertEqual(violations, [])
            self.assertEqual(warnings, [])

    def test_new_failure_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            kit = _make_kit(Path(tmp), {
                "back-squat": _report(("frames", "PASS")),
                "dumbbell-curl": _report(("joint_speed", "FAIL")),
            })
            violations, _ = check_qa_gate.check(kit)
            self.assertEqual(len(violations), 1)
            self.assertIn("dumbbell-curl", violations[0])
            self.assertIn("joint_speed", violations[0])

    def test_known_failure_on_another_exercise_fails(self):
        # The allowlist is per exercise: skin_stretch failing on curl is new.
        with tempfile.TemporaryDirectory() as tmp:
            kit = _make_kit(Path(tmp), {
                "back-squat": _report(("frames", "PASS")),
                "dumbbell-curl": _report(("skin_stretch", "FAIL")),
            })
            violations, _ = check_qa_gate.check(kit)
            self.assertEqual(len(violations), 1)

    def test_fixed_known_failure_warns_but_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            kit = _make_kit(Path(tmp), {
                "back-squat": _report(("skin_stretch", "PASS")),
                "dumbbell-curl": _report(("frames", "PASS")),
            })
            violations, warnings = check_qa_gate.check(kit)
            self.assertEqual(violations, [])
            self.assertEqual(len(warnings), 1)
            self.assertIn("KNOWN_FAILURES", warnings[0])

    def test_review_and_not_tested_do_not_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            kit = _make_kit(Path(tmp), {
                "back-squat": _report(("movement_elbow", "REQUIRES_MANUAL_REVIEW")),
                "dumbbell-curl": _report(("contact", "NOT_TESTED")),
            })
            violations, _ = check_qa_gate.check(kit)
            self.assertEqual(violations, [])

    def test_missing_report_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            kit = _make_kit(Path(tmp), {"back-squat": None, "dumbbell-curl": _report()})
            violations, _ = check_qa_gate.check(kit)
            self.assertTrue(any("thiếu" in v for v in violations))

    def test_malformed_report_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            kit = _make_kit(Path(tmp), {"back-squat": {"nope": True},
                                        "dumbbell-curl": _report()})
            violations, _ = check_qa_gate.check(kit)
            self.assertTrue(any("không có danh sách checks" in v for v in violations))

    def test_real_tree_passes(self):
        # The committed reports must pass: the gate is green on the tree.
        violations, _ = check_qa_gate.check(ROOT)
        self.assertEqual(violations, [])


if __name__ == "__main__":
    unittest.main()
