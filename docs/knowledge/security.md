---
type: knowledge
summary: "Defines the private reporting channel, scope, and testing limits for suspected Disregard security issues; read before reporting a vulnerability."
related_files:
  - api/score.js
  - lib/score-rate-limit.js
  - worker.js
  - docs/knowledge/development.md
---

# Security policy

Report anything security related to **victor.villegas@tuta.com**. Do not open it
in a public channel.

## In scope

- The live service at <https://disregard.dev/> and
  <https://disregard-score.victor-villegas.workers.dev/>.
- The code in this repository.

Out of scope: TypeSafe, which does the scoring. Report those to TypeSafe.

## What to send

The rule or the request that triggered it, what you expected, and what
happened. A reproduction is worth more than a scanner report.

Do not run load tests or automated scanners against the live service. Every
scored rule can cost money, including when a local server calls TypeSafe.
Use the offline tests and local mock browser checks in
[development setup](development.md) for routine verification.

## What to expect

One maintainer, no bug bounty, and no guaranteed response time.
