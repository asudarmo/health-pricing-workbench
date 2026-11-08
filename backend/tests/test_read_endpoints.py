"""Model, relativities, monitoring and quote endpoints against the pricing mock."""

import unittest

from tests.helpers import Stack, request

CONDITIONS = {
    key: "absent"
    for key in ("cond_hbp", "cond_chd", "cond_ohd", "cond_chol", "cond_cancer", "cond_arthritis", "cond_asthma")
}


class ReadEndpointsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.stack = Stack().__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.stack.__exit__(None, None, None)

    def test_endpoints_need_a_token(self) -> None:
        for method, path in (("GET", "/api/model"), ("GET", "/api/relativities"), ("GET", "/api/monitoring"), ("POST", "/api/quotes")):
            body = {} if method == "POST" else None
            self.assertEqual(request(self.stack.base, method, path, body)[0], 401, path)

    def test_relativities_mapped_to_frontend_shape(self) -> None:
        status, rows = self.stack.get("/api/relativities")
        self.assertEqual(status, 200)
        self.assertEqual(set(rows[0]), {"factor", "level", "relativity", "exposure", "lower", "upper"})
        cancer = next(r for r in rows if r["factor"] == "cond_cancer" and r["level"] == "present")
        self.assertAlmostEqual(cancer["relativity"], 1.767, places=3)
        self.assertIsNotNone(cancer["lower"])
        self.assertIn("Northeast", {r["level"] for r in rows if r["factor"] == "region"})

    def test_model_info(self) -> None:
        status, model = self.stack.get("/api/model")
        self.assertEqual(status, 200)
        self.assertEqual((model["id"], model["currency"]), ("v1", "GBP"))
        self.assertAlmostEqual(model["baseRate"], 1974.77 * 0.244, places=1)
        self.assertEqual([f["key"] for f in model["factors"]][:3], ["age", "region", "cond_hbp"])
        self.assertEqual(model["recalibrationFlagCount"], 1)
        self.assertIn("illustrative", model["illustrativeLabel"])
        self.assertIn("576", model["scalingNote"])

    def test_monitoring_mapped(self) -> None:
        status, mon = self.stack.get("/api/monitoring")
        self.assertEqual(status, 200)
        self.assertEqual(set(mon["ae"][0]), {"factor", "level", "segment", "period", "actual", "expected", "exposure", "ae"})
        self.assertEqual(mon["flags"][0]["gapType"], "level shift")
        self.assertTrue(mon["psi"])

    def test_quote_matches_golden_case_and_steps_multiply_through(self) -> None:
        status, quote = self.stack.post("/api/quotes", {"age": 40, "selections": {"region": "South", **CONDITIONS}})
        self.assertEqual(status, 200)
        self.assertAlmostEqual(quote["riskPremium"], 357.46, places=2)  # golden case G01 in illustrative pounds
        self.assertAlmostEqual(quote["steps"][-1]["runningAmount"], quote["riskPremium"], places=1)
        self.assertEqual((quote["steps"][0]["factor"], quote["steps"][0]["level"]), ("age", "40-44"))
        self.assertIn("illustrative", quote["illustrativeLabel"])

    def test_quote_rejects_non_permitted_and_unknown_inputs(self) -> None:
        for key in ("sex", "race", "income", "education"):
            status, body = self.stack.post("/api/quotes", {"age": 40, "selections": {"region": "South", key: "x"}})
            self.assertEqual(status, 422, key)
            self.assertIn("not a permitted", body["detail"])
        self.assertEqual(self.stack.post("/api/quotes", {"age": 40, "selections": {"region": "Atlantis"}})[0], 422)
        self.assertEqual(self.stack.post("/api/quotes", {"age": 40, "selections": {}})[0], 422)  # region required


class PricingDownTest(unittest.TestCase):
    def test_pricing_service_down_gives_502(self) -> None:
        with Stack(pricing_url="http://127.0.0.1:9") as stack:
            for path in ("/api/model", "/api/relativities", "/api/monitoring"):
                status, body = stack.get(path)
                self.assertEqual((status, body["detail"]), (502, "Pricing service unavailable"), path)
            status, _ = stack.post("/api/quotes", {"age": 40, "selections": {"region": "South"}})
            self.assertEqual(status, 502)


if __name__ == "__main__":
    unittest.main()
