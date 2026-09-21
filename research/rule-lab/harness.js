#!/usr/bin/env node
"use strict";

// rule-lab harness — measures whether a rule in CLAUDE.md changes what a real
// headless Claude Code session does. Local-only research tooling, never shipped.
//
//   node harness.js run --exp <id> [--reps N] [--model M] [--resume] [--limit N]
//                       [--concurrency N] [--seed N] [--keep] [--dry-run]
//   node harness.js analyze --exp <id>
//   node harness.js list
//
// Design (v2, lessons from the lost v1 harness applied):
// - Cells run `claude -p` headless in a throwaway fixture project, so the rule
//   loads through a real CLAUDE.md instead of a synthetic system prompt.
// - Variants vary ONE structural property of the SAME rule intent; comparing
//   different rules to each other is confounded and not done here.
// - Compliance is measured as lift over a no-rule baseline, and only cells
//   that pass the intent's validity graders count (an absence-grader must
//   never reward a session that simply did nothing).
// - Every experiment carries >= 2 intents so a finding replicates or dies.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const LAB_DIR = process.env.RULE_LAB_DIR || __dirname; // sibling labs (skill-lab) point RULE_LAB_DIR at their own experiments/results
const EXP_DIR = path.join(LAB_DIR, "experiments");
const RESULTS_DIR = path.join(LAB_DIR, "results");

const DEFAULTS = { reps: 5, model: "haiku", maxBudgetUsd: 0.25, timeoutMs: 300000, concurrency: 2, seed: 42 };
const BOOTSTRAP_ITERS = 2000;
const NULL_BAND = 0.1; // |lift| CI inside ±this band => NULL verdict

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function loadExperiment(id) {
  const file = path.join(EXP_DIR, id + ".json");
  if (!fs.existsSync(file)) {
    console.error(`No experiment spec at experiments/${id}.json`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

// ---------------------------------------------------------------------------
// Graders
// ---------------------------------------------------------------------------

// Every file under the fixture, project-relative with forward slashes. The
// throwaway settings and state directories are skipped: they are the harness's
// own, not the cell's work.
function fixturePaths(dir, rel = "", out = []) {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git" || e.name.startsWith(".assay")) continue;
    const child = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) fixturePaths(dir, child, out);
    else out.push(child);
  }
  return out;
}

function gradeOne(grader, ctx) {
  const readFile = (rel) => {
    const full = path.join(ctx.dir, rel);
    return fs.existsSync(full) ? fs.readFileSync(full, "utf-8") : null;
  };
  switch (grader.type) {
    case "file_exists":
      return fs.existsSync(path.join(ctx.dir, grader.path)) ? 1 : 0;
    case "file_absent": // pair with a validity gate, or "did nothing" grades as compliant
      return fs.existsSync(path.join(ctx.dir, grader.path)) ? 0 : 1;
    case "file_regex": {
      const content = readFile(grader.path);
      return content !== null && new RegExp(grader.pattern, grader.flags || "m").test(content) ? 1 : 0;
    }
    case "file_regex_absent": {
      const content = readFile(grader.path);
      if (content === null) return 0; // missing file is not compliance, it is absence of work
      return new RegExp(grader.pattern, grader.flags || "m").test(content) ? 0 : 1;
    }
    // [Foreman: 172] Some duties are about WHERE a file lands or what it is
    // called, and no fixed path can express that: the model picks the name.
    // These walk the fixture tree and ask whether any path matches.
    case "path_regex":
      return fixturePaths(ctx.dir).some((rel) => new RegExp(grader.pattern).test(rel)) ? 1 : 0;
    case "path_regex_absent":
      return fixturePaths(ctx.dir).some((rel) => new RegExp(grader.pattern).test(rel)) ? 0 : 1;
    case "response_regex":
      return new RegExp(grader.pattern, grader.flags || "m").test(ctx.response || "") ? 1 : 0;
    case "response_regex_absent":
      return new RegExp(grader.pattern, grader.flags || "m").test(ctx.response || "") ? 0 : 1;
    case "composite": {
      const scores = grader.children.map((c) => gradeOne(c, ctx));
      if (grader.op === "or") return Math.max(...scores);
      return Math.min(...scores); // default: and
    }
    default:
      throw new Error("Unknown grader type: " + grader.type);
  }
}

function grade(graders, ctx) {
  const detail = graders.map((g) => ({ type: g.type, path: g.path, pattern: g.pattern, score: gradeOne(g, ctx) }));
  return { score: Math.min(...detail.map((d) => d.score)), detail };
}

// ---------------------------------------------------------------------------
// Cell construction and execution
// ---------------------------------------------------------------------------

function buildCells(exp, opts) {
  const cells = [];
  const reps = opts.reps || exp.reps || DEFAULTS.reps;
  for (const intent of exp.intents) {
    for (const task of intent.tasks) {
      for (const variant of Object.keys(intent.variants)) {
        for (let rep = 1; rep <= reps; rep++) {
          cells.push({
            id: `${intent.id}__${task.id}__${variant}__r${rep}`,
            intent: intent.id,
            task: task.id,
            variant,
            rep,
          });
        }
      }
    }
  }
  return shuffle(cells, lcg(opts.seed || exp.seed || DEFAULTS.seed));
}

function writeFixture(exp, intent, variant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rule-lab-"));
  const ruleText = intent.variants[variant];
  const isFileMap = ruleText !== null && typeof ruleText === "object"; // variant as {relPath: content} overlay, CLAUDE.md allowed
  for (const [rel, content] of Object.entries(intent.fixture || {})) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content.split("{{RULE}}").join(isFileMap ? "" : ruleText || ""));
  }
  const base = intent.claudeMd || exp.claudeMd || "# Project notes\n\n{{RULE}}\n";
  const claudeMd = base.replace(/^.*\{\{RULE\}\}.*$/m, !isFileMap && ruleText ? ruleText : "").replace(/\n{3,}/g, "\n\n");
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), claudeMd);
  if (isFileMap) {
    for (const [rel, content] of Object.entries(ruleText)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  }
  return dir;
}

// [Foreman: 172] Every cell runs on THIS machine, and this machine has
// user-scope plugins enabled: an output style that rewrites how answers are
// written, hooks that inject text into every prompt, a rule set that changes how
// work is scoped. All of that loads into a headless cell too. It loads into both
// arms, which is exactly why it is dangerous - it does not look like a broken
// control, it just silently changes what the measured behaviour is a measurement
// OF. So each cell is handed a settings file that switches every user-scope
// plugin off and pins the output style back to the host default.
//
// What is deliberately NOT disabled: CLAUDE.md discovery. The rule under test
// loads through the fixture's own CLAUDE.md, so a cell that skipped memory would
// measure nothing at all.
function cellSettings() {
  const disabled = {};
  try {
    const userFile = path.join(os.homedir(), ".claude", "settings.json");
    const user = JSON.parse(fs.readFileSync(userFile, "utf-8"));
    for (const name of Object.keys(user.enabledPlugins || {})) disabled[name] = false;
  } catch {
    // no user settings to neutralize
  }
  return { enabledPlugins: disabled, outputStyle: "Default" };
}

const CELL_SETTINGS = cellSettings();
const CELL_SETTINGS_FILE = path.join(os.tmpdir(), "rule-lab-cell-settings.json");

function runClaude(prompt, cwd, model, maxBudgetUsd, timeoutMs) {
  return new Promise((resolve) => {
    // Written to a file, not passed inline: a JSON string on a Windows shell
    // command line loses its quoting, and a cell that silently ran WITHOUT the
    // isolation is the one failure mode this exists to prevent. It lives
    // outside the fixture so the cell's own agent never sees it as a project
    // file it might read, list or edit.
    fs.writeFileSync(CELL_SETTINGS_FILE, JSON.stringify(CELL_SETTINGS, null, 2));
    const args = [
      "-p", "--output-format", "json", "--model", model,
      "--settings", JSON.stringify(CELL_SETTINGS_FILE),
      "--max-budget-usd", String(maxBudgetUsd), "--dangerously-skip-permissions",
    ];
    const env = { ...process.env };
    delete env.CLAUDECODE; // nested-session marker; the cell must look like a fresh run
    delete env.CLAUDE_CODE_ENTRYPOINT;
    const started = Date.now();
    const child = spawn("claude", args, { cwd, env, shell: true, windowsHide: true });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      let parsed = null;
      try {
        parsed = JSON.parse(stdout.trim().split("\n").pop());
      } catch { /* non-JSON output handled below */ }
      resolve({ code, parsed, stderr: stderr.slice(0, 2000), durationMs: Date.now() - started });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function runCell(exp, cell, opts) {
  const intent = exp.intents.find((i) => i.id === cell.intent);
  const task = intent.tasks.find((t) => t.id === cell.task);
  const dir = writeFixture(exp, intent, cell.variant);
  const model = opts.model || exp.model || DEFAULTS.model;
  const maxBudgetUsd = exp.maxBudgetUsd || DEFAULTS.maxBudgetUsd;

  const record = { ...cell, exp: exp.id, model, startedAt: new Date().toISOString() };
  try {
    const r = await runClaude(task.prompt, dir, model, maxBudgetUsd, exp.timeoutMs || DEFAULTS.timeoutMs);
    const response = r.parsed ? r.parsed.result || "" : "";
    const ctx = { dir, response };
    const validity = grade(task.valid || [{ type: "file_exists", path: "CLAUDE.md" }], ctx);
    const compliance = grade(task.graders, ctx);
    Object.assign(record, {
      ok: r.code === 0 && r.parsed && !r.parsed.is_error,
      valid: validity.score === 1,
      compliance: compliance.score,
      validityDetail: validity.detail,
      complianceDetail: compliance.detail,
      turns: r.parsed ? r.parsed.num_turns : null,
      costUsd: r.parsed ? r.parsed.total_cost_usd : null,
      durationMs: r.durationMs,
      responseTail: response.slice(-500),
      stderr: r.code === 0 ? undefined : r.stderr,
    });
  } catch (err) {
    Object.assign(record, { ok: false, valid: false, compliance: null, error: String(err) });
  } finally {
    if (!opts.keep) fs.rmSync(dir, { recursive: true, force: true });
    else record.fixtureDir = dir;
  }
  return record;
}

async function cmdRun(opts) {
  const exp = loadExperiment(opts.exp);
  const cellDir = path.join(RESULTS_DIR, exp.id, "cells");
  fs.mkdirSync(cellDir, { recursive: true });

  let cells = buildCells(exp, opts);
  if (opts.resume) cells = cells.filter((c) => !fs.existsSync(path.join(cellDir, c.id + ".json")));
  if (opts.limit) cells = cells.slice(0, opts.limit);

  if (opts.dryRun) {
    console.log(JSON.stringify({ exp: exp.id, cellsToRun: cells.length, sample: cells.slice(0, 6) }, null, 2));
    return;
  }

  console.log(`[rule-lab] ${exp.id}: running ${cells.length} cell(s), concurrency ${opts.concurrency}`);
  let done = 0, failures = 0;
  const queue = cells.slice();
  const workers = Array.from({ length: Math.min(opts.concurrency, queue.length) }, async () => {
    while (queue.length) {
      const cell = queue.shift();
      const record = await runCell(exp, cell, opts);
      fs.writeFileSync(path.join(cellDir, cell.id + ".json"), JSON.stringify(record, null, 2));
      done++;
      if (!record.ok) failures++;
      console.log(`[rule-lab] ${done}/${cells.length} ${cell.id} ok=${record.ok} valid=${record.valid} compliance=${record.compliance}`);
    }
  });
  await Promise.all(workers);
  console.log(`[rule-lab] done: ${done} cells, ${failures} failures. Next: node harness.js analyze --exp ${exp.id}`);
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function bootstrapLiftCI(variantScores, baselineScores, rand) {
  const lifts = [];
  for (let i = 0; i < BOOTSTRAP_ITERS; i++) {
    const v = Array.from({ length: variantScores.length }, () => variantScores[Math.floor(rand() * variantScores.length)]);
    const b = Array.from({ length: baselineScores.length }, () => baselineScores[Math.floor(rand() * baselineScores.length)]);
    lifts.push(mean(v) - mean(b));
  }
  lifts.sort((a, b) => a - b);
  return [lifts[Math.floor(0.025 * BOOTSTRAP_ITERS)], lifts[Math.floor(0.975 * BOOTSTRAP_ITERS)]];
}

function verdictFor(ciLow, ciHigh) {
  if (ciLow > 0) return "CONFIRMED+";
  if (ciHigh < 0) return "CONFIRMED-";
  if (ciLow > -NULL_BAND && ciHigh < NULL_BAND) return "NULL";
  return "INCONCLUSIVE";
}

function cmdAnalyze(opts) {
  const exp = loadExperiment(opts.exp);
  const cellDir = path.join(RESULTS_DIR, exp.id, "cells");
  if (!fs.existsSync(cellDir)) {
    console.error("No results for " + exp.id + " — run first.");
    process.exit(1);
  }
  const records = fs.readdirSync(cellDir).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(cellDir, f), "utf-8")));

  const usable = records.filter((r) => r.ok && r.valid);
  const rand = lcg(DEFAULTS.seed);
  const analysis = { exp: exp.id, generatedAt: new Date().toISOString(), cells: records.length, usable: usable.length, intents: {} };

  for (const intent of exp.intents) {
    const own = usable.filter((r) => r.intent === intent.id);
    const baseline = own.filter((r) => r.variant === "baseline").map((r) => r.compliance);
    const intentOut = {
      baseline: { n: baseline.length, mean: mean(baseline) },
      antiDefault: baseline.length ? mean(baseline) < 0.5 : null,
      variants: {},
    };
    for (const variant of Object.keys(intent.variants)) {
      if (variant === "baseline") continue;
      const scores = own.filter((r) => r.variant === variant).map((r) => r.compliance);
      if (!scores.length || !baseline.length) {
        intentOut.variants[variant] = { n: scores.length, mean: mean(scores), verdict: "INCONCLUSIVE" };
        continue;
      }
      const [lo, hi] = bootstrapLiftCI(scores, baseline, rand);
      intentOut.variants[variant] = {
        n: scores.length,
        mean: mean(scores),
        lift: mean(scores) - mean(baseline),
        ci95: [lo, hi],
        verdict: verdictFor(lo, hi),
      };
    }
    analysis.intents[intent.id] = intentOut;
  }

  const outFile = path.join(RESULTS_DIR, exp.id, "analysis.json");
  fs.writeFileSync(outFile, JSON.stringify(analysis, null, 2));

  // Markdown summary
  const lines = [`# ${exp.id} — analysis`, "", `Cells: ${records.length} (${usable.length} usable)`, ""];
  for (const [intentId, data] of Object.entries(analysis.intents)) {
    lines.push(`## ${intentId} — baseline ${data.baseline.mean === null ? "n/a" : data.baseline.mean.toFixed(2)} (n=${data.baseline.n})${data.antiDefault === false ? " ⚠ NOT anti-default; lift here is uninformative" : ""}`);
    lines.push("", "| Variant | n | Compliance | Lift | 95% CI | Verdict |", "|---|---|---|---|---|---|");
    for (const [v, d] of Object.entries(data.variants)) {
      const ci = d.ci95 ? `[${d.ci95[0].toFixed(2)}, ${d.ci95[1].toFixed(2)}]` : "—";
      lines.push(`| ${v} | ${d.n} | ${d.mean === null ? "—" : d.mean.toFixed(2)} | ${d.lift === undefined ? "—" : d.lift.toFixed(2)} | ${ci} | ${d.verdict} |`);
    }
    lines.push("");
  }
  console.log(lines.join("\n"));
  console.log(`Written: ${path.relative(LAB_DIR, outFile)}`);
}

function cmdList() {
  const specs = fs.existsSync(EXP_DIR) ? fs.readdirSync(EXP_DIR).filter((f) => f.endsWith(".json")) : [];
  for (const f of specs) {
    const exp = JSON.parse(fs.readFileSync(path.join(EXP_DIR, f), "utf-8"));
    const cellDir = path.join(RESULTS_DIR, exp.id, "cells");
    const doneCells = fs.existsSync(cellDir) ? fs.readdirSync(cellDir).length : 0;
    console.log(`${exp.id} — ${exp.question || "?"} — ${exp.hypothesis || ""} (${doneCells} cells done)`);
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { concurrency: DEFAULTS.concurrency, seed: DEFAULTS.seed };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--exp") opts.exp = argv[++i];
    else if (a === "--reps") opts.reps = Number(argv[++i]);
    else if (a === "--model") opts.model = argv[++i];
    else if (a === "--limit") opts.limit = Number(argv[++i]);
    else if (a === "--concurrency") opts.concurrency = Number(argv[++i]);
    else if (a === "--seed") opts.seed = Number(argv[++i]);
    else if (a === "--resume") opts.resume = true;
    else if (a === "--keep") opts.keep = true;
    else if (a === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const opts = parseArgs(rest);
  if (command === "run" && opts.exp) await cmdRun(opts);
  else if (command === "analyze" && opts.exp) cmdAnalyze(opts);
  else if (command === "list") cmdList();
  else {
    console.error("Usage: harness.js <run|analyze|list> --exp <id> [options]");
    process.exit(2);
  }
}

module.exports = { gradeOne, grade, buildCells, writeFixture, bootstrapLiftCI, verdictFor, lcg, mean };

if (require.main === module) main();
