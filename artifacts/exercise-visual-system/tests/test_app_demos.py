"""Unit tests for pipeline/export_app_demos.py (20/11: the 3D viewer's content as independent
module files). No Blender.

    cd artifacts/exercise-visual-system && python3 -m unittest tests.test_app_demos -v
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

import export_app_demos as ead  # noqa: E402

LANG_TIP = {"title": "T", "body": "B", "how": ["h1", "h2"], "why": "W", "avoid": "A"}


def keys_colors() -> tuple[dict, dict]:
    keys = json.loads((ROOT / "config" / "legend_keys.json").read_text())
    colors = json.loads((ROOT / "config" / "brand.config.json").read_text())["colors"]
    return keys, colors


class RealExercises(unittest.TestCase):
    """Every exercise with an app_demo exports a core file plus only the modules it has."""

    def test_modules_are_listed_and_named_after_the_exercise(self):
        keys, colors = keys_colors()
        seen = 0
        for ex in sorted(p for p in ROOT.iterdir() if (p / "exercise.json").exists()):
            r = ead.demo(ex, keys, colors)
            if not r:
                continue
            prefix, files, _ = r
            core = files[f"{prefix}_demo"]
            self.assertEqual(core["schema"], 1)
            for kind, name in core["modules"].items():
                self.assertEqual(name, f"{prefix}_{kind}")
                self.assertIn(name, files)
                self.assertEqual(files[name]["exercise"], prefix)
            # No module file without being listed in the core.
            self.assertEqual(set(files) - {f"{prefix}_demo"}, set(core["modules"].values()))
            seen += 1
        self.assertGreaterEqual(seen, 8)

    def test_tip_text_has_three_languages(self):
        keys, colors = keys_colors()
        _, files, _ = ead.demo(ROOT / "dumbbell-shoulder-press", keys, colors)
        tips = files["dumbbell_shoulder_press_tips"]["tips"]
        self.assertEqual(len(tips), 5)
        for t in tips:
            self.assertEqual(set(t["text"]), {"en", "es", "vi"})

    def test_schema_files_are_valid_json_schema(self):
        for path in (ROOT / "schemas").glob("demo3d_*.schema.json"):
            s = json.loads(path.read_text())
            self.assertEqual(s["$schema"], "https://json-schema.org/draft/2020-12/schema", path.name)
            self.assertIn("title", s)


class TipsJoin(unittest.TestCase):
    """Anchors live in exercise.json, text in content/tips.json: the two must name the same tips."""

    def folder(self, text: dict | None) -> Path:
        d = Path(tempfile.mkdtemp())
        if text is not None:
            (d / "content").mkdir()
            (d / "content" / "tips.json").write_text(json.dumps(text))
        return d

    def test_text_joins_the_anchor(self):
        d = self.folder({"a": {"en": LANG_TIP, "es": LANG_TIP, "vi": LANG_TIP}})
        out = ead.tips(d, {"tips": [{"id": "a", "anchor": [0, 1, 0]}]})
        self.assertEqual(out[0]["id"], "a")
        self.assertEqual(out[0]["text"]["vi"]["title"], "T")

    def test_tip_without_text_fails(self):
        d = self.folder({})
        with self.assertRaises(SystemExit):
            ead.tips(d, {"tips": [{"id": "a", "anchor": [0, 1, 0]}]})

    def test_text_without_tip_fails(self):
        d = self.folder({"a": {}, "b": {}})
        with self.assertRaises(SystemExit):
            ead.tips(d, {"tips": [{"id": "a", "anchor": [0, 1, 0]}]})

    def test_no_tips_no_module(self):
        self.assertEqual(ead.tips(self.folder(None), {}), [])


class Digest(unittest.TestCase):
    def test_digest_is_stable_and_short(self):
        self.assertEqual(ead.digest("x"), ead.digest("x"))
        self.assertEqual(len(ead.digest("x")), 16)
        self.assertNotEqual(ead.digest("x"), ead.digest("y"))

    def test_schema_for_module_names(self):
        self.assertEqual(ead.schema_for("bench_press_demo"), "demo3d_demo")
        self.assertEqual(ead.schema_for("dumbbell_curl_mistakes"), "demo3d_mistakes")
        self.assertEqual(ead.schema_for("demo3d_index"), "demo3d_index")


if __name__ == "__main__":
    unittest.main()
