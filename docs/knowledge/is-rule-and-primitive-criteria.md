---
type: knowledge
summary: "The first labelled measurement of the two Jev questions that shipped unmeasured — is_rule and best_primitive — the criteria defects it found, what the repair fixed and what it broke, and the confidence result that makes the remaining errors safe on the page; read before editing either criteria block in lib/questions.js."
related_files:
  - "lib/questions.js"
  - "eval/jev-set.js"
  - "eval/jev-eval.js"
  - "eval/results/jev-latest.txt"
---

# `is_rule` and `best_primitive`, measured

## Why they were unmeasured

Every other question the app asks was validated before it was written down. These
two were not, and `lib/questions.js` said so at the top: the original probe ran
an `is_rule` Noul and got 0.88–0.97 on six rules **that were all rules**, so the
question had never been shown a negative. `best_primitive` had two hook cases at
confidence 1.00 and nothing else. The wording that shipped was not even the
wording the probe used — that script is gone.

A question that has never been shown a negative has not been tested.

## The corpus

32 cases in [eval/jev-set.js](../../eval/jev-set.js), each asked on its own so a
non-rule is never asked where it belongs, which is a question with no answer.

- **`IS_RULE`, 16** — eight rules and eight pieces of text that command nothing:
  a status claim, an API fact, a definition, project history, a repository
  layout, a timing measurement, a recorded decision and a product description.
  Split 8 working, 8 held out.
- **`PRIMITIVE`, 16** — four each of `rule`, `hook`, `skill`, `subagent`, labelled
  against the four criteria in `lib/questions.js` verbatim. Split 8 and 8.

The `is_rule` label follows one stated test, so a reader can check each case
rather than trust it: **can a reader change what they do because of this
sentence?** Yes is a rule. A sentence that only informs is not, however useful.

Three repetitions each. Three runs cost about **151,000 input tokens, roughly
$0.006** at the rate measured for this app.

```bash
node eval/jev-eval.js
```

## Baseline

```
is_rule    working 8/8   HELD OUT 7/8
primitive  working 5/8   HELD OUT 7/8    1 case unstable across repetitions
```

### `is_rule` — 15 of 16, and the count was hiding the problem

```
rules      0.98  0.97  0.97  0.95  0.95  0.97  0.85  0.56
non-rules  0.26  0.16  0.13  0.10  0.10  0.07  0.06  0.79
```

Fourteen of sixteen separate by a mile — 0.85 to 0.98 against 0.06 to 0.26. Then
two cases cross: a rule at **0.56** and a non-rule at **0.79**. The margin is
**−0.23**, and a negative margin means no threshold separates the classes. The
0.5 cut happened to land 15 of 16, which is where the cases fell, not evidence
that the scale works.

The non-rule at 0.79 was *"Readback scores one rule at a time and never returns
a grade."* — a product description wearing the word "never". The page would show
no `not_a_rule` finding on it at all, which is the one finding the whole product
exists to make.

### `best_primitive` — `hook` swallowed anything with a moment in it

| Rule | Labelled | Chosen | Confidence |
| --- | --- | --- | --- |
| *"When adding a database migration: …"* | skill | **hook** | 0.41 |
| *"Before each release, review every public API change…"* | subagent | **hook** | 0.55 |
| *"After a large refactor, re-read every touched file…"* | subagent | **hook** | 0.23 |
| *"REST conventions for this API: …"* | skill | **rule** | 0.77 |

Three of the four errors went to `hook`, and all three open with a temporal
clause. The hook criterion led with *"it comes due at a nameable event"* and
only then mentioned the test that actually distinguishes it. The model took the
first clause and stopped. None of those three can be settled by a command.

## The repair

**`best_primitive`** — the hook criterion now leads with the deterministic check
and carries the disqualifier explicitly: *"If the work at that event has several
steps, or needs reading and judgment rather than a pass or a fail, it is not a
hook however clearly the moment is named."* The note says the same in one line.
`skill` and `subagent` were sharpened to say what they produce rather than how
long they are.

**`is_rule`** — the criteria now name who the sentence is about, the reader or
the system, and the note says outright that grammar does not settle it: a
fact-shaped sentence can be an instruction, and a sentence carrying "never" can
be a description.

## Result

```
is_rule    working 8/8   HELD OUT 7/8    margin -0.23 → +0.06
primitive  working 7/8   HELD OUT 6/8    13/16 overall, nothing unstable
```

| | Before | After |
| --- | --- | --- |
| `is_rule` count | 15/16 | 15/16 |
| `is_rule` margin | **−0.23** | **+0.06** |
| `primitive` count | 12/16 | **13/16** |
| `primitive` unstable | 1 | **0** |
| Confident picks (≥0.80) correct | 5/5 | **10/10** |

### The result that matters for the page

**Every primitive pick at confidence 0.80 or better was right — 10 for 10 — and
every error sat below that line.** The app only asserts *"a command could settle
this, so a hook would do it better"* above 0.80; below it, the card softens to
*"a tool could check this for you"* and names no primitive at all. So the four
remaining errors never reach a reader as a claim. The confident band also
doubled, from five picks to ten.

That is what the confidence-routing pattern is for, and this is the first
evidence that it is doing its job here rather than being assumed to.

**The page was changed to use it.** On the strength of 10/10, the confident band
now names the primitive it picked — `skill` and `subagent` included, where
before only `hook` was ever said out loud and everything else collapsed into
*"a tool could check this for you"*. Below the cut nothing is named, exactly as
before. See the groundwork note's page section.

### What the repair fixed, and what it broke

Fixed: all three temporal-clause errors. *"When adding a database migration"*
went 0.41 `hook` → **0.92 `skill`**, and both review passes went to `subagent`.
The one unstable case became stable.

Broke: *"Never commit directly to `main`."* went 0.57 `hook` → **0.40 `rule`**.
The new wording leads with a check that runs, and a flat ban is a state to
enforce rather than a check to run. One case worse, three better.

Moved rather than fixed, on `is_rule`: the description at 0.79 came down to
**0.37**, and the fact-shaped directive *"Credentials come from
`TYPESAFE_API_KEY` in the environment."* went 0.56 → **0.43**, crossing the cut
the other way. Same count, opposite error, and an ordering that is now correct:
no non-rule outranks any rule.

## Open, and deliberately not fixed

1. **Fact-shaped directives sit on the fence.** 0.43 and 0.56 across two
   wordings. The question cannot resolve *"Credentials come from `X`"*, and
   reasonable people label it differently too.
2. **A short body of reference reads as a rule.** `rest-conventions` and
   `design-tokens` both went to `rule`, at 0.68 and 0.49. The `skill` criterion
   still loses to `rule` when the reference is one sentence long.
3. **`no-main-commit` is a regression this repair introduced.** Diagnosed above.

All three sit below the confidence cut, or on `is_rule` cases built to be hard.
None is fixed here, because the evidence for each is a held-out case and fitting
to it would spend the only numbers in this document that mean anything.

## Rules for changing this

1. **Both held-out sets are spent.** The `is_rule` repair was driven by a
   held-out case, and the primitive pattern was confirmed on one. Build
   `HELDOUT2` sets before claiming a new number; do not report these as held out
   again.
2. **Report the margin, not the count.** `is_rule` scored 15/16 with a margin of
   −0.23. The count said the question worked and the margin said it did not.
3. **Watch the confident band.** 10/10 above 0.80 is the number the page depends
   on. A change that raises raw accuracy while putting an error above 0.80 is a
   regression, not an improvement.
4. **Criteria live in `lib/questions.js` and the harness reads them from there.**
   One definition, production and measurement sharing it. Do not copy them into
   `eval/`.

## Rejected Alternatives

**Adding counterexamples to the `is_rule` note to make it more decisive.** It did
the opposite in one direction: typical rules came down from ~0.97 to ~0.93 and
the hard rule crossed the cut. Teaching a Noul that a question is hard makes it
hedge. The note kept here states the distinction; it does not argue both sides at
length.

**Fixing `no-main-commit` in a third pass.** One clause would probably do it, and
it would be fitted to a held-out case in a set already spent once. The error sits
at 0.40, well under the cut, so no reader sees it asserted. A fresh set is what
should settle it.

**Asking both questions in one request per case.** Cheaper by half, and it would
let one question's criteria colour the other's answer. Each case is asked alone.

**Reporting accuracy percentages.** 32 hand-labelled cases at three repetitions
is a defect hunt. Counts, margins and the confident band say what happened.
