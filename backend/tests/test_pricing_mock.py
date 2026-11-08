"""The pricing-service mock: golden cases, schema conformance and proposed-contract markers."""

import csv
import json
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from tests.pricing_mock.app import create_mock_app
from tests.pricing_mock.server import running

MOCK = Path(__file__).resolve().parent / "pricing_mock"
FLAGS = ["HIBPDX", "CHDDX", "CANCERDX", "ARTHDX", "ASTHDX", "CHOLDX", "OHRTDX"]
SCHEMA = json.loads((MOCK / "openapi.json").read_text(encoding="utf-8"))
JSON_TYPES = {"string": str, "number": (int, float), "integer": int, "array": list, "object": dict, "boolean": bool}


def call(base: str, method: str, path: str, body: dict | None = None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(base + path, data=data, method=method, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, {k.lower(): v for k, v in response.headers.items()}, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, {k.lower(): v for k, v in error.headers.items()}, json.load(error)


class MockTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.context = running(create_mock_app())
        cls.base = cls.context.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.context.__exit__(None, None, None)

    def test_all_golden_cases_match(self) -> None:
        with open(MOCK / "fixtures" / "golden_cases.csv", encoding="utf-8", newline="") as handle:
            cases = list(csv.DictReader(handle))
        self.assertEqual(len(cases), 33)
        for row in cases:
            profile = {"age": float(row["age"]), "region": row["region"], **{k: row[k] for k in FLAGS}}
            status, _, body = call(self.base, "POST", "/quote", profile)
            self.assertEqual(status, 200, row["case_id"])
            self.assertAlmostEqual(body["premium_usd"], float(row["expected_premium_usd"]), places=6, msg=row["case_id"])
            self.assertAlmostEqual(body["premium_illustrative_gbp"], float(row["expected_premium_gbp"]), places=6)

    def test_quote_response_matches_openapi_schema(self) -> None:
        schema = SCHEMA["components"]["schemas"]["QuoteResponse"]
        _, _, body = call(self.base, "POST", "/quote", {"age": 40.0, "region": "3", **{k: "0" for k in FLAGS}})
        for name in schema["required"]:
            self.assertIn(name, body)
        for name, spec in schema["properties"].items():
            kind = spec.get("type")
            if kind and body.get(name) is not None:
                self.assertIsInstance(body[name], JSON_TYPES[kind], name)

    def test_non_permitted_factor_and_unknown_profile_rejected(self) -> None:
        self.assertEqual(call(self.base, "POST", "/quote", {"age": 40, "region": "3", "sex": "1"})[0], 422)
        self.assertEqual(call(self.base, "POST", "/quote", {"age": 41.5, "region": "3"})[0], 422)

    def test_proposed_fields_are_marked(self) -> None:
        _, headers, model = call(self.base, "GET", "/model")
        self.assertEqual(headers["x-proposed-fields"], "all")
        self.assertIn("headline_ae", model)
        body = {
            "base_change": 0.04,
            "relativity_changes": [{"factor": "age", "level": "80+", "change": 0.1}],
            "cap": 0.12,
            "floor": 0.0,
        }
        _, headers, impact = call(self.base, "POST", "/scenario-impact", body)
        self.assertEqual(headers["x-proposed-fields"], "histogram,projected_ae")
        for key in ("totals", "histogram", "projected_ae"):
            self.assertIn(key, impact)

    def test_zero_change_scenario_and_cap_below_floor(self) -> None:
        _, _, impact = call(self.base, "POST", "/scenario-impact", {"base_change": 0.0})
        self.assertAlmostEqual(impact["totals"]["change_pct"], 0.0)
        self.assertEqual(call(self.base, "POST", "/scenario-impact", {"cap": 0.01, "floor": 0.05})[0], 422)

    def test_relativities_and_monitoring(self) -> None:
        _, _, rel = call(self.base, "GET", "/relativities?factor=age")
        self.assertTrue(all(r["factor"] == "age" for r in rel["relativities"]))
        self.assertEqual(call(self.base, "GET", "/relativities?factor=nope")[0], 404)
        _, _, mon = call(self.base, "GET", "/monitoring")
        self.assertTrue(mon["ae"] and mon["psi"])


if __name__ == "__main__":
    unittest.main()
