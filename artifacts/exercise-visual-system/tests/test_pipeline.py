"""Unit tests for the plain-Python parts of the pipeline (no Blender needed).

    cd artifacts/exercise-visual-system && python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from evs import CHECK_STATUSES, config, fibers, glb, muscle_eval, pngio  # noqa: E402
from evs.validation import checks, report, video  # noqa: E402


class ConfigTests(unittest.TestCase):
    def test_hex_to_linear(self):
        self.assertEqual(config.hex_to_linear_rgb("#000000"), (0.0, 0.0, 0.0))
        r, g, b = config.hex_to_linear_rgb("#FFFFFF")
        self.assertAlmostEqual(r, 1.0)
        self.assertAlmostEqual(config.hex_to_linear_rgb("#808080")[0], 0.2158, places=3)
        with self.assertRaises(ValueError):
            config.hex_to_linear_rgb("#FFF")

    def test_brand_profile_is_separate_and_placeholder(self):
        brand = config.brand_config()
        for key in ("brand_name", "logo_path", "colors", "typography", "watermark", "intro", "outro", "lighting_preset", "render_preset"):
            self.assertIn(key, brand)
        # The character and the motion never name the brand.
        for path in [*(ROOT / "config").glob("master_character.json"), ROOT / "bench-press" / "exercise.json"]:
            self.assertNotIn("ASCND", path.read_text())

    def test_brand_override_by_environment(self):
        with tempfile.TemporaryDirectory() as d:
            alt = dict(config.brand_config(), brand_profile_id="other", brand_name="Other")
            p = Path(d) / "b.json"
            p.write_text(json.dumps(alt))
            os.environ["EVS_BRAND_CONFIG"] = str(p)
            try:
                self.assertEqual(config.brand_config()["brand_profile_id"], "other")
            finally:
                del os.environ["EVS_BRAND_CONFIG"]

    def test_bench_press_config_is_valid(self):
        ex = config.exercise_config("bench-press")
        problems = report.validate_exercise_config(ex, list(config.muscle_map()["groups"]), list(config.camera_presets()["presets"]))
        self.assertEqual(problems, [])
        self.assertNotEqual(ex["status"], "APPROVED")


class ExerciseSchemaTests(unittest.TestCase):
    def base(self):
        return config.exercise_config("bench-press")

    def test_missing_field(self):
        ex = self.base()
        del ex["motion_source_license"]
        self.assertIn("missing field 'motion_source_license'", report.validate_exercise_config(ex))

    def test_approved_needs_reviewer(self):
        ex = self.base()
        ex["status"] = "APPROVED"
        self.assertTrue(any("reviewer" in p for p in report.validate_exercise_config(ex)))

    def test_phase_gap_detected(self):
        ex = self.base()
        ex["exercise_phases"][2]["start_s"] += 0.1
        self.assertTrue(any("does not start" in p for p in report.validate_exercise_config(ex)))

    def test_unknown_muscle(self):
        ex = self.base()
        ex["primary_muscles"] = ["not_a_muscle"]
        self.assertTrue(report.validate_exercise_config(ex, list(config.muscle_map()["groups"])))

    def test_required_cameras(self):
        ex = self.base()
        ex["camera_presets"] = ["side"]
        self.assertTrue(any("front" in p for p in report.validate_exercise_config(ex)))


class ApprovalGateTests(unittest.TestCase):
    def test_draft_is_blocked_and_never_pass_on_biomechanics(self):
        ex = config.exercise_config("bench-press")
        recs = report.approval_records(ex)
        status = {r["id"]: r["status"] for r in recs}
        self.assertEqual(status["biomechanical_correctness"], "UNVERIFIED")
        self.assertEqual(status["expert_approval"], "REQUIRES_MANUAL_REVIEW")
        summary = report.summarize(recs, ex)
        self.assertEqual(summary["publication_status"], "BLOCKED")

    def test_technical_pass_is_not_approval(self):
        ex = config.exercise_config("bench-press")
        ex["status"] = "TECHNICAL_QA_PASSED"
        summary = report.summarize([checks.record("x", "movement", "x", "PASS")] + report.approval_records(ex), ex)
        self.assertEqual(summary["publication_status"], "BLOCKED")
        self.assertEqual(summary["technical_qa"], "PASS")

    def test_approved_with_reviewer_publishes(self):
        ex = config.exercise_config("bench-press")
        ex.update(status="APPROVED", reviewer="Test Reviewer", approval_date="2026-01-01")
        summary = report.summarize(report.approval_records(ex), ex)
        self.assertEqual(summary["publication_status"], "PUBLISHABLE")

    def test_illegal_status_rejected(self):
        with self.assertRaises(ValueError):
            checks.record("x", "c", "t", "OK")
        self.assertEqual(set(CHECK_STATUSES), {"PASS", "FAIL", "NOT_TESTED", "REQUIRES_MANUAL_REVIEW", "UNVERIFIED"})

    def test_missing_render_is_not_tested(self):
        ex = config.exercise_config("bench-press")
        inv = {"cameras": {"side": 1, "front": 1, "three_quarter": 1}, "objects_without_material": [], "objects_without_faces": [],
               "animated_objects": {"Barbell": {"keyframes": 3}}, "frame_range": [0, 10]}
        recs = report.rendering_checks(Path("."), ex, inv, None, None, None, None, ex["validation_profile"])
        self.assertTrue(all(r["status"] in ("PASS", "NOT_TESTED") for r in recs))
        self.assertTrue(any(r["status"] == "NOT_TESTED" for r in recs))


class GeometryTests(unittest.TestCase):
    def test_interior_angle(self):
        a, b, c = np.array([1.0, 0, 0]), np.zeros(3), np.array([0, 1.0, 0])
        self.assertAlmostEqual(float(checks.interior_angle(a, b, c)), 90.0)
        self.assertAlmostEqual(float(checks.interior_angle(a, b, -a)), 180.0)

    def test_polygon_signed_distance(self):
        square = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=float)
        d = muscle_eval.polygon_signed_distance(np.array([[0.5, 0.5], [2.0, 0.5]]), square)
        self.assertAlmostEqual(d[0], 0.5)
        self.assertAlmostEqual(d[1], -1.0)

    def test_compose_highlight_roles_do_not_mix(self):
        a = np.array([[1.0, 1.0, 0.0]])
        b = np.array([[1.0, 0.0, 1.0]])
        rgb = muscle_eval.compose_highlight({"a": a, "b": b}, ["a"], ["b"], [])
        self.assertEqual(rgb[0, 0].tolist(), [255, 0, 0])   # primary wins
        self.assertEqual(rgb[0, 2].tolist(), [0, 255, 0])   # secondary only
        self.assertEqual(rgb[0, 1].tolist(), [255, 0, 0])
        with self.assertRaises(KeyError):
            muscle_eval.compose_highlight({"a": a}, ["missing"], [], [])

    def test_albedo_from_highlight(self):
        h = np.zeros((1, 2, 3), dtype=np.uint8)
        h[0, 1, 0] = 255
        out = muscle_eval.albedo_from_highlight(h, "#808080", "#FF0000", "#00FF00", "#0000FF")
        self.assertEqual(out[0, 0].tolist(), [128, 128, 128])
        self.assertEqual(out[0, 1].tolist(), [255, 0, 0])

    def test_emission_from_highlight(self):
        h = np.zeros((1, 3, 3), dtype=np.uint8)
        h[0, 1, 0] = 255
        h[0, 2, 1] = 255
        out = muscle_eval.emission_from_highlight(h, "#FF0000", "#00FF00", "#0000FF")
        self.assertEqual(out[0, 0].tolist(), [0, 0, 0])
        self.assertEqual(out[0, 1].tolist(), [255, 0, 0])
        self.assertEqual(out[0, 2].tolist(), [0, 255, 0])


class FiberTests(unittest.TestCase):
    def _bar_mask(self):
        mask = np.zeros((64, 64), dtype=np.uint8)
        mask[24:40, 8:56] = 255  # horizontal bar: fibres run along x
        side = np.full((64, 64), 255, dtype=np.uint8)
        return mask, side

    def test_striations_run_along_the_long_axis(self):
        mask, side = self._bar_mask()
        field = fibers.group_fiber_field(mask, side, np.random.default_rng(7))
        inner = field[27:37, 12:52]
        across = np.abs(np.diff(inner, axis=0)).mean()  # along y: crosses stripes
        along = np.abs(np.diff(inner, axis=1)).mean()   # along x: follows fibres
        self.assertGreater(across, 2.0 * along)

    def test_apply_fibers_keeps_zero_and_peak(self):
        mask, side = self._bar_mask()
        rgb = muscle_eval.compose_highlight({"g": mask.astype(float) / 255.0}, ["g"], [], [])
        out = fibers.apply_fibers(rgb, {"g": mask, "_side_left": side}, {"primary": ["g"]}, seed=7)
        self.assertEqual(out[0, 0].tolist(), [0, 0, 0])  # outside the mask: untouched
        inside = out[24:40, 8:56, 0].astype(float)
        self.assertGreaterEqual(inside.min(), 0.45 * 255 - 1)
        self.assertGreater(inside.max(), 0.9 * 255)  # ridges reach ~full strength
        self.assertGreater(inside.std(), 5.0)  # visible variation, not flat

    def test_apply_fibers_is_deterministic(self):
        mask, side = self._bar_mask()
        rgb = muscle_eval.compose_highlight({"g": mask.astype(float) / 255.0}, ["g"], [], [])
        args = (rgb, {"g": mask, "_side_left": side}, {"primary": ["g"]})
        a = fibers.apply_fibers(*args, seed=7)
        b = fibers.apply_fibers(*args, seed=7)
        c = fibers.apply_fibers(*args, seed=8)
        self.assertTrue(np.array_equal(a, b))
        self.assertFalse(np.array_equal(a, c))

    def test_apply_fibers_unknown_group_raises(self):
        rgb = np.zeros((4, 4, 3), dtype=np.uint8)
        with self.assertRaises(KeyError):
            fibers.apply_fibers(rgb, {}, {"primary": ["missing"]}, seed=7)

    def test_fiber_detail_image(self):
        mask, side = self._bar_mask()
        detail = fibers.fiber_detail_image({"g": mask, "_side_left": side}, ["g"], seed=7)
        self.assertEqual(detail.shape, (64, 64))
        self.assertEqual(int(detail[0, 0]), 255)  # no group: white
        self.assertLess(int(detail[30, 30]), 255)


class FileFormatTests(unittest.TestCase):
    def test_png_roundtrip(self):
        img = (np.arange(48, dtype=np.uint8).reshape(4, 4, 3) * 5)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.png"
            pngio.write_png(p, img)
            self.assertTrue(np.array_equal(pngio.read_png(p), img))
            gray = img[..., 0]
            pngio.write_png(p, gray)
            self.assertTrue(np.array_equal(pngio.read_png(p), gray))

    def _tiny_glb(self, path):
        positions = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=np.float32).tobytes()
        doc = {"asset": {"version": "2.0"}, "buffers": [{"byteLength": len(positions)}],
               "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(positions)}],
               "accessors": [{"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"}],
               "materials": [{"name": "M", "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1]}}],
               "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "material": 0}]}], "nodes": [{"mesh": 0}]}
        glb.write_glb(path, doc, positions)

    def test_glb_roundtrip_and_variants(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = Path(d) / "a.glb", Path(d) / "b.glb"
            self._tiny_glb(src)
            s = glb.summarize(src)
            self.assertEqual((s["vertices"], s["errors"]), (3, []))
            png = pngio.png_bytes(np.zeros((2, 2, 3), dtype=np.uint8))
            glb.add_material_variants(src, dst, {"a": {"M": {"same": True}}, "b": {"M": {"base_color": [1, 0, 0, 1], "texture_png": png}}})
            s2 = glb.summarize(dst)
            self.assertEqual(s2["material_variants"], ["a", "b"])
            self.assertEqual(s2["errors"], [])
            self.assertIn("KHR_materials_variants", s2["extensions_used"])

    def test_glb_rejects_garbage(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "bad.glb"
            p.write_bytes(b"not a glb file at all")
            with self.assertRaises(ValueError):
                glb.read_glb(p)


class VideoTests(unittest.TestCase):
    def test_sync_detects_lag(self):
        rng = np.random.default_rng(1)
        m = np.abs(rng.normal(size=200))
        self.assertEqual(video.sync_score(m, m)["best_lag_frames"], 0)
        self.assertNotEqual(video.sync_score(m[3:], m[:-3])["best_lag_frames"], 0)

    def test_blank_and_flicker(self):
        frames = np.full((5, 10, 10), 200, dtype=np.uint8)
        stats = video.frame_statistics(frames)
        self.assertEqual(stats["blank_frames"], [0, 1, 2, 3, 4])
        frames[:, :5, :5] = 20
        frames[2] = frames[2] // 2
        self.assertGreater(video.frame_statistics(frames)["largest_brightness_step"], 10)


class MovementCheckTests(unittest.TestCase):
    """Synthetic clips: a still pose must pass; a jump and a sliding foot must fail."""

    def clip(self, n=40):
        ex = config.exercise_config("bench-press")
        joints = {}
        base = {"shoulder": [0.19, 0.1, 0.53], "elbow": [0.32, 0.1, 0.4], "wrist": [0.33, 0.1, 0.62], "knuckle": [0.33, 0.1, 0.7],
                "hip": [0.11, -0.4, 0.5], "knee": [0.2, -0.8, 0.5], "ankle": [0.27, -0.8, 0.07], "toe": [0.27, -0.95, 0.01]}
        for k, v in base.items():
            for side, sx in (("l", 1), ("r", -1)):
                joints[f"{k}_{side}"] = [[v[0] * sx, v[1], v[2]]] * n
        for k in ("pelvis", "chest", "neck", "head", "head_top"):
            joints[k] = [[0, 0, 0.5]] * n
        samples = {"fps": 24, "frames": list(range(n)), "joints": joints,
                   "bar": {"center": [[0, 0.1, 0.7]] * n, "axis": [[1, 0, 0]] * n},
                   "hand": {s: {"long": [[0, 0, 1]] * n, "across": [[1, 0, 0]] * n, "normal": [[0, -1, 0]] * n} for s in ("l", "r")},
                   "foot": {s: {"sole_min_z_m": [0.0] * n} for s in ("l", "r")},
                   "bench": {"head_gap_m": [0.0] * n, "upper_back_gap_m": [0.0] * n, "glute_gap_m": [0.0] * n},
                   "bone_step_deg": {"upperarm_l": [0.0] * (n - 1)}}
        ex["exercise_phases"] = [{"id": "setup", "name": "s", "start_s": 0.0, "end_s": (n - 1) / 24, "cues": [], "checks": []}]
        return samples, ex

    def status(self, samples, ex, cid):
        recs = checks.movement_checks(checks.Clip(samples, ex), ex["validation_profile"])
        return {r["id"]: r["status"] for r in recs}[cid]

    def test_still_pose_passes_continuity_and_symmetry(self):
        s, ex = self.clip()
        for cid in ("bar_speed", "joint_position_continuity", "symmetry", "foot_contact", "unexplained_body_movement"):
            self.assertEqual(self.status(s, ex, cid), "PASS", cid)

    def test_jump_fails(self):
        s, ex = self.clip()
        s["bar"]["center"] = [[0, 0.1, 0.7]] * 20 + [[0, 0.1, 0.9]] * 20
        self.assertEqual(self.status(s, ex, "bar_speed"), "FAIL")

    def test_foot_slide_fails(self):
        s, ex = self.clip()
        s["joints"]["ankle_l"] = [[0.27 + 0.001 * i, -0.8, 0.07] for i in range(40)]
        self.assertEqual(self.status(s, ex, "foot_contact"), "FAIL")

    def test_asymmetry_fails(self):
        s, ex = self.clip()
        s["joints"]["wrist_r"] = [[-0.35, 0.1, 0.62]] * 40
        self.assertEqual(self.status(s, ex, "symmetry"), "FAIL")


if __name__ == "__main__":
    unittest.main()
