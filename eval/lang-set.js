"use strict";

// A labelled set for the language screen — the first gate every request passes
// and the last thing here with no measurement behind it. It is assay's, ported,
// and it was never measured there either.
//
// What it decides: English is scored, anything else is handed back unscored
// before a request is spent. So it makes two mistakes, and they are not equal.
//
//   LEAK       a foreign rule called English. It is then scored by English word
//              lists, and the reader gets a confident answer that means nothing
//              — and it costs a paid request the design says to never spend.
//   REFUSAL    an English rule called foreign. The reader is told to translate
//              something already in English. This is the worse one, and it is
//              the reason every threshold in lib/language.js leans toward
//              English.
//
// So the two are counted separately and a fix is only a fix if refusals stay at
// zero. The English half of this set is adversarial on purpose: short rules
// with nothing to read, and rules that carry Spanish, French or German tokens
// as data — locale keys, file names, answer values.

const FOREIGN = [
  // --- working set ---------------------------------------------------------
  { id: "es-secrets", set: "work", code: "es",
    text: "Nunca subas secretos al repositorio." },
  { id: "es-pnpm", set: "work", code: "es",
    text: "Usa siempre pnpm, nunca npm." },
  { id: "es-tests", set: "work", code: "es",
    text: "Ejecuta las pruebas antes de cada commit." },
  { id: "fr-main", set: "work", code: "fr",
    text: "Ne jamais commiter sur main." },
  { id: "fr-const", set: "work", code: "fr",
    text: "Toujours utiliser const, jamais var." },
  { id: "it-any", set: "work", code: "it",
    text: "Non usare mai `any` nel codice." },
  { id: "de-tests", set: "work", code: "de",
    text: "Immer die Tests vor dem Push laufen lassen." },
  { id: "pt-push", set: "work", code: "pt",
    text: "Sempre rode os testes antes do push." },
  { id: "zh-format", set: "work", code: "zh",
    text: "提交前运行格式化工具。" },
  { id: "ar-secrets", set: "work", code: "ar",
    text: "لا تكتب الأسرار في المستودع." },
  // Probes for the English veto. A rule in another language still names its
  // tools in English, and one borrowed word used to outvote everything.
  { id: "es-borrowed", set: "work", code: "es",
    text: "Nunca uses any en el código de producción." },
  { id: "fr-borrowed", set: "work", code: "fr",
    text: "Ne jamais utiliser any dans le code de production." },

  // --- held out ------------------------------------------------------------
  { id: "es-typescript", set: "held", code: "es",
    text: "No uses `any` en TypeScript." },
  { id: "es-english-msgs", set: "held", code: "es",
    text: "Escribe los mensajes de commit en inglés." },
  { id: "fr-push", set: "held", code: "fr",
    text: "Lancer les tests avant chaque push." },
  { id: "fr-deps", set: "held", code: "fr",
    text: "Ne pas ajouter de dépendance sans discussion." },
  { id: "it-tests", set: "held", code: "it",
    text: "Esegui i test prima di ogni commit." },
  { id: "it-change", set: "held", code: "it",
    text: "Ogni modifica deve avere un test." },
  { id: "de-main", set: "held", code: "de",
    text: "Niemals direkt auf main committen." },
  { id: "de-change", set: "held", code: "de",
    text: "Jede Änderung braucht einen Test." },
  { id: "pt-main", set: "held", code: "pt",
    text: "Nunca faça commit direto na main." },
  { id: "hi-tests", set: "held", code: "hi",
    text: "कमिट करने से पहले टेस्ट चलाएँ।" },
];

const ENGLISH = [
  // --- working set ---------------------------------------------------------
  { id: "en-const", set: "work", text: "Use `const`, never `var`." },
  { id: "en-main", set: "work", text: "Never commit to main." },
  { id: "en-npm", set: "work", text: "Use npm, not yarn." },
  { id: "en-prettier", set: "work", text: "Run `prettier` on modified files before committing." },
  { id: "en-clean", set: "work", text: "Write clean, maintainable code." },
  // Carries Spanish tokens as data. The keys are the subject, not the language.
  { id: "en-locale-keys", set: "work", text: "Use `el` and `la` as the locale keys in the map." },
  { id: "en-locale-files", set: "work", text: "Name Spanish locale files `es.json` and Portuguese ones `pt.json`." },
  { id: "en-si-no", set: "work", text: "Keep the si and no answers as booleans." },
  { id: "en-timeout", set: "work", text: "Set the request timeout to 30 seconds." },
  { id: "en-unix", set: "work", text: "Do not assume Unix utilities are installed." },

  // --- held out ------------------------------------------------------------
  { id: "en-unknown", set: "held", text: "Prefer `unknown` over `any`." },
  { id: "en-push", set: "held", text: "Always run `npm test` before you push." },
  { id: "en-build", set: "held", text: "Every commit modifying `src/` must end with a passing build." },
  { id: "en-errors", set: "held", text: "Handle errors appropriately." },
  { id: "en-untrusted", set: "held", text: "Consider all inputs untrusted at the handler boundary." },
  { id: "en-any-unknown", set: "held", text: "Avoid `any`; prefer `unknown` when the type is genuinely open." },
  // More foreign tokens as data.
  { id: "en-de-fr-docs", set: "held", text: "Document the de and fr translations in `docs/i18n.md`." },
  { id: "en-du-jour", set: "held", text: "Name the daily export `menu-du-jour.csv` and nothing else." },
  { id: "en-short-cut", set: "held", text: "Cut it." },
  { id: "en-smallest", set: "held", text: "Prefer the smallest coherent solution." },
];

module.exports = { FOREIGN, ENGLISH };
