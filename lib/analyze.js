"use strict";

// One rule in, findings out. Results contain individual findings, not a grade.
//
// Findings carry an id and the numbers behind it, never prose. The page owns
// every sentence a reader sees, which is what lets the interface speak six
// languages while the rules it scores stay English.
//
// One Jev request carries all seven questions. Input usage comes from the
// provider response; no fixed per-rule cost is assumed.

const { scoreF1, scoreF2, scoreF7 } = require("./scorer.js");
const { QUESTIONS } = require("./questions.js");
const { detectLanguage } = require("./language.js");

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

// Pin the model so provider aliases cannot silently change scoring behavior.
const MODEL = "jev-1.13.0";

// Injection-risk thresholds for withholding ordinary findings.
const REVIEW = 0.35;
const BLOCK = 0.70;

// Show a routing recommendation above this, ask it as a question below.
// https://docs.typesafe.ai/patterns/confidence-routing.md
const CONFIDENT = 0.8;

// A confident artifact requirement suppresses only the background warning.
const ARTIFACT_REQUIREMENT_CONFIDENT = 0.8;

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

/**
 * A failure the caller can map straight onto an HTTP response.
 *
 * @param {string} code    Stable machine name: bad_rule, empty, too_long,
 *                         not_configured, upstream.
 * @param {string} message English detail, safe to show.
 * @param {number} status  The HTTP status to answer with.
 */
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
      signal: AbortSignal.timeout(30_000),
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
  try {
    return await res.json();
  } catch {
    throw new AnalyzeError("upstream", "the scoring service returned an invalid response", 502);
  }
}

// Validate only fields we consume. Other answer metadata is not part of this
// app's contract. Do this before the injection gate so invalid risk cannot
// silently fall through to ordinary scoring.
function validatedAnswers(body) {
  const a = body?.answers;
  const inRange = (value, max) => Number.isFinite(value) && value >= 0 && value <= max;
  if (!inRange(a?.control?.noul, 1) ||
      !inRange(a?.premise?.noul, 1) ||
      !inRange(a?.is_rule?.noul, 1) ||
      !inRange(a?.trigger_distance?.score, 4) ||
      !inRange(a?.enforceability?.score, 3) ||
      !inRange(a?.best_primitive?.confidence, 1) ||
      !["rule", "hook", "skill", "subagent"].includes(a?.best_primitive?.choice) ||
      !inRange(a?.candidate_role?.confidence, 1) ||
      !["direct_action", "artifact_requirement", "background", "unclear"].includes(a?.candidate_role?.choice)) {
    throw new AnalyzeError("upstream", "the scoring service returned an invalid response", 502);
  }
  return a;
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
  const role = answers.candidate_role;
  const artifactRequirement = role.choice === "artifact_requirement" && role.confidence >= ARTIFACT_REQUIREMENT_CONFIDENT;

  if (isRule < 0.5 && !artifactRequirement) {
    out.push({ id: "not_a_rule", factor: "is_rule", value: +isRule.toFixed(2) });
  }
  // Named routing uses its own confidence threshold, independently of F8.
  // F8 describes mechanical enforceability, not whether a skill or subagent
  // is suitable. Model confidence is not a correctness guarantee.
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
    // Mechanical checks may apply; the generic advice keeps remaining
    // review/judgment instructions explicit rather than replacing the whole rule.
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

/**
 * Score one rule: the deterministic factors locally, the rest from one Jev call.
 * Screens language before spending; injection risk is measured in the same call.
 *
 * @param {string} rule                   One rule. Trimmed here, MAX_RULE_CHARS max.
 * @param {object} [opts]
 * @param {string} opts.apiKey            TypeSafe key. Absent throws not_configured.
 * @param {typeof fetch} [opts.fetchImpl] Injected by the tests.
 * @param {string} [opts.model]           Overrides the default model id.
 * @returns {Promise<{
 *   status: "ok" | "not_english" | "review" | "refused",
 *   findings: object[],
 *   risk?: number,
 *   echo?: string,
 *   language?: { code: string, name: string | null },
 *   factors?: object,
 *   tokens?: number | null
 * }>} Only "ok" carries factors. "review" and "refused" carry echo instead.
 * @throws {AnalyzeError} On bad input, no key, or an unreachable upstream.
 */
async function analyze(rule, opts = {}) {
  if (typeof rule !== "string") throw new AnalyzeError("bad_rule", "rule must be a string", 400);
  const text = rule.trim();
  if (!text) throw new AnalyzeError("empty", "rule must not be empty", 400);
  if (text.length > MAX_RULE_CHARS) {
    throw new AnalyzeError("too_long", "rule must be " + MAX_RULE_CHARS + " characters or fewer", 400);
  }
  if (!opts.apiKey) throw new AnalyzeError("not_configured", "the scoring service is not configured", 500);

  // Only English rules are supported; reject other languages before a paid call.
  const language = detectLanguage(text);
  if (!language.english) {
    return { status: "not_english", language: { code: language.code, name: language.name }, findings: [] };
  }

  const body = await askJev(text, opts);
  const a = validatedAnswers(body);
  const risk = Math.max(a.control.noul, a.premise.noul);
  const inputTokens = body.usage?.input_tokens;
  const tokens = Number.isSafeInteger(inputTokens) && inputTokens >= 0 ? inputTokens : null;

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
      rule_role: { choice: a.candidate_role.choice, confidence: +a.candidate_role.confidence.toFixed(2) },
    },
    tokens,
  };
}

module.exports = { analyze, AnalyzeError, MAX_RULE_CHARS, REVIEW, BLOCK, CONFIDENT };
