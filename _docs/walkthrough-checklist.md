# Hand walk-through checklist (task 11)

Stack: `docker compose -f docker-compose.yml -f docker-compose.mock.yml up -d --build`, then
`docker compose -f docker-compose.yml -f docker-compose.mock.yml exec backend python -m app.seed`. Open http://localhost:8080.
The mock override is needed until the pricing service delivers the proposed contract (task 19).

Step 7 of `plan.md` (AI assistant) moved to Future to-do, so there are six MVP steps.

"API" means the real client module run against the live stack (`src/test/live-walk.test.ts`, 6 tests passing on 9 Nov 2026).
"Screen" is the click-through in the browser, which needs a person.

| Step | What to check | API | Screen |
|---|---|---|---|
| 1 Model version | Model id, data years, trend, base rate and the illustrative-premium banner show on Home | pass | pass |
| 2 Quote | Age, region and seven conditions give a risk premium with factor-by-factor steps · no sex input · banner shown | pass | pass |
| 3 Factors | Relativities, exposure and intervals for every level | pass | pass |
| 4 Monitoring | A/E table, PSI and the flagged segments with level shift or shape change | pass | pass |
| 5 Scenario | Create a Draft, see impact (average change, histogram, capped and floored, projected A/E), save, edit | pass | pass |
| 6 Review | Analyst submits · Reviewer approves or rejects with a comment · same person gets 403 · audit trail lists each change · Submitted is read-only | pass | pass |
| Auth | Login as Analyst and as Reviewer · reload keeps the session · a bad token returns to login | pass (401) | pass |

Known: the mock only knows the four seeded scenario requests, so a new scenario with different parameters returns 422
from the mock ("not recorded"). Against the real pricing service this limit does not exist.

Screen column signed off by the project owner on 11 Nov 2026. Free-form scenario edits return 422 from the mock, which is expected until task 19.
