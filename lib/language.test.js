"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { detectLanguage } = require("./language.js");
const { FOREIGN, ENGLISH } = require("../eval/lang-set.js");

// This screen answers one question — is the rule in English? — because that is
// the only language instruction files are written in and the only one anything
// here was measured in. Naming the language is a courtesy for the message.

test("English is recognised and scored", () => {
  for (const text of [
    "Run prettier on modified files before committing.",
    "Use `const` for locals, not `var`.",
    "Every commit modifying src/ must end with a passing build.",
  ]) {
    assert.equal(detectLanguage(text).english, true, text);
  }
});

test("another language is caught and named where we can name it", () => {
  const cases = [
    ["Nunca subas secretos al repositorio; usa el gestor de secretos.", "es", "Spanish"],
    ["提交之前必须运行格式化工具。", "zh", "Chinese"],
    ["कमिट करने से पहले फ़ॉर्मैटर चलाएँ।", "hi", "Hindi"],
    ["لا تكتب الأسرار في المستودع أبدا.", "ar", "Arabic"],
    ["Ne jamais écrire les secrets dans le dépôt, utilisez le gestionnaire.", "fr", "French"],
    ["Der Code wird nicht ohne Tests und ohne Review zusammengeführt.", "de", "German"],
  ];
  for (const [text, code, name] of cases) {
    const got = detectLanguage(text);
    assert.equal(got.english, false, text);
    assert.equal(got.code, code, text);
    assert.equal(got.name, name, text);
  }
});

test("a script we cannot name is refused without guessing a name", () => {
  const got = detectLanguage("Не записывайте секреты в репозиторий, используйте менеджер секретов.");
  assert.equal(got.english, false);
  assert.equal(got.code, "other");
  assert.equal(got.name, null);
});

// The asymmetry, and the reason the thresholds are where they are: a false
// "not English" tells someone to translate a rule that is already in English.
test("anything short, mixed or ambiguous stays English", () => {
  for (const text of [
    "Usa prettier.",                                      // too short to screen
    "Use `el` and `la` as the locale keys in the map",     // English carrying foreign tokens
    "Run `npm run build` in packages/app before pushing",  // almost all of it is code
    "",
  ]) {
    assert.equal(detectLanguage(text).english, true, text);
  }
});

// Measured 2026-09-20 against eval/lang-set.js. It was leaking 12 of 20 foreign
// rules, because the thresholds were written for paragraphs and a rule is one
// line: six prose words minimum and three closed-class hits, where a real rule
// has five words and two hits. Leaks 12 → 1, refusals 0 → 0. The numbers and the
// reasoning are in docs/knowledge/language-screen-criteria.md.

// The mistake that must never happen: telling someone to translate English.
test("no English rule is ever handed back", () => {
  const bad = ENGLISH.filter((c) => !detectLanguage(c.text).english).map((c) => c.id);
  assert.deepEqual(bad, [], "refused English: " + bad.join(", "));
});

// One case still leaks, pinned by name so it cannot quietly become two.
const KNOWN_LEAK = new Set(["es-typescript"]);

test("the corpus leaks exactly the one case it is known to leak", () => {
  const leaked = FOREIGN.filter((c) => detectLanguage(c.text).english).map((c) => c.id);
  assert.deepEqual(leaked, [...KNOWN_LEAK], "leaks moved: " + leaked.join(", "));
});

test("a caught rule is named as the language it is in", () => {
  for (const c of FOREIGN) {
    const got = detectLanguage(c.text);
    if (got.english) continue;
    assert.equal(got.code, c.code, c.id);
  }
});

// The two thresholds that moved, as named cases, so a future change has to
// argue with them rather than with a count.
test("a five-word rule is long enough to screen", () => {
  assert.equal(detectLanguage("Nunca subas secretos al repositorio.").code, "es");
  assert.equal(detectLanguage("Ne jamais commiter sur main.").code, "fr");
});

test("one borrowed English word no longer outvotes the sentence", () => {
  const got = detectLanguage("Nunca uses any en el código de producción.");
  assert.equal(got.english, false);
  assert.equal(got.code, "es");
});

// The tie still goes to English, which is the asymmetry the whole file is
// built on.
test("English carrying foreign tokens as data stays English", () => {
  for (const text of [
    "Use `el` and `la` as the locale keys in the map.",
    "Keep the si and no answers as booleans.",
    "Document the de and fr translations in `docs/i18n.md`.",
    "Name the daily export `menu-du-jour.csv` and nothing else.",
  ]) {
    assert.equal(detectLanguage(text).english, true, text);
  }
});
