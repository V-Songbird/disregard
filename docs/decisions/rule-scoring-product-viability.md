---
type: adr
summary: "Why the Jev-backed rule-scoring app ships free instead of as a subscription, what separates it from the existing CLAUDE.md linters, and why the rule-lab benchmark was published here; read before any pricing or positioning decision."
related_files:
  - "docs/knowledge/jev-commercial-licensing.md"
  - "docs/knowledge/f3-trigger-distance-criteria.md"
  - "docs/knowledge/injection-screen-criteria.md"
---

# Should the rule-scoring web app be sold as a subscription?

## Outcome

**Decided and executed on 2026-09-20.** The tool shipped free. `rule-lab` is
published in [research/](../../research), and the repository is public at
[github.com/V-Songbird/disregard](https://github.com/V-Songbird/disregard).

The sections below are the analysis as it was argued, so parts of it read as a
proposal. What shipped is narrower than what it proposed:

| Proposed below | What shipped |
| --- | --- |
| A verdict, a grade and tips | Nine named findings and **no grade**. The page supplies every sentence. |
| Four per-model verdicts from one call | Not built. With no grade there are no weights to re-apply. |
| Take a whole file and report which lines are rules | In part. `is_rule` ships as the `not_a_rule` finding on one pasted line. Whole-file extraction was not built. |
| A contributor submits a model profile file | A contributor submits cells and an `analysis.json` from the harness. See [CONTRIBUTING.md](../../CONTRIBUTING.md). |
| Seven factors | Five: F1, F2, F3, F7 and F8. F4 and F5 need a whole file. |

Passages that name `assay`, its suite of 348 tests, its `SCOPE.md`, its model
profiles or a project `CLAUDE.md` describe the retired assay plugin in the
`slag` repository, where this research started. None of that is in this
repository. The global `CLAUDE.md` in the head-to-head is the maintainer's own
user-scope file, which is not here either.

## Decision needed at the time

Ship a web app: one text box, paste a rule, get back a verdict plus tips
("this should be a hook, because…"). Free tier scores one rule at a time. Paid
tier at **$3–5/month** accepts a whole `CLAUDE.md` or `AGENTS.md` and returns a
summary of every rule in it.

## Recommendation

**Build it. Do not sell it — not as described, and not at that price.**

The paid tier as specified is already available free from at least two shipped
competitors. AgentLinter ships the **exact interface proposed here** — a paste
box for a whole `CLAUDE.md`, one button, a web report — free, today. Charging
$3/month against that is not a viable wedge, and neither the box nor the
whole-file scan is a difference.

There *is* something in this research nobody else has, and it is not a feature:
it is **2,020 paid measurement cells with confidence intervals, and a harness
that lets strangers add more**. Every competitor asserts best practices; ours
carry evidence levels per constant and a reproduction recipe.

Ship the tool free. Publish the harness. Let the corpus be the thing that
compounds — see *The actual differentiator*, item 5.

---

## Evidence: the market is saturated and it is free

Searched 2026-09-20. At least six tools occupy this exact space.

| Tool | What it is | Price |
| --- | --- | --- |
| [AgentLinter](https://agentlinter.com/) | 8 dimensions, **tier grade S–C, category scores 0–100, percentile ranking, line-numbered diagnostics, fix suggestions, shareable web report, one-click share to X** | **Free, open source** |
| [claudelint](https://claudelint.com/) | **116 rules / 10 categories**; CLAUDE.md, skills, settings, hooks, MCP; CLI + Claude Code plugin + CI + SARIF | **Free, MIT** |
| [retif/claudecode-linter](https://github.com/retif/claudecode-linter) | 90 rules, 8 artifact types, auto-fix | Free |
| [felixgeelhaar/cclint](https://github.com/felixgeelhaar/cclint) | CLAUDE.md validation and optimization, TypeScript | Free |
| [carlrannaberg/cclint](https://github.com/carlrannaberg/cclint) | Claude Code project file linter | Free |
| [CaesiumY/agents-md-optimizer](https://github.com/CaesiumY/agents-md-optimizer) | AGENTS.md/CLAUDE.md optimization via discoverability filter | Free |
| [shinytoyrobots/claude-skills-linter](https://github.com/shinytoyrobots/claude-skills-linter) | Skill file structural validation | Free |

**AgentLinter is the planned paid tier, already shipped, for free, with a viral
loop we do not have.** Percentile ranking and one-click sharing are a
distribution mechanism; a $3 paywall is the opposite of one.

**claudelint owns the CI angle** — the one shape where this need actually
recurs and where a subscription would have made sense.

### What this kills

- **"Paste your whole file" as the paywall.** Free elsewhere.
- **"Grade + category breakdown + fixes" as the product.** Free elsewhere, with
  better packaging.
- **CI/team tier as the fallback plan.** Taken, free, with SARIF output.

---

## The actual differentiator

Five claims come out of the assay research that **no competitor makes**, because
no competitor has the measurements. Every tool above is static and local —
AgentLinter states it "runs 100% locally" and none mentions a model.

### 1. Per-model verdicts

Every competitor returns **one** score. The rule-lab measurements say that is
wrong: on Claude Sonnet 5, **position in the file is null** (bottom scored 1.00,
same as top) and **verb force is null** ("prefer to X" tied "Always X"), while on
Haiku 4.5 the same two contrasts fell to 0.15 and roughly half.

So: *the same rule is worth different amounts depending on who reads it.* The app
can show four verdicts from **one** inference call, because changing weights needs
no re-inference. Nobody else can show this, and it is the most shareable thing
here — a single screenshot of one rule graded four ways.

### 2. "This should stop being a rule"

F8 — *could a deterministic tool do this rule's job better than prose?* — was the
strongest probe result: **4 of 4 labelled rules landed on the exact level**,
including the hard case (`Keep CHANGELOG.md updated.` → Level 1). Primitive
routing hit confidence **1.00** on both prettier rules.

A regex cannot answer this. It is the one judgment Jev genuinely earns its place
for, and it is the answer users actually want: not "your rule scores 62" but
**"delete this rule and write a hook."**

**Positioning, if it ships:** *the only one that tells you which rules should
stop being rules — and who your rule actually works for.*

### 3. "Half of this file isn't rules"

Considered and adopted from a proposal to score **only** pasted rule-like
statements, ignoring the rest of a file ("we don't care if you want it to talk
like a certain person").

**The scope instinct is right; the direction is backwards.** Making the user
pre-extract their rules is work they came here to avoid, and it discards the
corpus checks — conflicts, duplicates, burial, scope mismatch, file shape — that
the research calls the *primary* output, leaving only the grade it calls
secondary.

Inverted, it becomes the strongest feature here: **take the whole file, and
report which lines are actually rules.** A `CLAUDE.md` is full of text that
commands nothing — a motivating story, a pasted requirement, a glossary, a "talk
like X" preference, a note about how the project already is. Extraction cannot
tell a directive from a retrospective, so a lessons file arrives graded as a page
of mandates.

Every competitor is static and local. A regex will grade *"This project started
in 2024"* as a rule and score it. The `is_rule` Noul returned 0.88–0.97 on all
six probe rules, correctly, but all six were rules. The labelled measurement
came later: 15 of 16 with a margin of +0.06, which is thin. See
[is-rule-and-primitive-criteria.md](../knowledge/is-rule-and-primitive-criteria.md). **No local linter can make this distinction**, and it
is the one users can verify instantly against their own file.

### 4. Failure modes with names, not style notes

Two findings in the rubric describe **runtime consequences**, not tidiness, and
neither appears in any competitor's vocabulary:

- **Stall risk.** A bare prohibition caps the grade at 0.30 and is flagged,
  because *"a ban with nowhere to go turns a blocked task into a stopped one.
  The agent needed the thing you banned, has no alternative, and stalls."*
- **Hedge dominance.** One hedge governs the whole sentence downward, so
  *"Always try to use functional components"* scores **0.20**, not 1.00 — worse
  than the same rule with no "always" at all.

The second is the best single demo this product has: one line of plausible,
well-meaning text that grades F, for a reason the user can check.

### 5. The weights are data, and anyone can measure a new column

**This is the strongest idea in the project, and it converts the biggest
objection into the moat.**

The objection: per-model verdicts go stale, models ship faster than we can
measure them, and users will demand columns we do not have.

The answer is not to hide the staleness. assay already makes it visible — each
profile declares `evidence.level` and a per-constant map, and only `haiku45`
claims `experiment-supported` on most of its numbers while `opus5` and `fable5`
declare `profile-inferred` on every one. **Publish the harness and the format,
and a missing column stops being a defect and becomes an open issue someone else
can close.**

#### It is already built and already cheap

`rule-lab` runs real headless sessions — a temp `CLAUDE.md` carrying the variant
rule, then `claude -p <task> --output-format json`, then validity graders (was
the task attempted?) and compliance graders (was the rule followed?). `analyze`
pools reps, computes lift over the intent's baseline, bootstraps a 95% CI, and
returns `CONFIRMED+` / `CONFIRMED-` / `NULL` / `INCONCLUSIVE`.

Measured cost of the entire existing corpus, read from the recorded cells:

| Experiment | Cells | Cost | Tier |
| --- | --- | --- | --- |
| exp-001-framing | 180 | $5.93 | haiku |
| exp-002-trigger | 150 | $4.55 | haiku |
| exp-003-concreteness | 120 | $3.59 | haiku |
| exp-004-examples | 180 | $5.69 | haiku |
| exp-005-distance | 240 | $10.23 | haiku |
| exp-006-verbs | 120 | $4.00 | haiku |
| exp-007-position | 320 | $11.96 | haiku |
| exp-008-length | 80 | $2.60 | haiku |
| exp-009-sonnet-spotcheck | 140 | $18.45 | sonnet |
| exp-010-claude5 | 440 | $40.68 | sonnet |
| exp-010 pilots | 50 | $3.93 | sonnet |
| **Total** | **2,020** | **$111.61** | avg **$0.0553**/cell |

So the contribution ask is concrete and small:

- **Replicate one factor on a new model: ~$3–12.**
- **A full new column (exp-010 shape, 440 cells, n=20/arm): ~$41.**
- The harness already takes `--model`, `--dry-run` (cell matrix, no API calls),
  `--limit 1` (single smoke cell) and `--resume`. Cells run against the
  contributor's **own** logged-in `claude` CLI, so they spend their own credits.

#### What a contributor actually submits

The cells and the `analysis.json` the harness writes under
`research/rule-lab/results/<exp>/`, from a spec copied to a new id for the new
model, plus an entry in `research/rule-lab/FINDINGS.md`. The commands and the
floor a measurement has to clear are in [CONTRIBUTING.md](../../CONTRIBUTING.md).
The earlier plan, a model profile file with weights and thresholds, belonged to
assay and was dropped with the grade.

#### Why this is the moat

Every competitor hardcodes best practices with no way to check them and no way
for a reader to update them. Ours are **2,020 paid cells with confidence
intervals** — a UI can be copied in an afternoon; that corpus cannot. And every
contributed column makes the asset larger without costing us anything.

#### The one decision this needed

The harness used to describe itself as local-only research, never published.
Publishing it **reversed a standing decision** the owner had made, and the owner
made it on 2026-09-20. Two things were settled first:

1. `results/` contains real session output from the owner's machine, so the raw
   cells were audited before they shipped. The result is below.
2. Contributed numbers change what the product tells people, so a contribution
   needs a floor: n per arm, at least two intents, anti-default baselines below
   0.5. Those are the house rules in
   [research/rule-lab/README.md](../../research/rule-lab/README.md), and
   [CONTRIBUTING.md](../../CONTRIBUTING.md) carries them as the contribution guide.

**The harness was audited on 2026-09-20,** while it still sat in `slag` under a
blanket-ignored `/docs/*`. It is now [research/rule-lab/](../../research/rule-lab).
The corpus is exactly **2,020 cells** across the 12 experiment specs that have
been run, and
`harness.test.js` passes 10 of 10 with no API calls, as part of this
repository's own check.

Point 1 above came back **clean enough to ship**. Every cell is a flat JSON
record whose only free text is `responseTail`, and a scan of all 2,020 found no
username, no email address and no home-directory or `localhost` reference. Two
exp-001 cells carry a `fixtureDir` field with a temp path,
`X:\Temp\rule-lab-…`, left by a `--keep` run. It names no person and was left
in place. The scan looked for those patterns only; it is not a review of what
the response text says.

**It lives here now.** Reversed by the owner on 2026-09-20, the same day the
earlier recommendation was written. That recommendation rested on this
repository having no remote and on assay's model profiles being the
contribution target. The first was temporary, and the repository is public now.
The second is the coupling that was removed, not a reason to keep it.

So `rule-lab` sits at [research/rule-lab/](../../research/rule-lab), with the
rubric it shares beside it. `harness.test.js` runs as part of this
repository's check, which is how the harness stops being a thing nobody runs.
The trap worth naming: `.gitignore` already excludes `docs/research/`, so the
harness is at top level instead, or this repo would have reproduced the exact
accident that kept it out of `slag`.

---

## The publishable angle

The competitors sell fear in the abstract — AgentLinter's own headline is *"Your
AGENTS.md is probably sabotaging your agent"* — and settle it with a grade.
A grade is not shareable; a **surprise the reader can reproduce on their own text
in five seconds** is.

Four claims that are specific, checkable, and true:

| Claim | Backed by |
| --- | --- |
| *"Always try to X" is weaker than "X".* | Hedge dominance: 0.20 against 0.85 |
| *Half your CLAUDE.md isn't rules.* | `is_rule`, 15 of 16 on labelled lines, margin +0.06 |
| *This rule is fine for Sonnet 5 and invisible to Haiku.* | Position and verb force measured **null** on Sonnet 5, strong on Haiku 4.5 |
| *Delete this rule and write a hook.* | F8, 4 of 4 exact; hook routing at confidence 1.00 |

And one claim no competitor can make at all: **it says when it does not know.**
The research page says what was measured and on which model, unmeasured levers
are never scored, and
a rule in Spanish is set aside by name rather than silently mis-scored on English
word lists. Every other tool asserts best practices as if they were laws.

### Head-to-head on one real file

The global `CLAUDE.md` (71 lines, 2,406 tokens) was run through AgentLinter, and
the same file was then scored with assay's own `scoreF1` / `scoreF2` / `scoreF7`.
Both tools produced false positives. Recording both, because the honest version
of this comparison is the only one worth publishing.

**AgentLinter returned:** health 75 · cognitive load 51 (medium) · clarity 95 ·
modularity "71 lines — OK" · **roles 5, "Too many roles!"** · security 0/0 ·
4 position warnings · 2 suggestions.

#### Where their output does not hold up

1. **The "5 roles" finding is substring matching.** Checked every role keyword
   against the words actually in the file:

   | Role | Keyword | The only word that matched |
   | --- | --- | --- |
   | Writer | `story` | **`history`** — from *"Use Git for history"* |
   | Assistant | `dm` | **`readmes`** — from *"Do not automatically retrofit READMEs"* |
   | Assistant | `support` | `supported` |
   | Assistant | `message` | `messages` — from *"commit messages"* |
   | Developer | `build` | `builds` |

   Two of the five personas rest on substrings of unrelated words. The advice
   *"Consider splitting into role-specific files"* is generated from `history`
   containing `story`.

2. **Four position warnings for an effect measured null.** *"Critical rules
   buried at position #4/7 … move to top for better adherence"*, weighted
   heaviest in their formula (cognitive × 0.4). On Claude Sonnet 5 this contrast
   measured **1.00 against 1.00** at ~80 lines; their file is 71. It is also not
   actionable: four of seven sections cannot all be first.

3. **Modularity is a line count.** "71 Total Lines — OK" is 15% of the score.

4. **Wrong yardstick.** *"1.88% of GPT-4 context"* for a Claude Code file.

5. **Input-independent output.** The `.claudeignore` block (`node_modules/`,
   `.git/`, `dist/`…) has no relation to the pasted text.

6. **The Suggestions tab renders in Korean** on English input with an English
   UI — on the one screen carrying the payoff.

#### Where our own output does not hold up

Running the raw scorers over the same file flagged **10 bare prohibitions**.
Reading them, **most are false positives**: the alternative is present, just in a
neighbouring sentence whose words do not overlap the ban.

> *"Do not run `fnm env` or rely on shell activation persisting between calls.
> **Supply environment settings within the invocation that needs them.**"*

`resolvesProhibition` looks for `instead` / `rather than`, a shared content
token, or the banned verb reused. This bullet has none, so it scores 0.20 and
`stallRisk` despite naming its replacement plainly. Same for at least three more.

**Fixed, with labelled fixtures.** A 28-case corpus was built — 13 bullets
quoted verbatim from working instruction files, each labelled by whether an agent
blocked by the ban would know how to proceed, plus the genuine bare prohibitions
that must keep firing. Baseline: **12 of 28 wrong**, every one in the same
direction.

The cause is not a missing pattern. The replacement normally sits in a
neighbouring sentence sharing no words with the ban — *"use installed Edge …
Do not probe or install bundled Chromium"* — and knowing that Edge replaces
Chromium is world knowledge no lexical test reaches. So the fix is not a better
guess: F2 now returns a third state, `prohibition_alternative_unproven` (0.6, no
`stallRisk`), and keeps the grade-capping verdict only for a ban standing
completely alone. Two narrower corrections went with it: a ban carrying its own
exception (*"without explicit authorization"*) counts as resolved, and a
replacement stated as a preference (*"Prefer available agent tools"*) now counts
as a replacement.

| Measurement | Before | After |
| --- | --- | --- |
| Corpus cases wrong | 12 / 28 | **0 / 28** |
| Stall flags on the global `CLAUDE.md` (37 bullets) | 10 | **1** |
| Stall flags on the project `CLAUDE.md` (50 bullets) | — | 2 |
| Existing suite | 348 pass | **348 pass** |

The three survivors are genuine: a ban on claiming false success with no
alternative reporting named, a `fnm env` ban that explains why but names no
replacement, and a triple ban on inferring results with nothing in its place.

One existing test was amended rather than deleted. Foreman 069's claim — an
unrelated directive must not buy the rescued band — is still asserted; only the
unrescued half moved, which `SCOPE.md:503` permits on labelled fixtures showing
the new behaviour is more truthful.

**A verb-list lesson worth keeping.** The first attempt added twenty missing
imperatives including `state`, `search` and `respect`. `state` immediately read
*"Shell state does not persist"* as an imperative — the same substring mistake
this document criticises in AgentLinter's role detector. The list now takes
unambiguous verbs only.

#### What survives as a genuine edge

| Finding | assay | AgentLinter |
| --- | --- | --- |
| Rule-like statements counted | **37 bullets** | 7 sections — rules never counted |
| Abstract terms found | **4** (`correct` ×2, `appropriate`, `as needed`) | 1 (`as needed`) |
| Hedged force flagged | **4** bullets at F1 0.50 (`prefer`) | not checked |
| Substring-based personas | none | 5, two of them artifacts |

Untested here: whether F8 would flag this file's fully-mechanical duties — the
`git status --short --ignored` check, the `.venv/Scripts/python.exe` invocation,
"keep documentation in English" — as hook candidates. It needs a model call and
was not run.

### Correction: the interface is not a differentiator

The previous revision of this document proposed "paste it in a box, no install"
as the wedge and flagged AgentLinter's `/analyze` page as unverified. **It is now
verified, and the wedge is gone.** A screenshot of the AgentLinter front page
(2026-09-20) shows, above the fold:

- headline *"Your AGENTS.md is probably sabotaging your agent."*
- a full-width textarea, placeholder *"Paste your AGENTS.md or CLAUDE.md content
  here…"*
- an **Analyze** button

That is the whole interface proposed here — paste box, whole file, no install —
already shipped and free. The recommendation in *"Half of this file isn't rules"*
still stands on its merits, but it is a difference in **what happens after
Analyze**, not in how the user gets there. No copy should imply otherwise.

**Positioning, corrected:** the box is table stakes. What is defensible is the
answer inside it, and the fact that the answer is measured — see below.

---

## Implications the plan did not account for

### Cost is not the constraint; it is trivially cheap

| Item | Figure |
| --- | --- |
| Measured per-rule inference, in the first probe | ~880 input tokens ≈ **$0.000037** |
| Measured per-rule inference, as shipped | ~2,570 input tokens ≈ **$0.0001** |
| 40-rule `CLAUDE.md` (one request per rule), as shipped | ~100k tokens ≈ **$0.004** |
| Break-even on a $3/month subscription, as shipped | ~700 whole-file scans per user per month |

Inference cost will never be why this fails.

### The paid tier's engineering is a parser, not an AI feature

Extracting *which lines of a `CLAUDE.md` are rules* is the hard part: span
classification, frontmatter, ignore fences, blockquotes, nested lists, category
annotations. That is a markdown pipeline, all deterministic.

**Jev cannot help here.** Documented jagged edge: *"jev-1.13 does not count
reliably"*, including list items. So "score rule #17 of this file" is exactly the
shape Jev is worst at. One request per extracted rule is the only sound design.

### The job is episodic, so a subscription is the wrong container

You fix your `CLAUDE.md` once, maybe twice. There is no month two. Even without
competitors, monthly billing fits a recurring need and this is not one. A
one-time fee or credit pack fits the behaviour; CI fits a recurring need, and is
taken.

### $3/month does not survive its own payment rails

Stripe takes ~$0.30 + 2.9%, i.e. **~13% at $3**. Add EU VAT — which for an
EU-based seller means VAT MOSS or a merchant-of-record like Paddle or Lemon
Squeezy — plus support and refunds. The paperwork costs more than the revenue
until volumes that this market will not produce.

### We cannot honestly sell the thing buyers want to buy

This is the one that should settle it. Someone paying for a rule grader wants
their rules **followed**. The research is emphatic and repeated that it cannot
deliver that:

> *"assay is not a rule-compliance predictor."*
> *"No static check can tell you an agent will comply, and this one does not try."*

Selling a subscription attaches a commercial promise to a number the research
explicitly says means less than a buyer will assume. Free, with the disclaimer in
front of the user, is honest. Paid, with the same disclaimer, reads as a hedge.

**Corollary for the UI:** lead with findings, not the grade — *"3 conflicting
rules, 2 duplicates, 6 that should be hooks"* is mechanically defensible;
*"your file scores B+"* is not.

### All three launch defects are now fixed

None of the three blocks a launch any more. What remains is a limit, not a bug:
F3 is accurate enough to order rules and raise findings, not to print as a
precise score — which the findings-first UI already assumed.


~~F2 over-flags multi-sentence bullets.~~ **Fixed** — 12/28 corpus errors to
0/28, and 10 stall flags to 1 on the file that exposed it. See
*Head-to-head on one real file*.

~~The injection check is unusable.~~ **Fixed.** It scored ~0.38 on everything and
0.77 on a plain Spanish rule, because one Noul with no criteria was asked whether
an instruction is an instruction. Adding explicit true/false criteria collapsed
benign scores to ~0.03; splitting it into two narrow questions — does it redirect
the reader, does it assert a verdict for itself — took catches to **9/9 attacks
with 14/15 benign passing**, separated by 0.74. Criteria and measurements:
[injection-screen-criteria.md](../knowledge/injection-screen-criteria.md).

~~F3 is miscalibrated.~~ **Fixed for the reported defect.** Rewriting the Score
levels as standalone situations took the rubric's own examples from 4/10 to
**9/10** exact and MAE 0.68 to 0.14 levels; both cases that started it now land
exactly. Cause: the levels were written comparatively, and the docs state the
model "evaluates each level independently without seeing neighbors". Criteria and
measurements: [f3-trigger-distance-criteria.md](../knowledge/f3-trigger-distance-criteria.md).

**But not solved, and the doc says so.** On ten held-out rules never used while
writing the criteria, it scores **6/10 exact, MAE 0.39 levels**. Enough to order
rules by trigger weakness and raise a finding; not enough to print as a precise
score. That is the same limit already accepted everywhere else here, and it is an
argument for the findings-first UI rather than against shipping.

**Later, 2026-09-20.** That set was spent, and a fresh one labelled without
sight of the criteria scored **4/10 exact, MAE 0.90 levels**. The ordering claim
above is weaker than it reads; the criteria document has the rows.

---

## What to do instead

Items 1 to 4 are done, as the Outcome section records. Item 5 is the one still
open.

1. **Ship the free single-rule tool.** Cost is about $0.0001 per use. The
   four-model comparison proposed here was not built.
2. **Fix F3 and the injection check first.** Cheap, and they are the only things
   that make the output wrong rather than merely limited.
3. **Publish the research.** The extracted rubric — measured levers, honest
   evidence tags, per-tier weights — is the real asset. None of the free linters
   can cite a measurement. That earns credibility the app itself will not. See
   *Where the supporting research lives* below.
4. **Decide whether to publish `rule-lab`,** then publish it. It is the only
   asset here a competitor cannot clone in an afternoon, and it is the answer to
   "your model data will go stale." Audit `results/` for machine-local
   transcripts first.
5. **Let demand prove itself.** If people use the free tool repeatedly, the thing
   they repeat is the thing to charge for — and it will probably not be
   "paste a bigger file."

---

## Where the supporting research lives

**In this repository, since 2026-09-20.** All four pieces were copied out of the
`slag` working copy, where they sat under a blanket-ignored `/docs/*` tree in
one copy each, in no version control at all:

| What | Here | Was |
| --- | --- | --- |
| The harness and its 2,020 cells | [research/rule-lab/](../../research/rule-lab) | `slag/docs/research/rule-lab` |
| The F3 and F8 rubric | [research/rubrics.md](../../research/rubrics.md) | `slag/assay/references/rubrics.md` |
| The extracted field guide | [writing-rules-for-ai.md](../knowledge/writing-rules-for-ai.md) | `slag/docs/writing-rules-for-ai.md` |
| The first Jev probe | [jev-rule-scoring-feasibility.md](../knowledge/jev-rule-scoring-feasibility.md) | `slag/docs/jev-rule-scoring-feasibility.md` |

The figures this document depends on — per-rule token cost, the F3 calibration
defect, the F8 agreement rate — are still restated here in full rather than
cited. That was load-bearing when the sources were unlinkable and it is merely
redundant now, but restating a measured number costs nothing and a reader who
opens only this page still gets the whole argument.

`slag` keeps its own copies. Deleting them there is a separate decision and not
this repository's to make.

## Rejected Alternatives

- **$3–5/month for whole-file analysis.** Rejected: free from AgentLinter and
  claudelint today, and the job does not recur monthly.
- **CI/build-gate tier as the monetisable shape.** Rejected: claudelint already
  ships CI plus SARIF, free. Correct instinct, occupied.
- **Competing on breadth of rules.** Rejected: 116 and 90 rules already exist.
  Ours is five factors and nine findings. Breadth is lost; depth of evidence is not.
- **Selling the grade.** Rejected on honesty grounds, not competitive ones — see
  above. This holds even if the market empties out.
- **Scoring only pasted rule-like statements, ignoring whole files.** Rejected as
  stated: it makes the user do the extraction, and drops the corpus findings the
  research ranks above the grade. Its underlying insight was kept and inverted —
  see *"Half of this file isn't rules"*.
- **"Zero install, paste it in a box" as the wedge.** Rejected after seeing
  AgentLinter's front page: that is their interface already. Recorded so it is
  not re-proposed.
- **Dropping per-model verdicts because the data will go stale.** Rejected: the
  staleness is the argument for publishing the harness, not against shipping the
  columns. A column we have not measured is already labelled
  `profile-inferred`, which is the honest state, not a gap to hide.
