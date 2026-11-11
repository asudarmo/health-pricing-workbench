#!/bin/sh
# Cron job. If no scenario (by any author) is Submitted, adds one copy of the Submitted seed. Never changes or deletes
# existing scenarios. The full reset is manual: see deploy/runbook.md.
cd "$(dirname "$0")/.."
docker compose -f docker-compose.yml -f docker-compose.mock.yml -f deploy/docker-compose.vm.yml --env-file deploy/.env \
  exec -T backend python -m app.seed --top-up
