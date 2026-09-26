"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildPrompt } = require("../public/refactor-prompt.js");
const { parseDocument } = require("../public/document-model.js");

const read = (file) => fs.readFileSync(path.join(__dirname, "../public", file), "utf8");
const ui = read("review-ui.js");
const constant = (name) => vm.runInNewContext("(" + ui.match(new RegExp(`const ${name} = ([\\s\\S]*?);\\n`))[1] + ")");
const SAMPLE = constant("SAMPLE"), SAMPLE_RESULTS = constant("SAMPLE_RESULTS");
const browser = { window: {} };
vm.runInNewContext(read("i18n.js"), browser);

// The sample's bundled results stand in for a scoring run, so they must cover exactly the excerpts
// the unchanged sample would send and pass the checks a live result passes before it is shown.
test("the bundled sample results cover exactly the sample's scored excerpts", () => {
  const report = parseDocument(SAMPLE, "AGENTS.md");
  const rules = report.units.filter((unit) => unit.state === "ready").map((unit) => unit.rule);
  assert.deepEqual(Object.keys(SAMPLE_RESULTS).sort(), [...rules].sort());
  for (const unit of report.units) if (unit.state === "ready") { unit.state = SAMPLE_RESULTS[unit.rule].status; unit.result = SAMPLE_RESULTS[unit.rule]; }
  assert.ok(report.units.every((unit) => unit.state !== "ready"));
  assert.match(buildPrompt(report, browser.window.STRINGS.en), /Evidence packet/);
});
