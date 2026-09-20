---
type: knowledge
summary: "The first labelled measurement of the deterministic factors F1 (verb force) and F7 (concreteness), the two defects it found and fixed, the held-out numbers, and why F4 and F5 cannot be measured in this app at all; read before touching lib/scorer.js."
related_files:
  - "lib/scorer.js"
  - "eval/det-set.js"
  - "eval/det-eval.js"
  - "test/f1-f7-corpus.test.js"
---

# F1 and F7, measured

## Why they were unmeasured

F2 was the only deterministic factor anyone had checked against labelled cases,
and it was wrong nine times in ten — see
[the groundwork note](../tasks/20260920_TASK_rule-scoring-app-groundwork_ffdda76c.md).
F1 and F7 shipped on the same assumption that produced that defect: a word list,
read once, never counted. F7 was already visibly suspect. It scored *"Run
prettier on modified files before committing."* at **0.05** and raised *"nothing
here is checkable"* over a line that names its formatter.

## What is actually being measured

Not the 0-1 values. The app emits **findings**, and each deterministic factor
drives exactly one:

| Finding | Fires when | In |
| --- | --- | --- |
| `hedge_dominance` | `scoreF1(text).hedged` | [lib/analyze.js:81](../../lib/analyze.js:81) |
| `no_concrete_anchor` | `scoreF7(text).concrete.length === 0` | [lib/analyze.js:84](../../lib/analyze.js:84) |

Both are binary, so both were labelled binary. A factor is only as good as the
call it makes, and the float behind it is a presentation detail nobody acts on.

## The corpus

36 rules in [eval/det-set.js](../../eval/det-set.js), split the way
[eval/README.md](../../eval/README.md) requires:

- **`LABELLED`, 18.** Real bullets lifted from a live `CLAUDE.md` and this
  project's own instructions, plus three probes aimed at branches whose code
  comments call them deliberate.
- **`HELDOUT`, 18.** Ordinary instruction-file idiom, labelled before anything
  was run and not consulted while fixing.

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

## The two defects

### F1 — a hedge governed a sentence it did not lead

Five false alarms across both sets, one cause. `scoreF1` collected every verb
match anywhere in the text and let the weakest hedging one win outright:

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

## Result

```
LABELLED   hedge 18/18  false alarms 0  missed 0     anchor 18/18  false alarms 0  missed 0
HELD-OUT   hedge 17/18  false alarms 1  missed 0     anchor 18/18  false alarms 0  missed 0
```

**Held-out hedging 16/18 → 17/18. Held-out anchors 16/18 → 18/18.** No real
hedge was lost: every case labelled `hedge: true` in either set still fires,
which is asserted directly in
[test/f1-f7-corpus.test.js](../../test/f1-f7-corpus.test.js). The suite went 24
to 31 tests, and the 28-case F2 corpus still passes unchanged.

Two of the three F1 cases were working-set probes, so the third —
*"Avoid `any`; prefer `unknown`"* — is the honest evidence: a held-out rule the
same fix repaired without being fitted to it.

### The one residual

*"Consider all inputs untrusted at the handler boundary."* still scores 0.30
hedged via `consider`. It is not a suggestion; `consider X Y` means *regard X as
Y*, and the rule is a directive. `consider` is the only verb in its tier that
doubles as a plain transitive verb — `aim to` and `where practical` do not.

**Left unfixed on purpose.** The only evidence for it is a held-out case, and
fitting the scorer to that case would spend the one number in this document that
means anything. A fresh set should settle it. It is pinned by name in the test
so it cannot quietly become two.

## F4 and F5 are not here, and cannot be

The groundwork note listed F4 and F5 alongside F1 and F7 as unmeasured risks.
That was wrong: they are not risks to this app, because they are not in it.

| Factor | What it judges | Signature in assay |
| --- | --- | --- |
| F4 | scope — *"applies too broadly"* | `scoreF4(rule, file)` |
| F5 | position — *"buried near the bottom"* | `scoreF5(lineStart, file)` |

Both take a **file**. F4 reads `file.globs`, `file.alwaysLoaded` and
`file.globMatchCount` to ask whether a rule's stated scope matches the paths the
file governs; F5 measures a line offset against the file's length. Readback's
input is one rule pasted into a box. There is no file, so F5 is undefined and F4
has nothing to align against — which is why the port took F1, F2 and F7 and left
those two behind.

Measuring them means measuring assay, against a corpus of whole instruction
files, in a repository that is being retired. That is a different project. It
becomes this project's problem only if the ADR's whole-file pipeline is ever
built, and then the corpus has to be built first.

## Rules for changing this

1. **Change a word list, re-run the set, report the held-out number.** Not the
   working one. `node eval/det-eval.js` prints both.
2. **A new false alarm is a defect; a new miss is a worse one.** Both sets have
   stood at zero misses since before the fixes. Do not trade that away for a
   false-alarm count.
3. **Do not fit to `untrusted-inputs`.** Fixing the named residual from the
   held-out set makes every number above unverifiable. Build a fresh set.
4. **Case-insensitive tokens must never be ordinary English.** That is the whole
   reason `TOOL_NAME_REGEX` is separate from `CONCRETE_REGEX` instead of being
   the same list with an `/i`.
5. The corpus is 36 rules. It is enough to catch a structural defect and far too
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

**Reporting F1 and F7 as accuracy percentages.** 36 hand-labelled rules is a
defect hunt, not a benchmark. Counts, with the failures named, say what actually
happened.
