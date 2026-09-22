"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = (file) => fs.readFileSync(path.join(__dirname, "../public", file), "utf8");

// i18n.js on its own, before file-i18n.js adds `file` and replaces `lede` and `promiseA`.
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

// Keys are dotted paths to each string; placeholders use the pages' {name} syntax.
const leaves = (value, prefix = "") => Object.entries(value).flatMap(([key, child]) =>
  child !== null && typeof child === "object" ? leaves(child, `${prefix}${key}.`) : [[prefix + key, child]]);
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
      .filter((key) => Object.hasOwn(actual, key) && placeholders(actual[key]) !== placeholders(expected[key]))
      .map((key) => `${key}: "${placeholders(actual[key])}" instead of "${placeholders(expected[key])}"`),
  };
}
const consistent = { missing: [], extra: [], placeholders: [] };

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
test("public/i18n.js es, fr and hi link markers keep their no-break space", () => {
  const broken = Object.entries(englishMarkers).flatMap(([code, marker]) => ["research", "privacy", "terms", "promiseLink"]
    .map((key) => [`${code}.${key}`, interfaceStrings[code][key]])
    .filter(([, text]) => !text.endsWith(marker) || text.split("\u00a0").length !== 2)
    .map(([name, text]) => `${name}: "${text.replaceAll("\u00a0", "\\u00a0")}"`));
  assert.deepEqual(broken, []);
});

for (const code of fileLocales.filter((code) => code !== "en")) {
  test(`public/file-i18n.js ${code} has the English keys and placeholders`, () => {
    assert.deepEqual(differences(probe[code], probe.en), consistent);
  });
}
