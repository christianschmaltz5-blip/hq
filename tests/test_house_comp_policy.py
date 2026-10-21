"""Regression coverage for house-sale selection and cached underwriting."""
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agents" / "phx_land_leads"))
from house_comp_policy import HOUSE_COMP_POLICY, eligible_home_sale, filter_stored_house_comps
import offer
import verdict


def stored_sale(apn, sf, price):
    return {"apn": apn, "address": f"{apn} Sample Rd", "sf": sf, "price": price,
            "sold": "04/01/2026", "yearBuilt": 2025, "distanceMi": 0.5}


def parcel():
    return {"apn": "test-subject", "landUseClass": "residential", "landSf": 43560,
            "currentZoning": "R1-100", "floodKnown": True, "lat": 33.8, "lng": -112.1,
            "valuation": {"mostLikelyValue": 500000}, "assessedValue": 300000}


def county_sale(apn, sf, price):
    return {"attributes": {"APN": apn, "PHYSICAL_ADDRESS": f"{apn} Sample Rd",
            "LIVING_SPACE": sf, "SALE_PRICE": price, "LAND_SIZE": 43560,
            "CONST_YEAR": 2025, "LATITUDE": 33.8, "LONGITUDE": -112.1,
            "SALE_DATE": "04/01/2026"}}


class HouseCompPolicyTests(unittest.TestCase):
    def test_shared_size_price_and_missing_value_cases(self):
        fixture = json.loads((Path(__file__).with_name("house-comp-fixtures.json")).read_text())
        self.assertEqual(HOUSE_COMP_POLICY, fixture["policy"])
        cases = fixture["cases"]
        for case in cases:
            with self.subTest(case=case["name"]):
                self.assertEqual(eligible_home_sale(case["sf"], case["price"]), case["expected"])

    def test_cached_mansions_are_removed_and_statistics_recomputed(self):
        old = {"psf": 1000, "medPsf": 600, "price": 2700000, "lowPsf": 400, "highPsf": 1000,
               "n": 5, "radiusMi": 2, "source": "County stored home sales",
               "sourceUrl": "https://county.example/sales", "retrievedAt": "2026-10-17T12:00:00Z",
               "error": "Previous HTTP 503", "lookupAttemptedAt": "2026-10-18T12:00:00Z",
               "comps": [stored_sale("valid-400", 3800, 1520000),
                         stored_sale("valid-500", 4000, 2000000),
                         stored_sale("valid-600", 4500, 2700000),
                         stored_sale("large-mansion", 6000, 6000000),
                         stored_sale("costly-mansion", 3800, 3800000)]}
        result = filter_stored_house_comps(old)
        self.assertEqual(result["n"], 3)
        self.assertEqual(result["psf"], 500)  # second-highest surviving sale
        self.assertEqual(result["medPsf"], 500)
        self.assertEqual(result["price"], 2000000)
        self.assertEqual(result["lowPsf"], 400)
        self.assertEqual(result["highPsf"], 600)
        self.assertEqual([row["apn"] for row in result["comps"]],
                         ["valid-400", "valid-500", "valid-600"])
        self.assertEqual(result["selectionPolicy"], HOUSE_COMP_POLICY["id"])
        for field in ("source", "sourceUrl", "retrievedAt", "error", "lookupAttemptedAt", "radiusMi"):
            self.assertEqual(result[field], old[field], field)
        self.assertEqual(result["comps"][0]["yearBuilt"], 2025)
        self.assertEqual(result["comps"][0]["distanceMi"], 0.5)

    def test_thin_cached_sample_cannot_keep_old_price_or_verdict(self):
        lead = parcel()
        lead["houseComps"] = {"psf": 1000, "medPsf": 1000, "n": 5, "radiusMi": 1,
            "retrievedAt": "2026-10-17T12:00:00Z",
            "comps": [stored_sale("valid-a", 3800, 1520000),
                      stored_sale("valid-b", 4000, 2000000),
                      stored_sale("too-large", 6000, 2800000),
                      stored_sale("too-small", 2000, 1800000),
                      stored_sale("too-costly", 3800, 3800000)]}
        with patch.object(verdict, "_esri_query") as network:
            result = verdict.underwrite(lead, fetch_comps=False, overrides={})
        network.assert_not_called()
        self.assertIsNone(result)
        self.assertEqual(lead["houseComps"]["n"], 2)
        self.assertFalse(lead["houseComps"].get("psf"))
        self.assertTrue(lead["houseComps"]["requiresRefresh"])
        self.assertEqual(lead["houseComps"]["retrievedAt"], "2026-10-17T12:00:00Z")

    def test_legacy_summary_and_unqualified_new_build_do_not_restore_price(self):
        lead = parcel()
        lead["houseComps"] = {"psf": 900, "n": 5, "radiusMi": 1,
                               "source": "Old county summary", "retrievedAt": None}
        # These are only examples from a larger unfiltered population.
        lead["newBuild"] = {"psf": 950, "n": 12, "radiusMi": 1,
            "examples": [stored_sale(str(i), 3800, 1900000) for i in range(5)]}
        with patch.object(verdict, "_esri_query") as network:
            self.assertIsNone(verdict.underwrite(lead, fetch_comps=False, overrides={}))
        network.assert_not_called()
        self.assertFalse(lead["houseComps"].get("psf"))
        self.assertTrue(lead["houseComps"]["requiresRefresh"])
        self.assertEqual(lead["houseComps"]["source"], "Old county summary")
        self.assertIsNone(lead["houseComps"]["retrievedAt"])

    def test_qualified_new_build_remains_a_visible_fallback(self):
        lead = parcel()
        lead["houseComps"] = {"n": 0, "error": "County HTTP 503",
                               "retrievedAt": "2026-10-18T12:00:00Z"}
        lead["newBuild"] = {"psf": 450, "n": 12, "radiusMi": 1,
            "selectionPolicy": HOUSE_COMP_POLICY["id"],
            "retrievedAt": "2026-10-17T12:00:00Z"}
        result = verdict.underwrite(lead, fetch_comps=False, overrides={})
        self.assertEqual(result["salePsf"], 450)
        self.assertTrue(result["compFellBack"])
        self.assertEqual(result["compError"], "County HTTP 503")
        self.assertEqual(result["compRetrievedAt"], "2026-10-17T12:00:00Z")
        self.assertEqual(lead["houseComps"]["lookupAttemptedAt"], "2026-10-18T12:00:00Z")

    def test_live_house_sales_cannot_price_from_mansions(self):
        rows = [county_sale("valid-a", 3800, 1520000),
                county_sale("valid-b", 4000, 2000000),
                county_sale("valid-c", 4500, 2700000),
                county_sale("large-mansion", 6000, 6000000),
                county_sale("costly-mansion", 3800, 3800000)]
        with patch.object(verdict, "_esri_query", return_value={"features": rows}):
            result = verdict.house_comps(parcel())
        self.assertEqual(result["psf"], 500)
        self.assertEqual(result["n"], 3)
        self.assertEqual(result["selectionPolicy"], HOUSE_COMP_POLICY["id"])
        self.assertEqual({row["apn"] for row in result["comps"]},
                         {"valid-a", "valid-b", "valid-c"})

    def test_new_build_filters_entire_population_before_median(self):
        rows = [county_sale(f"valid-{i}", 4000, price)
                for i, price in enumerate((1200000, 1600000, 2000000, 2400000))]
        rows += [county_sale(f"mansion-{i}", 6000, price)
                 for i, price in enumerate((4000000, 5000000, 6000000, 7000000, 8000000))]
        rows += [county_sale("costly-sized-home", 4000, 4000000)]
        with patch.object(offer, "_esri_query", return_value={"features": rows}) as network:
            result = offer.new_build_values(parcel())
        network.assert_called_once()
        self.assertEqual(result["n"], 4)
        self.assertEqual(result["psf"], 450)
        self.assertEqual(result["arv"], 1800000)
        self.assertEqual(result["selectionPolicy"], HOUSE_COMP_POLICY["id"])
        self.assertEqual({row["apn"] for row in result["examples"]},
                         {f"valid-{i}" for i in range(4)})


if __name__ == "__main__":
    unittest.main()
