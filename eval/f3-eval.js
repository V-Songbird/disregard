"use strict";
const { LABELLED, HELDOUT, HELDOUT2, V1, V2, INSTRUCTIONS_V1, INSTRUCTIONS_V2 } = require("./f3-criteria.js");
const REPS = 3;

async function ask(rule, instructions, criteria) {
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.TYPESAFE_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ state: { rule }, model: "jev-1.13.0", questions: { f3: { type: "score", instructions, criteria } } }),
  });
  if (!res.ok) throw new Error(res.status + " " + (await res.text()));
  const j = await res.json();
  return { score: j.answers.f3.score, conf: j.answers.f3.confidence, tok: j.usage.input_tokens };
}

async function run(name, instructions, criteria, SET) {
  const rows = []; let tok = 0;
  for (const c of SET) {
    const s = [];
    for (let i = 0; i < REPS; i++) { const r = await ask(c.text, instructions, criteria); s.push(r.score); tok += r.tok; }
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    const spread = Math.max(...s) - Math.min(...s);
    rows.push({ id: c.id, want: c.level, got: +mean.toFixed(2), lvl: Math.round(mean), err: Math.abs(mean - c.level), spread: +spread.toFixed(2) });
  }
  const exact = rows.filter(r => r.lvl === r.want).length;
  const mae = rows.reduce((a, r) => a + r.err, 0) / rows.length;
  console.log(`\n### ${name}   exact ${exact}/${rows.length}   MAE ${mae.toFixed(2)} levels   ${tok} tok`);
  const w = Math.max(20, ...rows.map(r => r.id.length + 2));
  console.log("id".padEnd(w) + "want  got   lvl  err   spread");
  for (const r of rows) console.log(r.id.padEnd(w) + String(r.want).padEnd(6) + String(r.got).padEnd(6) + String(r.lvl).padEnd(5) + r.err.toFixed(2).padEnd(6) + r.spread);
  return { exact, mae, rows };
}

(async () => {
  const a = await run("v1  flat comparative strings", INSTRUCTIONS_V1, V1, LABELLED);
  const b = await run("v2  standalone situations + signals", INSTRUCTIONS_V2, V2, LABELLED);
  const c = await run("v2 on first HELD-OUT cases (spent, a guard)", INSTRUCTIONS_V2, V2, HELDOUT);
  const d = await run("v2 on HELD-OUT 2 (live)", INSTRUCTIONS_V2, V2, HELDOUT2);
  console.log(`\nSUMMARY  tuned ${a.exact}/10 -> ${b.exact}/10 (MAE ${a.mae.toFixed(2)} -> ${b.mae.toFixed(2)})   HELD-OUT 2 ${d.exact}/10 MAE ${d.mae.toFixed(2)}   first held-out ${c.exact}/10 MAE ${c.mae.toFixed(2)}`);
})();
