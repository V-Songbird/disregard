# eval

The labelled sets and harnesses behind everything Disregard judges: the
language screen, the two deterministic findings, and the Jev questions for
`is_rule`, `best_primitive`, trigger distance and the injection screen. The
criteria, the measurements and the reasoning live in one document per set:

- [the language screen](../docs/knowledge/language-screen-criteria.md)
- [the deterministic factors F1 and F7](../docs/knowledge/f1-f7-deterministic-criteria.md)
- [is_rule and best_primitive](../docs/knowledge/is-rule-and-primitive-criteria.md)
- [trigger distance, F3](../docs/knowledge/f3-trigger-distance-criteria.md)
- [the injection screen](../docs/knowledge/injection-screen-criteria.md)

## Running

Every harness needs Node 18 or later and runs from the repository root.

**`lang-eval.js` and `det-eval.js` are free.** Both score local word lists, so
they can run on every change.

```bash
node eval/lang-eval.js    # the language screen: leaks and refusals, counted apart
node eval/det-eval.js     # F1 hedging and F7 anchors, working set then held-out
```

Expected output from `det-eval.js`, last line:

```text
SUMMARY  HELD-OUT 2 20/20 and 20/20  |  first held-out 18/18 and 18/18  |  working 18/18 and 18/18
```

**The other four spend real money.** Each needs `TYPESAFE_API_KEY` in the
environment, and each run is a real paid call to Jev.

```bash
node eval/jev-eval.js     # is_rule and best_primitive, 32 cases at three reps
node eval/f3-eval.js      # trigger distance: tuned set, then both held-out sets
node eval/inj-eval3.js    # injection screen: two questions, three bands
node eval/inj-eval.js     # the v1 vs v2 comparison the fix came from
```

The latest recorded output of every harness is under [results/](results/).

## The rule

**Change a criteria string, re-run the set, and report the held-out number — not
the tuned one.** Each document above carries a "rules for changing this"
section. They exist because the first version of each question was wrong in a
way that only a labelled set caught.

`f3-criteria.js` holds three sets: `LABELLED` is every worked example from
[research/rubrics.md](../research/rubrics.md) with a stated target, and `HELDOUT` is ten rules labelled by hand from
the rubric's definitions. Fitting to the first one means little, and the second
is **spent**: one signal in `V2` was written from its case `english-docs`, so it
is a regression guard now. **`HELDOUT2` is the live held-out number.** Its ten
lines were picked and labelled by a labeller that saw the rubric and never saw
`V2`, and a second blind labeller's level is kept as `alt` where it differed.
`inj-set.js` marks eight benign cases `hard: true` — rules whose
subject is prompts, scores, ignoring or overriding, which is the vocabulary a
keyword filter trips on. They are the only reason its false-alarm count means
anything.

`jev-set.js` is the only Jev set here whose criteria live outside this folder: the
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

**The labelled corpora keep their text verbatim.** Some cases name an earlier
project inside their text: `not-predictor` in `f3-criteria.js` and `hard-ignore`
in `inj-set.js` name assay, and several lines in `jev-set.js` name Slag or
Readback, this project's earlier name. Editing any of them changes the measurement it belongs to.
The old names inside them are data, not references.
