# Contract check: frontend API vs pricing service (v1, 8 Nov 2026)

Pricing service endpoints: `GET /health`, `GET /relativities`, `GET /monitoring`, `POST /quote`,
`POST /scenario-impact`. Responses of the last three are untyped in the OpenAPI schema (`additionalProperties`),
so the mock must be built from the shapes read in `service/app.py`.

## Backend owns (no pricing-service call)

- `POST /api/auth/login`, roles, tokens.
- Scenario CRUD, status changes, immutability, `GET /api/scenarios/{id}/audit`.
- Stores ModelInfo `factors` labels, if not derived.

## Backend maps (pure translation, no rating logic)

| Frontend | Pricing service | Mapping |
|---|---|---|
| `POST /api/quotes` | `POST /quote` | `selections` to `region`, `HIBPDX`.. flags · breakdown `factor` is a multiplier, so `runningAmount` is a running product |
| `GET /api/relativities` | `GET /relativities` | `lower_95`/`upper_95` to `lower`/`upper` |
| `GET /api/model` | `/health`, `/relativities`, `/monitoring` | id, date, base rate, deviance, Gini, factor list and levels |
| `POST /api/scenarios/impact` | `POST /scenario-impact` | % to fractions · UI `floorPct` is a positive decrease, service `floor` is negative · `cappedPolicies` is service `cells_capped` (cells, not policies) |
| `Monitoring.ae` | `GET /monitoring` | adds `ae` from `a_e` · `period`/`segment` as is |

## Gaps: the pricing service cannot supply these

1. **Recalibration flags** (`Monitoring.flags`, `recalibrationFlagCount`, `gapType`). No endpoint applies
   the rule in the modelling repo's `recalibration-rule.md`. The backend would have to implement it.
2. **Data years, trend and rebase** (`dataYears`, `trend`, `rebase`). In `model_version.json` only. `/health`
   exposes id, date and description, `/monitoring` exposes validation metrics.
3. **Dislocation histogram** (`Impact.histogram` with policy counts). The service returns percentile
   summaries per segment. Counts need `include_cells: true` and binning in the backend.
4. **Projected A/E** (`Impact.projectedAE`). Not returned. Derivable as actual / (expected x new/old premium)
   from `/monitoring` and `totals`, which is a calculation.
5. **Headline A/E** (`headlineAE`). Not returned. Derivable from the overall `ae` rows.

Gaps 1 to 5 were decision gate 3. Decided 8 Nov 2026: option A, ask the pricing service to supply them.

## Change request for the pricing service (proposed contract)

Until a new image exists, the frontend mock and the backend tests follow this proposal. The published `v1`
image stays the reference for the existing endpoints.

1. **New `GET /model`**: `id`, `date`, `data_years` (fit, out_of_time, cost_basis), `trend_assumptions`
   (forecast_trend, rebase), `permitted_rating_factors` with levels, `headline_ae` (overall A/E on the latest
   period) and `recalibration_flags`: list of `{segment, a_e, exposure, gap_type: "level shift" | "change in
   shape", note}`, evaluated by the rule in `recalibration-rule.md`.
2. **`POST /scenario-impact`**: add `histogram` (list of `{bucket, exposure}` of individual premium changes,
   fixed bucket edges stated in the response) and `projected_ae` (actual / expected after the change).
3. Type the responses of `/relativities`, `/monitoring` and `/scenario-impact` in the OpenAPI schema.

Fallback if bucket counts are hard: the UI charts the existing percentiles (p05 to p95) per segment instead of a
histogram. This is a frontend change only.

## Mapping notes from task 8 (scenario impact)

- The UI sends absolute new relativities. The service takes a relative change. The backend reads the current
  relativity and sends `new / current - 1`, rounded to 6 decimals.
- `cappedPolicies` and `flooredPolicies` carry the service's `cells_capped` and `cells_floored`. These count
  rating cells, not policies. The UI label "Capped lives" is therefore wrong until the service returns exposure
  (a small addition to the change request) or the label changes (task 11).
- Histogram `policies` holds exposure in life-years, from the proposed `histogram` field.
- The service call for the full book took about 25 ms on the published image (measured 8 Nov 2026, three runs).
