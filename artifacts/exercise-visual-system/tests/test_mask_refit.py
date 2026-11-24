import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from evs import mask_refit  # noqa: E402


class MaskRefitTest(unittest.TestCase):
    def test_border_moves_onto_groove_within_band(self):
        # two groups split at column 30; the real groove is at column 38
        labels = np.zeros((40, 80), np.int32)
        labels[:, :30] = 1
        labels[:, 30:] = 2
        height = np.zeros((40, 80), np.float32)
        height[:, 38] = 1.0
        region = np.ones_like(labels, bool)
        out, facts = mask_refit.watershed(labels, region, height, band_px=12, stray_cost=0.1)
        cols = [int(np.argmax(row == 2)) for row in out]
        self.assertTrue(all(37 <= c <= 39 for c in cols), cols)
        self.assertGreater(facts["texels_changed"], 0)

    def test_groove_out_of_band_is_ignored(self):
        labels = np.zeros((40, 80), np.int32)
        labels[:, :30] = 1
        labels[:, 30:] = 2
        height = np.zeros((40, 80), np.float32)
        height[:, 60] = 1.0
        out, _ = mask_refit.watershed(labels, np.ones_like(labels, bool), height, band_px=8, stray_cost=0.1)
        cols = [int(np.argmax(row == 2)) for row in out]
        self.assertTrue(all(abs(c - 30) <= 8 for c in cols), cols)

    def test_outside_region_untouched(self):
        labels = np.zeros((20, 20), np.int32)
        labels[:, 10:] = 3
        region = np.zeros_like(labels, bool)
        region[:, :15] = True
        out, _ = mask_refit.watershed(labels, region, np.zeros((20, 20), np.float32), band_px=5)
        self.assertTrue(np.array_equal(out[:, 15:], labels[:, 15:]))

    def test_majority_smooth_removes_speck(self):
        labels = np.ones((21, 21), np.int32)
        labels[10, 10] = 2
        out = mask_refit.majority_smooth(labels, np.ones_like(labels, bool), 2)
        self.assertEqual(int(out[10, 10]), 1)

    def test_muscles_fill_narrow_gap(self):
        labels = np.zeros((30, 200), np.int32)
        labels[:, 60:90] = 1
        labels[:, 100:140] = 2  # gap 90..99 is "no muscle"; big no-muscle area at both ends
        height = np.zeros((30, 200), np.float32)
        height[:, 96] = 1.0
        out, _ = mask_refit.watershed(labels, np.ones_like(labels, bool), height, band_px=10, stray_cost=0.1)
        self.assertFalse((out[:, 90:100] == 0).any())
        self.assertTrue((out[:, 5] == 0).all())


if __name__ == "__main__":
    unittest.main()
