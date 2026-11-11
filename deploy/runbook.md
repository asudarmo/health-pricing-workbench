# Runbook: e2-micro VM

Everything here is VM-specific. The app itself reads only environment variables (`DATABASE_URL`, `PRICING_SERVICE_URL`,
`JWT_SECRET`) and calls relative `/api`, so it can move to another host unchanged.

## Cost

| Item | Cost |
|---|---|
| e2-micro VM in us-west1, us-central1 or us-east1 (730 hours a month free) | free |
| 30 GB standard persistent disk | free |
| External IPv4 address | about $0.005 an hour, roughly $3.65 a month |
| Egress to the internet | first 1 GB a month free from the US regions, then paid; demo traffic is small |

Expect about $3.65 a month, or about $7.30 for the two months to the deadline. Check the current prices before creating
the VM.

## One-off setup (from your laptop)

Replace `PROJECT` and `BILLING_ACCOUNT_ID`. Run `gcloud billing accounts list` for the id.

```
gcloud services enable compute.googleapis.com billingbudgets.googleapis.com --project PROJECT

gcloud compute instances create hpw --project PROJECT --zone us-central1-a \
  --machine-type e2-micro --image-family debian-12 --image-project debian-cloud \
  --boot-disk-size 30GB --boot-disk-type pd-standard --tags http-server,https-server

gcloud compute firewall-rules create hpw-web --project PROJECT --allow tcp:80,tcp:443 \
  --target-tags http-server,https-server

gcloud compute instances describe hpw --project PROJECT --zone us-central1-a \
  --format="value(networkInterfaces[0].accessConfigs[0].natIP)"
```

Budget alert. The budget must use the billing account's currency; if that is not GBP, use the equivalent of £1.

```
gcloud billing budgets create --billing-account BILLING_ACCOUNT_ID --display-name hpw-budget \
  --budget-amount 1GBP --threshold-rule percent=0.5 --threshold-rule percent=1.0
```

Email alerts go to the billing account administrators by default.

## On the VM

```
gcloud compute ssh hpw --project PROJECT --zone us-central1-a
git clone https://github.com/asudarmo/health-pricing-workbench && cd health-pricing-workbench
sh deploy/setup-swap.sh
sh deploy/install-docker.sh        # then log out and back in
cp deploy/env.example deploy/.env  # set IMAGE_TAG, SITE_ADDRESS (<ip-with-dashes>.sslip.io) and JWT_SECRET
```

Deploy a tag:

```
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.mock.yml -f deploy/docker-compose.vm.yml --env-file deploy/.env"
$COMPOSE pull && $COMPOSE up -d
$COMPOSE exec backend python -m app.seed      # first time only: loads the four demo scenarios
```

The images are public on GHCR, so no login is needed on the VM.

## Roll back

Set `IMAGE_TAG` in `deploy/.env` to the previous git SHA, then run `$COMPOSE pull && $COMPOSE up -d`. The database is
on a volume, so data stays. Migrations only add; if a migration must be undone, restore the database from a backup first.

## Nightly top-up (cron)

Adds one copy of the Submitted demo scenario when nothing is Submitted. It never changes or deletes existing scenarios.

```
crontab -e
15 3 * * * /home/YOUR_USER/health-pricing-workbench/deploy/nightly-top-up.sh >> /home/YOUR_USER/top-up.log 2>&1
```

## Reset the demo (manual, you run it)

Deletes ALL scenarios and audit entries, then reloads the four seeds:

```
$COMPOSE exec backend python -m app.seed --reset
```

## Back up the database

```
$COMPOSE exec backend python -c "import sqlite3; s=sqlite3.connect('/data/workbench.db'); d=sqlite3.connect('/data/backup.db'); s.backup(d)"
$COMPOSE cp backend:/data/backup.db ./backup.db
```

## Check memory (after the first deploy)

```
free -m && docker stats --no-stream
```

Record the numbers in `_docs/log.md`. Task 14 also asks whether a second (dev) stack would fit.
