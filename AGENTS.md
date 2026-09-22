# Disregard

Disregard reviews English agent instructions and exports findings with source locations.
Use the Node version in `.nvmrc`. There is no package manifest or application build step.
`lib/` and `api/` use CommonJS; `worker.js` uses the Cloudflare Workers module export.

## Start here

- For product behavior and first use, read [README.md](README.md).
- Before changing requests, scoring, or thresholds, read [the API contract](docs/apis/score.md).
- For setup and verification, read [development](docs/knowledge/development.md).
- Before updating the bundled parser, read [its provenance](docs/knowledge/commonmark.md).
- For code conventions and contributions, read [the contribution guide](docs/knowledge/contributing.md).

## Commands

Run from the repository root with the pinned Node version.

| Command | Purpose | External effects |
| --- | --- | --- |
| `node --test --test-reporter=dot` | All offline product tests | None; uses included fixtures and mocks. |
| `node --test --test-reporter=dot lib/analyze.test.js` | Focused analyzer tests | None. |
| `npx --yes wrangler dev` | Local application server | Downloads Wrangler if needed; analysis can call the paid provider. |

Browser checks require Playwright and installed Microsoft Edge. Their setup, output arguments, and scope are in the development guide.

## Where things live

| Path | Purpose |
| --- | --- |
| `worker.js`, `wrangler.jsonc` | Routing, static assets, and rate-limit bindings. |
| `api/score.js`, `api/score.test.js` | Portable HTTP handler and request-contract tests. |
| `lib/analyze.js`, `lib/questions.js`, `lib/criteria.js` | Provider request, current criteria, screening, and findings. |
| `lib/scorer.js`, `lib/language.js`, `lib/score-rate-limit.js` | Local scoring, language screening, and request guards. |
| `lib/*.test.js`, `lib/fixtures/` | Offline logic tests and synthetic fixtures. |
| `public/` | Served interface, product pages, document reader, and prompt generator. |
| `public/vendor/` | Pinned browser parser and its license; required product assets. |
| `checks/` | Document/prompt tests and optional browser harnesses. |
| `docs/knowledge/`, `docs/apis/` | Maintained product documentation. |
| `.github/workflows/check.yml` | Offline CI command using `.nvmrc`. |

## Conventions

API findings use stable identifiers and numeric evidence. Display wording belongs in `public/i18n.js` and `public/file-i18n.js`.
The file workflow preserves source ranges and explicit unreviewed states; it does not turn excerpt findings into a file-wide verdict.
Provider criteria are runtime source in `lib/criteria.js` and `lib/questions.js`.

## Pitfalls

- **A missing rate-limit binding returns 503.** Use the supplied Worker configuration when exercising HTTP integration.
- **Raw values control thresholds before display rounding.** Consume returned statuses and findings instead of reconstructing decisions from rounded factors.
- **Browser selectors vary by locale and scenario.** The optional harnesses build some selectors dynamically; follow their fixture tables when tracing a case.
- **Static HTML pages are served product assets.** `public/research.html`, `privacy.html`, and `terms.html` belong to the application routes.
