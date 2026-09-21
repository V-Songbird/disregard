# Disregard

Disregard reviews English agent instruction files and exports findings as a refactoring prompt for your agent.
It scores eligible excerpts separately, preserves source locations, and identifies text that still needs contextual review.

Use it to review an `AGENTS.md`, `CLAUDE.md`, or a single instruction.
Scores describe wording; they do not predict whether an agent will follow an instruction.

## Requirements

- Node and npm, using the Node version in [.nvmrc](.nvmrc).
- A [TypeSafe API key](https://typesafe.ai/) for scoring. Each scored excerpt can incur a provider charge.
- Network access for Wrangler and scoring. Offline tests need neither a key nor package installation.
- A Cloudflare account only if you deploy your own service.

## Run it locally

1. Clone this repository, or your fork, with Git:

   ```shell
   git clone https://github.com/V-Songbird/disregard.git
   cd disregard
   ```

2. Copy [.dev.vars.example](.dev.vars.example) to `.dev.vars` and set `TYPESAFE_API_KEY` to your key.
   The local secrets file is ignored by Git.

3. Start the local server from the repository root:

   ```shell
   npx --yes wrangler dev
   ```

   Wrangler downloads when needed and prints the local address to open.
   The page opens in **Instruction file** mode.

4. Paste this example and select **Preview instructions**:

   ```markdown
   # Project instructions

   - Always try to use functional components.
   - Run `node --test` before submitting changes.
   ```

   The preview shows these ready excerpts, without sending a scoring request:

   ```text
   Lines 3–3  Ready  - Always try to use functional components.
   Lines 4–4  Ready  - Run `node --test` before submitting changes.
   ```

   Select **Analyze** to see findings, then **Copy prompt** to hand the review to your agent.
   If scoring is unavailable, the page shows an error beside the affected excerpt; check your key and connection.

## Review a file

Choose a `.md` file or paste its contents. The browser parses Markdown locally before you submit eligible excerpts.
Analysis uses at most two concurrent requests. Completed results remain available if you select **Stop analysis**.

Review findings and unreviewed ranges before copying the prompt.
The English prompt includes scored evidence and asks your agent to inspect the real file, preserve intent, and make minimal changes.
Copying sends no additional scoring request; manual copying is available if clipboard access fails.

Select **One rule** to analyze one excerpt directly.
The interface supports English, Spanish, Chinese, Hindi, Arabic, and French; scored input remains English-only.

## Configuration and deployment

| Name | Required | Default | What it does |
| --- | --- | --- | --- |
| `TYPESAFE_API_KEY` | For scoring | None | Authenticates server-side TypeSafe requests. |
| `SCORE_CLIENT_LIMITER` | In the Worker | [wrangler.jsonc](wrangler.jsonc) | Limits requests sharing a client address. |
| `SCORE_AGGREGATE_LIMITER` | In the Worker | [wrangler.jsonc](wrangler.jsonc) | Limits combined requests at a Cloudflare location. |

Local Wrangler reads the key from `.dev.vars`; production uses a Workers secret.
Keep the key out of committed files. Rate-limit bindings provide approximate request protection, not a global spending cap.

To deploy a fork, sign in to Cloudflare and choose your Worker name in [wrangler.jsonc](wrangler.jsonc).
Use distinct rate-limit namespace IDs unless you intend to share counters with another Worker.

```shell
npx --yes wrangler login
npx --yes wrangler deploy
npx --yes wrangler secret put TYPESAFE_API_KEY
```

The last command prompts for your secret. Scoring becomes available once the Worker has its key and rate-limit bindings.

## API

`POST /api/score` accepts a JSON object with one `rule` string.
It returns structured findings and factor values, or an explicit screening status.
See the [API reference](docs/apis/score.md) for fields, limits, errors, and factor meanings.

## Development and tests

Run the offline suite from the repository root:

```shell
node --test --test-reporter=dot
```

Passing tests print dots; a failing test produces an assertion and a nonzero exit code.
There is no `package.json` or separate build step.
Optional browser checks use installed Edge and local mock responses; see [development setup](docs/knowledge/development.md).

## Where things live

| Path | Purpose |
| --- | --- |
| [lib/analyze.js](lib/analyze.js) | Scoring, validation, thresholds, and findings. |
| [lib/questions.js](lib/questions.js) | Current model questions and criteria. |
| [lib/scorer.js](lib/scorer.js) | Deterministic wording checks. |
| [lib/language.js](lib/language.js) | English input screening. |
| [api/score.js](api/score.js) | Portable HTTP handler using `Request` and `Response`. |
| [worker.js](worker.js) | Cloudflare entry point and request protection. |
| [public/](public/) | Interface, Markdown reader, prompt exporter, and bundled parser. |
| [checks/](checks/) | Product checks and optional browser checks. |

The portable handler uses no Node built-ins. Another host must provide its own routing, secrets, static assets, and request protection.

## Limits

- File input accepts up to 64 KiB, 256 structural blocks, and 40 ready excerpts.
- Each scored excerpt is limited to 2000 JavaScript string units. Oversized or context-dependent excerpts remain unscored.
- Eligibility and language screening are heuristic. They can exclude valid instructions or accept unsuitable text.
- Excerpts are scored separately. Contradictions, precedence, duplication, and completeness require your agent's contextual review.
- Findings can be wrong. Preferences, prohibitions, and project requirements may be intentional; a higher factor value is not always better.
- The exported prompt is a handoff. You must review the resulting edits before accepting them.

Read [how scoring works](public/research.html) for the current factors and their interpretation.

## Support and license

For bugs and usage questions, use the [issue tracker](https://github.com/V-Songbird/disregard/issues).
Include a minimal example you can share publicly. See [CONTRIBUTING.md](CONTRIBUTING.md) to make a change.
Report vulnerabilities through [SECURITY.md](SECURITY.md).

Disregard is licensed under [MIT](LICENSE). The service also provides [terms](public/terms.html) and a [privacy notice](public/privacy.html).
