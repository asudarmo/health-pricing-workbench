# Process

## Tasks

- Order of work: spec, stack options, then a bounded backlog in GitHub issues.
- Each task is small enough for one session and follows `_docs/task-template.md`. The engineer writes or
  tightens its acceptance criteria before starting.
- Acceptance criteria must be bounded. Name the exact items, or the exact test that covers them.
- If a task reaches a decision gate (`AGENTS.md`), stop and ask the user.

## Roles

- Engineer: writes the task's criteria if needed, implements it and tests it.
- QA (lite): checks the result against the acceptance criteria in a fresh session or subagent. Used only where
  the QA scope below requires it. QA does not fix code, it outputs PASS or FAIL.

## Lifecycle

1. Pick the next open task and check its acceptance criteria
2. Engineer implements it, with tests
3. If the task is in QA scope, QA verifies it. On FAIL, back to step 2 with the QA comment as input. After two
   FAIL rounds, stop and escalate to the user
4. Otherwise, the engineer records a self-check against each criterion as a comment on the GitHub issue
   (`gh issue comment`). This is the course evidence that agents used the tracker. QA tasks also get the QA
   verdict as a comment
5. Close the task

## QA scope (lite)

- Full QA applies only to scenario impact and the approval workflow, plus any task the user flags.
- Everything else gets the engineer's tests plus a recorded self-check.
- Style and grammar notes are never blocking.

## Token-saving tactics

- Start a fresh session for each task or small group of related tasks.
- Keep reports under 150 words: what changed, the test summary line, and anything the user must decide.
- Run targeted tests while working. Run the full suite once a day.
- Read only the files a task needs. Prefer `grep` and targeted reads.
- Do not re-verify closed tasks.
- Ask before starting work outside `_docs/plan.md`.
