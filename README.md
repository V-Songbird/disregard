# Disregard

Disregard scores one rule from an agent instruction file, such as a line of a
`CLAUDE.md` or an `AGENTS.md`, and reports how that line reads to the agent that
has to follow it. It answers what a local linter cannot: whether the line is a
rule at all, and whether it should stop being prose and become a hook, a skill
or a subagent.

Try it on [the live service](https://disregard-score.victor-villegas.workers.dev/),
and read [what was measured](https://disregard-score.victor-villegas.workers.dev/research)
to get there — 2,020 paid cells testing whether a rule's wording changes what an
agent does. The harness and every cell are in [research/](research/).

**It scores one line, not a file, and English only.** Anything over 2000
characters is rejected, and another language is handed back unscored, because
nothing here was measured outside English. To review a whole instruction file,
[AgentLinter](https://agentlinter.com/) already does that, free.

## Requirements

- **Node 18 or later**, for the tests and the offline harness. Checked on
  22.22.2.
- **A TypeSafe API key**, to score a rule. Scoring calls Jev, a TypeSafe model.
  The tests and the offline harness run without one.
- **A Cloudflare account**, only to deploy your own copy.

## Quick start

Score a rule against the running service. Nothing to install, no key needed.

```bash
curl -s -X POST https://disregard-score.victor-villegas.workers.dev/api/score \
  -H "Content-Type: application/json" \
  -d '{"rule":"Always try to keep functions small."}'
```

Expected output, pretty-printed from the single line the service returns:

```json
{
  "status": "ok",
  "risk": 0.03,
  "findings": [
    { "id": "hedge_dominance", "factor": "F1", "value": 0.2, "verb": "try to" },
    { "id": "no_concrete_anchor", "factor": "F7", "value": 0.05 }
  ],
  "factors": {
    "F1": 0.2, "F2": 0.85, "F7": 0.05, "F3": 2.19, "F8": 1.32,
    "is_rule": 0.96,
    "primitive": { "choice": "rule", "confidence": 0.96 }
  },
  "tokens": 2570
}
```

Two findings fired. `hedge_dominance` for the `try to`, and
`no_concrete_anchor` because nothing in the line is checkable.

Your numbers will differ slightly. Four of the values come back probability
weighted, so they move a little between runs while the findings stay the same.
That is why every set under `eval/` labels the finding rather than the value.

## What comes back

Findings, and **deliberately no grade**. A letter is the part a reader
over-trusts and the part that says least.

Findings cross the wire as an id and the numbers behind it, never prose. The
page owns every sentence a reader sees. That is what lets the interface speak
six languages while the rules it scores stay English.

There are nine findings. The first five lead on the page, because nothing else
there says them.

| Finding | What it means |
| --- | --- |
| `not_a_rule` | The line asks for nothing. It is read and paid for every turn without changing what the agent does. |
| `should_be_a_hook` | Compliance is mechanical, and the model is confident. Prose is the weaker copy of a check. |
| `belongs_as_a_skill` | A procedure or reference that only matters while one kind of work is under way. |
| `belongs_as_a_subagent` | A sweep, an audit or a review. It produces a report rather than a pass or a fail. |
| `could_be_a_hook` | A tool could carry it, but the routing will not say which kind. |
| `no_trigger` | Nothing names an occasion, so the line is read once and never comes due. |
| `stall_risk` | A ban that names nothing to do instead. A blocked task becomes a stopped one. |
| `hedge_dominance` | One hedging verb sets the force of the whole sentence downward. |
| `no_concrete_anchor` | No file, command, symbol or number, so two readers can disagree about what they did. |

The `factors` block holds the numbers behind them.

| Factor | What it scores | A low value means |
| --- | --- | --- |
| `F1` | How hard the leading verb pushes. | The verb is hedged. |
| `F2` | Whether a ban names something to do instead. | It names nothing. |
| `F3` | How close the occasion is that brings the rule due. | No occasion is named. |
| `F7` | Whether anything in the line is checkable. | Nothing is. |
| `F8` | Whether a deterministic tool beats prose here. | A tool settles it. |

The `status` field says which of four answers you got.

| `status` | When | Cost |
| --- | --- | --- |
| `ok` | It was scored. `findings` may be empty. | one Jev request |
| `not_english` | The language screen read another language. | none, that screen runs first |
| `review` | Injection risk at or above 0.35. Scored, but no verdict is rendered. | already spent |
| `refused` | Injection risk at or above 0.70. The text is aimed at whatever processes it. | already spent |

Errors carry a `code` for the page to translate and an English `error` for logs:
`bad_body`, `bad_rule`, `empty`, `too_long`, `not_configured`, `upstream`,
`rate_limited` and `failed`. Nothing from upstream is passed through, because an
upstream body can carry the submitted rule back verbatim.

## Run it locally

There is no build step and no `package.json`. `npx` ships with Node and
downloads wrangler on first use.

1. Copy [.dev.vars.example](.dev.vars.example) to `.dev.vars` and fill in your
   key. The copy is gitignored, the example is not.

   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Start the server. Wrangler prints the local address it is listening on.

   ```bash
   npx --yes wrangler dev
   ```

## Configuration

One setting, and it is a secret.

| Name | Required | Default | What it does |
| --- | --- | --- | --- |
| `TYPESAFE_API_KEY` | To score a rule | none | Authenticates the call to Jev. Without it, `/api/score` answers `not_configured`. |

Where the value goes: `.dev.vars` on a developer machine, a Cloudflare Workers
secret in production. **Never `wrangler.jsonc`**, which is committed. Everything
else the service uses is a constant in [lib/analyze.js](lib/analyze.js) or
[lib/language.js](lib/language.js), next to the document that measured it.

## Deploy

Requires a Cloudflare account and `wrangler login`. Run these two steps in this
order, from the repository root.

1. Publish the Worker and the page. Wrangler prints the deployed URL.

   ```bash
   npx --yes wrangler deploy
   ```

2. Set the key. Wrangler prompts for the value. The Worker must already exist.

   ```bash
   npx --yes wrangler secret put TYPESAFE_API_KEY
   ```

## Development and tests

The suite is local, needs no key, and costs nothing.

```bash
node --test --test-reporter=dot
```

Expected output, all of it: 57 dots and nothing else. A failed test prints its
assertion instead.

```text
....................
....................
.................
```

The labelled sets and their harnesses live in `eval/`. Two of them are free and
four spend real money per run. Read
[the eval guide](eval/README.md) before running any of them, because it says
which number a given set is still allowed to report.

## Changing the criteria

**Change a criteria string, re-run its set, and report the held-out number, not
the tuned one.** Every question here was wrong in its first version, and a
labelled set caught it each time. Each document below carries a "rules for
changing this" section, and those with a spent set name it there.

| What it decides | Measured | Read first |
| --- | --- | --- |
| Is this text steering the evaluator? | 9/9 attacks caught, 14/15 benign clean, margin 0.74. One set of 24, no held-out split | [the injection screen](docs/knowledge/injection-screen-criteria.md) |
| Is it English? | Held out: 1 leak in 10 foreign, **0 refusals** in 10 English | [the language screen](docs/knowledge/language-screen-criteria.md) |
| Is it a rule? | Held out: 7/8, margin +0.06. The margin matters more than the count | [is_rule and best_primitive](docs/knowledge/is-rule-and-primitive-criteria.md) |
| Rule, hook, skill or subagent? | Held out: 6/8, and **10/10 on confident picks** across all 16 | same document |
| When does it come due? | Held out: 4/10 exact, mean error 0.90 levels | [trigger distance](docs/knowledge/f3-trigger-distance-criteria.md) |
| Is the verb soft? Is anything checkable? | Held out: 20/20 and 20/20 | [the deterministic factors](docs/knowledge/f1-f7-deterministic-criteria.md) |

Five held-out halves are **spent**. A fix was diagnosed from a case inside
them, so they are regression guards now, not measurements. Trigger distance and
the deterministic factors have a fresh set since, and their rows above are the
fresh number. The language, `is_rule` and primitive rows are guards. Build a
fresh set rather than promoting a guard back.

## Where things live

| Path | What is in it |
| --- | --- |
| [lib/analyze.js](lib/analyze.js) | One rule in, findings out. Every threshold, with the document it came from. |
| [lib/questions.js](lib/questions.js) | The six Jev questions, sent as one request per rule. |
| [lib/scorer.js](lib/scorer.js) | F1, F2 and F7. English word lists, no call, no cost. |
| [lib/language.js](lib/language.js) | The screen that runs before anything is spent. |
| [api/score.js](api/score.js) | The one server-side piece, and only because a key cannot go in a page. |
| [worker.js](worker.js) | The Cloudflare entry point, and the only ESM file here. |
| [public/](public/) | The page. No framework, no build. `i18n.js` holds six locales. |
| [eval/](eval/) | Labelled sets and harnesses. |
| [research/](research/) | The rule-lab harness, its 2,020 measured cells, and the F3/F8 rubric. |
| [docs/](docs/) | Why each criteria string says what it says, and what it measured at. |

The handler is written against the Web standard `Request` to `Response` and
touches no Node built-in. It runs unchanged on Netlify v2, Vercel, Deno or Node
22. Cloudflare is the host, not a dependency.

## Limits

- **Enforceability has no labelled set of its own.** It gates one finding,
  `could_be_a_hook`.
- **The five interface translations are unmeasured.** They need a native reader,
  not a harness, and the page says so in each of them.
- **Scope and position are not scored and cannot be.** Both need the whole file,
  and this scores one pasted line.
- **A clean result is not a prediction that an agent will follow the rule.** It
  means none of the checks above fired.

## Support and license

[CONTRIBUTING.md](CONTRIBUTING.md) says what is worth contributing, what it
costs, and the floor a measurement has to clear.

Report a wrong verdict or a bug in the
[issue tracker](https://github.com/V-Songbird/disregard/issues), with the exact
rule text you pasted. The documents under `docs/` answer why a criteria string
says what it says. Report anything security related to the address in
[SECURITY.md](SECURITY.md), never in a public channel.

**MIT**, in [LICENSE](LICENSE). The service's own terms and privacy notice are
shipped with the page, at [terms](public/terms.html) and
[privacy](public/privacy.html).
