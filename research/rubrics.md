Rubric version: 3

> Brought into Disregard on 2026-09-20 from `assay/references/rubrics.md`, which
> was the only copy. The F8 levels in `lib/questions.js` are verbatim from the F8
> section below, and the `LABELLED` set in `eval/f3-criteria.js` is every worked
> example below that carries an explicit F3 target. Change a level here and both
> of those are wrong; change them together or not at all.

# Judgment rubrics — F3 and F8

Score each rule independently against these level boundaries. Pick a level
first, then a value inside its band. Keep the same scale across the whole
corpus — if two rules feel equally distant, they get the same F3.

## F3 — trigger-action distance

Will the agent recognize the firing moment? The closer the trigger sits to the
action, the more reliably the rule fires.

**Level 4 (0.90–1.00) Immediate** — action is the same operation as the trigger.

> "Use `getProjectCommands(project)` not `.database.commands`" — choosing which
> API to call as you type it. 0.95.
> "Each test file must import from the module it tests, not from barrel
> exports" — same moment. 0.95.

**Level 3 (0.65–0.85) Soon** — action happens during the same task, a step later.

> "When adding new grammar rules, add corresponding PSI visitor methods and
> test coverage." — same task, follow-up step. 0.75.
> "Use functional components for all new React files." — creating the file IS
> writing the component, but "new" needs recognizing. 0.80.

**Level 2 (0.40–0.60) Distant** — a future moment the agent must independently
remember to check, many steps after reading the rule.

> "Every commit modifying src/ MUST end with [State: SYNCED]" — read at session
> start, needed 40 turns later. 0.45.
> "Run prettier on modified files before committing" — same distance. 0.50.

Level 2 requires a named firing moment ("when you change X…", "before
committing…"). A duty whose action lands in a different file than the one being
edited only earns Level 2 through that clause.

**Level 1 (0.15–0.35) Abstract** — a disposition, not a trigger-action pair.

> "The site must feel alive, playful, and aquatic." — no moment to check
> against. 0.20.
> "Try to prefer functional components when possible" — "when possible" is not
> a moment. 0.25.
> "Keep CHANGELOG.md updated." — a standing duty on a distant file with no
> when-clause; such rules get ignored outright, not merely late. 0.15.

**Level 0 (0.00–0.10) No trigger** — a statement, not an instruction.

> "All files are optimized for agent consumption." — description. 0.00.

Score higher within a level when the trigger is a concrete programming event
("when creating .tsx files"); lower when it is a subjective judgment ("when
something is expensive") or the action's artifact is ambiguous. Rules that fire
at the very code being edited hold up through multi-step tasks — don't discount
them for intervening subtasks.

## F8 — enforceability ceiling

Could a deterministic tool do this rule's job better than prose? Low F8 means
yes — the rule is a hook wearing a costume.

**Level 3 (0.85–1.00) Not enforceable** — needs judgment no tool has.

> "Use CachedValuesManager for expensive computations." — "expensive" is
> subjective. 0.90.
> "The site must feel alive and playful." — aesthetic judgment. 0.95.

**Level 2 (0.55–0.80) Partially** — a tool could catch some violations.

> "Use functional components for all new React files." — a linter flags class
> components but can't tell "new" from "existing". 0.70.

**Level 1 (0.30–0.50) Mostly** — a hook or linter could enforce the core; the
rule is a stopgap.

> "NEVER edit files in src/main/gen/ directly." — a file-matcher hook blocks
> this entirely. 0.35.
> "Note every src/ change in CHANGELOG.md." — a hook that fires after every
> edit does this deterministically; prose has to be remembered. 0.30.
> Keep-file-in-sync duties like this belong at Level 1 even when no hook exists
> yet.

**Level 0 (0.10–0.25) Fully** — a command verifies compliance with an exit code.

> "Run prettier on modified files before committing" — a pre-commit hook. 0.15.
> "Ensure no TypeScript errors exist before pushing" — `tsc --noEmit`. 0.15.

Score higher within a level when the mechanical tool doesn't exist for this
project or the rule has nuances a tool can't capture; lower when the phrasing
maps 1:1 to an existing tool.

## F1 patch (only for rules flagged `needsF1`)

The script found no verb it recognizes. Score how binding the rule reads:
1.0 unconditional (must/never) · 0.85 plain imperative · 0.7 advisory
(should) or statement-of-convention · 0.5 preference · 0.2 hedged wish.

## What the payload tells you about a rule's origin

Each `judge` entry carries `file` and `scope`. An entry with `autoMemory: true`
is a note the host wrote ABOUT this project, not an instruction to follow —
score it like every other entry, since the report will not compose without an F3
and F8 pair, but do not read its F3 as a standing duty, and let the verification
pass reject it. A `scope` of `user` or `ancestor` is a rule from outside
this repository: score it normally, but do not read a missing project path in it
as a defect.
