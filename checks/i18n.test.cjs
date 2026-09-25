"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = (file) => fs.readFileSync(path.join(__dirname, "../public", file), "utf8");

// i18n.js on its own, before file-i18n.js adds `file`, `lede` and `promiseA`.
const browser = { window: {} };
vm.runInNewContext(source("i18n.js"), browser);
const interfaceStrings = browser.window.STRINGS;
const interfaceLocales = Object.keys(interfaceStrings);

// file-i18n.js keeps its tables private and gives the English table and promise to any
// locale it lacks. Running it over the interface locales and every two- and three-letter
// language code shows which of those codes it defines.
const letters = [..."abcdefghijklmnopqrstuvwxyz"];
const twoLetter = letters.flatMap((a) => letters.map((b) => a + b));
const codes = [...interfaceLocales, ...twoLetter, ...twoLetter.flatMap((code) => letters.map((c) => code + c))];
const probe = Object.fromEntries(codes.map((code) => [code, {}]));
vm.runInNewContext(source("file-i18n.js"), { window: { STRINGS: probe } });
const withOwn = (key) => Object.keys(probe).filter((code) => code === "en" || probe[code][key] !== probe.en[key]);
const fileLocales = withOwn("file");

// A counted label is a set of forms keyed by plural category. Its categories differ between
// locales, so key parity treats the set as one string and the plural test below checks it.
const CATEGORIES = ["zero", "one", "two", "few", "many", "other"];
const isPlural = (value) => value !== null && typeof value === "object" && Object.hasOwn(value, "other") &&
  Object.keys(value).every((key) => CATEGORIES.includes(key));

// Keys are dotted paths to each string; placeholders use the pages' {name} syntax.
const leaves = (value, prefix = "") => Object.entries(value).flatMap(([key, child]) =>
  child !== null && typeof child === "object" && !isPlural(child) ? leaves(child, `${prefix}${key}.`) : [[prefix + key, child]]);
const placeholders = (text) => [...new Set(String(text).match(/\{\w+\}/g))].sort().join(" ");
const compare = (actual, expected) => ({
  missing: expected.filter((item) => !actual.includes(item)),
  extra: actual.filter((item) => !expected.includes(item)),
});

function differences(strings, english) {
  const actual = Object.fromEntries(leaves(strings));
  const expected = Object.fromEntries(leaves(english));
  return {
    ...compare(Object.keys(actual), Object.keys(expected)),
    placeholders: Object.keys(expected)
      .filter((key) => Object.hasOwn(actual, key) && !isPlural(expected[key]) && placeholders(actual[key]) !== placeholders(expected[key]))
      .map((key) => `${key}: "${placeholders(actual[key])}" instead of "${placeholders(expected[key])}"`),
  };
}
const consistent = { missing: [], extra: [], placeholders: [] };

// Each counted label has exactly the plural categories of the page language tag. A form keeps
// the English placeholders; one whose category matches a single count may leave some out.
function pluralDifferences(strings, english, tag) {
  const rules = new Intl.PluralRules(tag), categories = [...rules.resolvedOptions().pluralCategories].sort();
  const single = (category) => Array.from({ length: 1001 }, (_, n) => rules.select(n)).filter((c) => c === category).length === 1;
  const actual = Object.fromEntries(leaves(strings));
  return leaves(english).filter(([, forms]) => isPlural(forms)).flatMap(([key, forms]) => {
    if (!isPlural(actual[key])) return [`${key}: not a set of plural forms`];
    const found = Object.keys(actual[key]).sort();
    if (found.join(" ") !== categories.join(" ")) return [`${key}: categories "${found.join(" ")}" instead of "${categories.join(" ")}"`];
    const expected = placeholders(forms.other);
    return found.filter((category) => {
      const names = placeholders(actual[key][category]);
      return single(category) ? !names.split(" ").filter(Boolean).every((name) => expected.split(" ").includes(name)) : names !== expected;
    }).map((category) => `${key}.${category}: "${placeholders(actual[key][category])}" instead of "${expected}"`);
  });
}

test("public/i18n.js and public/file-i18n.js define the same locales", () => {
  const same = { missing: [], extra: [] };
  assert.deepEqual({ locales: compare(fileLocales, interfaceLocales), promises: compare(withOwn("promiseA"), interfaceLocales) },
    { locales: same, promises: same });
});

for (const code of interfaceLocales.filter((code) => code !== "en")) {
  test(`public/i18n.js ${code} has the English keys and placeholders`, () => {
    assert.deepEqual(differences(interfaceStrings[code], interfaceStrings.en), consistent);
  });
}

// A no-break space keeps each English-page marker on one line when a link label wraps.
const englishMarkers = { es: "(en\u00a0inglés)", fr: "(en\u00a0anglais)", hi: "(अंग्रेज़ी\u00a0में)" };
test("public/i18n.js and public/file-i18n.js es, fr and hi link markers keep their no-break space", () => {
  const broken = Object.entries(englishMarkers).flatMap(([code, marker]) => ["research", "privacy", "terms", "promiseLink"]
    .map((key) => [`${code}.${key}`, interfaceStrings[code][key]]).concat([[`${code}.file.longFile.link`, probe[code].file.longFile.link]])
    .filter(([, text]) => !text.endsWith(marker) || text.split("\u00a0").length !== 2)
    .map(([name, text]) => `${name}: "${text.replaceAll("\u00a0", "\\u00a0")}"`));
  assert.deepEqual(broken, []);
});

// No-break spaces are written as escapes, so none is invisible in review or lost on a retype.
test("public/i18n.js and public/file-i18n.js write no-break spaces as escapes", () => {
  const literal = ["i18n.js", "file-i18n.js"].flatMap((file) => source(file).split("\n")
    .flatMap((line, i) => /[\u{a0}\u{202f}]/u.test(line) ? [`public/${file}:${i + 1}`] : []));
  assert.deepEqual(literal, []);
});

// The single-rule busy text names the stop control by the label it shows.
test("public/i18n.js busyBody names each locale's stop control", () => {
  assert.deepEqual(interfaceLocales.filter((code) => !interfaceStrings[code].busyBody.includes(probe[code].file.cancel)), []);
});

for (const code of fileLocales.filter((code) => code !== "en")) {
  test(`public/file-i18n.js ${code} has the English keys and placeholders`, () => {
    assert.deepEqual(differences(probe[code], probe.en), consistent);
  });
}

// No translation value types a number. Limits, counts and scale ranges are placeholders that the
// page fills through its number formatter; only names such as UTF-8 may carry digits.
const NAMES_WITH_DIGITS = ["UTF-8"];
const values = (value, prefix = "") => typeof value === "string" ? [[prefix, value]] : value !== null && typeof value === "object"
  ? Object.entries(value).flatMap(([key, child]) => values(child, prefix ? prefix + "." + key : key)) : [];
test("public/i18n.js and public/file-i18n.js type no numbers outside placeholders", () => {
  const typed = interfaceLocales.flatMap((code) => [...values(interfaceStrings[code]), ...values(probe[code])]
    .filter(([, text]) => /\p{Nd}/u.test(NAMES_WITH_DIGITS.reduce((rest, name) => rest.replaceAll(name, ""), text.replace(/\{\w+\}/g, ""))))
    .map(([key, text]) => `${code}.${key}: ${text}`));
  assert.deepEqual(typed, []);
});

// Every code public/document-model.js raises through fail() has English file-mode wording. Without
// it the file form falls back to invalid_source and blames the reader's file.
test("public/file-i18n.js words every error code public/document-model.js raises", () => {
  const raised = [...new Set([...source("document-model.js").matchAll(/\bfail\(\s*(['"])(\w+)\1\s*\)/g)].map((match) => match[2]))].sort();
  assert.ok(raised.length > 0, "no fail('...') calls found in public/document-model.js");
  assert.deepEqual(raised.filter((code) => !Object.hasOwn(probe.en.file, code) || typeof probe.en.file[code] !== "string"), []);
});

// Every literal error code public/review-ui.js assigns has English wording in the table that renders
// it. The file form reads file.<code>. A unit reads file.unitErrors, then file.<code> for the codes
// renderUnit lists as unscored responses, then errors.<code>. Codes that arrive from the service or
// the prompt check are variables, not string literals, so they are not collected.
test("public/review-ui.js assigns only error codes that have English wording", () => {
  const ui = source("review-ui.js");
  const literals = (pattern) => [...new Set([...ui.matchAll(pattern)]
    .flatMap((match) => [...match[1].matchAll(/"(\w+)"/g)].map((code) => code[1])))].sort();
  const form = literals(/(?<![.\w])errorCode\s*=(?!=)([^;]*);/g);
  const units = literals(/\b(?:unit\.errorCode\s*=(?!=)|code:)([^;]*);/g);
  const unscored = literals(/const invalid = [^;]*?\[([^\]]*)\]\.includes\(unit\.errorCode\)/g);
  assert.ok(form.length && units.length && unscored.length, "no error code assignments found in public/review-ui.js");
  const worded = (table, code) => Object.hasOwn(table, code) && typeof table[code] === "string";
  const file = probe.en.file, errors = interfaceStrings.en.errors;
  assert.deepEqual({
    form: form.filter((code) => !worded(file, code)),
    units: units.filter((code) => !worded(file.unitErrors, code) && !(unscored.includes(code) ? worded(file, code) : worded(errors, code))),
  }, { form: [], units: [] });
});

// Every literal code public/index.html gives the single-rule error view has an English errors.<code>
// string in public/i18n.js, the table the view renders from. Service codes arrive as variables
// (body?.code), not string literals, so they are not collected.
test("public/index.html gives the single-rule error view only codes that have English wording", () => {
  const page = source("index.html");
  assert.ok(page.includes("own(t.errors, view.code)"), "the single-rule error view no longer renders from t.errors; update this test");
  const codes = [...new Set([...page.matchAll(/kind:\s*"error",\s*code:\s*([^}]*)\}/g)]
    .flatMap((match) => [...match[1].matchAll(/"(\w+)"/g)].map((code) => code[1])))].sort();
  assert.ok(codes.length > 0, "no literal single-rule error codes found in public/index.html");
  const errors = interfaceStrings.en.errors;
  assert.deepEqual(codes.filter((code) => !Object.hasOwn(errors, code) || typeof errors[code] !== "string"), []);
});

// Plural rules follow the lang tag each locale sets on <html>.
const { langTags } = require("./browser-assets.cjs");
for (const code of fileLocales) {
  test(`public/file-i18n.js ${code} counted labels use the plural categories of ${langTags[code] || code}`, () => {
    assert.deepEqual(pluralDifferences(probe[code], probe.en, langTags[code] || code), []);
  });
}
