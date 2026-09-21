# rule-lab

Measures whether a rule in CLAUDE.md changes what a real headless Claude Code
session does. Its design notes, its experiment log and every harness change live
in [FINDINGS.md](FINDINGS.md), which is the lab notebook and the loop's memory.

**This was local-only research until 2026-09-20.** It lived in another repository
under a gitignored `docs/` tree, in one copy, and called itself never published.
It now belongs to Disregard, which is the app its measurements back, and it is
tracked here. `harness.test.js` runs as part of this repository's check.

## Requirements

- **Node 18 or later**, the same version the rest of the repository needs.
  Checked on 22.22.2. Nothing to install, and no `package.json`.
- **A logged-in `claude` CLI**, for everything except `list` and `--dry-run`.
- **A budget.** Every cell is a real paid run. Count the cells with `--dry-run`
  before launching, and smoke one with `--limit 1` first.

## Usage

Start with `list`. It spends nothing, and it names every experiment with the
cells it already has.

```bash
node harness.js list
```

Expected output, one line per experiment. The last two of twelve:

```text
exp-010-pilot — Q9 — The 2026-07 intents are still anti-default on a Claude-5 tier. (40 cells done)
exp-010-pilot2 — Q9 — Two fresh intents are anti-default on a Claude-5 tier, so each contrast can have a second one. (10 cells done)
```

The rest, in the order a new experiment goes through them:

```bash
node harness.js run --exp exp-001-framing --dry-run     # cell matrix, no API calls
node harness.js run --exp exp-001-framing --limit 1     # single live smoke cell
node harness.js run --exp exp-001-framing --resume      # full run, resumable
node harness.js analyze --exp exp-001-framing           # lift + CI + verdicts
node --test harness.test.js                             # harness self-tests
```

Options for `run`: `--reps N` (default 5), `--model M` (default haiku),
`--concurrency N` (default 2), `--seed N` (default 42), and `--keep` to keep the
fixture dirs for inspection.

Each cell is capped by `maxBudgetUsd`, which defaults to 0.25 and can be set per
experiment in its JSON spec. The three `exp-010-*` specs raise it to 0.35. Point
`RULE_LAB_DIR` at another directory to run against a different lab's
`experiments/` and `results/`, which is how a run stays clear of the data here.

## How a cell works

fixture dir (temp) → CLAUDE.md with the variant rule (or none for baseline) →
`claude -p <task> --output-format json --dangerously-skip-permissions` → validity
graders (was the task attempted?) → compliance graders (was the rule followed?) →
`results/<exp>/cells/<cell>.json`. Analysis pools reps, computes lift over the
intent's baseline, bootstraps a 95% CI, and assigns CONFIRMED+/CONFIRMED-/NULL/
INCONCLUSIVE per variant per intent.

## Authoring experiments

One JSON per experiment in `experiments/`. Rules of the house:

- Vary ONE structural factor; every other word stays as identical as possible.
- Same intent, multiple phrasings — never compare different rules to each other.
- ≥ 2 intents per experiment; a finding that doesn't replicate across intents is OPEN, not a finding.
- Intents must be anti-default: design the task so the baseline naturally violates the rule. Analysis flags intents whose baseline compliance is ≥ 0.5 as uninformative.
- Every absence-grader needs a validity gate, or "did nothing" grades as compliant.
