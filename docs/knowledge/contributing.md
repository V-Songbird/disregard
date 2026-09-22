---
type: knowledge
summary: "Explains contribution setup, code conventions, and verification expectations; read before proposing a change to Disregard."
related_files:
  - .nvmrc
  - lib/analyze.js
  - api/score.js
  - worker.js
  - public/review-ui.js
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

## Reporting a security issue

Follow [security policy](security.md). Do not include vulnerabilities or secrets in public issues.
