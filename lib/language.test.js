"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { detectLanguage, languageTokens } = require("./language.js");
const { FOREIGN, ENGLISH } = require("./fixtures/language.json");

// Scoring supports English instructions. Other detected languages are named
// in the response when the screen can identify them.

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

// Short or ambiguous input remains eligible for English scoring.
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

test("the English regression examples remain eligible", () => {
  const bad = ENGLISH.filter((c) => !detectLanguage(c.text).english).map((c) => c.id);
  assert.deepEqual(bad, [], "refused English: " + bad.join(", "));
});

// Explicitly track the short foreign example accepted by the screen.
const KNOWN_LEAK = new Set(["es-typescript"]);

test("only the documented short foreign example remains eligible", () => {
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

test("a five-word rule is long enough to screen", () => {
  assert.equal(detectLanguage("Nunca subas secretos al repositorio.").code, "es");
  assert.equal(detectLanguage("Ne jamais commiter sur main.").code, "fr");
});

test("one borrowed English word does not outvote the sentence", () => {
  const got = detectLanguage("Nunca uses any en el código de producción.");
  assert.equal(got.english, false);
  assert.equal(got.code, "es");
});

// English wins tied function-word evidence.
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

test("script gates ignore inline code and link destinations just as prose word counts do", () => {
  for (const text of [
    "Use `保存` for the Chinese save-button label.",
    "Never rename the `данные` field in the migration.",
    "Use `حفظ` as the Arabic locale value.",
    "Read the [setup guide](docs/中文.md) before editing.",
    "Read the [setup guide](docs/данные.md) before editing.",
    "Read the [setup guide](docs/حفظ.md) before editing.",
    "Use `保存 данные حفظ` in the fixture, and leave the labels unchanged.",
    "Use ``保存`` for the label.",
    "Use ``данные ` 保存`` for the fixture value.",
    "Use ``حفظ`` as the locale value.",
    "Use `el la los las antes después nunca siempre` as test data.",
  ]) assert.equal(detectLanguage(text).english, true, text);
  assert.deepEqual(languageTokens("Read [setup guide](docs/中文.md) with `данные`."), ["read", "setup", "guide", "with"]);
});

test("foreign visible prose and standalone link labels still trigger script rejection around ASCII code", () => {
  for (const [text, code] of [
    ["提交之前运行 `npm test`。", "zh"],
    ["لا تكتب الأسرار في `config.json`.", "ar"],
    ["Не записывайте секреты в `config.json`.", "other"],
    ["[中文指南](docs/setup.md)", "zh"],
    ["[دليل](docs/setup.md)", "ar"],
    ["[данные](docs/setup.md)", "other"],
    ["Keep `保存` unchanged and document 中文 outside the fixture.", "zh"],
  ]) assert.equal(detectLanguage(text).code, code, text);
});

test("strong English context treats balanced quoted data and translated links as data", () => {
  for (const text of [
    "Preserve the mail subject 『予約の確認』 when importing the sample mailbox.",
    "Match the heading «稍后再试» exactly when locating the captured error panel.",
    "The SQL example should insert the literal 'черновик' into `status_text`, leaving the column name unchanged.",
    "Add [دليل الرحلة](docs/travel.md) to the list of translated handbooks.",
    "Read the [中文指南](docs/setup.md) before editing.",
    "Read the [دليل](docs/setup.md) before editing.",
    "Read the [данные](docs/setup.md) before editing.",
  ]) assert.equal(detectLanguage(text).english, true, text);
  for (const [open, close] of [["'", "'"], ['"', '"'], ["‘", "’"], ["“", "”"], ["«", "»"], ["「", "」"], ["『", "』"]]) {
    const text = "Preserve the literal " + open + "保存 данные حفظ" + close + " before editing the fixture.";
    assert.equal(detectLanguage(text).english, true, text);
    assert.equal(languageTokens(text).includes("保存"), false, text);
  }
});

test("quotes and links cannot hide whole foreign instructions or supply their own English context", () => {
  for (const text of [
    "『提交之前运行格式化工具。』", "«لا تكتب الأسرار في المستودع.»", "'Не записывайте секреты.'",
    "Read 『保存』.", "Read [دليل](docs/setup.md).", "The the the 『保存』.",
    "`the before after with` 『保存』", "[the before after with](docs/setup.md) 『保存』",
    "Nunca cambies el valor «保存» antes de editar.",
    "the before nunca antes para cada 『保存』",
    "Keep the label 『保存』 before editing 中文 outside the quote.",
    "Keep the [setup guide](docs/setup.md) before editing данные outside the link.",
    "Keep the label 『保存 before editing.", "Keep the label '保存 before editing.",
    "Keep the label «保存」 before editing.",
    "Keep the l'中文' field before editing.", "Keep the l’中文’ field before editing.",
    "Never change the user's 中文 label before editing.",
  ]) assert.equal(detectLanguage(text).english, false, text);
  assert.equal(detectLanguage("Never change the user's '保存' label before editing.").english, true);
  assert.equal(detectLanguage("Do not change the user's name before editing.").english, true);
});

test("unsupported or mixed scripts are refused without naming Han-containing Japanese as Chinese", () => {
  for (const text of ["変更を保存してください。", "변경事項을 저장하세요.", "保存 данные", "保存 حفظ"]) {
    assert.deepEqual(detectLanguage(text), { code: "other", name: null, english: false }, text);
  }
  assert.deepEqual(detectLanguage("提交之前运行格式化工具。"), { code: "zh", name: "Chinese", english: false });
});

test("tied foreign function-word evidence stays rejected but unnamed and English still wins its ties", () => {
  assert.deepEqual(detectLanguage("Nunca antes para cada cambio."), { code: "other", name: null, english: false });
  assert.equal(detectLanguage("Never before after with nunca antes para cada cambio.").english, true);
  assert.equal(detectLanguage("Nunca subas secretos al repositorio.").code, "es");
});

test("code-only, exact backtick runs and unmatched delimiters keep deliberate language policies", () => {
  for (const text of ["`保存`", "``保存``", "``保存 ` данные``", "```保存```", "```\nданные\n```", "Use this fixture: ```\nحفظ\n```."]) {
    assert.equal(detectLanguage(text).english, true, text);
  }
  for (const [text, code] of [["Use `保存", "zh"], ["```\nданные", "other"], ["Use `حفظ", "ar"],
    ["Use ``保存` for the label.", "zh"], ["Use `保存`` for the label.", "zh"],
    ["Use ```данные`` for the field.", "other"], ["Use ``حفظ``` for the value.", "ar"],
    ["Use ``保存 ` field`` and explain 中文 outside the code.", "zh"]]) {
    assert.equal(detectLanguage(text).code, code, text);
  }
  assert.deepEqual(languageTokens("```\n保存\n```"), []);
  assert.deepEqual(languageTokens("Use ``保存 ` данные`` for the fixture."), ["use", "for", "the", "fixture"]);
  assert.equal(detectLanguage("Usa `保存`.").english, true); // Too little visible Latin prose to screen.
});
