"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const h = require("./harness.js");

function tmpDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rule-lab-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

test("graders: file_regex, file_regex_absent, validity semantics", () => {
  const dir = tmpDir({ "src/a.js": "function fetchUsers() { console.log('x'); }" });
  assert.equal(h.gradeOne({ type: "file_regex", path: "src/a.js", pattern: "fetchUsers" }, { dir }), 1);
  assert.equal(h.gradeOne({ type: "file_regex_absent", path: "src/a.js", pattern: "console\\.log" }, { dir }), 0);
  // a missing file never counts as compliant absence
  assert.equal(h.gradeOne({ type: "file_regex_absent", path: "src/missing.js", pattern: "x" }, { dir }), 0);
});

test("grader: file_absent scores missing file as 1, present as 0", () => {
  const dir = tmpDir({ "SKILL_FIRED.txt": "ok" });
  assert.equal(h.gradeOne({ type: "file_absent", path: "SKILL_FIRED.txt" }, { dir }), 0);
  assert.equal(h.gradeOne({ type: "file_absent", path: "nope.txt" }, { dir }), 1);
});

test("graders: response and composite", () => {
  const ctx = { dir: tmpDir({}), response: "Done. I used the log helper." };
  assert.equal(h.gradeOne({ type: "response_regex", pattern: "log helper" }, ctx), 1);
  assert.equal(h.gradeOne({ type: "composite", op: "or", children: [
    { type: "response_regex", pattern: "nope" },
    { type: "response_regex", pattern: "Done" },
  ] }, ctx), 1);
  assert.equal(h.grade([{ type: "response_regex", pattern: "Done" }, { type: "response_regex", pattern: "nope" }], ctx).score, 0);
});

test("comment grader pattern ignores URLs but catches inline comments", () => {
  const pattern = "(^|[^:\"'])//(?!/)";
  assert.equal(new RegExp(pattern, "m").test("const u = \"https://example.com\";"), false);
  assert.equal(new RegExp(pattern, "m").test("const x = 1; // counter"), true);
});

test("buildCells is a deterministic shuffled full cross", () => {
  const exp = {
    id: "x",
    intents: [{
      id: "i1",
      variants: { baseline: null, a: "- A.", b: "- B." },
      tasks: [{ id: "t1" }, { id: "t2" }],
    }],
  };
  const cells = h.buildCells(exp, { reps: 3, seed: 42 });
  assert.equal(cells.length, 3 * 2 * 3);
  assert.deepEqual(cells, h.buildCells(exp, { reps: 3, seed: 42 }));
  assert.notDeepEqual(cells, h.buildCells(exp, { reps: 3, seed: 7 }));
});

test("writeFixture injects the variant rule into CLAUDE.md, baseline gets none", () => {
  const exp = { id: "x" };
  const intent = {
    id: "i1",
    claudeMd: "# Notes\n\nSome context.\n\n{{RULE}}\n",
    fixture: { "src/a.js": "module.exports = {};" },
    variants: { baseline: null, prohibition: "- Never use console.log." },
  };
  const withRule = h.writeFixture(exp, intent, "prohibition");
  assert.match(fs.readFileSync(path.join(withRule, "CLAUDE.md"), "utf-8"), /Never use console\.log/);
  assert.ok(fs.existsSync(path.join(withRule, "src/a.js")));
  const baseline = h.writeFixture(exp, intent, "baseline");
  assert.doesNotMatch(fs.readFileSync(path.join(baseline, "CLAUDE.md"), "utf-8"), /\{\{RULE\}\}|Never use/);
  fs.rmSync(withRule, { recursive: true, force: true });
  fs.rmSync(baseline, { recursive: true, force: true });
});

test("writeFixture injects the variant into fixture files carrying {{RULE}}", () => {
  const exp = { id: "x" };
  const intent = {
    id: "i1",
    claudeMd: "# Notes\n",
    fixture: { ".claude/skills/s/SKILL.md": "---\nname: s\ndescription: {{RULE}}\n---\nBody.\n" },
    variants: { baseline: "Plain description.", listy: "Trigger on X." },
  };
  const dir = h.writeFixture(exp, intent, "listy");
  assert.match(fs.readFileSync(path.join(dir, ".claude/skills/s/SKILL.md"), "utf-8"), /description: Trigger on X\./);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("writeFixture accepts a file-map variant that overlays files including CLAUDE.md", () => {
  const exp = { id: "x" };
  const intent = {
    id: "i1",
    claudeMd: "# Notes\n\n{{RULE}}\n",
    fixture: { ".claude/skills/s/SKILL.md": "---\ndescription: {{RULE}}\n---\n" },
    variants: {
      baseline: "Plain description.",
      combo: {
        "CLAUDE.md": "RULE AT TOP\n\n# Notes\n",
        ".claude/skills/s/SKILL.md": "---\ndescription: Trigger-listed.\n---\n",
        ".claude/rules/csv.md": "Scoped rule body.\n",
      },
    },
  };
  const dir = h.writeFixture(exp, intent, "combo");
  assert.match(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf-8"), /^RULE AT TOP/);
  assert.match(fs.readFileSync(path.join(dir, ".claude/skills/s/SKILL.md"), "utf-8"), /Trigger-listed/);
  assert.match(fs.readFileSync(path.join(dir, ".claude/rules/csv.md"), "utf-8"), /Scoped rule body/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, ".claude/skills/s/SKILL.md"), "utf-8"), /\{\{RULE\}\}/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("bootstrap CI and verdicts behave at the extremes", () => {
  const rand = h.lcg(1);
  const [lo, hi] = h.bootstrapLiftCI([1, 1, 1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0, 0, 0], rand);
  assert.equal(lo, 1);
  assert.equal(hi, 1);
  assert.equal(h.verdictFor(0.2, 0.8), "CONFIRMED+");
  assert.equal(h.verdictFor(-0.8, -0.2), "CONFIRMED-");
  assert.equal(h.verdictFor(-0.05, 0.05), "NULL");
  assert.equal(h.verdictFor(-0.3, 0.4), "INCONCLUSIVE");
});

test("exp-001 spec is well-formed: >=2 intents, baseline everywhere, absence graders gated", () => {
  const spec = JSON.parse(fs.readFileSync(path.join(__dirname, "experiments", "exp-001-framing.json"), "utf-8"));
  assert.ok(spec.intents.length >= 2);
  for (const intent of spec.intents) {
    assert.ok(Object.prototype.hasOwnProperty.call(intent.variants, "baseline"));
    for (const task of intent.tasks) {
      const hasAbsence = task.graders.some((g) => g.type.endsWith("_absent"));
      if (hasAbsence) assert.ok(task.valid && task.valid.length, `${intent.id}/${task.id} needs a validity gate`);
      for (const g of [...task.graders, ...(task.valid || [])]) assert.doesNotThrow(() => new RegExp(g.pattern || ""));
    }
  }
});
