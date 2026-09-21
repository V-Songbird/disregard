---
type: task_summary
status: completed
summary: "Bringing every piece of research this app depends on out of the slag repository and into Disregard, so the repo stands alone before it is published; lists what moved, what was deliberately left, and what still points outward."
related_files:
  - "research/"
  - "docs/decisions/rule-scoring-product-viability.md"
  - "docs/knowledge/"
  - "lib/questions.js"
  - "lib/scorer.js"
  - "lib/language.js"
  - "eval/f3-criteria.js"
---

# Decouple Disregard from slag and assay

**Decision, 2026-09-20:** this repository owns everything it depends on. It will
be published, so "slag is public and this is not" stops being a reason to leave
the research there. Nothing of this app's is to live in another repository.

This reverses the recommendation recorded earlier the same day in
[rule-scoring-product-viability.md](../decisions/rule-scoring-product-viability.md),
which argued for `slag` on the grounds that this repo had no remote and that
assay's model profiles were the contribution target. The first is temporary. The
second is the coupling being removed, not a reason to keep it.

## What was actually coupled

**No runtime dependency existed.** `lib/scorer.js:5` already states the port was
made so the app would not depend on a repository that is going away. The
coupling was evidence and provenance, not code:

| What | Where it was | Size | Why this repo needs it |
| --- | --- | --- | --- |
| `rule-lab` | `slag/docs/research/rule-lab` | 8.8 MB | The measurements behind every claim the product makes |
| `rubrics.md` | `slag/assay/references` | 4.8 KB | F8 levels are verbatim from it; the F3 labelled set is derived from it |
| `writing-rules-for-ai.md` | `slag/docs` | 28 KB | The extracted rubric the viability case rests on |
| `jev-rule-scoring-feasibility.md` | `slag/docs` | 12 KB | The first Jev probe |

All four sat under paths `slag/.gitignore:15` excludes with a blanket `/docs/*`,
so none of them were in any repository's history. There was one copy of each.

## Checklist

- [x] `research/rule-lab/` — copied from slag, harness and 12 specs and 2,020 cells
- [x] `research/rubrics.md` — copied, with a header saying what it is here
- [x] `docs/knowledge/writing-rules-for-ai.md` — copied, frontmatter added
- [x] `docs/knowledge/jev-rule-scoring-feasibility.md` — copied, frontmatter added
- [x] Pointers rewritten in `lib/` and `eval/` to in-repo paths
- [x] `docs/` sections claiming the research is unlinkable rewritten
- [x] Tests pass, no pointer left aiming at slag or assay

**Done 2026-09-20.** The check went from 47 to **57 tests** because
`harness.test.js` joined it, which is the point: the harness cannot rot
unnoticed now. `AGENTS.md` and `README.md` carry the new count.

Every remaining mention of assay in this repository is one of three things, all
intended: history in a comment, the field guide's own subject, or text inside a
labelled case.

## Left open by this task

**The research page cannot link to the source yet.** [public/research.html](../../public/research.html)
explains the method, the findings and what a contribution costs, and then has to
say the harness "ships with the source" rather than naming a URL, because this
repository still has no remote. When it gets one, that page and this note both
want one line each. Nothing else on it goes stale.

## Not to be touched

**The labelled corpora keep their text verbatim.** Three fixtures name assay or
Slag inside case text: `eval/f3-criteria.js` has *"assay is not a
rule-compliance predictor."* at F3 level 0, `eval/inj-set.js` has an
`assay-ignore` comment as a hard benign case, and `eval/jev-set.js` has a
project-history line as a labelled non-rule. Editing any of them changes the
measurement it belongs to. They stay as they are, and the old names inside them
are data, not references.

## Traps found on the way

**`.gitignore` already excludes `docs/research/`.** Putting the harness under
that path would reproduce in this repository the exact accident that kept it out
of `slag`. It goes at top level under `research/` instead.

**The copies in `slag` are left in place.** Copying is reversible and deleting
another repository's files is not this task's call. `slag` still holds its own
copy of all four; retiring them there is a separate decision.
