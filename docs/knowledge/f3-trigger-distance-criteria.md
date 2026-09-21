---
type: knowledge
summary: "The validated Jev Score criteria for judging a rule's trigger-action distance (F3), with the measured accuracy on the rubric's own examples and on held-out rules; read before changing the F3 wording in eval/f3-criteria.js or the NO_TRIGGER cut in lib/analyze.js."
related_files:
  - "eval/f3-criteria.js"
  - "eval/f3-eval.js"
  - "eval/results/f3-latest.txt"
  - "lib/questions.js"
  - "lib/analyze.js"
  - "research/rubrics.md"
  - "docs/decisions/rule-scoring-product-viability.md"
---

# F3 — trigger distance, as a validated Jev question

## The defect

The first probe sent the F3 level descriptions from
[research/rubrics.md](../../research/rubrics.md) to Jev almost verbatim. It
compressed the top of the scale: *"Run prettier on modified files before
committing"* came back at Level **3.00** where the rubric says Level **2**
(0.50), and *"Every commit modifying src/ MUST end with [State: SYNCED]"* at
**3.71** against a target of Level 2. Two of two tested cases, same direction.

## The cause

Not a missing example. The Score documentation states that the model
**"evaluates each level independently without seeing neighbors or numbering."**

Every level in the first version was written *comparatively* — "Soon", "Distant",
"many steps after the rule was read", "one step later". Those words describe a
gap between levels, and the model never sees the other levels. It was being asked
to judge "is this further than the one above?" while shown only one.

The documentation's own prescription matches: **describe situations, not
degrees**, and when adjacent levels split, add structured objects with example
situations that resemble the real inputs.

## Result

Ten cases with an explicit F3 target exist — every worked example in
[research/rubrics.md](../../research/rubrics.md). Three repetitions each, `jev-1.13.0`, scores
averaged.

| Variant | Exact level | Mean absolute error |
| --- | --- | --- |
| v1 — flat comparative strings | 4 / 10 | 0.68 levels |
| **v2 — standalone situations + signals** | **9 / 10** | **0.14 levels** |

The two cases that triggered the whole investigation now land exactly:
`prettier-commit` **2.00** (was 3.00) and `state-synced` **2.25** (was 3.71).
Run-to-run spread collapsed to 0.00–0.09, so the question is effectively
deterministic.

### Held-out validation — and the honest limit

Those ten cases are the rubric's own worked examples, and v2 embeds several of
them as signals. That makes the 9/10 a **fit to the training set**, not an
accuracy claim. A second set of ten rules, drawn from working instruction files
and labelled by hand against the rubric's definitions rather than its examples,
was never consulted while writing the criteria:

| Set | Exact level | MAE |
| --- | --- | --- |
| Tuned (rubric examples) | 9 / 10 | 0.14 |
| **Held out** | **6 / 10** | **0.39 levels** |

**So: the reported defect is fixed, and F3 is not "solved".** On rules it has not
seen, the level is right about six times in ten and off by roughly four tenths of
a level on average. That is good enough to **order** rules by trigger weakness
and to drive a finding. It is not good enough to headline as a precise score, which
is the same limit this project has accepted everywhere else. The page shows the
value only inside its "what was measured" disclosure.

Known residuals, all confirmed by hand:

- **Keyword leakage.** *"Keep code comments, identifiers, commit messages, and
  documentation in English"* scores 2.53. It mentions "commit messages", and the
  Level 2 signals describe wrapping-up occasions. A disqualifying signal was
  added — *"merely mentioning an artifact such as a commit message is not this"* —
  and it did not help. Unresolved.
- **Boundary rounding.** *"assay is not a rule-compliance predictor"* scores 0.69
  and rounds to 1 rather than 0. The float leans correctly; only the exact-level
  metric fails.
- **Genuine ambiguity.** *"After changes, run relevant checks"* scores 2.52.
  "After changes" really can mean either level; low confidence here is correct
  behaviour, not error.

Two held-out labels were **corrected** partway through, because re-reading showed
they were wrong: `exclude-deps` ("Exclude dependencies… by default" — names what,
never when, so Level 1 not 3) and `no-recursive` (Level 3, not 4). Recorded so a
later pass argues with the reasoning rather than inheriting a silent fix. Only
one criteria revision was made after seeing held-out results; tuning past that
would have turned the held-out set into a second training set.

## The validated question

One Score question. State goes in a named field so the rule text is data, not
instruction.

The wording is not copied here, because a copy would drift. The source of truth
is [eval/f3-criteria.js](../../eval/f3-criteria.js): `INSTRUCTIONS_V2` is the
question and `V2` holds the five level descriptions with their signals.
[lib/questions.js](../../lib/questions.js) imports both, so the app sends exactly
what the harness measured.

The app uses the raw 0–4 value. `no_trigger` fires below `NO_TRIGGER = 1.5` in
[lib/analyze.js](../../lib/analyze.js), the midpoint between level 1 and level 2.
The rubric's 0–1 bands in [research/rubrics.md](../../research/rubrics.md) are
not applied.

## Rules for changing this wording

1. **Never write a level comparatively.** "Soon", "later", "further than", "more
   steps" describe a neighbour the model cannot see. This one mistake cost five
   of ten cases.
2. **Never name an artifact as a signal when the occasion is what matters.**
   "a commit" matched "commit messages"; the residual keyword leak above is what
   that costs.
3. **Re-run both sets after any edit**, and report the held-out number, not the
   tuned one. The harness is `eval/f3-eval.js` and `eval/f3-criteria.js`;
   ~35k input tokens per set of ten at three reps, about $0.0015 a run. Latest
   recorded output: `eval/results/f3-latest.txt`.
4. **Add held-out cases rather than tuning against the existing ones.** Ten is
   too few to conclude much; the honest way to raise confidence is more labelled
   rules, not more wording passes.

## Rejected Alternatives

- **Keeping the rubric's text as the Score criteria.** Rejected: the rubric is
  written for a reader who sees all five levels at once, which is exactly what
  Jev does not.
- **Tuning until the held-out set passed.** Rejected: that converts the only
  independent evidence into a second training set. One revision was made after
  the first held-out run, to fix a defect the run identified; the number reported
  is whatever came out of it.
- **Treating "Try to prefer functional components when possible" as Level 1
  because of its hedge.** Partly rejected. The rubric scores it 0.25 for the
  hedge, but hedged force is F1's job and penalising it twice is double counting.
  A signal naming condition-shaped occasions was added; the case still scores
  1.85. Left as a genuine open question about the rubric rather than a wording
  defect.
