"use strict";

// Measures the language screen against eval/lang-set.js. Costs nothing: it is
// local word lists, so it can be run on every change.
//
//   node eval/lang-eval.js
//
// The two mistakes are counted apart. A leak wastes a request and hands back a
// meaningless verdict; a refusal tells someone to translate English. Refusals
// must stay at zero — a fix that trades one for the other is not a fix.

const { detectLanguage, languageTokens } = require("../lib/language.js");
const { FOREIGN, ENGLISH } = require("./lang-set.js");

const pick = (set, which) => set.filter((c) => c.set === which);

function run(name, foreign, english) {
  const leaks = [], refusals = [], misnamed = [];

  for (const c of foreign) {
    const got = detectLanguage(c.text);
    if (got.english) leaks.push({ ...c, tokens: languageTokens(c.text) });
    else if (got.code !== c.code) misnamed.push({ ...c, got: got.code });
  }
  for (const c of english) {
    const got = detectLanguage(c.text);
    if (!got.english) refusals.push({ ...c, got: got.code });
  }

  const n = foreign.length + english.length;
  console.log("\n### " + name + "   " + (n - leaks.length - refusals.length) + "/" + n);
  console.log("  leaks     " + leaks.length + "/" + foreign.length + "   foreign scored as English");
  console.log("  refusals  " + refusals.length + "/" + english.length + "   English handed back — the worse mistake");
  if (misnamed.length) {
    console.log("  misnamed  " + misnamed.length + "   caught, but the language named is wrong");
  }

  for (const c of leaks) {
    console.log("    LEAK      " + c.id.padEnd(16) + c.tokens.length + " prose tokens   " + c.text);
  }
  for (const c of refusals) {
    console.log("    REFUSED   " + c.id.padEnd(16) + "called " + c.got + "   " + c.text);
  }
  for (const c of misnamed) {
    console.log("    misnamed  " + c.id.padEnd(16) + "wanted " + c.code + ", got " + c.got);
  }
  return { leaks: leaks.length, refusals: refusals.length, misnamed: misnamed.length };
}

const w = run("working set", pick(FOREIGN, "work"), pick(ENGLISH, "work"));
const h = run("HELD OUT", pick(FOREIGN, "held"), pick(ENGLISH, "held"));

console.log("\nSUMMARY  HELD OUT  " + h.leaks + " leaks, " + h.refusals + " refusals" +
  "   |  working  " + w.leaks + " leaks, " + w.refusals + " refusals" +
  "   |  misnamed " + (w.misnamed + h.misnamed));
