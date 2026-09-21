---
type: knowledge
summary: "Field guide to writing agent rules, extracted from the retired assay plugin: rule anatomy, assay's seven checks of which Disregard ships F1, F2, F3, F7 and F8, per-model weights and the evidence tag on each claim; read for the reasoning behind a factor, and read the criteria documents for what lib/ does today."
related_files:
  - "lib/scorer.js"
  - "lib/questions.js"
  - "research/rule-lab/"
  - "research/rubrics.md"
---

# Writing rules for AI agents — a field guide distilled from assay

**What was investigated.** The `assay` plugin
(`assay/`, version 2.1.0) is an instruction-systems analyzer: it reads the
instruction files a coding agent loads, grades every rule in them, and offers
reversible rewrites. Its scoring engine, its two authoring recipes, its judgment
rubrics and its four model profiles together encode a complete, evidence-tagged
theory of how an instruction for an AI should be written.

**What was concluded.** That theory can be extracted as a portable authoring
guide. This file is that extraction: every rule below is traced to the file and
line in `assay/` that encodes or measures it. Nothing here is invented, and
where assay marks a lever unmeasured, this guide marks it unmeasured too.

**Where Disregard differs.** This guide describes assay as it was when the text
was extracted, on 2026-09-20. Every `assay/…` citation points into the `slag`
repository, which is not part of Disregard, so the line numbers cannot be
resolved from here. Disregard took five of the seven checks and changed four
things since:

- **No grade.** The score formula, the A to F grades, the category floors and
  `STALL_RISK_CAP` are assay's. Disregard composes nothing: a bare ban raises the
  `stall_risk` finding.
- **F2.** An unrelated directive beside a ban is no longer scored as bare. It
  lands at 0.60, `prohibition_alternative_unproven`, with no stall flag. A ban
  that carries its own exception, such as *"without explicit authorization"*,
  counts as having an alternative.
- **F1.** A hedge after the first prohibition marker no longer governs the
  sentence, and `consider` reads as a suggestion only before `whether`, `if` or
  a known gerund. See
  [f1-f7-deterministic-criteria.md](./f1-f7-deterministic-criteria.md).
- **Language.** The screen fires at 3 prose tokens and 2 hits, with English as a
  tie-break, and a rule in another language is not scored at all. See
  [language-screen-criteria.md](./language-screen-criteria.md).

F4 and F5, sections 6, 7, 9 and 10, and the weight table describe assay only.
Nothing in this repository measures or ships them.

**Who this is for.** Anyone writing `CLAUDE.md`, `AGENTS.md`, `.claude/rules/`,
skill descriptions, subagent prompts, or system prompts — i.e. durable
instructions an agent reads mid-task, long after the file loaded.

---

## 0. Evidence status — read this before you trust a number

assay separates six evidence levels and refuses to blur them
(`assay/SCOPE.md:454`):

| Level | Meaning |
| --- | --- |
| `mechanical` | Computed from files, config, paths, hashes, parsers, command results |
| `documented` | Supported by current official host documentation |
| `experiment-supported` | A named controlled experiment, with tested scope and limits |
| `heuristic` | A deterministic approximation with no validated behavioral effect |
| `model-inferred` | Produced by a named semantic pass, potentially nondeterministic |
| `behavior-observed` | **Reserved and empty.** Nothing emits it. |

What that means for you:

- The wording levers below were measured on **Claude Haiku 4.5** (rule-lab
  2026-07, n=20 per arm) and partially on **Claude Sonnet 5** (exp-010-claude5,
  2026-08-25, 440 cells, n=20 per arm). Every other tier is extrapolation
  (`assay/scripts/models/haiku45.js:1`, `assay/scripts/models/sonnet5.js:19`).
- No part of this predicts compliance. assay states it as a product boundary:
  *"It measures how the rule is written, where it sits, and what it names — the
  parts you control"* (`assay/references/what-assay-measures.md:15`).
- **Meta-rule for anyone writing a guide like this:** never present an
  unmeasured lever as a measured one. assay ships two levers it believes in and
  refuses to score, and says so explicitly
  (`assay/skills/craft-rules/references/recipe.md:62`).

---

## 1. First principle

> *"Write clean, maintainable code" is not a rule — it's a wish.*
> — `assay/README.md:21`

A rule is one bullet the agent reads mid-task, long after the file loaded
(`assay/skills/craft-rules/references/recipe.md:3`). It must therefore survive
three hazards at once: being **loaded**, being **recognized as firing now**, and
being **actionable without judgment calls the author never made**.

Three kinds of truth stay separate (`assay/SCOPE.md:54`):

1. **Static truth** — what loads, what is active, what is structurally sound.
   This is what good authoring buys you.
2. **Platform truth** — how the host discovers, merges, truncates and trusts files.
3. **Behavioral truth** — whether the agent actually obeyed. *Owned by nothing.*
   A perfect rule can still lose.

---

## 2. Before you write: is this a rule at all?

This is the highest-value decision, and most bad rules are bad because they were
never rules. The redirect table (`assay/skills/craft-rules/references/recipe.md:115`):

| The ask | The right primitive | Why |
| --- | --- | --- |
| A command could verify it with an exit code | **Hook** | Prose asks the agent to remember; a hook does not ask |
| A file matcher could block it | **Hook** | Same |
| A multi-step procedure, or "follow the conventions in `<doc>`" | **Skill** | Case logic and step chains do not fit one bullet |
| An audit or review duty needing fresh context | **Subagent** | It gets its own context window instead of competing with the session's |
| "The agent must NEVER, not even once" | **Hook** | Only a hook guarantees; a rule is probabilistic on every model size |
| Genuine judgment, aesthetics, trade-offs | **Rule (prose)** | This is what prose is *for* |

### The enforcement ladder

Five levels, each stronger than the last (`assay/SCOPE.md:649`):

| Level | Mechanism | What it buys |
| --- | --- | --- |
| 1 | The rule itself | The agent may receive and interpret it; compliance is probabilistic |
| 2 | Skill or subagent | Structured and reusable; invocation still probabilistic |
| 3 | Lifecycle hook | Can observe or block covered events — when configured, enabled, trusted, applicable and reached |
| 4 | Repository enforcement (linter, formatter, test, pre-commit, build gate) | Acts independently of agent interpretation on covered paths |
| 5 | Remote enforcement (CI, branch policy, server-side validation) | Acts across every client |

**Rule:** if violating the policy must be impossible to merge or deploy, it
belongs at level 4 or 5. Never let a hook read as the same guarantee as a CI gate
(`assay/skills/_shared/fixes.md:119`).

**Rule:** configuration presence is not enforcement. assay reports every
mechanism along `configured → enabled → trusted → applicable → verified` and sets
`verified: false` on every entry, because reading a file is not watching it run
(`assay/SCOPE.md:664`, `assay/SCOPE.md:683`).

---

## 3. The anatomy — mandatory

```
When <firing moment>, <directive verb> <action> — <concrete specific>.
```

For prohibitions:

```
Never <X> — <do Y> instead.
```

Four load-bearing parts (`assay/skills/craft-rules/references/recipe.md:37`):

1. **Trigger** — name the firing moment. *"When editing X…", "Before
   committing…", "After adding a migration…"*. Duties on distant files
   (changelog entries, doc sync) get **ignored outright** by small-tier models
   without one — not merely done late.
2. **Directive verb** — open with it. `Use`, `Never`, `Always`, `Run`. *"Try
   to"*, *"consider"*, *"where possible"* read as optional; write them only when
   the rule truly is optional.
3. **Named alternative** — every prohibition pairs with its replacement. If
   nothing replaces the banned action, name the escape hatch (*"stop and ask"*).
4. **Concrete specifics** — a path, an identifier in backticks, a numeric
   threshold, or a one-line example.

### Hard ceilings

| Constraint | Value | Source |
| --- | --- | --- |
| One bullet | — | `recipe.md:60` |
| Word count | under ~30 words | `recipe.md:60` |
| Duties per rule | **one** — two duties are two rules | `recipe.md:60` |
| Concreteness | **checkable, not conditional** — one anchor, no if-this-then-that branches | `recipe.md:56` |

> Case logic is not a rule. A rule that sprouts branches belongs in a hook or a
> skill.

---

## 4. The seven checks

assay grades five factors mechanically plus two by model judgment. Their plain
names are the ones the report prints (`assay/scripts/assay.js:5437`):

| Factor | Plain problem | Plain fix |
| --- | --- | --- |
| F1 | no clear action | Rewrite it as an instruction — name the action to take |
| F2 | says what not to do, never what to do | Add what to do instead |
| F3 | no clear moment it applies | Say when it applies: *"When editing X…"* |
| F4 | applies too broadly | Move it to a rules file that lists the paths |
| F5 | buried near the bottom | Move it nearer the top, or split the file |
| F7 | too vague to act on | Name a file, a command, or show an example |
| F8 | could be automatic instead | Promote it to a hook (or confirm prose is right) |

### F1 — directive force

The script reads a verb and scores its force (`assay/scripts/assay.js:471`):

| Score | Tier | Verbs |
| --- | --- | --- |
| 1.00 | unconditional mandate | `must`, `required` |
| 0.95 | strong prohibition | `never`, `do not`, `don't`, `forbidden`, `cannot`, `must not` |
| 0.85 | bare imperative | `use`, `run`, `ensure`, `add`, `keep`, `write`, `check`, `apply`, … (~200 verbs) |
| 0.70 | advisory | `should`, **`always`** |
| 0.50 | preference | `prefer`, `default to`, `favor` |
| 0.30 | suggestion | `consider`, `aim to`, `where practical` |
| 0.20 | hedged | `try to`, `where possible`, `when you can` |
| 0.10 | weak suggestion | `you might want to`, `it's worth`, `keep in mind` |

Three behaviours worth internalizing:

- **A single hedge governs the whole sentence, downward.** *"Always try to use
  functional components"* scores **0.20**, not 1.00 — the weakest hedge wins
  outright and no upgrade climbs back over it (`assay/scripts/assay.js:2091`).
  **Never mix a mandate verb with a hedge.**
- **`always` alone is only advisory (0.70).** It reaches 1.00 only paired with a
  bare imperative — *"Always run `npm test`"* (`assay/scripts/assay.js:2102`).
- **A description reads as a description even if a verb appears later.**
  Openers like *"All files are…"*, *"Every module…"*, *"Tests are…"* are
  classified as statements and capped at the implicit default of 0.70
  (`assay/scripts/assay.js:2065`).

> ✗ `CHANGELOG entries are short and user-facing.`
> ✓ `Keep each CHANGELOG.md entry under 3 lines, written for the user.`
> — `assay/references/what-assay-measures.md:31`

### F2 — framing, and the stall risk

| Shape | Score | Flag |
| --- | --- | --- |
| Prohibition **with** a named alternative | 0.95 | — |
| Positive imperative with an alternative | 0.95 | — |
| Positive imperative | 0.85 | — |
| Hedged preference | 0.35 | — |
| **Bare prohibition** | **0.20** | `stallRisk` |

`assay/scripts/assay.js:2175`.

A bare prohibition **caps the whole rule's grade at 0.30 regardless of every
other factor** (`STALL_RISK_CAP`, `assay/scripts/assay.js:736`). The reasoning is
operational, not stylistic: *"a ban with
nowhere to go turns a blocked task into a stopped one. The agent needed the thing
you banned, has no alternative, and stalls"*
(`assay/references/what-assay-measures.md:52`).

An alternative counts when it (`assay/scripts/assay.js:2163`):

- points back at the ban — `instead`, `rather than`; **or**
- names something the ban named; **or**
- performs the banned verb on a different object — *"Never use `var`." / "Use
  `const` for locals."*; **or**
- uses contrast form — `` `const`, not `var` ``.

An unrelated directive standing next to a prohibition leaves it **exactly as bare
as no directive at all**.

> ✗ `Never edit the generated files.`
> ✓ `Never edit the generated files — change the template in templates/ and re-run `npm run gen` instead.`

### F3 — trigger-action distance (model-judged)

Will the agent recognize the firing moment? Levels and bands
(`assay/references/rubrics.md:9`):

| Level | Band | Meaning | Example |
| --- | --- | --- | --- |
| 4 Immediate | 0.90–1.00 | Action is the same operation as the trigger | *"Use `getProjectCommands(project)` not `.database.commands`"* — 0.95 |
| 3 Soon | 0.65–0.85 | Same task, a step later | *"When adding grammar rules, add PSI visitor methods and tests"* — 0.75 |
| 2 Distant | 0.40–0.60 | A future moment the agent must independently remember | *"Run prettier on modified files before committing"* — 0.50 |
| 1 Abstract | 0.15–0.35 | A disposition, not a trigger-action pair | *"The site must feel alive, playful, aquatic"* — 0.20 |
| 0 No trigger | 0.00–0.10 | A statement, not an instruction | *"All files are optimized for agent consumption"* — 0.00 |

Two calibration notes that matter when you write:

- **Level 2 requires a named firing moment.** A duty whose action lands in a
  different file than the one being edited only reaches Level 2 *through* a
  when-clause. Without one — *"Keep CHANGELOG.md updated"* — it scores 0.15 and
  *"such rules get ignored outright, not merely late"* (`rubrics.md:44`).
- **Score higher for concrete programming events** (*"when creating .tsx
  files"*), lower for subjective ones (*"when something is expensive"*).

### F4 — scope alignment

| Situation | Score |
| --- | --- |
| Always-loaded file, genuinely universal rule | 0.95 |
| Scoped file, rule's trigger overlaps the glob | 0.95 |
| Scoped file, no explicit trigger (frontmatter does the work) | 0.85 |
| No scope signal either way | 0.65 |
| **Always-loaded file, rule names a file-type trigger** | **0.40** |
| **Scoped file, trigger contradicts the glob** | **0.25** |
| Glob matches no real file, or the rule's target is gone | **0.05** |

`assay/scripts/assay.js:2260`.

> ✗ in the always-loaded file: `When editing TypeScript files, prefer named exports.`
> ✓ in a file bound to `**/*.ts`: `Use named exports.`
> — `assay/references/what-assay-measures.md:84`

*"An always-loaded rule is paid for by every session, whether or not it
applies."*

### F5 — position in the file

| Position | Score |
| --- | --- |
| File ≤ 50 lines | 0.95 (position unscored) |
| Top quarter | 0.95 |
| Upper middle (25–50%) | 0.80 |
| Lower middle (50–75%) | 0.60 |
| Bottom quarter | 0.40 |

`assay/scripts/assay.js:2286`. Position only bites in files over 50 lines
(`assay.js:738`).

**Measured null on Sonnet 5.** A rule at the bottom of an ~80-line `CLAUDE.md`
was followed exactly as often as the same rule at the top — 1.00 against 1.00, in
both intents. On Haiku 4.5 the same contrast fell to 0.65 and 0.15
(`assay/scripts/models/sonnet5.js:23`). Write to the top anyway: it is free, it
is what the smallest tier needs, and it is what a human reader needs.

### F7 — concreteness (the heaviest factor)

The script counts **concrete markers** against **abstract markers**.

Concrete markers (`assay/scripts/assay.js:533`):

- backtick spans — but **a lone generic word in backticks does not count**.
  `` `code` ``, `` `file` ``, `` `data` ``, `` `value` `` are rejected; anything with a
  non-letter (path, command, flag, extension, digit) or an uppercase letter
  (camelCase, PascalCase) counts (`assay.js:2301`);
- class-suffixed identifiers — `…Manager`, `…Service`, `…Controller`, `…Schema`, …;
- file names with a known extension, and `src/…`-style paths;
- named technologies — React, Prettier, Docker, PostgreSQL, …;
- **numeric thresholds with units** — *"under 40 lines"*, *"at most 3 items"*,
  *"no more than 500 ms"* (`assay.js:543`);
- fixed technical terms — *"named exports"*, *"pre-commit hook"*, *"integration
  tests"*, *"input validation"*, … (`assay.js:684`).

Abstract markers — **these are the ones that sink a rule**
(`assay/scripts/assay.js:677`):

> `good` · `appropriate` · `reasonable` · `clean` · `thoughtful` · `proper` ·
> `correct` · `careful` · `best practice(s)` · `when possible` · `where
> practical` · `as needed` · `properly` · `correctly` · `carefully` · `error
> handling` · `naming` · `code quality` · `maintainable` · `readable` ·
> `scalable` · `efficient` · `expensive` · `simple` · `clear` · `obvious` ·
> `intuitive`

Scoring (`assay/scripts/assay.js:2344`), with `c` = concrete count, `a` = abstract count:

| Condition | F7 |
| --- | --- |
| c = 0, a = 0 | 0.05 |
| c = 0, a ≥ 1 | 0.10 |
| a = 0, c = 1 | 0.80 |
| a = 0, c = 2–3 | 0.85 |
| a = 0, c ≥ 4 | 0.95 |
| mixed, ratio ≥ 0.80 | 0.75 + 0.1·min(c/4, 1) |
| mixed, ratio ≥ 0.50 | 0.45 + 0.2·ratio |
| mixed, ratio ≥ 0.25 | 0.25 + 0.15·ratio |
| mixed, ratio < 0.25 | 0.10 + 0.1·ratio |

> ✗ `Write clean, maintainable code.` → F7 = 0.10
> ✓ `Keep functions under 40 lines; extract a helper rather than nesting a third `if`.`

### F8 — enforceability ceiling (model-judged)

*Could a deterministic tool do this rule's job better than prose? Low F8 means
yes — the rule is a hook wearing a costume* (`assay/references/rubrics.md:53`):

| Level | Band | Meaning | Example |
| --- | --- | --- | --- |
| 3 Not enforceable | 0.85–1.00 | Needs judgment no tool has | *"Use CachedValuesManager for expensive computations"* — 0.90 |
| 2 Partially | 0.55–0.80 | A tool catches some violations | *"Use functional components for all new React files"* — 0.70 |
| 1 Mostly | 0.30–0.50 | A hook or linter could enforce the core | *"NEVER edit files in `src/main/gen/`"* — 0.35 |
| 0 Fully | 0.10–0.25 | A command verifies compliance with an exit code | *"Run prettier before committing"* — 0.15 |

**Keep-file-X-in-sync duties belong at Level 1 even when no hook exists yet**
(`rubrics.md:81`). This is the single most common category of rule that should
never have been prose.

### How the factors combine

```
score = ( Σ wᵢ·vᵢ over present factors ) / ( Σ wᵢ )  ×  floor
floor = min( F7/0.2 , F4/0.2 , 1 )   [ × 0.05 if a referenced file is gone ]
```

`assay/scripts/assay.js:2367`.

**Consequence you must internalize: vagueness and dead scope are
*multiplicative*, not additive.** F7 = 0.05 multiplies the entire score by 0.25.
F7 = 0.10 halves it. A rule pointing at a file that no longer exists is
multiplied by 0.05 — every other virtue is erased.

Grades: ≥0.80 A · ≥0.65 B · ≥0.50 C · ≥0.35 D · else F (`assay.js:753`).
A rule is "weak" below its category floor — `mandate` 0.50, `override` 0.25,
`preference` 0.25 (`assay.js:752`).

---

## 5. Two more levers — believed, deliberately unscored

These come from a mechanism account of why instructions are followed. assay
grades neither, and its own caveat travels with them: *"a plausible model of the
machinery, not testimony about it"* (`assay/skills/craft-rules/references/recipe.md:62`).

**5a. Show one example of correct output.**

```
- Before committing, run `npx prettier --write .` over every staged file —
  e.g. `npx prettier --write src/app.ts`.
```

An example is claimed to work on the same machinery that produces the answer,
where a description of the answer does not. It is also the cheapest way to
satisfy F7: **an example IS a concrete specific**.

**One example, not three.** A list of examples reads as a list of cases, and case
logic belongs in a skill.

**5b. Restate what matters most at the end of a long instruction.**

This is about the whole instruction — a long rule *file*, a skill body, a task
prompt. Close it by restating the **two or three** constraints that would hurt
most to lose. Never a summary of everything: *"restating all of it restates
nothing, and a closing block that repeats the file is a second copy to keep in
sync."*

⚠ **Watch the cost.** A restated rule is a real rule to an analyzer: it is
graded, counted, and can come back as a **duplicate** of the one it restates.
Write the closing block as prose that *names* the constraints rather than as
fresh mandate bullets — or fence it.

---

## 6. Placement and loading

A rule in the wrong file never loads for the work it is about. That failure is
invisible: nothing in the session says so.

| The rule is | It goes |
| --- | --- |
| Bound to a file type or path | The scoped target (`.claude/rules/<topic>.md`), with `paths:` frontmatter — **only after verifying the glob matches at least one real file** |
| Bound to where the session started | That directory's own chain file — and say plainly that a session started elsewhere never reads it |
| Universal | The always-loaded target (`CLAUDE.md`), **near the top** |

`assay/skills/craft-rules/references/recipe.md:97`, `assay/scripts/adapters/claude.js:858`.

**Never:**

- Never write into a source marked `selected: false` — it is shadowed and never read.
- Never write past a documented read cap (`truncatedAtLine`) — the host stops reading there.
- Never assume a filename from the host's name. Read the placement menu off the host profile.
- Never add a rule below the halfway line of a long file where position is graded.

### Fencing narrative out

Some prose in a rule file commands nothing on purpose — a motivating story, a
pasted requirement, a glossary. It reads like rules and will be graded as weak
mandates. Fence it (`assay/README.md:115`):

```markdown
<!-- assay-ignore -->
- This single line is skipped.

<!-- assay-ignore-start -->
Whole block of narrative, examples, pasted specs…
<!-- assay-ignore-end -->
```

Fenced lines also leave the position denominator, so a real rule below the block
is not counted as buried under prose that was never graded. Block quotes are
already read as quoted content — **state a rule in your own voice, outside a
quote, if you want it to count.**

---

## 7. Corpus hygiene — the checks that need no wording at all

These run in every language and none of them is a judgment about how the rule
reads (`assay/references/what-assay-measures.md:149`):

| Check | What it means for you |
| --- | --- |
| **It points at a file that is not there** | Every path you cite is a maintenance liability. Cite only files you verified exist. |
| **Two rules disagree** | One bans exactly what another commands, on the same subject. An analyzer names both and **picks no winner** — resolving policy intent is the author's job, never the tool's. |
| **The same duty is stated twice** | A second copy of a rule is corpus noise, not enforcement. |
| **The host never loads it** | A glob matching nothing, a file another shadows, a rule past a read limit. |
| **A hook already covers it** | Redundant prose burns context for a duty already mechanically enforced. |

Extra corpus limits:

- **Context pressure:** always-loaded corpus over ~40,000 bytes is flagged
  (`assay/scripts/assay.js:3920`).
- **File shape:** a file is a restructure candidate — beyond per-rule rewriting —
  when ≥60% of its graded content is narrative, when ≥50% of its rules sit past
  the midpoint, or when it exceeds 200 lines (`assay/scripts/assay.js:743`).
  200 lines also matches the host's own per-file size guidance.
- **A conditional rule and its stated exception are not a conflict.** Two rules
  gated on the *same* condition with opposite polarity are
  (`assay/SCOPE.md:543`).

---

## 8. Language — write rules in English

assay scores English only, and says so rule by rule
(`assay/README.md:114`, `assay/scripts/assay.js:558`).

A rule is set aside from **every wording check and every grade** when it reads as
non-Latin script, or as Spanish, Portuguese, French, Italian or German. The
screen fires at: ≥6 prose tokens, ≥3 distinct closed-class words of one language,
and **zero** English closed-class words (`assay/scripts/assay.js:625`).

Two practical consequences:

1. **Write your rules in English** if you want them graded — mixed or short lines
   stay English-scored by design, because a false "unsupported" silently ungrades
   a real rule.
2. **A wording score for another language requires a separate validated
   analyzer**, not a translated word list (`assay/SCOPE.md:1224`). Do not assume
   an English-derived lever transfers.

Language-independent checks — stale references, duplicates, conflicts, what the
host loads, byte budgets — still apply in full.

---

## 9. Rules that route: skill and subagent descriptions

A skill's `description` is **a router, not documentation**
(`assay/skills/craft-skill/references/recipe.md:9`). The same discipline applies
to subagent descriptions, which are graded on the identical recipe
(`assay/SCOPE.md:844`).

### The shape

```
<Concrete base sentence>. Use when the user asks to <verb list> [— e.g.
"<phrase>", "<phrase>"]. Do NOT use when <adjacent ask> — only for <core use>.
```

| Part | Status | Rule |
| --- | --- | --- |
| Concrete base sentence | **Mandatory** | Name real artifacts: extensions, paths, tool names, output files. *"Generates a Markdown summary report from a `.csv` file"* — never *"processes tabular data"*. |
| Trigger clause `Use when…` | **Mandatory** | Explicit, in the user's verbs. |
| Quoted example phrasings | **Optional** | Adding more never improved firing. There is no minimum. |
| Exclusion clause `Do NOT use when…` | **Mandatory in practice** | It costs nothing on recall and is the only thing that stops the skill firing on close-but-wrong requests. |

### The largest measured effect: do not enumerate

*"An 'authoritative reference for X — the full command set, the constant
registry, scoping rules, event labels, sidecar formats, and budget arithmetic'
opener measurably **lowers** firing against a terse '`<domain>` — `<key
commands/nouns>`' one. The enumeration reads as breadth and routes worse than a
narrow, concrete claim. This is the largest single effect measured on description
wording, and it bites hardest on niche domains, where routing is least certain."*
— `assay/skills/craft-skill/references/recipe.md:41`

The mechanical proxy: **five or more commas before the `Use when` clause** is
reported as `enumerated` (`recipe.md:50`). A blind corpus of fifteen
independently-written skills reproduced this — the four "architecture" skills
that opened by listing their own contents each missed all four checks, while the
twelve operational skills that opened on one sentence did not
(`assay/tests/blind-corpus.test.js:82`).

### Hard limits and prohibitions

- **Cap: 1,536 characters** for the whole description
  (`assay/scripts/assay.js:1182`). Past the cap the tail truncates — and the
  exclusion clause sits last, so it is the first thing lost.
- **Never add a separate `when_to_use` field.** Dropping it cost no firing and
  lifted recall; the field just dilutes routing (`recipe.md:14`).
- **Quotes that miss the real ask are worse than no quotes** — they narrow the
  router's sense of scope and can collapse firing outright. Write them as
  paraphrases in the *user's* words (casual, imperative and goal forms), never as
  echoes of the base sentence.
- **Measured not to help:** imperative framing (*"Use this skill to…"* vs
  *"Generates…"*) and politeness padding. Spend the words on triggers.
- **When refitting, come out no longer than you started.** Fold each fix into the
  existing text; never append a trailing clause (`recipe.md:122`).
- A user-only (non-model-invocable) skill inverts every rule above: it routes on
  nothing, so give it one short plain sentence and delete the trigger machinery.
- **Body:** keep `SKILL.md` under 500 lines; move reference material to separate
  files that load only when reached.

### The reliability ladder for routing

When the user says a skill must **always** run (`recipe.md:90`):

1. **Recipe description** — always. Never promise "always" from a description
   alone; larger models skip description-routed skills *more* often, not less.
2. **Companion rule** in the always-loaded file, near the top, shaped exactly
   like this — *the trigger clause, the hard verb, the concretely named skill and
   the paired never-clause are each load-bearing:*

   ```
   When the user asks <trigger in plain words>, ALWAYS use the <name> skill —
   never <do the core thing> without running it.
   ```

3. **Scoped companion rule** — same rule in a path-scoped file when the skill is
   bound to a file type. Identical performance where the globs match, and it
   keeps the always-loaded file short.
4. **Hook** — the only true guarantee.

---

## 10. Calibration by model tier

Weights, read straight from the four shipped profiles
(`assay/scripts/models/*.js`):

| Factor | Haiku 4.5 | Sonnet 5 | Opus 5 | Fable 5 |
| --- | --- | --- | --- | --- |
| F1 verb force | **1.5** | 0.3 | 0.3 | 0.3 |
| F2 bare prohibition | 1.0 | 1.0 | 1.0 | **1.2** |
| F3 trigger distance | 1.3 | 1.3 | 1.0 | 1.0 |
| F4 scope | 1.0 | 1.0 | 1.0 | 1.0 |
| F5 position | **1.5** | 0.5 | 1.5 | 1.5 |
| F7 concreteness | 2.0 | 2.0 | **2.2** | **2.4** |

Evidence: only the Haiku 4.5 column was tuned against measured runs. Sonnet 5's
F1, F2 and F5 are measured; everything else in every other column is
`profile-inferred` — *"a weighting of which structural findings lead the report,
never a claim about what this model will obey"* (`assay/scripts/models/opus5.js:62`).

### What actually changed between tiers

Measured on Sonnet 5, 2026-08-25 (`assay/scripts/models/sonnet5.js:19`):

- **Position is null here.** Bottom of an ~80-line file = top. (Haiku: 0.65 vs 0.15.)
- **Verb force is null here.** *"Prefer to X"* scored 1.00, identical to
  *"Always X"*. (Haiku: "prefer" halved compliance.)
- **The bare prohibition still costs something.** 0.60 against 1.00 — but in one
  intent of two.

All three are **ceiling results**: once a rule was present at all, this tier
followed it. *"They say the wording lever stops separating outcomes here, not
that a badly placed rule became good."*

### The direction-of-effect argument

From the mechanics account the higher profiles are extrapolated from
(`assay/scripts/models/opus5.js:12`):

- Prohibitions are structurally weaker than prescriptions.
- Salience decays across a conversation.
- Unverifiable constraints have nothing to converge on.
- **Raising capability *lowers* format-constraint adherence, because a more
  capable model elaborates more.**

That last one is why F7 (concreteness) is the *leading* factor on the strongest
tiers: an elaborating model needs a verifiable constraint most.

**Practical reading:** write to the anatomy for the smallest model that will read
the rule. On a big model it costs nothing; on a small one it is the difference
between a rule and a decoration.

---

## 11. MUST / SHOULD / MAY / NEVER

### Mandatory

- **One duty per rule.** Two duties are two rules.
- **Name the firing moment** — or accept that a distant duty gets ignored outright.
- **Open with a directive verb.**
- **Pair every prohibition with its replacement**, or with an explicit escape
  hatch (*"stop and ask"*).
- **Name at least one concrete anchor** — path, identifier in backticks, command,
  or number with a unit.
- **Verify every path you cite exists.** A dead reference multiplies the rule's
  value by 0.05.
- **Verify every glob matches at least one real file** before scoping a rule to it.
- **Put universal rules in the always-loaded file; scoped rules in a scoped file.**
- **Write it in English** if it is to be graded by an English-trained analyzer.
- **State evidence honestly.** Never upgrade `profile-inferred` to "measured".

### Strongly recommended

- Keep it under ~30 words, one bullet.
- Put it in the top quarter of its file.
- Show one worked example — the cheapest way to be concrete.
- Close a long instruction by restating two or three constraints, as prose.
- Split a rules file before it reaches 200 lines.
- Prefer a scoped file over the always-loaded one whenever the rule is not truly
  universal — it moves the context cost to the sessions the rule is about.

### Optional

- Quoted example phrasings in a skill description (**but if you write them, they
  must cover the real ask**).
- A `<!-- category: preference -->` annotation to lower a rule's pass mark
  honestly instead of inflating its wording.

### Never

- **Never mix a hedge with a mandate.** *"Always try to…"* scores as the hedge.
- **Never write a bare prohibition.**
- **Never use `clean`, `proper`, `appropriate`, `reasonable`, `careful`,
  `maintainable`, `readable`, `efficient`, `simple`** — or the rest of the
  abstract list — as the standard. They grade near zero because nothing can check
  them.
- **Never strengthen a preference into a mandate on the author's behalf.** If
  they said *"prefer"*, the rule says prefer (`assay/skills/craft-rules/SKILL.md:121`).
- **Never write case logic into a rule.** Branches belong in a hook or a skill.
- **Never resolve a conflict between two rules silently.** Name both, with file
  and line, and ask. *"assay identifies incompatibility and the developer resolves
  intent"* (`assay/SCOPE.md:525`).
- **Never state one duty twice** expecting reinforcement. It reads as a duplicate.
- **Never promise a description guarantees invocation**, or that a hook equals a
  CI gate.
- **Never let a wish reach the file.** A wish with no actionable trigger and no
  actionable action is not written at all.

---

## 12. Pre-flight checklist

Before a rule lands:

1. Could a command settle this with an exit code? → Hook, not prose.
2. Is it a procedure or a "follow the doc" duty? → Skill.
3. Does it need fresh context to audit something? → Subagent.
4. Does it name a firing moment a reader would recognize?
5. Does it open with a directive verb, unhedged?
6. If it bans something, does it name what to do instead?
7. Does it name at least one path, identifier, command, or number with a unit?
8. Is it one duty, under ~30 words, one bullet?
9. Does every path and glob in it resolve to something real *today*?
10. Is it in a file the host actually loads for the work it is about, above that
    file's halfway line?
11. Does an existing rule already say this, or say the opposite?
12. Could a reader tell, from the rule alone, what passes and what does not?

Any "no" on 4–12 is a rewrite, not a nuance.

---

## 13. Anti-pattern catalogue

| Anti-pattern | Example | Why it fails | Fix |
| --- | --- | --- | --- |
| The wish | `Write clean, maintainable code.` | F7 = 0.10; nothing checkable | Name the threshold and the escape |
| The description | `All files are optimized for agent consumption.` | Reads as a statement; F3 = 0.00 | Rewrite as an instruction |
| The standing duty | `Keep CHANGELOG.md updated.` | Distant file, no moment; ignored outright | `Before opening a pull request, add a line to CHANGELOG.md for every user-visible change.` |
| The bare ban | `Never edit the generated files.` | Stalls the task; caps grade at 0.30 | Name the replacement or the escape hatch |
| The hedged mandate | `Always try to prefer functional components when possible.` | Weakest hedge governs; F1 = 0.20 | Pick one force and commit |
| The hook in costume | `Run prettier before committing.` | F8 = 0.15; prose has to be remembered | Wire a `PreToolUse` hook |
| The misplaced scope | `When editing TypeScript files, …` in `CLAUDE.md` | F4 = 0.40; every session pays | Move to a `paths:`-scoped file |
| The buried rule | Line 180 of a 200-line file | F5 = 0.40 on graded profiles | Move to the top quarter, or split the file |
| The enumerating description | *"Authoritative reference for X — the full command set, the constant registry, scoping rules, …"* | Largest measured routing loss | One narrow, concrete claim |
| The generic backtick | `` Keep the `code` tidy. `` | Generic words in backticks are rejected as concrete | Name the actual identifier |
| The compound rule | `Use named exports, and run the linter, while also updating the docs.` | Three duties, one bullet | Three rules |
| The restated mandate | A "remember these" block repeating six bullets | Graded, counted, flagged as duplicate | Restate two or three, as prose, or fence it |
| The narrative that grades | A motivating story in a rules file | Grades as weak mandates and buries real rules | Fence with `assay-ignore-start/end` |

---

## 14. What none of this claims

Stated plainly, because overclaiming is the failure mode of every rule-writing
guide:

- **No static check predicts compliance.** *"A rule with nothing on it passed the
  checks above. That is all… it tells you the rule is written so that it could"*
  (`assay/references/what-assay-measures.md:169`).
- **A firmly-worded rule is not a followed rule.** A hedge is a real signal on
  smaller models; on a large one in an interactive session it matters much less.
- **A named moment is not a guarantee** — it is the difference between a rule
  that can fire and one that has to be recalled.
- **Scoping is not always better.** A rule that genuinely applies everywhere
  belongs in the always-loaded file.
- **Not every prohibition needs an alternative.** Some bans really are absolute —
  then say what to do *instead of continuing*.
- **Not every rule needs a path.** Some need a threshold, some a worked example,
  and a few genuinely need judgment. Those belong in prose, and a good analyzer
  says so about them.
- **Scores from different hosts, profiles, models or languages are not
  comparable** without a separate validation study (`assay/SCOPE.md:500`).
- **Improving a score is never the goal by itself.** assay flags "rubric-oriented
  rewrites" — a file whose grade rose while every finding stayed put — precisely
  because a rule that got better and a rule that merely acquired the words the
  rubric rewards look identical from the outside (`assay/SCOPE.md:556`).

---

## Sources

All paths are relative to the `slag` repository root. That repository is not
part of Disregard, and its `assay/` tree is being retired. What came across:

| Source | Here |
| --- | --- |
| F1, F2 and F7 in `assay/scripts/assay.js` | [lib/scorer.js](../../lib/scorer.js) |
| The language screen in `assay/scripts/assay.js` | [lib/language.js](../../lib/language.js) |
| `assay/references/rubrics.md` | [research/rubrics.md](../../research/rubrics.md) |
| The measurements behind `assay/scripts/models/*.js` | [research/rule-lab/FINDINGS.md](../../research/rule-lab/FINDINGS.md) |

Everything else in the table below has no counterpart here.

| Topic | File |
| --- | --- |
| Rule anatomy, redirect table, placement | `assay/skills/craft-rules/references/recipe.md` |
| Description recipe, reliability ladder | `assay/skills/craft-skill/references/recipe.md` |
| Per-check explanations with worked examples | `assay/references/what-assay-measures.md` |
| F3 / F8 judgment bands | `assay/references/rubrics.md` |
| Scoring engine, word lists, thresholds | `assay/scripts/assay.js` |
| Model weight columns and their evidence | `assay/scripts/models/*.js` |
| Product boundaries, evidence contract, ladder | `assay/SCOPE.md` |
| Interview order, refusal path, corpus check | `assay/skills/craft-rules/SKILL.md` |
| Rewrite transaction, per-factor fixes | `assay/skills/_shared/fixes.md` |
| Placement targets and host loading facts | `assay/scripts/adapters/claude.js` |
| Independent corpus validating the enumeration effect | `assay/tests/blind-corpus.test.js` |
