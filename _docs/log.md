# Session log

## 2026-11-08 - Session 1

- **Done:** Repo set up and pushed (asudarmo/health-pricing-workbench). Lovable UI imported. Build verified.
  Contract check and change request for the pricing service. Decisions: DB, auth, hosting, gate 3, rubric scope.
  Plan aligned with the course rubric. 20 issues created. Task 1 (static SPA build) done.
- **Next:** Tasks 2, 3 and 4 have no dependencies. Start with 4 (backend skeleton) or 3 (pricing mock).
- **Open questions:** Observability backend (recommendation below in the chat, awaiting choice). Whether the
  pricing-service change request will be delivered by 13 Nov (task 19 fallback).

## 2026-11-08 - Session 1 (continued)

- **Done:** Tasks 4, 3, 5, 6 closed. Task 7 implemented, QA pending (issue left open).
- **Next:** QA verdict on task 7 (fresh session or subagent), then task 8 (impact) and 9 (workflow).
- **Open questions:** Any signed-in user can edit a Draft (the plan does not limit edits to the author). Scenario
  `impact` is null until task 8 wires it into save. `/api/model` and `/api/monitoring` rely on the proposed
  pricing-service `GET /model`.

## 2026-11-09 - Session 2

- **Done:** Tasks 8 and 9 QA passed (two rounds for 9) and closed. Task 10 (demo seed) done. README Limitations
  section added. Backlog and issues 10, 14, 20 updated (nightly Submitted top-up, manual reset, README walkthrough).
- **Next:** Task 2 (OpenAPI), 13 (local compose), 11 (wire the frontend).
- **Open questions:** The published pricing image lacks the proposed fields, so `/api/scenarios/impact`, saving
  scenarios and the seed work against the mock only (clean 502 against v1). Task 19 and the change request decide
  when this ends. "Capped lives" counts cells, not policies.

## 2026-11-09 Session 2 (continued): tasks 2, 13, 11, 12

- **Done:** task 2 (OpenAPI contract, JSON, drift checks both sides). Task 13 (local compose: Caddy + SPA, backend, published
  pricing image. Only port 8080 published. SQLite volume survives restart). Task 12 (`python scripts/test.py`). Task 11
  partly (live API walk passes against the stack with the pricing mock. Mock override added).
- **Next:** user ticks the Screen column in `_docs/walkthrough-checklist.md`, then close #11. Then task 14 (deploy).
- **Open:** the mock only knows the seeded scenario requests, so new scenarios with other parameters fail in the browser
  until task 19.

## 2026-11-14 Session 3: deployment, observability, v1.1, reviewer help

- **Done:** task 15 (CI tests every push, SHA-tagged public images, rollback tested on the VM). Task 16 (OpenTelemetry traces, metrics
  and logs in Grafana Cloud, privacy test, two screenshots). Task 14 (e2-micro VM, HTTPS at https://35-254-148-15.sslip.io, S$1.70
  budget alert, nightly top-up cron, memory measured, dev stack judged not to fit). Task 19 (pricing service v1.1 adopted, backend
  adapted, mock re-recorded). Style clean-up of the docs. Glossary popovers, readable and grouped recalibration flags, matching A/E
  chart colours, capped lives in lives, and `docs/reviewer-guide.md`.
- **Next:** task 17 (alert rule, fired once on purpose), task 20 (README screenshots and the course requirements table), then the
  QA-free checks of the live site on a phone. Task 18 (on-call agent) only if time allows.
- **Open:** the "Rebase" and "ABI" wording in the glossary should be checked against the pricing service. The OTLP log handler
  override uses a private SDK method, so re-check it when the SDK version changes. The Grafana stack name shows in one screenshot.
