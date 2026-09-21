---
type: knowledge
summary: "The first Jev probe: which factors a model can judge, which the code must compute, what the app structurally cannot do, and the measured cost per rule; read before adding a question or promising an output."
related_files:
  - "lib/questions.js"
  - "lib/analyze.js"
  - "docs/knowledge/f3-trigger-distance-criteria.md"
  - "docs/decisions/rule-scoring-product-viability.md"
---

# Feasibility: a public rule-scoring web app powered by Jev

**What was investigated.** Whether the research captured in
[writing-rules-for-ai.md](./writing-rules-for-ai.md) and in the `assay/` plugin
is sufficient to build a simple web app where anyone pastes a rule — e.g.
*"Ejecuta node 22 en vez de node 18"* — and gets back an efficiency verdict plus
tips to improve it, with TypeSafe's Jev supplying the judgment.

**What was concluded.** Yes for a v1, with three caveats that must be designed
around rather than discovered later: the app can only score **wording**, not a
corpus; **Jev cannot write the tips**; and **Jev's F3 scale disagrees with
assay's on the top two levels** and needs recalibration before any number is
shown to the public.

**Date.** 2026-09-19. Probed against `jev-1.13.0`.

---

## 1. What assay already gives us, split by who computes it

assay's seven factors divide cleanly into a deterministic half and a judgment
half. The deterministic half is **already written**, MIT-licensed, and portable
to a server with no model call at all.

| Factor | Who computes it | Portable as-is? | Notes |
| --- | --- | --- | --- |
| **F1** verb force | Code — word-list lookup (`assay/scripts/assay.js:471`) | ✅ | 8 tiers, ~200 verbs, hedge-dominance rule |
| **F2** prohibition framing | Code — regex + content-token overlap (`assay.js:2175`) | ✅ | Includes the `stallRisk` cap at 0.30 |
| **F3** trigger distance | **Jev** — Score, 5 levels (`references/rubrics.md:9`) | ⚠️ needs recalibration | See §3 |
| **F4** scope alignment | Code — but needs the file and its globs (`assay.js:2260`) | ❌ no repo, no F4 | Approximate with a form field |
| **F5** position in file | Code — but needs the file (`assay.js:2286`) | ❌ no repo, no F5 | Approximate with a form field |
| **F7** concreteness | Code — marker regexes vs abstract word list (`assay.js:2316`) | ✅ | The heaviest factor, and free |
| **F8** enforceability | **Jev** — Score, 4 levels (`rubrics.md:53`) | ✅ | Probed as the strongest fit |
| *is it a rule at all* | **Jev** — Noul | ✅ | Replaces assay's subagent call |
| *which primitive* | **Jev** — Choice, 4 options | ✅ | Best result in the probe |
| composition + grade | Code — weighted mean, soft floor (`assay.js:2367`) | ✅ | |
| the tips | **Code** — `PLAIN_FIXES` + `vagueEvidence()` (`assay.js:5449`) | ✅ | **Not Jev.** See §5 |

So a single Jev request carries the whole judgment half. Everything else is a
port of existing JavaScript.

---

## 2. The probe

One request per rule, `state = { rule: "<text>" }`, five questions batched:
`is_rule` (Noul), `trigger_distance` (Score, assay's F3 levels verbatim),
`enforceability` (Score, assay's F8 levels verbatim), `best_primitive` (Choice:
rule / hook / skill / subagent), `injection` (Noul).

Four of the six rules carry a **labelled target value** from
`assay/references/rubrics.md`, which is what makes this a test rather than a demo.

| Rule | assay F3 | Jev F3 | assay F8 | Jev F8 | Jev primitive (conf.) |
| --- | --- | --- | --- | --- | --- |
| ``Use `getProjectCommands(project)` not `.database.commands` `` | 0.95 → **L4** | 3.18 (L3) ⚠️ | — | 0.17 (L0) ⚠️ | rule (0.53) |
| `Run prettier on modified files before committing` | 0.50 → **L2** | 3.00 (L3) ⚠️ | 0.15 → **L0** | 0.01 (L0) ✅ | **hook (1.00)** |
| `Keep CHANGELOG.md updated.` | 0.15 → **L1** | 1.19 (L1) ✅ | 0.30 → **L1** | 1.09 (L1) ✅ | hook (0.56) |
| `The site must feel alive, playful, and aquatic.` | 0.20 → **L1** | 0.97 (L1) ✅ | 0.95 → **L3** | 2.81 (L3) ✅ | rule (0.90) |
| `Ejecuta node 22 en vez de node 18` *(user's example)* | — | 2.21 (L2) | — | 0.35 (L0) | rule (0.61) |
| ``Before committing, run `npx prettier --write .` over every staged file.`` | — | 3.16 (L3) | 0.15 → L0 | 0.06 (L0) ✅ | **hook (1.00)** |

`is_rule` returned 0.88–0.97 on all six — correct, all six are rules.

Reproduce with `probe.js` in the session scratchpad; the key lives in the
**user-scope** `TYPESAFE_API_KEY` (not machine scope — Git Bash does not see it,
PowerShell must hydrate it explicitly).

### What the probe establishes

**F8 is production-ready.** Four of four labelled rules landed on assay's exact
level, including the hard one — `Keep CHANGELOG.md updated.` at Level 1, which
the rubric singles out as a case authors get wrong (*"keep-file-in-sync duties
belong at Level 1 even when no hook exists yet"*).

**Primitive routing is the strongest result.** Both prettier rules routed to
`hook` at confidence **1.00**; the aesthetic rule routed to `rule` at 0.90; the
genuinely ambiguous API-convention rule routed to `rule` at 0.53 — low confidence
on a case that deserves it. This is textbook
[confidence routing](https://docs.typesafe.ai/patterns/confidence-routing.md):
show the recommendation above ~0.8, show it as a question below.

**Spanish works on the judgment half.** `Ejecuta node 22 en vez de node 18`
scored F3 2.21 (distant, no trigger — correct) and F8 0.35 (a `.nvmrc` or an
`engines` field settles it — correct). The *deterministic* half would not work:
F1/F2/F7 are English word lists, and `en vez de` never matches
`ALTERNATIVE_MARKERS` (`instead`, `rather than`).

---

## 3. The one real defect: F3 runs high

assay calls `Run prettier before committing` **Level 2 (distant, 0.50)**. Jev
calls it **Level 3 (soon, 3.00)**. Same disagreement on the `getProjectCommands`
rule, in the same direction.

The cause is documented as a known jagged edge —
[literal reading](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md): *"Jev
answers the question you wrote, not the one you meant."* assay's Level 2 is about
**distance from the moment the rule was read**, not task adjacency: *"read at
session start, needed 40 turns later"* (`rubrics.md:31`). The level text says
"many steps after reading the rule", and Jev reads "steps" as task steps.

**Fix, before anything ships:** rewrite the five F3 level descriptions so each
one names the reading moment concretely and stands on its own — TypeSafe's own
requirement for Score levels. Then re-run against the labelled set. The rubric
carries ~12 worked examples with exact target values, and
`assay/tests/blind-corpus.test.js` adds 15 independently-written descriptions;
that is a seed eval set, not a validated one.

**Secondary defect: the `injection` question is useless as written.** It returned
0.37–0.38 on innocuous rules and **0.74** on the Spanish one — it is reading any
imperative as an attempt to instruct the evaluator. Every rule is an imperative,
so the question cannot separate anything. Replace it with the approach in
[classifying RAG passages](https://docs.typesafe.ai/cookbooks/classifying_rag_passages.md).
This matters: the rule text is public user input, and Jev *"does not treat data
as inherently hostile and can be steered by injected instructions."*

---

## 4. What the app structurally cannot do

assay's own priority order is **findings first, wording grade last** — the
secondary hygiene score is deliberately buried under `--verbose`
(`assay/SCOPE.md:483`). A web app with no repository inverts that order, because
every `mechanical`-evidence check needs files:

| Lost check | Why | Mitigation |
| --- | --- | --- |
| Stale references | No working tree to resolve paths against | Disclose |
| Conflicts / duplicates | No corpus, one rule at a time | Accept a whole file as input later |
| What the host actually loads | No host | Disclose |
| Hook already covers it | No settings files | Disclose |
| F4 scope, F5 position | No file | Two dropdowns: *where will this live* (always-loaded / path-scoped / unsure) and *how long is that file* |

**The UI must say plainly that it scores wording only.** assay's whole ethos is
that a clean rule is not a followed rule: *"No static check can tell you an agent
will comply, and this one does not try"*
(`assay/references/what-assay-measures.md:169`).

---

## 5. The tips cannot come from Jev

`jev-1.13` is **not trained to generate text** — attempts are *"ineffective and
slow"*. So the improvement tips must be assembled in code. Fortunately they
already exist:

1. Compute all seven factors.
2. Pick the **dominant weakness** — `max(weight × (1 − value))`, already
   implemented at `assay/scripts/assay.js:2395`.
3. Emit that factor's canned fix from `PLAIN_FIXES` (`assay.js:5449`), e.g.
   *"Say when it applies: 'When editing X…'"*.
4. For vagueness, quote the offending words back: `vagueEvidence()` returns
   *"'clean' and 'proper' leave the standard to the reader"* (`assay.js:5461`).
5. Add the anatomy template and one worked before/after from the guide.

A **rewritten version of the user's rule** is a separate, optional step and needs
a generative model (Claude), not Jev. Keep it behind its own button so the free
path stays one Jev call.

---

## 6. Cost, limits, and shape

| Fact | Value | Source |
| --- | --- | --- |
| Endpoint | `POST https://api.typesafe.ai/v1/systemone` | quickstart |
| Auth | `Authorization: Bearer $TYPESAFE_API_KEY` | quickstart |
| Model | `jev-1.13.0` (`jev-latest`) | `/models` |
| Price | $42 per billion **input** tokens; output free | `/models` |
| **Measured cost per rule** | ~880 input tokens ≈ **$0.000037** | probe |
| 1,000 evaluations | ≈ **4 cents** | derived from the two rows above |
| Rate limit | 1,200 req/min, 250k tok/s | `/models` |
| Context | 64k per request; 32k for state + longest question | `/models` |
| Batching | Every question over the same state in one call; parallel, barely changes latency | `/primitives` |

Cost is not a constraint. The rate limit is the practical ceiling, and it is
generous for a public demo.

**Stack.** The API key must stay server-side, so this is a static page plus one
serverless function — not a pure static artifact. The function does: port of
F1/F2/F7 → one Jev call → compose → canned tips.

**Free feature worth having.** assay ships four weight columns (Haiku 4.5,
Sonnet 5, Opus 5, Fable 5). Changing weights needs **no new inference** — the
evidence and question meanings are unchanged. So a model selector re-grades the
same rule live, four verdicts from one call. That is exactly the
[composite scoring](https://docs.typesafe.ai/patterns/composite-scoring.md)
pattern, and it is the most interesting thing the app could show: *the same rule
is worth more or less depending on who reads it.*

---

## 7. Before shipping

1. Rewrite the F3 level descriptions; re-run against the labelled set until the
   two top levels separate. **Blocking.**
2. Replace the injection question; treat rule text as hostile input. **Blocking.**
3. Decide the language policy. Jev judges Spanish acceptably; the deterministic
   half does not. Either run English-only and say so, or ship Spanish with F1/F2/F7
   withheld and the verdict marked partial. assay's standing rule is that a
   wording score for a new language needs a **validated** language-specific
   analyzer (`assay/SCOPE.md:1224`).
4. Add the two placement dropdowns so F4 and F5 are approximated rather than
   silently missing.
5. Label every number with what it is not: a wording check, not a compliance
   prediction, on a rubric measured on Haiku 4.5 and partially on Sonnet 5.

---

## Sources

- [writing-rules-for-ai.md](./writing-rules-for-ai.md) — the extracted rubric
- `assay/scripts/assay.js` — deterministic factors, composition, plain-language fixes
- `assay/references/rubrics.md` — the F3 and F8 level bands used verbatim as Score criteria
- `assay/SCOPE.md` — evidence contract, scoring contract, language policy
- [TypeSafe docs index](https://docs.typesafe.ai/llms.txt), `/primitives`, `/api`,
  `/models`, `/model-jaggedness/jev-1.13`, `/patterns/composite-scoring`,
  `/patterns/confidence-routing`
