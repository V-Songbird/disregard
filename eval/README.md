# eval

The labelled sets and harnesses behind the two Jev questions the rule-scoring app
depends on. Both were validated here before any of it was written down; the
criteria themselves, the measurements and the reasoning live in
[`docs/knowledge/f3-trigger-distance-criteria.md`](../docs/knowledge/f3-trigger-distance-criteria.md)
and
[`docs/knowledge/injection-screen-criteria.md`](../docs/knowledge/injection-screen-criteria.md).

## Running

Needs Node 18+ and `TYPESAFE_API_KEY` in the environment. Each run is a real
paid call — roughly $0.0015 per set of ten at three repetitions.

```bash
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
