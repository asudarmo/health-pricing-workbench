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
| `POST /api/quotes` | `POST /quote` | `selections` to `region`, `HIBPDX`.. flags; breakdown `factor` is a multiplier, so `runningAmount` is a running product |
| `GET /api/relativities` | `GET /relativities` | `lower_95`/`upper_95` to `lower`/`upper` |
| `GET /api/model` | `/health`, `/relativities`, `/monitoring` | id, date, base rate, deviance, Gini, factor list and levels |
| `POST /api/scenarios/impact` | `POST /scenario-impact` | % to fractions; UI `floorPct` is a positive decrease, service `floor` is negative; `cappedPolicies` is service `cells_capped` (cells, not policies) |
| `Monitoring.ae` | `GET /monitoring` | adds `ae` from `a_e`; `period`/`segment` as is |

## Gaps: the pricing service cannot supply these

1. **Recalibration flags** (`Monitoring.flags`, `recalibrationFlagCount`, `gapType`). No endpoint applies
   the rule in the modelling repo's `recalibration-rule.md`. The backend would have to implement it.
2. **Data years, trend and rebase** (`dataYears`, `trend`, `rebase`). In `model_version.json` only; `/health`
   exposes id, date and description, `/monitoring` exposes validation metrics.
3. **Dislocation histogram** (`Impact.histogram` with policy counts). The service returns percentile
   summaries per segment. Counts need `include_cells: true` and binning in the backend.
4. **Projected A/E** (`Impact.projectedAE`). Not returned. Derivable as actual / (expected x new/old premium)
   from `/monitoring` and `totals`, which is a calculation.
5. **Headline A/E** (`headlineAE`). Not returned. Derivable from the overall `ae` rows.

Gaps 1 to 5 are decision gate 3.
