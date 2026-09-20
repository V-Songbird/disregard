"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { scoreF1, scoreF7 } = require("../lib/scorer.js");
const { LABELLED, HELDOUT } = require("../eval/det-set.js");

// F1 and F7 measured against a labelled corpus for the first time, 2026-09-20.
// The corpus and the reasoning are in eval/det-set.js and
// docs/knowledge/f1-f7-deterministic-criteria.md. Two defects were found:
//
//   F1  a hedge anywhere in the text governed the whole rule, so "Do not try to
//       work around the sandbox" scored 0.20 hedged. Fixed: a hedge only governs
//       when it leads the ban rather than following it.
//   F7  the tool-name list matched marketing capitalization only, so a bullet
//       naming `prettier`, `zod` or `npm` scored 0.05 and raised "nothing here
//       is checkable". Fixed: a case-insensitive list of unambiguous tokens.
//
// Held-out went 16/18 to 17/18 on hedging and 16/18 to 18/18 on anchors. The
// numbers below are the measurement; change the scorer and they move, which is
// the point. Re-run with `node eval/det-eval.js` and report the held-out line.

// The two predicates lib/analyze.js uses to decide whether a finding fires.
const firesHedge = (text) => scoreF1(text).hedged === true;
const firesNoAnchor = (text) => scoreF7(text).concrete.length === 0;

const wrong = (set) => set.filter((c) =>
  firesHedge(c.text) !== c.hedge || firesNoAnchor(c.text) !== !c.anchor);

test("the working set is clean, both findings", () => {
  const bad = wrong(LABELLED).map((c) => c.id);
  assert.deepEqual(bad, [], "regressed on: " + bad.join(", "));
});

// `consider` doubles as a plain verb meaning "regard as" — "Consider all inputs
// untrusted" is a directive, not a suggestion. Left unfixed on purpose: the only
// evidence for it is a held-out case, and fitting the scorer to it would spend
// the one measurement that means anything. A fresh set is what should settle it.
const KNOWN = new Set(["untrusted-inputs"]);

test("held-out carries exactly one known false alarm", () => {
  const bad = wrong(HELDOUT).map((c) => c.id);
  assert.deepEqual(bad, [...KNOWN], "held-out moved: " + bad.join(", "));
});

test("no real hedge is lost to the prohibition fix", () => {
  for (const c of [...LABELLED, ...HELDOUT].filter((x) => x.hedge)) {
    assert.equal(firesHedge(c.text), true, c.id + " is hedged and must be flagged");
  }
});

// The two bullets that drove each fix, kept as named cases so a future change
// has to argue with them rather than with a count.
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
