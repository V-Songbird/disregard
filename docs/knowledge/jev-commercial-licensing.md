---
type: knowledge
summary: "Which TypeSafe contract terms permit selling a product built on Jev, and the clauses that constrain a public rule-scoring app; read before pricing, launching, or writing user-facing legal copy."
related_files:
  - "docs/decisions/rule-scoring-product-viability.md"
  - "docs/knowledge/f3-trigger-distance-criteria.md"
---

# Selling a product built on Jev — what the TypeSafe terms actually allow

## Question

Does TypeSafe's documentation or contract permit selling a product that uses
Jev, specifically in its **preview** version (`jev-preview`)?

## Conclusion

**Yes, and the premise of the question dissolves: there is no preview tier.**

1. `jev-preview` is an **alias**, not a separate service or legal category. It
   currently resolves to `jev-1.13.0` — the *same build* `jev-latest` resolves
   to. TypeSafe's own docs: *"jev-preview currently points to the same model as
   jev-latest. There is no preview build available right now."*
2. The Master Customer Agreement contains **zero occurrences** of `beta`,
   `preview`, `alpha`, `evaluation`, `pre-release`, `prerelease` or
   `experimental`. Verified by full-text search of the live page. There is no
   clause disclaiming preview builds, no production ban, and no separate
   commercial restriction attached to them.
3. Commercial use is **expressly licensed** through §2.1(b) + §2.2, and Output
   ownership is **assigned to you** by §4.2.

The real constraints are elsewhere, and three of them bite directly on a public
rule-scoring web app. They are listed in *Constraints that apply to us* below.

**Caveat.** This is a reading of the public contract as of its "Last updated
Sep 19, 2026" revision, not legal advice. The Agreement is *the body of the MCA
plus the Order* (§ preamble) — your own Order may add usage limits or differ.
Check the Order before relying on any of this.

---

## Evidence

Retrieved 2026-09-20 from:

| Source | URL |
| --- | --- |
| Model aliases and versioning | `https://docs.typesafe.ai/models.md` |
| Legal index | `https://docs.typesafe.ai/legal.md` |
| Master Customer Agreement (live, "Last updated Sep 19, 2026") | `https://typesafe.ai/legal/mca` |
| Data Processing Addendum ("Last updated Apr 24, 2026") | `https://typesafe.ai/legal/data-processing` |
| Terms of Use (**not listed in the docs legal index**) | `https://typesafe.ai/legal/terms` |
| Acceptable Use Policy | `https://typesafe.ai/legal/aup` — **HTTP 404, and it exists nowhere else** |

Preview-term search over the live MCA body text returned `null` for every one of
`beta`, `preview`, `alpha`, `evaluation`, `pre-release`, `prerelease`,
`experimental`. Only `trial` matched, and both hits are the jury-trial waiver in
the arbitration notice — unrelated.

### What permits the product

> **§2.1 License.** *"…TypeSafe grants to Customer a limited, non-exclusive,
> non-transferable, non-sublicensable license during the Term to: (a) access and
> use the Services in accordance with the applicable documentation…; and (b)
> integrate the API with one or more Customer Applications in accordance with
> Section 2.2."*

> **§2.2 Customer Applications.** *"The license set forth in Section 2.1
> includes the right to include the API into one or more software applications
> developed and operated by Customer for the benefit of Customer's end users
> ("End Users")… (each, a "Customer Application")."*

> **§4.2 Output.** *"TypeSafe does not claim ownership of Input and TypeSafe
> disclaims ownership of Output. TypeSafe hereby assigns to Customer all of its
> right, title, and interest, if any, in the Output."*

A paid public web app serving anonymous End Users is precisely the Customer
Application shape §2.2 describes. Nothing conditions it on the model alias used.

---

## Constraints that apply to us

Ranked by how easily a rule-scoring web app trips them.

### 1. §2.3(a) — no standalone resale of the Services

> *"Customer will not… (a) sell, lease, loan, distribute, sublicense, disclose,
> or otherwise offer or make the Services available as a standalone service"*

This is the clause that decides whether the app is legitimate. A thin passthrough
— visitor writes a question and criteria, we forward it to Jev, we return the raw
answer — **is** offering the Services as a standalone service.

Our design is not that. The app supplies its own rubric (the assay factor set),
computes F1/F2/F7 deterministically in our own code, composes a weighted grade
with our own weights, and emits tips from our own table. Jev answers two bounded
questions inside a product that is mostly ours.

**Keep it that way.** Do not expose raw question/criteria authoring to End Users,
do not return the raw Jev response body, and do not let the UI become a generic
"ask Jev anything" box.

### 2. §2.3(b) — no distillation, no competing model

> *"…use the Services or any Output… to perform model distillation, train a model
> to imitate the output of the Services, or develop (or to facilitate the
> development of) a similar or competing product or service"*

Directly relevant: logging every submitted rule alongside its Jev verdict is the
obvious dataset for training our own rule scorer. **That is prohibited.** Store
verdicts for display and debugging only, and if we ever want an offline scorer,
it must be built from independently labelled data, not from Output.

### 3. The DPA makes us the data controller — this is why a notice is needed

The Data Processing Addendum **auto-applies**: *"This Typesafe Data Processing
Addendum ("DPA") forms part of the Agreement by and between Customer and
Typesafe."* Nothing to sign, no enterprise tier to reach. And §1.1 assigns the
roles:

> *"(a) Customer is the "controller" and "business"… and Typesafe is the
> "processor" and "service provider"… Each Party will comply with its respective
> obligations under applicable privacy and data protection law."*

**We are the controller.** Under GDPR that carries the Art. 13 information duty
toward every person whose data we process — which, for a public box that accepts
free text, means every visitor. The obligation is not something we inferred from
general privacy practice; it is the role TypeSafe's own contract assigns us and
then requires us to discharge.

Scope note: the duty scales with exposure. A private experiment where we paste
our own rules creates no data subjects but ourselves. A public, anonymous input
box does.

### 4. §5 — we are liable for everything anonymous users type

> *"Customer is responsible for Input, including its content and accuracy…
> Customer represents, warrants, and covenants that it has made all disclosures,
> has provided all notices, and has obtained (and will maintain) all rights,
> consents, and permissions necessary for TypeSafe to exercise the rights granted
> to it… Customer is responsible for the acts and omissions of Customer Users and
> End Users… as though such acts and omissions were Customer's own."*

Every rule a visitor pastes becomes our Input. We warrant we had the right to
send it. **Required before launch:** a terms page and a privacy notice stating
that submitted text is transmitted to a third-party processor, plus the §4.1
facts below. Without that notice we cannot honestly make the §5 representation.

### 5. §4.1 — the license we grant over submitted text

> *"Customer hereby grants TypeSafe a non-exclusive, worldwide, royalty-free…
> right to use, copy, store, disclose, transmit, transfer, display, modify,
> create derivative works from, and otherwise Process (a) during the Term, any
> data, files, queries… ("Input") solely to perform its obligations… (c) **in
> perpetuity**, any Customer Data (i) to derive and generate Telemetry, (ii) to
> monitor for fraud and abuse…, and (iii) as necessary to comply with applicable
> Laws."*

> *"The foregoing license does not grant TypeSafe the right to, and TypeSafe will
> not, include Customer Data in a dataset used to train (i.e., to modify the model
> weights of) any artificial intelligence or machine learning models without
> Customer's prior consent."*

Good news for the privacy notice: **no training without consent**, stated in the
contract and not merely in marketing. But the perpetual telemetry/fraud/legal
grant is real and must be disclosed.

### 6. §2.4 — End Users may use our app, never our credentials

> *"Customer will not authorize or enable any person or entity who is not an
> employee or independent contractor of Customer ("Customer User") to access or
> use the Web Interface."*

The restriction names the **Web Interface** (`console.typesafe.ai`), not the API,
which is consistent with §2.2 allowing End Users through a Customer Application.
Practical rule: the API key stays server-side in a serverless function, never
ships to the browser, and no End User is ever pointed at the console.

### 7. Publicity — "Powered by Jev" needs their consent

> *"Nothing in this Agreement grants either Party the right to use the name,
> brand, or logo of the other Party… except with the other Party's prior
> consent… provided, however, that TypeSafe may use the name, brand, or logo of
> Customer… for the purpose of identifying Customer as a licensee or customer…"*

Asymmetric, and easy to trip. **We may not put TypeSafe's name or logo on the
landing page without prior consent**; they may put ours on theirs. Either ask
them for written consent (they will almost certainly want the logo placement) or
describe the model generically.

### 8. §9.3 and §6 — no SLA, and instant suspension

> **§9.3 Disclaimer.** *"THE SERVICES AND DOCUMENTATION ARE PROVIDED 'AS IS' AND
> 'AS AVAILABLE'… TYPESAFE DOES NOT WARRANT THAT CUSTOMER'S USE OF THE SERVICES
> WILL BE UNINTERRUPTED OR ERROR-FREE…"*

> **§6 Suspension.** TypeSafe *"may immediately suspend"* access for a §2.3,
> §2.4, §5 or payment breach, or if our actions risk harm to other customers or
> to service integrity. Prior notice only *"where practicable"*.

Do not promise uptime to paying users. Degrade gracefully when the API is
unavailable — and note that our deterministic half (F1/F2/F7 and the tips table)
still works with no API at all, which makes a genuine fallback mode cheap.

### 9. §2.3(j) — usage limits live in the Order, not the docs

Exceeding *"Usage Limits set forth in the Order"* is itself a breach and a
suspension trigger. Published rate limits are 1,200 req/min and 250k tok/s, but
the binding numbers are whatever the Order says. Rate-limit our own endpoint.

---

## Open item: the Acceptable Use Policy is unreachable

§2.3(l) binds us to *"TypeSafe's Acceptable Use Policy (located at
typesafe.ai/legal/aup)"*. **That URL returns HTTP 404, and the document is not
published anywhere else.** Searched exhaustively on 2026-09-20:

| Checked | Result |
| --- | --- |
| `typesafe.ai/legal/aup` (the URL the contract names) | 404 |
| `/legal/acceptable-use`, `/legal/acceptable-use-policy`, `/aup` | 404 |
| `typesafe.ai/sitemap.xml` — 12 URLs, 4 under `/legal` | `data-processing`, `mca`, `privacy-policy`, `terms`. No AUP. |
| `typesafe.ai/legal/terms` (Terms of Use, 21k chars) | Zero occurrences of "acceptable use" or "AUP" |
| `docs.typesafe.ai/legal.md` | Lists three documents; omits both the AUP **and** the Terms of Use |
| Footer links on the privacy policy page | Only `/legal/terms` and `/legal/privacy-policy` |

The docs legal index is also incomplete — it never mentions `/legal/terms`, which
does exist. So the missing AUP may be an oversight rather than a policy that was
withdrawn.

We are therefore contractually bound to a policy we cannot read, which is exactly
the kind of term a public app accepting anonymous free-text input needs to see
before launch. **Action: email TypeSafe for the current AUP text and record the
reply here.** Until then, assume the usual prohibitions (illegal content, abuse,
harassment, automated decisions about people) apply and design the input
moderation accordingly.

---

## Draft notice for the app

The obligation is smaller than it sounds. Five facts, one short page, linked from
under the input box. Everything in it is traceable to a clause above.

> **What happens to what you paste here**
>
> The rule you submit is sent to TypeSafe AI, Inc. (United States) to be scored.
> We are the data controller; TypeSafe is our processor.
>
> TypeSafe will not use your text to train AI models. It may keep derived
> telemetry, and may process the text to monitor abuse and to comply with the
> law, including after our account ends.
>
> We keep your rule and its verdict only to show you the result. We do not use
> submitted rules to train anything.
>
> **Do not paste secrets, credentials, or anyone's personal data.** Rules often
> contain file paths, internal project names, or example emails — strip them
> first.
>
> Results are a check on how a rule is written. They do not predict whether an
> AI will follow it.

Pair it with a short terms page carrying the §9.3 reality: no uptime promise, the
service can be suspended, output is provided as-is.

The last line is not legal boilerplate — it is the honesty constraint the whole
rubric rests on, and it belongs in front of the user rather than in a footer.

---

## Answers, short form

| Question | Answer |
| --- | --- |
| Can we sell a product that uses Jev? | **Yes** — §2.1(b), §2.2 |
| Does preview status change that? | **No** — the word appears nowhere in the MCA, and `jev-preview` = `jev-1.13.0` today |
| Do we own the verdicts the app produces? | **Yes** — §4.2 assigns Output to us |
| Can anonymous visitors use it? | **Yes**, as End Users of a Customer Application |
| Can we resell Jev access itself? | **No** — §2.3(a) |
| Can we train our own scorer on the verdicts? | **No** — §2.3(b) |
| Will they train on our users' rules? | **No**, not without consent — §4.1 |
| Can we say "Powered by TypeSafe"? | **Not without their prior consent** — Publicity |
| Is there an SLA? | **No** — §9.3, "as is" and "as available" |
| Where is the Acceptable Use Policy? | **Nowhere.** The contract's own URL 404s and no copy exists on the site |
| Why do we need a privacy notice? | The DPA names us **controller** (§1.1) and §5 makes us warrant we gave the notices |

---

## Rejected alternatives

- **Pinning `jev-preview` for the product.** Rejected on engineering grounds, not
  legal ones. An alias *"moves when a new release ships, so the answers behind it
  can change without a change on your side"*, and our verdict thresholds are
  calibrated against a labelled set. Pin `jev-1.13.0` explicitly and move on our
  own schedule. `jev-preview` buys nothing today — it resolves to the same build.
- **Relying on the docs alone for the licensing answer.** The docs' legal page
  says nothing about commercial use; only the MCA does. Recorded so a future
  session does not re-read `/legal.md` and conclude the question is unanswerable.

---

## Related

- [rule-scoring-product-viability.md](../decisions/rule-scoring-product-viability.md)
  — whether the product these terms permit is worth selling. Its *Where the
  supporting research lives* section explains why the earlier rubric and probe
  documents cannot be linked from this repository.
