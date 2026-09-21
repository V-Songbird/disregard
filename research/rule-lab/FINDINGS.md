# Rule lab — findings

**Goal:** identify, with replicated experimental evidence, which structural properties of a rule change whether Claude follows it in a real Claude Code session.

**Goal contract:** the goal is met when every core question below is RESOLVED. A question is RESOLVED when its answer replicates — the same verdict (CONFIRMED with a 95% CI excluding zero, or NULL with the CI inside ±0.10) in **at least two distinct rule intents**, each on anti-default tasks (baseline compliance < 0.5). One-intent results stay OPEN with a note. When all are RESOLVED, write the synthesis section at the bottom and stop the loop.

**Prior art (the lost v1 harness):** a 40-rule correlation study found baseline behavior dominates compliance ~15× over rule wording — absolute compliance cannot be predicted from rule text. Everything below therefore measures *lift over baseline* on *anti-default* tasks, varying *one factor within one rule intent* at a time.

## Core questions

| # | Question | Status | Verdict |
|---|---|---|---|
| Q1 | Framing: bare prohibition vs prohibition+alternative vs positive imperative | RESOLVED, spot-checked | All CONFIRMED+ ×2 intents; prohibition-alt dominant. Sonnet: intent not anti-default, nothing contradicted |
| Q2 | Trigger presence: explicit "when X / before Y" clause vs none | RESOLVED, spot-checked | Trigger CONFIRMED+ ×2; no-trigger unreliable, can hit 0. Sonnet: both forms 1.00 |
| Q3 | Concreteness: named identifiers/paths vs abstract wording | RESOLVED, spot-checked | Concrete CONFIRMED+ ×2; abstract splits 1.00 vs 0.00. Sonnet: abstract also 1.00 |
| Q4 | Examples: inline code example vs none | RESOLVED, spot-checked | No detectable effect; arms verdict-identical in 3 intents. Sonnet: same (ceiling) |
| Q5 | Distance: trigger appears immediately vs after distractor subtasks | RESOLVED, spot-checked | No systematic decay; same-site immune ×3, triggered duties survive ×2. Sonnet: even the haiku-dead duty holds 1.00 |
| Q6 | Verb strength: must/never vs should vs prefer | RESOLVED, spot-checked | "Prefer" halves compliance ×2; still lifts. Sonnet: prefer also 1.00 |
| Q7 | Position: rule at top vs middle vs bottom of CLAUDE.md | RESOLVED, spot-checked | Top beats bottom ×2: 1.00→0.65 and 1.00→0.15. Sonnet probe uninformative (baseline flipped); no burial seen on q8-long |
| Q8 | File length: same rule in a ~20-line vs ~80-line CLAUDE.md | RESOLVED, spot-checked | No uniform effect: duty collapsed (burial), code-site rule improved. Sonnet: 1.00 both lengths |
| Q9 | Do the three decisive contrasts (Q7 position, Q1 stall, Q6 verbs) still hold on a current 5-generation small tier? | RESOLVED for position and verbs; the stall leg stays OPEN | Measured on sonnet 5, 2026-08-25. **Position NULL ×2 intents** (top 1.00, bottom 1.00). **Verb strength NULL ×2** ("prefer" 1.00 = "always" 1.00). **Bare-prohibition penalty replicated only ×1** (0.60 vs 1.00 on console-log; 1.00 either way on spec-name). All three against a ceiling: once any rule was present this tier followed it |

## Experiment log

### exp-001-framing — 2026-07-18
Question: Q1. Model: haiku. Cells: 40 run / 39 usable. Cost: ~$1.32.
Result per intent:
- no-console-log (baseline 0.00, n=5): prohibition lift +0.75 CI [0.25, 1.00] CONFIRMED+; prohibition-alt +1.00 CI [1.00, 1.00] CONFIRMED+; positive +1.00 CI [1.00, 1.00] CONFIRMED+.
- no-inline-comments: baseline 0.80 — NOT anti-default; intent retired for Q1, all variant results uninformative.
Decision: Q1 stays OPEN — only one qualifying intent. All three framings lift strongly there; the prohibition-vs-others gap (0.75 vs 1.00) is not separable at n=5. Extension: replace the retired intent with `no-bare-error` (throw `AppError` from a provided `src/errors.js` instead of built-in `Error`) and rerun the variant matrix.

### exp-001-framing extension — 2026-07-19 (interim, n=10 per arm)
Question: Q1. Model: haiku. Cells: 100 run / 97 usable so far. Cost: ~$3.37 cumulative.
- no-console-log (baseline 0.00): prohibition +0.86 [0.57, 1.00] CONFIRMED+; prohibition-alt +1.00 CONFIRMED+; positive +1.00 CONFIRMED+.
- no-bare-error (baseline 0.20): prohibition +0.80 [0.50, 1.00] CONFIRMED+; prohibition-alt +0.80 [0.50, 1.00] CONFIRMED+; positive +0.40 [0.00, 0.80] INCONCLUSIVE — compliance 0.60 vs prohibitions' 1.00.
Decision: prohibition and prohibition-alt are replicated CONFIRMED+ across both intents. Positive framing is split: perfect where the alternative is the household default (logging), weak where it isn't (custom error class). Deepening to 20 reps to settle the positive arm before calling Q1.

### exp-001-framing final — 2026-07-19 (n=20 per arm)
Question: Q1. Model: haiku. Cells: 180 run / 170 usable. Cost: $5.93 cumulative.
- no-console-log (baseline 0.00): prohibition +0.90 [0.70, 1.00] CONFIRMED+ (but only 10/20 cells usable — see stall note); prohibition-alt +1.00 CONFIRMED+; positive +1.00 CONFIRMED+.
- no-bare-error (baseline 0.10): prohibition +0.90 [0.75, 1.00] CONFIRMED+; prohibition-alt +0.90 [0.75, 1.00] CONFIRMED+; positive +0.45 [0.20, 0.70] CONFIRMED+.
**Q1 RESOLVED.** Every framing beats no rule, replicated across both intents. Ranking by consistency: prohibition-alt (perfect compliance, no side effects) > positive (perfect only when the alternative is the natural default; 0.55 compliance when it names an unfamiliar helper) > bare prohibition (high compliance but see stall note). Sonnet spot-check owed before synthesis.
**Stall finding:** all 10 unusable bare-prohibition cells in no-console-log were the model halting to ask the user how to log without console.log — task demanded the banned action, rule named no alternative, model did nothing and asked. Bare prohibitions convert violations into stalls, not compliance: in headless runs the task simply fails ~50% of the time. Prohibition-alt had zero stalls on the identical task.

Template for entries:

```
### exp-XXX-<name> — YYYY-MM-DD
Question: QN. Model: <model>. Cells: N run / N usable. Cost: ~$X.
Result per intent: <variant>: lift +0.XX CI [a, b] VERDICT ...
Decision: <what this changes — question status, follow-up experiment, spec fix>
```

### exp-002-trigger — 2026-07-19 (interim, n=10)
Question: Q2. Model: haiku. Cells: 60 run / 60 usable. Cost: ~$1.82 (cumulative all experiments $7.75).
- jsdoc-duty (baseline 0.00): no-trigger +1.00 CONFIRMED+; trigger +1.00 CONFIRMED+. Ceiling — same-file duties get executed at the work site regardless of trigger wording; intent is uninformative for the trigger CONTRAST and is dropped from further reps.
- changelog-duty (baseline 0.00): no-trigger +0.00 [0.00, 0.00] NULL — a standing "note every src/ change in CHANGELOG.md" was followed ZERO times in 10 runs; trigger +0.30 [0.00, 0.60] INCONCLUSIVE.
Decision: the trigger question only exists for duties whose action site is away from the code being edited. Deepening changelog-duty to 20 reps and adding a second distant-file intent (docs-sync) to test replication.

### exp-002-trigger final — 2026-07-19 (n=20 per arm)
Question: Q2. Model: haiku. Cells: 150 run / 150 usable. Cost: cumulative all experiments $10.48.
- docs-sync-duty (baseline 0.00): no-trigger +0.65 [0.45, 0.85] CONFIRMED+; trigger +1.00 [1.00, 1.00] CONFIRMED+. Trigger beats no-trigger 20/20 vs 13/20.
- changelog-duty (baseline 0.00): no-trigger +0.05 [0.00, 0.15] INCONCLUSIVE (1/20); trigger +0.25 [0.05, 0.45] CONFIRMED+ (5/20).
**Q2 RESOLVED.** The trigger variant is CONFIRMED+ in both intents; the no-trigger variant swings from 0.65 to 0.05 across intents. A "when you do X" clause reliably lifts distant-file duties; a standing obligation without one is intent-dependent and can collapse to zero. Same-file duties (jsdoc) saturate either way. Note the honest magnitude: even with a trigger, the changelog duty only reached 0.25 — distant-file duties stay weak rules on haiku. Sonnet spot-check owed.

### exp-003-concreteness — 2026-07-19 (n=20 per arm)
Question: Q3. Model: haiku. Cells: 120 run / 120 usable. Cost: cumulative $14.07.
- logger-helper (baseline 0.00): concrete +1.00 CONFIRMED+; abstract ("the project's logging helper") +1.00 CONFIRMED+. Ceiling — referent trivially resolvable (one helper file).
- docs-sync (baseline 0.00): concrete ("docs/api.md") +0.60 [0.40, 0.80] CONFIRMED+; abstract ("the API reference doc") +0.00 [0.00, 0.00] NULL — zero compliance in 20 cells.
**Q3 RESOLVED.** Concrete naming is CONFIRMED+ in both intents. Abstract wording splits 1.00 vs 0.00: fine when the referent maps obviously to one artifact, fatal when the model must resolve which file a description means. Failure mode checked cell by cell: the rule was silently ignored — no cell updated a wrong file, none mentioned docs at all. Naming the exact path is what makes a distant-file rule exist at all. Sonnet spot-check owed.

### exp-004-examples — 2026-07-19 (interim, n=20 per arm)
Question: Q4. Model: haiku. Cells: 120 run / 120 usable. Cost: cumulative $17.73.
- docs-sync (baseline 0.00): no-example +0.60 [0.40, 0.80] CONFIRMED+; example +0.75 [0.55, 0.90] CONFIRMED+. Contrast 12/20 vs 15/20 — inside noise.
- changelog-duty (baseline 0.00): no-example +0.15 INCONCLUSIVE; example +0.10 INCONCLUSIVE. Floor; no example effect. (Also: the trigger wording replicated low here — 0.10–0.15 vs exp-002's 0.25 — same weak-duty picture.)
Decision: an inline example does nothing detectable for placement duties — the model knows WHAT a changelog bullet looks like, it fails to remember TO write one. Examples should matter where the rule specifies an unfamiliar FORMAT. Extending with an error-code-format intent (message starts with `E_CODE:`) where the example pins down the spec.

### exp-004-examples final — 2026-07-19 (n=20 per arm)
Question: Q4. Model: haiku. Cells: 180 run / 180 usable. Cost: cumulative $19.76.
- error-code-format (baseline 0.00): no-example +1.00 CONFIRMED+; example +1.00 CONFIRMED+. The prose spec ("uppercase snake-case code followed by a colon") was already sufficient.
**Q4 RESOLVED.** Example and no-example arms produced identical verdicts in all three intents — two placement duties and one format rule. An inline example is not a compliance lever for a rule whose prose already specifies the behavior; caveat: an example that is the only carrier of an otherwise ambiguous spec was deliberately not tested (that would vary the spec, not the example). Power note: n=20 contrasts can miss effects under ~0.3. Sonnet spot-check owed.

### exp-005-distance — 2026-07-19 (interim, n=20 per arm)
Question: Q5. Model: haiku. Cells: 120 run / 120 usable. Cost: cumulative $24.78. Immediate-trigger references reused from exp-003/exp-004 (same rule text, same grader, n=20 each).
- logger-distant (baseline 0.00): rule +1.00 CONFIRMED+ — identical to immediate (1.00). No decay.
- errcode-distant (baseline 0.00): rule +1.00 CONFIRMED+ — identical to immediate (1.00). No decay.
- docs-sync-distant (baseline 0.00): rule +0.00 [0.00, 0.00] NULL — the same rule scores 0.60 with an immediate trigger. Total collapse when its trigger arrives as subtask 3 of 3. (Confound noted: this fixture's docs/api.md was pre-populated with two entries; unlikely to hurt, but the immediate fixture said "(none yet)".)
Decision: distance is harmless to strong rules and fatal to weak duties. Replicating the weak-rule collapse with the 0.55-immediate AppError positive framing before calling Q5.

### exp-005-distance final — 2026-07-19 (n=20 per arm, 240 cells total)
Question: Q5. Model: haiku. Cost: cumulative $29.99. Distant vs immediate (immediate n=20 references from exp-001/002/003/004):
- Same-site rules: logger 1.00→1.00; errcode 1.00→1.00; apperror-positive 0.55→1.00 (rose — longer tasks explore the fixture more, so `src/errors.js` gets found; baseline also rose 0.10→0.20). No decay, replicated ×3.
- Distant-file duties moved in BOTH directions: docs-sync no-trigger 0.60→0.00 (collapse, NULL [0,0]); docs-sync trigger 1.00→0.70 [0.5, 0.9] (dip, still CONFIRMED+); changelog trigger 0.25→0.95 [0.85, 1.00] (soared — "when you change a file" fires three times in a three-edit task).
**Q5 RESOLVED.** Distractor subtasks cause no systematic decay. Same-site rules are immune (×3). Triggered distant-file duties stay CONFIRMED+ through multi-part tasks (×2) — and a per-edit trigger can even gain from more trigger events. The only death was the UN-triggered distant-file duty (×1) — wording, not distance, was the killer; single-intent, noted for synthesis. Sonnet spot-check owed.

### exp-006-verbs — 2026-07-19 (n=20 per arm)
Question: Q6. Model: haiku. Cells: 120 run / 120 usable. Cost: cumulative $33.99. Endpoint design (strong vs prefer; "should" skipped — endpoints separated cleanly).
- docs-sync (baseline 0.00): strong ("Always list…") +1.00 [1.00, 1.00] CONFIRMED+; prefer ("Prefer to list…") +0.45 [0.25, 0.65] CONFIRMED+.
- no-bare-error (baseline 0.15): strong ("Never throw… instead") +0.85 [0.70, 1.00] CONFIRMED+ (compliance 1.00); prefer +0.45 [0.20, 0.70] CONFIRMED+ (compliance 0.60).
**Q6 RESOLVED.** Hard imperatives hit 1.00 in both intents; "prefer" drops compliance to 0.45–0.60, replicated ×2 with (near-)disjoint CIs. A preference still lifts over no rule — it is half a rule, not zero.
Bonus observation: "Always list every exported…" scored 1.00 where the bare "List every exported…" scored 0.60 in exp-003 (same fixture/task/grader, different day) — an explicit "Always" may rescue an un-triggered duty much like a trigger clause; single comparison, cross-experiment, noted for synthesis.

### exp-007-position / exp-008-length — 2026-07-19 (n=20 per arm, 320 cells)
Questions: Q7, Q8. Model: haiku. Cost: cumulative $44.84. Long file = 80 lines of orthogonal project notes; short = 17 lines; rule families: docs duty (bare "List every exported…") and apperror positive.
- Q7, apperror family (long file): top 1.00 / middle 0.85 / bottom 0.65 — monotonic gradient, top lift +0.85 [0.65, 1.00] vs bottom +0.35 [0.05, 0.65]. CONFIRMED+ everywhere but clearly ranked.
- Q7, docs family (long file): 0.10 / 0.10 / 0.00 — the duty is dead at every position; the family is at floor in a long file and cannot show a gradient. Position effect therefore confirmed in only ONE intent — Q7 stays OPEN pending a second family with long-file headroom (candidate: error-code-format).
- Q8, docs duty: short 0.55 [0.35, 0.80] CONFIRMED+ vs long ~0.05 at best — length alone collapsed the duty.
- Q8, apperror: short 0.40 (lift +0.20, INCONCLUSIVE) vs long bottom 0.65 / top 1.00 — length IMPROVED the code-site rule (baselines also rose 0.20→0.30 with more context).
### exp-007-position extension — 2026-07-19 (changelog family, n=20 per arm)
Question: Q7. Model: haiku. Cost: cumulative $48.55. Long file, trigger-form changelog rule, three-edit task (short-file reference for this exact setup: 0.95 from exp-005).
- changelog-top: +1.00 [1.00, 1.00] CONFIRMED+; changelog-bottom: +0.15 [0.00, 0.30] INCONCLUSIVE. Fully disjoint CIs.
**Q7 RESOLVED.** Position gradient replicated in two families: apperror 1.00 → 0.85 → 0.65 (top→middle→bottom) and changelog 1.00 → 0.15. Rules at the top of a long CLAUDE.md keep their strength; the same rule at the bottom loses a third (code-site rule) to nearly everything (distant-file duty). Cross-link for synthesis: exp-008's "length kills duties" is largely burial — changelog held 1.00 at long-file TOP; the docs duty however died at every long-file position. Sonnet spot-check owed.

**Q8 RESOLVED as an interaction.** File length has no uniform effect: a distant-file duty drowned in an 80-line file (significant drop), while a code-site rule got stronger (significant rise) — plausibly because a bigger CLAUDE.md induces more careful fixture exploration but crowds out side-duties. "Keep the file short" is only true for workflow duties. Sonnet spot-check owed.

### exp-009-sonnet-spotcheck — 2026-07-19 (n=5 per arm, 140 cells, model sonnet)
Question: all. Cost: cumulative $67.00 (final). One lean confirming run per resolved question, key arms only.
- Baselines flipped on three probes: q1 (no bare Error even unruled), q5-strong (no console.log unruled), q7 (AppError used unruled) — those intents are not anti-default on sonnet; their haiku verdicts are neither confirmed nor contradicted, and the intents are retired for big tiers.
- Every informative probe saturated: q2 no-trigger AND trigger 1.00; q3 abstract 1.00 (haiku: 0.00); q4 both 1.00; q5-weak-distant 1.00 (haiku: 0.00); q6 prefer 1.00 (haiku: 0.45); q8 long and short 1.00 (haiku long: ~0.05).
**Headline: no haiku verdict was contradicted, and every structural effect vanished on sonnet.** Wording structure is a haiku-tier lever; sonnet followed every anti-default rule at 1.00 regardless of framing, trigger, concreteness, verb strength, or burial. 140/140 usable.

### exp-010-claude5-replication — DESIGN, SUPERSEDED by exp-010-claude5 below (ADR 2026-08-05 F1)
Question: Q9. Model: the current 5-generation small tier. Fixtures unchanged, n=20/arm. **Presumes a runnable 5-gen small tier in the harness — check that first; if none exists, this stays a design.**
Every lever above was measured 2026-07 on pre-Claude-5 tiers (haiku 4.5; sonnet 4.x spot checks). assay now labels its wording findings that way (`WORDING_STUDY_EVIDENCE`, the craft-rules recipe, the audit skill). This experiment re-measures only the three decisive contrasts, the ones an assay severity actually rests on:
- **Q7 top-vs-bottom position** — drives the F5/burial band, the #1-ranked and weakest-evidenced lever.
- **Q1 bare-prohibition stall** — drives `STALL_RISK_CAP`, the only experiment-supported severity.
- **Q6 verb strength** — drives the F1 force lever.
Each verdict updates `WORDING_STUDY_EVIDENCE.limits`. A 5-gen **null on Q7** is the one result that would justify softening `BURIED_F5_THRESHOLD` severity — and only *with* the labeled data the scoring contract demands. Design only; no engine change until data lands.

**The precondition it names was checked on 2026-08-25: there is no 5-generation SMALL tier.** The smallest current tier is still haiku 4.5, which is the one already measured; fable 5, sonnet 5 and opus 5 are all runnable but none is the small tier this design asked for. It ran on sonnet 5 instead, and the entry below says so wherever it matters.

### exp-010-claude5 — 2026-08-25
Question: Q9. Model: sonnet (claude-sonnet-5). Cells: 440 run / 436 usable, n=20 per arm. Cost: $40.68, plus $3.94 of baseline pilots.

**Two harness changes came first, and the first one matters to every number in this file.**

1. *Cells were never isolated.* `runClaude` passed no `--settings`, so every cell inherited this machine's user-scope plugins — an output style that rewrites how answers are written, hooks that inject text into every prompt, several skill sets. It loaded into both arms, which is exactly why it was dangerous: not a broken control, a silent change to what the measurement was a measurement OF. Cells now get a settings file with every user plugin disabled and the output style pinned to the host default. Verified live: a probe cell answers ISOLATED when asked whether it can see a user-scope plugin skill. **Every result dated before 2026-08-25 in this file was measured without that isolation.**
2. `path_regex` / `path_regex_absent` graders, for duties about what a file is CALLED rather than what it contains.

**The pilot retired half the intent set.** On sonnet 5 the AppError intents are no longer anti-default: `q1-bare-error` and `q6-bare-error` baseline 0.80, `q7-apperror-*` baseline 1.00. The model throws the project's own error class unprompted, so any lift measured there is noise against a ceiling. A second module-header intent was retired too, for fixture leakage — the fixture's own `src/num.js` carried the header, and the model copied the convention it could see (baseline 1.00). `spec-name` replaced them all: name test files `<name>.spec.js`, never `<name>.test.js`. Baseline 0.00, and statable as a prohibition, with an alternative, positively, softly, and at either end of a long file.

Result per contrast (baseline 0.00 in every intent below):
- **Q7 position — NULL, replicated.** `q7-docs-top` 1.00 and `q7-docs-bottom` 1.00; `q7-spec-top` 1.00 and `q7-spec-bottom` 1.00. On haiku 4.5 the same contrast fell to 0.65 and 0.15. A rule at the bottom of an ~80-line CLAUDE.md was followed as often as the same rule at the top.
- **Q6 verb strength — NULL, replicated.** `q6-docs-sync` strong 1.00 / prefer 1.00; `q6-spec-name` strong 1.00 / prefer 1.00. On haiku 4.5 "prefer" halved compliance.
- **Q1 framing — the bare prohibition still costs something, in one intent of two.** `q1-console-log`: prohibition 0.60 [0.40, 0.80], prohibition-alt 1.00, positive 1.00. `q1-spec-name`: all three 1.00. Every arm is CONFIRMED+ as lift over baseline; the separation between them survives only where the banned action is the household default.

**Read every line above as a ceiling result.** Lift was 1.00 in 11 of 12 non-baseline arms. What this measures is that on this tier, once a rule is present at all, it is followed — not that a badly placed or softly worded rule became a good one. Nothing here says what happens to a rule competing with a second rule, a longer session, or a task the model would rather do another way.

Decision: Q9 is RESOLVED for position and verb strength on this tier — NULL in two intents each — and stays OPEN on the stall leg, which replicated once. Engine change made, and only the one the data pays for: in `assay/scripts/models/sonnet5.js`, `weights.F1` 0.6 → 0.3 and `weights.F5` 1.5 → 0.5, both relabelled `experiment-supported` and citing this experiment; `weights.F2` relabelled too and left at 1.0. Every other constant in that column is still `profile-inferred`, and haiku45, opus5 and fable5 are untouched — they were not measured. `RUBRIC_VERSION` is 3.

## Method notes

- Cells are headless `claude -p` runs in a throwaway fixture project; the rule loads via the fixture's CLAUDE.md — never via a synthetic system prompt.
- Validity graders gate every cell: a cell where the task wasn't attempted counts as unusable, not as compliant. Absence-graders must always be paired with a validity gate.
- An intent qualifies only while its baseline stays anti-default (< 0.5). If a model update flips the baseline, the intent is retired for that question.
- Default model is haiku for iteration speed; a RESOLVED verdict should be spot-checked on a bigger tier before the synthesis (one confirming run is enough).
- Every cell runs with user-scope plugins disabled and the output style pinned to the host default (`--settings`, written by the harness). CLAUDE.md discovery stays ON — the rule under test loads through the fixture's own CLAUDE.md, and a cell without memory would measure nothing.
- A fixture must not contain an example of the duty being tested. The module-header intent read baseline 1.00 purely because the fixture's existing file carried the header the rule asks for.
- Findings, costs, and dead ends all get logged here — this file is the lab notebook and the loop's working memory.
- Session scope (user, 2026-07-18): all experiments on haiku; each RESOLVED verdict gets one confirming sonnet run before synthesis. Standing budget $50 total — pause and ask before crossing it. Designs over 60 cells are auto-approved while the budget holds. Budget extended to $70 by the user on 2026-07-19 at the $44.84 checkpoint, to fund the Q7 replication and the sonnet spot-check pass.
- Surprise (exp-001): haiku's baseline already avoids `//` comments ~80% of the time on small fresh-file tasks — comment-style intents are weakly anti-default on haiku and should not be reused. Strongest anti-default pattern so far: task nudges toward a ubiquitous builtin (console.log, new Error) while the fixture ships a helper the rule points to.

## Synthesis

All eight core questions RESOLVED with replication on haiku and a sonnet spot-check pass. 1,200+ cells, $67.00 total, 2026-07-18/19.

**The master finding: rule wording is a small-model lever.** On haiku, structure decides whether a rule works at all. On sonnet, every anti-default rule we tested hit 1.00 compliance in every wording — and three of our haiku intents stopped being anti-default because sonnet already does the right thing unruled. Rule hygiene matters most where cheap models run: bulk pipelines, subagents, headless automation.

**What makes a rule work on a haiku-class model, in effect-size order:**

1. **Position (Q7):** put load-bearing rules at the top of CLAUDE.md. Bottom-of-file cost 0.35 (code-site rule) to 0.85 (duty) of the effect. Burial is also most of what "long file" costs (Q8).
2. **Concreteness (Q3):** name exact paths and identifiers. "the API reference doc" → 0.00; "docs/api.md" → 0.60. Abstract referents are silently ignored, not misresolved.
3. **Trigger clause (Q2, Q5):** distant-file duties need "When you do X, …". Without it: 0.00–0.65 and collapse in multi-step tasks. With it: survives multi-step tasks and per-edit triggers compound (0.25 → 0.95 on a three-edit task).
4. **Verb strength (Q6):** "prefer" is half a rule (0.45–0.60 vs 1.00 for always/never). Soft verbs are a real cost, not politeness.
5. **Framing (Q1):** always pair a prohibition with its alternative. Bare "never X" stalls headless runs (50% task failure asking how to proceed) when the task demands X. Positive-only phrasing under-delivers (0.45) when the alternative isn't the model's habit anyway.
6. **Examples (Q4):** no compliance effect in three intent types. Add examples for spec clarity if needed, never as a compliance lever.
7. **Distance (Q5):** distractor subtasks are not the enemy; weak wording is. Same-site rules never decayed (×3).
8. **File length (Q8):** length alone is overrated — it acts through burial (Q7) and only on duties. Code-site rules can even improve with more context (more fixture exploration finds the helpers rules point to).

**Rule taxonomy that emerged:** code-site rules (fire where the model is already editing) are cheap to enforce — nearly any clear wording works. Distant-file duties (changelog, doc sync) are the fragile class — they need trigger + concrete path + hard verb + top placement, and even then they cap low on haiku in single-edit tasks (0.25–0.60).

**What assay should change:**
- Audit checks, ranked by measured payoff: flag prohibitions lacking an alternative (stall risk F-severity), duties lacking a "when" trigger, abstract referents (no backticked path/identifier), soft verbs (prefer/should/consider), and load-bearing rules below the fold of a long CLAUDE.md.
- Placement detection: distant-file duties are exactly the rules that deserve hooks instead of prose — a PostToolUse hook fires deterministically where the 0.05–0.25 compliance duty does not.
- Report framing: severity should scale down when the team runs sonnet-class models only, and up for haiku/subagent workflows.

**Limits:** effects measured on haiku 4.5 in single-session headless runs on one task family per intent; sonnet checks were n=5 spot probes; big-tier effects would need harder anti-default intents than this lab currently has.
