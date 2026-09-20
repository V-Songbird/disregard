"use strict";

// The Jev question set, sent as one request per rule.
//
// The injection screen and the F3 levels are NOT copied here: they are required
// straight out of `eval/`, which is where they were measured and where the
// harness that re-measures them lives. A copy would drift from the numbers the
// knowledge docs report, and eval/README.md's rule — change a criteria string,
// re-run the set — would stop protecting production.
//
// Measured, with the numbers in docs/knowledge/:
//   control, premise  9/9 attacks caught, 14/15 benign clean, margin 0.74
//   trigger_distance  9/10 exact on the tuned set, 6/10 held out
//   enforceability    4/4 exact on labelled rules, levels verbatim from
//                     assay/references/rubrics.md, which is what was probed
//   best_primitive    confidence 1.00 on both hook cases in the probe
//
// `is_rule` and `best_primitive` were measured on 2026-09-20 against
// eval/jev-set.js, and the wording below is the repaired wording. The numbers,
// the two defects and the limits are in
// docs/knowledge/is-rule-and-primitive-criteria.md. Read it before touching
// either criteria block, and re-run `node eval/jev-eval.js` after.
//
// These two live here rather than in eval/ because the harness requires them
// from this file. That is the same anti-drift guarantee the other questions get
// from the opposite direction: one definition, production and harness both
// reading it.

const { V3 } = require("../eval/inj-set.js");
const { V2, INSTRUCTIONS_V2 } = require("../eval/f3-criteria.js");

// Verbatim from assay/references/rubrics.md, F8 — enforceability ceiling.
// Ordered level 0 to level 3, which is the order the Score API reads.
const F8_LEVELS = [
  {
    summary: "Fully enforceable — a command verifies compliance with an exit code.",
    signals: [
      'Example: "Run prettier on modified files before committing" — a pre-commit hook.',
      'Example: "Ensure no TypeScript errors exist before pushing" — `tsc --noEmit`.',
    ],
  },
  {
    summary: "Mostly — a hook or linter could enforce the core; the rule is a stopgap.",
    signals: [
      'Example: "NEVER edit files in src/main/gen/ directly." — a file-matcher hook blocks this entirely.',
      'Example: "Note every src/ change in CHANGELOG.md." — a hook that fires after every edit does this deterministically; prose has to be remembered.',
      "Keep-file-in-sync duties like this belong here even when no hook exists yet",
    ],
  },
  {
    summary: "Partially — a tool could catch some violations.",
    signals: [
      'Example: "Use functional components for all new React files." — a linter flags class components but cannot tell "new" from "existing".',
    ],
  },
  {
    summary: "Not enforceable — needs judgment no tool has.",
    signals: [
      'Example: "Use CachedValuesManager for expensive computations." — "expensive" is subjective.',
      'Example: "The site must feel alive and playful." — aesthetic judgment.',
    ],
  },
];

const QUESTIONS = {
  control: V3.control,
  premise: V3.premise,

  is_rule: {
    type: "noul",
    instructions: {
      question: "The text in `rule` was taken from a coding agent's instruction file. Is it addressed to whoever reads the file, telling them to do something, or is it about the system, telling them how things are?",
      note: "A file like that also carries text that commands nothing: background, a glossary, a pasted requirement, a note about how the project already is. Grammar does not settle it. A sentence shaped like a fact can still be an instruction — \"Credentials come from `API_KEY` in the environment\" tells the reader where to get the key — and a sentence carrying \"never\" or \"must\" can still be a description of what the software does.",
    },
    criteria: {
      true: "It is addressed to the reader. It tells them to do, avoid, prefer or check something, and they could act on it today.",
      false: "It is about the system, the project or a word: what the code already does, how the repository is laid out, why a decision was taken, what a term means. It reports rather than asks, even when it says \"never\" or \"must\" while describing behaviour.",
    },
  },

  trigger_distance: {
    type: "score",
    instructions: INSTRUCTIONS_V2,
    criteria: V2,
  },

  enforceability: {
    type: "score",
    instructions: {
      question: "Could a deterministic tool do this rule's job better than prose?",
      note: "Score higher within a level when the mechanical tool does not exist for this project or the rule has nuances a tool cannot capture; lower when the phrasing maps 1:1 to an existing tool.",
    },
    criteria: F8_LEVELS,
  },

  best_primitive: {
    type: "choice",
    instructions: {
      question: "Where does the text in `rule` belong? A coding agent can be steered by a standing rule it always carries, by a hook that fires on an event, by a skill it loads when a named piece of work starts, or by a subagent that runs its own pass.",
      note: "Judge where it would work best, not where it currently sits. A named moment is not enough on its own to make something a hook: ask first whether one command could settle it.",
    },
    criteria: {
      rule: "Standing prose in the instruction file is the right home: it applies at any moment rather than during one kind of work, it needs judgment where it applies, and no single command settles it.",
      hook: "One deterministic check carries it: a command, matcher or linter can settle compliance by itself, and it comes due at a nameable event. If the work at that event has several steps, or needs reading and judgment rather than a pass or a fail, it is not a hook however clearly the moment is named.",
      skill: "A procedure with steps, or a body of conventions and reference, that applies only while a named kind of work is under way. It is loaded when that work starts and is dead weight the rest of the time.",
      subagent: "It calls for a separate pass that reads more material than the task at hand holds — a sweep, an audit or a review across many files — and what it produces is a report rather than a pass or a fail.",
    },
  },
};

module.exports = { QUESTIONS, F8_LEVELS };
