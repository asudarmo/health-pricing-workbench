"""Scenario impact: mapping to the pricing-service request, the response shape, and failure cases."""

import json
import time
import unittest
from pathlib import Path

from app.impact import to_service_request
from tests.helpers import Stack, request
from tests.test_scenarios import CURRENT_80_PLUS, PARAMS, ZERO_PARAMS

IMPACT_KEYS = {"averageChangePct", "histogram", "cappedPolicies", "flooredPolicies", "projectedAE", "affectedSegments"}


class MappingTest(unittest.TestCase):
    def test_percentages_become_fractions_and_floor_becomes_negative(self) -> None:
        current = {("age", "80+"): 0.96}
        params = {
            "baseRateChangePct": 4,
            "relativityChanges": [{"factor": "age", "level": "80+", "newRelativity": 1.056}],
            "capPct": 12,
            "floorPct": 5,
        }
        out = to_service_request(params, current)
        self.assertEqual((out["base_change"], out["cap"], out["floor"]), (0.04, 0.12, -0.05))
        self.assertEqual(out["relativity_changes"], [{"factor": "age", "level": "80+", "change": 0.1}])

    def test_condition_and_region_levels_use_service_codes(self) -> None:
        current = {("cond_cancer", "present"): 1.767, ("region", "West"): 1.09}
        params = {
            "baseRateChangePct": 0,
            "relativityChanges": [
                {"factor": "cond_cancer", "level": "present", "newRelativity": 1.767},
                {"factor": "region", "level": "West", "newRelativity": 1.09},
            ],
            "capPct": 15,
            "floorPct": 10,
        }
        changes = to_service_request(params, current)["relativity_changes"]
        self.assertEqual([(c["factor"], c["level"], c["change"]) for c in changes], [("CANCERDX", "1", 0.0), ("region", "4", 0.0)])


class ImpactEndpointTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.stack = Stack().__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.stack.__exit__(None, None, None)

    def test_impact_matches_frontend_type(self) -> None:
        status, impact = self.stack.post("/api/scenarios/impact", {"params": PARAMS})
        self.assertEqual(status, 200, impact)
        self.assertEqual(set(impact), IMPACT_KEYS)
        self.assertAlmostEqual(impact["averageChangePct"], 4.94, places=2)
        self.assertEqual(set(impact["histogram"][0]), {"bucket", "policies"})
        self.assertAlmostEqual(sum(b["policies"] for b in impact["histogram"]), 21541.1, delta=0.5)  # the whole book
        self.assertEqual((impact["cappedPolicies"], impact["flooredPolicies"]), (34, 0))
        self.assertTrue(impact["affectedSegments"])
        self.assertEqual(set(impact["affectedSegments"][0]), {"segment", "averageChangePct"})

    def test_zero_change_leaves_the_book_unchanged(self) -> None:
        status, impact = self.stack.post("/api/scenarios/impact", {"params": ZERO_PARAMS})
        self.assertEqual(status, 200)
        self.assertAlmostEqual(impact["averageChangePct"], 0.0)
        self.assertEqual((impact["cappedPolicies"], impact["flooredPolicies"], impact["affectedSegments"]), (0, 0, []))
        zero_buckets = [b for b in impact["histogram"] if b["policies"] > 0]
        self.assertEqual(len(zero_buckets), 1)  # every cell sits in the 0 % bucket
        self.assertEqual(zero_buckets[0]["bucket"], "0% to 2%")

    def test_unknown_factor_level_and_bad_relativity_are_422(self) -> None:
        bad = {**ZERO_PARAMS, "relativityChanges": [{"factor": "age", "level": "99+", "newRelativity": 1.0}]}
        self.assertEqual(self.stack.post("/api/scenarios/impact", {"params": bad})[0], 422)
        bad = {**ZERO_PARAMS, "relativityChanges": [{"factor": "nope", "level": "x", "newRelativity": 1.0}]}
        self.assertEqual(self.stack.post("/api/scenarios/impact", {"params": bad})[0], 422)
        bad = {**ZERO_PARAMS, "relativityChanges": [{"factor": "age", "level": "80+", "newRelativity": -1}]}
        self.assertEqual(self.stack.post("/api/scenarios/impact", {"params": bad})[0], 422)
        self.assertEqual(self.stack.post("/api/scenarios/impact", {"params": {**ZERO_PARAMS, "capPct": -5}})[0], 422)

    def test_needs_a_token_and_survives_no_state(self) -> None:
        self.assertEqual(request(self.stack.base, "POST", "/api/scenarios/impact", {"params": ZERO_PARAMS})[0], 401)

    def test_response_time_with_mock_is_well_under_budget(self) -> None:
        start = time.perf_counter()
        self.stack.post("/api/scenarios/impact", {"params": PARAMS})
        self.assertLess(time.perf_counter() - start, 3.0)  # real service measured separately: about 25 ms

    def test_pricing_down_gives_502_and_saves_nothing(self) -> None:
        with Stack(pricing_url="http://127.0.0.1:9") as down:
            self.assertEqual(down.post("/api/scenarios/impact", {"params": ZERO_PARAMS})[0], 502)
            self.assertEqual(down.post("/api/scenarios", {"name": "x", "rationale": "", "params": ZERO_PARAMS})[0], 502)
            self.assertEqual(down.get("/api/scenarios")[1], [])


if __name__ == "__main__":
    unittest.main()
