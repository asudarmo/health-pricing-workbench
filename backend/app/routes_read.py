"""Read endpoints and quotes. They translate between the frontend contract and the pricing service."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app import factors as fx
from app.auth import CurrentUser, current_user
from app.pricing import PricingClient, PricingUnavailable
from app.schemas import ModelInfo, Monitoring, QuoteResponse, Relativity, errors, roles

router = APIRouter(prefix="/api", tags=["model"])

DEFAULT_LABEL = "risk premium (expected claims cost), illustrative £, excluding expenses and margin"


def pricing(request: Request) -> PricingClient:
    return request.app.state.pricing


def unavailable(error: PricingUnavailable) -> HTTPException:
    return HTTPException(status_code=502, detail="Pricing service unavailable")


class QuoteRequest(BaseModel):
    age: float
    selections: dict[str, str] = {}


@router.get("/model", response_model=ModelInfo, responses=errors(401, 502), openapi_extra=roles("Analyst", "Reviewer"),
            summary="Active model version, base rate and factor list")
def get_model(_: CurrentUser = Depends(current_user), client: PricingClient = Depends(pricing)) -> dict:
    try:
        model, rel = client.model(), client.relativities()
    except PricingUnavailable as error:
        raise unavailable(error) from None
    scaling = rel["uk_scaling"]
    base = next(r["value"] for r in rel["base_rate"] if r["component"] == "base rate")
    levels = {f["factor"]: f["levels"] for f in model["permitted_rating_factors"]}
    years = model["data_years"]
    metrics = model["validation_metrics"]["test_split_2022"]
    out_factors = [
        {
            "key": d.key,
            "label": d.label,
            "group": d.group,
            "levels": [{"value": fx.level_to_ui(d.code, lv), "label": fx.level_to_ui(d.code, lv).capitalize()} for lv in levels.get(d.code, [])],
        }
        for d in fx.FACTOR_DEFS
        if d.code in levels
    ]
    return {
        "id": model["id"],
        "date": model["date"],
        "dataYears": f"{years['fit']} fit, {years['out_of_time']} out-of-time",
        "trend": model["trend_assumptions"]["forecast_trend"],
        "rebase": model["trend_assumptions"]["rebase"],
        "validation": {"deviance": metrics["tweedie_deviance"], "gini": metrics["gini"]},
        "baseRate": round(base * scaling["gbp_per_usd_premium"], 2),
        "currency": "GBP",
        "scalingNote": f"Scaled to a mean of about £{scaling['gbp_per_covered_life']} per life, ABI 2023, all covered lives",
        "illustrativeLabel": scaling.get("label") or DEFAULT_LABEL,
        "factors": out_factors,
        "headlineAE": model["headline_ae"],
        "recalibrationFlagCount": len(model["recalibration_flags"]),
    }


@router.get("/relativities", response_model=list[Relativity], responses=errors(401, 502), openapi_extra=roles("Analyst", "Reviewer"),
            summary="Relativity, exposure and confidence bounds for every factor level")
def get_relativities(_: CurrentUser = Depends(current_user), client: PricingClient = Depends(pricing)) -> list[dict]:
    try:
        rel = client.relativities()
    except PricingUnavailable as error:
        raise unavailable(error) from None
    return [
        {
            "factor": fx.key_for(r["factor"]),
            "level": fx.level_to_ui(r["factor"], r["level"]),
            "relativity": r["relativity"],
            "exposure": r["exposure"],
            "lower": r.get("lower_95"),
            "upper": r.get("upper_95"),
        }
        for r in rel["relativities"]
    ]


@router.get("/monitoring", response_model=Monitoring, responses=errors(401, 502), openapi_extra=roles("Analyst", "Reviewer"),
            summary="A/E, PSI and recalibration flags")
def get_monitoring(_: CurrentUser = Depends(current_user), client: PricingClient = Depends(pricing)) -> dict:
    try:
        mon, model = client.monitoring(), client.model()
    except PricingUnavailable as error:
        raise unavailable(error) from None
    return {
        "ae": [
            {
                "factor": fx.key_for(r["factor"]),
                "level": fx.level_to_ui(r["factor"], r["level"]),
                "segment": r["segment"],
                "period": r["period"],
                "actual": r["actual"],
                "expected": r["expected"],
                "exposure": r["exposure"],
                "ae": r["a_e"],
            }
            for r in mon["ae"]
        ],
        "psi": [{"factor": fx.key_for(r["factor"]), "period": r["period"], "psi": r["psi"]} for r in mon["psi"]],
        "flags": [
            {
                "id": f"flag-{i}",
                "segment": f["segment"],
                "ae": f["a_e"],
                "exposure": f["exposure"],
                "gapType": f["gap_type"],
                "note": f["note"],
            }
            for i, f in enumerate(model["recalibration_flags"], start=1)
        ],
    }


@router.post("/quotes", response_model=QuoteResponse, responses=errors(401, 422, 502), openapi_extra=roles("Analyst", "Reviewer"),
             summary="Risk premium (expected claims cost), illustrative GBP, with the factor breakdown")
def create_quote(
    body: QuoteRequest, _: CurrentUser = Depends(current_user), client: PricingClient = Depends(pricing)
) -> dict:
    for key in body.selections:
        if key.lower() in fx.NOT_PERMITTED:
            raise HTTPException(status_code=422, detail=f"'{key}' is not a permitted rating factor")
        if key not in fx.BY_KEY or key == "age":
            raise HTTPException(status_code=422, detail=f"Unknown rating factor '{key}'")
    profile: dict = {"age": body.age}
    for d in fx.FACTOR_DEFS:
        if d.group == "age":
            continue
        default = "absent" if d.group == "condition" else None
        level = body.selections.get(d.key, default)
        if level is None:
            raise HTTPException(status_code=422, detail=f"Select a level for '{d.key}'")
        try:
            profile[d.code] = fx.level_to_service(d.key, level)
        except KeyError:
            raise HTTPException(status_code=422, detail=f"Unknown level '{level}' for '{d.key}'") from None
    try:
        result = client.quote(profile)
    except PricingUnavailable as error:
        raise unavailable(error) from None

    # Rows without a level (base rate, trend, rebase, dollar-to-pound scaling) are folded into the base rate shown.
    chain = result["breakdown"]
    base_gbp = 1.0
    for row in chain:
        if row["level"] == "":
            base_gbp *= row["factor"]
    running, steps = base_gbp, []
    for row in chain:
        if row["level"] == "":
            continue
        running *= row["factor"]
        steps.append(
            {
                "factor": fx.key_for(row["step"]),
                "level": fx.level_to_ui(row["step"], row["level"]),
                "relativity": row["factor"],
                "runningAmount": round(running, 2),
            }
        )
    return {
        "baseRate": round(base_gbp, 2),
        "steps": steps,
        "riskPremium": round(result["premium_illustrative_gbp"], 2),
        "illustrativeLabel": result.get("illustrative_label") or DEFAULT_LABEL,
        "modelVersion": result["model_version"],
    }
