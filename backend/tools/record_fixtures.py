"""Record pricing-service responses as mock fixtures.

Usage (with the published image running, e.g. docker run -p 8011:8000 ghcr.io/asudarmo/health-pricing-meps:v1):
    python tools/record_fixtures.py http://localhost:8011

Real responses are stored as they are. The fields marked PROPOSED in _docs/contract-check.md do not exist in
the published image: this tool adds approximate values so the mock and backend tests can follow the proposed
contract. They are not model output.
"""

import csv
import json
import sys
import urllib.request
from pathlib import Path

BASE = sys.argv[1].rstrip("/")
OUT = Path(__file__).resolve().parents[1] / "tests" / "pricing_mock" / "fixtures"
FLAGS = ["HIBPDX", "CHDDX", "CANCERDX", "ARTHDX", "ASTHDX", "CHOLDX", "OHRTDX"]
EDGES = [-20, -10, -5, -2, 0, 2, 5, 10, 15, 20]  # bucket edges in % change, stated in the response


def call(method: str, path: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(BASE + path, data=data, method=method, headers={"content-type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def bucket_label(low: float | None, high: float | None) -> str:
    if low is None:
        return f"< {high:g}%"
    if high is None:
        return f">= {low:g}%"
    return f"{low:g}% to {high:g}%"


def histogram(cells: list[dict]) -> dict:
    ranges = [(None, EDGES[0])] + list(zip(EDGES, EDGES[1:])) + [(EDGES[-1], None)]
    counts = [0.0] * len(ranges)
    for cell in cells:
        for i, (low, high) in enumerate(ranges):
            if (low is None or cell["change_pct"] >= low) and (high is None or cell["change_pct"] < high):
                counts[i] += cell["exposure"]
                break
    return {"edges_pct": EDGES, "buckets": [{"bucket": bucket_label(*r), "exposure": c} for r, c in zip(ranges, counts)]}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    save = lambda name, obj: (OUT / name).write_text(json.dumps(obj, indent=1), encoding="utf-8")

    save("health.json", call("GET", "/health"))
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

    overall = sum(r["actual"] for r in monitoring["ae"] if r["segment"] == "all") / max(
        sum(r["expected"] for r in monitoring["ae"] if r["segment"] == "all"), 1e-9
    )
    scenarios = []
    requests = [
        {"base_change": 0.0, "relativity_changes": [], "cap": None, "floor": None, "include_cells": False},
        {"base_change": 0.04, "relativity_changes": [{"factor": "age", "level": "80+", "change": 0.1}], "cap": 0.12, "floor": 0.0, "include_cells": False},
    ]
    for request in requests:
        real = call("POST", "/scenario-impact", {**request, "include_cells": True})
        cells = real.pop("cells")
        old_over_new = 1 + real["totals"]["change_pct"] / 100
        response = {**real, "histogram": histogram(cells), "projected_ae": overall / old_over_new}
        scenarios.append({"request": request, "response": response})
    save("scenario_impact.json", scenarios)
    print("recorded", len(quotes), "quotes,", len(scenarios), "scenarios; overall A/E", round(overall, 4))


if __name__ == "__main__":
    main()
