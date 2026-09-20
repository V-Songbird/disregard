"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { detectLanguage } = require("../lib/language.js");

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
