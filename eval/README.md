# eval

The labelled sets and harnesses behind everything the rule-scoring app judges:
the two Jev questions, and the two deterministic findings. All of it was
validated here before any of it was written down; the criteria themselves, the
measurements and the reasoning live in
[`docs/knowledge/f3-trigger-distance-criteria.md`](../docs/knowledge/f3-trigger-distance-criteria.md),
[`docs/knowledge/injection-screen-criteria.md`](../docs/knowledge/injection-screen-criteria.md)
and
[`docs/knowledge/f1-f7-deterministic-criteria.md`](../docs/knowledge/f1-f7-deterministic-criteria.md).

## Running

`det-eval.js` is free: F1 and F7 are local word lists, so it can be run on every
change and it is mirrored in the test suite. The Jev harnesses need Node 18+ and
`TYPESAFE_API_KEY` in the environment, and each run is a real paid call — roughly
$0.0015 per set of ten at three repetitions.

```bash
node eval/det-eval.js     # F1 hedging and F7 anchors, working set then held-out
node eval/jev-eval.js     # is_rule and best_primitive, 32 cases at three reps
node eval/f3-eval.js      # trigger distance: tuned set, then held-out set
node eval/inj-eval3.js    # injection screen: two questions, three bands
node eval/inj-eval.js     # the v1 vs v2 comparison the fix came from
```

Latest recorded output is under `results/`.

## The rule

**Change a criteria string, re-run the set, and report the held-out number — not
the tuned one.** Both knowledge docs carry a "rules for changing this" section;
they exist because the first version of each question was wrong in a way that
only a labelled set caught.

`f3-criteria.js` holds two sets: `LABELLED` is every worked example from assay's
rubric with a stated target, and `HELDOUT` is ten rules labelled by hand and
never consulted while writing the criteria. Fitting to the first one is easy and
means little. `inj-set.js` marks eight benign cases `hard: true` — rules whose
subject is prompts, scores, ignoring or overriding, which is the vocabulary a
keyword filter trips on. They are the only reason its false-alarm count means
anything.

`jev-set.js` is the only set here whose criteria live outside this folder: the
harness reads `is_rule` and `best_primitive` straight out of `lib/questions.js`,
which is the same anti-drift guarantee from the other direction. Both of its
held-out halves are **spent** — the repair was driven by held-out cases. Report
the margin and the confident band, not the count;
[`docs/knowledge/is-rule-and-primitive-criteria.md`](../docs/knowledge/is-rule-and-primitive-criteria.md)
says why a 15/16 there meant nothing.

`det-set.js` labels the **finding**, not the 0-1 value: `hedge` is whether the
rule's force really is soft, `anchor` is whether it names anything checkable. It
carries three sets, and which one to report changes as they are spent.
`HELDOUT` was the first measurement; the `consider` fix was diagnosed on a case
inside it, so it is a regression guard now. **`HELDOUT2` is the live held-out
number.** When that one is spent in its turn, build `HELDOUT3` rather than
quietly promoting a guard back into a measurement.
