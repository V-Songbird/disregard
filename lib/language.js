"use strict";

// Screen for the English-only scorer. F1, F2 and F7 use English word lists.
// Non-Latin scripts and distinct function words provide language evidence;
// short or ambiguous Latin-script prose defaults to English.

// Named scripts. Each carries one language this screen names; anything else in
// a non-Latin script is named as such and refused the same way.
const SCRIPTS = [
  { code: "zh", pattern: /[㐀-䶿一-鿿]/ },
  { code: "hi", pattern: /[ऀ-ॿ]/ },
  { code: "ar", pattern: /[؀-ۿ]/ },
];

// Any other script this screen recognises. A rule written in one of these can
// still match an English verb on a borrowed token — a Cyrillic sentence
// containing "commit" scores F1 0.85 by lookup — so it has to be caught before
// the word lists run.
const OTHER_SCRIPT = new RegExp(
  "[\\u0370-\\u03FF\\u0400-\\u04FF\\u0530-\\u058F\\u0590-\\u05FF" +
  "\\u0E00-\\u0E7F\\u3040-\\u30FF\\uAC00-\\uD7AF]"
);

const SCRIPT_NAMES = { zh: "Chinese", hi: "Hindi", ar: "Arabic" };
const NAMES = { es: "Spanish", pt: "Portuguese", fr: "French", it: "Italian", de: "German" };

const FUNCTION_WORDS_RAW = {
  en: ["the", "a", "an", "of", "to", "in", "for", "with", "when", "before", "after", "and", "or",
    "that", "this", "is", "are", "be", "on", "at", "from", "by", "as", "it", "its", "every",
    "each", "never", "always", "must", "not", "into", "than", "then", "if", "while", "any",
    "no", "only", "out", "over", "under", "per", "without", "you", "your", "we", "our", "but"],
  es: ["el", "la", "los", "las", "un", "una", "y", "o", "no", "que", "de", "del", "para", "con",
    "en", "al", "se", "su", "sus", "sobre", "siempre", "nunca", "antes", "después", "cada",
    "es", "son", "este", "esta", "como", "donde", "cuando", "porque", "pero", "más", "ya",
    "debe", "deben", "sin", "toda", "todas", "según"],
  pt: ["o", "a", "os", "as", "do", "da", "dos", "das", "um", "uma", "e", "ou", "não", "que",
    "para", "com", "em", "no", "na", "nos", "nas", "sempre", "nunca", "antes", "depois",
    "cada", "é", "são", "este", "esta", "ao", "pelo", "pela", "se", "como", "mas",
    "deve", "devem", "sem", "toda", "todas", "segundo"],
  fr: ["le", "la", "les", "des", "du", "un", "une", "et", "ou", "ne", "pas", "que", "qui", "dans",
    "pour", "avec", "sur", "sous", "avant", "après", "toujours", "jamais", "chaque", "est",
    "sont", "ce", "cette", "aux", "au", "par", "se", "son", "ses", "plus", "tout", "mais",
    "doit", "doivent", "faut", "sans", "toute", "toutes", "selon"],
  it: ["il", "lo", "la", "gli", "le", "dei", "delle", "un", "una", "e", "o", "non", "che", "chi",
    "nel", "nella", "per", "con", "su", "prima", "dopo", "sempre", "mai", "ogni", "è", "sono",
    "questo", "questa", "al", "dal", "da", "si", "come", "ma",
    "deve", "devono", "senza", "tutte", "secondo"],
  de: ["der", "die", "das", "den", "dem", "und", "oder", "nicht", "mit", "für", "bei", "vor",
    "nach", "immer", "nie", "wenn", "ein", "eine", "einen", "im", "ist", "sind", "sich", "auf",
    "aus", "zu", "von", "als", "wird", "werden", "kein", "keine", "aber",
    "niemals", "jede", "jeder", "jedes", "muss", "müssen", "soll", "sollen",
    "darf", "dürfen", "ohne", "über", "unter"],
};

// A word that is English AND one of the screened languages — "no", "a", "in",
// "son", "die" — is evidence for neither side, so it leaves every list here
// rather than being curated out by hand and forgotten.
const FUNCTION_WORDS = (() => {
  const others = new Set(Object.entries(FUNCTION_WORDS_RAW)
    .filter(([lang]) => lang !== "en").flatMap(([, words]) => words));
  const shared = new Set(FUNCTION_WORDS_RAW.en.filter((w) => others.has(w)));
  return Object.fromEntries(Object.entries(FUNCTION_WORDS_RAW)
    .map(([lang, words]) => [lang, new Set(words.filter((w) => !shared.has(w)))]));
})();

// These languages share closed-class words. Equal strongest counts establish
// non-English text but cannot justify naming one language over another.
const ORDER = ["es", "pt", "fr", "it", "de"];

// Require enough prose and distinct function words before rejecting a rule.
const MIN_TOKENS = 3;        // fewer prose words than this and there is nothing to screen
const MIN_HITS = 2;          // distinct closed-class words needed to reclassify

/**
 * The prose a language screen may read. Code identifiers, paths, file names and
 * backtick spans are language-neutral and would answer for whichever list their
 * letters happened to match. Script checks and word counts must read the same
 * prose; a non-Latin identifier is no more language evidence than a Latin one.
 *
 * @param {string} text
 * @returns {string} Prose with the existing code/path exclusions applied.
 */
function languageProse(text) {
  let prose = String(text)
    // Match complete runs of equal length: a literal single backtick may occur
    // inside a double-backtick span. Unmatched/mismatched runs remain visible.
    // This handles backtick spans, not a full Markdown grammar (e.g. tilde fences).
    .replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, " ");
  // A quoted value or translated link label is data only when the remaining
  // prose independently supplies strong English evidence. Whole quoted foreign
  // instructions and label-only links must not disappear. This is bounded
  // lexical handling, not a Markdown/quotation parser; unmatched quotes remain.
  const masked = prose.replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/"[^"\r\n]*"|(?<![\p{L}\p{N}\p{M}])'[^'\r\n]*'(?![\p{L}\p{N}\p{M}])|“[^”\r\n]*”|(?<![\p{L}\p{N}\p{M}])‘[^’\r\n]*’(?![\p{L}\p{N}\p{M}])|«[^»\r\n]*»|「[^」\r\n]*」|『[^』\r\n]*』/gu, " ");
  const context = withoutPaths(masked);
  const tokens = proseTokens(context), evidence = languageEvidence(tokens);
  if (!scriptLanguage(context) && tokens.length >= MIN_TOKENS && evidence.english >= MIN_HITS && evidence.english >= evidence.bestHits) {
    prose = masked;
  }
  return withoutPaths(prose.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"));
}

function withoutPaths(text) {
  return text
    .replace(/[\w.-]*[/\\][\w./\\-]*/g, " ")
    .replace(/\b[\w-]+\.[A-Za-z]{1,5}\b/g, " ")
    .replace(/\b[\w-]*_[\w-]*\b/g, " ");
}

function proseTokens(prose) {
  return (prose.match(/\p{L}[\p{L}'’-]*/gu) || [])
    .filter((w) => !/\p{Lu}/u.test(w.slice(1)))
    .map((w) => w.toLowerCase());
}

/** @returns {string[]} Lowercased prose words, in source order. */
function languageTokens(text) {
  return proseTokens(languageProse(text));
}

function scriptLanguage(prose) {
  const named = SCRIPTS.filter(({ pattern }) => pattern.test(prose));
  // Kana/Hangul accompanying Han is not evidence for Chinese. Unsupported or
  // mixed recognized scripts remain rejected without inventing a language name.
  if (OTHER_SCRIPT.test(prose) || named.length > 1) return { code: "other", name: null, english: false };
  if (named.length) return { code: named[0].code, name: SCRIPT_NAMES[named[0].code], english: false };
  return null;
}

function languageEvidence(tokens) {
  const seen = new Set(tokens);
  const hits = (language) => [...seen].filter((word) => FUNCTION_WORDS[language].has(word)).length;
  const english = hits("en");
  const counts = ORDER.map((language) => ({ language, hits: hits(language) }));
  const bestHits = Math.max(...counts.map((count) => count.hits));
  return { english, bestHits, best: counts.filter((count) => count.hits === bestHits).map((count) => count.language) };
}

/**
 * Which language a rule is written in. Runs before any paid call.
 *
 * @param {string} text
 * @returns {{ code: string, name: string | null, english: boolean }}
 *   name is null when the script is recognised but the language is not.
 */
function detectLanguage(text) {
  const s = languageProse(text || "");

  const script = scriptLanguage(s);
  if (script) return script;

  const tokens = proseTokens(s);
  if (tokens.length < MIN_TOKENS) return { code: "en", name: "English", english: true };

  const { english, bestHits, best } = languageEvidence(tokens);
  if (bestHits < MIN_HITS) return { code: "en", name: "English", english: true };

  // English wins ties; one borrowed English token does not override a stronger
  // non-English match.
  if (english >= bestHits) return { code: "en", name: "English", english: true };

  if (best.length > 1) return { code: "other", name: null, english: false };
  return { code: best[0], name: NAMES[best[0]], english: false };
}

module.exports = { detectLanguage, languageTokens };
