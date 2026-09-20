"use strict";

// The deterministic half of the rule scorer: F1 verb force, F2 prohibition
// framing, F7 concreteness. Ported verbatim out of assay's `scripts/assay.js`
// (the plugin is being retired) so the app does not depend on a repository that
// is going away. Only these three factors came across; F4 and F5 need a whole
// file and a corpus, which this app does not have.
//
// The F2 behaviour here is the fixed one — `prohibition_alternative_unproven`,
// measured 0/28 on the labelled corpus in test/f2-prohibition-corpus.test.js.
// Read that file before changing anything in the prohibition branch.

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const VERB_TIERS_RAW = [
  { score: 1.0, label: "unconditional_mandate", verbs: ["must", "required"] },
  { score: 0.95, label: "strong_prohibition", verbs: ["never", "do not", "don't", "forbidden", "cannot", "must not"] },
  {
    score: 0.85, label: "bare_imperative", verbs: [
      "use", "run", "ensure", "place", "return", "validate", "add", "create", "implement", "include",
      "set", "write", "check", "apply", "import", "export", "call", "pass", "configure", "define",
      "make", "keep", "follow", "put", "handle", "wrap", "throw", "catch", "extend", "override",
      "test", "verify", "assert", "name", "format", "structure", "organize", "separate", "split",
      "merge", "combine", "convert", "transform", "parse", "serialize", "render", "display", "log",
      "track", "store", "save", "load", "read", "delete", "remove", "update", "replace", "insert",
      "append", "prepend", "edit", "modify", "regenerate", "rebuild", "restart", "install", "deploy",
      "commit", "push", "pull", "fetch", "rebase", "tag", "release", "document", "annotate",
      "refactor", "migrate", "initialize", "register", "enable", "disable", "allow", "block",
      "reject", "accept", "emit", "publish", "subscribe", "listen", "watch", "mount", "unmount",
      "report", "record", "reset", "revert", "avoid", "enforce", "restrict", "limit", "generate",
      "execute", "maintain", "expose", "guard", "preserve", "notify", "specify", "invoke", "compose",
      "bind", "defer", "inline", "encrypt", "decrypt", "sanitize", "normalize", "optimize", "lint",
      "retry", "abort", "cache", "pin", "scope", "flush", "throttle", "debounce", "suppress",
      "freeze", "truncate", "rotate", "scaffold", "bootstrap", "populate", "drain", "terminate",
      "preload", "paginate", "escalate", "centralize", "standardize", "prioritize", "coordinate",
      "minimize", "authenticate", "authorize", "archive", "batch", "aggregate", "benchmark",
      "profile", "isolate", "provision", "orchestrate", "coerce", "cut", "drop",
      // [F2 corpus] Plain imperatives the list was missing. Their absence made
      // a real replacement clause invisible to hasPositiveImperative, which is
      // how a ban that named its alternative scored as bare.
      // Unambiguous verbs only: a word that is also a common noun ("state",
      // "search", "respect", "stop") would read "Shell state does not persist"
      // as an imperative, which is the substring mistake this corpus exists to
      // catch in other people'"'"'s tools.
      "supply", "retain", "inspect", "consolidate", "exclude", "reuse",
      "establish", "delegate", "broaden", "redact"
    ]
  },
  { score: 0.7, label: "advisory", verbs: ["should", "always"] },
  { score: 0.5, label: "preference", verbs: ["prefer", "default to", "favor"] },
  { score: 0.3, label: "suggestion", verbs: ["consider", "aim to", "where practical"] },
  { score: 0.2, label: "hedged", verbs: ["try to", "try to prefer", "where possible", "when you can"] },
  { score: 0.1, label: "weak_suggestion", verbs: ["you might want to", "it's worth", "keep in mind"] },
];
const IMPLICIT_VERB_DEFAULT = 0.7;

// Flattened, pattern-precompiled, longest-first.
const VERB_TIERS = [];
for (const tier of VERB_TIERS_RAW) {
  for (const verb of tier.verbs) {
    VERB_TIERS.push({
      verb,
      score: tier.score,
      label: tier.label,
      pattern: new RegExp("(?:^|[\\s,;(])(" + escapeRe(verb) + ")(?:[\\s,;.)!?]|$)"),
    });
  }
}
VERB_TIERS.sort((a, b) => b.verb.length - a.verb.length);

const ALL_VERBS = new Set(VERB_TIERS.map((t) => t.verb));

const PROHIBITION_MARKERS = ["never ", "do not ", "don't ", "avoid ", "must not "];
// A prohibition marker only counts when it leads its clause — "those APIs
// don't exist" is a statement of fact, not a directive, and must not read as
// a stall-risk prohibition. Mid-clause directives still match after
// punctuation, a dash, an opening quote/paren, or bold markers.
const PROHIBITION_CLAUSE_RE = new RegExp(
  "(?:^|[.!?;:,]\\s|[—–]\\s?|[(\"*])(?:" +
  ["never", "do not", "don't", "avoid", "must not"].map((m) => escapeRe(m)).join("|") +
  ")\\b"
);
const HEDGED_MARKERS = ["prefer ", "default to ", "when possible"];
const ALTERNATIVE_MARKERS = ["instead", " rather than "];

const CONCRETE_REGEX = [
  /`[^`]+`/g,
  /\b[A-Z][a-zA-Z]+(?:Manager|Service|Controller|Factory|Builder|Handler|Provider|Repository|Validator|Schema|Config|Context|Store|Router|Middleware|Plugin|Hook|Component|Module|Interface|Type|Enum|Error|Exception)\b/g,
  /\b\w+\.(?:ts|tsx|js|jsx|py|rs|go|java|rb|md|json|yaml|yml|toml|css|scss|html|sql|sh|bash)\b/g,
  /(?:src|lib|test|tests|spec|specs|components|pages|api|utils|hooks|services|models|types|config|scripts)\/[\w/.-]+/g,
  /\b(?:React|Vue|Angular|Express|Django|Flask|FastAPI|Spring|Rails|Next|Nuxt|Svelte|Tailwind|TypeScript|Zod|Prisma|Jest|Vitest|pytest|JUnit|ESLint|Prettier|Webpack|Vite|Docker|Kubernetes|GraphQL|REST|gRPC|Redis|PostgreSQL|MongoDB|MySQL|SQLite)\b/g,
];

// Bright-line numeric thresholds count as concrete markers — they turn an
// adjective ("short", "soon") into something mechanically checkable.
const NUMERIC_THRESHOLD_REGEX = [
  /\b(?:fewer|less|more|greater|under|over|above|below|at\s+most|at\s+least|no\s+more\s+than|no\s+less\s+than|no\s+fewer\s+than|up\s+to)\s+(?:than\s+)?\d+(?:\.\d+)?\s*(?:%|(?:ms|milliseconds?|sec(?:ond)?s?|min(?:ute)?s?|hours?|days?|weeks?|months?|years?|kb|mb|gb|bytes?|chars?|characters?|words?|lines?|items?|entries|rows?|examples?|pages?|files?)\b)?/gi,
  /\b\d+(?:\.\d+)?\s*(?:%|(?:ms|milliseconds?|sec(?:ond)?s?|min(?:ute)?s?|hours?|days?|weeks?|months?|years?|kb|mb|gb|bytes?|chars?|characters?|words?|lines?|items?|entries|rows?)\b)/gi,
  /\bbetween\s+\d+(?:\.\d+)?\s+and\s+\d+(?:\.\d+)?\b/gi,
];

// [F1/F7 corpus] The list above matches marketing capitalization only, so a
// real bullet naming `prettier`, `zod` or `npm` scored 0.05 and raised
// "nothing here is checkable" over a line that names its tool. Measured: all
// three anchor false alarms on the corpus. Only tokens that are never ordinary
// English go here — `Next`, `REST`, `Express`, `Spring` and `Rails` stay
// case-sensitive above, because "the next step" and "the rest of the file" are
// not anchors.
const TOOL_NAME_REGEX = [
  /\b(?:npm|pnpm|yarn|npx|nvm|fnm|pipenv|poetry|gradle|maven)\b/gi,
  /\b(?:prettier|eslint|stylelint|biome|tsc|typescript|babel|webpack|rollup|esbuild|vite|turbopack)\b/gi,
  /\b(?:jest|vitest|pytest|junit|playwright|cypress|mypy|ruff|pylint|flake8)\b/gi,
  /\b(?:zod|prisma|drizzle|sqlalchemy|django|flask|fastapi|tailwind|nuxt|svelte|vue|angular)\b/gi,
  /\b(?:docker|dockerfile|kubectl|kubernetes|terraform|ansible|wrangler|vercel|netlify)\b/gi,
  /\b(?:postgres|postgresql|mongodb|sqlite|mysql|redis|graphql|grpc)\b/gi,
];

const ABSTRACT_MARKERS = [
  "good", "appropriate", "reasonable", "clean", "thoughtful", "proper", "correct", "careful",
  "best practice", "when possible", "where practical", "as needed", "properly", "correctly",
  "carefully", "error handling", "naming", "code quality", "best practices", "maintainable",
  "readable", "scalable", "efficient", "expensive", "simple", "clear", "obvious", "intuitive",
];

const CONCRETE_TERMS = [
  "functional components", "class components", "named exports", "default exports", "barrel exports",
  "type aliases", "interfaces", "enums", "generics", "strict mode", "strict null checks",
  "type guards", "type assertions", "arrow functions", "async functions", "generator functions",
  "unit tests", "integration tests", "end-to-end tests", "snapshot tests", "pre-commit hook",
  "pre-push hook", "commit message", "pull request", "middleware", "error boundary",
  "higher-order component", "custom hook", "dependency injection", "API endpoint", "REST API",
  "GraphQL query", "GraphQL mutation", "database migration", "schema migration", "seed data",
  "environment variable", "config file", "secrets manager", "CI pipeline", "CD pipeline",
  "build step", "deploy step", "code review", "merge request", "branch protection", "linter rule",
  "formatter config", "tsconfig", "eslint config", "request body", "response body",
  "query parameter", "path parameter", "handler boundary", "controller layer", "service layer",
  "repository layer", "connection pool", "input validation", "type guard", "type assertion",
  "type narrowing",
];

const RULE_KEYWORD_STOPWORDS = new Set([
  "the", "and", "for", "all", "new", "with", "not", "use", "when", "this", "that", "from",
  "into", "over", "than", "must", "should", "always", "never", "before", "after", "each",
  "every", "where", "only", "also", "just", "about", "more", "most", "some", "any",
]);

const GENERIC_BACKTICK_WORDS = new Set([
  "code", "it", "them", "here", "there", "thing", "things", "stuff", "file",
  "files", "folder", "folders", "name", "names", "value", "values", "data",
  "text", "item", "items", "one", "good", "bad", "ok", "yes", "etc",
]);

const NOUN_VERB_AMBIGUOUS = new Set([
  "document", "format", "log", "name", "set", "watch", "report", "display", "record", "test",
  "check", "cache", "scope", "limit", "batch", "profile", "audit", "benchmark", "aggregate",
  "archive", "guard", "pin", "drain",
]);
const NOUN_FOLLOWERS = new Set([
  "headers", "files", "strings", "entries", "requests", "messages", "logs", "values", "types",
  "fields", "options", "conventions", "names", "rules", "paths", "settings", "keys", "items",
  "objects", "results", "records", "operations", "endpoints", "variables", "pages", "data",
  "clauses", "layers", "levels", "lines", "traits", "pipes", "pools", "connections", "events",
  "configs",
]);

function looksLikeStatement(lower) {
  const starts = [
    /^(?:all|each|every|the|a|an|this|that|these|those)\s/,
    /^(?:files?|code|modules?|components?|functions?|classes|methods)\s/,
    /^tests?\s+(?!the\s|a\s|an\s)/,
  ];
  if (starts.some((p) => p.test(lower))) return true;
  const words = lower.split(/\s+/);
  return words.length >= 2 && NOUN_VERB_AMBIGUOUS.has(words[0]) && NOUN_FOLLOWERS.has(words[1]);
}

function leadingVerb(text) {
  const lower = text.toLowerCase().replace(/^[^a-z]+/, "");
  for (const t of VERB_TIERS) {
    if (!lower.startsWith(t.verb)) continue;
    const rest = lower.slice(t.verb.length);
    if (rest === "" || /^[\s,;.)!?]/.test(rest)) return t.verb;
  }
  return null;
}

// [F1 corpus] `consider` is the only verb in the hedging tiers that doubles as
// an ordinary transitive verb. "Consider adding a test" is a suggestion;
// "Consider all inputs untrusted" means *regard* them as untrusted, which is a
// directive and was scoring 0.30 hedged. What follows decides it: `whether`,
// `if`, or a gerund of a verb this file already knows. Checking the stem against
// ALL_VERBS rather than matching /\w+ing/ is what keeps "Consider everything in
// `/tmp` disposable" out — "everything" ends in -ing and is not a gerund.
function considerSuggests(rest) {
  const m = /^consider\s+(\w+)/.exec(rest);
  if (!m) return false;
  const w = m[1];
  if (w === "whether" || w === "if") return true;
  if (!w.endsWith("ing")) return false;
  const stem = w.slice(0, -3);
  const doubled = stem.length > 1 && stem[stem.length - 1] === stem[stem.length - 2];
  return ALL_VERBS.has(stem) || ALL_VERBS.has(stem + "e") ||
    (doubled && ALL_VERBS.has(stem.slice(0, -1)));
}

function scoreF1(text) {
  const lower = text.toLowerCase();
  const matches = [];
  for (const t of VERB_TIERS) {
    const m = t.pattern.exec(lower);
    if (m) matches.push({ verb: t.verb, score: t.score, label: t.label, pos: m.index });
  }
  if (!matches.length) {
    if (looksLikeStatement(lower)) return { value: IMPLICIT_VERB_DEFAULT, method: "implicit_imperative_default", matchedVerb: null };
    return { value: null, method: "extraction_failed", matchedVerb: null };
  }
  for (const m of matches) {
    if (m.verb === "consider" && !considerSuggests(lower.slice(m.pos).replace(/^\W+/, ""))) {
      m.score = 0.85;
      m.label = "bare_imperative";
    }
  }
  const bestScore = Math.max(...matches.map((m) => m.score));
  if (looksLikeStatement(lower) && bestScore <= 0.85) {
    return { value: IMPLICIT_VERB_DEFAULT, method: "implicit_imperative_default", matchedVerb: null };
  }
  // [Foreman: 075] A hedge governs the force of the whole sentence, downward,
  // however firm the rest of it sounds. "Always try to use functional components"
  // used to score 1.00: the always+imperative upgrade beat a weakest-hedge branch
  // that only ran on two hedges or more. One hedge is a hedge, so the weakest one
  // wins outright and no upgrade can climb back over it.
  const hedgingLabels = new Set(["hedged", "suggestion", "weak_suggestion", "preference"]);
  // [F1 corpus] A hedge governs the sentence it *leads*. It does not govern one
  // a prohibition already opened: in "Do not try to work around the sandbox" the
  // hedge sits inside what is banned, and in "Avoid `any`; prefer `unknown`" it
  // introduces the replacement. Both are absolute rules and their force is the
  // ban's. A hedge ahead of the ban still wins — "Where possible, do not use
  // `any`" really is hedged. Measured: 3 of 4 hedge false alarms on the corpus,
  // 0 real hedges lost, because a real hedge leads its own clause.
  const ban = PROHIBITION_CLAUSE_RE.exec(lower);
  const banAt = ban ? ban.index : Infinity;
  const hedges = matches.filter((m) => hedgingLabels.has(m.label) && m.pos < banAt);
  if (hedges.length) {
    const weakest = hedges.reduce((a, b) => (a.score <= b.score ? a : b));
    return { value: weakest.score, method: "lookup", matchedVerb: weakest.verb, hedged: true };
  }
  if (matches.some((m) => m.verb === "always")) {
    const imperative = matches.find((m) => m.verb !== "always" && m.label === "bare_imperative");
    if (imperative) return { value: 1.0, method: "lookup", matchedVerb: "always + " + imperative.verb };
  }
  const best = matches.reduce((a, b) => (a.score >= b.score ? a : b));
  return { value: best.score, method: "lookup", matchedVerb: best.verb };
}

// [F2 corpus] A replacement stated as a preference is still a replacement.
// "Do not assume Unix utilities are installed. Prefer available agent tools"
// names what to do instead; requiring a bare imperative read that as a bare ban.
const DIRECTIVE_LABELS = new Set([
  "bare_imperative", "unconditional_mandate", "advisory", "preference",
]);

function hasPositiveImperative(text) {
  const lower = text.toLowerCase().trim();
  if (PROHIBITION_MARKERS.some((p) => lower.startsWith(p.trim()))) return false;
  for (const t of VERB_TIERS) {
    if (DIRECTIVE_LABELS.has(t.label) && t.pattern.test(lower)) return true;
  }
  return false;
}

function hasContrastNot(text) {
  if (/`[^`]+`\s*[,;:]?\s+not\s+`[^`]+`/.test(text)) return true;
  const negations = [
    /\b(?:is|are|was|were|be|been|being)\s+not\b/i,
    /,\s+not\s+\w+(?:ing|ed|ly)\b/i,
    /,\s+not\s+\w+\s+(?:on|to|in|with|from|by|at|of|as|for|after|before)\b/i,
  ];
  if (negations.some((p) => p.test(text))) return false;
  return /,\s+not\s+\w+/i.test(text);
}

// Sentence boundary: a terminator, whitespace, then something that can open a
// new sentence (a capital, a code span, bold, or a quote).
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z`*_"'])/;
const CLAUSE_SPLIT = /(?<=[.!?])\s+(?=[A-Z`*_"'])|[;—–]\s*|,\s+/;

function isProhibitionText(text) {
  const lower = text.toLowerCase();
  // "must not" is deontic — it never appears in a factual negation — so it
  // counts as a prohibition anywhere, even after a subject ("tests must not X").
  return PROHIBITION_CLAUSE_RE.test(lower) || lower.includes("must not ");
}

// [Foreman: 069]
// Content words of a clause, for deciding whether one clause is about the same
// thing as another: case-folded, plural/participle endings shaved off, and the
// words that carry no topic — stopwords and the imperative verb vocabulary —
// dropped. Deliberately crude; it only ever answers "same subject matter?".
function contentTokens(text) {
  const tokens = new Set();
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9_-]*/g) || []) {
    if (w.length < 2 || RULE_KEYWORD_STOPWORDS.has(w) || ALL_VERBS.has(w)) continue;
    tokens.add(w.replace(/(?:ies|es|s)$/, "").replace(/(?:ing|ed)$/, ""));
  }
  return tokens;
}

// [Foreman: 069]
// A prohibition is only rescued by an alternative that plausibly replaces the
// banned thing. Three deterministic signals: the alternative points back at the
// ban ("instead", "rather than"), it names something the ban named, or it
// performs the very action the ban forbade on a different object ("Never use
// `var`." / "Use `const` for locals."). An unrelated directive standing next to
// a prohibition leaves it exactly as bare as no directive at all.
function resolvesProhibition(banned, alternative) {
  const alt = alternative.toLowerCase();
  if (ALTERNATIVE_MARKERS.some((m) => alt.includes(m.trim()))) return true;
  const bannedLower = banned.toLowerCase();
  const bannedTokens = contentTokens(bannedLower);
  for (const t of contentTokens(alt)) {
    if (bannedTokens.has(t)) return true;
  }
  const verb = leadingVerb(alternative);
  return verb !== null && new RegExp("\\b" + escapeRe(verb) + "\\b").test(bannedLower);
}

// [F2 corpus] A ban that carries its own exception is not a ban with nowhere to
// go: "without explicit authorization" tells the agent exactly how to proceed.
const BAN_EXCEPTION_RE = /\b(?:unless|except|without|until)\b/i;

function scoreF2(text) {
  const lower = text.toLowerCase();
  const isProhibition = isProhibitionText(text);
  const isHedged = HEDGED_MARKERS.some((p) => lower.includes(p));
  const hasAlternative = ALTERNATIVE_MARKERS.some((p) => lower.includes(p)) || hasContrastNot(text);

  if (isProhibition) {
    // Prohibition + named alternative is the strongest framing; a prohibition
    // without one converts blocked tasks into stalls, not compliance.
    const clauses = text.split(CLAUSE_SPLIT).map((c) => c.trim()).filter(Boolean);
    const banned = clauses.find(isProhibitionText) || text;
    const rescued = clauses.some((c) => c !== banned && hasPositiveImperative(c) && resolvesProhibition(banned, c));
    if (hasAlternative || rescued || BAN_EXCEPTION_RE.test(banned)) {
      return { value: 0.95, category: "prohibition_with_alternative" };
    }
    // [F2 corpus] Measured on real instruction files: `stallRisk` fired on 10 of
    // 37 bullets in a live CLAUDE.md and 9 named their replacement plainly. The
    // replacement usually sits in a neighbouring sentence sharing no words with
    // the ban — "use installed Edge … Do not probe or install bundled Chromium"
    // — and no lexical test reaches that, because knowing Edge replaces Chromium
    // is world knowledge. So relatedness stays unproven rather than being
    // guessed: a bullet that offers the agent somewhere else to go is reported
    // as weak framing, and only a ban standing completely alone keeps the
    // grade-capping verdict. See tests/f2-prohibition-corpus.test.js.
    const elsewhere = clauses.filter((c) => c !== banned);
    const hasDirective = elsewhere.some(hasPositiveImperative);
    const namesArtifact = elsewhere.some((c) => scoreF7(c).concrete.length > 0);
    if (hasDirective || namesArtifact) {
      return { value: 0.6, category: "prohibition_alternative_unproven" };
    }
    return { value: 0.2, category: "bare_prohibition", stallRisk: true };
  }
  if (isHedged) return { value: 0.35, category: "hedged_preference" };
  if (hasAlternative) return { value: 0.95, category: "positive_with_alternative" };
  return { value: 0.85, category: "positive_imperative" };
}

function isConcreteBacktick(span) {
  const s = span.trim();
  if (!s) return false;
  if (/[^A-Za-z]/.test(s)) return true;
  if (/[A-Z]/.test(s)) return true;
  const lower = s.toLowerCase();
  return !GENERIC_BACKTICK_WORDS.has(lower) && !RULE_KEYWORD_STOPWORDS.has(lower);
}

function scoreF7(text) {
  const markers = [];
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    if (isConcreteBacktick(m[1])) markers.push(m[1]);
  }
  const stripped = text.replace(/`[^`]+`/g, "");
  for (const pattern of [...CONCRETE_REGEX.slice(1), ...TOOL_NAME_REGEX]) {
    for (const m of stripped.matchAll(pattern)) {
      if (!markers.some((x) => x.toLowerCase() === m[0].toLowerCase())) markers.push(m[0]);
    }
  }
  for (const pattern of NUMERIC_THRESHOLD_REGEX) {
    for (const m of stripped.matchAll(pattern)) {
      const phrase = m[0].trim();
      if (!markers.some((x) => x.includes(phrase) || phrase.includes(x))) markers.push(phrase);
    }
  }
  const lower = text.toLowerCase();
  const markersLower = markers.map((m) => m.toLowerCase());
  for (const term of CONCRETE_TERMS) {
    const termLower = term.toLowerCase();
    if (lower.includes(termLower) && !markersLower.some((m) => m.includes(termLower) || termLower.includes(m))) {
      markers.push(term);
      markersLower.push(termLower);
    }
  }
  const abstract = ABSTRACT_MARKERS.filter((a) => lower.includes(a));

  const c = markers.length, a = abstract.length;
  let value;
  if (c === 0 && a === 0) value = 0.05;
  else if (c === 0) value = 0.1;
  else if (a === 0) value = c >= 4 ? 0.95 : c >= 2 ? 0.85 : 0.8;
  else {
    const ratio = c / (c + a);
    if (ratio >= 0.8) value = 0.75 + 0.1 * Math.min(c / 4, 1);
    else if (ratio >= 0.5) value = 0.45 + 0.2 * ratio;
    else if (ratio >= 0.25) value = 0.25 + 0.15 * ratio;
    else value = 0.1 + 0.1 * ratio;
  }
  return { value: Math.round(value * 100) / 100, concrete: markers, abstract };
}

module.exports = { scoreF1, scoreF2, scoreF7, VERB_TIERS, IMPLICIT_VERB_DEFAULT };
