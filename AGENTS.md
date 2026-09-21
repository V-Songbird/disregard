# Disregard

Scores one rule from an agent instruction file and reports how that line reads
to the agent that has to follow it. One line at a time, English only, 2000
characters max. The full picture is in [README.md](README.md).

## Commands

| What | Command |
| --- | --- |
| Check | `node --test --test-reporter=dot` |
| Check one file | `node --test --test-reporter=dot lib/analyze.test.js` |
| Local server | `npx --yes wrangler dev` |
| Deploy | `npx --yes wrangler deploy` |

The check is the whole check: 57 tests, no key, no cost, three lines of output.
Drop `--test-reporter=dot` to see every test name and the `# pass 57` summary.
Ten of those are the research harness in [research/](research/), which runs
here so it cannot rot unnoticed.
There is no `package.json` and no build step, which is deliberate. The Node
version is pinned in [.nvmrc](.nvmrc).

## Where things live

[lib/](lib/) holds the scoring and its tests, [api/score.js](api/score.js) is
the only server-side piece, [worker.js](worker.js) is the Cloudflare entry
point, [public/](public/) is the page, [eval/](eval/) the labelled sets,
[research/](research/) the harness and rubric the thresholds came from, and
[docs/](docs/) the reasoning behind every threshold. The per-file table is in
[README.md](README.md#where-things-live).

Tests sit beside what they test. [lib/analyze.test.js](lib/analyze.test.js)
covers [lib/analyze.js](lib/analyze.js), and the two `scorer.*.test.js` files
carry the labelled corpora for [lib/scorer.js](lib/scorer.js).

## Pitfalls

- **`AGENTS.md` is the only file that holds instructions, for every host.**
  [CLAUDE.md](CLAUDE.md) is one line, `@AGENTS.md`, and stays that way. A second
  line there, a `GEMINI.md` or a rules folder makes Codex, Antigravity and
  Claude Code read different things. The reasons are in
  [docs/knowledge/agent-host-compatibility.md](docs/knowledge/agent-host-compatibility.md).
- **Everything is CommonJS except [worker.js](worker.js).** A new file under
  `lib/` or `api/` writes `module.exports`, not `export`. No `package.json`
  declares a `"type"`, so nothing else will tell you. Wrangler's bundler joins
  the two without a build step of our own.
- **`worker.js` uses `export default` because Cloudflare Workers require it.**
  It is the shape of the platform, not a style slip.
- **The handler touches no Node built-in.** It is `Request` to `Response` only,
  so it runs unchanged on Netlify, Vercel, Deno or Node 22. Keep it that way.
- **`TYPESAFE_API_KEY` never goes in [wrangler.jsonc](wrangler.jsonc)**, which
  is committed. A local run reads `.dev.vars`, production reads a Workers
  secret. Start from [.dev.vars.example](.dev.vars.example).
- **Change a criteria string, re-run its set, and report the held-out number,
  not the tuned one.** Each criteria document under
  [docs/knowledge/](docs/knowledge/) carries a "rules for changing this"
  section, and those with a spent set name it there.
- **Five held-out halves are already spent.** A fix was diagnosed from a case
  inside them, so they are regression guards now. Build a fresh set rather than
  promoting a guard back to a measurement.
- **Four of the six eval harnesses spend real money per run.** Only
  `det-eval.js` and `lang-eval.js` are free. Read
  [eval/README.md](eval/README.md) before running one.
- **`research/rule-lab` spends real money too, and more of it.** Each cell is a
  live `claude -p` session on the contributor's own login. The whole existing
  corpus cost $111.61. Check the cell count with `--dry-run` and smoke one cell
  with `--limit 1` before launching a run.
- **Thresholds live in [lib/analyze.js](lib/analyze.js)** beside the document
  that measured them, named in the comment above each measured one. The language
  screen's `MIN_TOKENS` and `MIN_HITS` are the exception, in
  [lib/language.js](lib/language.js).
