"""Offline underwriting and GIS failure tests: python3 -m unittest discover -s tests."""
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agents" / "phx_land_leads"))
import comps
import offer
import verdict
from house_comp_policy import HOUSE_COMP_POLICY

FIXTURES = json.loads((Path(__file__).with_name("underwriting-fixtures.json")).read_text())["cases"]
CLOUD_OVERRIDE = verdict.OVERRIDES["20338004C"]


def lead():
    return dict(apn="20338004C", landUseClass="residential", currentZoning="R1-10", landSf=145627,
                parcelStatus="improved", defaultDemoCost=45000, floodKnown=True,
                valuation={"mostLikelyValue": 900000}, assessedValue=168400,
                lat=33.8, lng=-112.1,
                houseComps={"psf": 600, "n": 5, "radiusMi": 1, "retrievedAt": "2026-10-17T12:00:00Z",
                            "selectionPolicy": HOUSE_COMP_POLICY["id"]},
                newBuild={"psf": 450, "n": 12, "radiusMi": 1, "selectionPolicy": HOUSE_COMP_POLICY["id"]})


class EconomicsTests(unittest.TestCase):
    def test_shared_numeric_fixtures(self):
        for case in FIXTURES:
            with self.subTest(case=case["name"]):
                actual = verdict.home_econ(case["input"])
                actual["maxLand"] = verdict.supportable_land(case["input"], case["target"])
                for key, expected in case["expected"].items():
                    self.assertAlmostEqual(actual[key], expected, delta=1e-6, msg=key)
                # The signed land budget must reproduce the requested margin.
                at_offer = verdict.home_econ({**case["input"], "land": actual["maxLand"]})
                self.assertAlmostEqual(at_offer["margin"], case["target"], places=10)

    def test_maybe_requires_high_cost_break_even(self):
        self.assertEqual(verdict.verdict_label(-1, -0.00001, 0.20, "Low"), "Pass")
        self.assertEqual(verdict.verdict_label(0, 0, 0.10, "Low"), "Maybe")
        self.assertEqual(verdict.verdict_label(1, 0.05, 0.01, "High"), "Maybe")
        self.assertEqual(verdict.verdict_label(1, 0.049, 0.099, "Low"), "Pass")
        self.assertEqual(verdict.verdict_label(100, 0.10, 0.20, "Medium"), "Good")

    def test_underwrite_matches_split_fixture_and_signed_offer(self):
        parcel = lead()
        with patch.object(verdict, "_esri_query") as network:
            result = verdict.underwrite(parcel, fetch_comps=False)
        network.assert_not_called()
        self.assertEqual(result["strategy"], "4 homes")
        self.assertEqual(result["profit"], 1509446)
        self.assertEqual(result["finished"], 8208000)
        # At the 90% split factor the max offer and profit both favor 4 homes.
        self.assertEqual(result["supportableOffer"], 1178594)
        self.assertEqual(result["offerHomes"], 4)
        self.assertEqual(result["land"], 535000)
        self.assertEqual(parcel["landPriceOverride"]["priceType"], "recorded historical sale")

    def test_commercial_zoning_blocks_residential_verdict(self):
        parcel = lead()
        parcel["currentZoning"] = "CP/GCP"
        self.assertIsNone(verdict.underwrite(parcel, fetch_comps=False))

    def test_split_cap_and_shared_usable_area(self):
        self.assertEqual(verdict.split_n({"currentZoning": "R1-10", "landSf": 1000000}), (4, True))
        self.assertEqual(verdict.split_n({"currentZoning": "R1-10", "landSf": 23529}), (1, True))
        self.assertEqual(verdict.split_n({"landSf": 145627}), (4, False))

    def test_east_min_lot_and_byright_units(self):
        import find_leads
        self.assertEqual(find_leads.min_lot_sf("NO CITY/TOWN", "RU-43"), (43560, True))
        self.assertEqual(find_leads.min_lot_sf("SCOTTSDALE", "R1-70 ESL FO"), (70000, False))
        self.assertEqual(find_leads.min_lot_sf("SCOTTSDALE", "HC ESL"), (None, False))
        self.assertEqual(find_leads.byright_units_from_min_lot(2.58, 43560), 2)   # floor(2.58*0.85)
        self.assertEqual(find_leads.byright_units_from_min_lot(1.0, 190000), 1)   # undersized lot of record
        self.assertEqual(verdict.split_n({"currentZoning": "RU-43", "minLotSf": 43560, "landSf": 112385}), (2, True))


class ReviewRegressionTests(unittest.TestCase):
    def test_shared_risk_cases(self):
        cases=json.loads((Path(__file__).with_name("underwriting-fixtures.json")).read_text())["riskCases"]
        for case in cases:
            with self.subTest(case=case["name"]):
                parcel=lead()
                parcel.update(currentZoning="R1-100",landSf=10000,floodKnown=case["floodKnown"])
                parcel["houseComps"].update(psf=case["psf"],n=case["n"])
                self.assertEqual(verdict.underwrite(parcel,fetch_comps=False)["risk"],case["risk"])

    def test_median_stress_does_not_change_primary_verdict(self):
        parcel=lead(); parcel["houseComps"].update(psf=700,medPsf=300)
        result=verdict.underwrite(parcel,fetch_comps=False)
        self.assertEqual(result["salePsf"],700)
        self.assertTrue(result["medianStress"]["fragile"])
        self.assertFalse(result["capacityConfirmed"])

    def test_land_lookup_error_remains_distinct_from_no_sales(self):
        with patch.object(comps,"_esri_query",return_value={"_failed":True,"_error":"HTTP 503"}):
            result=comps.build_comps_for_lead(lead())
        self.assertIsNone(result["valuation"])
        self.assertEqual(result["error"],"HTTP 503")
        self.assertTrue(result["retrievedAt"])
        with patch.object(comps,"_esri_query",return_value={"features":[]}):
            empty=comps.build_comps_for_lead(lead())
        self.assertIsNone(empty["error"])

    def test_failed_new_build_result_is_stored_without_usable_price(self):
        parcel=lead(); parcel["score"]=100
        with patch.object(offer,"_esri_query",return_value={"_failed":True,"_error":"HTTP 503"}):
            offer.attach_new_build_values([parcel])
        self.assertIsNone(parcel["newBuild"])
        self.assertEqual(parcel["newBuildLookup"]["error"],"HTTP 503")


class OverrideTests(unittest.TestCase):
    def test_valid_cloud_source_dates(self):
        self.assertEqual(verdict.validate_override(CLOUD_OVERRIDE), CLOUD_OVERRIDE)
        self.assertEqual(CLOUD_OVERRIDE["landCost"], 535000)
        self.assertEqual(CLOUD_OVERRIDE["priceDate"], "2026-04-01")
        self.assertEqual(CLOUD_OVERRIDE["observedAt"], "2026-10-18")

    def test_invalid_override_is_visible_and_clears_stale_number(self):
        for patch_value in ({"source": ""}, {"sourceUrl": "javascript:alert(1)"}, {"priceDate": "04/01/2026"},
                            {"observedAt": "2026-02-30"}, {"landCost": -1}, {"landCost": float("nan")}, {"landCost": True}):
            with self.subTest(patch_value=patch_value):
                parcel = lead()
                parcel["landOverride"] = 1
                result = verdict.underwrite(parcel, fetch_comps=False,
                                           overrides={parcel["apn"]: {**CLOUD_OVERRIDE, **patch_value}})
                self.assertIsNone(parcel["landOverride"])
                self.assertIsNone(parcel["landPriceOverride"])
                self.assertTrue(parcel["landPriceOverrideError"])
                self.assertEqual(result["land"], 900000)

    def test_legacy_unsourced_override_is_rejected(self):
        with self.assertRaises(ValueError):
            verdict.validate_override({"landCost": 535000, "note": "legacy unsourced number"})

    def test_override_stamped_even_without_comps(self):
        parcel = lead()
        parcel.pop("houseComps")
        parcel.pop("newBuild")
        self.assertIsNone(verdict.underwrite(parcel, fetch_comps=False))
        self.assertEqual(parcel["landOverride"], 535000)
        self.assertEqual(parcel["landPriceOverride"]["sourceUrl"], CLOUD_OVERRIDE["sourceUrl"])

    def test_unreliable_valuation_gives_no_verdict(self):
        parcel = lead()
        parcel["valuation"]["unreliable"] = True
        self.assertIsNone(verdict.underwrite(parcel, fetch_comps=False, overrides={}))


class CompMetadataTests(unittest.TestCase):
    def test_cached_recalculation_preserves_error_source_and_time(self):
        parcel = lead()
        parcel["houseComps"] = {"psf": 450, "n": 12, "radiusMi": 1, "source": "Stored fallback source",
                              "sourceUrl": "https://county.example/record", "retrievedAt": "2026-09-30T10:00:00Z",
                              "fellBack": True, "error": "Previous county GIS HTTP 503",
                              "fallbackReason": "Previous lookup failed", "lookupAttemptedAt": "2026-10-01T10:00:00Z",
                              "selectionPolicy": HOUSE_COMP_POLICY["id"]}
        data = {"leads": [parcel]}
        with patch.object(verdict, "_esri_query") as network:
            counts = verdict.recalculate_data(data, cached=True)
        network.assert_not_called()
        self.assertEqual(sum(counts.values()), 1)
        self.assertEqual(parcel["houseComps"]["source"], "Stored fallback source")
        self.assertEqual(parcel["houseComps"]["retrievedAt"], "2026-09-30T10:00:00Z")
        self.assertEqual(parcel["houseComps"]["lookupAttemptedAt"], "2026-10-01T10:00:00Z")
        self.assertEqual(parcel["verdict"]["compError"], "Previous county GIS HTTP 503")
        self.assertEqual(parcel["verdict"]["compFallbackReason"], "Previous lookup failed")

    def test_county_arcgis_error_survives_new_build_fallback(self):
        parcel = lead()
        with patch.object(verdict, "_esri_query", return_value={"error": {"code": 503, "message": "County GIS unavailable"}}):
            result = verdict.underwrite(parcel)
        hc = parcel["houseComps"]
        self.assertTrue(hc["fellBack"])
        self.assertEqual(hc["psf"], 450)
        self.assertEqual(hc["error"], "County GIS unavailable")
        self.assertEqual(hc["fallbackReason"], "County GIS unavailable")
        self.assertIn("stored new-build", hc["source"])
        self.assertTrue(hc["lookupAttemptedAt"])
        self.assertIsNone(hc["retrievedAt"])  # Do not invent an old fallback's retrieval time.
        self.assertTrue(result["compFellBack"])
        self.assertEqual(result["compError"], hc["error"])

    def test_no_sales_is_distinguished_from_error(self):
        parcel = lead()
        with patch.object(verdict, "_esri_query", return_value={"features": []}):
            result = verdict.underwrite(parcel)
        self.assertTrue(result["compFellBack"])
        self.assertIsNone(result["compError"])
        self.assertIn("Fewer than 3 home sales", result["compFallbackReason"])

    def test_error_without_fallback_remains_on_lead(self):
        parcel = lead()
        parcel.pop("newBuild")
        with patch.object(verdict, "_esri_query", side_effect=TimeoutError("timed out")):
            self.assertIsNone(verdict.underwrite(parcel))
        self.assertIn("TimeoutError", parcel["houseComps"]["error"])
        self.assertFalse(parcel["houseComps"]["fellBack"])

    def test_stored_success_has_metadata_without_inventing_retrieval_date(self):
        parcel = lead()
        parcel["houseComps"].pop("retrievedAt")
        result = verdict.underwrite(parcel, fetch_comps=False)
        self.assertFalse(result["compFellBack"])
        self.assertIsNone(result["compRetrievedAt"])
        self.assertTrue(result["compSourceUrl"])

    def test_fallback_uses_fallback_sample_size_for_risk(self):
        parcel = lead()
        parcel["currentZoning"] = "R1-100"
        parcel.pop("houseComps")
        parcel["newBuild"] = {"psf": 450, "n": 5, "radiusMi": 1, "selectionPolicy": HOUSE_COMP_POLICY["id"]}
        result = verdict.underwrite(parcel, fetch_comps=False)
        self.assertTrue(result["compFellBack"])
        self.assertEqual(result["risk"], "Low")
        parcel["floodKnown"] = False
        result = verdict.underwrite(parcel, fetch_comps=False)
        self.assertEqual(result["risk"], "Medium")

    def test_successful_comp_query_records_source_and_selection(self):
        parcel = lead()
        rows = [{"attributes": {"APN": f"comp-{i}", "LIVING_SPACE": 4000, "SALE_PRICE": price,
                  "LAND_SIZE": 145627, "CONST_YEAR": 2025, "LATITUDE": 33.8, "LONGITUDE": -112.1,
                  "SALE_DATE": "04/01/2026", "PHYSICAL_ADDRESS": f"{i} Sample Rd"}}
                for i, price in enumerate((800000, 900000, 1000000, 1100000, 1200000))]
        with patch.object(verdict, "_esri_query", return_value={"features": rows}):
            result = verdict.house_comps(parcel)
        self.assertEqual(result["psf"], 275)
        self.assertEqual(result["medPsf"], 250)
        self.assertEqual(result["selectionPolicy"], HOUSE_COMP_POLICY["id"])
        self.assertEqual(result["comps"][0]["apn"], "comp-0")
        self.assertEqual(result["comps"][0]["yearBuilt"], 2025)
        self.assertEqual(result["comps"][0]["distanceMi"], 0)
        self.assertFalse(result["fellBack"])
        self.assertIsNone(result["error"])
        self.assertTrue(result["retrievedAt"].endswith("Z"))


class CountyHttpTests(unittest.TestCase):
    def test_non_object_json_is_a_visible_failure(self):
        response = Mock(status=200)
        response.read.return_value = b'[]'
        connection = Mock()
        connection.getresponse.return_value = response
        with patch.object(comps, "_get_conn", return_value=connection):
            result = comps._esri_query({})
        self.assertTrue(result["_failed"])
        self.assertIn("instead of a result object", result["_error"])

    def test_non_200_status_is_failure(self):
        response = Mock(status=503, reason="Service Unavailable")
        response.read.return_value = b'{"features": []}'
        connection = Mock()
        connection.getresponse.return_value = response
        with patch.object(comps, "_get_conn", return_value=connection):
            result = comps._esri_query({})
        self.assertTrue(result["_failed"])
        self.assertIn("HTTP 503", result["_error"])

    def test_http_200_arcgis_error_is_failure(self):
        response = Mock(status=200)
        response.read.return_value = b'{"error": {"code": 400, "message": "Invalid geometry"}}'
        connection = Mock()
        connection.getresponse.return_value = response
        with patch.object(comps, "_get_conn", return_value=connection):
            result = comps._esri_query({})
        self.assertTrue(result["_failed"])
        self.assertEqual(result["_error"], "Invalid geometry")


class NewBuildMetadataTests(unittest.TestCase):
    def test_fresh_new_build_result_records_actual_retrieval_time(self):
        rows = [{"attributes": {"LIVING_SPACE": 4000, "SALE_PRICE": price,
                 "CONST_YEAR": 2025, "LATITUDE": 33.8, "LONGITUDE": -112.1,
                 "SALE_DATE": "04/01/2026", "PHYSICAL_ADDRESS": f"{i} Sample Rd"}}
                for i, price in enumerate((800000, 900000, 1000000, 1100000))]
        with patch.object(offer, "_esri_query", return_value={"features": rows}) as network:
            result = offer.new_build_values(lead())
        network.assert_called_once()
        self.assertEqual(result["psf"], 238)
        self.assertEqual(result["selectionPolicy"], HOUSE_COMP_POLICY["id"])
        self.assertEqual(result["sourceUrl"], comps.MARICOPA_PARCELS)
        self.assertIn("new-build", result["source"])
        self.assertTrue(result["retrievedAt"].endswith("Z"))
        self.assertFalse(result["fellBack"])
        self.assertIsNone(result["error"])
        # Verdict fallback keeps this real source timestamp instead of inventing one.
        parcel = lead()
        parcel.pop("houseComps")
        parcel["newBuild"] = result
        verdict.underwrite(parcel, fetch_comps=False)
        self.assertEqual(parcel["houseComps"]["retrievedAt"], result["retrievedAt"])
        self.assertTrue(parcel["houseComps"]["fellBack"])

    def test_failed_new_build_query_stops_before_larger_radii(self):
        with patch.object(offer, "_esri_query", return_value={"error": {"message": "GIS unavailable"}}) as network:
            self.assertEqual(offer.new_build_values(lead())["error"], "{'message': 'GIS unavailable'}")
        network.assert_called_once()


if __name__ == "__main__":
    unittest.main()
