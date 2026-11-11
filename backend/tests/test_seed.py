"""Demo seed: two fixed users, four scenarios (one per status), idempotent, reset on request."""

import unittest

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AuditEntry, Scenario, User
from app.pricing import PricingClient
from app.seed import SEEDS, seed, top_up
from tests.helpers import Stack
from tests.test_scenarios import BODY


class SeedTest(unittest.TestCase):
    def setUp(self) -> None:
        self.stack = Stack().__enter__()
        self.addCleanup(self.stack.__exit__, None, None, None)
        self.client = PricingClient(self.stack.pricing)

    def run_seed(self, reset: bool = False) -> list[str]:
        with Session(self.stack.app.state.engine) as db:
            return seed(db, self.client, reset=reset)

    def count(self, model) -> int:
        with Session(self.stack.app.state.engine) as db:
            return db.scalar(select(func.count()).select_from(model))

    def test_creates_two_users_and_four_scenarios_one_per_status(self) -> None:
        self.assertEqual(len(self.run_seed()), 4)
        with Session(self.stack.app.state.engine) as db:
            self.assertEqual({(u.name, u.role) for u in db.scalars(select(User))}, {("Demo Analyst", "Analyst"), ("Demo Reviewer", "Reviewer")})
            rows = list(db.scalars(select(Scenario)))
        self.assertEqual(sorted(r.status for r in rows), ["Approved", "Draft", "Rejected", "Submitted"])
        self.assertEqual({r.author for r in rows}, {"Demo Analyst"})
        self.assertEqual({r.name for r in rows}, {s["name"] for s in SEEDS})
        self.assertTrue(all(r.impact and "averageChangePct" in r.impact for r in rows))  # from the pricing service

    def test_audit_trails_follow_the_workflow_and_four_eyes(self) -> None:
        self.run_seed()
        trails = {}
        for row in self.stack.get("/api/scenarios")[1]:
            trails[row["status"]] = [(a["action"], a["actor"], a["fromStatus"], a["toStatus"]) for a in self.stack.get(f"/api/scenarios/{row['id']}/audit")[1]]
        self.assertEqual(trails["Draft"], [("Created draft", "Demo Analyst", None, "Draft")])
        self.assertEqual(trails["Submitted"][-1], ("Submitted for review", "Demo Analyst", "Draft", "Submitted"))
        self.assertEqual(trails["Approved"][-1], ("Approved", "Demo Reviewer", "Submitted", "Approved"))
        self.assertEqual(trails["Rejected"][-1], ("Rejected", "Demo Reviewer", "Submitted", "Rejected"))
        self.assertEqual(len(trails["Approved"]), 3)
        decided = [r for r in self.stack.get("/api/scenarios")[1] if r["status"] in ("Approved", "Rejected")]
        for row in decided:
            self.assertTrue(self.stack.get(f"/api/scenarios/{row['id']}")[1]["reviewComment"])

    def test_seeded_scenarios_obey_the_editing_rules(self) -> None:
        self.run_seed()
        for row in self.stack.get("/api/scenarios")[1]:
            status, _ = self.stack.put(f"/api/scenarios/{row['id']}", BODY)
            self.assertEqual(status, 200 if row["status"] == "Draft" else 409, row["status"])

    def test_running_twice_adds_nothing(self) -> None:
        self.run_seed()
        counts = (self.count(Scenario), self.count(AuditEntry), self.count(User))
        self.assertEqual(self.run_seed(), [])
        self.assertEqual((self.count(Scenario), self.count(AuditEntry), self.count(User)), counts)

    def test_seed_without_reset_keeps_other_scenarios(self) -> None:
        mine = self.stack.post("/api/scenarios", {**BODY, "name": "My own scenario"})[1]["id"]
        self.run_seed()
        self.assertEqual(self.stack.get(f"/api/scenarios/{mine}")[1]["name"], "My own scenario")
        self.assertEqual(self.count(Scenario), 5)

    def test_reset_deletes_everything_then_loads_the_four(self) -> None:
        self.run_seed()
        self.stack.post("/api/scenarios", {**BODY, "name": "To be deleted"})
        self.assertEqual(self.count(Scenario), 5)
        self.assertEqual(len(self.run_seed(reset=True)), 4)
        self.assertEqual((self.count(Scenario), self.count(User)), (4, 2))
        names = {r["name"] for r in self.stack.get("/api/scenarios")[1]}
        self.assertNotIn("To be deleted", names)
        # no audit entries left over from deleted scenarios: 1 + 2 + 3 + 3
        self.assertEqual(self.count(AuditEntry), 9)


class TopUpTest(unittest.TestCase):
    def setUp(self) -> None:
        self.stack = Stack().__enter__()
        self.addCleanup(self.stack.__exit__, None, None, None)
        self.client = PricingClient(self.stack.pricing)

    def rows(self) -> list[tuple]:
        with Session(self.stack.app.state.engine) as db:
            return sorted((r.id, r.name, r.status, r.updated_at) for r in db.scalars(select(Scenario)))

    def top_up(self):
        with Session(self.stack.app.state.engine) as db:
            return top_up(db, self.client)

    def test_adds_one_submitted_copy_when_none_is_submitted(self) -> None:
        with Session(self.stack.app.state.engine) as db:
            seed(db, self.client)
        # Move the Submitted seed out of Submitted by approving it as the Reviewer.
        sid = next(r["id"] for r in self.stack.get("/api/scenarios")[1] if r["status"] == "Submitted")
        with Session(self.stack.app.state.engine) as db:
            db.get(Scenario, int(sid.removeprefix("sc-"))).status = "Approved"
            db.commit()
        before = self.rows()
        name = self.top_up()
        after = self.rows()
        self.assertIn("demo copy", name)
        self.assertEqual(len(after), len(before) + 1)
        self.assertEqual([r for r in after if r[0] in {b[0] for b in before}], before)  # nothing existing changed
        self.assertEqual([r[2] for r in after if r[1] == name], ["Submitted"])

    def test_adds_nothing_when_any_scenario_is_submitted(self) -> None:
        with Session(self.stack.app.state.engine) as db:
            seed(db, self.client)
        before = self.rows()
        self.assertIsNone(self.top_up())
        self.assertEqual(self.rows(), before)

    def test_works_on_an_empty_database(self) -> None:
        self.assertIsNotNone(self.top_up())
        self.assertEqual([r[2] for r in self.rows()], ["Submitted"])
        self.assertIsNone(self.top_up())  # now one is Submitted


if __name__ == "__main__":
    unittest.main()
