"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { scoreF1, scoreF7 } = require("./scorer.js");
const EXAMPLES = require("./fixtures/deterministic.json");

// The two lexical predicates lib/analyze.js uses. no_concrete_anchor also needs
// the model to judge the text too vague to check.
const firesHedge = (text) => scoreF1(text).hedged === true;
const firesNoAnchor = (text) => scoreF7(text).concrete.length === 0;

const wrong = (set) => set.filter((c) =>
  firesHedge(c.text) !== c.hedge || firesNoAnchor(c.text) !== !c.anchor).map((c) => c.id);

for (const [name, set] of [
  ["hedged instructions", EXAMPLES.filter(c => c.hedge)],
  ["directives with anchors", EXAMPLES.filter(c => !c.hedge && c.anchor)],
  ["directives without anchors", EXAMPLES.filter(c => !c.hedge && !c.anchor)],
]) {
  test(name + " match both expected findings", () => {
    const bad = wrong(set);
    assert.deepEqual(bad, [], "regressed on: " + bad.join(", "));
  });
}

test("hedged regression examples are flagged", () => {
  for (const c of EXAMPLES.filter((x) => x.hedge)) {
    assert.equal(firesHedge(c.text), true, c.id + " is hedged and must be flagged");
  }
});

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

test("ordinary English is not an anchor", () => {
  for (const text of [
    "Move it to the next step.",
    "Read the rest of the file before editing.",
  ]) {
    assert.equal(firesNoAnchor(text), true, text);
  }
});

test("Unicode filenames retain complete original evidence in bare names and link targets", () => {
  for (const filename of ["中文.md", "данные.json", "café.ts", "cafe\u0301.ts", "数据２.yaml", "保存_値.js"]) {
    for (const text of ["Read " + filename + " before editing the configuration.",
      "Read the [setup guide](docs/" + filename + ") before editing the configuration."]) {
      const result = scoreF7(text);
      assert.deepEqual(result.concrete, [filename], text);
      assert.equal(result.value, 0.8, text);
    }
  }
});

test("Unicode prose, extension suffixes and ordinary idioms do not become filename anchors", () => {
  for (const text of [
    "Read the 中文 guide before editing.",
    "Keep данные and café labels legible.",
    "Read 中文.pdf before editing.",
    "Read данные.jsonextra before editing.",
    "Read 中文.md指南 before editing.",
    "Read café.ts\u0301 before editing.",
    "Read the guide at https://example.com/中文 before editing.",
    "Move it to the next step.",
    "Read the rest of the file before editing.",
    "Keep todo comments clear.",
  ]) assert.deepEqual(scoreF7(text).concrete, [], text);
});

test("font sizes and pixel dimensions supply exact numeric anchor evidence", () => {
  const text = "Minimum body size: 7.5pt. Current body is 8.4pt at 10.5pt leading. Reduce content before reducing size.";
  assert.deepEqual(scoreF7(text).concrete, ["7.5pt", "8.4pt", "10.5pt"]);
  for (const [instruction, marker] of [
    ["Set the font size to 16px.", "16px"],
    ["Keep the spacing at 0.5em.", "0.5em"],
    ["Use 1.25rem for the body size.", "1.25rem"],
    ["Move the element by -2px.", "-2px"],
    ["Use .5rem for the gap.", ".5rem"],
    ["Apply an offset of +.25em.", "+.25em"],
    ["Draw a border of 1 pixel.", "1 pixel"],
    ["Leave 12 pixels around the icon.", "12 pixels"],
    ["Set the stroke to 1 point.", "1 point"],
    ["Set the type size to 9.5 points.", "9.5 points"],
    ["Keep the width under 320px.", "under 320px"],
    ["Use at least 10.5pt for captions.", "at least 10.5pt"],
    ["Keep the gap no more than 2 rem.", "no more than 2 rem"],
    ["Use less than 1.5 em for spacing.", "less than 1.5 em"],
  ]) assert.deepEqual(scoreF7(instruction).concrete, [marker], instruction);
});

test("length unit words and identifier or version fragments are not numeric anchors", () => {
  for (const text of [
    "Preserve x7.5ptValue unchanged.",
    "Preserve x7.5pt unchanged.",
    "Preserve size_16px unchanged.",
    "Preserve size-16px unchanged.",
    "Preserve v1.2.3rem unchanged.",
    "Preserve 1.2.3pt unchanged.",
    "Preserve 7.5ptValue unchanged.",
    "Preserve 7.5pt.value unchanged.",
    "Preserve 16pixelsWide unchanged.",
    "Preserve v.5rem unchanged.",
    "Preserve 12notAUnit unchanged.",
    "Describe dimensions in px, pt, em or rem.",
    "Use pixels and points for dimensions.",
  ]) assert.deepEqual(scoreF7(text).concrete, [], text);
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

// The lexical gerund check cannot resolve this sentence's complement.
test("a gerund used as a noun retains its documented lexical ambiguity", () => {
  assert.equal(firesHedge("Consider logging disabled in production."), true);
});
