---
type: task_summary
status: active
summary: "Full pass over every non-code file in the repository: stale paths and references, AGENTS.md, the READMEs, docs/ frontmatter and truthfulness, the anneal audit, agent-host parity for Codex, Antigravity and Claude Code, .gitignore leaks, and author identity; read to see what was checked, what changed, what was left alone on purpose, and the decisions that are the owner's."
related_files:
  - "AGENTS.md"
  - "README.md"
  - "CONTRIBUTING.md"
  - "SECURITY.md"
  - ".gitignore"
  - ".claude/settings.json"
  - "docs/knowledge/agent-host-compatibility.md"
  - "eval/README.md"
  - "research/rule-lab/README.md"
  - "research/rule-lab/FINDINGS.md"
---

# Documentation and non-code pass

## Objective

No document in the repository may say something the repository contradicts, and
Codex, Antigravity and Claude Code must all work from the same instructions.

## Completion criteria

- [x] Every relative link and every `related_files` entry resolves.
- [x] AGENTS.md repeats nothing from the owner's global instructions.
- [x] Each README reviewed with the `readme` skill, checker at `0 findings`.
- [x] Every file under `docs/` has `type`, `summary` and `related_files`, and each `task_summary` a `status`.
- [x] Every confirmed false or stale claim corrected, or listed below as left alone.
- [x] `anneal` audit run, findings recorded below.
- [x] The two completed task notes folded into topic documents and removed.
- [x] Codex, Antigravity and Claude Code load the same `AGENTS.md`.
- [x] `.gitignore` reviewed, tracked files scanned for private data.
- [x] Author identity is `Victor Villegas <victor.villegas@tuta.com>` in the repository-local Git config, LICENSE and SECURITY.md.
- [x] `node --test` passes: 57 of 57.
- [ ] The owner's two decisions below.
- [x] Skill frontmatter review: the repository holds no skill to review.

## Conclusion

The pass landed on `main` through pull request #3. Nothing was deployed.
`public/research.html` changed, so the live page keeps the old cost sentence
until the next deploy.

### What was false, and is fixed

| Claim | Where | Truth |
| --- | --- | --- |
| Only `det-eval.js` is free | AGENTS.md, README.md, CONTRIBUTING.md | `lang-eval.js` makes no network call either. Two free, four paid. |
| `run --exp exp-007-position --model <m> --resume` adds a model column | CONTRIBUTING.md | It runs 0 cells. Results are stored by experiment id, and without `--resume` it overwrites tracked cells. A new model needs a spec copied to a new id. |
| The same commands against `exp-001-framing` | research/rule-lab/README.md | Same hazard. Now shown with `<exp>` and a warning. |
| A full column costs about $41 | CONTRIBUTING.md, public/research.html | $41 is the three exp-010 contrasts on a mid tier. $3 to $12 was the small-tier price. |
| Six machine-translated locales | README.md, CONTRIBUTING.md, groundwork note | Five. English is the source. |
| "The last two of twelve" experiments, three `exp-010-*` budget specs | research/rule-lab/README.md, FINDINGS.md | Fourteen specs, five with `maxBudgetUsd` 0.35. |
| Lift 1.00 in 11 of 12 arms, 1,200+ cells, $3.94 of pilots | FINDINGS.md | 13 of 14, 1,530 cells, $3.93. Counted from the `analysis.json` files and the cells. |
| The F3 value is mapped onto 0 to 1 bands | f3-trigger-distance-criteria.md | No code does that. The raw 0 to 4 value is used, and `NO_TRIGGER = 1.5` is the only cut. |
| Criteria code blocks with `F3_CRITERIA`, `SCREEN` | f3 and injection documents | Those names do not exist. The copies were replaced by pointers to `V2`, `INSTRUCTIONS_V2` and `V3`. |
| "The corpus is 36 rules", "four remaining errors" | f1-f7 and is-rule documents | 56 rules, three errors. |
| A weighted grade, our own tips table, two Jev questions | jev-commercial-licensing.md | No grade, no tips table, six questions. This paragraph carries the §2.3(a) argument. |
| Rate limit on our endpoint, a fallback mode, terms under the input box | jev-commercial-licensing.md | None of the three exists. Each is now stated as not done. |
| The 2,020 cells carry no path | ADR, groundwork note | Two exp-001 cells carry `fixtureDir: X:\Temp\rule-lab-…`. No username or email. |
| The repository has no remote yet, is to be published | ADR, groundwork note | Public at github.com/V-Songbird/disregard. |
| The README table's "Held out" column | README.md | The injection set has no held-out split, and the language figure mixed two halves. The column is now "Measured". |
| Thresholds all live in `lib/analyze.js` | AGENTS.md, README.md | `MIN_TOKENS` and `MIN_HITS` are in `lib/language.js`. |

The ADR, the feasibility probe and the field guide each gained a short status
block instead of a rewrite. They are records of an argument, so the block says
what shipped and which passages describe the retired assay plugin.

### anneal audit

| Finding | Severity | Decision |
| --- | --- | --- |
| `check-command-missing` | high | Declined. The audit looks for a package script or a make target, and this project has no `package.json` on purpose. The one check command is in AGENTS.md, quiet when it passes, and a single-file form was added. |
| `default-exports` in `worker.js` | low | Declined. Cloudflare Workers require it. |

Map file under 200 lines, `.nvmrc`, tests beside code and `.dev.vars.example`
were already in place.

### Agent hosts

All three hosts read the root `AGENTS.md`, and nothing else should be added. The
facts and their sources are in
[agent-host-compatibility.md](../knowledge/agent-host-compatibility.md).
`.claude/settings.json` now denies `Read(./.dev.vars)` and `Read(.wrangler/**)`,
and the pattern `Read(**/*.idea)`, which matched nothing, became
`Read(.idea/**)`.

### Skills

The `skill-frontmatter` audit found nothing to audit. No `SKILL.md` and no
`agents/openai.yaml` exists under `.claude/skills/`, `.agents/skills/`,
`.agent/skills/` or `.codex/`, tracked, untracked or ignored, and Git history
never held one. The skills this pass used, `readme` and `anneal`, are installed
at user level for Claude Code only. They are not part of this repository, so a
Codex or Antigravity session here does not have them.

### `.gitignore` and private data

Template entries for folders this repository does not have were removed:
`tasks/plans/`, `labs/`, `evals/`, `benchmarks/`. The `evals/results/` entry sat
one letter away from `eval/results/`, which is tracked on purpose. No key or
token was found in tracked files. The owner's name and address are public on
purpose: the commits, the service URL, LICENSE and SECURITY.md all carry them.
Commits on `main` carry the author name `Songbird` with the same address. A
squash merge takes the name from the GitHub profile, not from the local Git
config.

## Decisions that are the owner's

1. **Is the F3 held-out set spent?** One criteria revision was diagnosed on the
   held-out case `english-docs`, which is the standard the other four sets were
   retired by. The F3 document discloses the revision. "Four held-out halves are
   spent" was left as written.
2. **A `CLAUDE.md` holding only `@AGENTS.md`.** This session's startup context
   listed the global instructions and the memory index, and not this
   repository's `AGENTS.md`. The documented fallback is that one-line file. It
   reverses the owner's earlier removal, so it was not added.

## Not verified

- The quick-start `curl` in README.md. It spends a paid Jev request. The F1, F2
  and F7 values in its sample output do match `lib/scorer.js` run locally.
- `npx wrangler dev` and `npx wrangler deploy`, which need a key and an account.
- Figures that come from the `slag` repository, from TypeSafe's contract pages
  or from competitors' sites.

## Residual README gaps, carried from the earlier review

- README.md prints `F1`, `F3`, `F8` and `primitive` in the quick start about
  thirty lines before it defines them.
- research/rule-lab/README.md says nothing about when not to use the harness,
  defines none of the lab's vocabulary, and routes nobody to the results.

## Evidence

| Check | Result |
| --- | --- |
| `node --test --test-reporter=dot` | passed, 57 dots |
| Link and frontmatter script over 20 Markdown files | passed, 0 problems |
| `check_readme.py --tier standard` on the three READMEs | passed, `0 findings` each |
| `node eval/det-eval.js`, free | passed, matches `eval/results/det-latest.txt` |
| Cell count and cost summed from `results/*/cells/` | 2,020 cells, $111.61 |
| `harness.js run --exp exp-007-position --model sonnet --resume --dry-run` | `"cellsToRun": 0` |
| Paid eval harnesses, `harness.js run` without `--dry-run`, deploy | not run |

## Rejected Alternatives

- **Rewriting the ADR, the probe and the field guide in the present tense.** They
  record an argument and a source as they were. A status block costs a reader
  less than losing the reasoning.
- **Stripping `fixtureDir` from the two cells.** The cells are measured data, and
  the path names no person. The documents were corrected instead.
- **Adding a `package.json` or a Makefile to satisfy the anneal audit.** The
  project's own rule is no manifest and no build step, and that rule wins.
- **Defining the lab's vocabulary in the rule-lab README.** FINDINGS.md defines
  it and the README links there. A second definition would drift.
- **Keeping the two completed task notes.** Their unique content moved to
  eval/README.md, FINDINGS.md and this note, and Git keeps the rest.
