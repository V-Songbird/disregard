"use strict";

// Measures the two deterministic findings against eval/det-set.js. Costs
// nothing: F1 and F7 are local word lists, so unlike the Jev harnesses here
// this one can be run on every change.
//
//   node eval/det-eval.js
//
// Report HELD-OUT 2. The first held-out set is spent — the `consider` fix of
// 2026-09-20 was diagnosed on a case inside it — so it is a regression guard
// now, not a measurement.

const { scoreF1, scoreF7 } = require("../lib/scorer.js");
const { LABELLED, HELDOUT, HELDOUT2 } = require("./det-set.js");

// The two predicates lib/analyze.js uses to decide whether a finding fires.
const firesHedge = (text) => scoreF1(text).hedged === true;
const firesNoAnchor = (text) => scoreF7(text).concrete.length === 0;

function run(name, set) {
  const rows = set.map((c) => {
    const f1 = scoreF1(c.text);
    const f7 = scoreF7(c.text);
    return {
      id: c.id,
      hedgeWant: c.hedge, hedgeGot: f1.hedged === true,
      anchorWant: c.anchor, anchorGot: f7.concrete.length > 0,
      f1: f1.value, verb: f1.matchedVerb, f7: f7.value, markers: f7.concrete,
    };
  });

  const h = {
    fp: rows.filter((r) => !r.hedgeWant && r.hedgeGot).length,
    fn: rows.filter((r) => r.hedgeWant && !r.hedgeGot).length,
    ok: rows.filter((r) => r.hedgeWant === r.hedgeGot).length,
  };
  // hedge_dominance fires on hedgeGot; no_concrete_anchor fires on !anchorGot,
  // so an anchor the scorer misses is a false ALARM on screen.
  const a = {
    fp: rows.filter((r) => r.anchorWant && !r.anchorGot).length,
    fn: rows.filter((r) => !r.anchorWant && r.anchorGot).length,
    ok: rows.filter((r) => r.anchorWant === r.anchorGot).length,
  };

  console.log("\n### " + name + "   " + rows.length + " rules");
  console.log("  hedge_dominance      " + h.ok + "/" + rows.length +
    "   false alarms " + h.fp + "   missed " + h.fn);
  console.log("  no_concrete_anchor   " + a.ok + "/" + rows.length +
    "   false alarms " + a.fp + "   missed " + a.fn);

  for (const r of rows.filter((x) => x.hedgeWant !== x.hedgeGot || x.anchorWant !== x.anchorGot)) {
    const parts = [];
    if (r.hedgeWant !== r.hedgeGot) {
      parts.push("hedge want " + r.hedgeWant + " got " + r.hedgeGot +
        " (F1 " + r.f1 + " via " + r.verb + ")");
    }
    if (r.anchorWant !== r.anchorGot) {
      parts.push("anchor want " + r.anchorWant + " got " + r.anchorGot +
        " (F7 " + r.f7 + " markers " + JSON.stringify(r.markers) + ")");
    }
    console.log("    " + r.id.padEnd(24) + parts.join("  |  "));
  }
  return { rows, h, a };
}

const l = run("LABELLED   working set", LABELLED);
const o = run("HELD-OUT   spent on the consider fix, now a regression guard", HELDOUT);
const o2 = run("HELD-OUT 2   the live held-out set", HELDOUT2);

const line = (name, r, n) => name + " " + r.h.ok + "/" + n + " and " + r.a.ok + "/" + n;
console.log("\nSUMMARY  " + line("HELD-OUT 2", o2, HELDOUT2.length) +
  "  |  " + line("first held-out", o, HELDOUT.length) +
  "  |  " + line("working", l, LABELLED.length));

module.exports = { firesHedge, firesNoAnchor };
