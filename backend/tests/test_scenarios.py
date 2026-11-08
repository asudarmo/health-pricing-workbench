"""Scenario storage, the draft-only editing rule and the audit entries written on create and edit."""

import json
import unittest
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Scenario
from tests.helpers import Stack, request

# Both parameter sets are recorded in the pricing mock (see tools/record_fixtures.py).
CURRENT_80_PLUS = next(
    r["relativity"]
    for r in json.loads((Path(__file__).parent / "pricing_mock" / "fixtures" / "relativities.json").read_text())["relativities"]
    if r["factor"] == "age" and r["level"] == "80+"
)
PARAMS = {
    "baseRateChangePct": 4,
    "relativityChanges": [{"factor": "age", "level": "80+", "newRelativity": CURRENT_80_PLUS * 1.1}],
    "capPct": 12,
    "floorPct": 0,
}
ZERO_PARAMS = {"baseRateChangePct": 0, "relativityChanges": [], "capPct": 15, "floorPct": 10}
BODY = {"name": "Test scenario", "rationale": "A/E 1.12 on 5,474 lives of exposure.", "params": PARAMS}


class ScenarioTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.stack = Stack().__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.stack.__exit__(None, None, None)

    def create(self, **changes) -> dict:
        status, body = self.stack.post("/api/scenarios", {**BODY, **changes})
        self.assertEqual(status, 201, body)
        return body

    def force_status(self, scenario_id: str, status: str) -> None:
        with Session(self.stack.app.state.engine) as db:
            db.get(Scenario, int(scenario_id.removeprefix("sc-"))).status = status
            db.commit()

    def test_create_starts_as_draft_with_author_and_timestamp(self) -> None:
        # A status in the request body is ignored.
        status, body = self.stack.post("/api/scenarios", {**BODY, "status": "Approved"}, role="Analyst")
        self.assertEqual(status, 201)
        self.assertEqual((body["status"], body["author"]), ("Draft", "Demo Analyst"))
        self.assertTrue(body["id"].startswith("sc-") and body["updatedAt"].endswith("Z"))
        self.assertEqual(body["params"], PARAMS)
        self.assertGreater(body["impact"]["averageChangePct"], 4)  # impact is stored with the scenario
        self.assertIsNone(body["reviewComment"])
        self.assertEqual(self.stack.post("/api/scenarios", BODY, role="Reviewer")[1]["author"], "Demo Reviewer")

    def test_list_and_read(self) -> None:
        created = self.create(name="Listed one")
        _, rows = self.stack.get("/api/scenarios")
        self.assertIn(created["id"], [r["id"] for r in rows])
        self.assertEqual(set(rows[0]), {"id", "name", "status", "author", "updatedAt"})
        status, one = self.stack.get(f"/api/scenarios/{created['id']}")
        self.assertEqual((status, one["name"], one["rationale"]), (200, "Listed one", BODY["rationale"]))
        for bad in ("sc-999999", "nonsense", "sc-abc", "sc-%C2%B2", "sc-" + "9" * 23, "sc--1", "sc-1e3"):
            self.assertEqual(self.stack.get(f"/api/scenarios/{bad}")[0], 404, bad)

    def test_create_writes_audit_entry(self) -> None:
        created = self.create()
        _, audit = self.stack.get(f"/api/scenarios/{created['id']}/audit")
        self.assertEqual(len(audit), 1)
        self.assertEqual(
            (audit[0]["actor"], audit[0]["action"], audit[0]["fromStatus"], audit[0]["toStatus"]),
            ("Demo Analyst", "Created draft", None, "Draft"),
        )

    def test_edit_draft_updates_and_writes_audit_entry(self) -> None:
        created = self.create()
        changed = {**BODY, "name": "Renamed", "params": ZERO_PARAMS}
        status, updated = self.stack.put(f"/api/scenarios/{created['id']}", changed, role="Reviewer")
        self.assertEqual((status, updated["name"], updated["params"]["capPct"], updated["status"]), (200, "Renamed", 15, "Draft"))
        self.assertEqual(updated["impact"]["averageChangePct"], 0)  # impact recomputed on save
        self.assertEqual(updated["author"], "Demo Analyst")  # the author does not change
        _, audit = self.stack.get(f"/api/scenarios/{created['id']}/audit")
        self.assertEqual([(a["action"], a["actor"]) for a in audit], [("Created draft", "Demo Analyst"), ("Edited draft", "Demo Reviewer")])

    def check_locked(self, locked_status: str) -> None:
        created = self.create(name=f"Will be {locked_status}")
        self.force_status(created["id"], locked_status)
        status, body = self.stack.put(f"/api/scenarios/{created['id']}", {**BODY, "name": "Changed"})
        self.assertEqual(status, 409, body)
        self.assertIn(locked_status, body["detail"])
        _, after = self.stack.get(f"/api/scenarios/{created['id']}")
        self.assertEqual((after["name"], after["status"]), (f"Will be {locked_status}", locked_status))
        self.assertEqual(len(self.stack.get(f"/api/scenarios/{created['id']}/audit")[1]), 1)  # no entry for the refused edit

    def test_edit_submitted_returns_409(self) -> None:
        self.check_locked("Submitted")

    def test_edit_approved_returns_409(self) -> None:
        self.check_locked("Approved")

    def test_edit_rejected_returns_409(self) -> None:
        self.check_locked("Rejected")

    def test_edit_unknown_scenario_is_404(self) -> None:
        self.assertEqual(self.stack.put("/api/scenarios/sc-999999", BODY)[0], 404)

    def test_invalid_input_is_422_and_stores_nothing(self) -> None:
        with Session(self.stack.app.state.engine) as db:
            before = len(db.scalars(select(Scenario)).all())
        bad_bodies = [
            {**BODY, "name": ""},
            {**BODY, "params": {**PARAMS, "capPct": -1}},
            {**BODY, "params": {**PARAMS, "floorPct": 101}},
            {**BODY, "params": {**PARAMS, "relativityChanges": [{"factor": "age", "level": "80+", "newRelativity": 0}]}},
            {"name": "No params"},
            {**BODY, "name": "   "},
            {**BODY, "params": {**PARAMS, "baseRateChangePct": float("nan")}},
            {**BODY, "params": {**PARAMS, "capPct": float("inf")}},
        ]
        for body in bad_bodies:
            self.assertEqual(self.stack.post("/api/scenarios", body)[0], 422, body)
        with Session(self.stack.app.state.engine) as db:
            self.assertEqual(len(db.scalars(select(Scenario)).all()), before)

    def test_endpoints_need_a_token(self) -> None:
        for method, path in (("GET", "/api/scenarios"), ("POST", "/api/scenarios"), ("PUT", "/api/scenarios/sc-1"), ("GET", "/api/scenarios/sc-1/audit")):
            self.assertEqual(request(self.stack.base, method, path, BODY if method != "GET" else None)[0], 401, path)


if __name__ == "__main__":
    unittest.main()
