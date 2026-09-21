"use strict";
// The labelled set: every worked example in research/rubrics.md that carries an
// explicit F3 target, plus its rubric level. These are the only F3 cases
// anywhere with a stated ground truth.
const LABELLED = [
  { id: "getProjectCommands", level: 4, target: 0.95, text: "Use `getProjectCommands(project)` not `.database.commands`" },
  { id: "barrel-imports",     level: 4, target: 0.95, text: "Each test file must import from the module it tests, not from barrel exports" },
  { id: "grammar-psi",        level: 3, target: 0.75, text: "When adding new grammar rules, add corresponding PSI visitor methods and test coverage." },
  { id: "functional-new",     level: 3, target: 0.80, text: "Use functional components for all new React files." },
  { id: "state-synced",       level: 2, target: 0.45, text: "Every commit modifying src/ MUST end with [State: SYNCED]" },
  { id: "prettier-commit",    level: 2, target: 0.50, text: "Run prettier on modified files before committing" },
  { id: "aquatic",            level: 1, target: 0.20, text: "The site must feel alive, playful, and aquatic." },
  { id: "try-prefer",         level: 1, target: 0.25, text: "Try to prefer functional components when possible" },
  { id: "changelog",          level: 1, target: 0.15, text: "Keep CHANGELOG.md updated." },
  { id: "optimized-files",    level: 0, target: 0.00, text: "All files are optimized for agent consumption." },
];

// v1 — what the first probe sent. Comparative, relative phrasing.
const V1 = [
  "No trigger: the line is a statement or description, not an instruction. Nothing is asked for.",
  "Abstract: it asks for a disposition or a standing quality, not a trigger-action pair. There is no moment the agent could check itself against.",
  "Distant: it names a firing moment, but that moment arrives many steps after the rule was read, and the agent must independently remember to check for it.",
  "Soon: the action happens during the same task as the trigger, one step later.",
  "Immediate: the action is the same operation as the trigger; recognizing the moment and doing the thing are one act.",
];

// v2 — each level a standalone situation. The docs are explicit that the model
// "evaluates each level independently without seeing neighbors or numbering",
// so every comparative word in v1 ("many steps after", "one step later",
// "Soon", "Distant") was describing a gap the model could not see. v2 replaces
// them with the concrete situation the rule is in, plus signals and a real
// example rule, which is what the docs ask for when adjacent levels split.
const V2 = [
  {
    summary: "The line reports how the project already is. It asks nobody to do anything.",
    signals: [
      "It states a fact about the files, the code, or the team",
      "Nothing at all would be done differently by someone who read it",
      "It reads like a sentence from a status report",
      'Example: "All files are optimized for agent consumption."',
    ],
  },
  {
    summary: "It asks for a standing quality that is supposed to hold at all times, so there is no particular occasion on which it comes due.",
    signals: [
      "It asks for a feeling, a style, or a condition to be maintained",
      "No action, file, command or project phase is named as the occasion",
      "Someone could read it, work all day, and never hit a point where it obviously applied",
      "Any occasion it does give is a condition rather than an event: \"when possible\", \"where practical\", \"as needed\" name nothing that happens",
      'Example: "The site must feel alive, playful, and aquatic."',
      'Example: "Keep CHANGELOG.md updated."',
    ],
  },
  {
    summary: "It comes due at a checkpoint in the session — committing, pushing, releasing, opening a pull request, handing work back — which the worker has to notice arriving while busy with something else.",
    signals: [
      "The occasion is the work being wrapped up, submitted, released or handed over",
      "Merely mentioning an artifact such as a commit message is not this: the occasion has to be the moment of wrapping up, not a thing that gets named",
      "The instruction is read at the start of the work and comes due at the end of it",
      "Whatever the worker is editing right now gives no hint that this applies",
      "Obeying it means interrupting one activity to go and do another",
      'Example: "Run prettier on modified files before committing."',
      'Example: "Every commit modifying src/ MUST end with [State: SYNCED]"',
    ],
  },
  {
    summary: "It comes due inside the piece of work already under way: the worker is handling the exact kind of thing the instruction is about, and what it asks for is the next part of that same job.",
    signals: [
      "The named occasion is creating or changing a particular kind of file",
      "The worker is already looking at the thing the instruction names",
      "What it asks for follows on from an edit that is already in progress",
      "No separate activity has to be remembered later",
      'Example: "When adding new grammar rules, add corresponding PSI visitor methods and test coverage."',
      'Example: "Use functional components for all new React files."',
    ],
  },
  {
    summary: "Noticing that it applies and obeying it are the same act: at the moment of writing the line, it says which form to write.",
    signals: [
      "It names which call, symbol, import or spelling to use as the line is typed",
      "There is nothing to remember, because the choice it governs is the one being made",
      "It governs the very characters being written",
      "A standing rule about how to perform an operation belongs here too: it comes due at the moment that operation is performed, with nothing to remember beforehand",
      'Example: "Use `getProjectCommands(project)` not `.database.commands`"',
      'Example: "Each test file must import from the module it tests, not from barrel exports"',
    ],
  },
];

const INSTRUCTIONS_V1 = "Rate how close the rule's stated firing moment sits to the action it asks for. A firing moment is the action, file, or phase that should make the agent notice the rule applies now.";
const INSTRUCTIONS_V2 = {
  question: "The text in `rule` is a standing instruction someone will read once, at the start of a piece of work, and is then expected to obey later. How much of a gap is there between reading it and the occasion on which it comes due?",
  note: "Judge only the gap, not whether the instruction is good, specific, or worth following. An instruction with no occasion at all is not a small gap; it is a missing one.",
};

// Held out, and spent: V2's "merely mentioning an artifact" signal was written
// from `english-docs` below, so this set is a regression guard now. Levels were
// assigned by hand from the rubric's definitions, not by the rubric's own worked
// examples. Build a fresh set rather than reporting this one as a measurement.
const HELDOUT = [
  { id: "temp-files-report", level: 2, text: "Before the final report of a task, list temporary files you created outside the session scratchpad." },
  { id: "english-docs",      level: 1, text: "Keep code comments, identifiers, commit messages, and documentation in English." },
  { id: "lastexitcode",      level: 4, text: "In PowerShell, capture `$LASTEXITCODE` immediately after native commands." },
  { id: "run-checks",        level: 2, text: "After changes, run relevant checks and required project checks." },
  { id: "select-object",     level: 4, text: "In PowerShell use `Select-Object -First/-Last` or a filter; `head` and `tail` are not available there." },
  { id: "read-before-edit",  level: 3, text: "Read applicable project instructions and relevant implementation before editing." },
  { id: "exclude-deps",      level: 1, // re-labelled: names WHAT to exclude but never says when; "by default" is a standing condition, not an event
   text: "Exclude dependencies, generated files, lockfiles, and minified bundles by default." },
  { id: "not-predictor",     level: 0, text: "assay is not a rule-compliance predictor." },
  { id: "rename-refs",       level: 3, text: "When a change renames, moves or deletes a file, search the project docs for the old names and fix references that became false." },
  { id: "no-recursive",      level: 3, // re-labelled: L4 was aggressive; the ban shapes a command you may or may not be about to write
   text: "Never run unconstrained recursive searches from home or filesystem roots." },
];

module.exports = { LABELLED, HELDOUT, V1, V2, INSTRUCTIONS_V1, INSTRUCTIONS_V2 };
