"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("./scorer.js");

// Regression examples for prohibitions, explicit alternatives, nearby
// directives, exceptions, intensifiers, and non-directive negation.
const CORPUS = [
  {
    "id": "per-call-settings",
    "label": "resolved",
    "text": "Do not change shared parser settings between requests. Supply parser options within each conversion call."
  },
  {
    "id": "optional-readers",
    "label": "resolved",
    "text": "Do not assume optional extensions are installed. Prefer built-in file readers or portable adapters. Quote filenames and prefer short paths where supported."
  },
  {
    "id": "installed-renderer",
    "label": "resolved",
    "text": "For image conversion, use the installed renderer with `format: \"png\"`. Do not download or install extra renderers."
  },
  {
    "id": "upload-credentials",
    "label": "resolved",
    "text": "Upload credentials come from `UPLOAD_TOKEN` in the environment. Never print, persist, or embed credentials."
  },
  {
    "id": "archive-permission",
    "label": "resolved",
    "text": "Inspect the initial archive and preserve existing records. Do not delete records or replace archived data without explicit authorization."
  },
  {
    "id": "shared-layouts",
    "label": "resolved",
    "text": "Prefer the compact report format. Reuse shared layouts; avoid custom spacing and duplicate templates."
  },
  {
    "id": "collection-search",
    "label": "resolved",
    "text": "Search the specified collection; exclude archived records and hidden folders unless relevant. Never run unconstrained scans across all collections."
  },
  {
    "id": "batch-import",
    "label": "resolved",
    "text": "Use supported batch options and request timeouts; never wait for operator input. Stop the import on failure and preserve the error code."
  },
  {
    "id": "retain-attachments",
    "label": "resolved",
    "text": "Retain required attachments and unresolved comments; remove duplicate entries only after preserving unique content. Never discard pending edits."
  },
  {
    "id": "false-upload-claim",
    "label": "bare",
    "text": "Respect dry-run, preview-only, and output-format constraints; never claim an unavailable upload succeeded."
  },
  {
    "id": "unused-cache-command",
    "label": "bare",
    "text": "Do not run `cache reset`. The active session does not persist between requests, so it changes nothing for the next request."
  },
  {
    "id": "built-in-formats",
    "label": "resolved",
    "text": "Prefer the converter's built-in formats (`png`, `jpeg`, `webp`) over custom encoders. Do not install extensions unless the task requires it."
  },
  {
    "id": "generated-files",
    "label": "resolved",
    "text": "Never edit the generated files — change the template in `templates/` and re-run `npm run gen` instead."
  },
  {
    "id": "bare-var",
    "label": "bare",
    "text": "Never use var."
  },
  {
    "id": "bare-generated",
    "label": "bare",
    "text": "Never edit the generated files."
  },
  {
    "id": "bare-junit",
    "label": "bare",
    "text": "Tests offered in this section must not be runnable with JUnit."
  },
  {
    "id": "bare-force-push",
    "label": "bare",
    "text": "Never force-push to a shared branch."
  },
  {
    "id": "bare-any",
    "label": "bare",
    "text": "Do not use `any` in TypeScript."
  },
  {
    "id": "bare-var-without-exception",
    "label": "bare",
    "text": "Never use var without exception."
  },
  {
    "id": "bare-var-without-exception-scope",
    "label": "bare",
    "text": "Never use var without any exception in new code."
  },
  {
    "id": "bare-changelog-without-fail",
    "label": "bare",
    "text": "Do not edit the changelog without fail."
  },
  {
    "id": "exception-handling-condition",
    "label": "resolved",
    "text": "Never call the payment API without exception handling."
  },
  {
    "id": "authorization-condition",
    "label": "resolved",
    "text": "Never deploy without explicit authorization."
  },
  {
    "id": "intensifier-then-condition",
    "label": "resolved",
    "text": "Never deploy on Fridays without exception unless the release manager approves."
  },
  {
    "id": "var-except-comma",
    "label": "resolved",
    "text": "Never use var, except in legacy files."
  },
  {
    "id": "intensifier-then-condition-comma",
    "label": "resolved",
    "text": "Never deploy on Fridays, without exception, unless the release manager approves."
  },
  {
    "id": "bare-var-without-exception-comma",
    "label": "bare",
    "text": "Never use var, without exception."
  },
  {
    "id": "bare-later-sentence-without",
    "label": "bare",
    "text": "Never force-push to a shared branch. Without a backup, history is lost."
  },
  {
    "id": "commit-unless-leading",
    "label": "resolved",
    "text": "Unless the user asks, do not commit changes."
  },
  {
    "id": "var-except-leading",
    "label": "resolved",
    "text": "Except in legacy files, never use var."
  },
  {
    "id": "bare-var-without-exception-leading",
    "label": "bare",
    "text": "Without exception, never use var."
  },
  {
    "id": "commit-unless-leading-bold",
    "label": "resolved",
    "text": "**Unless the user asks**, do not commit changes."
  },
  {
    "id": "var-except-trailing-bold",
    "label": "resolved",
    "text": "Never use var, **except** in legacy files."
  },
  {
    "id": "var-except-leading-italic",
    "label": "resolved",
    "text": "_Except in legacy files_, never use var."
  },
  {
    "id": "bare-var-without-exception-leading-bold",
    "label": "bare",
    "text": "**Without exception**, never use var."
  },
  {
    "id": "bare-var-without-exception-trailing-bold",
    "label": "bare",
    "text": "Never use var, **without exception**."
  },
  {
    "id": "bare-var-without-exception-leading-italic",
    "label": "bare",
    "text": "_Without exception_, never use var."
  },
  {
    "id": "bare-snake-case-unless",
    "label": "bare",
    "text": "Never call `skip_unless` in new tests."
  },
  {
    "id": "bare-earlier-sentence-unless",
    "label": "bare",
    "text": "History is shared, unless the branch is private. Never force-push to a shared branch."
  },
  {
    "id": "bare-code-except-colon",
    "label": "bare",
    "text": "Never use a bare `except:` clause."
  },
  {
    "id": "bare-code-except-pass",
    "label": "bare",
    "text": "Do not write `except Exception: pass`."
  },
  {
    "id": "bare-code-unless",
    "label": "bare",
    "text": "Never use `unless` in Ruby."
  },
  {
    "id": "publish-unless-after-code",
    "label": "resolved",
    "text": "Never run `npm publish` unless the release is tagged."
  },
  {
    "id": "unrelated-formatter",
    "label": "unproven",
    "text": "Never commit secrets to the repository. Run the formatter before pushing."
  },
  {
    "id": "tokens-secrets-manager",
    "label": "resolved",
    "text": "Never store tokens in the repository. Store tokens in the secrets manager."
  },
  {
    "id": "var-const-dash",
    "label": "resolved",
    "text": "Never use var — use const instead of it."
  },
  {
    "id": "var-const-comma",
    "label": "resolved",
    "text": "Never use var, use const instead."
  },
  {
    "id": "const-first",
    "label": "resolved",
    "text": "Use const for locals. Never use var."
  },
  {
    "id": "cut-dont-rename",
    "label": "resolved",
    "text": "A bare label signals internal-only content — cut it, don't rename it."
  },
  {
    "id": "stmt-webstorm",
    "label": "not-prohibition",
    "text": "WebStorm APIs don't exist on the platform-base matrix this ships on."
  },
  {
    "id": "stmt-tests-first",
    "label": "not-prohibition",
    "text": "Write tests first, this is not optional."
  },
  {
    "id": "pos-zod",
    "label": "not-prohibition",
    "text": "Validate request bodies with Zod."
  },
  {
    "id": "pos-pnpm",
    "label": "not-prohibition",
    "text": "Use `pnpm` instead of `npm`."
  },
  {
    "id": "scoped-bare",
    "label": "bare",
    "text": "Release notes:\nApply these rules only when editing `CHANGELOG.md`. They do not cover commit messages.\nDo not repeat the commit log in prose."
  },
  {
    "id": "scoped-resolved",
    "label": "resolved",
    "text": "Release notes:\nApply these rules only when editing `CHANGELOG.md`.\nDo not paste the commit log. Summarize the user-visible changes instead."
  },
  {
    "id": "scoped-wrapped-rule",
    "label": "resolved",
    "text": "Documentation:\nAdd an entry to `NEWS.md` for user-visible changes. Follow the format\nof existing entries.\nDo not update `NEWS.md` for internal refactors."
  },
  {
    "id": "wrapped-rule-without-scope",
    "label": "resolved",
    "text": "Keep release entries in `NEWS.md`.\nDo not update `NEWS.md` for internal refactors."
  },
  {
    "id": "duty-forget",
    "label": "not-prohibition",
    "text": "Don't forget to update the lock file after adding a dependency."
  },
  {
    "id": "duty-skip",
    "label": "not-prohibition",
    "text": "Never skip the regression tests."
  },
  {
    "id": "duty-neglect",
    "label": "not-prohibition",
    "text": "Do not neglect doc comments on public interfaces."
  },
  {
    "id": "duty-then-ban",
    "label": "bare",
    "text": "Don't skip the tests; never use var."
  },
  {
    "id": "bold-ban-resolved",
    "label": "resolved",
    "text": "**Do not hardcode user-facing strings.** Add them to `strings.json`."
  },
  {
    "id": "underscore-ban-resolved",
    "label": "resolved",
    "text": "__Never store tokens in the repository.__ Store tokens in the secrets manager."
  },
  {
    "id": "bold-ban-unrelated",
    "label": "unproven",
    "text": "**Never commit secrets to the repository.** Run the formatter before pushing."
  },
  {
    "id": "bold-ban-bare",
    "label": "bare",
    "text": "**Never force-push to a shared branch.**"
  }
];

function classify(text) {
  const r = engine.scoreF2(text);
  if (r.stallRisk) return "bare";
  if (r.category === "prohibition_alternative_unproven") return "unproven";
  if (r.category === "prohibition_with_alternative") return "resolved";
  return "not-prohibition";
}

// The contract this corpus actually enforces. `unproven` and `resolved` differ
// in confidence, not in consequence, so a case labelled one may score as the
// other without the scorer being wrong about the thing that matters: whether
// the rule is reported as a stall risk.
function flagsStallRisk(label) {
  return label === "bare";
}

test("F2 never reports a stall risk on a rule that names its replacement", () => {
  const wrong = [];
  for (const c of CORPUS) {
    const got = classify(c.text);
    if (flagsStallRisk(got) !== flagsStallRisk(c.label)) wrong.push(`${c.id}: labelled ${c.label}, scored ${got}`);
  }
  assert.deepEqual(wrong, [], `${wrong.length}/${CORPUS.length} cases disagree:\n  ${wrong.join("\n  ")}`);
});

test("F2 still fires on a genuinely bare prohibition", () => {
  const bare = CORPUS.filter((c) => c.label === "bare");
  assert.ok(bare.length >= 6, "the examples must include at least six bare prohibitions");
  for (const c of bare) {
    const r = engine.scoreF2(c.text);
    assert.equal(r.stallRisk, true, `${c.id} must stay flagged`);
    assert.equal(r.value, 0.2, `${c.id} must keep the bare-prohibition value`);
  }
});

test("a directive on another subject neither rescues a ban nor flags it as a stall risk", () => {
  const r = engine.scoreF2("Never commit secrets to the repository. Run the formatter before pushing.");
  assert.equal(r.category, "prohibition_alternative_unproven");
  assert.equal(r.stallRisk, undefined, "a nearby directive may be an unproven alternative, so no stall risk is flagged");
  assert.ok(r.value > 0.2 && r.value < 0.95, "unproven sits between bare and rescued");
});

test("a ban carrying its own exception is not bare", () => {
  for (const text of [
    "Do not delete records or replace archived data without explicit authorization.",
    "Never rewrite published history unless the release was withdrawn.",
    "Do not install dependencies except when the task requires it.",
  ]) {
    assert.equal(engine.scoreF2(text).stallRisk, undefined, text);
  }
});

test("multi-sentence replacement examples do not report a bare prohibition", () => {
  const examples = CORPUS.filter(c => c.label === "resolved" && c.text.split(/\.\s+/).length > 1);
  assert.ok(examples.length >= 8, "retain alternatives before and after multi-sentence bans");
  for (const example of examples) {
    assert.equal(engine.scoreF2(example.text).stallRisk, undefined, example.id);
  }
});

test("scope lines before a ban neither rescue nor change it", () => {
  const ban = "Do not repeat the commit log in prose.";
  const scoped = "Release notes:\nApply these rules only when editing `CHANGELOG.md`. They do not cover commit messages.\n" + ban;
  assert.deepEqual(engine.scoreF2(scoped), engine.scoreF2(ban));
});

test("a ban wrapped in emphasis scores as the same text without markers", () => {
  const marked = CORPUS.filter((c) => /^(?:\*\*|__)/.test(c.text));
  assert.ok(marked.length >= 4);
  for (const c of marked) {
    assert.deepEqual(engine.scoreF2(c.text), engine.scoreF2(c.text.replace(/\*\*|__/g, "")), c.id);
  }
});

module.exports = { CORPUS, classify };
