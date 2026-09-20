"use strict";

// Measures the two deterministic findings against eval/det-set.js. Costs
// nothing: F1 and F7 are local word lists, so unlike the Jev harnesses here
// this one can be run on every change.
//
//   node eval/det-eval.js
//
// Report the HELD-OUT line. Fitting the working set is easy and means little.

const { scoreF1, scoreF7 } = require("../lib/scorer.js");
const { LABELLED, HELDOUT } = require("./det-set.js");

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

  const tally = (want, got) => ({
    fp: rows.filter((r) => !r[want] && r[got]).length,
    fn: rows.filter((r) => r[want] && !r[got]).length,
    ok: rows.filter((r) => r[want] === r[got]).length,
  });
  // hedge_dominance fires on hedgeGot; no_concrete_anchor fires on !anchorGot,
  // so an anchor the scorer misses is a false ALARM on screen.
  const h = tally("hedgeWant", "hedgeGot");
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

  const bad = rows.filter((r) => r.hedgeWant !== r.hedgeGot || r.anchorWant !== r.anchorGot);
  for (const r of bad) {
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

const l = run("LABELLED  working set", LABELLED);
const o = run("HELD-OUT  never consulted while fixing", HELDOUT);
console.log("\nSUMMARY  held-out hedge " + o.h.ok + "/" + HELDOUT.length +
  "   held-out anchor " + o.a.ok + "/" + HELDOUT.length +
  "   working " + l.h.ok + "/" + LABELLED.length + " and " + l.a.ok + "/" + LABELLED.length);

module.exports = { firesHedge, firesNoAnchor };
