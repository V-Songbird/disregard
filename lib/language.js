"use strict";

// Which language a rule is written in, and therefore whether it can be scored
// at all. Ported from assay's language screen, with the non-Latin branch split
// by script so the message can name what it found.
//
// The policy is that instruction files are written in English. That is what
// CLAUDE.md and AGENTS.md are in the wild, it is the only thing any of this was
// measured on, and F1, F2 and F7 are English word lists on top of that. So a
// rule that is not English is not scored at all — it is handed back with the
// reason. The interface, not the rule, is what carries other languages.
//
// The asymmetry between the two mistakes sets the thresholds, and it is assay's
// argument, kept: a false "not English" refuses a real English rule and the
// reader is told to translate something already translated. A false "English"
// only scores a rule the word lists will read badly, which the factors show. So
// reclassification takes strong evidence, and everything ambiguous, mixed or
// short stays English.

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
    "es", "son", "este", "esta", "como", "donde", "cuando", "porque", "pero", "más", "ya"],
  pt: ["o", "a", "os", "as", "do", "da", "dos", "das", "um", "uma", "e", "ou", "não", "que",
    "para", "com", "em", "no", "na", "nos", "nas", "sempre", "nunca", "antes", "depois",
    "cada", "é", "são", "este", "esta", "ao", "pelo", "pela", "se", "como", "mas"],
  fr: ["le", "la", "les", "des", "du", "un", "une", "et", "ou", "ne", "pas", "que", "qui", "dans",
    "pour", "avec", "sur", "sous", "avant", "après", "toujours", "jamais", "chaque", "est",
    "sont", "ce", "cette", "aux", "au", "par", "se", "son", "ses", "plus", "tout", "mais"],
  it: ["il", "lo", "la", "gli", "le", "dei", "delle", "un", "una", "e", "o", "non", "che", "chi",
    "nel", "nella", "per", "con", "su", "prima", "dopo", "sempre", "mai", "ogni", "è", "sono",
    "questo", "questa", "al", "dal", "da", "si", "come", "ma"],
  de: ["der", "die", "das", "den", "dem", "und", "oder", "nicht", "mit", "für", "bei", "vor",
    "nach", "immer", "nie", "wenn", "ein", "eine", "einen", "im", "ist", "sind", "sich", "auf",
    "aus", "zu", "von", "als", "wird", "werden", "kein", "keine", "aber"],
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

// Spanish and Portuguese share most of their closed class, so a stable order
// beats a coin flip. Which of the two is named is a guess; that it is NOT
// English is what the screen actually established.
const ORDER = ["es", "pt", "fr", "it", "de"];

const MIN_TOKENS = 6;        // fewer prose words than this and there is nothing to screen
const MIN_HITS = 3;          // distinct closed-class words needed to reclassify
const MAX_ENGLISH_HITS = 0;  // any English closed-class word at all means mixed, and mixed stays English

// The prose a language screen may read: code identifiers, paths, file names and
// backtick spans are language-neutral and would answer for whichever list their
// letters happened to match, so none of them reaches the token count.
function languageTokens(text) {
  const prose = String(text)
    .replace(/`[^`]*`/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[\w.-]*[/\\][\w./\\-]*/g, " ")
    .replace(/\b[\w-]+\.[A-Za-z]{1,5}\b/g, " ")
    .replace(/\b[\w-]*_[\w-]*\b/g, " ");
  return (prose.match(/\p{L}[\p{L}'’-]*/gu) || [])
    .filter((w) => !/\p{Lu}/u.test(w.slice(1)))
    .map((w) => w.toLowerCase());
}

// -> { code, name (null when unnamed), english }
function detectLanguage(text) {
  const s = String(text || "");

  for (const { code, pattern } of SCRIPTS) {
    if (pattern.test(s)) return { code, name: SCRIPT_NAMES[code], english: false };
  }
  if (OTHER_SCRIPT.test(s)) {
    return { code: "other", name: null, english: false };
  }

  const tokens = languageTokens(s);
  if (tokens.length < MIN_TOKENS) return { code: "en", name: "English", english: true };

  const seen = new Set(tokens);
  let english = 0;
  for (const w of seen) if (FUNCTION_WORDS.en.has(w)) english++;
  if (english > MAX_ENGLISH_HITS) return { code: "en", name: "English", english: true };

  let best = null, bestHits = 0;
  for (const lang of ORDER) {
    let hits = 0;
    for (const w of seen) if (FUNCTION_WORDS[lang].has(w)) hits++;
    if (hits > bestHits) { best = lang; bestHits = hits; }
  }
  if (!best || bestHits < MIN_HITS) return { code: "en", name: "English", english: true };

  return { code: best, name: NAMES[best], english: false };
}

module.exports = { detectLanguage, languageTokens };
