"use strict";

// One rule in, findings out. Deliberately no grade: the research says a letter
// is the part a reader will over-trust, and the two things no local linter can
// say — "this should be a hook" and "this is not a rule" — are findings.
//
// One Jev request carries all five questions. Per-rule cost at the measured
// rate is about $0.000037, so the loop that matters is requests, not tokens.

const { scoreF1, scoreF2, scoreF7 } = require("./scorer.js");
const { QUESTIONS } = require("./questions.js");
const { detectLanguage } = require("./language.js");

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

// The build every measurement in docs/knowledge/ was taken on. `jev-latest`
// resolves to it today; pinning means a new build cannot silently move numbers
// the docs report as measured.
const MODEL = "jev-1.13.0";

// Injection bands, from docs/knowledge/injection-screen-criteria.md. Measured
// separation was 0.74, so nothing real sits near either edge.
const REVIEW = 0.35;
const BLOCK = 0.70;

// Show a routing recommendation above this, ask it as a question below.
// https://docs.typesafe.ai/patterns/confidence-routing.md
const CONFIDENT = 0.8;

// Level midpoints. F3 runs 0-4 and F8 runs 0-3, and both come back as
// probability-weighted values rather than integers.
const NO_TRIGGER = 1.5;   // level 0 or 1: no occasion, or a standing quality
const TOOL_WORK = 1.25;   // level 0 or 1: a command or a hook settles it

const MAX_RULE_CHARS = 2000;

class AnalyzeError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AnalyzeError";
    this.status = status;
  }
}

async function askJev(rule, { apiKey, fetchImpl = fetch, model = MODEL }) {
  let res;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ state: { rule }, model, questions: QUESTIONS }),
    });
  } catch (cause) {
    throw new AnalyzeError("the scoring service could not be reached", 502);
  }
  if (!res.ok) {
    // The upstream body can carry our request back verbatim. Keep it out of the
    // response and out of anything a caller might log.
    throw new AnalyzeError("the scoring service returned " + res.status, res.status === 429 ? 429 : 502);
  }
  return res.json();
}

function deterministic(rule) {
  const f1 = scoreF1(rule);
  const f2 = scoreF2(rule);
  const f7 = scoreF7(rule);
  return { f1, f2, f7 };
}

// English word lists, all three of them, which is why `analyze` only calls this
// when the language screen says English. See lib/language.js.
function deterministicFindings({ f1, f2, f7 }) {
  const out = [];
  if (f2.category === "bare_prohibition") {
    out.push({
      id: "stall_risk",
      headline: "This ban names nothing to do instead.",
      detail: "An agent that needed the banned thing has nowhere to go, so a blocked task becomes a stopped one. Name the replacement in the same rule.",
      factor: "F2",
      value: f2.value,
    });
  }
  if (f1.hedged) {
    out.push({
      id: "hedge_dominance",
      headline: "One hedge governs the whole sentence downward.",
      detail: "A hedge sets the force of everything around it, however firm the rest sounds. \"" + f1.matchedVerb + "\" is doing that here.",
      factor: "F1",
      value: f1.value,
    });
  }
  if (f7.concrete.length === 0) {
    out.push({
      id: "no_concrete_anchor",
      headline: "Nothing in this rule is checkable.",
      detail: "It names no file, command, symbol or number, so two readers can both follow it and disagree about what they did.",
      factor: "F7",
      value: f7.value,
    });
  }
  return out;
}

function jevFindings(answers) {
  const out = [];
  const isRule = answers.is_rule.noul;
  const f3 = answers.trigger_distance.score;
  const f8 = answers.enforceability.score;
  const primitive = answers.best_primitive;

  if (isRule < 0.5) {
    out.push({
      id: "not_a_rule",
      headline: "This line asks for nothing.",
      detail: "It reads as description rather than instruction. Text like this is carried, read and paid for on every turn without changing what the agent does.",
      factor: "is_rule",
      value: +isRule.toFixed(2),
    });
  }

  if (f8 <= TOOL_WORK) {
    const confident = primitive.choice === "hook" && primitive.confidence >= CONFIDENT;
    out.push({
      id: "should_be_a_hook",
      headline: confident ? "This should stop being a rule and become a hook."
        : "Could this be a hook instead?",
      detail: confident
        ? "Compliance here can be settled by a command, so prose is the weaker copy of a check that would never be forgotten."
        : "A tool could carry most of this, but the routing is not confident enough to call it: " + primitive.choice + " at " + primitive.confidence.toFixed(2) + ".",
      factor: "F8",
      value: +f8.toFixed(2),
    });
  }

  if (f3 < NO_TRIGGER) {
    out.push({
      id: "no_trigger",
      headline: "There is no moment when this comes due.",
      detail: "Nothing names an occasion the reader could check themselves against, so it is read once and never fires.",
      factor: "F3",
      value: +f3.toFixed(2),
    });
  }

  return out;
}

async function analyze(rule, opts = {}) {
  if (typeof rule !== "string") throw new AnalyzeError("rule must be a string", 400);
  const text = rule.trim();
  if (!text) throw new AnalyzeError("rule must not be empty", 400);
  if (text.length > MAX_RULE_CHARS) {
    throw new AnalyzeError("rule must be " + MAX_RULE_CHARS + " characters or fewer", 400);
  }
  if (!opts.apiKey) throw new AnalyzeError("the scoring service is not configured", 500);

  const body = await askJev(text, opts);
  const a = body.answers;
  const risk = Math.max(a.control.noul, a.premise.noul);
  const tokens = body.usage ? body.usage.input_tokens : null;

  // Above the block band the text is not a rule being scored, it is a rule
  // being aimed at whatever reads it. Hand it straight back.
  if (risk >= BLOCK) {
    return { status: "refused", risk: +risk.toFixed(2), echo: text, findings: [], tokens };
  }
  // In the review band it still gets scored — the run is already paid for — but
  // a verdict is not rendered over text that may be addressing the reader.
  if (risk >= REVIEW) {
    return { status: "review", risk: +risk.toFixed(2), echo: text, findings: [], tokens };
  }

  const language = detectLanguage(text);
  const factors = {
    F3: +a.trigger_distance.score.toFixed(2),
    F8: +a.enforceability.score.toFixed(2),
    is_rule: +a.is_rule.noul.toFixed(2),
    primitive: { choice: a.best_primitive.choice, confidence: +a.best_primitive.confidence.toFixed(2) },
  };
  const findings = jevFindings(a);

  // Jev judges any of these languages; F1, F2 and F7 do not. Withholding them
  // is the whole policy — a half-verdict that says which half is missing beats
  // an English word list answering confidently about Spanish.
  if (language.english) {
    const det = deterministic(text);
    findings.push(...deterministicFindings(det));
    factors.F1 = det.f1.value;
    factors.F2 = det.f2.value;
    factors.F7 = det.f7.value;
  }

  return {
    status: language.english ? "ok" : "partial",
    risk: +risk.toFixed(2),
    language: {
      code: language.code,
      name: language.name,
      supported: language.supported,
      deterministic: language.english ? "applied" : "withheld",
    },
    findings,
    factors,
    tokens,
  };
}

module.exports = { analyze, AnalyzeError, MAX_RULE_CHARS, REVIEW, BLOCK, CONFIDENT };
