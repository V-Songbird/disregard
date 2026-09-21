# Contributing

The check is one command and needs no key, no install and no network:

```bash
node --test
```

57 tests. If they pass, your change did not break anything that is measured.
There is no `package.json` and no build step, which is deliberate. The Node
version is in [.nvmrc](.nvmrc).

## What is most worth contributing

**A model column.** This is the real gap. Every structural finding in
[research/rule-lab](research/rule-lab) was measured on a small-tier model in
2026, with spot checks on one mid-tier model. Every other model is unmeasured,
and the honest reading of the existing data is that results differ by tier — so
a missing column is a genuine hole, not a formality.

Replicating one factor costs $3 to $12. A full column is about $41. Cells run
against your own logged-in Claude Code, so you spend your own credits.

```bash
cd research/rule-lab
node harness.js list
node harness.js run --exp exp-001-framing --dry-run     # cell matrix, spends nothing
node harness.js run --exp exp-001-framing --limit 1     # one live cell
node harness.js run --exp exp-007-position --model <m> --resume
node harness.js analyze --exp exp-007-position
```

**Run `--dry-run` first, every time.** It prints the cell count. Then smoke one
cell with `--limit 1`. A full experiment is hundreds of real sessions and there
is no undo on money already spent.

**A reviewed translation.** The six interface locales in
[public/i18n.js](public/i18n.js) were machine-translated and the page says so on
every one of them. A native speaker's pass would let a locale drop that line.

## The floor a measurement has to clear

These are the rules the existing corpus was held to, and a contribution is held
to the same ones. They are not style preferences; each exists because breaking
it produced a result that did not replicate.

1. **Vary one property.** Every other word stays as close to identical as
   possible between arms.
2. **At least two distinct rule intents.** A finding that does not replicate
   across intents is an open question, not a finding.
3. **Anti-default tasks.** Design the task so the model breaks the rule when no
   rule is present. The analysis flags any intent whose baseline compliance is
   0.5 or higher and treats it as uninformative, because it is.
4. **Every absence-grader needs a validity gate.** Otherwise "did nothing at
   all" grades as compliant.
5. **Report the held-out number.** If you tuned against a set, that set is spent
   and its number is not evidence any more.

## Changing what the app scores

Each threshold in [lib/](lib) has a document in [docs/knowledge/](docs/knowledge)
that measured it, and each of those carries a section naming what a change
costs. Change the number and the document in the same commit, re-run the set,
and report the held-out result rather than the tuned one.

**Four held-out halves are already spent.** They were used to diagnose fixes, so
they are regression guards now, not measurements. Build a fresh set rather than
promoting a guard back into evidence.

**The labelled corpora are data, not prose.** Editing the text of a case in
[eval/](eval) changes the measurement that case belongs to. If a case is wrong,
say so in the pull request rather than quietly relabelling it.

## Things that will trip you

- **Everything is CommonJS except [worker.js](worker.js)**, which uses
  `export default` because Cloudflare Workers require it. A new file under
  `lib/` or `api/` writes `module.exports`. No `package.json` declares a
  `"type"`, so nothing else will tell you.
- **The handler touches no Node built-in.** It is `Request` to `Response` only,
  so it runs unchanged on other hosts. Keep it that way.
- **`TYPESAFE_API_KEY` never goes in a committed file.** Local runs read
  `.dev.vars`; start from [.dev.vars.example](.dev.vars.example).
- **Every eval harness except `det-eval.js` spends real money per run.** Read
  [eval/README.md](eval/README.md) first.

## Reporting a problem

A wrong verdict is worth reporting even without a fix. Include the exact rule
text you pasted and what came back. If the rule is one you would rather not
publish, describe its shape instead.

Security issues go through [SECURITY.md](SECURITY.md), not the issue tracker.
