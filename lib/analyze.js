"use strict";

// One rule in, findings out. Deliberately no grade: the research says a letter
// is the part a reader will over-trust, and the two things no local linter can
// say — "this should be a hook" and "this is not a rule" — are findings.
//
// Findings carry an id and the numbers behind it, never prose. The page owns
// every sentence a reader sees, which is what lets the interface speak six
// languages while the rules it scores stay English.
//
// One Jev request carries all six questions. Per-rule cost at the measured
// rate is about $0.0001, so the loop that matters is requests, not tokens.

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

// A confident routing answer, by the primitive it names. `rule` is absent on
// purpose: "leave this a standing rule" is where it already is, and a finding
// that tells a reader to change nothing is noise.
const ROUTES = {
  hook: "should_be_a_hook",
  skill: "belongs_as_a_skill",
  subagent: "belongs_as_a_subagent",
};

const MAX_RULE_CHARS = 2000;

class AnalyzeError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "AnalyzeError";
    this.code = code;
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
  } catch {
    throw new AnalyzeError("upstream", "the scoring service could not be reached", 502);
  }
  if (!res.ok) {
    // The upstream body can carry our request back verbatim. Keep it out of the
    // response and out of anything a caller might log.
    if (res.status === 429) throw new AnalyzeError("rate_limited", "too many requests", 429);
    throw new AnalyzeError("upstream", "the scoring service returned " + res.status, 502);
  }
  return res.json();
}

// F1, F2 and F7 are English word lists, which is one of the reasons a rule that
// is not English never reaches this.
function deterministicFindings(rule) {
  const f1 = scoreF1(rule);
  const f2 = scoreF2(rule);
  const f7 = scoreF7(rule);
  const findings = [];

  if (f2.category === "bare_prohibition") {
    findings.push({ id: "stall_risk", factor: "F2", value: f2.value });
  }
  if (f1.hedged) {
    findings.push({ id: "hedge_dominance", factor: "F1", value: f1.value, verb: f1.matchedVerb });
  }
  if (f7.concrete.length === 0) {
    findings.push({ id: "no_concrete_anchor", factor: "F7", value: f7.value });
  }
  return { findings, factors: { F1: f1.value, F2: f2.value, F7: f7.value } };
}

function jevFindings(answers) {
  const out = [];
  const isRule = answers.is_rule.noul;
  const f3 = answers.trigger_distance.score;
  const f8 = answers.enforceability.score;
  const primitive = answers.best_primitive;

  if (isRule < 0.5) {
    out.push({ id: "not_a_rule", factor: "is_rule", value: +isRule.toFixed(2) });
  }
  // The routing answer, when the model is sure and the answer is not "leave it
  // where it is". Measured 2026-09-20: every pick at or above CONFIDENT was
  // right, 10 for 10, while every error sat below it — so above the line the
  // primitive is named, and below it the softer finding names none.
  //
  // No F8 gate on this branch. F8 asks whether a deterministic tool beats
  // prose, which is a different question: a review pass belongs in a subagent
  // however unenforceable it is, and gating on F8 is why *"Before each release,
  // review every public API change"* used to produce no routing finding at all.
  const route = primitive.confidence >= CONFIDENT ? ROUTES[primitive.choice] : null;
  if (route) {
    out.push({
      id: route,
      factor: "F8",
      value: +f8.toFixed(2),
      choice: primitive.choice,
      confidence: +primitive.confidence.toFixed(2),
    });
  } else if (f8 <= TOOL_WORK) {
    // A tool could carry it, but the routing will not say which kind.
    out.push({
      id: "could_be_a_hook",
      factor: "F8",
      value: +f8.toFixed(2),
      choice: primitive.choice,
      confidence: +primitive.confidence.toFixed(2),
    });
  }
  if (f3 < NO_TRIGGER) {
    out.push({ id: "no_trigger", factor: "F3", value: +f3.toFixed(2) });
  }
  return out;
}

async function analyze(rule, opts = {}) {
  if (typeof rule !== "string") throw new AnalyzeError("bad_rule", "rule must be a string", 400);
  const text = rule.trim();
  if (!text) throw new AnalyzeError("empty", "rule must not be empty", 400);
  if (text.length > MAX_RULE_CHARS) {
    throw new AnalyzeError("too_long", "rule must be " + MAX_RULE_CHARS + " characters or fewer", 400);
  }
  if (!opts.apiKey) throw new AnalyzeError("not_configured", "the scoring service is not configured", 500);

  // Before anything is spent. Instruction files are written in English, that is
  // the only thing any of this was measured on, and a rule in another language
  // would get a confident number nobody has ever checked.
  const language = detectLanguage(text);
  if (!language.english) {
    return { status: "not_english", language: { code: language.code, name: language.name }, findings: [] };
  }

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

  const det = deterministicFindings(text);

  return {
    status: "ok",
    risk: +risk.toFixed(2),
    findings: [...jevFindings(a), ...det.findings],
    factors: {
      ...det.factors,
      F3: +a.trigger_distance.score.toFixed(2),
      F8: +a.enforceability.score.toFixed(2),
      is_rule: +a.is_rule.noul.toFixed(2),
      primitive: { choice: a.best_primitive.choice, confidence: +a.best_primitive.confidence.toFixed(2) },
    },
    tokens,
  };
}

module.exports = { analyze, AnalyzeError, MAX_RULE_CHARS, REVIEW, BLOCK, CONFIDENT };
