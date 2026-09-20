# Readback

Scores one rule from an agent instruction file and reports how that line reads
to the agent that has to follow it. One line at a time, English only, 2000
characters max. The full picture is in [README.md](README.md).

## Commands

| What | Command |
| --- | --- |
| Check | `node --test --test-reporter=dot` |
| Local server | `npx --yes wrangler dev` |
| Deploy | `npx --yes wrangler deploy` |

The check is the whole check: 47 tests, no key, no cost, three lines of output.
Drop `--test-reporter=dot` to see every test name and the `# pass 47` summary.
There is no `package.json` and no build step, which is deliberate. The Node
version is pinned in [.nvmrc](.nvmrc).

## Where things live

[lib/](lib/) holds the scoring and its tests, [api/score.js](api/score.js) is
the only server-side piece, [worker.js](worker.js) is the Cloudflare entry
point, [public/](public/) is the page, [eval/](eval/) the labelled sets and
[docs/](docs/) the reasoning behind every threshold. The per-file table is in
[README.md](README.md#where-things-live).

Tests sit beside what they test. [lib/analyze.test.js](lib/analyze.test.js)
covers [lib/analyze.js](lib/analyze.js), and the two `scorer.*.test.js` files
carry the labelled corpora for [lib/scorer.js](lib/scorer.js).

## Pitfalls

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
  not the tuned one.** Each document under [docs/knowledge/](docs/knowledge/)
  carries a "rules for changing this" section naming what is spent.
- **Four held-out halves are already spent.** A fix was diagnosed from a case
  inside them, so they are regression guards now. Build a fresh set rather than
  promoting a guard back to a measurement.
- **Every eval harness except `det-eval.js` spends real money per run.** Read
  [eval/README.md](eval/README.md) before running one.
- **Thresholds live in [lib/analyze.js](lib/analyze.js)** beside the document
  that measured them. Change the document in the same commit.
