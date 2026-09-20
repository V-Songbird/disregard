"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../lib/scorer.js");

// A labelled corpus for F2, built after the scorer was measured against real
// instruction files rather than against the single-clause rules the earlier
// fixtures used. On a live `CLAUDE.md` of 71 lines, `stallRisk` fired on 10 of
// 37 rule-like bullets and 9 of those 10 named their replacement plainly — a
// ~90% false-positive rate on the one finding that caps a rule's grade at
// STALL_RISK_CAP.
//
// The cause is structural, not a missing pattern. Real instruction bullets carry
// several sentences, and the replacement usually sits in a neighbouring one
// whose words do not overlap the ban:
//
//     "…use installed Edge with `channel: \"msedge\"`. Do not probe or install
//      bundled Chromium."
//
// Knowing that Edge replaces Chromium is world knowledge. No lexical test
// reaches it, and SCOPE.md forbids a model deciding a mechanical fact — so the
// fix is not a better guess. It is to stop asserting the grade-capping verdict
// on a judgment the script cannot make, and to say so instead.
//
// LABELS
//   "resolved"  — a replacement or escape hatch is present. MUST NOT stallRisk.
//   "bare"      — nothing is named to do instead, anywhere in the bullet.
//                 MUST stallRisk: this is the case that genuinely stalls a run.
//   "unproven"  — a positive directive is present but relatedness to the ban is
//                 not lexically establishable. MUST NOT stallRisk, MUST NOT
//                 reach the 0.95 band either.
//
// Every `real` case is quoted verbatim from a working instruction file. The
// label is a human reading of whether an agent blocked by the ban would know
// how to proceed; the rationale records that reading so a later change can
// argue with it.

const CORPUS = [
  // -- real bullets, global CLAUDE.md -------------------------------------
  {
    id: "fnm-env",
    real: true,
    label: "resolved",
    rationale: "The next sentence says what to do instead of activating a shell.",
    text: "Do not run `fnm env` or rely on shell activation persisting between calls. Supply environment settings within the invocation that needs them.",
  },
  {
    id: "unix-utils",
    real: true,
    label: "resolved",
    rationale: "'Prefer available agent tools or native PowerShell commands' is the replacement, stated as a preference.",
    text: "Do not assume Unix utilities are installed. Prefer available agent tools or native PowerShell commands. Quote paths and prefer forward slashes where supported.",
  },
  {
    id: "playwright-edge",
    real: true,
    label: "resolved",
    rationale: "The replacement browser precedes the ban; Edge is what to launch instead of Chromium.",
    text: "For Playwright Chromium-family checks, use installed Edge with `channel: \"msedge\"`. Do not probe or install bundled Chromium.",
  },
  {
    id: "typesafe-key",
    real: true,
    label: "resolved",
    rationale: "Where the credential comes from is named, so an agent needing it never stalls on the ban.",
    text: "TypeSafe/Jev credentials come from `TYPESAFE_API_KEY` in the environment. Never print, persist, or embed secrets.",
  },
  {
    id: "destructive-git",
    real: true,
    label: "resolved",
    rationale: "The ban carries its own exception: obtain explicit authorization.",
    text: "Inspect the initial workspace state and preserve existing changes. Do not discard work or run destructive Git operations without explicit authorization.",
  },
  {
    id: "smallest-solution",
    real: true,
    label: "resolved",
    rationale: "'Reuse project patterns' is the alternative to the refactors being avoided.",
    text: "Prefer the smallest coherent solution. Reuse project patterns; avoid unrelated refactors and speculative abstractions.",
  },
  {
    id: "targeted-search",
    real: true,
    label: "resolved",
    rationale: "'Search targeted directories' is the replacement for the unconstrained search being banned.",
    text: "Search targeted directories; exclude dependencies, generated files, lockfiles, and minified bundles unless relevant. Never run unconstrained recursive searches from home or filesystem roots.",
  },
  {
    id: "non-interactive",
    real: true,
    label: "resolved",
    rationale: "'Use supported non-interactive options and timeouts' is in the same clause group as the ban on waiting.",
    text: "Use supported non-interactive options and timeouts; never wait for input or credentials. Stop dependent work on failure and preserve its exit status.",
  },
  {
    id: "retain-user-work",
    real: true,
    label: "resolved",
    rationale: "'Retain requested reports' and 'only after preserving unique content' state the required behaviour the ban protects.",
    text: "Retain requested reports, required evidence, and unresolved blockers; remove redundant notes only after preserving unique content. Never discard uncommitted user work.",
  },
  {
    id: "false-persistence-claim",
    real: true,
    label: "bare",
    rationale: "Nothing says what to report when persistence was unavailable. It does not stall a run — you simply omit the false claim — but the ban names no replacement, which is what F2 measures. The rule would read better as 'say plainly that it failed'.",
    text: "Respect read-only, chat-only, and exact-output constraints; never claim unavailable persistence succeeded.",
  },

  // -- real bullets, other instruction files -------------------------------
  {
    id: "no-fnm-env-short",
    real: true,
    label: "bare",
    rationale: "Re-read: it bans `fnm env` and explains why, but names no replacement. An agent that needs the variables set is told nothing. A real finding, and the rule should say to supply them inline.",
    text: "Do not run `fnm env`. Shell state does not persist between tool calls, so it changes nothing for the next command.",
  },
  {
    id: "no-deps",
    real: true,
    label: "resolved",
    rationale: "'Prefer a project's own scripts' names what to use instead of ad-hoc commands.",
    text: "Prefer a project's own scripts (`package.json`, `Makefile`, `justfile`) over ad-hoc commands. Do not install or update dependencies unless the task requires it.",
  },
  {
    id: "generated-files",
    real: true,
    label: "resolved",
    rationale: "The canonical worked example from the rubric documentation.",
    text: "Never edit the generated files — change the template in `templates/` and re-run `npm run gen` instead.",
  },

  // -- genuine bare prohibitions, which must keep firing --------------------
  { id: "bare-var", label: "bare", rationale: "Nothing named to use instead.", text: "Never use var." },
  { id: "bare-generated", label: "bare", rationale: "The canonical failing example from the documentation.", text: "Never edit the generated files." },
  { id: "bare-junit", label: "bare", rationale: "A 'must not' with no replacement runner named.", text: "Tests offered in this section must not be runnable with JUnit." },
  { id: "bare-force-push", label: "bare", rationale: "No escape hatch and no alternative branch strategy.", text: "Never force-push to a shared branch." },
  { id: "bare-any", label: "bare", rationale: "Bans the only obvious escape from a typing problem with nothing in its place.", text: "Do not use `any` in TypeScript." },

  // -- prohibition plus a directive on a different subject ------------------
  {
    id: "unrelated-formatter",
    label: "unproven",
    rationale: "Two duties concatenated. The directive does not replace the ban, but a directive IS present, so this is not the stall case either.",
    text: "Never commit secrets to the repository. Run the formatter before pushing.",
  },

  // -- prohibition with a same-token replacement ---------------------------
  { id: "tokens-secrets-manager", label: "resolved", rationale: "Same subject, replacement named.", text: "Never store tokens in the repository. Store tokens in the secrets manager." },
  { id: "var-const-dash", label: "resolved", rationale: "Explicit 'instead'.", text: "Never use var — use const instead of it." },
  { id: "var-const-comma", label: "resolved", rationale: "Explicit 'instead'.", text: "Never use var, use const instead." },
  { id: "const-first", label: "resolved", rationale: "Replacement precedes the ban, same subject.", text: "Use const for locals. Never use var." },
  { id: "cut-dont-rename", label: "resolved", rationale: "'cut it' is the action to take in place of renaming.", text: "A bare label signals internal-only content — cut it, don't rename it." },

  // -- not prohibitions at all ---------------------------------------------
  { id: "stmt-webstorm", label: "not-prohibition", rationale: "A statement of fact; the negation is not directive.", text: "WebStorm APIs don't exist on the platform-base matrix this ships on." },
  { id: "stmt-tests-first", label: "not-prohibition", rationale: "Predicate negation, not a ban.", text: "Write tests first, this is not optional." },
  { id: "pos-zod", label: "not-prohibition", rationale: "Plain positive imperative.", text: "Validate request bodies with Zod." },
  { id: "pos-pnpm", label: "not-prohibition", rationale: "Positive with an explicit alternative.", text: "Use `pnpm` instead of `npm`." },
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
function stalls(label) {
  return label === "bare";
}

test("F2 never reports a stall risk on a rule that names its replacement", () => {
  const wrong = [];
  for (const c of CORPUS) {
    const got = classify(c.text);
    if (stalls(got) !== stalls(c.label)) wrong.push(`${c.id}: labelled ${c.label}, scored ${got} — ${c.rationale}`);
  }
  assert.deepEqual(wrong, [], `${wrong.length}/${CORPUS.length} cases disagree:\n  ${wrong.join("\n  ")}`);
});

test("F2 still fires on a genuinely bare prohibition", () => {
  const bare = CORPUS.filter((c) => c.label === "bare");
  assert.ok(bare.length >= 6, "the corpus must keep real positives in it");
  for (const c of bare) {
    const r = engine.scoreF2(c.text);
    assert.equal(r.stallRisk, true, `${c.id} must stay flagged: ${c.rationale}`);
    assert.equal(r.value, 0.2, `${c.id} must keep the bare-prohibition value`);
  }
});

test("a directive on another subject neither rescues a ban nor proves a stall", () => {
  const r = engine.scoreF2("Never commit secrets to the repository. Run the formatter before pushing.");
  assert.equal(r.category, "prohibition_alternative_unproven");
  assert.equal(r.stallRisk, undefined, "a nearby directive means the run has somewhere to go");
  assert.ok(r.value > 0.2 && r.value < 0.95, "unproven sits between bare and rescued");
});

test("a ban carrying its own exception is not bare", () => {
  for (const text of [
    "Do not discard work or run destructive Git operations without explicit authorization.",
    "Never rewrite published history unless the release was withdrawn.",
    "Do not install dependencies except when the task requires it.",
  ]) {
    assert.equal(engine.scoreF2(text).stallRisk, undefined, text);
  }
});

test("the real-file false-positive rate is zero", () => {
  const real = CORPUS.filter((c) => c.real);
  const falsePositives = real.filter((c) => c.label !== "bare" && engine.scoreF2(c.text).stallRisk === true);
  assert.deepEqual(falsePositives.map((c) => c.id), [],
    "every one of these is quoted verbatim from a working instruction file");
});

module.exports = { CORPUS, classify };
