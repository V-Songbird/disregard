---
type: knowledge
summary: "Explains local setup, product test commands, and browser-check requirements for developing a fork of Disregard."
related_files:
  - .nvmrc
  - .dev.vars.example
  - wrangler.jsonc
  - .github/workflows/check.yml
  - checks/wrangler-config.test.cjs
  - checks/request-ui.cjs
  - checks/file-review-ui.cjs
  - checks/recommendation-ui.cjs
  - checks/theme-accessibility.cjs
  - checks/locale-screens.cjs
  - checks/browser-assets.cjs
  - checks/og-card.cjs
---

# Development

The repository contains the product code, current scoring criteria, and tests
needed to develop a fork. It has no `package.json` or separate build step.
Use the Node version in [.nvmrc](../../.nvmrc).

## Offline tests

From the repository root:

```shell
node --test --test-reporter=dot
```

The suite uses Node's built-in test runner. It does not need a provider key, external
packages, or a network connection. Passing tests print dots; failures return a
nonzero exit code. Drop `--test-reporter=dot` for names and totals.

To test one file:

```shell
node --test --test-reporter=dot lib/analyze.test.js
```

[GitHub Actions](../../.github/workflows/check.yml) runs the same test runner using
the version in `.nvmrc`. Tests establish the behavior they assert; they do not
establish provider accuracy or the quality of an agent's resulting edits.

`checks/wrangler-config.test.cjs` fails when [wrangler.jsonc](../../wrangler.jsonc)
changes a release setting: the `disregard.dev` custom domain with `workers.dev` kept on,
preview URLs off, Workers Logs on with invocation logs and
traces off, and both rate-limit bindings with their namespaces and limits. It checks the
file, not the settings of a deployed Worker. `wrangler dev` ignores `routes`; a fork that
deploys its own Worker must replace the `disregard.dev` route with a domain it owns, or
remove it, and update the test.

## Local server

Copy [.dev.vars.example](../../.dev.vars.example) to `.dev.vars` and set
`TYPESAFE_API_KEY`. With Node and npm available, run:

```shell
npx --yes wrangler dev
```

Open the local address printed by Wrangler. Reading the file and prompt generation
run in the browser. Analysis calls the provider using the server key and can incur
charges. A local server is not an offline provider simulation.

The Worker requires both rate-limit bindings in
[wrangler.jsonc](../../wrangler.jsonc). A missing or invalid binding returns 503
instead of bypassing protection. Never commit the key or put it in Worker variables.

## Optional browser checks

These scripts require an installed Microsoft Edge browser and a Playwright package
available to Node. They launch Edge explicitly with `channel: "msedge"` and use
local HTTP servers with mock scoring responses; no provider key is needed.

Edge starts with a proxy address that never resolves, so requests to any other host
fail before leaving the machine. Every check fails when a page requests another host,
counted as `providerRequests` in its report, or when its local server receives a request
for anything other than a served file or `/api/score`, listed as `unknownRequests`.
Each server reads `public/` once per run and reports the hashes of the files it served.

If Playwright is not available, install it in an external tools directory or an
ignored local directory. For example, from the repository root:

```shell
npm install --prefix .private/browser-tools --no-package-lock --no-save playwright
```

Point `DISREGARD_PLAYWRIGHT_MODULE` at that package. In PowerShell:

```powershell
$env:DISREGARD_PLAYWRIGHT_MODULE = (Resolve-Path '.private/browser-tools/node_modules/playwright').Path
```

In a POSIX shell:

```bash
export DISREGARD_PLAYWRIGHT_MODULE="$PWD/.private/browser-tools/node_modules/playwright"
```

Each command below requires a new output path. The scripts create the parent
directory and refuse to overwrite an existing report:

```shell
node checks/request-ui.cjs .private/checks/request-ui.json
node checks/file-review-ui.cjs .private/checks/file-review-ui.json
node checks/recommendation-ui.cjs .private/checks/recommendation-ui.json
node checks/theme-accessibility.cjs .private/checks/theme-accessibility.json
node checks/locale-screens.cjs .private/checks/locale-screens.json
```

Reports and associated screenshots stay in the ignored `.private/` directory.
Choose another filename when repeating a check.

- `request-ui.cjs` checks the single-rule request lifecycle and translated states, including stopping by click and a fresh Enter, a held Enter that does not stop, and a new request after a stop.
- `file-review-ui.cjs` checks the intake (paste, choose and drop anywhere on the page, with wrong files refused and dropped files refused in one-rule mode), that nothing is sent before the primary action, the prompt-first result with its summary line and file name, the path-rules option (off, keyboard operable, adding its paragraph without a request, absent in one-rule mode), the closed details with coverage and the findings filter, the note on a file over 200 lines, cancellation, retries, a repeat check that sends only new or changed excerpts, request pacing, and prompt export. It paces a large file on Playwright's fake clock rather than waiting a real minute.
- `recommendation-ui.cjs` checks synthetic findings across locales and layouts using the bundled public fixtures, as single-rule results and as collapsed file rows.
- `theme-accessibility.cjs` checks rendered themes, contrast, focus, and layout behavior, including the file drop state and the opened details. Its keyboard journeys run in light and dark themes, at desktop, mobile and 200% zoom, in English and Arabic. While a mocked request is pending, they reach the single-rule and file stop controls by keyboard, stop with Enter in one journey and Space in another, and check that Escape leaves the analysis running. They also check where focus lands after each stop, and that a second press after a file stop sends nothing.
- `locale-screens.cjs` screenshots each file and single-rule journey state in all six locales at desktop and mobile widths, in a new folder named after the report. It fails on a page error, horizontal page overflow, a state it cannot reach, a `lang` tag that does not match the selected locale, an unknown local request, or a blocked request to another host.

Browser checks use viewport emulation, not physical mobile devices. Prompt clipboard
tests simulate successful and rejected writes; they do not prove operating-system
clipboard permission or the receiving agent's behavior. Locale screenshots are for
visual review: the check does not detect text clipped inside an element or judge
translations. Native dialogs, such as the file chooser the **Choose a file** button opens,
show the browser's or system's language rather than the interface language.

The link-preview image `public/og.png` is generated, not drawn by hand. After changing
the landing promise or the dark palette, regenerate it with the same Playwright setup and
look at the result before committing:

```shell
node checks/og-card.cjs
```

The script holds the card's HTML, so the card is not a served page. Keep the text in
`og:image:alt` in `public/index.html` in line with what the card shows.

## Implementation map

The CommonJS modules in `lib/` implement scoring, screening, and request guards.
`api/score.js` is a portable Web API handler. The Worker entry point uses an ES module
default export; Wrangler bundles the CommonJS modules for that runtime.

The interface is plain HTML, CSS, and JavaScript. The bundled CommonMark parser in
`public/vendor/` supplies Markdown block structure; see its [provenance and integrity](commonmark.md). The local document reader owns
source ranges and eligibility; `refactor-prompt.js` validates scored evidence before export.

Keep source ranges and explicit unreviewed states intact when changing the file
workflow. Keep finding identifiers in the API and translated prose in the interface.
See the [scoring API contract](../apis/score.md) for response fields and limits.

## Verification boundaries

Use synthetic regression cases for product behavior and mock provider responses
for request handling. Run the relevant browser check when changing UI behavior or
rendered presentation. Report which checks ran and what remains unverified.

Provider calls, deployment, and the receiving agent's edits are separate from the
offline suite. A passing suite does not demonstrate live service configuration,
actual device behavior, or preservation of instruction intent after refactoring.
