"use strict";

// A labelled corpus for the two deterministic findings the app actually emits:
//
//   hedge_dominance     fires when scoreF1 reports `hedged`
//   no_concrete_anchor  fires when scoreF7 finds zero concrete markers
//
// Both are binary decisions, so that is what is labelled here. The raw 0-1
// values are a presentation detail; what a reader sees is whether the finding
// fired, and a factor is only as good as the call it makes.
//
// `hedge`  - true when the rule's force really is soft, so the finding belongs.
// `anchor` - true when the rule names something mechanically checkable, so
//            `no_concrete_anchor` must NOT fire.
//
// LABELLED is the working set: real bullets lifted from a live `CLAUDE.md` and
// from this project's own instructions, plus three probes aimed at branches the
// code comments call deliberate. HELDOUT is ordinary instruction-file idiom,
// labelled before anything was run and never consulted while fixing. Report the
// held-out number, per eval/README.md.

const LABELLED = [
  { id: "smallest-solution", hedge: true, anchor: false,
    text: "Prefer the smallest coherent solution.",
    why: "A stated preference, and nothing in it is checkable." },
  { id: "read-first", hedge: false, anchor: false,
    text: "Read applicable project instructions and relevant implementation before editing.",
    why: "Plain imperative. Names no file, command or number." },
  { id: "unix-utils", hedge: false, anchor: false,
    text: "Do not assume Unix utilities are installed.",
    why: "A flat ban. 'Unix utilities' is a category, not an anchor." },
  { id: "venv-python", hedge: false, anchor: true,
    text: "Invoke virtual-environment Python through `.venv/Scripts/python.exe`.",
    why: "Names the exact interpreter path." },
  { id: "quote-paths", hedge: true, anchor: false,
    text: "Quote paths and prefer forward slashes where supported.",
    why: "The second half is an explicit preference with an escape clause." },
  { id: "no-secrets", hedge: false, anchor: false,
    text: "Never print, persist, or embed secrets.",
    why: "Absolute ban. 'Secrets' names no store or file." },
  { id: "authorized-only", hedge: false, anchor: false,
    text: "Commit, push, publish, deploy, or mutate shared resources only when authorized.",
    why: "Imperative. 'Authorized' is the unanchored part, deliberately." },
  { id: "surgical-edits", hedge: false, anchor: false,
    text: "Keep edits surgical.",
    why: "Bare imperative, and 'surgical' is the kind of word F7 exists to catch." },
  { id: "powershell-exit", hedge: false, anchor: true,
    text: "In PowerShell, capture `$LASTEXITCODE` immediately after native commands; use `-ErrorAction Stop` for required cmdlets.",
    why: "Two named symbols in backticks." },
  { id: "fnm-exec", hedge: false, anchor: true,
    text: "Use `fnm exec --using=<version> node <args>` for a project-pinned Node version.",
    why: "Names the exact command." },
  { id: "no-fnm-env", hedge: false, anchor: true,
    text: "Do not run `fnm env` or rely on shell activation persisting between calls.",
    why: "Names the banned command." },
  { id: "playwright-edge", hedge: false, anchor: true,
    text: "For Playwright Chromium-family checks, use installed Edge with `channel: \"msedge\"`.",
    why: "Names Playwright and the exact channel value." },
  { id: "prefer-scripts", hedge: true, anchor: false,
    text: "Prefer project scripts, package managers, and tool configuration.",
    why: "A preference over three unnamed categories." },
  { id: "no-root-search", hedge: false, anchor: false,
    text: "Never run unconstrained recursive searches from home or filesystem roots.",
    why: "Absolute ban, no path named." },
  { id: "retry-transient", hedge: false, anchor: false,
    text: "Retry unchanged operations only for evidenced transient failures.",
    why: "Imperative with a condition, nothing checkable." },

  // Probes. Each aims at a branch a code comment calls deliberate.
  { id: "ban-contains-hedge", hedge: false, anchor: false,
    text: "Do not try to work around the sandbox.",
    why: "'try to' sits inside what is banned. The rule itself is absolute." },
  { id: "ban-contains-prefer", hedge: false, anchor: true,
    text: "Never prefer a mock over the real database in integration tests.",
    why: "'prefer' is the banned behaviour, not the force of the rule. Names integration tests." },
  { id: "lowercase-tool", hedge: false, anchor: true,
    text: "Run prettier on modified files before committing.",
    why: "Names a formatter. Instruction files write it lowercase." },
];

const HELDOUT = [
  { id: "untrusted-inputs", hedge: false, anchor: true,
    text: "Consider all inputs untrusted at the handler boundary.",
    why: "'Consider X untrusted' means treat it as untrusted. Names the handler boundary." },
  { id: "short-functions", hedge: true, anchor: true,
    text: "Try to keep functions under 50 lines.",
    why: "Hedged, but the threshold is checkable." },
  { id: "clean-code", hedge: false, anchor: false,
    text: "Write clean, maintainable code.",
    why: "Firm verb, nothing behind it." },
  { id: "handle-errors", hedge: false, anchor: false,
    text: "Handle errors appropriately.",
    why: "Firm verb, and 'appropriately' is unanchored." },
  { id: "zod-validation", hedge: false, anchor: true,
    text: "All handlers must validate input with zod.",
    why: "Names the validation library." },
  { id: "npm-not-yarn", hedge: false, anchor: true,
    text: "Use npm, not yarn.",
    why: "Names both package managers." },
  { id: "pr-size", hedge: false, anchor: true,
    text: "Keep pull requests under 400 lines.",
    why: "A bright-line number." },
  { id: "const-over-let", hedge: true, anchor: true,
    text: "Where possible, use `const` over `let`.",
    why: "'Where possible' is a real escape clause. Both keywords are named." },
  { id: "changelog-check", hedge: true, anchor: false,
    text: "It's worth checking the changelog before upgrading a dependency.",
    why: "The weakest form there is, and nothing is named." },
  { id: "no-body-logging", hedge: false, anchor: true,
    text: "Never log the request body in production.",
    why: "Absolute ban naming what must not be logged." },
  { id: "any-to-unknown", hedge: false, anchor: true,
    text: "Avoid `any`; prefer `unknown` when the type is genuinely open.",
    why: "The ban leads; 'prefer' introduces the replacement. Both types are named." },
  { id: "best-practices", hedge: false, anchor: false,
    text: "Follow best practices for error handling.",
    why: "The canonical unanchored rule." },
  { id: "reversible-migrations", hedge: false, anchor: false,
    text: "Every migration must be reversible.",
    why: "A mandate, but it names no migration tool or directory." },
  { id: "request-timeout", hedge: false, anchor: true,
    text: "Set the request timeout to 30 seconds.",
    why: "A number with a unit." },
  { id: "pnpm-default", hedge: true, anchor: true,
    text: "Default to `pnpm` for new packages.",
    why: "'Default to' admits exceptions. The tool is named." },
  { id: "eslint-before-pr", hedge: false, anchor: true,
    text: "Run `eslint --fix` before opening a pull request.",
    why: "Names the command and the moment." },
  { id: "shared-state", hedge: false, anchor: false,
    text: "Be careful with shared mutable state.",
    why: "'Be careful' is not a hedge tier, it is an unanchored instruction." },
  { id: "split-components", hedge: true, anchor: false,
    text: "You might want to split large components into smaller ones.",
    why: "The weakest tier, and 'large' is unmeasured." },
];

// A second held-out set, written for one defect the first one found and could
// not settle: `consider` is the only verb in the hedging tiers that doubles as
// an ordinary transitive verb. Fitting the scorer to the single HELDOUT case
// that showed it would have spent that measurement, so this set was built
// instead.
//
// Every `consider` label here follows one stated test, so a reader can check
// each one rather than trust it: **`consider` + gerund, or + `whether`/`if`, is
// a suggestion. `consider` + anything else is "regard as", which is a
// directive.** The other twelve cases are controls — the older hedging verbs,
// two bans that contain a hedge word, and six plain rules — so the set cannot
// pass by treating every `consider` the same way.
//
// HELDOUT is spent for hedging as of the fix this set validates. HELDOUT2 is
// the live held-out number.

const HELDOUT2 = [
  // `consider` as "regard as" — a directive, however softly it reads.
  { id: "api-frozen", hedge: false, anchor: false,
    text: "Consider the public API frozen after a minor release.",
    why: "Regard it as frozen. Names no version, file or symbol." },
  { id: "hostile-responses", hedge: false, anchor: false,
    text: "Consider every third-party response hostile.",
    why: "A definition of how to treat input, not an option." },
  { id: "build-broken", hedge: false, anchor: false,
    text: "Consider the build broken until the pipeline is green.",
    why: "Regard it as broken. Nothing named is checkable." },
  { id: "node-modules", hedge: false, anchor: true,
    text: "Consider `node_modules/` untracked.",
    why: "Regard it as untracked. Names the exact directory." },

  // `consider` + gerund or `whether` — a real suggestion.
  { id: "consider-test", hedge: true, anchor: false,
    text: "Consider adding a regression test before closing the issue.",
    why: "Gerund. Genuinely optional, and it names nothing checkable." },
  { id: "consider-clone", hedge: true, anchor: true,
    text: "Consider using `structuredClone` instead of a deep-copy helper.",
    why: "Gerund, and the replacement is named." },
  { id: "consider-whether", hedge: true, anchor: false,
    text: "Consider whether the cache needs invalidating before you ship.",
    why: "A question put to the reader. Nothing named." },
  { id: "consider-split", hedge: true, anchor: true,
    text: "Consider splitting the file once it passes 500 lines.",
    why: "Gerund, with a bright-line number." },

  // The other hedging tiers, unchanged by the fix.
  { id: "prefer-await", hedge: true, anchor: true,
    text: "Prefer `async`/`await` over raw promise chains.",
    why: "A preference naming both keywords." },
  { id: "aim-bundle", hedge: true, anchor: true,
    text: "Aim to keep the bundle under 200 kb.",
    why: "'Aim to' is a suggestion, and the threshold is checkable." },
  { id: "colocate-tests", hedge: true, anchor: false,
    text: "Where practical, colocate tests with the code they cover.",
    why: "An explicit escape clause, and nothing named." },
  { id: "windows-paths", hedge: true, anchor: false,
    text: "Keep in mind that Windows paths use backslashes.",
    why: "The weakest tier there is." },

  // Bans that contain a hedging word. These guard the earlier fix.
  { id: "ban-consider", hedge: false, anchor: false,
    text: "Never consider a draft PR ready to merge.",
    why: "'consider' is inside what is banned. The rule is absolute." },
  { id: "ban-prefer-auth", hedge: false, anchor: false,
    text: "Do not prefer convenience over correctness in the auth path.",
    why: "'prefer' is the banned behaviour. Nothing concrete is named." },

  // Plain rules, neither hedged nor unanchored by accident.
  { id: "compose-up", hedge: false, anchor: true,
    text: "Run `docker compose up` before the integration suite.",
    why: "Names the exact command." },
  { id: "doc-comments", hedge: false, anchor: false,
    text: "Every public function must have a doc comment.",
    why: "A mandate with nothing checkable behind it." },
  { id: "body-limit", hedge: false, anchor: true,
    text: "Reject requests larger than 10 mb at the edge.",
    why: "A number with a unit." },
  { id: "migration-rollback", hedge: false, anchor: false,
    text: "Write the migration and its rollback in the same commit.",
    why: "Imperative. Names no directory or tool." },
  { id: "module-ownership", hedge: false, anchor: false,
    text: "Be explicit about ownership in every module header.",
    why: "'Be explicit' is not a hedge tier, and nothing is named." },
  { id: "pnpm-everywhere", hedge: false, anchor: true,
    text: "Use `pnpm` in CI and locally.",
    why: "Names the package manager." },
];

module.exports = { LABELLED, HELDOUT, HELDOUT2 };
