"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { scoreF1, scoreF7 } = require("../lib/scorer.js");
const { LABELLED, HELDOUT, HELDOUT2 } = require("../eval/det-set.js");

// F1 and F7 measured against labelled corpora, 2026-09-20. The sets and the
// reasoning are in eval/det-set.js and
// docs/knowledge/f1-f7-deterministic-criteria.md. Three defects were found:
//
//   F1  a hedge anywhere in the text governed the whole rule, so "Do not try to
//       work around the sandbox" scored 0.20 hedged. Fixed: a hedge only governs
//       when it leads the ban rather than following it.
//   F7  the tool-name list matched marketing capitalization only, so a bullet
//       naming `prettier`, `zod` or `npm` scored 0.05 and raised "nothing here
//       is checkable". Fixed: a case-insensitive list of unambiguous tokens.
//   F1  `consider` counted as a suggestion however it was used, so "Consider all
//       inputs untrusted" scored 0.30 hedged. Fixed: it is a suggestion only
//       before `whether`, `if`, or a gerund of a verb the file knows.
//
// All three sets are clean now. Re-run with `node eval/det-eval.js` and report
// HELD-OUT 2 — the first held-out set is spent, because the `consider` fix was
// diagnosed on a case inside it.

// The two predicates lib/analyze.js uses to decide whether a finding fires.
const firesHedge = (text) => scoreF1(text).hedged === true;
const firesNoAnchor = (text) => scoreF7(text).concrete.length === 0;

const wrong = (set) => set.filter((c) =>
  firesHedge(c.text) !== c.hedge || firesNoAnchor(c.text) !== !c.anchor).map((c) => c.id);

for (const [name, set] of [["working", LABELLED], ["first held-out", HELDOUT], ["held-out 2", HELDOUT2]]) {
  test("the " + name + " set is clean, both findings", () => {
    const bad = wrong(set);
    assert.deepEqual(bad, [], "regressed on: " + bad.join(", "));
  });
}

test("no real hedge is lost to either F1 fix", () => {
  for (const c of [...LABELLED, ...HELDOUT, ...HELDOUT2].filter((x) => x.hedge)) {
    assert.equal(firesHedge(c.text), true, c.id + " is hedged and must be flagged");
  }
});

// The bullets that drove each fix, kept as named cases so a future change has
// to argue with them rather than with a count.

test("a ban that contains a hedge word is still a ban", () => {
  assert.equal(scoreF1("Do not try to work around the sandbox.").hedged, undefined);
  assert.equal(scoreF1("Never prefer a mock over the real database.").hedged, undefined);
  assert.equal(scoreF1("Avoid `any`; prefer `unknown` when the type is open.").hedged, undefined);
});

test("a hedge ahead of the ban still governs", () => {
  const f1 = scoreF1("Where possible, do not use `any`.");
  assert.equal(f1.hedged, true);
  assert.equal(f1.matchedVerb, "where possible");
});

test("tool names count however the file capitalises them", () => {
  for (const text of [
    "Run prettier on modified files before committing.",
    "All handlers must validate input with zod.",
    "Use npm, not yarn.",
    "Run `eslint --fix` before opening a pull request.",
  ]) {
    assert.equal(firesNoAnchor(text), false, text);
  }
});

// The reason the tool list is not simply case-insensitive over the old one.
test("ordinary English is not an anchor", () => {
  for (const text of [
    "Move it to the next step.",
    "Read the rest of the file before editing.",
  ]) {
    assert.equal(firesNoAnchor(text), true, text);
  }
});

test("`consider` before a gerund or a question is a suggestion", () => {
  for (const text of [
    "Consider using a hook instead.",
    "Consider adding a regression test.",
    "Consider refactoring the module.",
    "Consider caching the result.",
    "Consider whether to split the file.",
    "Consider if the lock file changed.",
  ]) {
    assert.equal(firesHedge(text), true, text);
  }
});

test("`consider` meaning regard-as is a directive", () => {
  for (const text of [
    "Consider all inputs untrusted at the handler boundary.",
    "Consider the public API frozen after a minor release.",
    "Consider the build broken until the pipeline is green.",
  ]) {
    assert.equal(firesHedge(text), false, text);
    assert.equal(scoreF1(text).value, 0.85, text);
  }
});

// Why the gerund test checks the stem against ALL_VERBS instead of matching
// /\w+ing/: these three end in -ing and none of them is a verb.
test("an -ing word that is not a gerund does not rescue the suggestion", () => {
  for (const text of [
    "Consider everything in `/tmp` disposable.",
    "Consider anything under `build/` generated.",
    "Consider the string frozen.",
  ]) {
    assert.equal(firesHedge(text), false, text);
  }
});

// The honest limit of the gerund test. "Consider logging disabled" is
// regard-as, but `logging` is a real gerund of a verb this file knows, so the
// stem check cannot see the difference — only the complement that follows can,
// and that needs a parser. Left as is: the construction is ambiguous in English
// too, and no corpus case depends on it. Pinned so it cannot quietly spread.
test("a gerund used as a noun is the one construction still misread", () => {
  assert.equal(firesHedge("Consider logging disabled in production."), true);
});
