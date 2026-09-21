---
type: knowledge
summary: "The labelled measurement of the deterministic factors F1 (verb force) and F7 (concreteness), the three defects it found and fixed, the held-out numbers from two independent sets, and why F4 and F5 cannot be measured in this app at all; read before touching lib/scorer.js."
related_files:
  - "lib/scorer.js"
  - "eval/det-set.js"
  - "eval/det-eval.js"
  - "lib/scorer.f1-f7-corpus.test.js"
  - "lib/analyze.js"
  - "eval/results/det-latest.txt"
---

# F1 and F7, measured

## Why they were unmeasured

F2 was the only deterministic factor anyone had checked against labelled cases,
and it was wrong nine times in ten — see
[the groundwork note](../tasks/rule-scoring-app-groundwork.md).
F1 and F7 shipped on the same assumption that produced that defect: a word list,
read once, never counted. F7 was already visibly suspect. It scored *"Run
prettier on modified files before committing."* at **0.05** and raised *"nothing
here is checkable"* over a line that names its formatter.

## What is actually being measured

Not the 0-1 values. The app emits **findings**, and each deterministic factor
drives exactly one:

| Finding | Fires when | In |
| --- | --- | --- |
| `hedge_dominance` | `scoreF1(text).hedged` | [lib/analyze.js](../../lib/analyze.js) |
| `no_concrete_anchor` | `scoreF7(text).concrete.length === 0` | [lib/analyze.js](../../lib/analyze.js) |

Both are binary, so both were labelled binary. A factor is only as good as the
call it makes, and the float behind it is a presentation detail nobody acts on.

## The corpus

56 rules in [eval/det-set.js](../../eval/det-set.js), split the way
[eval/README.md](../../eval/README.md) requires:

- **`LABELLED`, 18.** Real bullets lifted from a live `CLAUDE.md` and this
  project's own instructions, plus three probes aimed at branches whose code
  comments call them deliberate.
- **`HELDOUT`, 18.** Ordinary instruction-file idiom, labelled before anything
  was run and not consulted while fixing. **Spent** as of the third defect
  below, which was diagnosed on a case inside it. It is a regression guard now,
  not a measurement.
- **`HELDOUT2`, 20.** Built to settle that third defect on data it had never
  seen. Eight `consider` rules in both readings, four other hedging verbs, two
  bans containing a hedge word, six plain rules. Every `consider` label follows
  one stated test, so a reader can check each one instead of trusting it.

Each case carries `hedge` (the rule's force really is soft) and `anchor` (it
names something mechanically checkable), with the reason written down. The run
costs nothing — these are local word lists, not Jev calls — so unlike the other
harnesses here it can go in the test suite:

```bash
node eval/det-eval.js
```

## Baseline

```
LABELLED   hedge 16/18  false alarms 2  missed 0     anchor 17/18  false alarms 1  missed 0
HELD-OUT   hedge 16/18  false alarms 2  missed 0     anchor 16/18  false alarms 2  missed 0
```

**Missed zero, every run.** Neither finding ever failed to fire when it should
have. Every error was a false alarm, which is the same shape the F2 defect had
and the same reason it mattered: the finding that fires on a good rule is the
one that costs a reader their trust.

## The three defects

### F1 — a hedge governed a sentence it did not lead

Four hedge false alarms across both sets, three of them one cause. `scoreF1`
collected every verb match anywhere in the text and let the weakest hedging one
win outright:

| Rule | Scored | Why it is wrong |
| --- | --- | --- |
| *"Do not try to work around the sandbox."* | 0.20 hedged, via `try to` | The hedge sits **inside what is banned** |
| *"Never prefer a mock over the real database in integration tests."* | 0.50 hedged, via `prefer` | `prefer` is the banned behaviour, not the force |
| *"Avoid `any`; prefer `unknown` when the type is genuinely open."* | 0.50 hedged, via `prefer` | `prefer` introduces the **replacement** |

That behaviour was deliberate once. The comment marked `[Foreman: 075]` put it
there so *"Always try to use functional components"* would stop scoring 1.00,
and for that sentence it is right: the hedge leads the directive. It is wrong
the moment a prohibition opens the sentence first.

**Fix.** A hedge governs the sentence it *leads*. Hedges positioned after the
first prohibition marker are dropped, reusing the `PROHIBITION_CLAUSE_RE` that
[lib/scorer.js](../../lib/scorer.js) already carries for F2. A hedge *ahead* of
the ban still wins, because *"Where possible, do not use `any`"* really is
hedged.

### F7 — the tool list only knew marketing capitalization

Three false alarms, one cause. The framework pattern in `CONCRETE_REGEX` is
case-sensitive and lists `Prettier`, `Zod`, `Vite`. Instruction files write
`prettier`, `zod`, `npm`. So *"Use npm, not yarn."* scored **0.05** with zero
markers, and the page told the reader that a rule naming two package managers
named nothing checkable.

**Fix.** A second list, `TOOL_NAME_REGEX`, scanned case-insensitively. It holds
only tokens that are never ordinary English. `Next`, `REST`, `Express`, `Spring`
and `Rails` stay case-sensitive in the old list on purpose — *"move it to the
next step"* and *"read the rest of the file"* are not anchors, and a blanket
`/i` would have turned both into ones.

### F1 again — `consider` was not always a suggestion

`consider` sits in the suggestion tier at 0.30, alongside `aim to` and `where
practical`. Those two are unambiguous. `consider` is the only verb in any
hedging tier that doubles as an ordinary transitive verb meaning *regard as*:

| Rule | Reading | Scored |
| --- | --- | --- |
| *"Consider adding a regression test."* | suggestion — genuinely optional | 0.30 hedged, correctly |
| *"Consider all inputs untrusted."* | directive — *regard* them as untrusted | 0.30 hedged, **wrongly** |

The first measurement caught exactly one of these and could not settle it: the
only evidence was a held-out case, and fitting to it would have spent that
number. `HELDOUT2` was built for it, and the baseline came back **hedge 16/20,
four false alarms, every one a `consider`** used as *regard as*.

**Fix.** `consider` stays a suggestion only before `whether`, `if`, or a gerund.
The gerund test checks the stem against `ALL_VERBS` — the verb vocabulary the
file already carries — rather than matching `/\w+ing/`, because *"Consider
everything in `/tmp` disposable"* and *"Consider the string frozen"* both end a
word in -ing and neither is a gerund. Anything else is scored as the bare
imperative it is, at 0.85.

## Result

```
LABELLED     hedge 18/18  false alarms 0  missed 0     anchor 18/18  false alarms 0  missed 0
HELD-OUT     hedge 18/18  false alarms 0  missed 0     anchor 18/18  false alarms 0  missed 0
HELD-OUT 2   hedge 20/20  false alarms 0  missed 0     anchor 20/20  false alarms 0  missed 0
```

| Set | Hedging | Anchors |
| --- | --- | --- |
| `HELDOUT`, first measurement | 16/18 → 17/18 → **18/18** | 16/18 → **18/18** |
| `HELDOUT2`, `consider` only | 16/20 → **20/20** | **20/20** unchanged |

**Missed zero in every run of all three sets, before and after every fix.**
Every error this document reports was a false alarm, and every case labelled
`hedge: true` anywhere still fires — asserted directly in
[lib/scorer.f1-f7-corpus.test.js](../../lib/scorer.f1-f7-corpus.test.js). The 28-case F2
corpus passes unchanged throughout. The latest recorded run is
[eval/results/det-latest.txt](../../eval/results/det-latest.txt).

`HELDOUT2`'s anchor column never moved, which is the useful null result: the
`consider` fix touches F1 only, and a fresh set agreed with F7 twenty times out
of twenty without being consulted.

### The one residual

*"Consider logging disabled in production."* still scores 0.30 hedged. `logging`
really is the gerund of a verb this file knows, so the stem test cannot tell it
apart from *"Consider logging every request"* — only the complement that follows
can, and reading that needs a parser.

**Left as is.** The construction is ambiguous in English too, no corpus case
depends on it, and a parser is far out of proportion to one reading of one verb.
It is pinned by name in the test so it cannot quietly become a class.

## F4 and F5 are not here, and cannot be

An earlier draft of the groundwork note listed F4 and F5 alongside F1 and F7 as
unmeasured risks. That was wrong: they are not risks to this app, because they
are not in it.

| Factor | What it judges | What it needs |
| --- | --- | --- |
| F4 | scope — *"applies too broadly"* | the file's globs and the paths it governs |
| F5 | position — *"buried near the bottom"* | the rule's line offset and the file's length |

Both take a **file**. Disregard's input is one rule pasted into a box. There is
no file, so F5 is undefined and F4 has nothing to align against — which is why
the port took F1, F2 and F7 and left those two behind, as the header of
[lib/scorer.js](../../lib/scorer.js) records.

Measuring them needs a corpus of whole instruction files. It becomes this
project's problem only if the ADR's whole-file pipeline is ever built, and then
the corpus has to be built first.

## Rules for changing this

1. **Change a word list, re-run the sets, report `HELDOUT2`.** Not the working
   set, and not `HELDOUT` — that one is spent. `node eval/det-eval.js` prints all
   three. When `HELDOUT2` is spent in its turn, build `HELDOUT3`; do not quietly
   promote a guard back into a measurement.
2. **A new false alarm is a defect; a new miss is a worse one.** All three sets have
   stood at zero misses since before the fixes. Do not trade that away for a
   false-alarm count.
3. **Do not fit to `Consider logging disabled`.** It is the named residual, and
   fixing it from the probe alone repeats the mistake this rule exists to
   prevent. If it matters enough to fix, it matters enough to build a set for.
4. **Case-insensitive tokens must never be ordinary English.** That is the whole
   reason `TOOL_NAME_REGEX` is separate from `CONCRETE_REGEX` instead of being
   the same list with an `/i`.
5. The corpus is 56 rules across three sets. It is enough to catch a structural defect and far too
   small to certify anything. Treat a number here as evidence that a specific
   failure is gone, not as an accuracy claim.

## Rejected Alternatives

**Labelling the 0-1 values instead of the findings.** Hand-labelling a float is
guesswork, and the disagreement would have been about the labeller, not the
scorer. The finding is what a reader sees.

**Making `CONCRETE_REGEX` case-insensitive.** One character, and it turns *"the
next step"* and *"the rest of the file"* into concrete anchors. Both idioms are
pinned as tests.

**Dropping the `[Foreman: 075]` hedge rule entirely.** It is right for the
sentence it was written for. The defect was its reach, not its existence.

**Matching `/\w+ing/` for the gerund test.** One character shorter and it breaks
on *"Consider everything in `/tmp` disposable"*, because "everything" ends in
-ing. Checking the stem against `ALL_VERBS` costs three lines and is exact. All
three counterexamples are pinned as tests.

**Fitting the `consider` fix to `untrusted-inputs` when it was first found.**
Faster by an hour and it would have made every held-out number in this document
unverifiable. The second set cost one file and settled the question on data the
fix had never seen.

**Reporting F1 and F7 as accuracy percentages.** 56 hand-labelled rules is a
defect hunt, not a benchmark. Counts, with the failures named, say what actually
happened.
