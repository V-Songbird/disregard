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
  - "api/"
  - "public/"
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
| Cost per rule | **~2,380 tokens ≈ $0.0001** for the shipped five-question set; the $0.000037 in the docs was one question, not five | measured 2026-09-20 against `lib/questions.js` |
| What differentiates it | The measured corpus, not a feature | the ADR, item 5 |

## The three scorer defects, all fixed

Each was found by measuring against labelled cases, and each is written up with
its numbers and a "rules for changing this" section.

1. **F2 over-flagged bare prohibitions.** 10 of 37 bullets in a real
   `CLAUDE.md`, 9 of them wrong. Cause: the replacement usually sits in a
   neighbouring sentence sharing no words with the ban. Fix: a third state,
   `prohibition_alternative_unproven`, so the grade-capping verdict is kept only
   for a ban standing alone. **12/28 corpus errors → 0/28**, and 10 flags → 1.
   Code and fixtures are here now: `lib/scorer.js`, `test/`.
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

**All wired, and the wiring is exercised.** Three live calls through
`api/score.js` on 2026-09-20 reproduced the documented numbers: the prettier rule
came back F3 2.00, F8 0.01, `hook` at confidence **0.99**, `is_rule` 0.98; *"All
files are optimized for agent consumption."* came back `is_rule` **0.24** and F3
0.18; a prompt-injection string scored risk **0.98** and was refused. That is the
first time `is_rule` has been shown a non-rule, and it was right.

**Not validated:**

- **F1, F4, F5, F7** have never been measured against a labelled set. F2 was the
  one that got checked, and it was wrong 9 times in 10. Assume the others carry
  similar risk until someone looks. F7 already shows it: it scored the prettier
  rule 0.05 and raised *"nothing here is checkable"* over a line that names
  `prettier`, because the word was not in backticks and not on its term list.
- **`is_rule` and the `best_primitive` rubrics in `lib/questions.js`** are new
  wording, not the probe's — that script is gone. One correct non-rule is an
  anecdote, not a measurement.
- **The composition** — weighted mean, soft floor, grade letters — is inherited
  from assay and has no evidence of its own beyond the rule-lab weights.
- **The language screen itself.** It is assay's, ported, and it was never
  measured there either. Its thresholds encode a deliberate bias toward calling
  things English — see `lib/language.js` — so the expected failure is a foreign
  rule scored as English, not an English rule turned away.
- **The six interface translations.** Written here, not reviewed by a native
  speaker of any of them.

## Settled since

**Language: the interface carries it, the rules do not.**

Rules are English. `CLAUDE.md` and `AGENTS.md` are written in English, it is the
only language anything here was measured in, and F1, F2 and F7 are English word
lists on top of that. So a rule in another language is **not scored at all** —
it returns `status: "not_english"` with the language named, before a request is
spent. An earlier draft scored such rules with the deterministic half withheld
and called the result partial; that was wrong, because half a verdict on
something never measured is still an unmeasured verdict.

**The interface** speaks six languages — English, Chinese, Hindi, Spanish,
Arabic and French. Fifth place is contested between French and Arabic depending
on how Arabic varieties are counted, so both are in; Arabic is also what proves
the layout works right to left. The picker remembers a choice and otherwise
follows `navigator.languages`.

This is why the API returns **finding ids and numbers, never sentences**. Every
sentence a reader sees lives in `public/i18n.js`, including the error text,
which is why errors carry a `code` as well as an English `error`.

**Host: Cloudflare Workers**, on the existing free-plan account. `worker.js` is
the entry point, `wrangler.jsonc` the config, and the key is a Worker secret:

```bash
wrangler secret put TYPESAFE_API_KEY
```

Verified locally on workerd: the Worker boots, bundles to 16 KiB gzipped, and
answers 405, 400 and the unconfigured-key path correctly. It has **not** been
deployed and has never run in Workers with a real key; the live Jev calls were
made from Node. Nothing in the handler touches a Node built-in, so
`nodejs_compat` is off.

## Open decisions

1. **Publish `rule-lab`?** It is the moat — 2,020 measured cells, $111.61, and a
   harness that lets strangers add model columns for ~$41 each. Its README calls
   itself *"never published"*, so publishing reverses a standing decision. Audit
   `results/` for machine-local transcripts first.
2. **Whether to measure F1/F4/F5/F7** before launch or ship them labelled as
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
proves it. The port was checked against the original
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

The function is built. `api/score.js` takes `{ rule }`, `lib/analyze.js` sends
one Jev request carrying all five questions and composes findings — **no grade**,
by the ADR's honesty argument, so the inherited weighted mean was never wired and
nothing here depends on it. `node --test` covers the bands and the composition
with stubbed answers, 24/24.

**Deploy it.** `wrangler deploy`, then `wrangler secret put TYPESAFE_API_KEY`.
Nothing is live. That is the only step left.

## The page

`public/` — four static files and a stylesheet, no framework and no build step.
It leads with the findings and never shows a grade, which is the ADR's honesty
argument carried into the markup: `not_a_rule` and the hook findings get the
accent border, the numbers sit behind a *"What was measured"* disclosure, and
the honesty line sits under the input box rather than in the footer, where
[jev-commercial-licensing.md](../knowledge/jev-commercial-licensing.md) says it
belongs.

Every state says what it is rather than hiding a gap: `not_english` says rules
go in English and names the language it found, `review` and `refused` hand the
text straight back unchanged, and a clean rule gets *"Nothing flagged"* followed
by the reminder that this is not a prediction of compliance.

`i18n.js` holds all six translations, about 45 strings each. Switching language
re-renders the answer already on screen rather than clearing it.

`privacy.html` carries the five-fact notice the DPA requires, and `terms.html`
the §9.3 reality. Both were draft text in the licensing doc; they are pages now,
neither has been read by a lawyer, and **both stay English on purpose** — an
unreviewed translation of a legal notice is worse than one authoritative copy.

**Checked, on the real thing.** Driven in a browser through the real handler
against the live API: *"Always try to use functional components."* renders the
hedge finding at F1 0.20, and a Spanish rule comes back unscored with the
message in whichever of the six languages the interface is showing. Arabic sets
`dir="rtl"` and the accent border flips to the right, because the stylesheet
uses `border-inline-start`. Also checked at 375 px with no horizontal scroll, a
44 px submit target, headings in order, `aria-live` on the results region, and
both colour schemes. Every render path was exercised against a stub, including
the 502.

Not checked: a screen reader, and the page talking to the Worker in Workers with
a real key — the live calls went through Node.

A whole file still needs splitting into rules before any of this scales past one
paste, and that is a markdown pipeline, not a Jev question — see the ADR.
