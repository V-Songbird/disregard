"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { detectLanguage } = require("../lib/language.js");

test("the five supported languages are named, not lumped together", () => {
  const cases = [
    ["Run prettier on modified files before committing.", "en"],
    ["Nunca subas secretos al repositorio; usa el gestor de secretos.", "es"],
    ["提交之前必须运行格式化工具。", "zh"],
    ["कमिट करने से पहले फ़ॉर्मैटर चलाएँ।", "hi"],
    ["لا تكتب الأسرار في المستودع أبدا.", "ar"],
    ["Ne jamais écrire les secrets dans le dépôt, utilisez le gestionnaire.", "fr"],
  ];
  for (const [text, code] of cases) {
    assert.equal(detectLanguage(text).code, code, text);
    assert.equal(detectLanguage(text).supported, true, text);
  }
});

test("a language outside the policy is detected and marked unsupported", () => {
  for (const [text, code] of [
    ["Der Code wird nicht ohne Tests und ohne Review zusammengeführt.", "de"],
    ["Не записывайте секреты в репозиторий, используйте менеджер секретов.", "other"],
  ]) {
    const got = detectLanguage(text);
    assert.equal(got.code, code, text);
    assert.equal(got.supported, false, text);
  }
});

test("only English gets the deterministic half", () => {
  assert.equal(detectLanguage("Use `const` for locals, not `var`.").english, true);
  assert.equal(detectLanguage("Ejecuta el formateador antes de cada commit del proyecto.").english, false);
});

// The asymmetry, and the reason the thresholds are where they are: withholding
// the deterministic findings from a real English rule is the expensive mistake,
// because nothing in the output says a check was skipped in error.
test("anything short, mixed or ambiguous stays English", () => {
  for (const text of [
    "Usa prettier.",                                   // too short to screen
    "Use `el` and `la` as the locale keys in the map",  // English carrying foreign tokens
    "Run `npm run build` in packages/app before pushing", // almost all of it is code
    "",
  ]) {
    assert.equal(detectLanguage(text).english, true, text);
  }
});
