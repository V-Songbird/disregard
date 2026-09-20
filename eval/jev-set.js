"use strict";

// Labelled sets for the two Jev questions that shipped unmeasured: `is_rule`
// and `best_primitive`. Everything else the app asks was validated in this
// folder first; these two were not, and `lib/questions.js` says so at the top.
//
// `is_rule` had been shown six rules, all of which were rules. A question that
// has never been shown a negative has not been tested, so half of IS_RULE is
// text that commands nothing — the background, definitions, status claims and
// recorded decisions a real instruction file carries alongside its rules.
//
// The label follows one stated test, so a reader can check each one rather than
// trust it: **can a reader change what they do because of this sentence?** Yes
// is a rule. A sentence that only informs is not, however useful it is.
//
// PRIMITIVE labels follow the four criteria in lib/questions.js verbatim:
// rule = judgment at the moment it applies; hook = a nameable event plus a
// command that settles it; skill = a procedure or reference body loaded when
// named work starts; subagent = a separate pass over more material than the
// task at hand holds.

const IS_RULE = [
  // --- working set ---------------------------------------------------------
  { id: "prettier", set: "work", rule: true,
    text: "Run `prettier` on modified files before committing.",
    why: "Tells the reader to run something, at a named moment." },
  { id: "no-secrets", set: "work", rule: true,
    text: "Never print, persist, or embed secrets.",
    why: "A ban is an instruction." },
  { id: "smallest", set: "work", rule: true,
    text: "Prefer the smallest coherent solution.",
    why: "A preference is still something to act on." },
  { id: "node-18", set: "work", rule: true,
    text: "Node 18 or later is required.",
    why: "Phrased as a fact, but a reader acts on it: install or select Node 18." },

  { id: "optimized", set: "work", rule: false,
    text: "All files are optimized for agent consumption.",
    why: "A claim about how things already are. Nothing to do." },
  { id: "429", set: "work", rule: false,
    text: "The API returns 429 when the rate limit is exceeded.",
    why: "States behaviour. It never says to handle it." },
  { id: "readback-def", set: "work", rule: false,
    text: "A readback is the receiver repeating an instruction so the sender can hear whether it landed.",
    why: "A definition." },
  { id: "moved-repo", set: "work", rule: false,
    text: "This project moved out of Slag on 2026-09-20 and is now Readback.",
    why: "Project history." },

  // --- held out ------------------------------------------------------------
  { id: "passing-build", set: "held", rule: true,
    text: "Every commit modifying `src/` must end with a passing build.",
    why: "A mandate with a condition." },
  { id: "env-key", set: "held", rule: true,
    text: "Credentials come from `TYPESAFE_API_KEY` in the environment.",
    why: "Reads as a fact, but it tells the reader where to get the key." },
  { id: "untrusted", set: "held", rule: true,
    text: "Consider all inputs untrusted at the handler boundary.",
    why: "Directs how to treat input." },
  { id: "colocate", set: "held", rule: true,
    text: "Where possible, colocate tests with the code they cover.",
    why: "Hedged, but still an instruction." },

  { id: "layout", set: "held", rule: false,
    text: "`src/` holds the application code and `test/` holds its tests.",
    why: "Describes the layout. Asks for nothing." },
  { id: "suite-time", set: "held", rule: false,
    text: "The test suite takes about four minutes on CI.",
    why: "A measurement, not an instruction." },
  { id: "why-workers", set: "held", rule: false,
    text: "We chose Cloudflare Workers because the free tier covers the expected load.",
    why: "A recorded decision and its reason." },
  { id: "what-it-does", set: "held", rule: false,
    text: "Readback scores one rule at a time and never returns a grade.",
    why: "Describes the product." },
];

const PRIMITIVE = [
  // --- working set ---------------------------------------------------------
  { id: "prettier-hook", set: "work", choice: "hook",
    text: "Run `prettier` on modified files before committing.",
    why: "A named event and a command that settles compliance." },
  { id: "build-green", set: "work", choice: "hook",
    text: "Every commit that touches `src/` must leave the build passing.",
    why: "An event, and an exit code decides it." },
  { id: "smallest-rule", set: "work", choice: "rule",
    text: "Prefer the smallest coherent solution.",
    why: "Judgment at the moment it applies. No tool carries it." },
  { id: "ask-before-delete", set: "work", choice: "rule",
    text: "Ask before deleting anything the user did not name.",
    why: "Needs judgment about what was named." },
  { id: "migration-procedure", set: "work", choice: "skill",
    text: "When adding a database migration: write the up and down files, add a fixture, run `npm run migrate:test`, then update `docs/schema.md`.",
    why: "A procedure for a named piece of work, too long to always carry." },
  { id: "rest-conventions", set: "work", choice: "skill",
    text: "REST conventions for this API: plural nouns for collections, no verbs in paths, 201 with a `Location` header on create, 204 on delete.",
    why: "A body of reference, loaded when API work starts." },
  { id: "release-review", set: "work", choice: "subagent",
    text: "Before each release, review every public API change against the changelog and report anything undocumented.",
    why: "A pass over more material than the task at hand holds." },
  { id: "dep-audit", set: "work", choice: "subagent",
    text: "Audit the repository for dependencies that no source file imports.",
    why: "A sweep with its own context." },

  // --- held out ------------------------------------------------------------
  { id: "no-main-commit", set: "held", choice: "hook",
    text: "Never commit directly to `main`.",
    why: "Branch protection settles it outright." },
  { id: "file-size", set: "held", choice: "hook",
    text: "Reject any source file longer than 500 lines.",
    why: "A number a linter checks." },
  { id: "match-existing", set: "held", choice: "rule",
    text: "When two approaches are equally correct, pick the one the existing code already uses.",
    why: "Judgment, every time, against the surrounding code." },
  { id: "say-unrun", set: "held", choice: "rule",
    text: "Say plainly when a check was not run, instead of implying it passed.",
    why: "Judgment about your own reporting. No tool sees it." },
  { id: "release-procedure", set: "held", choice: "skill",
    text: "Releasing: bump the version, run the full suite, tag, push the tag, then write the release notes from the changelog.",
    why: "A named procedure with ordered steps." },
  { id: "design-tokens", set: "held", choice: "skill",
    text: "The design tokens, their names, and when to reach for each one in the component library.",
    why: "Reference material, loaded when component work starts." },
  { id: "todo-sweep", set: "held", choice: "subagent",
    text: "Once a quarter, sweep the codebase for TODO comments older than six months and list them.",
    why: "A sweep over the whole repository." },
  { id: "refactor-reread", set: "held", choice: "subagent",
    text: "After a large refactor, re-read every touched file and report inconsistencies the diff cannot show.",
    why: "A separate pass with its own context, over more than the diff." },
];

module.exports = { IS_RULE, PRIMITIVE };
