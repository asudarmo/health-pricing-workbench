"""Scenario storage and the draft-only editing rule.

Scenarios are editable while Draft only. Submitted, Approved and Rejected scenarios are immutable.
Every change writes an audit entry in the same transaction. Status changes arrive in the workflow task.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth import CurrentUser, current_user, get_db, require_role
from app.impact import compute_impact
from app.models import AuditEntry, Scenario
from app.pricing import PricingClient, PricingUnavailable
from app.routes_read import pricing

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


class RelativityChange(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    factor: str = Field(min_length=1, max_length=60)
    level: str = Field(min_length=1, max_length=60)
    newRelativity: float = Field(gt=0)


class ScenarioParams(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    baseRateChangePct: float = Field(ge=-50, le=100)
    relativityChanges: list[RelativityChange] = Field(default=[], max_length=200)
    capPct: float = Field(ge=0, le=100, description="Maximum individual increase, %")
    floorPct: float = Field(ge=0, le=100, description="Maximum individual decrease, % (positive number)")


class ScenarioInput(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    rationale: str = Field(default="", max_length=10000)
    params: ScenarioParams


def iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def sid(scenario: Scenario) -> str:
    return f"sc-{scenario.id}"


def summary(s: Scenario) -> dict:
    return {"id": sid(s), "name": s.name, "status": s.status, "author": s.author, "updatedAt": iso(s.updated_at)}


def full(s: Scenario) -> dict:
    return {
        **summary(s),
        "params": s.params,
        "rationale": s.rationale,
        "impact": s.impact,
        "reviewComment": s.review_comment,
    }


def audit_out(a: AuditEntry) -> dict:
    return {
        "at": iso(a.at),
        "actor": a.actor,
        "action": a.action,
        "fromStatus": a.from_status,
        "toStatus": a.to_status,
        "comment": a.comment,
    }


def record_audit(db: Session, scenario: Scenario, actor: str, action: str, from_status: str | None, comment: str | None = None):
    db.add(
        AuditEntry(
            scenario=scenario,
            actor=actor,
            action=action,
            from_status=from_status,
            to_status=scenario.status,
            comment=comment,
        )
    )


def get_scenario(db: Session, scenario_id: str) -> Scenario:
    prefix, _, number = scenario_id.partition("-")
    valid = prefix == "sc" and number.isascii() and number.isdigit() and len(number) <= 12
    scenario = db.get(Scenario, int(number)) if valid else None
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


class ImpactRequest(BaseModel):
    params: ScenarioParams


def impact_for(client: PricingClient, params: ScenarioParams) -> dict:
    try:
        return compute_impact(client, params.model_dump())
    except PricingUnavailable:
        raise HTTPException(status_code=502, detail="Pricing service unavailable") from None


@router.post("/impact")
def scenario_impact(
    body: ImpactRequest, _: CurrentUser = Depends(current_user), client: PricingClient = Depends(pricing)
) -> dict:
    return impact_for(client, body.params)


@router.get("")
def list_scenarios(_: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Scenario).order_by(Scenario.updated_at.desc(), Scenario.id.desc()))
    return [summary(s) for s in rows]


@router.get("/{scenario_id}")
def read_scenario(scenario_id: str, _: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return full(get_scenario(db, scenario_id))


@router.post("", status_code=201)
def create_scenario(
    body: ScenarioInput,
    user: CurrentUser = Depends(current_user),
    db: Session = Depends(get_db),
    client: PricingClient = Depends(pricing),
) -> dict:
    impact = impact_for(client, body.params)  # saved with the scenario so the review page can show it
    # Status is never read from the request: every new scenario starts as a Draft.
    scenario = Scenario(
        name=body.name.strip(),
        status="Draft",
        author=user.name,
        rationale=body.rationale,
        params=body.params.model_dump(),
        impact=impact,
    )
    db.add(scenario)
    db.flush()
    record_audit(db, scenario, user.name, "Created draft", None)
    db.commit()
    return full(scenario)


@router.put("/{scenario_id}")
def update_scenario(
    scenario_id: str,
    body: ScenarioInput,
    user: CurrentUser = Depends(current_user),
    db: Session = Depends(get_db),
    client: PricingClient = Depends(pricing),
) -> dict:
    scenario = get_scenario(db, scenario_id)
    if scenario.status != "Draft":
        raise HTTPException(status_code=409, detail=f"A {scenario.status} scenario cannot be edited")
    scenario.impact = impact_for(client, body.params)
    scenario.name = body.name.strip()
    scenario.rationale = body.rationale
    scenario.params = body.params.model_dump()
    scenario.updated_at = datetime.now(timezone.utc)
    record_audit(db, scenario, user.name, "Edited draft", "Draft")
    db.commit()
    return full(scenario)


@router.get("/{scenario_id}/audit")
def read_audit(scenario_id: str, _: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    return [audit_out(a) for a in get_scenario(db, scenario_id).audit]


class Decision(BaseModel):
    comment: str = Field(min_length=1, max_length=5000)


def change_status(db: Session, scenario: Scenario, user: CurrentUser, to: str, action: str, comment: str | None = None) -> dict:
    """Move a scenario to a new status. The update only applies if the status is still what we read."""
    expected, now = scenario.status, datetime.now(timezone.utc)
    values = {"status": to, "updated_at": now}
    if comment is not None:
        values["review_comment"] = comment
    result = db.execute(update(Scenario).where(Scenario.id == scenario.id, Scenario.status == expected).values(**values))
    if result.rowcount != 1:  # someone else changed it first
        db.rollback()
        raise HTTPException(status_code=409, detail="The scenario status changed; reload and try again")
    db.refresh(scenario)
    record_audit(db, scenario, user.name, action, expected, comment)
    db.commit()
    return full(scenario)


def check_four_eyes(scenario: Scenario, user: CurrentUser) -> None:
    """A reviewer cannot decide on a scenario they created, edited or submitted."""
    involved = {a.actor for a in scenario.audit if a.action in ("Created draft", "Edited draft", "Submitted for review")}
    if user.name == scenario.author or user.name in involved:
        raise HTTPException(status_code=403, detail="Four-eyes rule: you created, edited or submitted this scenario")


@router.post("/{scenario_id}/submit")
def submit_scenario(
    scenario_id: str, user: CurrentUser = Depends(require_role("Analyst")), db: Session = Depends(get_db)
) -> dict:
    scenario = get_scenario(db, scenario_id)
    if scenario.status != "Draft":
        raise HTTPException(status_code=409, detail=f"A {scenario.status} scenario cannot be submitted")
    return change_status(db, scenario, user, "Submitted", "Submitted for review")


def decide(scenario_id: str, body: Decision, user: CurrentUser, db: Session, to: str, action: str) -> dict:
    scenario = get_scenario(db, scenario_id)
    if scenario.status != "Submitted":
        raise HTTPException(status_code=409, detail=f"Only a Submitted scenario can be decided; this one is {scenario.status}")
    check_four_eyes(scenario, user)
    comment = body.comment.strip()
    if not comment:
        raise HTTPException(status_code=422, detail="A comment is required")
    return change_status(db, scenario, user, to, action, comment)


@router.post("/{scenario_id}/approve")
def approve_scenario(
    scenario_id: str, body: Decision, user: CurrentUser = Depends(require_role("Reviewer")), db: Session = Depends(get_db)
) -> dict:
    return decide(scenario_id, body, user, db, "Approved", "Approved")


@router.post("/{scenario_id}/reject")
def reject_scenario(
    scenario_id: str, body: Decision, user: CurrentUser = Depends(require_role("Reviewer")), db: Session = Depends(get_db)
) -> dict:
    return decide(scenario_id, body, user, db, "Rejected", "Rejected")
