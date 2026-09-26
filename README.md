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
Scoring needs a key: copy [.dev.vars.example](.dev.vars.example) to `.dev.vars`, set `TYPESAFE_API_KEY`, and restart the server.
You need a TypeSafe account and network access. Scoring calls can incur charges on that account.

Open the local address printed by Wrangler and choose **English** in the interface language picker.
Paste this into **Your instruction file**, or drop a Markdown file onto that area or select **Choose a file**:

```markdown
- Run node --test before submitting changes.
```

Then select **Create the prompt for my agent**. Nothing is sent for scoring before that. Expected result:

```text
Prompt for your agent
1 of 1 part was checked.
```

Without a key, the page reports `Analysis paused after a service error.` instead. If the file reader cannot load, the page reports that failure and sends nothing.

## Analyze and copy a prompt

Select **Copy prompt** and paste the English prompt into Claude Code or another agent working in the repository that holds the file.
Review its proposed edits against your intended requirements.
The agent also lists the rules a tool or the code could check.
It marks each one covered by the repository, only in prose, or kept by policy.
A covered rule has cited evidence: a tool configuration, CI step or hook checks it, or every file it applies to follows it.
Rules on safety, irreversible actions, authorization and secrets are kept by policy.
The agent proposes removing a covered rule only when you ask, and never a rule kept by policy.
The option above the primary action, off by default, adds one paragraph to the prompt and sends nothing: after the rest of the review, the agent proposes moving a rule into a `.claude/rules/` file only where the move is safe, with `paths` patterns that cover every existing file the rule concerns, and it often proposes none.
Claude Code loads those files only when it reads a matching file, so rules needed earlier, such as commands or where to create new files, stay in place; other agents do not load them, so for an `AGENTS.md` the agent proposes a move only when the repository shows Claude Code is its only reader, and otherwise asks.
**File name in the prompt** starts as the chosen or dropped file's name, or `AGENTS.md` for pasted text; change it if the file has another name in the repository.
The summary line says how many parts were checked; your agent reads the rest.
**See what was found** holds the coverage, each excerpt's findings, and the ranges left unreviewed.
The **One rule** mode also accepts a single instruction.

The key stays on the server. Reading the file and prompt generation run in the browser; scoring sends eligible excerpts through the server to TypeSafe.
Do not submit secrets or personal data. Read the application's [privacy notice](public/privacy.html) and [terms](public/terms.html).

## Limits and configuration

- Scoring supports English instructions; the interface supports six languages.
- Files may contain up to 64 KiB and 512 structural blocks. The first 150 eligible excerpts are scored; later ones stay listed as not analyzed.
  A file review starts at most 55 requests a minute and says when it waits.
- A file longer than 200 lines gets a note citing the Claude Code guide's target of under 200 lines per instruction file.
  Its prompt then lets the agent propose path-scoped rules or skills as a question for the owner.
- Each scored excerpt is limited to 2000 UTF-16 code units.
- An excerpt that depends only on a conditional heading or an introducing paragraph is scored with that section context stated first.
  A list item is scored together with the items nested under it, and a numbered list as one procedure.
  A paragraph ending in a colon, period or exclamation mark is scored together with the one code block after it.
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
