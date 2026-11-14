"""Record pricing-service responses as mock fixtures.

Usage (with the image running, e.g. docker run -p 8011:8000 ghcr.io/asudarmo/health-pricing-meps:v1.1):
    python tools/record_fixtures.py http://localhost:8011

Responses are stored exactly as the service returns them (v1.1 has /model, the histogram and projected A/E).
"""

import csv
import json
import sys
import urllib.request
from pathlib import Path

BASE = sys.argv[1].rstrip("/")
OUT = Path(__file__).resolve().parents[1] / "tests" / "pricing_mock" / "fixtures"
FLAGS = ["HIBPDX", "CHDDX", "CANCERDX", "ARTHDX", "ASTHDX", "CHOLDX", "OHRTDX"]


def call(method: str, path: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(BASE + path, data=data, method=method, headers={"content-type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    save = lambda name, obj: (OUT / name).write_text(json.dumps(obj, indent=1), encoding="utf-8")

    save("health.json", call("GET", "/health"))
    save("model.json", call("GET", "/model"))
    relativities = call("GET", "/relativities")
    save("relativities.json", relativities)
    monitoring = call("GET", "/monitoring")
    save("monitoring.json", monitoring)

    quotes = {}
    with open(OUT / "golden_cases.csv", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            profile = {"age": float(row["age"]), "region": row["region"], **{k: row[k] for k in FLAGS}}
            quotes[row["case_id"]] = {"request": profile, "response": call("POST", "/quote", profile)}
    save("quotes.json", quotes)

    scenarios = []
    age60 = [{"factor": "age", "level": lv, "change": 0.12} for lv in ("60-64", "65-69", "70-74", "75-79", "80+")]
    requests = [
        # The four demo seed scenarios (app/seed.py): their impact is computed at seed time.
        {"base_change": 0.0, "relativity_changes": age60, "cap": 0.15, "floor": -0.1, "include_cells": False},
        {"base_change": 0.019, "relativity_changes": [], "cap": 0.1, "floor": -0.05, "include_cells": False},
        {"base_change": 0.0, "relativity_changes": [{"factor": "CANCERDX", "level": "1", "change": 0.05}], "cap": 0.12, "floor": -0.05, "include_cells": False},
        {"base_change": 0.08, "relativity_changes": [], "cap": 0.5, "floor": 0.0, "include_cells": False},
        # The frontend defaults: no change, cap 15 %, floor 10 %.
        {"base_change": 0.0, "relativity_changes": [], "cap": 0.15, "floor": -0.1, "include_cells": False},
        {"base_change": 0.0, "relativity_changes": [], "cap": None, "floor": None, "include_cells": False},
        {"base_change": 0.04, "relativity_changes": [{"factor": "age", "level": "80+", "change": 0.1}], "cap": 0.12, "floor": 0.0, "include_cells": False},
    ]
    for request in requests:
        scenarios.append({"request": request, "response": call("POST", "/scenario-impact", request)})
    save("scenario_impact.json", scenarios)
    print("recorded", len(quotes), "quotes,", len(scenarios), "scenarios")


if __name__ == "__main__":
    main()
