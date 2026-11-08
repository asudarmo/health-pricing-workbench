"""Scenario impact: translate the frontend scenario into a pricing-service request and the answer back.

Translation only. The pricing service applies the scenario to the in-force book.
"""

from fastapi import HTTPException

from app import factors as fx
from app.pricing import PricingClient


def current_relativities(client: PricingClient) -> dict[tuple[str, str], float]:
    rows = client.relativities()["relativities"]
    return {(fx.key_for(r["factor"]), fx.level_to_ui(r["factor"], r["level"])): r["relativity"] for r in rows}


def to_service_request(params: dict, current: dict[tuple[str, str], float]) -> dict:
    """Frontend percentages and absolute relativities become the service's fractions and relative changes."""
    changes = []
    for item in params["relativityChanges"]:
        key = (item["factor"], item["level"])
        if key not in current:
            raise HTTPException(status_code=422, detail=f"Unknown factor level {item['factor']} / {item['level']}")
        changes.append(
            {
                "factor": fx.BY_KEY[item["factor"]].code,
                "level": fx.level_to_service(item["factor"], item["level"]),
                "change": round(item["newRelativity"] / current[key] - 1, 6),
            }
        )
    return {
        "base_change": params["baseRateChangePct"] / 100,
        "relativity_changes": changes,
        "cap": params["capPct"] / 100,  # largest increase
        "floor": -params["floorPct"] / 100,  # largest decrease, the UI holds it as a positive number
    }


def from_service_response(result: dict) -> dict:
    totals = result["totals"]
    return {
        "averageChangePct": totals["change_pct"],
        "histogram": [{"bucket": b["bucket"], "policies": round(b["exposure"], 1)} for b in result["histogram"]["buckets"]],
        # The service counts rating cells, not policies; shown under the frontend's existing field names.
        "cappedPolicies": totals["cells_capped"],
        "flooredPolicies": totals["cells_floored"],
        "projectedAE": result["projected_ae"],
        "affectedSegments": [
            {"segment": f"{d['dimension']}: {d['segment']}", "averageChangePct": d["mean_change_pct"]}
            for d in result["dislocation"]
            if abs(d["mean_change_pct"]) >= 0.005
        ],
    }


def compute_impact(client: PricingClient, params: dict) -> dict:
    request = to_service_request(params, current_relativities(client) if params["relativityChanges"] else {})
    return from_service_response(client.scenario_impact(request))
