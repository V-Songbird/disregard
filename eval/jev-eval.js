"use strict";

// Measures the two Jev questions that shipped unmeasured, against
// eval/jev-set.js. Each case is asked on its own so a non-rule is never asked
// where it belongs, which is a question with no answer.
//
//   node eval/jev-eval.js
//
// Real paid calls: 32 cases at three repetitions. Report the held-out line.

const { QUESTIONS } = require("../lib/questions.js");
const { IS_RULE, PRIMITIVE } = require("./jev-set.js");

const REPS = 3;
// The threshold lib/analyze.js uses: below it, the page says "not a rule".
const IS_RULE_CUT = 0.5;

let tokens = 0;

async function ask(rule, name) {
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.TYPESAFE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      state: { rule },
      model: "jev-1.13.0",
      questions: { [name]: QUESTIONS[name] },
    }),
  });
  if (!res.ok) throw new Error(res.status + " " + (await res.text()));
  const j = await res.json();
  tokens += j.usage.input_tokens;
  return j.answers[name];
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

async function runIsRule(set) {
  const rows = [];
  for (const c of set) {
    const vals = [];
    for (let i = 0; i < REPS; i++) vals.push((await ask(c.text, "is_rule")).noul);
    const m = mean(vals);
    rows.push({
      id: c.id, want: c.rule, got: m >= IS_RULE_CUT,
      value: +m.toFixed(2), spread: +(Math.max(...vals) - Math.min(...vals)).toFixed(2),
    });
  }
  return rows;
}

async function runPrimitive(set) {
  const rows = [];
  for (const c of set) {
    const picks = [], confs = [];
    for (let i = 0; i < REPS; i++) {
      const a = await ask(c.text, "best_primitive");
      picks.push(a.choice); confs.push(a.confidence);
    }
    // The modal pick across repetitions, which is what a caller would trust.
    const tally = {};
    for (const p of picks) tally[p] = (tally[p] || 0) + 1;
    const got = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
    rows.push({
      id: c.id, want: c.choice, got,
      conf: +mean(confs).toFixed(2), stable: new Set(picks).size === 1, picks,
    });
  }
  return rows;
}

function report(title, rows, extra) {
  const ok = rows.filter((r) => r.want === r.got).length;
  console.log("\n### " + title + "   " + ok + "/" + rows.length);
  for (const r of rows) console.log((r.want === r.got ? "    ok    " : "    MISS  ") + extra(r));
  return ok;
}

(async () => {
  if (!process.env.TYPESAFE_API_KEY) throw new Error("TYPESAFE_API_KEY is not set");

  const irWork = await runIsRule(IS_RULE.filter((c) => c.set === "work"));
  const irHeld = await runIsRule(IS_RULE.filter((c) => c.set === "held"));
  const bpWork = await runPrimitive(PRIMITIVE.filter((c) => c.set === "work"));
  const bpHeld = await runPrimitive(PRIMITIVE.filter((c) => c.set === "held"));

  const irLine = (r) => r.id.padEnd(18) + "want " + String(r.want).padEnd(6) +
    "got " + String(r.got).padEnd(6) + "value " + r.value + "  spread " + r.spread;
  const bpLine = (r) => r.id.padEnd(18) + "want " + r.want.padEnd(10) +
    "got " + r.got.padEnd(10) + "conf " + r.conf + "  " + JSON.stringify(r.picks);

  const a = report("is_rule    working set", irWork, irLine);
  const b = report("is_rule    HELD OUT", irHeld, irLine);
  const c = report("primitive  working set", bpWork, bpLine);
  const d = report("primitive  HELD OUT", bpHeld, bpLine);

  const all = [...irWork, ...irHeld];
  const neg = all.filter((r) => r.want === false);
  const pos = all.filter((r) => r.want === true);
  const margin = Math.min(...pos.map((r) => r.value)) - Math.max(...neg.map((r) => r.value));
  const unstable = [...bpWork, ...bpHeld].filter((r) => !r.stable);

  console.log("\nis_rule    lowest rule " + Math.min(...pos.map((r) => r.value)) +
    "   highest non-rule " + Math.max(...neg.map((r) => r.value)) +
    "   margin " + margin.toFixed(2));
  console.log("primitive  unstable across repetitions: " +
    (unstable.length ? unstable.map((r) => r.id + " " + JSON.stringify(r.picks)).join(", ") : "none"));
  console.log("\nSUMMARY  HELD OUT  is_rule " + b + "/" + irHeld.length +
    "   primitive " + d + "/" + bpHeld.length +
    "   |  working " + a + "/" + irWork.length + " and " + c + "/" + bpWork.length +
    "   |  " + tokens + " input tokens");
})();
