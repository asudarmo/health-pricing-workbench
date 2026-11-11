# Health Pricing Workbench: MVP Scope

Phase 2 of the health pricing project (AI Dev Tools Zoomcamp capstone, due 16 Nov 2026).
Copy this file to `_docs/plan.md` when bootstrapping the app repo. Phase 1 (modelling) is described in
`Health_Pricing_Project_Note.md` and must be finished first.

## Product goal

Help a health insurance pricing analyst turn a fitted pricing model into day-to-day decisions: quote a
customer, inspect rating factors, monitor actual-versus-expected (A/E) experience and drift, and test a
rate change with its customer impact before it is signed off. All of this without copying numbers between
spreadsheets.

## Core workflow

### 1. Publish a model version

The modelling phase publishes a model version: base rate, rating-factor relativities, validation results,
monitoring tables and assumptions (data years, trend). The app loads it as a new version.

In the MVP, one version (v1) is loaded from the pricing service at start-up. Publishing and comparing several
versions is a future feature (see "Future to-do").

### 2. Quote a customer

An analyst enters a customer profile:

- Age
- Region
- Seven condition flags: high blood pressure, coronary heart disease, other heart disease, high cholesterol,
  cancer, arthritis and asthma

These match the final tariff. The app returns the risk premium with a factor-by-factor breakdown: base rate ×
each relativity = risk premium. The output is labelled "risk premium (expected claims cost), illustrative £".
It is scaled to a UK mean of about £576 per life (ABI 2023 data, all covered lives).

Sex is not an input. UK pricing must be gender-neutral. Smoking is analysis-only and BMI is not in the 2023
data, so neither is an input. Excess and outpatient limit are not supported by the v1-lite engine (see "Future
to-do").

### 3. Explore rating factors

For each rating factor, the analyst sees the relativity for every level, the exposure behind it and its
confidence interval.

### 4. Monitor experience

The analyst sees A/E overall, by rating factor, by segment and by period, plus drift (PSI) on key factors.

Segments where the recalibration rule triggers are flagged, with the evidence: A/E, exposure, and
whether the gap is a level shift or a change in shape.

### 5. Test a rate change

The analyst creates a rate-change scenario:

- An overall base rate change
- Changes to individual relativities (e.g. steeper age curve, higher cancer loading)
- Caps and floors on individual premium changes

The app shows the impact on the in-force book:

- Average premium change
- Distribution of individual changes (dislocation histogram)
- Segments hitting a cap or floor
- Projected A/E or loss ratio after the change

The analyst saves the scenario with a name and rationale.

### 6. Review and approve

A reviewer opens a submitted scenario, reads the rationale and impact, and marks it **Approved** or
**Rejected** with a comment. Every status change is recorded in an audit trail.

### 7. Ask the AI assistant (moved to Future to-do on 8 Nov 2026)

Through an MCP server, a coding or chat agent can call the app's pricing tools:

- Read relativities and model metadata
- Get a quote
- Run an A/E or drift report for a factor or segment
- Create a draft scenario with a written rationale

Typical question: "Why is A/E drifting for the over-60s, and what scenario would fix it?"

The agent can only read data and create **draft** scenarios. An analyst must review and submit them.

## Decisions made for the MVP

### The app never refits models

**Decision:** Model versions are read-only inputs published by the modelling phase. The app does not
train, refit or recalibrate models.

**Why:** Modelling is governed and reproducible in the Phase 1 package and notebooks. Mixing fitting into
the app would blur model governance and double the scope.

**Alternatives considered:**

- Refit inside the app: impressive, but slow, hard to test and a governance risk.
- Upload any model file: flexible, but needs validation logic the MVP does not need.

### The app calls the pricing service over HTTP

**Decision:** The backend calls the Phase 1 pricing web service (M10 of the modelling project) for quotes,
relativities, monitoring tables and scenario impact. The app repo contains no modelling code.

**Why:** One source of truth, owned by the pricing service. The golden test cases (including the
Excel-to-Python reconciliation) prove the service gives the model's numbers. The two course submissions stay
cleanly separate. The ML Zoomcamp instructor confirmed in Slack (2 Nov 2026) that this setup is acceptable.

**Alternatives considered:**

- Importing the Phase 1 package into the backend. Simpler, but mixes the two submissions.
- Re-implementing the rating logic in SQL or JavaScript. Faster to display, but the two versions would drift
  apart.

**Consequences:** Tests use a mock of the pricing service built from its OpenAPI schema. Local
`docker-compose` runs the published pricing-service image, so peer reviewers do not depend on the hosted
service being awake.

### Approved scenarios are immutable

**Decision:** Scenarios are editable while Draft. Once Submitted they are locked. Approved or Rejected
scenarios cannot change. A change after rejection means a new scenario.

**Why:** Pricing decisions need an audit trail of what was proposed, by whom, and what was approved.

**Alternative considered:** Free editing with version history. More flexible, but harder to audit and build.

### AI output is always a draft

**Decision:** The AI assistant can read data and create draft scenarios only. It cannot submit, approve or
change a model version.

**Why:** An agent can misread drift or propose a change that looks right but is wrong. A human signs off
every pricing decision.

**Alternatives considered:**

- Agent can submit scenarios: faster, but removes a review step.
- No write access at all: safer, but loses the most useful agent workflow.

### Only aggregated data is served

**Decision:** The API exposes model outputs and aggregated tables (relativities, A/E by segment, exposure
by cell). It never serves person-level MEPS records.

**Why:** Keeps well within the spirit of the MEPS data use agreement and keeps the API small and fast.

**Alternative considered:** Serving the modelling table for drill-down. Useful, but unnecessary for the MVP
and raises data questions.

### Premiums are illustrative

**Decision:** Premiums are shown in illustrative £, scaled from relativities to a stated UK base rate
assumption. Every premium screen shows a banner saying so.

**Why:** The model is fitted on US data. Relativities transfer. Dollar levels do not.

**Alternative considered:** Showing relativities only. Honest, but a quote calculator without a premium
is hard to use.

### Rating inputs are permitted factors only

**Decision:** The quote form offers only factors a UK insurer could use: no sex, race, income or education.

**Why:** Demonstrates conduct awareness (gender-neutral pricing, fair value) as part of the product.

### Simple roles

**Decision:** Two roles: Analyst and Reviewer, with a demo login for each so reviewers can try the full
workflow. A read-only Viewer role is a future feature.

**Why:** Enough to show the approval workflow without building an organisation and permissions system.

## Main screens

### Home

Shows:

- Active model version and its key validation metrics
- Headline A/E and any recalibration flags
- Scenarios awaiting review

### Quote calculator

Profile form on one side, breakdown on the other (base rate, each factor's relativity, final risk premium),
labelled "risk premium (expected claims cost), illustrative £", with the illustrative-premium banner.

### Rating factors

One panel per factor: relativity chart with confidence band and exposure bars.

### Monitoring

A/E table and chart by factor, segment and period. PSI table. Flags with their evidence.

### Scenarios

List of scenarios with status (Draft, Submitted, Approved, Rejected), author and date.

### Scenario editor and impact

Edit the base change, relativities and caps/floors. See the impact summary and dislocation histogram update.
Save, then submit for review.

### Scenario review

Rationale, parameters, impact and audit trail, with Approve and Reject buttons (Reviewer only).

## Roles

### Analyst

Can:

- Get quotes
- Explore rating factors and monitoring
- Create, edit and submit scenarios

### Reviewer

Can also:

- Approve or reject submitted scenarios with a comment

## Inputs from Phase 1 (the contract between the two phases)

Phase 1 publishes these through the pricing web service (modelling project M10), so the app can be built
without touching the modelling code:

- **Pricing service endpoints:** `/quote` (profile → premium with factor breakdown), `/relativities`,
  `/monitoring` (A/E and PSI tables) and `/scenario-impact` (scenario → impact on the in-force book), with
  an OpenAPI schema and a published Docker image.
- **Model version metadata** (`model_version.json`): id, date, data years, trend assumptions, validation
  metrics (deviance, Gini), permitted factors.
- **Relativities table:** factor, level, relativity, exposure, lower and upper confidence bounds.
- **Base rate** and the UK scaling assumption used for illustrative premiums.
- **A/E table:** factor, level, segment, period, actual, expected, exposure.
- **PSI table:** factor, period, PSI value.
- **In-force book (aggregated):** exposure by rating cell, used for scenario impact.
- **Golden test cases:** a set of profiles with expected premiums (from the Excel reconciliation).

Notebooks stay in Phase 1 for explanation. The app depends only on the pricing service's API.

## Future to-do (after the MVP)

Trimmed from the MVP on 3 Nov 2026 to fit the 16 Nov deadline and the token budget. Build them in this order
if time allows after submission.

- Product options (excess, outpatient limit) via a product layer in the pricing service
- Model versions screen: list published versions with metadata, and publish a new version from the pricing
  service
- Version comparison: a toggle on the Rating factors screen comparing the active version with an earlier one
- Viewer role and a public read-only demo login
- CSV download of quotes, relativity tables and scenario impact
- Home: recent audit events across all scenarios (the MVP shows the audit trail on each scenario's review page)

- MCP server (read tools and draft scenario creation), moved from the MVP on 8 Nov 2026. Not scored by the course
  rubric. The "AI output is always a draft" decision above applies when it is built.
- Agent extension pack: a reusable skill and subagent definitions
- Security and audit: dependency and code scanning, AI usage policy

## Explicitly excluded from the MVP

- Fitting, refitting or recalibrating models in the app
- Real customer or policy data
- Underwriting decisions, policy administration, payments
- Conversion and elasticity modelling screens (possible follow-up)
- More than one product
- Live data feeds
- Organisations, teams or fine-grained permissions
- AI actions beyond reading data and creating draft scenarios

## Course rubric (AI Dev Tools Zoomcamp)

Source: https://github.com/DataTalksClub/ai-dev-tools-zoomcamp/tree/main/project (checked 8 Nov 2026).
12 criteria, 24 points, 10 to pass.

| # | Criterion | Max | Full marks need | Covered by |
|---|---|---|---|---|
| 1 | Problem description | 2 | README states the problem, functionality and expected behaviour | Task 20 |
| 2 | Product specification | 2 | Spec, public task tracker, acceptance criteria, evidence agents used the tracker | `plan.md`, GitHub issues, self-check comment on each issue |
| 3 | Agent team specification | 2 | Agent team and how it works together | `process.md` (Engineer, QA), Task 20 |
| 4 | Context management | 2 | `AGENTS.md` pointing to modular docs | `AGENTS.md`, `_docs/` |
| 5 | Application | 2 | Frontend, backend, database end to end · runs locally with one command | Tasks 4 to 11, 13 |
| 6 | Testing | 2 | Unit and integration tests, one command, passing | Task 12 |
| 7 | Containerisation | 2 | Whole system including database via Docker Compose, one command | Task 13 |
| 8 | Deployment | 2 | Public URL | Task 14 |
| 9 | CI/CD | 3 | 1: tests on every PR. 2: plus automatic deploy. 3: plus dev deploy and manual prod deploy | Task 15 (aim for 2) |
| 10 | Observability | 2 | Metrics, traces and structured logs sharing a trace ID for a key journey · no customer data in telemetry · viewable in a UI | Task 16 |
| 11 | Alerting on user impact | 1 | At least one alert | Task 17 |
| 12 | On-call agent | 2 | Agent wakes on an alert and fixes the issue (no half marks) | Task 18 (stretch) |

Target: 21 of 24 (2 of 3 on CI/CD, and the stretch on-call agent excluded). Pass mark: 10.

## Suggested success metrics

- Every golden test case matches the pricing package to the penny
- A quote returns in under 1 second
- Scenario impact on the full in-force book returns in under 3 seconds
- A new model version can be published and used without code changes
- A reviewer can understand a scenario's impact from its review page alone

## MVP definition

The MVP is successful when someone can (item 7, the AI assistant, moved to Future to-do on 8 Nov 2026):

1. See the active model version (v1) and its metadata
2. Quote a customer and see the factor breakdown
3. Explore relativities
4. See A/E and drift with recalibration flags
5. Create a rate-change scenario and see its impact and dislocation
6. Submit it, and have a reviewer approve or reject it with an audit trail

## Key scope principle

Keep this a **pricing decision workbench on top of a fixed model**, not a modelling platform, a policy
system or a BI tool.

## Timeline

- Phase 1 (modelling, v1-lite tariff and M10 pricing service): 1–9 Nov 2026
- Phase 2 (this app): 8–15 Nov 2026, submit by 16 Nov
- Token-saving build: generate the frontend with Lovable or a similar UI tool (outside the Claude Code
  budget), then wire it to the OpenAPI contract with Claude Code. Full QA only for scenario impact and the
  approval workflow. Everything else gets tests plus a self-check
- Suggested order: spec and stack choice → backlog → frontend with mocked API → OpenAPI → backend →
  database → tests → Docker → deploy → CI/CD → observability → alert → README (on-call agent is a stretch)
