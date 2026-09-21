# rule-lab

Measures whether a rule in CLAUDE.md changes what a real headless Claude Code
session does. Successor to the lost v1 calibration harness; its design notes live
in `FINDINGS.md`, which is also the lab notebook and the loop's memory.

**This was local-only research until 2026-09-20.** It lived in another repository
under a gitignored `docs/` tree, in one copy, and called itself never published.
It now belongs to Disregard, which is the app its measurements back, and it is
tracked here. `harness.test.js` runs as part of this repository's check.

## Usage

```
node harness.js list
node harness.js run --exp exp-001-framing --dry-run     # cell matrix, no API calls
node harness.js run --exp exp-001-framing --limit 1     # single live smoke cell
node harness.js run --exp exp-001-framing --resume      # full run, resumable
node harness.js analyze --exp exp-001-framing           # lift + CI + verdicts
node --test harness.test.js                             # harness self-tests
```

Options for `run`: `--reps N`, `--model M` (default haiku), `--concurrency N`
(default 2), `--seed N`, `--keep` (keep fixture dirs for inspection).

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
- The `claude` CLI must be logged in; each cell is a real (paid) run — check the cell count with `--dry-run` before launching, and prefer `--limit 1` smoke first.

## 2026-07-22 — roadmap 052: `--max-turns` retired

`--max-turns` is gone from `claude --help` on the installed CLI (v2.1.216); it
silently did nothing on this harness's cells. Swapped `runClaude`'s turn cap
for `--max-budget-usd`, mirroring `proof/lib/claude.js`'s adapter (same flag,
same default: `0.25`). The harness's `maxTurns` config knob (top-level
default and per-experiment JSON override) is renamed `maxBudgetUsd` to
match; public API and result-record shape are unchanged. Existing experiment
JSON specs under `experiments/` still carry their old `"maxTurns"` key —
it's simply no longer read (all of them fall back to the `0.25` default,
same value every cell in `results/` was already run with as `maxTurns: 12`'s
sibling budget cap was never separately configured).

Verified: `node --test harness.test.js` — 10/10 pass, no test asserted the
old flag directly. Live smoke: one baseline cell run through the real fixed
harness (isolated via `RULE_LAB_DIR` so no existing `results/` data was
touched or overwritten) — `ok:true valid:true compliance:1`, `turns:2`,
`costUsd:0.064`, spawned with `--max-budget-usd 0.2` and no `--max-turns`
anywhere in the process args.
