# Reviewer guide

A short tour of the Health Pricing Workbench, page by page. No insurance knowledge is needed. Tap or click any term with a dotted
underline to see what it means and how to read it.

Open https://35-254-148-15.sslip.io and choose a demo role on the login page. The demo logins hold no real credentials.
Every price shown is illustrative, and the banner on each premium screen says so.

## Sign in

- [ ] Sign in as **Analyst**. Your name and role appear at the top right.
- [ ] Reload the page. You stay signed in.
- [ ] Sign out, then sign in as **Reviewer** (you will need this role in the Scenarios step).

## Home

- [ ] The active model, base rate, Gini and headline A/E show, each with a short explanation behind the term.
- [ ] The illustrative-premium banner is visible.
- [ ] Five recalibration flags appear, largest first, and "View all" opens Monitoring.
- [ ] "Scenarios awaiting review" lists the Submitted demo scenario.

## Quote

- [ ] Change the age, region or a condition. The premium recalculates.
- [ ] The table shows the base rate, then each factor step by step, down to the final premium.
- [ ] There is no sex, race, income or education input. Only permitted rating factors are offered.

## Rating factors

- [ ] Pick a factor. The chart shows the relativity with its confidence band, and the exposure behind each level.
- [ ] Levels with little exposure have wider bands.

## Monitoring

- [ ] Flags are grouped into level shift and change in shape, with readable names such as "High blood pressure: Yes".
- [ ] In the A/E chart, red bars match the red numbers in the table (claims higher than expected), green means lower, black is close to 1.
- [ ] Change the factor, segment and period filters. The chart and table follow.
- [ ] The PSI table shows whether the customer mix has shifted.

## Scenarios

- [ ] Open a Draft scenario. Change the base rate, cap, floor or a relativity. The live impact updates.
- [ ] The impact shows the average premium change, the projected A/E, capped and floored lives, and the dislocation chart.
- [ ] Save the Draft, then submit it as the Analyst.
- [ ] Open the Submitted scenario. It is read-only.
- [ ] Sign in as the Reviewer. Approve or reject it with a comment.
- [ ] Try to approve a scenario you submitted yourself. The app refuses (403).
- [ ] Open the audit trail. Every status change is listed with who made it and when.

## Behind the scenes

- [ ] Every API response carries an `X-Trace-Id` header. The same ID appears in the logs and traces (see the README screenshots).
- [ ] The pricing numbers come from a separate pricing service, not from this app. The README explains how the projects relate.
