---
type: task_summary
status: active
summary: "State of the Jev rule-scoring app before implementation starts: what was researched, the three scorer defects that were found and fixed, what is validated and what is not, and the decisions still open."
related_files:
  - "docs/decisions/rule-scoring-product-viability.md"
  - "docs/knowledge/jev-commercial-licensing.md"
  - "docs/knowledge/f3-trigger-distance-criteria.md"
  - "docs/knowledge/injection-screen-criteria.md"
  - "eval/"
  - "lib/"
  - "test/"
---

# Rule-scoring app — groundwork, before any code

Handoff note. Everything below is already written down somewhere durable; this
exists so a session starting fresh knows which document to open and what is
still undecided.

## What the thing is

A web page: paste rule text, get back which lines are actually rules, how each is
written, and which ones should stop being prose and become a hook. Deterministic
scoring in our own code; two judgments from TypeSafe's Jev.

**Free, not a subscription.** The paid tier originally planned — paste a whole
`CLAUDE.md`, get a summary — ships free today from
[AgentLinter](https://agentlinter.com/), with the same paste box, same button,
same web report. Reasoning and the rest of the competitive picture:
[rule-scoring-product-viability.md](../decisions/rule-scoring-product-viability.md).

## What is settled

| Question | Answer | Where |
| --- | --- | --- |
| May we sell something built on Jev? | Yes; `jev-preview` carries no special terms | [jev-commercial-licensing.md](../knowledge/jev-commercial-licensing.md) |
| May we resell Jev access itself? | No — MCA §2.3(a) | same |
| May we train our own scorer on the verdicts? | **No** — §2.3(b) | same |
| Do we need a privacy notice? | Yes; the DPA names us controller. Draft text is in the doc | same |
| Cost per rule | ~880 tokens ≈ $0.000037 | same |
| What differentiates it | The measured corpus, not a feature | the ADR, item 5 |

## The three scorer defects, all fixed

Each was found by measuring against labelled cases, and each is written up with
its numbers and a "rules for changing this" section.

1. **F2 over-flagged bare prohibitions.** 10 of 37 bullets in a real
   `CLAUDE.md`, 9 of them wrong. Cause: the replacement usually sits in a
   neighbouring sentence sharing no words with the ban. Fix: a third state,
   `prohibition_alternative_unproven`, so the grade-capping verdict is kept only
   for a ban standing alone. **12/28 corpus errors → 0/28**, and 10 flags → 1.
   Code and fixtures live in the assay repo, not here — see *Uncommitted work*.
2. **F3 compressed the top of its scale.** Cause: the Score levels were written
   comparatively, and the model evaluates each level without seeing its
   neighbours. Fix: standalone situations with signals. **4/10 → 9/10 exact** on
   the rubric's examples, **6/10 on held out**.
   [f3-trigger-distance-criteria.md](../knowledge/f3-trigger-distance-criteria.md)
3. **The injection screen was noise.** ~0.38 on everything, 0.77 on a plain
   Spanish rule. Cause: one Noul, no criteria, asking whether an instruction is
   an instruction. Fix: explicit true/false criteria, then split into two narrow
   questions. **9/9 attacks caught, 14/15 benign clean, margin 0.74.**
   [injection-screen-criteria.md](../knowledge/injection-screen-criteria.md)

## What is validated, and what is not

**Validated and ready to wire:** the injection screen (two Nouls), the F3 Score
question, the F8 question and the primitive-routing Choice from the first probe
(F8 hit 4/4 on labelled cases; hook routing hit confidence 1.00).

**Not validated:**

- **F1, F4, F5, F7** have never been measured against a labelled set. F2 was the
  one that got checked, and it was wrong 9 times in 10. Assume the others carry
  similar risk until someone looks.
- **The composition** — weighted mean, soft floor, grade letters — is inherited
  from assay and has no evidence of its own beyond the rule-lab weights.
- **Spanish.** Jev judges it acceptably; the deterministic half (F1/F2/F7) is
  English word lists and does not. No policy chosen yet.

## Open decisions

1. **Publish `rule-lab`?** It is the moat — 2,020 measured cells, $111.61, and a
   harness that lets strangers add model columns for ~$41 each. Its README calls
   itself *"never published"*, so publishing reverses a standing decision. Audit
   `results/` for machine-local transcripts first.
2. **Language policy.** English-only and say so, or accept Spanish with the
   deterministic half withheld and the verdict marked partial.
3. **Where the app lives.** Nothing exists yet. The API key must stay
   server-side, so it is a static page plus one serverless function.
4. **Whether to measure F1/F4/F5/F7** before launch or ship them labelled as
   unmeasured.

## Where things live

This project moved out of `Slag` on 2026-09-20 and is now **Readback**, at
`D:\Projects\Songbird\Readback`. Only `docs/` and `eval/` came across;
`Slag/docs/collet-plugin.md` stayed behind because it belongs to that repo.

**Readback is a git repository as of 2026-09-20**, on `main`, first commit
`db63860`. Identity is set per-repository, not globally.

**The deterministic half is here.** `lib/scorer.js` carries F1, F2 and F7 ported
verbatim out of `assay/scripts/assay.js`, with the F2 fix in place, and
`test/f2-prohibition-corpus.test.js` carries the 28-case labelled corpus that
proves it. `node --test` passes 5/5. The port was checked against the original
on 43 texts across all three factors with zero mismatches, so the two
implementations agree exactly at the moment of the copy. F4 and F5 did **not**
come across: both need a whole file and a corpus, which this app does not have.
The upstream copies stay uncommitted in `slag`, and assay is still being
retired; nothing here depends on them any more.

One thing still lives outside this folder and is needed:

- **The earlier research** — `writing-rules-for-ai.md` (the extracted rubric) and
  `jev-rule-scoring-feasibility.md` (the first Jev probe) — in that same repo
  under `docs/`, which it gitignores by design. They are local-only and will
  never be in anyone's history. Copy them here if they matter.

## Naming

**Readback.** In air traffic control, a readback is the receiver repeating an
instruction so the sender can hear whether it landed the way it was meant. That
is exactly the transaction here: you paste a rule, and the tool tells you how it
reads to the thing that has to follow it.

The name also encodes the boundary this project refuses to cross. A readback
confirms that an instruction was *understood*, never that it will be *obeyed* —
which is the same line the research draws on every page: *"No static check can
tell you an agent will comply, and this one does not try."* A name that promised
compliance would be lying; this one does not.

Deliberately unrelated to the foundry vocabulary of `Slag` and its plugins
(`assay`, `collet`, `anneal`, `jig`). This is a separate product and reads as
one. An earlier pick, *Touchstone*, was dropped for exactly that reason: it was
chosen for its descent from `assay`, which is a lineage nobody outside the old
repo can see. Runners-up: *Litmus* (instantly legible, but a well-known SaaS
already owns it) and *Ruleproof* (accurate, flat).

## Next step

Build the serverless function. The deterministic half is done — call
`lib/scorer.js` — so what remains is one Jev request carrying the injection
screen plus `is_rule`, F3, F8 and the primitive Choice, then composition, then
findings — not a grade. The UI leads with *"this should be a hook"* and *"these
lines are not rules"*, because those are the two things no competitor can say.

Composition has no evidence of its own and F1 is now portable but still
unmeasured, so treat the weighted mean as inherited, not validated.
