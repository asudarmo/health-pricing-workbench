# Decisions

## 2026-11-08 Database: SQLite through SQLAlchemy

- **Decision:** SQLite, accessed through SQLAlchemy.
- **Why:** Zero cost, one file, no extra service for peer reviewers to run. Data volume is small (scenarios and
  audit entries). SQLAlchemy keeps a later move to Postgres cheap.
- **Alternatives:** Postgres in docker-compose (more setup, a second container); managed Postgres such as
  Cloud SQL or Supabase (cost and account setup).

## 2026-11-08 Auth: demo logins with signed JWT roles

- **Decision:** FastAPI issues a signed JWT for a demo Analyst or Reviewer login. The role is in the token and
  checked on each endpoint. Demo logins hold no real credentials.
- **Why:** Enough to show the approval workflow, no external service, works offline in docker-compose.
- **Alternatives:** Supabase Auth (outside the stack, needs an account); session cookies (more state to manage).

## 2026-11-08 Gate 3: pricing-service gaps filled by a change request

- **Decision:** Ask the pricing service for a metadata endpoint, histogram counts and projected A/E. The backend
  only translates. See `_docs/contract-check.md`.
- **Why:** Keeps monitoring and rating-adjacent logic out of this repo.
- **Alternatives:** Backend derives them (breaks the no-rating-logic rule); drop the UI fields (loses plan
  features).
