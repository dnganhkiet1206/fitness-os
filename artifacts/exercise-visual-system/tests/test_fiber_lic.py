"""Unit tests for the painted fibre detail (evs/fiber_lic.py). No Blender.

    cd artifacts/exercise-visual-system && python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from evs import fiber_lic  # noqa: E402


class FiberLicTests(unittest.TestCase):
    def test_box_blur_keeps_constant(self):
        img = np.full((20, 30), 0.7)
        self.assertTrue(np.allclose(fiber_lic.box_blur(img, 3), 0.7))

    def test_direction_runs_along_iso_phase_lines(self):
        # Phase grows along x: iso-phase lines (the fibres) are vertical.
        x = np.arange(64)[None, :].repeat(64, axis=0)
        frac = ((x * 8) % 256).astype(np.uint8)
        dx, dy = fiber_lic.direction_from_phase(frac)
        self.assertLess(np.abs(dx[16:48, 16:48]).max(), 0.05)
        self.assertGreater(np.abs(dy[16:48, 16:48]).min(), 0.99)

    def test_lic_of_constant_noise_is_constant(self):
        noise = np.full((32, 32), 0.4)
        dx, dy = np.ones((32, 32)), np.zeros((32, 32))
        out = fiber_lic.lic(noise, dx, dy, np.ones((32, 32), bool), 6)
        self.assertTrue(np.allclose(out, 0.4))

    def test_streaks_follow_direction(self):
        # Streaks along x: variation along x much smaller than across.
        rng = np.random.default_rng(1)
        noise = rng.random((64, 64))
        dx, dy = np.ones((64, 64)), np.zeros((64, 64))
        out = fiber_lic.lic(noise, dx, dy, np.ones((64, 64), bool), 12)[8:56, 8:56]
        along = np.abs(np.diff(out, axis=1)).mean()
        across = np.abs(np.diff(out, axis=0)).mean()
        self.assertLess(along * 3, across)

    def test_painted_maps_leave_skin_untouched(self):
        mask = np.zeros((96, 96), np.uint8)
        mask[24:72, 24:72] = 255
        x = np.arange(96)[None, :].repeat(96, axis=0)
        phase = {"m": ((x * 6) % 256).astype(np.uint8)}
        shade, normal, rim = fiber_lic.painted_maps({"m": mask}, phase, ["m"])
        self.assertTrue(np.allclose(shade[:10], 1.0))
        self.assertTrue(np.allclose(normal[:10], [0.5, 0.5, 1.0]))
        self.assertTrue(np.allclose(rim[:10], 0.0))
        inside = shade[36:60, 36:60]
        self.assertGreater(inside.std(), 0.02)  # fibres vary the shade
        self.assertGreater(rim[24:30, 40:56].max(), 0.3)  # rim sits on the edge
        self.assertLess(rim[44:52, 44:52].max(), 0.05)
        self.assertTrue(((normal >= 0) & (normal <= 1)).all())

    def test_crisp_mask_range(self):
        m = np.zeros((40, 40), np.uint8)
        m[10:30, 10:30] = 200
        c = fiber_lic.crisp_mask(m)
        self.assertGreaterEqual(c.min(), 0.0)
        self.assertLessEqual(c.max(), 1.0)
        self.assertAlmostEqual(c[20, 20], 1.0)
        self.assertAlmostEqual(c[0, 0], 0.0)


if __name__ == "__main__":
    unittest.main()
