# Security policy

Report anything security related to **songbird@tuta.com**. Do not open it in a
public channel.

## In scope

- The live service at <https://readback-score.victor-villegas.workers.dev/>.
- The code in this repository.

Out of scope: TypeSafe, which does the scoring. Report those to TypeSafe.

## What to send

The rule or the request that triggered it, what you expected, and what
happened. A reproduction is worth more than a scanner report.

Do not run load tests or automated scanners against the live service. Every
scored rule costs money. Run a local copy instead, with
`npx --yes wrangler dev`.

## What to expect

One maintainer, no bug bounty, and no guaranteed response time.
