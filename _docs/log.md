# Session log

## 2026-11-08 - Session 1

- **Done:** Repo set up and pushed (asudarmo/health-pricing-workbench). Lovable UI imported; build verified.
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

- **Done:** task 2 (OpenAPI contract, JSON, drift checks both sides); task 13 (local compose: Caddy + SPA, backend, published
  pricing image; only port 8080 published; SQLite volume survives restart); task 12 (`python scripts/test.py`); task 11
  partly (live API walk passes against the stack with the pricing mock; mock override added).
- **Next:** user ticks the Screen column in `_docs/walkthrough-checklist.md`, then close #11. Then task 14 (deploy).
- **Open:** the mock only knows the seeded scenario requests, so new scenarios with other parameters fail in the browser
  until task 19.
