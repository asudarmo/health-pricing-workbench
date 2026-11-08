# AGENTS.md

Health Pricing Workbench: a web app that helps a health insurance pricing analyst quote customers, inspect
rating factors, monitor A/E and drift, and test rate changes through a reviewed approval workflow. It is the
capstone for the DataTalksClub AI Dev Tools Zoomcamp, due 16 Nov 2026. The scope is in `_docs/plan.md`. Read it
before starting any task.

Audience for all outputs: an actuarial pricing reviewer and course peer reviewers. Write in plain British
English, following `_docs/writing-style.md`.

## Relationship to the modelling project

All pricing numbers come from the Phase 1 pricing service (`asudarmo/health-pricing-meps`, milestone M10) over
HTTP. This repo contains no modelling code. Both READMEs must say how the two projects relate.

## Commands

To be extended as each part is built. Keep this section accurate.

Frontend (`frontend/`, Node 26): `npm install`, `npm run build` (static SPA in `dist/client`), `npm run check:spa`,
`npm test`.

Backend (`backend/`, Python 3.12, venv in `backend/.venv`): from `backend/`, `python -m unittest discover -s tests -t .`;
`alembic upgrade head`; `uvicorn app.main:app`. Settings come from environment variables (`DATABASE_URL`, `JWT_SECRET`,
`PRICING_SERVICE_URL`). Docker: `docker build -t hpw-backend backend`.
Pricing mock: `backend/tests/pricing_mock/` (recorded from the published image; re-record with
`backend/tools/record_fixtures.py <url>`). Fields marked proposed are not in the published image.

## Structure

- `frontend/` - React UI generated with Lovable, then wired to the backend. All API calls go through one client
  module.
- `backend/` - FastAPI app. Owns auth, scenarios and the audit trail, and calls the pricing service.
- `mcp-server/` - future: MCP server (moved to Future to-do on 8 Nov 2026).
- `_docs/` - plan, process, decisions, log and prompts.

## Rules

- No fitting, refitting or rating logic in this repo. Never reimplement the pricing service's calculations.
- Serve aggregated data only. Never serve person-level MEPS records.
- Quote inputs are permitted rating factors only: no sex, race, income or education.
- Every premium screen shows the illustrative-premium banner.
- Scenarios are editable while Draft only. Submitted, Approved and Rejected scenarios are immutable. Every
  status change writes to the audit trail.
- When the AI assistant is built (future): it can read data and create Draft scenarios. It can never submit,
  approve or change a model version.
- Tests use a mock of the pricing service built from its OpenAPI schema. Local `docker-compose` uses the
  published pricing-service image.
- Do not add a dependency without asking.
- Never commit secrets. Demo logins contain no real credentials.
- Record each design choice in `_docs/decisions.md` (date, decision, why, alternatives).
- End each session with a short entry in `_docs/log.md`: done, next, open questions.
- Commit after each meaningful step with a clear message.

## Decision gates: STOP and ask the user

Present the options, recommend one, and wait:

1. Any change to the scope in `_docs/plan.md`, including anything from "Future to-do"
2. Any change to the role permissions or the approval workflow
3. A mismatch between the pricing service's contract and what this app needs
4. Choice of database, hosting or auth approach, if not already in `_docs/decisions.md`

## Verification

- Scenario impact and the approval workflow get a separate QA pass (see `_docs/process.md`).
- Everything else gets tests plus a recorded self-check.

## Documents

- `_docs/plan.md` - product spec, the source of truth for scope
- `_docs/process.md` - how work is organised (read at the start of every session)
- `_docs/task-template.md` - template for tasks
- `_docs/writing-style.md` - writing rules for all prose
- `_docs/decisions.md` - decision log
- `_docs/log.md` - session log
- `_docs/backlog.md` - backlog; the tracker is GitHub issues
- `_docs/prompts/` - prompts used for AI-generated work, kept for the course write-up
