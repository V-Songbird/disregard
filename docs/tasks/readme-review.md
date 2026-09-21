---
type: task_summary
status: completed
summary: "Scored review of the two READMEs in this repository, the root one and research/rule-lab's, against the README rubric, and the six defects it found, all of them now fixed; records what each file was changed to, which facts were verified against the code and which were left unverified."
related_files:
  - "README.md"
  - "research/rule-lab/README.md"
  - "research/rule-lab/FINDINGS.md"
  - "research/rule-lab/harness.js"
  - "lib/analyze.js"
  - "lib/questions.js"
---

# README review

## Objective

Review both READMEs as a newcomer's front door. Score each against the rubric in
the `readme` skill, verify every checkable claim against the repository, name the
defects that cost a reader something, and fix them.

## Conclusion

| README | Before | After | Band after |
| --- | ---: | ---: | --- |
| `README.md` | 52 / 56 | 54 / 56 | Excellent: ready as the main entry point |
| `research/rule-lab/README.md` | 26 / 56 | 50 / 56 | Excellent: ready as the main entry point |

The root README had one factual defect and is otherwise finished. The rule-lab
README was a lab notebook wearing a README's name: accurate for the person who
wrote it, opaque to anyone else. Six defects were found and all six are fixed.

`scripts/check_readme.py` from the `readme` skill now reports 0 findings on
`research/rule-lab/README.md` at the standard tier. The root README still reports
one: 926 words of prose against a 900-word standard budget. That was left alone,
because every section it holds is load-bearing and 26 words is not worth moving a
section behind a link for.

## The six defects, and what was done

### 1. The root README printed 47 dots and called them 57

`README.md` said "57 dots and nothing else", then showed a block of 20 + 20 + 7 =
47 dots. `node --test` from the repository root emits 20 + 20 + 17 = 57 and
`# pass 57`. The 47 was the lib-only count from before `research/rule-lab/` was
tracked here; the prose was updated and the output block was not.

**Fixed** in [README.md](../../README.md): the third line is now 17 dots,
re-captured from a real run.

### 2. rule-lab pointed at a file that does not exist here

The changelog entry said the new flag mirrored `proof/lib/claude.js`'s adapter.
There is no `proof/` directory in this repository. The path survived the move
from the origin repository, which the same README's second paragraph describes.

**Fixed:** the path is gone. `grep -rn "proof/lib" research/rule-lab/` returns
nothing.

### 3. rule-lab showed a reader no result, anywhere

Six commands were listed and none was followed by what it prints. A reader could
not tell a working harness from a broken one.

**Fixed:** `node harness.js list` is now the first example, introduced as the free
one, followed by two real lines of its output. Those two lines were captured from
a live run and verified byte-for-byte with `diff` against the file.

### 4. rule-lab's blocking prerequisites sat below the commands that needed them

The `claude` CLI login requirement and the fact that every live cell is paid were
the last bullet of `## Authoring experiments`, about thirty lines under the
command list. A reader who copied line three of the Usage block hit an auth
failure or a bill first and the warning second.

**Fixed:** a new `## Requirements` section sits above `## Usage`, carrying Node,
the logged-in `claude` CLI, and the budget warning. The bullet was removed from
`## Authoring experiments` so the fact is stated once.

### 5. rule-lab contradicted itself on the budget default

The changelog entry stated the default was `0.25` and its own verification line,
four paragraphs later, reported the smoke cell spawned with `--max-budget-usd
0.2`. Both were presented as current. The same entry also claimed every
experiment spec "falls back to the `0.25` default", which stopped being true when
`exp-010-*` was added in August.

**Fixed:** the README now states the default once, from
[harness.js:31](../../research/rule-lab/harness.js:31), and names the three
`exp-010-*` specs that override it to 0.35. The `0.2` survives only inside the
dated FINDINGS.md entry, as what that one historical run used, which it was.

### 6. A dated changelog entry was 31% of the rule-lab README

`## 2026-07-22 — roadmap 052` ran 20 of 65 lines.

**Fixed:** it moved to `## Method notes` in
[FINDINGS.md](../../research/rule-lab/FINDINGS.md) as a dated bullet, matching the
style of the entries around it. The README already called FINDINGS.md the lab
notebook, and now links it, twice.

## Rubric detail, after the fixes

### `README.md` — 54 / 56

| Criterion | Score | Evidence |
| --- | ---: | --- |
| Orientation | 4 | "It answers what a local linter cannot" - what, for whom, problem removed |
| Fit | 4 | "It scores one line, not a file, and English only", plus `## Limits` and a named alternative |
| First success | 4 | A `curl` that scores a real rule with no install and no key |
| Proof it worked | 4 | Quick start shows and explains its JSON; the test block's dot count now matches a real run |
| Usage clarity | 4 | Findings, factors, status and error-code tables |
| Instructions | 4 | Requirements precede every command; deploy steps ordered and numbered |
| Configuration | 4 | Name, requiredness, default, meaning, location, and "Never `wrangler.jsonc`" |
| Reading ease | 4 | Short sentences; tables carry the density |
| Comprehension | 3 | The quick start prints `F1`, `F3`, `F8` and `primitive` about thirty lines before they are defined |
| Coverage | 4 | Scorer, local developer, deployer, criteria-changer and researcher each routed |
| Navigation | 4 | Headings name reader tasks, link text names destinations |
| Onward routes | 3 | States there is no issue tracker and links `SECURITY.md`; a usage question or a bug still has no destination |
| Trust | 4 | Every checked fact holds |
| Scope | 4 | Depth is linked into `docs/`, not inlined |

### `research/rule-lab/README.md` — 50 / 56

| Criterion | Before | After | Evidence |
| --- | ---: | ---: | --- |
| Orientation | 3 | 4 | First sentence is exact, and the v1-successor aside that meant nothing to a newcomer is gone |
| Fit | 1 | 3 | Requirements above the commands; still says nothing about when not to use the harness |
| First success | 2 | 4 | `list` is named as the free first step and shown running |
| Proof it worked | 0 | 3 | The first example shows real output; the five commands after it still do not |
| Usage clarity | 3 | 4 | Every `run` default is stated, including `--reps` 5 and `--seed` 42 |
| Instructions | 1 | 4 | Login and budget precede the commands that need them |
| Configuration | 2 | 4 | `maxBudgetUsd` default, its per-spec override, and what `RULE_LAB_DIR` is for |
| Reading ease | 2 | 4 | The twelve-line changelog paragraph is gone |
| Comprehension | 2 | 2 | "anti-default", "validity gate", "absence-grader", "lift", `CONFIRMED+` - still none defined here |
| Coverage | 3 | 3 | Runner and author are served; nobody is routed to the results |
| Navigation | 2 | 4 | Five headings, each naming a reader task |
| Onward routes | 2 | 3 | `FINDINGS.md` linked twice; bugs and questions still route through the root README |
| Trust | 1 | 4 | The dangling path is gone and both budget numbers now trace to the code |
| Scope | 2 | 4 | History lives in FINDINGS.md and is linked |

The two criteria still under 4 are deliberate. The vocabulary is the lab's own and
defining it would duplicate FINDINGS.md, and a subdirectory README inside a
repository that already routes bugs does not need its own support section.

## Evidence

Verified by running, after the changes:

- `node --test --test-reporter=dot` from the repository root - 20 / 20 / 17 dots,
  matching the block now printed in the README. `node --test` reports
  `# tests 57`, `# pass 57`, `# fail 0`.
- `node --test research/rule-lab/harness.test.js` - `# tests 10`, `# pass 10`,
  matching the count in the FINDINGS.md entry.
- `node harness.js list` in `research/rule-lab/` - twelve experiments; the printed
  cell counts sum to 2,020, matching the root README's headline number. Its last
  two lines were diffed against the block pasted into the README: identical.
- `node harness.js run --exp exp-001-framing --dry-run` - prints the cell matrix
  and makes no API call, as documented.
- `python scripts/check_readme.py` from the `readme` skill - 0 findings on
  `research/rule-lab/README.md` at the standard tier, 1 on `README.md` at the
  standard tier, the 926-word prose budget.

Verified by reading the code:

- Nine finding ids in [lib/analyze.js](../../lib/analyze.js), matching the nine
  rows of the root README's findings table.
- Six Jev questions in [lib/questions.js](../../lib/questions.js): `control`,
  `premise`, `is_rule`, `trigger_distance`, `enforceability`, `best_primitive`.
- `REVIEW = 0.35`, `BLOCK = 0.70` and `MAX_RULE_CHARS = 2000` in `lib/analyze.js`,
  matching the status table and the 2000-character limit.
- Six locales in `public/i18n.js`: `ar`, `en`, `es`, `fr`, `hi`, `zh`.
- Every one of the 21 repository paths the root README links resolves.
- `DEFAULTS = { reps: 5, model: "haiku", maxBudgetUsd: 0.25, timeoutMs: 300000,
  concurrency: 2, seed: 42 }` in `harness.js`, and `maxBudgetUsd: 0.35` in exactly
  the three `exp-010-*` specs. All ten documented `run` flags exist.

Verified over the network:

- The live service root, `/research`, and `agentlinter.com` each answer `200`.

Not verified:

- The quick-start `curl` against `/api/score`. It spends a paid Jev request, so it
  was not run. Its shown output is unconfirmed by this review.
- `npx wrangler dev` and `npx wrangler deploy`, which need a key and an account.

## Rejected alternatives

- **Trimming the root README to its 900-word budget.** It is 26 words over, every
  section earns its place, and moving one behind a link would cost a reader more
  than the overage does.
- **Defining the lab's vocabulary in the rule-lab README.** "anti-default",
  "lift", "validity gate" and the four verdict names are defined in FINDINGS.md,
  which the README links at the top. A second definition would drift.
- **Splitting rule-lab's experiment-authoring rules into their own document.**
  They are five lines and they are the point of the directory. They belong on the
  front page.
- **Keeping the harness changelog in the README under a shorter heading.** The
  README is the front door and the change history is not a reader's question.
  FINDINGS.md already carried dated method notes in exactly that shape.
