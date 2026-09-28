---
type: knowledge
summary: "How to use the rule check prompt that file mode offers after a review, what it asks your agent to do, what it costs, and how to read its verdicts; read before running it or changing it."
related_files:
  - public/refactor-prompt.js
  - public/review-ui.js
  - public/file-i18n.js
  - checks/refactor-prompt.test.cjs
---

# Check which rules your agent needs

After Disregard reviews an instruction file, file mode offers a second, optional prompt under **Check which rules your agent needs**.
The prompt has your own coding agent measure, in your repository, which rules it already follows when the rule is left out of the file.
It is for owners of a `CLAUDE.md` or `AGENTS.md` who want evidence before they shorten the file.

Disregard runs nothing for this check and receives no result.
Every run is a call to your agent on your machine, billed to your account or plan.

## Why the check runs in your repository

A rule an agent follows without being told in one repository can still be needed in another.
Agents often copy a convention that the surrounding code already shows, so the same rule can be redundant in a consistent repository and necessary in a new one.
The answer also changes from one model to another.
The [research page](https://disregard.dev/research#rule-necessity) shows these differences across models.

## Before you start

- **Cost.** Each rule costs at least 5 runs per model, and up to 45 when the first runs are mixed.
  A run that fails before it does the task is replaced, which adds runs.
  Your agent shows the run count and the worst-case spend before it starts, and stops at the ceiling you set.
- **Setup in the copies.** Temporary copies hold only the files Git tracks.
  If the task needs installed dependencies or build output, your agent prepares them in every copy.
  It asks you before it copies an ignored file that could hold secrets, such as an environment file.
- **Permissions.** Runs work in temporary copies of your repository, but they run commands on your machine with the permissions you approve.
  A copy protects your working tree, not your machine.
- **Agent.** The prompt gives commands for Claude Code (`claude -p`) and Codex (`codex exec`).
  With another agent, your agent uses that agent's headless mode and tells you what it could not turn off.

## Run the check

1. In file mode, review your file and wait for **Analysis finished.**
2. Under **Check which rules your agent needs**, select **Copy rule check prompt**.
   To read the prompt first, open **Show the rule check prompt**.
3. Paste the prompt into your agent, in the repository that holds the file.
4. Answer your agent's questions: which models read the file, the reasoning effort, the spend cap per run, the total ceiling, the permission mode, and which rules to check.
   Name every model that reads the file, including cheaper models that run subagents.
5. Read the plan. For each rule it shows the task, the grader and the result of testing that grader.
   The agent starts no run until you approve the plan and its ceiling.

If the agent stops at your ceiling, the rules it did not finish are reported as incomplete.

## What your agent does

For each rule you choose, the agent:

1. Writes an ordinary task for this repository where the rule makes a difference, without mentioning the rule.
2. Writes a grader: a script that checks the result in files or command output, with no model judging.
3. Tests the grader on one change that follows the rule and one that breaks it.
4. Runs your agent on the task in a fresh temporary copy for each run. Runs without the rule remove only that rule's text from the copy.
5. Keeps your user-level instructions and memory out of the runs, so the result is about the repository and the model.

The agent leaves out rules about safety, destructive or irreversible actions, approval, and secrets.
Those rules are kept by policy, because their failures are rare and costly and a few dozen runs cannot measure them.
It also leaves out text that states no requirement.

## Read the verdicts

The prompt includes a small script that decides each verdict from the pass counts, so the thresholds match the research page.

| Verdict | Meaning |
| --- | --- |
| Likely redundant | The agent followed the rule in 5 of 5 runs without it. This is a direction, not advice to remove the rule. |
| Redundant | The agent followed the rule in at least 20 of 20 runs without it. |
| Necessary | With 20 runs in each arm, the 95% bootstrap interval of the difference between the pass rates with and without the rule stays above zero. |
| Inconclusive | The contrast ran, and the rule is neither necessary nor redundant. |
| Incomplete | The runs are not yet enough for a verdict, for example because the ceiling was reached. |

Each verdict holds only for your repository at that commit, that model and effort, and that date.
It expires when the model, the agent's version or the repository changes.
A rule can be removed only when it is redundant for every model that reads the file.
The agent proposes no edit: removing a rule stays your decision.

## Maintain this page

Update this page when the prompt's steps, commands or thresholds change in [refactor-prompt.js](../../public/refactor-prompt.js), or when the file-mode labels change in [file-i18n.js](../../public/file-i18n.js).
