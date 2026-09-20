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
// UNMEASURED: `is_rule` and the `best_primitive` rubrics below. The probe ran an
// `is_rule` Noul and got 0.88–0.97 on six rules that were all rules, so it has
// never been shown a non-rule, and the wording here is not the wording it used —
// that script is gone. Both need a labelled set before anything leans on them.

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
      question: "The text in `rule` was taken from a coding agent's instruction file. Does it direct the agent to do something, so that a reader could act on it?",
      note: "A file like that also carries text that commands nothing: background, a glossary, a pasted requirement, a note about how the project already is.",
    },
    criteria: {
      true: "It tells whoever reads it to do, avoid, prefer or check something, and a reader could act on it.",
      false: "It describes, explains or records something — a fact about the code, the project's history, background, or a definition — and asks for no action.",
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
      note: "Judge where it would work best, not where it currently sits.",
    },
    criteria: {
      rule: "Standing prose in the instruction file is the right home: it needs judgment at the moment it applies, and no tool or separate procedure would carry it better.",
      hook: "A deterministic hook or linter should carry it: it comes due at a nameable event, and compliance can be settled by a command rather than remembered.",
      skill: "It is a procedure or a body of reference to load when a named piece of work starts, too long to keep in front of the agent at all times.",
      subagent: "It calls for a separate pass with its own context — a sweep, an audit or a review over more material than the task at hand holds.",
    },
  },
};

module.exports = { QUESTIONS, F8_LEVELS };
