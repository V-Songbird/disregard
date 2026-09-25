# Disregard

Disregard reviews English instructions for AI agents and builds a refactoring prompt from the findings.
It highlights wording to inspect; it does not predict compliance or judge a whole file's consistency.

## Try a file

Use the Node version in [.nvmrc](.nvmrc), npm, and a browser.
From the repository root, start the local server:

```shell
npx --yes wrangler dev
```

The first run downloads Wrangler and needs network access. No package installation or build step is required for the application itself.
Open the local address printed by Wrangler and choose **English** in the interface language picker.
Paste this into **Your instruction file**, then select **Preview instructions**:

```markdown
- Run node --test before submitting changes.
```

The preview shows one excerpt with its source line. Expected labels:

```text
Ready
Analyze 1 instruction
```

Previewing runs locally and needs no API key. If the parser cannot load, the page reports that failure instead of showing excerpts.

## Analyze and copy a prompt

For scoring, copy [.dev.vars.example](.dev.vars.example) to `.dev.vars`, set `TYPESAFE_API_KEY`, and restart the server.
You need a TypeSafe account and network access. Scoring calls can incur charges on that account.

Select **Analyze**, inspect the findings and unreviewed ranges, then select **Copy prompt**.
Paste the English prompt into an agent that can read the original file. Review its proposed edits against your intended requirements.
The **One rule** mode also accepts a single instruction.

The key stays on the server. Previewing and prompt generation run in the browser; scoring sends eligible excerpts through the server to TypeSafe.
Do not submit secrets or personal data. Read the application's [privacy notice](public/privacy.html) and [terms](public/terms.html).

## Limits and configuration

- Scoring supports English instructions; the interface supports six languages.
- Files may contain up to 64 KiB and 512 structural blocks. The first 150 eligible excerpts are scored; later ones stay listed as not analyzed.
  A file review starts at most 55 requests a minute and says when it waits.
- Each scored excerpt is limited to 2000 UTF-16 code units.
- An excerpt that depends only on a conditional heading or an introducing paragraph is scored with that section context stated first.
  A list item is scored together with the items nested under it, and a numbered list as one procedure.
  An instruction to read or follow a linked Markdown file is scored as written, without reading that file.
  Other context-dependent, refused, skipped, or failed excerpts remain explicitly unreviewed.
- Findings are separate signals. There is no overall grade or guarantee of correctness.

`TYPESAFE_API_KEY` has no default and is required only for scoring.
Use `.dev.vars` locally and a Worker secret when hosting; never place a real key in shared configuration.
The supplied [Worker configuration](wrangler.jsonc) includes required request-limit bindings. They are not a spending cap.
See the [scoring API reference](docs/apis/score.md) for requests, results, and errors.

## Development

With the pinned Node version, run the offline checks from the repository root:

```shell
node --test --test-reporter=dot
```

Passing tests print dots and exit successfully. No provider key, external packages, or network access is needed.
See [development setup](docs/knowledge/development.md) for focused tests and optional browser checks.

## Help and contributions

Report reproducible bugs or ask usage questions in the [issue tracker](https://github.com/V-Songbird/disregard/issues).
See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change and [SECURITY.md](SECURITY.md) for private vulnerability reports.
For the bundled parser's source, license, and hashes, see [CommonMark provenance](docs/knowledge/commonmark.md).

## License

[MIT](LICENSE). The bundled CommonMark parser retains its separate [BSD license](public/vendor/commonmark-LICENSE.txt).
