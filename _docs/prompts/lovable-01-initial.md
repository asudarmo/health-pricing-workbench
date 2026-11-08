Build "Health Pricing Workbench", a desktop-first internal web app for a health insurance pricing analyst. Use React, TypeScript, Tailwind, shadcn/ui and Recharts. Style: clean, professional, data-dense, light theme. British English, £ amounts, dates like 05 Nov 2026.

FRONTEND ONLY. Do not enable Lovable Cloud or Supabase. No database, no edge functions, no real auth. A separate FastAPI backend will replace the mocks later.

## API client (most important requirement)

- All data access goes through src/api/client.ts. Types live in src/api/types.ts. Mock data and mock logic live in src/api/mock/.
- Components and pages never import from src/api/mock/ and never compute pricing numbers.
- Each client function maps to exactly one endpoint below and is async. A flag VITE_USE_MOCKS (default true) selects mocks. Otherwise it uses fetch against VITE_API_BASE_URL, sending the bearer token.
- Mocks wait 200 to 400 ms, keep scenario state in memory, and enforce the same status and role rules as the endpoints, returning 403 or 409 style errors. Show errors in a toast.
- Show a small "Mock data" badge in the header when mocks are on.

Endpoints:
- POST /api/auth/login {role} returns {token, user: {name, role}}
- GET /api/model returns {id, date, dataYears, trend, rebase, validation: {deviance, gini}, baseRate, currency, scalingNote, factors: [{key, label, group: "age"|"region"|"condition", levels: [{value, label}]}], headlineAE, recalibrationFlagCount}
- POST /api/quotes {age, selections: {factorKey: levelValue}} returns {baseRate, steps: [{factor, level, relativity, runningAmount}], riskPremium}
- GET /api/relativities returns [{factor, level, relativity, exposure, lower, upper}] where lower and upper may be null
- GET /api/monitoring returns {ae: [{factor, level, segment, period, actual, expected, exposure, ae}], psi: [{factor, period, psi}], flags: [{id, segment, ae, exposure, gapType: "level shift"|"change in shape", note}]}
- GET /api/scenarios returns a list of {id, name, status, author, updatedAt}
- GET /api/scenarios/{id} returns the full scenario with params, rationale, impact and any review comment
- POST /api/scenarios creates a Draft. PUT /api/scenarios/{id} updates a Draft only
- POST /api/scenarios/impact {params} returns the impact without saving
- POST /api/scenarios/{id}/submit moves Draft to Submitted
- POST /api/scenarios/{id}/approve {comment} and POST /api/scenarios/{id}/reject {comment} are Reviewer only and need Submitted status
- GET /api/scenarios/{id}/audit returns [{at, actor, action, fromStatus, toStatus, comment}]

Scenario params: {baseRateChangePct, relativityChanges: [{factor, level, newRelativity}], capPct, floorPct}.
Impact: {averageChangePct, histogram: [{bucket, policies}], cappedPolicies, flooredPolicies, projectedAE, affectedSegments: [{segment, averageChangePct}]}.

## Roles and login

A login page has two buttons, "Sign in as Analyst" and "Sign in as Reviewer". Keep the session in localStorage and show the user, role and a sign-out link in the header. Analyst can quote, explore rating factors and monitoring, and create, edit and submit scenarios. Reviewer can do all of that and also approve or reject. Hide Approve and Reject from Analysts.

## Screens (left navigation)

1. Home: active model version with key validation metrics, headline A/E, recalibration flags, and scenarios awaiting review.
2. Quote: profile form on the left, built entirely from GET /api/model factors so that factors can change without code changes. Age is a number input (0 to 100) and the mock maps it to its band. Conditions are checkboxes. Region is a select. On the right, a breakdown table from base rate through each relativity to the final amount, labelled "Risk premium (expected claims cost), illustrative £".
3. Rating factors: one panel per factor with a relativity chart, confidence band and exposure bars. Handle null bounds without breaking.
4. Monitoring: A/E table and chart with filters for factor, segment and period, a PSI table, and flag cards showing A/E, exposure and gap type.
5. Scenarios: list with status badge, author and date, status filter and a New scenario button.
6. Scenario editor: name, rationale, base rate change, relativity changes per factor level, cap and floor. A live impact panel shows average change, dislocation histogram, capped and floored counts, projected A/E and affected segments, refreshing about 400 ms after an edit. Buttons are Save draft and Submit for review. Submitted, Approved and Rejected scenarios open read-only.
7. Scenario review: rationale, parameters, impact and audit trail for one scenario, with Approve and Reject (comment required). The page must let a reviewer understand the impact on its own. A Rejected scenario offers "Copy to new draft", which creates a new Draft and leaves the original unchanged.

On every screen that shows a premium, show this banner: "Risk premium (expected claims cost), illustrative £. Scaled to a UK mean of about £576 per life (ABI 2023, all covered lives). The model is fitted on US data."

## Rules

- Do not offer sex, race, income, education, smoking or BMI as inputs anywhere. Do not add excess or outpatient limit inputs.
- Show only aggregated data, never person-level records.
- Status flow: Draft to Submitted to Approved or Rejected. Only Draft can be edited. Every status change adds an audit entry.

## Mock data

Model: id v1, date 05 Nov 2026, data years 2022, trend 1.019, rebase 1.06, deviance 838,173, Gini 0.378, base rate £556, scaling note "Scaled to a mean of about £576 per life, ABI 2023, all covered lives". This base rate applies to the reference profile and gives an average of about £576 across the book. Use about £576 as the book average in all mock scenario and Home figures.

Relativities as level: relativity (exposure, lower, upper).
Age: 00-04: 0.300 (693, 0.177, 0.509), 05-14: 0.231 (2002, 0.164, 0.325), 15-17: 0.459 (634, 0.289, 0.728), 18-24: 0.299 (1169, 0.205, 0.438), 25-29: 0.432 (945, 0.292, 0.637), 30-34: 0.553 (1020, 0.389, 0.785), 35-39: 0.667 (1116, 0.477, 0.932), 40-44: 0.742 (1046, 0.537, 1.024), 45-49: 0.781 (994, 0.570, 1.071), 50-54: 0.825 (1127, 0.619, 1.099), 55-59: 0.892 (1221, 0.682, 1.166), 60-64: 0.963 (1283, 0.747, 1.241), 65-69: 0.963 (1300, null, null), 70-74: 0.963 (1168, 0.751, 1.232), 75-79: 0.963 (785, 0.731, 1.266), 80+: 0.963 (938, 0.736, 1.258).
Region: Northeast 1.152 (2771, 0.971, 1.366), Midwest 1.187 (3505, 1.009, 1.395), South 1.000 (6704, 1.000, 1.000), West 1.090 (4460, 0.935, 1.271).
Conditions, relativity when present and 1.000 when absent: High blood pressure 1.108 (5312, 0.959, 1.280), Coronary heart disease 1.382 (841, 1.096, 1.743), Other heart disease 1.226 (1716, 1.034, 1.452), High cholesterol 0.996 (5013, 0.864, 1.146), Cancer 1.767 (1862, 1.505, 2.074), Arthritis 1.674 (4186, 1.452, 1.928), Asthma 1.277 (2449, 1.090, 1.495).

Monitoring: segments All, Under 60 and 60+, periods 2022 and 2023, realistic A/E near 1.00. Seed one flag on 60+ with A/E 1.12, a level shift, and PSI values from 0.02 to 0.14 for age, region and conditions.

Scenarios: seed five, one per status plus a second Draft with author "AI assistant (draft)", each with a rationale citing A/E and exposure, and matching audit entries. The mock impact must be deterministic and respond to all params.

## Out of scope

Do not build model version lists or comparison, a Viewer role, CSV downloads, an in-app AI chat, a global audit feed, or settings pages.
