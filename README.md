# Readback

Paste one rule from your agent's instruction file. Get back how it reads to the
thing that has to follow it.

**[readback-score.victor-villegas.workers.dev](https://readback-score.victor-villegas.workers.dev/)**

A readback is the receiver repeating an instruction so the sender can hear
whether it landed.

## What comes back

One rule in, findings out, and **deliberately no grade**. A letter is the part a
reader over-trusts and the part that says least. The two things no local linter
can tell you are *"this line is not a rule"* and *"this should be a hook"*, and
both of those are findings.

Nine of them. The first five lead, because nothing else on the page says them:

| Finding | What it means |
| --- | --- |
| `not_a_rule` | The line asks for nothing. It is carried, read and paid for every turn without changing what the agent does. |
| `should_be_a_hook` | Compliance is mechanical and the model is sure. Prose is the weaker copy of a check that is never skipped. |
| `belongs_as_a_skill` | A procedure or a body of reference that only matters while one kind of work is under way. |
| `belongs_as_a_subagent` | A sweep, an audit, a review. It reads more than the task holds, and what it produces is a report. |
| `could_be_a_hook` | A tool could carry it, but the routing will not say which kind. |
| `no_trigger` | Nothing names an occasion the reader could check themselves against, so it is read once and never fires. |
| `stall_risk` | A ban that names nothing to do instead. A blocked task becomes a stopped one. |
| `hedge_dominance` | One hedging verb sets the force of the whole sentence downward, however firm the rest sounds. |
| `no_concrete_anchor` | No file, command, symbol or number, so two readers can both follow it and disagree about what they did. |

Findings cross the wire as an id and the numbers behind it, never prose. The
page owns every sentence a reader sees, which is what lets the interface speak
six languages while the rules it scores stay English.

## The four answers

| `status` | When | Cost |
| --- | --- | --- |
| `ok` | It was scored. `findings` may be empty. | one Jev request |
| `not_english` | Another language. Nothing here was measured outside English, so a number would mean nothing. | none, the screen runs first |
| `review` | Injection risk at or above 0.35. Scored, but no verdict is rendered over text that may be addressing the reader. | already spent |
| `refused` | Injection risk at or above 0.70. The text is aimed at whatever is processing it. Handed straight back. | already spent |

## Running it

No build step, no `package.json`, no dependencies. CommonJS everywhere except
[worker.js](worker.js), the one ESM module Cloudflare wants — wrangler's bundler
joins the two.

```bash
node --test                             # 47 tests, all local, no key needed
npx --yes wrangler dev                  # local server; key goes in .dev.vars
npx --yes wrangler deploy               # ship it
npx --yes wrangler secret put TYPESAFE_API_KEY
```

The key is a **secret, not a var**: it must never land in
[wrangler.jsonc](wrangler.jsonc). `.dev.vars` is gitignored for the same reason.

## The API

The page is a static asset, matched before the Worker runs. Only `/api/score`
and mistyped paths reach any code of ours.

```
POST /api/score    { "rule": "Always prefer the smallest coherent solution." }
```

`rule` is a string of 2000 characters or fewer. A real response to that rule:

```json
{
  "status": "ok",
  "risk": 0.04,
  "findings": [
    { "id": "hedge_dominance", "factor": "F1", "value": 0.5, "verb": "prefer" },
    { "id": "no_concrete_anchor", "factor": "F7", "value": 0.05 }
  ],
  "factors": {
    "F1": 0.5, "F2": 0.35, "F7": 0.05, "F3": 1.66, "F8": 2.63,
    "is_rule": 0.94,
    "primitive": { "choice": "rule", "confidence": 0.99 }
  },
  "tokens": 2570
}
```

Errors carry a `code` for the page to translate and an English `error` for logs:
`bad_body`, `bad_rule`, `empty`, `too_long`, `not_configured`, `upstream`,
`rate_limited`, `failed`. Nothing from upstream is passed through, because an
upstream body can carry the submitted rule back verbatim.

## Layout

| Path | What is in it |
| --- | --- |
| [lib/analyze.js](lib/analyze.js) | One rule in, findings out. Every threshold, each with the document it came from. |
| [lib/questions.js](lib/questions.js) | The six Jev questions, sent as one request per rule. |
| [lib/scorer.js](lib/scorer.js) | F1, F2 and F7 — English word lists, no call, no cost. |
| [lib/language.js](lib/language.js) | The screen that runs before anything is spent. |
| [api/score.js](api/score.js) | The one server-side piece, and only because a key cannot go in a page. |
| [public/](public/) | The page. No framework, no build. [i18n.js](public/i18n.js) holds six locales. |
| [eval/](eval/) | The labelled sets and harnesses. [eval/README.md](eval/README.md) says which number to report. |
| [docs/](docs/) | Why each criteria string says what it says, and what it measured at. |

The handler is written against the Web standard `Request -> Response` and
touches no Node built-in, so it runs unchanged on Netlify v2, Vercel, Deno or
Node 22. Cloudflare is the host, not a dependency.

## Changing any of it

**Change a criteria string, re-run the set, report the held-out number — not the
tuned one.** Every question here was wrong in its first version, and each time it
was a labelled set that caught it, never a reading. Each knowledge doc carries a
"rules for changing this" section naming what is spent and what is still safe to
quote.

| What it decides | Held out | Read first |
| --- | --- | --- |
| Is this text steering the evaluator? | 9/9 attacks caught, 14/15 benign clean, margin 0.74 | [injection-screen-criteria.md](docs/knowledge/injection-screen-criteria.md) |
| Is it English? | 1 leak / 20, **0 refusals** | [language-screen-criteria.md](docs/knowledge/language-screen-criteria.md) |
| Is it a rule? | 7/8, and the ordering is what matters | [is-rule-and-primitive-criteria.md](docs/knowledge/is-rule-and-primitive-criteria.md) |
| Rule, hook, skill or subagent? | 6/8 overall, **10/10 on confident picks** | same |
| When does it come due? (F3) | 6/10 exact, MAE 0.39 levels | [f3-trigger-distance-criteria.md](docs/knowledge/f3-trigger-distance-criteria.md) |
| Is the verb soft? Is anything checkable? (F1, F7) | 20/20 and 20/20 | [f1-f7-deterministic-criteria.md](docs/knowledge/f1-f7-deterministic-criteria.md) |

Four of those held-out halves are **spent** — a fix was diagnosed from a case
inside them, so they are regression guards now, not measurements. Build a fresh
set rather than quietly promoting a guard back.

## What is not measured

- **`enforceability` (F8)** has no labelled set of its own. It gates one
  finding, `could_be_a_hook`.
- **The six interface translations.** They need a native reader, not a harness.
- **F4 (scope) and F5 (position)** are not here and cannot be: both take a
  *file*, and this scores one pasted line.

A clean result is not a prediction that an agent will follow the rule. It means
none of the checks above fired.
