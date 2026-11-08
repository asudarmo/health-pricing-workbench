"""Submit, approve and reject: roles, allowed transitions, comments, audit trail and the four-eyes rule."""

import unittest

from sqlalchemy.orm import Session

from app.models import AuditEntry, Scenario
from tests.helpers import Stack, request
from tests.test_scenarios import BODY

STATUSES = ["Draft", "Submitted", "Approved", "Rejected"]
ALLOWED = {("Draft", "Submitted"), ("Submitted", "Approved"), ("Submitted", "Rejected")}


class WorkflowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.stack = Stack().__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.stack.__exit__(None, None, None)

    def draft(self, role: str = "Analyst") -> str:
        status, body = self.stack.post("/api/scenarios", BODY, role=role)
        self.assertEqual(status, 201, body)
        return body["id"]

    def force(self, scenario_id: str, status: str, extra_audit: tuple[str, str] | None = None) -> None:
        with Session(self.stack.app.state.engine) as db:
            row = db.get(Scenario, int(scenario_id.removeprefix("sc-")))
            row.status = status
            if extra_audit:
                db.add(AuditEntry(scenario=row, actor=extra_audit[0], action=extra_audit[1], from_status="Draft", to_status="Draft"))
            db.commit()

    def audit(self, scenario_id: str) -> list[dict]:
        return self.stack.get(f"/api/scenarios/{scenario_id}/audit")[1]

    def attempt(self, scenario_id: str, to: str, comment: str = "Reviewed against the A/E evidence."):
        if to == "Submitted":
            return self.stack.post(f"/api/scenarios/{scenario_id}/submit", role="Analyst")
        if to == "Draft":
            return self.stack.post(f"/api/scenarios/{scenario_id}/draft", role="Analyst")  # no such endpoint
        verb = "approve" if to == "Approved" else "reject"
        return self.stack.post(f"/api/scenarios/{scenario_id}/{verb}", {"comment": comment}, role="Reviewer")

    def test_all_sixteen_transitions(self) -> None:
        for start in STATUSES:
            for to in STATUSES:
                with self.subTest(start=start, to=to):
                    scenario_id = self.draft()
                    self.force(scenario_id, start)
                    before = len(self.audit(scenario_id))
                    status, body = self.attempt(scenario_id, to)
                    if (start, to) in ALLOWED:
                        self.assertEqual((status, body["status"]), (200, to))
                        self.assertEqual(len(self.audit(scenario_id)), before + 1)
                    else:
                        self.assertEqual(status, 404 if to == "Draft" else 409, body)
                        self.assertEqual(self.stack.get(f"/api/scenarios/{scenario_id}")[1]["status"], start)
                        self.assertEqual(len(self.audit(scenario_id)), before)

    def test_roles(self) -> None:
        scenario_id = self.draft()
        self.assertEqual(self.stack.post(f"/api/scenarios/{scenario_id}/submit", role="Reviewer")[0], 403)
        self.assertEqual(self.stack.get(f"/api/scenarios/{scenario_id}")[1]["status"], "Draft")
        self.force(scenario_id, "Submitted")
        for verb in ("approve", "reject"):
            self.assertEqual(self.stack.post(f"/api/scenarios/{scenario_id}/{verb}", {"comment": "ok"}, role="Analyst")[0], 403, verb)
        self.assertEqual(self.stack.get(f"/api/scenarios/{scenario_id}")[1]["status"], "Submitted")

    def test_decision_needs_a_comment(self) -> None:
        scenario_id = self.draft()
        self.force(scenario_id, "Submitted")
        for verb in ("approve", "reject"):
            for body in ({}, {"comment": ""}, {"comment": "   "}):
                self.assertEqual(self.stack.post(f"/api/scenarios/{scenario_id}/{verb}", body, role="Reviewer")[0], 422, (verb, body))
        self.assertEqual(self.stack.get(f"/api/scenarios/{scenario_id}")[1]["status"], "Submitted")
        self.assertEqual(len(self.audit(scenario_id)), 1)

    def test_full_flow_audit_trail(self) -> None:
        scenario_id = self.draft()
        self.assertEqual(self.stack.post(f"/api/scenarios/{scenario_id}/submit")[1]["status"], "Submitted")
        status, done = self.stack.post(f"/api/scenarios/{scenario_id}/approve", {"comment": "Evidence supports it."}, role="Reviewer")
        self.assertEqual((status, done["status"], done["reviewComment"]), (200, "Approved", "Evidence supports it."))
        trail = self.audit(scenario_id)
        self.assertEqual(
            [(a["action"], a["actor"], a["fromStatus"], a["toStatus"], a["comment"]) for a in trail],
            [
                ("Created draft", "Demo Analyst", None, "Draft", None),
                ("Submitted for review", "Demo Analyst", "Draft", "Submitted", None),
                ("Approved", "Demo Reviewer", "Submitted", "Approved", "Evidence supports it."),
            ],
        )
        self.assertTrue(all(a["at"].endswith("Z") for a in trail))

    def test_reject_flow_and_immutability(self) -> None:
        scenario_id = self.draft()
        self.stack.post(f"/api/scenarios/{scenario_id}/submit")
        status, done = self.stack.post(f"/api/scenarios/{scenario_id}/reject", {"comment": "Cap too high."}, role="Reviewer")
        self.assertEqual((status, done["status"], done["reviewComment"]), (200, "Rejected", "Cap too high."))
        self.assertEqual(self.stack.put(f"/api/scenarios/{scenario_id}", BODY)[0], 409)
        self.assertEqual(self.audit(scenario_id)[-1]["action"], "Rejected")

    def test_four_eyes_creator_cannot_decide(self) -> None:
        scenario_id = self.draft(role="Reviewer")  # created by the reviewer
        self.stack.post(f"/api/scenarios/{scenario_id}/submit", role="Analyst")
        for verb in ("approve", "reject"):
            status, body = self.stack.post(f"/api/scenarios/{scenario_id}/{verb}", {"comment": "Fine."}, role="Reviewer")
            self.assertEqual(status, 403, verb)
            self.assertIn("Four-eyes", body["detail"])
        self.assertEqual(self.stack.get(f"/api/scenarios/{scenario_id}")[1]["status"], "Submitted")
        self.assertEqual(len(self.audit(scenario_id)), 2)  # created, submitted: nothing added by the refusals

    def test_four_eyes_editor_cannot_decide(self) -> None:
        scenario_id = self.draft()  # created by the analyst
        self.assertEqual(self.stack.put(f"/api/scenarios/{scenario_id}", {**BODY, "name": "Reviewer tweak"}, role="Reviewer")[0], 200)
        self.stack.post(f"/api/scenarios/{scenario_id}/submit", role="Analyst")
        for verb in ("approve", "reject"):
            self.assertEqual(self.stack.post(f"/api/scenarios/{scenario_id}/{verb}", {"comment": "Fine."}, role="Reviewer")[0], 403, verb)
        self.assertEqual(self.stack.get(f"/api/scenarios/{scenario_id}")[1]["status"], "Submitted")

    def test_four_eyes_submitter_cannot_decide(self) -> None:
        scenario_id = self.draft()
        self.force(scenario_id, "Submitted", extra_audit=("Demo Reviewer", "Submitted for review"))
        self.assertEqual(self.stack.post(f"/api/scenarios/{scenario_id}/approve", {"comment": "Fine."}, role="Reviewer")[0], 403)

    def test_a_different_reviewer_path_works(self) -> None:
        # Control: analyst creates and submits, reviewer decides. Approve and reject both succeed.
        for verb, expected in (("approve", "Approved"), ("reject", "Rejected")):
            scenario_id = self.draft()
            self.stack.post(f"/api/scenarios/{scenario_id}/submit")
            status, body = self.stack.post(f"/api/scenarios/{scenario_id}/{verb}", {"comment": "Reviewed."}, role="Reviewer")
            self.assertEqual((status, body["status"]), (200, expected))

    def test_unknown_scenario_and_missing_token(self) -> None:
        self.assertEqual(self.stack.post("/api/scenarios/sc-999999/submit")[0], 404)
        self.assertEqual(self.stack.post("/api/scenarios/sc-999999/approve", {"comment": "x"}, role="Reviewer")[0], 404)
        for verb in ("submit", "approve", "reject"):
            self.assertEqual(request(self.stack.base, "POST", f"/api/scenarios/sc-1/{verb}", {"comment": "x"})[0], 401, verb)


if __name__ == "__main__":
    unittest.main()
