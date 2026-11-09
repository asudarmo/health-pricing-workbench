"""The committed API contract (api/openapi.json) matches the app, and every endpoint states roles and errors."""

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from export_openapi import TARGET, contract_text  # noqa: E402

METHODS = {"get", "post", "put", "delete", "patch"}
PUBLIC = {("post", "/api/auth/login"), ("get", "/api/health")}


def operations(spec: dict):
    for path, item in spec["paths"].items():
        for method, op in item.items():
            if method in METHODS:
                yield method, path, op


class OpenApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.spec = json.loads(contract_text())

    def test_committed_file_is_up_to_date(self) -> None:
        self.assertEqual(
            TARGET.read_text(encoding="utf-8"),
            contract_text(),
            "api/openapi.json is out of date: run `python tools/export_openapi.py` from backend/",
        )

    def test_every_api_operation_states_roles(self) -> None:
        ops = [(m, p, o) for m, p, o in operations(self.spec) if p.startswith("/api") and (m, p) != ("get", "/api/health")]
        self.assertEqual(len(ops), 15)  # the 14 calls in client.ts plus GET /api/auth/me
        for method, path, op in ops:
            self.assertIn("x-roles", op, f"{method} {path}")
            if (method, path) in PUBLIC:
                self.assertEqual(op["x-roles"], [], f"{method} {path}")
            else:
                self.assertTrue(set(op["x-roles"]) <= {"Analyst", "Reviewer"} and op["x-roles"], f"{method} {path}")

    def test_roles_match_the_plan(self) -> None:
        roles = {(m, p): o["x-roles"] for m, p, o in operations(self.spec) if "x-roles" in o}
        self.assertEqual(roles[("post", "/api/scenarios/{scenario_id}/submit")], ["Analyst"])
        self.assertEqual(roles[("post", "/api/scenarios/{scenario_id}/approve")], ["Reviewer"])
        self.assertEqual(roles[("post", "/api/scenarios/{scenario_id}/reject")], ["Reviewer"])
        self.assertEqual(roles[("put", "/api/scenarios/{scenario_id}")], ["Analyst", "Reviewer"])

    def test_errors_are_documented(self) -> None:
        for method, path, op in operations(self.spec):
            if not path.startswith("/api") or (method, path) in PUBLIC | {("get", "/api/health")}:
                continue
            codes = set(op["responses"])
            self.assertIn("401", codes, f"{method} {path}")
            if "{scenario_id}" in path:
                self.assertIn("404", codes, f"{method} {path}")
            if method in ("post", "put") and "x-roles" in op and path != "/api/auth/login":
                self.assertIn("422", codes, f"{method} {path}")
        decisions = {p: set(o["responses"]) for m, p, o in operations(self.spec) if p.endswith(("/approve", "/reject", "/submit"))}
        for path, codes in decisions.items():
            self.assertTrue({"403", "409"} <= codes, path)

    def test_responses_have_schemas(self) -> None:
        for method, path, op in operations(self.spec):
            if not path.startswith("/api") or path == "/api/health":
                continue
            ok = next(c for c in op["responses"] if c.startswith("2"))
            self.assertIn("schema", op["responses"][ok]["content"]["application/json"], f"{method} {path}")


if __name__ == "__main__":
    unittest.main()
