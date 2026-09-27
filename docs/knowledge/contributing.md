---
type: knowledge
summary: "Explains contribution setup, code conventions, interface terms, and verification expectations; read before proposing a change to Disregard."
related_files:
  - .nvmrc
  - lib/analyze.js
  - api/score.js
  - worker.js
  - public/review-ui.js
  - public/file-i18n.js
  - public/research.html
  - docs/knowledge/development.md
---

# Contributing

Use the Node version in [.nvmrc](../../.nvmrc). Run the offline suite from the repository root:

```shell
node --test --test-reporter=dot
```

The suite requires no key, package installation, or network access.
Passing tests print dots; failures include assertions and return a nonzero exit code.
See [development setup](development.md) for the local server and optional browser checks.

## Making a change

Open a pull request with the problem, the resulting behavior, and the checks you ran.
Keep the change focused and update affected documentation.
Add a regression case for a behavior change; use synthetic examples that do not expose private instructions or credentials.

Useful contributions include reproducible bug reports, accessibility fixes, clearer findings, and translation corrections.
When reporting a scoring problem, include the input and response if you can share them publicly.
Otherwise, provide a minimal example with the same behavior.

## Code conventions

- Files under `lib/` and `api/` use CommonJS. `worker.js` uses the module export required by Cloudflare Workers.
- Keep the portable handler limited to Web standard `Request` and `Response` APIs, without Node built-ins.
- Keep API findings structured. User-facing wording belongs in the interface locale files.
- Preserve source ranges, partial results, and unreviewed coverage in the file workflow.
- Treat factor values as individual signals. Do not convert them into a compliance guarantee or an overall grade.
- Keep `TYPESAFE_API_KEY` in `.dev.vars` locally or a Workers secret in production.

Live scoring calls use the configured TypeSafe account and can incur charges.
Use mock responses for routine request and interface tests.
Never run automated load tests against the public service.

## Interface terms

Interface text uses one word for each concept, so a reader who learns a word on one screen recognizes it on the next.
The file report uses these English terms in [public/file-i18n.js](../../public/file-i18n.js):

| Concept | Term | Example |
| --- | --- | --- |
| A stretch of the file shown as one row of the report | excerpt | "Show only excerpts with findings" |
| What the service does to an excerpt | score: scored, not scored, scoring | "3 scored · 1 with findings · 5 not scored" |
| The whole run over a file or a rule, and its stop control | analysis | "Stop analysis", "Analysis paused" |
| A Markdown structure, such as a code block, and the limit on them | block | "This file has too many blocks to review at once." |
| What a text means as a requirement | instruction | "is not scored as an instruction" |

Each translated locale keeps one word per term in the same way.
One condition also gets one wording wherever it appears: an unavailable scoring service reads the same on the pause line and on the excerpt row.

[How scoring works](../../public/research.html) names each factor with the label the review screen shows, from `factors` in [public/i18n.js](../../public/i18n.js), such as **Verb force** (F1), **Concreteness** (F7), **Reads as an instruction** and **Concrete enough to check**.
[checks/i18n.test.cjs](../../checks/i18n.test.cjs) fails when the English labels and that page differ.
The review screen and the scoring page both call the length limit characters; the scoring page adds that they are counted as JavaScript string units.

## Reporting a security issue

Follow [security policy](security.md). Do not include vulnerabilities or secrets in public issues.
