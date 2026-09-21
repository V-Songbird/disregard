---
type: knowledge
summary: "The first measurement of the language screen — it was scoring 12 of 20 foreign rules as English and charging for them — what the three thresholds were wrong about, why it was safe to move all three at once, and the one case that still leaks; read before touching lib/language.js."
related_files:
  - "lib/language.js"
  - "eval/lang-set.js"
  - "eval/lang-eval.js"
  - "eval/results/lang-latest.txt"
---

# The language screen, measured

## Why it mattered most

It is the **first gate every request passes**, and it was the last screen here
with no labelled set behind it. It was ported from an earlier tool, and it was
never measured there either.

What it decides: English is scored, anything else is handed back unscored before
a request is spent. So it makes two mistakes, and they are not equal.

| | What happens | How bad |
| --- | --- | --- |
| **Leak** | a foreign rule is called English | It is then scored by English word lists, the reader gets a confident answer that means nothing, **and it costs a paid request the design promises never to spend** |
| **Refusal** | an English rule is called foreign | The reader is told to translate something already in English. **The worse one**, and the reason every threshold in the file leans toward English |

They are counted apart, and a fix is only a fix if refusals stay at zero.

## Baseline

```
working set   5 leaks / 10 foreign     0 refusals / 10 English
HELD OUT      7 leaks / 10 foreign     0 refusals / 10 English
```

**12 of 20 foreign rules were scored as English.** Confirmed on the deployed
endpoint before the fix: *"Nunca subas secretos al repositorio."* came back
`status: ok` with findings and **2,573 tokens spent**, while the same rule with
a second clause came back `not_english` at zero cost.

### The cause: the thresholds were written for paragraphs

A rule is one line. The screen wanted a paragraph.

| Threshold | Was | Blocked |
| --- | --- | --- |
| `MIN_TOKENS` | 6 prose words | **8 leaks** — a real rule has five |
| `MIN_HITS` | 3 closed-class words | **4 leaks** — a real rule has two |
| the English veto | any English word at all | the borrowed-term case |

*"Ne jamais commiter sur main."* carried **three** French function words and was
called English for having five prose words instead of six. *"Ogni modifica deve
avere un test."* had six words and two hits, and needed three.

The veto never fired on the first corpus, because the rules that would trip it
write their English term in backticks and backticks are stripped before the
screen reads anything. Two probes were added to the working set for it:
*"Nunca uses any en el código de producción."* lost, 3 Spanish hits to 1, to the
single bare word `any`.

## Why the bar belongs at two

The number the repair rests on came out of the English half of the set, which is
adversarial on purpose — short rules with nothing to read, and rules that carry
Spanish, French and German tokens as *data*: locale keys, file names, answer
values.

**Across 20 English rules, the most foreign closed-class words any of them
carried was one**, and only three carried even that: `si` in a boolean answer,
`do` in *"Do not assume…"*, `de` in a translation path. Counted at the repaired
word lists, across the 19 Latin-script foreign rules and the 20 English ones:

```
foreign rules   1, 2,2,2,2,2,2,2, 3,3,3,3,3,3, 4,4,4,4,4     distinct hits
English rules   0 ×17,  1, 1, 1                              distinct hits
```

Two sits in the gap. The single foreign rule at one hit is `es-typescript`, the
residual below — and it is honest to say the German word-list additions are part
of why the rest clear the bar: before them, `de-main` and `de-change` sat at one
hit too, tied with the highest English rule. The threshold move and the word
additions were made together and measured together.

## The repair

1. **`MIN_TOKENS` 6 → 3.** Below three prose words there really is nothing to
   read; above it there is.
2. **`MIN_HITS` 3 → 2.** Two sits inside the gap above.
3. **The English veto became a tie-break.** `english >= bestHits` still returns
   English, so mixed text stays English and equal evidence goes to English —
   but one borrowed word no longer outvotes three.
4. **Missing closed-class words added**, per language. *"Niemals direkt auf main
   committen"* had one hit because the German list carried `nie` but not
   `niemals`, and no determiner from the `jede/jeder/jedes` family. Only words
   that are never also English went in: **`todo` and `solo` stayed out**, because
   *"todo comments"* and *"run solo"* are English rules.

## Result

```
working set   0 leaks / 12 foreign     0 refusals / 10 English
HELD OUT      1 leak  / 10 foreign     0 refusals / 10 English
```

| | Before | After |
| --- | --- | --- |
| Leaks, the original 20 | **12 / 20** | **1 / 20** |
| Leaks, with the 2 veto probes | — | 1 / 22 |
| Refusals | 0 / 20 | **0 / 20** |
| Misnamed | 0 | 0 |

**Refusals stayed at zero**, which is the condition the repair had to meet. Every
caught rule is also named correctly — no rule is refused as French when it is
Spanish. The pins are in [lib/language.test.js](../../lib/language.test.js).

### The one that still leaks

*"No uses `any` en TypeScript."* — three prose words after `any` and
`TypeScript` are stripped, and exactly one of them, `en`, is on any list. There
is nothing there to read. Catching it would mean guessing, and guessing is what
produces the refusal this file is built to avoid.

It is pinned by name in the test so it cannot quietly become two.

## Rules for changing this

1. **Refusals are the number that matters.** A change that cuts leaks and
   refuses one English rule is a regression. `node eval/lang-eval.js` prints
   them apart for that reason.
2. **The held-out half is spent.** Say so rather than quoting 9/10 as if it were
   clean. `MIN_TOKENS` and `MIN_HITS` were diagnosed on the working set, where
   all five leaks were the token threshold — but the German words `niemals` and
   `jede` were added because of `de-main` and `de-change`, and both are held out.
   Build a second foreign set before claiming a held-out number again.
3. **A word only joins a list if it is never also English.** `todo` and `solo`
   are the worked examples of what stays out. The shared-word filter at the top
   of the file removes overlaps with the English list automatically, but it
   cannot see an English word that is not a function word.
4. **Do not chase `es-typescript`.** Three words, one hit. Fitting to it spends
   the held-out half for a case that has no signal in it.

## Rejected Alternatives

**Diacritics as evidence.** The obvious idea, and it catches nothing here: all
twelve leaks were diacritic-free. `Änderung` and `dépendance` appear in rules
that were already caught by other means. Checked before writing any code.

**Scaling `MIN_HITS` by sentence length.** A ratio rule was drafted and dropped
once the distribution above came out: with English never exceeding one hit, a
flat two is simpler and sits in the same gap.

**Adding imperative verbs — `usa`, `uses`, `utiliser`, `verwende`.** It would catch
`es-typescript` and it is the open-class word-list expansion that put F7 wrong
in the first place. The closed class is small, stable and finite; the open class
is neither.
