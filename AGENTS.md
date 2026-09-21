# Disregard

Reviews English agent instruction files by scoring eligible excerpts separately
and exporting a refactoring prompt. File input preserves source ranges and
unreviewed context; it is not a contextual whole-file verdict.
The one-rule API retains its 2000-character limit. See [README.md](README.md).

## Commands

| What | Command |
| --- | --- |
| Check | `node --test --test-reporter=dot` |
| Check one file | `node --test --test-reporter=dot lib/analyze.test.js` |
| Local server | `npx --yes wrangler dev` |
| Deploy | `npx --yes wrangler deploy` |

Use the Node version in [.nvmrc](.nvmrc). The offline suite needs no key,
package installation, or network. There is no `package.json` or separate build step.
Optional browser checks use installed Edge and local mock responses;
see [development setup](docs/knowledge/development.md).

## Project map

- [lib/](lib/) holds scoring, current criteria, request guards, and adjacent tests.
- [api/score.js](api/score.js) is the portable one-rule HTTP handler.
- [worker.js](worker.js) is the Cloudflare entry point.
- [public/](public/) holds the interface, local Markdown reader, prompt exporter,
  and bundled CommonMark parser.
- [checks/](checks/) holds file-workflow tests and optional browser checks.
- [docs/apis/score.md](docs/apis/score.md) describes the request and response contract.
- [docs/knowledge/development.md](docs/knowledge/development.md) describes local setup and verification.

## Implementation boundaries

- **`AGENTS.md` is the instruction source for every host.** `CLAUDE.md` contains
  only `@AGENTS.md`. Do not add divergent host-specific instruction copies.
- **Files under `lib/` and `api/` use CommonJS.** Use `module.exports`.
  `worker.js` uses `export default` for Cloudflare Workers; Wrangler bundles them together.
- **The portable handler uses Web standard APIs and no Node built-ins.** Keep
  Cloudflare-specific request protection in the Worker wrapper.
- **`TYPESAFE_API_KEY` is a secret.** Local Wrangler reads `.dev.vars`;
  production reads a Workers secret. Start from [.dev.vars.example](.dev.vars.example).
  Never put the key in committed configuration.
- **Criteria and thresholds are public product code.** Keep current definitions
  in `lib/`; update focused tests and the API description when behavior changes.
- **Input remains English-only.** Interface locales do not change scoring language.
  Keep API findings structured and user-facing wording in the locale files.
- **File excerpts are scored independently.** Preserve source ranges and explicit
  unreviewed states; do not present them as a whole-file verdict.
- **Live scoring can incur charges.** Routine tests use local fixtures or mocks.
