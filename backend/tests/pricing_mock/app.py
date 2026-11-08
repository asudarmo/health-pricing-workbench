"""A mock of the pricing service for tests.

It replays responses recorded from the published image (ghcr.io/asudarmo/health-pricing-meps:v1, see
tools/record_fixtures.py). It holds no rating logic: a profile or scenario it has no recording for returns 422.

PROPOSED contract (see _docs/contract-check.md): GET /model, and the histogram and projected_ae fields of
POST /scenario-impact, are not in the published image. Responses carrying them have the header
X-Proposed-Fields naming them.
"""

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Response

FIXTURES = Path(__file__).resolve().parent / "fixtures"
NOT_PERMITTED = ("sex", "race", "income", "education")


def load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def canonical_profile(profile: dict) -> str:
    cleaned = {
        k: str(int(float(v))) if k == "age" else str(v)
        for k, v in profile.items()
        if v is not None and k != "exposure"
    }
    return json.dumps(cleaned, sort_keys=True)


def create_mock_app() -> FastAPI:
    app = FastAPI(title="Pricing service mock", version="1.0.0")
    quotes = {canonical_profile(q["request"]): q["response"] for q in load("quotes.json").values()}
    scenarios = load("scenario_impact.json")
    relativities, monitoring = load("relativities.json"), load("monitoring.json")

    @app.get("/health")
    def health() -> dict:
        return load("health.json")

    @app.get("/model")
    def model(response: Response) -> dict:
        response.headers["X-Proposed-Fields"] = "all"
        return load("model.json")

    @app.get("/relativities")
    def get_relativities(factor: str | None = Query(None)) -> dict:
        if factor is None:
            return relativities
        rows = [r for r in relativities["relativities"] if r["factor"] == factor]
        if not rows:
            raise HTTPException(status_code=404, detail=f"No factor '{factor}'")
        return {**relativities, "relativities": rows}

    @app.get("/monitoring")
    def get_monitoring(period: str | None = Query(None), factor: str | None = Query(None)) -> dict:
        rows = {"ae": monitoring["ae"], "psi": monitoring["psi"]}
        for key, value in (("period", period), ("factor", factor)):
            if value is not None:
                rows = {k: [r for r in v if r.get(key) == value] for k, v in rows.items()}
        return {**monitoring, **rows}

    @app.post("/quote")
    def quote(profile: dict) -> dict:
        for name in NOT_PERMITTED:
            if name in profile:
                raise HTTPException(status_code=422, detail=f"'{name}' is not a permitted rating factor")
        found = quotes.get(canonical_profile(profile))
        if found is None:
            raise HTTPException(status_code=422, detail="Profile not recorded in the mock")
        return found

    @app.post("/scenario-impact")
    def scenario_impact(request: dict, response: Response) -> dict:
        wanted = {
            "base_change": request.get("base_change") or 0.0,
            "relativity_changes": request.get("relativity_changes") or [],
            "cap": request.get("cap"),
            "floor": request.get("floor"),
        }
        if wanted["cap"] is not None and wanted["floor"] is not None and wanted["cap"] < wanted["floor"]:
            raise HTTPException(status_code=422, detail="cap must not be below floor")
        for item in scenarios:
            if {k: item["request"][k] for k in wanted} == wanted:
                response.headers["X-Proposed-Fields"] = "histogram,projected_ae"
                return item["response"]
        raise HTTPException(status_code=422, detail="Scenario not recorded in the mock")

    return app
