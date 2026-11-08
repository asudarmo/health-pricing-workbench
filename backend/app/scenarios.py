"""Scenario storage and the draft-only editing rule.

Scenarios are editable while Draft only. Submitted, Approved and Rejected scenarios are immutable.
Every change writes an audit entry in the same transaction. Status changes arrive in the workflow task.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUser, current_user, get_db
from app.impact import compute_impact
from app.models import AuditEntry, Scenario
from app.pricing import PricingClient, PricingUnavailable
from app.routes_read import pricing

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


class RelativityChange(BaseModel):
    factor: str = Field(min_length=1, max_length=60)
    level: str = Field(min_length=1, max_length=60)
    newRelativity: float = Field(gt=0)


class ScenarioParams(BaseModel):
    baseRateChangePct: float = Field(ge=-50, le=100)
    relativityChanges: list[RelativityChange] = Field(default=[], max_length=200)
    capPct: float = Field(ge=0, le=100, description="Maximum individual increase, %")
    floorPct: float = Field(ge=0, le=100, description="Maximum individual decrease, % (positive number)")


class ScenarioInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
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
    scenario = db.get(Scenario, int(number)) if prefix == "sc" and number.isdigit() else None
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
