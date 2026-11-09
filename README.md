# Health Pricing Workbench

A web app that helps a health insurance pricing analyst quote customers, inspect rating factors, monitor
actual-versus-expected (A/E) experience and drift, and test rate changes through a reviewed approval workflow.
It is the capstone for the DataTalksClub AI Dev Tools Zoomcamp.

> Status: work in progress. Premiums are illustrative.

## Related projects

- Modelling project (Phase 1): [asudarmo/health-pricing-meps](https://github.com/asudarmo/health-pricing-meps).
  It fits the model and publishes the pricing service. This app calls that service over HTTP and contains no
  modelling code.
- UI prototype: [asudarmo/health-pricing-lovable-ui](https://github.com/asudarmo/health-pricing-lovable-ui),
  generated with Lovable and imported into `frontend/`.

See `_docs/plan.md` for the scope.

## Run the tests

One command from the repo root runs the backend tests (unit and integration, SQLite and the pricing mock), the
frontend tests and the API contract check. It exits non-zero if any step fails.

```
python scripts/test.py
```

It needs Python 3.12 with the backend virtual environment (`backend/.venv`) and Node 26.

## Run locally

```
docker compose up --build
```

Then open http://localhost:8080. Only the web container is published. Until the pricing service delivers the
proposed contract, add the mock: `docker compose -f docker-compose.yml -f docker-compose.mock.yml up --build`.

## Limitations

- **Authentication is demo-only.** There are two fixed logins (Analyst and Reviewer) and no passwords. There is
  no sign-up and no admin role. A production deployment would replace this with company single sign-on (for
  example OIDC with Entra ID or Okta), mapping identity-provider groups to the Analyst and Reviewer roles. That
  needs a login flow and token validation in the backend. The role checks and the audit trail stay as they are.
