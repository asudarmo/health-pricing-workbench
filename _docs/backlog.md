# Backlog (draft for approval)

Each task follows `task-template.md`. Dependencies need asking first unless named in `decisions.md`.

## 1. Static SPA build of the frontend
- Goal: `npm run build` outputs static files that any web server can serve.
- [ ] Build output contains `index.html` and assets, no server bundle needed at run time
- [ ] Deep links (e.g. `/scenarios/1`) work with an index.html fallback, checked by a test or script
- [ ] Mock mode still works
- Out of scope: any UI change. Files: frontend build config only.

## 2. OpenAPI contract for `/api`
- Goal: One `openapi.yaml` describes every endpoint in `client.ts`.
- [ ] 14 endpoints in `client.ts` present, with request, response and error schemas
- [ ] A script checks the schemas match `types.ts` and fails on drift
- [ ] Roles per endpoint stated (Analyst, Reviewer)

## 3. Pricing-service mock
- Goal: A mock of the pricing service, built from its OpenAPI schema plus the proposed contract in `contract-check.md`.
- [ ] Mock serves `/quote`, `/relativities`, `/monitoring`, `/scenario-impact`, `/model` with fixtures
- [ ] A test compares mock quote output to 3 golden cases from the published image
- [ ] The proposed fields are marked as proposed

## 4. Backend skeleton, database and migrations
- Goal: FastAPI app with env config, SQLAlchemy and an Alembic baseline, running in Docker.
- [ ] `GET /api/health` returns ok; settings read only from environment variables
- [ ] `alembic upgrade head` creates empty tables for users, scenarios, audit entries on SQLite
- [ ] Backend Dockerfile builds; one test passes in CI-ready form

## 5. Auth and roles
- Goal: Demo Analyst and Reviewer logins issue a signed JWT.
- [ ] `POST /api/auth/login` returns token and user for both roles; unknown role gives 422
- [ ] Reviewer-only endpoint returns 403 for Analyst and 401 without token (test)
- Constraint: asks before adding a JWT library.

## 6. Pricing client and read endpoints
- Goal: Model, relativities, monitoring and quote endpoints pass through the pricing service.
- [ ] Mapping per `contract-check.md` (selections to flags, `lower_95` to `lower`, running amount)
- [ ] Quote request with sex, race, income or education is rejected (test)
- [ ] Pricing service down gives a clear 502; every premium response carries the illustrative label
- Gate: none if mock follows the proposed contract.

## 7. Scenario storage, editing rules and audit table  (QA: yes)
- Goal: Create, list, read and update scenarios; only Draft is editable.
- [ ] Update of Submitted, Approved or Rejected returns 409 (one test per status)
- [ ] Create and update write an audit entry; AI-created scenarios always start Draft
- [ ] Author and timestamps stored

## 8. Scenario impact  (QA: yes)
- Goal: `POST /api/scenarios/impact` returns the impact via the pricing service.
- [ ] Cap/floor and percent-to-fraction mapping tested (floor 5 % becomes -0.05)
- [ ] Zero change returns 0 % average change and unchanged book
- [ ] Response matches Impact type; histogram or percentile fallback per change-request outcome
- [ ] Impact on full book returns in under 3 seconds (measured)

## 9. Submit, approve and reject  (QA: yes)
- Goal: Status workflow with comments and audit.
- [ ] Draft to Submitted by Analyst only; Submitted to Approved or Rejected by Reviewer only
- [ ] Every other transition returns 409 (table-driven test over all 16 pairs)
- [ ] Each change writes actor, time, from, to and comment; approve/reject needs a comment

## 10. Demo seed and reset
- [ ] Seed command creates 2 users and 4 scenarios, one per status, idempotent
- [ ] Runs from a documented command; no real credentials

## 11. Wire the frontend to the backend
- [ ] `VITE_USE_MOCKS=false` works against local backend through relative `/api`
- [ ] Each of the 7 MVP steps in `plan.md` can be walked through by hand; checklist recorded

## 12. Tests: unit, frontend and integration, one command
- Goal: `make test` (or equivalent) runs all suites and passes.
- [ ] Backend unit tests (mapping, status transitions) and integration tests (API + SQLite + pricing mock)
- [ ] Frontend tests (vitest) run in the same command
- [ ] One command, non-zero exit on any failure; the command is in the README
- Constraint: asks before adding a test dependency not already present.

## 13. Local docker-compose
- [ ] `docker compose up` starts Caddy, backend and published pricing image; SPA loads at localhost
- [ ] Pricing service not published to host; SQLite on a named volume survives restart

## 14. Deploy to e2-micro VM
- [ ] `deploy/` holds compose override, Caddyfile, swap setup script, runbook
- [ ] HTTPS on an sslip.io hostname; budget alert £1 created
- [ ] Costs recorded in `decisions.md`; demo logins work from another network

## 15. CI/CD (target 2 of 3 points)
- [ ] GitHub Actions run the Task 12 command on every pull request
- [ ] On merge to main, after tests pass, the VM deploys automatically; secrets only in GitHub
- [ ] Rollback: one documented command redeploys the previous image tag; tested once
- [ ] `decisions.md` notes what a dev/prod split would cost on the e2-micro (not built)

## 16. Observability
- Goal: Quote and scenario journeys emit metrics, traces and structured logs sharing a trace ID.
- [ ] OpenTelemetry in the backend; each response carries the trace ID; log lines include it
- [ ] A test shows no profile fields, tokens or passwords in logs, spans or metrics
- [ ] Signals reach the chosen free hosted UI; one trace shown linked to its logs
- [ ] Memory with backend and pricing service running stays inside the 1 GB budget (measured)
- Gate 4: hosted UI choice, see decisions.md. Asks before adding OpenTelemetry packages.

## 17. Alert on user impact
- [ ] One alert rule, for example 5xx rate or p95 latency on `/api/quotes`, stored as code or exported config
- [ ] Alert fired once on purpose and the notification seen; evidence on the issue

## 18. On-call agent (stretch, 2 points, all or nothing)
- [ ] The alert calls a webhook that starts an agent with the alert details
- [ ] The agent opens a pull request with a fix for a planted, reproducible fault
- [ ] A human merges; the agent never deploys or merges itself
- Only start if tasks 1 to 17 are done.

## 19. Adopt the new pricing image
- [ ] When the change request is delivered: pin new image tag, remove "proposed" markers, rerun tasks 3, 6, 8 tests
- [ ] If not delivered by 13 Nov, apply the percentile fallback and record it

## 20. README and course write-up
- [ ] Problem description, relation to modelling project, one-command run, screenshots
- [ ] Each course requirement in `plan.md` mapped to evidence
