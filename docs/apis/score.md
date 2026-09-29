---
type: api_spec
summary: "Describes the one-rule scoring HTTP contract, factor meanings, and errors for clients integrating with Disregard."
related_files:
  - api/score.js
  - lib/analyze.js
  - lib/questions.js
  - lib/criteria.js
  - lib/scorer.js
  - lib/score-rate-limit.js
  - worker.js
---

# Scoring API

`POST /api/score` scores one English instruction. The file workflow calls this
endpoint separately for each eligible excerpt; there is no whole-file API. It starts
at most 55 requests in any 60 seconds, below the supplied Worker's client allowance
of 60 a minute, and waits when a large file reaches that pace.

## Request

Send JSON with a `rule` string:

```json
{
  "rule": "Run node --test before submitting changes."
}
```

Leading and trailing whitespace are removed before analysis. The resulting string
must contain between 1 and 2000 JavaScript UTF-16 code units. The entire request body
is limited to 16 KiB. Additional object fields are ignored.

The service uses its server-side `TYPESAFE_API_KEY`; clients do not send that key.
The supplied Worker applies rate limits before reading a POST body or invoking the
provider. Requests sharing an IP address share a client allowance.

This JavaScript request prints the HTTP status and returned body. Run it in a
browser console on the local Disregard page:

```javascript
const response = await fetch('/api/score', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rule: 'Run node --test before submitting changes.' }),
});
console.log(response.status, await response.json());
```

Live requests can incur a TypeSafe charge. The offline suite uses mock responses.

## Successful HTTP responses

HTTP 200 includes a `status` field. Only `ok` contains scored factors.

| Status | Fields | Meaning |
| --- | --- | --- |
| `ok` | `risk`, `findings`, `factors`, `tokens` | The rule passed screening and was scored. |
| `not_english` | `language`, `findings: []` | The local language screen did not accept the text as English. |
| `review` | `risk`, `echo`, `findings: []`, `tokens` | The injection screen withheld scored advice for review. |
| `refused` | `risk`, `echo`, `findings: []`, `tokens` | The injection screen refused the text. |

The injection screen compares the maximum of the model's two risk values before
rounding. Values from 0.35 through less than 0.70 yield `review`; 0.70 or higher
yields `refused`. The returned `risk` is rounded to two decimal places and is not
an overall instruction score. For example, an original risk of 0.349 returns
`status: "ok"` with `risk: 0.35`; 0.699 returns `status: "review"` with `risk: 0.70`.

`echo` is the trimmed input and must be treated as untrusted text. `language` is
`{ code, name }`; `name` can be `null`. `tokens` is provider-reported input usage,
or `null` when the provider supplies no valid value. It is not a currency amount.

## Factor meanings

`factors` carries separate signals, not a composite grade. A higher value does not
consistently mean a better instruction. The interface lists each field under
**What was measured** with the label shown here.

| Field | Interface label | Range or shape | Meaning |
| --- | --- | --- | --- |
| `F1` | Verb force | 0–1 or `null` | Strength of recognized verbs; `null` means no verb value was assigned. |
| `F2` | Prohibition framing | 0–1 | Local classification of prohibition and alternative wording. |
| `F3` | Trigger distance | 0–4 | Model judgment of when the instruction becomes relevant and how explicitly the occasion is stated. |
| `F7` | Concreteness | 0–1 | Paths, tools, quantities, and other concrete targets recognized by local patterns. |
| `F8` | Enforceability | 0–3 | Model judgment of how much a deterministic tool could check; lower values mean more mechanical coverage. |
| `is_rule` | Reads as an instruction | 0–1 | Model judgment that the text directs the reader rather than describing background. |
| `specificity` | Concrete enough to check | 0–1 | Model judgment that the text is concrete enough to check whether it was followed. |
| `primitive` | Suggested form | `{ choice, confidence }` | Suggested home: `rule`, `hook`, `skill`, or `subagent`; confidence is 0–1. |
| `rule_role` | Suggested interpretation | `{ choice, confidence }` | `direct_action`, `artifact_requirement`, `background`, or `unclear`; confidence is 0–1. |
| `agent_default` | Agent default | `{ choice, confidence }` | Model judgment of whether a capable coding agent would do what the rule asks without being told: `agent_default`, `project_specific`, or `kept_by_policy`; confidence is 0–1. |

F1, F2, and F7 use deterministic local checks. F3, F8, `is_rule`, `specificity`,
classification, routing, `agent_default`, and injection screening use one provider request. Fractional F3 and F8 values represent
weighted model judgments, not integer categories.

The current implementation and criteria are in [analyze.js](../../lib/analyze.js),
[questions.js](../../lib/questions.js), [criteria.js](../../lib/criteria.js), and
[scorer.js](../../lib/scorer.js).

## Findings

Each finding contains `id`, `factor`, and `value`. Routing findings also include
`choice` and `confidence`; `hedge_dominance` includes the matched `verb`;
`likely_redundant` includes `readers`.
User-facing descriptions belong to the interface, not the API response.

| ID | What to inspect |
| --- | --- |
| `not_a_rule` | Whether apparent background expresses a requirement or tells the agent something the repository does not show. |
| `should_be_a_hook` | Whether a deterministic check could cover the instruction at a named event. |
| `could_be_a_hook` | Which parts could be checked mechanically while retaining necessary judgment. |
| `belongs_as_a_skill` | Whether task-specific steps belong in a skill with clear loading guidance. |
| `belongs_as_a_subagent` | Whether a separate review pass suits the requested work. |
| `no_trigger` | Whether the occasion needs clarification or the requirement intentionally applies continuously. |
| `stall_risk` | Whether a prohibition needs an allowed alternative or stop condition. |
| `hedge_dominance` | Whether softened wording is intentional for the action it qualifies. |
| `no_concrete_anchor` | Whether the instruction names something a reader could check, or only a quality or goal. |
| `likely_redundant` | Whether every model that reads the file already does this without the rule. |

Routing is named at confidence 0.8 or greater. Otherwise, an F8 value at or below 1.25
produces the generic `could_be_a_hook` finding only when `is_rule` is 0.7 or greater;
a low F8 alone says a tool could check the text, not that the text asks for something.
F3 below 1.5 produces `no_trigger`.
`no_concrete_anchor` requires both a lexical miss, where the F7 matcher recognizes no
concrete marker, and a `specificity` value below 0.5; its `value` is F7.
An `is_rule` value below 0.5 produces `not_a_rule`, unless the supplemental classifier
identifies an artifact requirement at confidence 0.8 or greater. `not_a_rule` is then
the only finding: routing, `no_trigger`, `likely_redundant`, and the local findings judge
a rule, so they are not returned for background. `factors` still carries every value.

`likely_redundant` requires the `agent_default` choice at confidence 0.8 or greater. Its
`value` is that confidence. It is never returned for a rule about safety, destructive or
irreversible actions, authorization or approval, or secrets and private data. Those rules
are kept by policy. Either the model's `kept_by_policy` answer or a local English word list
withholds the finding, and the list errs toward withholding.

The finding is also never returned for kinds of rule that the measured models needed, even
when the model answers `agent_default`:

- duties in another file, such as updating a README, a changelog or other documentation;
- conventions a project picks among valid options, such as naming, headers, formatting,
  import order, or one named option chosen over another;
- the project's own files and helpers, named by path or file name;
- facts about the project, such as versions, ports, time units or known fixes.

A local English pattern list detects these kinds, and it errs toward withholding. For other
rules, such as language idioms, the model's answer and its confidence decide.

The finding is a model's prediction about what agents do unprompted, so treat it as advice
to check, not as removal advice. `readers` lists the model ids whose measured behaviour the
prediction was compared against: currently `claude-haiku-4-5-20251001`, `claude-sonnet-5`,
and `claude-opus-5-5`. The finding does not cover Fable. Other models, later versions of
those models, and cheaper subagents that read the same file may still need the rule. Keep a
rule unless every model that reads the file is covered. That comparison used a small set of
rules and only one rule known to be redundant for all three models, so how often the finding
misses a redundant rule is not measured.

These comparisons also use unrounded provider values. Returned model factors,
confidence values, and finding values are rounded to two decimal places. Consume
`status` and `findings` directly; do not reconstruct them from the rounded values.

An empty findings array does not guarantee completeness, correctness, or compliance.
Recommendations can be wrong and must be checked against the file's context.

## Errors

Error bodies use `{ code, error }`. `code` is the machine identifier; `error` is a
safe English explanation. Responses use `Cache-Control: no-store`.

| HTTP status | Code | Meaning |
| --- | --- | --- |
| 400 | `bad_body` | Malformed JSON or a body that is not a JSON object. |
| 400 | `bad_rule` | Missing or non-string `rule`. |
| 400 | `empty` | The trimmed rule is empty. |
| 400 | `too_long` | The rule exceeds 2000 UTF-16 code units. |
| 405 | `method_not_allowed` | Use POST; the response includes `Allow: POST`. |
| 413 | `body_too_large` | The request body exceeds 16 KiB. |
| 429 | `rate_limited` | The Worker or provider rejected excess requests. |
| 500 | `not_configured` | The server has no scoring key. |
| 500 | `failed` | An unexpected internal failure occurred. |
| 502 | `upstream` | The provider was unreachable or returned an invalid or unsuccessful response. |
| 503 | `not_configured` | Worker rate-limit bindings are unavailable or invalid. |

Worker-generated 429 responses include `Retry-After: 60`. The provider timeout is
30 seconds. An interrupted client request does not guarantee cancellation of an
upstream provider call or its charge.

## Hosting boundaries

[api/score.js](../../api/score.js) uses standard `Request` and `Response` objects.
The provided Worker adds static assets and fail-closed rate-limit bindings from
[wrangler.jsonc](../../wrangler.jsonc). These bindings provide approximate protection
within each Cloudflare location; they are not a global quota or spending cap.

A different host must provide routing, secret configuration, static assets, and
appropriate request controls. The portable handler alone provides no client rate limit.
