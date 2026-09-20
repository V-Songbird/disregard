---
type: task_summary
status: active
summary: "State of the Jev rule-scoring app now that it is built and live on Cloudflare: what was researched, the three scorer defects that were found and fixed, what is validated and what is not, and the decisions still open."
related_files:
  - "docs/decisions/rule-scoring-product-viability.md"
  - "docs/knowledge/jev-commercial-licensing.md"
  - "docs/knowledge/f1-f7-deterministic-criteria.md"
  - "docs/knowledge/is-rule-and-primitive-criteria.md"
  - "docs/knowledge/f3-trigger-distance-criteria.md"
  - "docs/knowledge/injection-screen-criteria.md"
  - "docs/knowledge/language-screen-criteria.md"
  - "eval/"
  - "lib/"
  - "api/"
  - "public/"
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

## Nine defects, found by measuring

Each was found against labelled cases, and each is written up with its numbers
and a "rules for changing this" section. Seven are fixed outright; two are
improved, with what is left named and left alone on purpose.

1. **F2 over-flagged bare prohibitions.** 10 of 37 bullets in a real
   `CLAUDE.md`, 9 of them wrong. Cause: the replacement usually sits in a
   neighbouring sentence sharing no words with the ban. Fix: a third state,
   `prohibition_alternative_unproven`, so the grade-capping verdict is kept only
   for a ban standing alone. **12/28 corpus errors → 0/28**, and 10 flags → 1.
   Code and fixtures are here now: `lib/scorer.js`, and the tests beside it.
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
4. **F1 let a hedge govern a sentence it did not lead.** *"Do not try to work
   around the sandbox"* scored 0.20 hedged, because any hedging verb anywhere in
   the text won outright. Fix: a hedge positioned after the first prohibition
   marker no longer governs. Held-out **16/18 → 17/18**, zero misses throughout.
   [f1-f7-deterministic-criteria.md](../knowledge/f1-f7-deterministic-criteria.md)
5. **F7 only knew marketing capitalization.** *"Use npm, not yarn."* scored 0.05
   with no markers at all, because the tool list holds `Prettier` and `Zod` and
   instruction files write `prettier` and `zod`. Fix: a second, case-insensitive
   list of tokens that are never ordinary English. Held-out **16/18 → 18/18**.
   Same document.
6. **F1 read `consider` as a suggestion however it was used.** *"Consider all
   inputs untrusted"* scored 0.30 hedged, when it means *regard* them as
   untrusted. The first measurement found it and could not settle it — the only
   evidence sat in the held-out set. Fix: `consider` is a suggestion only before
   `whether`, `if`, or a gerund whose stem is a verb the file knows. A second
   held-out set of 20 went **16/20 → 20/20**, zero misses. Same document.
7. **`is_rule` scored 15/16 and the count was hiding it.** The margin was
   **−0.23**: a description reading *"…and never returns a grade"* came back
   **0.79**, above a real rule at 0.56, so no threshold separated the classes.
   Repair: the criteria now name who the sentence is about, the reader or the
   system. Margin **−0.23 → +0.06**, same count, and no non-rule outranks a rule
   any more.
   [is-rule-and-primitive-criteria.md](../knowledge/is-rule-and-primitive-criteria.md)
8. **`best_primitive` sent anything with a moment in it to `hook`.** Three of
   four errors opened with a temporal clause, because the hook criterion led
   with *"comes due at a nameable event"* and buried the test that distinguishes
   it. Repair: the check leads and the disqualifier is explicit. **12/16 → 13/16**,
   nothing unstable, and **every pick at confidence 0.80 or better was right, 10
   for 10**. Same document.
9. **The language screen leaked 12 of 20 foreign rules.** The first gate every
   request passes, and the only one that can hand a reader a confident answer
   with no warning. Its thresholds were written for paragraphs — six prose words
   and three closed-class hits — and a rule is one line with five words and two
   hits. *"Nunca subas secretos al repositorio."* came back scored, with
   **2,573 tokens spent** on a rule the design promises never to charge for.
   Fix: the thresholds moved into the gap the corpus showed, the English veto
   became a tie-break, and the closed-class lists got the words the port was
   missing. **Leaks 12/20 → 1/20, refusals 0 throughout.**
   [language-screen-criteria.md](../knowledge/language-screen-criteria.md)

Both repairs are live as of version `7caeec0c` and were checked on the deployed
endpoint: the description that scored 0.79 now comes back **0.37** and raises
`not_a_rule`; the migration procedure comes back **`skill` at 0.92** where it
used to say `hook`; the release review comes back **`subagent` at 0.64**; and
*"Run `prettier` on modified files before committing."* is unchanged at `hook`
0.99.

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

**All three F1 and F7 fixes are live, and were checked there.** Eight rules through
the deployed endpoint on 2026-09-20, live factors identical to local on all
eight. *"Use npm, not yarn."* went F7 **0.05 → 0.85** and stopped raising
*"nothing here is checkable"*; *"Do not try to work around the sandbox"* went F1
**0.20 hedged → 0.95 unhedged**; *"Avoid `any`; prefer `unknown`"* went 0.50
hedged → 0.85. Both controls held: *"Always try to use functional components"*
is still 0.20 hedged, and *"Move it to the next step"* still has no anchor.

**Not validated:**

- **F4 and F5 are not in this app and cannot be.** Both take a whole file —
  `scoreF4(rule, file)` reads the file's globs, `scoreF5(lineStart, file)` reads
  a line offset — and this app scores one pasted rule. The earlier draft of this
  note listed them as unmeasured risks here, which was wrong: they are not risks,
  they are absent. Measuring them means measuring assay against a corpus of whole
  files, which is a different project.
- **The corpus behind F1 and F7 is 56 rules across three sets.** Enough to catch
  a structural defect, nowhere near enough to certify an accuracy. One residual
  is still open and named in the test: *"Consider logging disabled in
  production"*, where a gerund is used as a noun.
- **Both `jev-set.js` held-out halves are spent.** The repair was driven by
  held-out cases. Three things stay open and are deliberately unfixed: a
  fact-shaped directive sits on the fence at 0.43, a one-sentence body of
  reference reads as a rule, and *"Never commit directly to `main`"* was demoted
  from `hook` by the repair itself. All three sit below the confidence cut.
- **`is_rule`'s margin is +0.06.** Positive, so the ordering is right, but thin.
  Fourteen of sixteen cases separate 0.85-to-0.94 against 0.09-to-0.20; the two
  that do not are the two built to be hard.
- **The composition** — weighted mean, soft floor, grade letters — is inherited
  from assay and has no evidence of its own beyond the rule-lab weights.
- **The language screen's held-out half is spent**, and one case still leaks:
  *"No uses `any` en TypeScript."* has three prose words and one of them on any
  list, so there is nothing there to read. Pinned by name in the test.
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

**Live since 2026-09-20** at
[disregard-score.victor-villegas.workers.dev](https://disregard-score.victor-villegas.workers.dev/),
56.03 KiB across five assets, 16.95 KiB gzipped, with the key set as a Worker
secret. It was verified on workerd first, and the deployed Worker answers the
same 405, 400 and 404 paths. Nothing in the handler touches a Node built-in, so
`nodejs_compat` is off.

The rename made a new Worker rather than renaming the old one, so the secret had
to be set again on `disregard-score` and `readback-score` is still up at its own
URL. Version `e4c70725` was checked there: the prettier rule comes back `hook` at
confidence 0.99 with F3 2.00 and F8 0.01, the page serves 200 and `/api/score`
still answers 405 to a GET. Retiring the old Worker is the one step left.

## Open decisions

1. **Publish `rule-lab`?** It is the moat — 2,020 measured cells, $111.61, and a
   harness that lets strangers add model columns for ~$41 each. Its README calls
   itself *"never published"*, so publishing reverses a standing decision. Audit
   `results/` for machine-local transcripts first.
2. **What to measure next.** Everything the app decides now has a labelled set
   behind it. What is left with none is the **six interface translations**, which
   need a native speaker rather than a harness. After that, fresh held-out sets
   for the four that are spent.

## Where things live

This project moved out of `Slag` on 2026-09-20 and is now **Disregard**, at
`D:\Projects\Songbird\Disregard`. Only `docs/` and `eval/` came across;
`Slag/docs/collet-plugin.md` stayed behind because it belongs to that repo.

**Disregard is a git repository as of 2026-09-20**, on `main`, first commit
`db63860`. Identity is set per-repository, not globally.

**The deterministic half is here.** `lib/scorer.js` carries F1, F2 and F7 ported
verbatim out of `assay/scripts/assay.js`, with the F2 fix in place, and
`lib/scorer.f2-prohibition-corpus.test.js` carries the 28-case labelled corpus
that proves it. The port was checked against the original on 43 texts across all three factors with zero mismatches, so the two
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

**Disregard**, renamed from *Readback* on 2026-09-20 for being too generic. In
air traffic control, *disregard* is the call that cancels an instruction: the
receiver drops it rather than acting on it. That is the verdict this tool
returns. You paste a rule, and it tells you which lines an agent has nothing to
do with.

The earlier name carried a boundary this one does not, so the copy has to carry
it instead. *Readback* confirmed that an instruction was *understood*, never
that it would be *obeyed*. *Disregard* names what a weak line deserves, and a
reader could hear that as a prediction of what a model will do. It is not one:
*"No static check can tell you an agent will comply, and this one does not
try."* Every page has to keep saying so in its own words.

Deliberately unrelated to the foundry vocabulary of `Slag` and its plugins
(`assay`, `collet`, `anneal`, `jig`). This is a separate product and reads as
one. An earlier pick, *Touchstone*, was dropped for exactly that reason: it was
chosen for its descent from `assay`, which is a lineage nobody outside the old
repo can see. Runners-up: *Litmus* (instantly legible, but a well-known SaaS
already owns it) and *Ruleproof* (accurate, flat).

## Next step

The function is built and deployed. `api/score.js` takes `{ rule }`, `lib/analyze.js` sends
one Jev request carrying all five questions and composes findings — **no grade**,
by the ADR's honesty argument, so the inherited weighted mean was never wired and
nothing here depends on it. `node --test` covers the bands and the composition
with stubbed answers, 24/24.

**It is live, and it was checked there.** Against the deployed Worker on
2026-09-20: every static path plus `/privacy` and `/terms` returned 200,
`/api/score` answered 405 on GET and 400 on an empty rule, an unknown path 404ed,
a Spanish rule came back `not_english` without spending a request, and *"Run
prettier on modified files before committing."* came back in 0.55 s with F3 2.00,
F8 0.01, `is_rule` 0.98, `hook` at confidence **1.00** and 2,380 tokens — the
numbers this document already recorded from Node, now reproduced in Workers with
the real key. The page was driven in a browser on the live origin and rendered
both findings; the Arabic locale flipped to `dir="rtl"` with the accent border on
the right.

What is left is no longer shipping. It is measuring — see the open decisions.

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

**The page names all four primitives.** `jevFindings` used to emit
`should_be_a_hook` only for a confident `hook` and `could_be_a_hook` for
everything else under the F8 cut, so a confident `skill` at 0.92 rendered as
*"a tool could check this for you"* and the answer was thrown away. Above the
confidence cut the primitive is now named — `should_be_a_hook`,
`belongs_as_a_skill`, `belongs_as_a_subagent` — and below it `could_be_a_hook`
still names none. A confident `rule` emits nothing, because telling a reader to
leave a rule where it already is says nothing.

That branch has **no F8 gate**, because F8 asks a different question — whether a
deterministic tool beats prose — and a review pass fails that while still
belonging in a subagent. Checked on the live endpoint, though, the gate is not
what had been hiding those cases: *"Before each release, review every public API
change"* routes at **0.70**, under the confidence cut, so it stays silent either
way. The naming is what did the work. Removing the gate is right in principle
and, on the five rules probed, **unexercised** — no case had a confident
non-`rule` route and an F8 above the cut at the same time.

**Checked live at version `a1fcd3d7`:**

| Rule | Route | Finding |
| --- | --- | --- |
| *"When adding a database migration: …"* | `skill` 0.90 | `belongs_as_a_skill` |
| *"Once a quarter, sweep the codebase for TODO comments…"* | `subagent` 0.89 | `belongs_as_a_subagent` |
| *"Run `prettier` on modified files before committing."* | `hook` 0.99 | `should_be_a_hook` |
| *"Prefer the smallest coherent solution."* | `rule` 0.98 | silent, as intended |
| *"Before each release, review every public API change…"* | `subagent` 0.70 | silent, under the cut |

**A finding has three parts: what is wrong, why it matters, and what to do.**
The third one was added on 2026-09-20 after a reader asked what he was supposed
to do with *"F8 0.8"*. It is the part anyone is actually there for, and it is
written per finding in all six languages — the hedge fix names the hedging word
out of the reader's own rule.

**No finding shows a factor name or a confidence.** Both were leaking into the
main flow: every card carried a bare `F8 0.8` tag, and the low-confidence hook
finding read *"the routing is not confident enough to call it: a hook at 0.61"*
— the model's own uncertainty, as a decimal, as the headline. A number in the
body of a finding is a number the reader has to interpret, and that is the
tool's job. They are all still there, one disclosure away.

That finding was also rewritten around the signal that *is* confident. F8 says a
command could settle the rule; the primitive choice is the uncertain part. So it
now says **"A tool could check this for you"** and leaves the form — hook, lint
rule, CI step — to the reader. `should_be_a_hook`, which only fires at
confidence 0.8 or better, still names the hook outright.

`i18n.js` holds all six translations, about 60 strings each. Switching language
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

Rechecked on the deployed origin after the findings were rewritten. *"All async
functions MUST have timeout"* — the rule that prompted the change — renders as
*"A tool could check this for you"* with the fix line under it and **no digit
anywhere in the card**, in English and in Arabic. The numbers stay one
disclosure away, and on that run the routing confidence came back **0.56** where
the reader's screenshot had shown 0.61. It moves between runs, which is its own
argument against printing it. Checked at 375 px in all six languages, numbers
open and closed, no horizontal overflow.

Not checked: a screen reader.

A whole file still needs splitting into rules before any of this scales past one
paste, and that is a markdown pipeline, not a Jev question — see the ADR.
