---
type: knowledge
summary: "Which files Codex, Antigravity and Claude Code each read from this repository, why AGENTS.md is the only file that holds instructions and CLAUDE.md is a one-line import of it, where a project skill would have to live for each host, and how each host is kept away from .dev.vars; read before adding an instruction file, a rules folder, a skill or an agent setting."
related_files:
  - "AGENTS.md"
  - "CLAUDE.md"
  - ".claude/settings.json"
  - ".gitignore"
  - ".dev.vars.example"
---

# One repository, three agent hosts

## Objective

Codex and Claude Code develop this project together, and Antigravity has to be
able to open it too. All three must read the same instructions, with no second
copy that can drift.

## Conclusion

**`AGENTS.md` at the root is the only file that holds instructions, and it stays
plain Markdown.** `CLAUDE.md` is one line, `@AGENTS.md`, so Claude Code loads the
same text and nothing else. Checked on 2026-09-20 against each host's
documentation.

| Host | Reads root `AGENTS.md` | Condition |
| --- | --- | --- |
| Codex | Yes | Always. It stops adding instruction files once they total 32 KiB. |
| Antigravity | Yes | Since 1.20.3. It reads `GEMINI.md` as well when one exists. |
| Claude Code | Yes | Through `CLAUDE.md`, whose whole body is `@AGENTS.md`. Direct reading exists since 2.1.277, only while no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` exists here or above, and not in every session. |

`AGENTS.md` is about 3.5 KB, under Codex's 32 KiB cut and under the 12,000
characters Antigravity documents for a rules file.

## What not to add

- **A second line in `CLAUDE.md`, or a `CLAUDE.local.md`.** Claude Code would
  then read something Codex and Antigravity do not. The import is the whole
  file.
- **`GEMINI.md`, `.agents/rules/` or `.claude/rules/` copies.** Antigravity and
  Claude Code would load them beside `AGENTS.md`, and Codex would not, so the
  hosts would stop agreeing.
- **`AGENTS.override.md` or nested `AGENTS.md` files.** Only Codex honours the
  first, and the three hosts load nested files differently.
- **`@path` imports inside `AGENTS.md`.** Claude Code and Antigravity expand
  them. Codex does not document the syntax.
- **`.agents/` in `.gitignore`.** A third-party report says Antigravity then
  skips the folder.

## Why `CLAUDE.md` is here

Claude Code cannot read `AGENTS.md` directly in some sessions: with telemetry
disabled, with `disableAllHooks` set, on Amazon Bedrock, or in the first session
after an upgrade. An interactive session that did load it prints
`no CLAUDE.md found; AGENTS.md loaded`. The documented fallback is a `CLAUDE.md`
whose whole body is `@AGENTS.md`, which never loads the file twice.

The owner first chose a single file and removed an older pointer. Two sessions
on 2026-09-20 then started with the global instructions and the memory index in
context and without this repository's `AGENTS.md`, so the owner added the
fallback the same day.

## Skills

The repository ships no skills today. The hosts do not share a folder:

| Host | Project skills folder |
| --- | --- |
| Claude Code | `.claude/skills/<name>/SKILL.md` |
| Codex | `.agents/skills/<name>/SKILL.md` |
| Antigravity | `.agents/skills/<name>/SKILL.md`, and `.agent/skills/` for compatibility |

A skill meant for all three needs `name` and `description` in its frontmatter,
and has to exist under both folders. Antigravity workflows are deprecated in
favour of skills from 2026-11-01, so none should be added.

## Keeping each host away from `.dev.vars`

No single file covers all three, so each is handled where it can be.

| Host | Mechanism | In this repository |
| --- | --- | --- |
| Claude Code | `permissions.deny` in `.claude/settings.json` | Yes: `Read(./.dev.vars)`, `Read(.wrangler/**)` |
| Antigravity | Strict Mode respects `.gitignore`. Deny rules live in its own Settings, per project. | `.dev.vars` is gitignored. The rest is the user's setting. |
| Codex | A permission profile, at user or admin level only. | Nothing to commit. `.dev.vars` is gitignored. |

## Sources

- Codex AGENTS.md discovery and the 32 KiB default:
  <https://learn.chatgpt.com/docs/agent-configuration/agents-md>
- Codex skills: <https://learn.chatgpt.com/docs/build-skills>
- Claude Code memory and AGENTS.md: <https://code.claude.com/docs/en/memory>
- Claude Code permissions: <https://code.claude.com/docs/en/permissions>
- Claude Code skills: <https://code.claude.com/docs/en/skills>
- Antigravity rules: <https://antigravity.google/docs/rules-workflows/>
- Antigravity 1.20.3 changelog, AGENTS.md support:
  <https://discuss.ai.google.dev/t/antigravity-update-1-20-3-2026-3-5/129320>
- Antigravity skills: <https://antigravity.google/docs/skills>
- Antigravity permissions and Strict Mode: <https://antigravity.google/docs/permissions/>

## Rejected Alternatives

- **A `CLAUDE.md` pointer that tells Claude in words to read `AGENTS.md`.** This
  is what the repository had. Claude Code then sees `AGENTS.md` only if it
  decides to open it, which is weaker than reading it directly.
- **A copy of the instructions per host.** Three files that must say the same
  thing will not, within a month.
