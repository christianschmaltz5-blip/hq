"""Offline ESL/NAOS tests: python3 -m unittest discover -s tests -p 'test_*.py'"""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "agents" / "phx_land_leads"))
import esl

LF = ["Lower Desert", "Upper Desert", "Hillside"]
# (slope, expected NAOS % per landform) incl. both sides of every row boundary; upper edge belongs to its row
CASES = [(0, (20, 25, 50)), (2, (20, 25, 50)), (2.01, (25, 25, 50)), (5, (25, 25, 50)), (5.01, (30, 35, 50)),
         (10, (30, 35, 50)), (10.01, (30, 45, 50)), (15, (30, 45, 50)), (15.01, (30, 45, 65)),
         (25, (30, 45, 65)), (25.01, (30, 45, 80)), (60, (30, 45, 80))]


class NaosTests(unittest.TestCase):
    def test_table_every_boundary_and_landform(self):
        for slope, want in CASES:
            for lf, w in zip(LF, want):
                with self.subTest(slope=slope, landform=lf):
                    self.assertEqual(esl.naos_lookup(lf, slope)[0], w)

    def test_minimums_and_unknowns(self):
        self.assertEqual([esl.naos_lookup(l, 3)[1] for l in LF], [15, 20, 40])
        self.assertEqual(esl.naos_lookup("Lower Desert", None), (None, None))
        self.assertEqual(esl.naos_lookup("Nowhere", 3), (None, None))

    def test_one_acre_examples_use_box_not_minimum(self):
        for lf, slope, nat, use in (("Lower Desert", 1, .2, .8), ("Upper Desert", 12, .45, .55), ("Hillside", 30, .8, .2)):
            r = esl.esl_stats(lf, [], slope, 20, "ok", 1.0)
            self.assertAlmostEqual(r["naosAcres"], nat); self.assertAlmostEqual(r["usableAcres"], use)

    def test_multi_landform_picks_largest_and_records_others(self):
        self.assertEqual(esl.pick_landform({"Lower Desert": .2, "Upper Desert": .7, "Hillside": .1}),
                         ("Upper Desert", ["Lower Desert", "Hillside"]))
        sq = lambda x0, x1: [[[x0, 0], [x1, 0], [x1, 1], [x0, 1], [x0, 0]]]
        sh = esl.landform_shares(sq(0, 1), [("Hillside", sq(0, .3)), ("Upper Desert", sq(.3, 2))])
        self.assertEqual(esl.pick_landform(sh)[0], "Upper Desert")

    def test_slope_math_feet_per_degree(self):
        # 2x1 lattice, 100 ft apart east-west, 5 ft rise -> 5%
        self.assertAlmostEqual(esl.mean_slope({(0, 0): 100, (1, 0): 105}, 100, 100), 5.0)

    def test_slope_failure_degrades_to_null_with_status(self):
        parcel = [[[0, 0], [.001, 0], [.001, .001], [0, .001], [0, 0]]]
        with patch.object(esl, "measure", return_value=(dict(inEsl=True, landform="Upper Desert", otherLandforms=[]), parcel)), \
             patch.object(esl, "elevation_ft", side_effect=OSError("503")):
            r = esl.process(dict(apn="X1", landAcres=1.0), {}, dict(fails=0, dirty=False))
        self.assertEqual(r["slopePct"], None); self.assertIn("unavailable", r["slopeStatus"])
        self.assertIsNone(r["naosPct"]); self.assertIsNone(r["usableAcres"])

    def test_lookup_failure_and_outside_esl(self):
        with patch.object(esl, "measure", side_effect=OSError("down")):
            r = esl.process(dict(apn="X2", landAcres=1.0), {}, dict(fails=0, dirty=False))
        self.assertIsNone(r["inEsl"]); self.assertIn("unavailable", r["slopeStatus"])
        with patch.object(esl, "measure", return_value=dict(inEsl=False)):
            self.assertEqual(esl.process(dict(apn="X3", landAcres=1.0), {}, dict(fails=0, dirty=False))["inEsl"], False)


if __name__ == "__main__":
    unittest.main()
