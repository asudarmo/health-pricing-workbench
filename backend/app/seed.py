"""Demo data: the two fixed demo users and four scenarios, one per status.

    python -m app.seed            add what is missing (safe to run twice)
    python -m app.seed --reset    delete ALL scenarios and audit entries, then load the four seeds

Impacts come from the pricing service, so it must be reachable. Authors and audit trails follow the four-eyes
rule: the Analyst creates and submits, the Reviewer decides. The text is illustrative demo data.
"""

import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth import DEMO_USERS
from app.config import get_settings
from app.db import make_engine
from app.impact import compute_impact, current_relativities
from app.models import AuditEntry, Scenario, User
from app.pricing import PricingClient

ANALYST, REVIEWER = DEMO_USERS["Analyst"], DEMO_USERS["Reviewer"]
AGES_60_PLUS = ("60-64", "65-69", "70-74", "75-79", "80+")

# Relativity changes are multipliers on the current relativity, so the seeds follow the published model.
SEEDS = [
    {
        "name": "60+ level shift uplift",
        "status": "Draft",
        "rationale": "Demo scenario. A/E for the 60+ segment runs above 1 with a stable shape across ages, which points "
        "to a level shift. Raise the age 60+ relativities by 12 % and cap individual increases at 15 %.",
        "base_pct": 0.0,
        "multipliers": {("age", lv): 1.12 for lv in AGES_60_PLUS},
        "cap": 15,
        "floor": 10,
        "days_ago": 3,
    },
    {
        "name": "Trend refresh +1.9%",
        "status": "Submitted",
        "rationale": "Demo scenario. Move the base rate by the 1.9 % forecast trend in the model assumptions, with "
        "increases capped at 10 % and decreases at 5 %.",
        "base_pct": 1.9,
        "multipliers": {},
        "cap": 10,
        "floor": 5,
        "days_ago": 2,
    },
    {
        "name": "Cancer loading +5%",
        "status": "Approved",
        "rationale": "Demo scenario. The cancer relativity is estimated with a wide interval. Raise it by 5 % as a "
        "prudent step, capped at 12 %.",
        "base_pct": 0.0,
        "multipliers": {("cond_cancer", "present"): 1.05},
        "cap": 12,
        "floor": 5,
        "days_ago": 5,
        "decision": "Approved: small change, cap limits dislocation, consistent with the confidence interval.",
    },
    {
        "name": "Base +8% with a wide cap",
        "status": "Rejected",
        "rationale": "Demo scenario. Lift every premium by 8 % to close an overall gap, allowing individual increases "
        "of up to 50 %.",
        "base_pct": 8.0,
        "multipliers": {},
        "cap": 50,
        "floor": 0,
        "days_ago": 6,
        "decision": "Rejected: the 50 % cap lets some customers face very large increases. Resubmit with a lower cap.",
    },
]


def params_for(seed: dict, current: dict) -> dict:
    return {
        "baseRateChangePct": seed["base_pct"],
        "relativityChanges": [
            {"factor": f, "level": lv, "newRelativity": current[(f, lv)] * m} for (f, lv), m in seed["multipliers"].items()
        ],
        "capPct": seed["cap"],
        "floorPct": seed["floor"],
    }


def ensure_users(db: Session) -> None:
    for role, name in DEMO_USERS.items():
        if db.scalar(select(User).where(User.name == name)) is None:
            db.add(User(name=name, role=role))
    db.commit()


def add_scenario(db: Session, client: PricingClient, seed: dict, current: dict, now: datetime) -> Scenario:
    params = params_for(seed, current)
    start = now - timedelta(days=seed["days_ago"])
    scenario = Scenario(
        name=seed["name"],
        status="Draft",
        author=ANALYST,
        rationale=seed["rationale"],
        params=params,
        impact=compute_impact(client, params),
        created_at=start,
        updated_at=start,
    )
    db.add(scenario)
    db.flush()

    def log(offset_hours: int, actor: str, action: str, from_status, to_status: str, comment=None) -> None:
        at = start + timedelta(hours=offset_hours)
        db.add(AuditEntry(scenario=scenario, at=at, actor=actor, action=action, from_status=from_status, to_status=to_status, comment=comment))
        scenario.status, scenario.updated_at = to_status, at

    log(0, ANALYST, "Created draft", None, "Draft")
    if seed["status"] != "Draft":
        log(1, ANALYST, "Submitted for review", "Draft", "Submitted")
    if seed["status"] in ("Approved", "Rejected"):
        log(5, REVIEWER, seed["status"], "Submitted", seed["status"], seed["decision"])
        scenario.review_comment = seed["decision"]
    return scenario


def seed(db: Session, client: PricingClient, reset: bool = False, now: datetime | None = None) -> list[str]:
    """Return the names of the scenarios added."""
    now = now or datetime.now(timezone.utc)
    if reset:
        db.execute(delete(AuditEntry))
        db.execute(delete(Scenario))
        db.commit()
    ensure_users(db)
    existing = set(db.scalars(select(Scenario.name)))
    missing = [s for s in SEEDS if s["name"] not in existing]
    added = []
    if missing:
        current = current_relativities(client)
        for item in missing:
            add_scenario(db, client, item, current, now)
            added.append(item["name"])
        db.commit()
    return added


def main() -> None:
    settings = get_settings()
    engine = make_engine(settings.database_url)
    with Session(engine) as db:
        added = seed(db, PricingClient(settings.pricing_service_url), reset="--reset" in sys.argv)
    print(f"Added {len(added)} scenario(s): {', '.join(added) or 'none (already seeded)'}")


if __name__ == "__main__":
    main()
