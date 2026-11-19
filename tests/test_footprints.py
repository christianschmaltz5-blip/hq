"""Footprint filter: python3 -m unittest discover -s tests."""
import sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "agents" / "phx_land_leads"))
import footprints


def fake(houses):
    return lambda q: {"elements": [{"center": {"lat": a, "lon": o}, "tags": {"building": t}} for a, o, t in houses]}


class FootprintTests(unittest.TestCase):
    def run_check(self, houses, parcels):
        with tempfile.TemporaryDirectory() as d, patch.object(footprints, "CACHE", Path(d) / "c.json"), \
             patch.object(footprints, "_overpass", fake(houses)), patch.object(footprints.time, "sleep"):
            return footprints.built_apns(parcels)

    def test_house_on_parcel_is_built_neighbour_and_shed_are_not(self):
        parcels = [("A", 33.5900, -111.9100, 43560), ("B", 33.5950, -111.9100, 43560), ("C", 33.6000, -111.9100, 43560)]
        houses = [(33.59001, -111.91001, "house"),   # on A
                  (33.60001, -111.91001, "shed")]    # on C, but a shed
        self.assertEqual(self.run_check(houses, parcels), {"A"})

    def test_failed_lookup_filters_nothing(self):
        with tempfile.TemporaryDirectory() as d, patch.object(footprints, "CACHE", Path(d) / "c.json"), \
             patch.object(footprints, "_overpass", lambda q: None), patch.object(footprints.time, "sleep"):
            self.assertEqual(footprints.built_apns([("A", 33.59, -111.91, 43560)]), set())
            self.assertFalse((Path(d) / "c.json").exists())   # failures are never cached


if __name__ == "__main__":
    unittest.main()
