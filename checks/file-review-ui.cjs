"use strict";

// Real installed Edge, local HTTP fixtures and a simulated clipboard boundary.
// No provider calls, system clipboard reads, or external browser requests.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const http = require("node:http"), { createHash } = require("node:crypto");
const { chromium } = require(process.env.DISREGARD_PLAYWRIGHT_MODULE || "playwright");
const { localSite, locales, langTags, loopbackOnlyArgs } = require("./browser-assets.cjs");
const root = path.resolve(__dirname, ".."), target = process.argv[2] && path.resolve(process.argv[2]);
if (!target || fs.existsSync(target)) throw new Error("Pass a new report path: node checks/file-review-ui.cjs <new-report.json>");
fs.mkdirSync(path.dirname(target), { recursive: true });
const site = localSite({ "/privacy": "privacy.html" });
const report = { browser: "installed Edge", clipboard: "simulated writeText success/rejection; system clipboard untouched",
  sourceHashes: { ...site.hashes, "checks/file-review-ui.cjs": createHash("sha256").update(fs.readFileSync(__filename)).digest("hex") },
  checks: [], pageErrors: [], screenshots: [] };
// The deploy step names "it", so it needs its surrounding text as well as its heading and stays unscored.
const sample = "# Project instructions\n\n- Always try to use functional components.\n- Run `node --test` before submitting changes.\n- Never log passwords.\n\n## Before deployment\n\n- Run it with `npm run deploy`.\n\n> Run an example command.\n\n@OTHER.md";
// A step that needs only its conditional heading is scored with that heading stated first, and so are
// a numbered procedure and a list item with its nested items, each as one block.
const scopedDoc = "## Before deployment\n\n- Run the full test suite.\n\n1. Build the app.\n2. Ship it.\n\n- Keep tests fast:\n  - Avoid network calls.";
const scopedRules = ["Before deployment:\nRun the full test suite.", "Before deployment:\n1. Build the app.\n2. Ship it.",
  "Before deployment:\nKeep tests fast:\n- Avoid network calls."];
// An instruction to read a linked Markdown file is scored as written and says that file was not read;
// a link given only for reference still needs its context.
const linkedRule = "Read and follow [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.";
const linkedDoc = linkedRule + "\n\nSee [the notes](NOTES.md) for background.";
const batch = Array.from({ length: 5 }, (_, i) => `- Use module${i} for storage.`).join("\n");
let mode = "ok", requests = [], active = 0, maxActive = 0, waiting = [], windowCount = 0;
function result(rule) {
  const hedge = rule.includes("try to");
  return { status: "ok", findings: hedge ? [{ id: "hedge_dominance", factor: "F1", value: 0.2, verb: "try to" }] : [],
    factors: { F1: hedge ? 0.2 : 0.85, F2: 0.85, F3: 2, F7: 0.8, F8: 2, is_rule: 0.95,
      primitive: { choice: "rule", confidence: 0.9 }, rule_role: { choice: "direct_action", confidence: 0.9 } } };
}
// Not-English, inherited error code and unknown finding responses, keyed by the rule sent.
const statusCases = {
  "Keep requirements in Spanish.": [200, { status: "not_english", language: { code: "es", name: "Spanish" }, findings: [] }],
  "Keep requirements in an unnamed script.": [200, { status: "not_english", language: { code: "other", name: null }, findings: [] }],
  "Keep requirements in Klingon.": [200, { status: "not_english", language: { code: "__proto__", name: "Klingon" }, findings: [] }],
  "Report an inherited error code.": [502, { code: "constructor" }],
  "Report a future finding.": [200, { ...result(""), findings: [{ id: "future_finding", factor: "F8", value: 2 }] }],
};
const statusDoc = Object.keys(statusCases).map((text) => "- " + text).join("\n");
// Bulk-retry outcomes keyed by the rule sent; a rule missing here is held past the page's deadline.
// The page's prompt check is stubbed to reject "Return an oversized prompt." as prompt_too_large,
// a code one real excerpt cannot reach.
const retryCases = {
  "Report a future finding.": statusCases["Report a future finding."],
  "Return an unverifiable result.": [200, { status: "ok", findings: [], factors: {} }],
  "Return an oversized prompt.": [200, result("")],
  "Keep functions short.": [200, result("")],
};
const retryDoc = ["Report a future finding.", "Return an unverifiable result.", "Return an oversized prompt.", "Wait past the deadline.",
  "Keep functions short."].map((text) => "- " + text).join("\n");
// The not-English message written out per locale, never built from the template under test: Spanish text,
// an unnamed script, and a name only the service supplies. A broken template or name fails these.
const notEnglishSentences = {
  en: { spanish: "This looks like Spanish. Scoring is evaluated on English rules, so this text was not scored. Check the language or translate the rule, then try again.",
    unknown: "Scoring is evaluated only on English rules. Check the language or translate the rule, then try again.",
    klingon: "This looks like Klingon. Scoring is evaluated on English rules, so this text was not scored. Check the language or translate the rule, then try again." },
  es: { spanish: "Esto parece estar en español. El análisis se evalúa con reglas en inglés, así que este texto no se analizó. Revisa el idioma o traduce la regla y vuelve a intentarlo.",
    unknown: "El análisis se evalúa únicamente con reglas en inglés. Revisa el idioma o traduce la regla y vuelve a intentarlo.",
    klingon: "Esto parece estar en Klingon. El análisis se evalúa con reglas en inglés, así que este texto no se analizó. Revisa el idioma o traduce la regla y vuelve a intentarlo." },
  zh: { spanish: "这看起来像西班牙文。评分功能是用英文规则评估的，因此未对这段文本评分。请检查语言或翻译规则，然后重试。",
    unknown: "评分功能仅用英文规则进行过评估。请检查语言或翻译规则，然后重试。",
    klingon: "这看起来像Klingon。评分功能是用英文规则评估的，因此未对这段文本评分。请检查语言或翻译规则，然后重试。" },
  hi: { spanish: "यह स्पेनिश जैसा लगता है। स्कोरिंग का मूल्यांकन अंग्रेज़ी नियमों पर किया जाता है, इसलिए इस पाठ को स्कोर नहीं किया गया। भाषा जाँचें या नियम का अनुवाद करें, फिर दोबारा प्रयास करें।",
    unknown: "स्कोरिंग का मूल्यांकन केवल अंग्रेज़ी नियमों पर किया जाता है। भाषा जाँचें या नियम का अनुवाद करें, फिर दोबारा प्रयास करें।",
    klingon: "यह Klingon जैसा लगता है। स्कोरिंग का मूल्यांकन अंग्रेज़ी नियमों पर किया जाता है, इसलिए इस पाठ को स्कोर नहीं किया गया। भाषा जाँचें या नियम का अनुवाद करें, फिर दोबारा प्रयास करें।" },
  ar: { spanish: "يبدو أن هذا النص مكتوب باللغة الإسبانية. تُقيَّم جودة التحليل باستخدام قواعد إنجليزية، لذلك لم يُحلَّل هذا النص. راجع اللغة أو ترجم القاعدة، ثم حاول مجددًا.",
    unknown: "تُقيَّم جودة التحليل باستخدام قواعد إنجليزية فقط. راجع اللغة أو ترجم القاعدة، ثم حاول مجددًا.",
    klingon: "يبدو أن هذا النص مكتوب باللغة Klingon. تُقيَّم جودة التحليل باستخدام قواعد إنجليزية، لذلك لم يُحلَّل هذا النص. راجع اللغة أو ترجم القاعدة، ثم حاول مجددًا." },
  fr: { spanish: "Ce texte semble être de l’espagnol. L’analyse est évaluée sur des règles en anglais\u00a0; ce texte n’a donc pas été analysé. Vérifiez la langue ou traduisez la règle, puis réessayez.",
    unknown: "L’analyse n’est évaluée que sur des règles en anglais. Vérifiez la langue ou traduisez la règle, puis réessayez.",
    klingon: "Ce texte semble être Klingon. L’analyse est évaluée sur des règles en anglais\u00a0; ce texte n’a donc pas été analysé. Vérifiez la langue ou traduisez la règle, puis réessayez." },
};
// Joins and numbers written out: the heading path shown for the deploy step, and the measured
// values of the first analyzed excerpt in page order, ending with the two confidence joins.
const joinExamples = {
  fr: { context: "Titres environnants\u00a0: Project instructions / Before deployment",
    values: ["0,95", "2", "2", "0,2", "0,85", "0,8", "une consigne d’action (confiance 0,9)", "une règle (confiance 0,9)"] },
  ar: { context: "العناوين المحيطة: Project instructions / Before deployment",
    values: ["0.95", "2", "2", "0.2", "0.85", "0.8", "تعليمات لتنفيذ إجراء (ثقة 0.9)", "قاعدة (ثقة 0.9)"] },
};
// Unit locations written out per locale: a list item across lines 1 and 2, then a one-line item on line 3.
const unitLocations = {
  en: ["Lines 1–2", "Line 3"], es: ["Líneas 1–2", "Línea 3"], zh: ["第 1–2 行", "第 3 行"],
  hi: ["पंक्तियाँ 1–2", "पंक्ति 3"], ar: ["الأسطر 1–2", "السطر 3"], fr: ["Lignes 1–2", "Ligne 3"],
};
// Counted labels written out per locale: start and retry buttons for 1, 2, 5 and 11 units, progress at
// 0 and 1 of 2 finished, and coverage with 3 scored, 1 flagged, 5 left; 1 left; and 11 left.
const countedLabels = {
  en: { start1: "Analyze 1 instruction", start2: "Analyze 2 instructions", start5: "Analyze 5 instructions", start11: "Analyze 11 instructions",
    retry1: "Analyze 1 remaining instruction", retry2: "Analyze 2 remaining instructions",
    running0: "Analyzing instructions… 0 of 2 finished.", running1: "Analyzing instructions… 1 of 2 finished.",
    coverage315: "3 analyzed · 1 with findings · 5 not analyzed", coverage001: "0 analyzed · 0 with findings · 1 not analyzed",
    coverage11: "0 analyzed · 0 with findings · 11 not analyzed" },
  es: { start1: "Analizar 1 instrucción", start2: "Analizar 2 instrucciones", start5: "Analizar 5 instrucciones", start11: "Analizar 11 instrucciones",
    retry1: "Analizar 1 instrucción pendiente", retry2: "Analizar 2 instrucciones pendientes",
    running0: "Analizando instrucciones… 0 de 2 terminaron.", running1: "Analizando instrucciones… 1 de 2 terminó.",
    coverage315: "3 analizados · 1 con hallazgos · 5 sin analizar", coverage001: "0 analizados · 0 con hallazgos · 1 sin analizar",
    coverage11: "0 analizados · 0 con hallazgos · 11 sin analizar" },
  zh: { start1: "分析 1 条指令", start2: "分析 2 条指令", start5: "分析 5 条指令", start11: "分析 11 条指令",
    retry1: "分析剩余的 1 条指令", retry2: "分析剩余的 2 条指令",
    running0: "正在分析指令…已完成 0 / 2 项。", running1: "正在分析指令…已完成 1 / 2 项。",
    coverage315: "已分析 3 项 · 1 项有发现 · 5 项未分析", coverage001: "已分析 0 项 · 0 项有发现 · 1 项未分析",
    coverage11: "已分析 0 项 · 0 项有发现 · 11 项未分析" },
  hi: { start1: "1 निर्देश का विश्लेषण करें", start2: "2 निर्देशों का विश्लेषण करें", start5: "5 निर्देशों का विश्लेषण करें",
    start11: "11 निर्देशों का विश्लेषण करें", retry1: "बाकी 1 निर्देश का विश्लेषण करें", retry2: "बाकी 2 निर्देशों का विश्लेषण करें",
    running0: "निर्देशों का विश्लेषण हो रहा है… 2 में से 0 पूरा हुआ।", running1: "निर्देशों का विश्लेषण हो रहा है… 2 में से 1 पूरा हुआ।",
    coverage315: "3 का विश्लेषण हुआ · 1 में निष्कर्ष मिले · 5 का विश्लेषण नहीं हुआ",
    coverage001: "0 का विश्लेषण हुआ · 0 में निष्कर्ष मिले · 1 का विश्लेषण नहीं हुआ",
    coverage11: "0 का विश्लेषण हुआ · 0 में निष्कर्ष मिले · 11 का विश्लेषण नहीं हुआ" },
  ar: { start1: "تحليل تعليمة واحدة", start2: "تحليل تعليمتين", start5: "تحليل 5 تعليمات", start11: "تحليل 11 تعليمة",
    retry1: "تحليل التعليمة المتبقية", retry2: "تحليل التعليمتين المتبقيتين",
    running0: "جارٍ تحليل التعليمات… اكتمل 0 من 2.", running1: "جارٍ تحليل التعليمات… اكتمل 1 من 2.",
    coverage315: "تم تحليل 3 · ظهرت ملاحظات في 1 · لم يُحلل 5", coverage001: "تم تحليل 0 · ظهرت ملاحظات في 0 · لم يُحلل 1",
    coverage11: "تم تحليل 0 · ظهرت ملاحظات في 0 · لم يُحلل 11" },
  fr: { start1: "Analyser 1 instruction", start2: "Analyser 2 instructions", start5: "Analyser 5 instructions", start11: "Analyser 11 instructions",
    retry1: "Analyser 1 instruction restante", retry2: "Analyser les 2 instructions restantes",
    running0: "Analyse des instructions… 0 sur 2 terminée.", running1: "Analyse des instructions… 1 sur 2 terminée.",
    coverage315: "3 analysés · 1 avec des points à examiner · 5 non analysés", coverage001: "0 analysé · 0 avec des points à examiner · 1 non analysé",
    coverage11: "0 analysé · 0 avec des points à examiner · 11 non analysés" },
};
function reply(entry, code = 200, body = result(entry.rule)) {
  if (entry.res.destroyed) return;
  entry.res.writeHead(code, { "Content-Type": "application/json" }); entry.res.end(JSON.stringify(body));
}
function releaseAll() { for (const entry of waiting.splice(0)) reply(entry); }
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/score") {
    const raw = await site.readBody(req);
    if (raw === null) return;
    const { rule } = JSON.parse(raw);
    const entry = { rule, res }; requests.push(entry); active++; maxActive = Math.max(maxActive, active);
    res.once("close", () => active--);
    if (mode === "hold") waiting.push(entry);
    else if (mode === "retry") { if (retryCases[rule]) reply(entry, ...retryCases[rule]); else waiting.push(entry); }
    else if (mode === "html-rate") { res.writeHead(429, { "Content-Type": "text/html" }); res.end("<html>Limited</html>"); }
    else if (mode === "empty-unavailable") { res.writeHead(503); res.end(); }
    else if (mode === "rate") reply(entry, 429, { code: "rate_limited" });
    // The Worker's client limit of 60 a minute; the check resets the count when it advances the page's clock a minute.
    else if (mode === "window") { if (++windowCount > 60) reply(entry, 429, { code: "rate_limited" }); else reply(entry); }
    else if (mode === "partial" && rule.includes("module1")) reply(entry, 502, { code: "upstream" });
    else if (mode === "refused" && rule.includes("module1")) reply(entry, 200, { status: "refused", findings: [], echo: "DO NOT EXPORT THIS ECHO" });
    else if (mode === "invalid") reply(entry, 200, { status: "ok", findings: [], factors: {} });
    else if (mode === "status") reply(entry, ...statusCases[rule]);
    else reply(entry);
    return;
  }
  site.serve(req, res);
});
function check(name, actual, expected = true) {
  let passed = true; try { assert.deepEqual(actual, expected); } catch { passed = false; }
  report.checks.push({ name, passed, actual, expected });
}
async function settled(page) { await page.waitForFunction(() => document.getElementById("file-cancel").hidden); }
async function prepare(page, text = sample) {
  await page.fill("#file-source", text); await page.click("#file-prepare");
}
// Follows the privacy-notice link and answers any leave-page dialog, staying or leaving.
async function followPrivacy(page, stay) {
  const asked = [];
  const answer = (dialog) => { asked.push(dialog.type()); return stay ? dialog.dismiss() : dialog.accept(); };
  page.on("dialog", answer);
  try {
    await page.click("#promise a");
    if (stay) await page.waitForTimeout(300); else await page.waitForURL("**/privacy");
  } finally { page.off("dialog", answer); }
  return { asked, path: new URL(page.url()).pathname };
}
async function copyText(page) {
  await page.locator("#file-export .copy-prompt").click();
  return page.evaluate(() => window.copiedPrompt);
}
async function reset(page) {
  mode = "ok"; releaseAll(); await page.reload();
  await page.waitForSelector("#file-source"); requests = []; maxActive = active;
}
// Each unit's state and label, and the lines under its excerpt other than the heading context.
async function unitHints(page) {
  return page.evaluate(() => {
    const context = STRINGS[document.getElementById("ui-lang").value].file.context.split("{path}")[0];
    return [...document.querySelectorAll(".instruction-unit")].map((unit) => ({ state: unit.dataset.state,
      label: unit.querySelector(".unit-state").textContent,
      hints: [...unit.querySelectorAll(".unit-content > p.hint")].map((p) => p.textContent).filter((text) => !text.startsWith(context)) }));
  });
}

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({ channel: "msedge", headless: true, args: loopbackOnlyArgs }); report.version = browser.version();
    for (const layout of ["desktop", "mobile"]) for (const locale of locales) {
      mode = "ok"; requests = []; maxActive = active;
      const context = await browser.newContext({ viewport: layout === "mobile" ? { width: 375, height: 812 } : { width: 1280, height: 900 }, locale: "en-US" });
      const page = await context.newPage(); page.on("pageerror", error => report.pageErrors.push(error.message));
      site.watch(context, url);
      await page.addInitScript(() => {
        window.copiedPrompt = null; window.denyClipboard = false;
        Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => {
          if (window.denyClipboard) throw new DOMException("denied", "NotAllowedError");
          window.copiedPrompt = text;
        } } });
      });
      await page.goto(url); await page.selectOption("#ui-lang", locale);
      const prefix = layout + " " + locale;
      check(prefix + " file mode is default", await page.locator("#file-panel").isVisible());
      await prepare(page); check(prefix + " preview is local", requests.length, 0);
      const preview = await unitHints(page);
      const reasons = await page.evaluate(() => Object.values(STRINGS[document.getElementById("ui-lang").value].file.reasons));
      check(prefix + " ready units repeat no state", preview.filter((unit) => unit.state === "ready").map((unit) => unit.hints), [[], [], []]);
      check(prefix + " excluded units keep their reasons", preview.filter((unit) => unit.state !== "ready")
        .map((unit) => unit.hints.length === 1 && reasons.includes(unit.hints[0]) ? "reason" : unit.hints), Array(5).fill("reason"));
      const ready = await page.locator('.instruction-unit[data-state="ready"]').count();
      check(prefix + " 3 independent rules", ready, 3);
      check(prefix + " inherited scope excluded", await page.locator('.instruction-unit[data-state="requires_context"]').count(), 1);
      await page.click("#file-start"); await settled(page);
      const coverage315 = await page.textContent("#file-report .coverage");
      if (joinExamples[locale]) check(prefix + " joins and numbers follow the locale", await page.evaluate(() => ({
        context: document.querySelector('.instruction-unit[data-state="requires_context"] .unit-content > p.hint')?.textContent,
        values: [...document.querySelector('.instruction-unit[data-state="ok"]').querySelectorAll("dd")].map((dd) => dd.textContent) })), joinExamples[locale]);
      check(prefix + " sends exact 3 units", requests.length, 3);
      check(prefix + " concurrency bounded", maxActive <= 2);
      const text = await copyText(page);
      check(prefix + " copied evidence", text.includes("hedge_dominance") && text.includes("Always try to use functional components."));
      check(prefix + " context-dependent command not exported", !text.includes("npm run deploy"));
      check(prefix + " copying adds no requests", requests.length, 3);
      check(prefix + " full locale keys", await page.evaluate(() => {
        const t = STRINGS[document.getElementById("ui-lang").value].file;
        return document.getElementById("file-prepare").textContent === t.prepare && document.querySelector(".copy-prompt").textContent === t.copy;
      }));
      check(prefix + " lang tag", await page.getAttribute("html", "lang"), langTags[locale]);
      await page.evaluate(() => { window.denyClipboard = true; });
      await page.locator("#file-export .copy-prompt").click();
      check(prefix + " failed copy selects manual prompt", await page.evaluate(() => {
        const text = document.querySelector("#file-export .prompt-text");
        return document.activeElement === text && text.selectionEnd === text.value.length && text.closest("details").open && text.dir === "ltr";
      }));
      await page.locator(".instruction-unit").nth(1).locator("summary").first().click();
      check(prefix + " no overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (["es", "ar"].includes(locale)) {
        await page.evaluate(() => { window.denyClipboard = false; document.getElementById("file-source").scrollTop = 0; });
        await page.locator("#file-export .copy-prompt").click();
        await page.locator("#file-export .prompt-preview").evaluate(node => { node.open = false; });
        await page.evaluate(() => scrollTo(0, 0));
        const screenshot = target.replace(/\.json$/, `-${layout}-${locale}.png`);
        await page.screenshot({ path: screenshot, fullPage: true }); report.screenshots.push(path.relative(root, screenshot).replaceAll("\\", "/"));
      }
      await page.fill("#file-source", sample + "\n");
      check(prefix + " editing invalidates report and prompt", await page.locator("#file-report").isHidden() && await page.locator(".copy-prompt").count() === 0);
      mode = "status"; await prepare(page, statusDoc); const start5 = await page.textContent("#file-start");
      await page.click("#file-start"); await settled(page);
      const afterStatus = await page.textContent("#file-start");
      const shown = (await unitHints(page)).map((unit) => [unit.state, unit.label, ...unit.hints]);
      const expected = await page.evaluate(() => {
        const t = STRINGS[document.getElementById("ui-lang").value], error = ["error", t.file.states.error];
        return { notEnglish: t.file.states.not_english, inherited: [...error, t.errors.failed], unknown: ["error", t.file.states.skipped, t.file.unitErrors.unsupported_finding] };
      });
      const sentences = notEnglishSentences[locale];
      check(prefix + " not-English units name the detected language", shown.slice(0, 3),
        [sentences.spanish, sentences.unknown, sentences.klingon].map((sentence) => ["not_english", expected.notEnglish, sentence]));
      check(prefix + " inherited error code shows the generic failure", shown[3], expected.inherited);
      check(prefix + " unknown finding fails its unit", [shown[4], await page.locator(".copy-prompt").count()], [expected.unknown, 0]);
      if (locale === "en") check(prefix + " unknown finding is labelled not scored", shown[4],
        ["error", "Not scored", "This excerpt was not scored because its result includes a finding this page does not support yet. Analyzing it again from this page returns the same result."]);
      // The unknown-finding unit leaves the bulk retry; only the inherited error remains to send.
      check(prefix + " unknown finding leaves the bulk retry", afterStatus, countedLabels[locale].retry1);
      await prepare(page, "- Report an inherited error code.\n- Report an inherited error code.");
      await page.click("#file-start"); await settled(page);
      const retry2 = await page.textContent("#file-start");
      await prepare(page, "- Report an inherited error code."); const start1 = await page.textContent("#file-start");
      await page.click("#file-start"); await settled(page);
      const retry1 = await page.textContent("#file-start"), coverage001 = await page.textContent("#file-report .coverage");
      await prepare(page, batch.split("\n").slice(0, 2).join("\n")); const start2 = await page.textContent("#file-start");
      mode = "hold"; await page.click("#file-start");
      await page.waitForFunction(() => document.querySelectorAll('[data-state="pending"]').length === 2);
      const running0 = await page.textContent("#file-progress");
      reply(waiting.shift()); await page.waitForSelector('[data-state="ok"]');
      const running1 = await page.textContent("#file-progress");
      releaseAll(); await settled(page); mode = "status";
      await prepare(page, Array.from({ length: 11 }, (_, i) => `- Use module${i} for storage.`).join("\n"));
      check(prefix + " counted labels use each count's plural form", { start1, start2, start5, start11: await page.textContent("#file-start"),
        retry1, retry2, running0, running1, coverage315, coverage001, coverage11: await page.textContent("#file-report .coverage") }, countedLabels[locale]);
      await prepare(page, "- Keep requirements\n  across lines.\n- Keep one line.");
      check(prefix + " unit locations name a range or one line", await page.evaluate(() =>
        [...document.querySelectorAll(".instruction-unit .unit-location")].map((location) => location.textContent)), unitLocations[locale]);
      await prepare(page, scopedDoc);
      check(prefix + " a scoped excerpt is ready and says its text carries its section context", await page.evaluate(() => {
        const t = STRINGS[document.getElementById("ui-lang").value].file;
        return [...document.querySelectorAll(".instruction-unit")].map((unit) => [unit.dataset.state,
          ...[...unit.querySelectorAll(".unit-content > details")].map((detail) =>
            [detail.querySelector("summary").textContent === t.ruleSentContext, detail.querySelector("pre").textContent])]);
      }), [["skipped"], ...scopedRules.map((rule) => ["ready", [true, rule]])]);
      await prepare(page, linkedDoc);
      check(prefix + " a read instruction for a linked file is ready and says the file was not read", await page.evaluate(() => {
        const t = STRINGS[document.getElementById("ui-lang").value].file;
        return [...document.querySelectorAll(".instruction-unit")].map((unit) => [unit.dataset.state,
          ...[...unit.querySelectorAll(".unit-content > p.hint")].map((p) =>
            p.textContent === t.linkNotRead ? "linkNotRead" : p.textContent === t.reasons.linked_context ? "linked_context" : p.textContent)]);
      }), [["ready", "linkNotRead"], ["requires_context", "linked_context"]]);
      await page.click("#mode-rule"); await page.fill("#rule", "Keep requirements in Spanish."); await page.click("#go");
      await page.waitForFunction(() => document.querySelector("#out .banner strong")?.textContent === STRINGS[document.getElementById("ui-lang").value].notEnglishTitle);
      check(prefix + " single-rule banner renders the not-English sentence", await page.textContent("#out .banner p"), sentences.spanish);
      mode = "ok";
      if (layout === "desktop" && locale === "en") {
        await reset(page);
        await page.locator("#file-upload").setInputFiles({ name: "CLAUDE.md", mimeType: "text/markdown", buffer: Buffer.from(sample) });
        check("upload retains exact text and filename", [await page.inputValue("#file-source"), await page.inputValue("#file-name")], [sample, "CLAUDE.md"]);
        const windowsSource = "\uFEFF# Rules\r\n\r\n- Preserve requirements.\r\n";
        await page.locator("#file-upload").setInputFiles({ name: "AGENTS.md", mimeType: "text/markdown", buffer: Buffer.from(windowsSource) });
        await page.click("#file-prepare"); await page.click("#file-start"); await settled(page);
        const windowsPrompt = await copyText(page);
        const expectedFingerprint = (() => { let h = 2166136261; for(let i=0;i<windowsSource.length;i++) h = Math.imul(h ^ windowsSource.charCodeAt(i),16777619)>>>0; return "fnv1a-utf16-"+h.toString(16).padStart(8,"0"); })();
        check("uploaded BOM and CRLF fingerprint preserved", windowsPrompt.includes(expectedFingerprint));
        await page.locator("#file-upload").setInputFiles({name:"broken.md",mimeType:"text/markdown",buffer:Buffer.from([255,10,45,32,85,115,101,32,99,97,99,104,101,46])});
        check("invalid UTF-8 upload rejected without replacement", await page.locator("#file-error").isVisible());
        requests = [];
        await prepare(page, "x".repeat(65537));
        check("oversize file rejects locally", await page.locator("#file-error").isVisible() && requests.length === 0);
        await prepare(page, Array.from({ length: 151 }, (_, i) => `- Use module${i}.`).join("\n"));
        const overLimit = await unitHints(page);
        check("151 independent rules offer the first 150 and list the last over the limit", { error: await page.locator("#file-error").isVisible(),
          sent: requests.length, ready: overLimit.filter((unit) => unit.state === "ready").length, last: overLimit.at(-1), start: await page.textContent("#file-start") },
          { error: false, sent: 0, ready: 150, start: "Analyze 150 instructions", last: { state: "skipped", label: "Not scored",
            hints: ["Only the first 150 selected excerpts of a file are analyzed. Review this part in a separate file to analyze it."] } });
        await prepare(page, "@AGENTS.md");
        check("reference-only file offers no scoring", await page.locator("#file-start").isHidden() && await page.locator(".copy-prompt").count() === 0);

        await reset(page); mode = "partial"; await prepare(page, batch);
        await page.click("#file-start"); await settled(page);
        check("partial result retains 4 successes", await page.locator('.instruction-unit[data-state="ok"]').count(), 4);
        // Runs that end on their own keep their focus: the retry control while units remain, else the heading.
        check("a run that finishes with a failed unit keeps focus on the retry control", await page.evaluate(() => document.activeElement.id), "file-start");
        const beforeRetry = requests.length; mode = "ok";
        await page.click("#file-start"); await settled(page);
        check("retry only failed unit", requests.length - beforeRetry, 1);
        check("a run that finishes every unit moves focus to the report heading",
          await page.evaluate(() => document.activeElement === document.querySelector("#file-report h2")));

        await reset(page); mode = "refused"; await prepare(page, batch);
        await page.click("#file-start"); await settled(page);
        const partial = await copyText(page);
        check("refused data omitted with coverage", !partial.includes("DO NOT EXPORT THIS ECHO") && !partial.includes("Use module1") && partial.includes("refused"));

        await reset(page); mode = "rate"; await prepare(page, batch);
        await page.click("#file-start"); await settled(page);
        check("rate limit stops unsent work", requests.length <= 2);
        check("a run that pauses on its own keeps focus on the retry control", await page.evaluate(() => document.activeElement.id), "file-start");
        check("rate-limited file has no prompt", await page.locator(".copy-prompt").count(), 0);
        for (const errorMode of ["html-rate", "empty-unavailable"]) {
          await reset(page); mode = errorMode; await prepare(page, batch);
          await page.click("#file-start"); await settled(page);
          check(errorMode + " stops unsent requests without JSON", requests.length <= 2);
        }

        await reset(page); mode = "hold"; await prepare(page, batch);
        await page.click("#file-start");
        await page.waitForFunction(() => document.querySelectorAll('[data-state="pending"]').length === 2);
        // Let one row finish and inspect it while another request is outstanding.
        reply(waiting.shift());
        await page.waitForSelector('[data-state="ok"]');
        const completed = page.locator('[data-state="ok"]').first();
        await completed.locator("summary").first().click();
        await completed.locator(".unit-content details summary").first().click();
        mode = "ok"; releaseAll(); await settled(page);
        check("completion preserves focused factor disclosure", await page.evaluate(() => document.activeElement.tagName === "SUMMARY" && document.activeElement.parentElement.open && document.activeElement.closest(".unit-content") !== null));

        await reset(page); mode = "hold"; await prepare(page, batch);
        await page.focus("#file-start"); await page.keyboard.down("Enter");
        await page.waitForFunction(() => document.querySelectorAll('[data-state="pending"]').length === 2);
        await page.dispatchEvent("#file-cancel", "keydown", { key: "Enter", code: "Enter", repeat: true, bubbles: true, cancelable: true });
        await page.keyboard.up("Enter");
        check("held Enter does not cancel", await page.locator("#file-cancel").isVisible());
        const modesDisabled = () => page.evaluate(() => ["mode-file", "mode-rule"].map((id) => document.getElementById(id).disabled));
        check("a running file review holds the mode switch", await modesDisabled(), [true, true]);
        check("pending and ready units repeat no state", (await unitHints(page)).map((unit) => [unit.state, unit.hints]),
          [["pending", []], ["pending", []], ["ready", []], ["ready", []], ["ready", []]]);
        await page.click("#file-cancel"); await settled(page);
        check("cancel sends at most 2", requests.length, 2);
        check("a stopped file review releases the mode switch", await modesDisabled(), [false, false]);
        check("all cancelled units accounted", await page.locator('[data-state="cancelled"]').count(), 5);
        check("stopped units repeat no state", (await unitHints(page)).map((unit) => [unit.state, unit.hints]), Array(5).fill(["cancelled", []]));
        mode = "ok"; releaseAll(); await page.click("#file-start"); await settled(page);
        check("explicit resume reviews remaining units", await page.locator('[data-state="ok"]').count(), 5);

        await reset(page); mode = "hold"; await prepare(page, batch);
        await page.click("#file-start"); await page.waitForFunction(() => document.querySelectorAll('[data-state="pending"]').length === 2);
        await page.evaluate(() => { document.getElementById("file-source").value = "Use another file."; });
        releaseAll(); await settled(page);
        check("late responses after programmatic edit cannot export", await page.locator("#file-report").isHidden() && await page.locator(".copy-prompt").count() === 0);

        await reset(page); mode = "invalid"; await prepare(page, "Use functional components.");
        await page.click("#file-start"); await settled(page);
        check("invalid scoring result fails safely", await page.locator('[data-state="error"]').count() === 1 && await page.locator(".copy-prompt").count() === 0);
        const unitText = (target) => target.evaluate(() => [...document.querySelectorAll(".instruction-unit")].map((unit) =>
          [unit.dataset.state, unit.querySelector(".unit-state").textContent, unit.querySelector(".unit-content > p.hint")?.textContent]));
        check("a response that fails validation is labelled not scored", await unitText(page),
          [["error", "Not scored", "A result is incomplete or could not be verified. Analyze that instruction again before exporting."]]);

        // A large file paces its requests on the page's clock: 55 start, the run says it waits, and the rest start
        // once a minute has passed. Unpaced, the 61st request would meet the server's stand-in for the Worker limit.
        const pacedContext = await browser.newContext({ locale: "en-US" });
        site.watch(pacedContext, url);
        await pacedContext.clock.install();
        const paced = await pacedContext.newPage(); paced.on("pageerror", (error) => report.pageErrors.push(error.message));
        await paced.goto(url);
        mode = "window"; windowCount = 0; const beforePaced = requests.length;
        await prepare(paced, Array.from({ length: 70 }, (_, i) => `- Use module${i} for storage.`).join("\n"));
        await paced.click("#file-start");
        await paced.waitForFunction(() => document.getElementById("file-progress").textContent.includes("Waiting") &&
          !document.querySelector('[data-state="pending"]'), null, { timeout: 10000 });
        await paced.waitForTimeout(300);
        check("a large file waits after 55 requests and says so", { sent: requests.length - beforePaced,
          ok: await paced.locator('[data-state="ok"]').count(), progress: await paced.textContent("#file-progress") },
          { sent: 55, ok: 55, progress: "Analyzing instructions… 55 of 70 finished. Waiting to stay within the request limit; the analysis continues within a minute." });
        windowCount = 0; await paced.clock.fastForward(60000); await settled(paced);
        check("a paced file finishes without a 429", { sent: requests.length - beforePaced, ok: await paced.locator('[data-state="ok"]').count(),
          progress: await paced.textContent("#file-progress") }, { sent: 70, ok: 70, progress: "Analysis finished. Review the coverage before using the prompt." });
        mode = "ok"; await pacedContext.close();

        // A request past the deadline shows the file-mode timeout message; its label still says the request failed.
        const deadlineContext = await browser.newContext({ locale: "en-US" });
        site.watch(deadlineContext, url);
        await deadlineContext.addInitScript(() => {
          const original = window.setTimeout;
          window.setTimeout = (fn, ms, ...args) => original(fn, ms === 35000 ? 1000 : ms, ...args);
          // Stands in for a prompt check that rejects one excerpt as too large.
          let prompt;
          Object.defineProperty(window, "DisregardPrompt", { configurable: true, set: (value) => { prompt = value; },
            get: () => prompt && { ...prompt, buildPrompt: (input, english) => {
              if (input.units.length === 1 && input.units[0].rule === "Return an oversized prompt.") throw Object.assign(new Error("stub"), { code: "prompt_too_large" });
              return prompt.buildPrompt(input, english);
            } } });
        });
        const deadline = await deadlineContext.newPage(); deadline.on("pageerror", (error) => report.pageErrors.push(error.message));
        await deadline.goto(url);
        mode = "hold"; await prepare(deadline, "- Keep requirements."); await deadline.click("#file-start"); await settled(deadline);
        check("a request past the deadline shows the timeout message", await unitText(deadline),
          [["error", "Request failed", "The service took too long to respond, so this excerpt was not scored. You can analyze it again."]]);
        releaseAll();
        // In every locale, each failure shows its file-mode text, and the bulk retry resends only the unverifiable
        // and timed-out units; the unknown-finding and oversized-prompt units would repeat their outcome.
        for (const code of locales) {
          await deadline.selectOption("#ui-lang", code);
          mode = "retry"; let before = requests.length;
          await prepare(deadline, retryDoc); await deadline.click("#file-start"); await settled(deadline);
          const firstRun = requests.length - before;
          const shown = await deadline.evaluate(() => {
            const t = STRINGS[document.getElementById("ui-lang").value].file;
            return { hints: [...document.querySelectorAll(".instruction-unit .unit-content > p.hint")].map((p) => p.textContent),
              expected: [t.unitErrors.unsupported_finding, t.invalid_result, t.prompt_too_large, t.unitErrors.timeout, t.unchanged],
              progress: [document.getElementById("file-progress").textContent, t.done], coverage: document.querySelector("#file-report .coverage").textContent,
              retry: document.getElementById("file-start").textContent };
          });
          check(code + " file-mode failures show excerpt wording", shown.hints, shown.expected);
          check(code + " retry counts only units a new request can change", [firstRun, shown.retry, shown.progress[0]], [5, countedLabels[code].retry2, shown.progress[1]]);
          if (code === "en") check("coverage counts unscored failures as not analyzed", shown.coverage, "1 analyzed · 0 with findings · 4 not analyzed");
          before = requests.length; await deadline.click("#file-start"); await settled(deadline);
          check(code + " bulk retry resends only the unverifiable and timed-out units",
            requests.slice(before).map((entry) => entry.rule).sort(), ["Return an unverifiable result.", "Wait past the deadline."]);
          releaseAll();
        }
        // Single-rule mode keeps its own timeout text.
        await deadline.selectOption("#ui-lang", "en"); await deadline.click("#mode-rule");
        mode = "hold"; await deadline.fill("#rule", "Keep requirements."); await deadline.click("#go");
        await deadline.waitForFunction(() => document.getElementById("out").getAttribute("aria-busy") === "false");
        check("single-rule timeout text is unchanged", await deadline.textContent("#out .banner p"),
          "The service took too long to respond. Your rule is still here; try again.");
        mode = "ok"; releaseAll(); await deadlineContext.close();

        await reset(page); await page.click("#mode-rule");
        await page.fill("#rule", "Always try to use functional components."); await page.click("#go");
        await page.waitForSelector("#out .copy-prompt");
        await page.click("#out .copy-prompt");
        check("single-rule prompt uses exact snapshot", (await page.evaluate(() => window.copiedPrompt)).includes("Always try to use functional components."));

        // Leaving the page: with no review, or a preview without results, the link just navigates.
        await page.goto(url);
        check("no review leaves without a prompt", await followPrivacy(page, false), { asked: [], path: "/privacy" });
        await page.goto(url); await prepare(page, batch);
        check("a preview without results leaves without a prompt", await followPrivacy(page, false), { asked: [], path: "/privacy" });
        // Held results: the link asks first and staying keeps the review.
        await page.goto(url); mode = "ok"; await prepare(page, batch); await page.click("#file-start"); await settled(page);
        const stayed = await followPrivacy(page, true);
        check("held results ask before following the privacy link", { ...stayed, report: await page.locator("#file-report").isVisible() },
          { asked: ["beforeunload"], path: "/", report: true });
        // Switching the interface language or the analysis mode never navigates.
        const switched = [];
        const noteDialog = (dialog) => { switched.push(dialog.type()); return dialog.dismiss(); };
        page.on("dialog", noteDialog);
        await page.selectOption("#ui-lang", "fr"); await page.selectOption("#ui-lang", "en");
        await page.click("#mode-rule"); await page.click("#mode-file");
        await page.waitForTimeout(200);
        page.off("dialog", noteDialog);
        check("switching language and mode never navigates", { asked: switched, path: new URL(page.url()).pathname, report: await page.locator("#file-report").isVisible() },
          { asked: [], path: "/", report: true });
        // A reload asks first; accepting reloads without the review.
        const reloaded = [];
        page.once("dialog", (dialog) => { reloaded.push(dialog.type()); return dialog.accept(); });
        await page.reload();
        check("held results ask before a reload", { asked: reloaded, report: await page.locator("#file-report").isVisible() }, { asked: ["beforeunload"], report: false });
        // Requests in flight ask first; accepting follows the link in the same tab.
        mode = "hold"; await prepare(page, batch); await page.click("#file-start");
        await page.waitForFunction(() => document.querySelectorAll('[data-state="pending"]').length === 2);
        check("requests in flight ask before following the privacy link", await followPrivacy(page, true), { asked: ["beforeunload"], path: "/" });
        mode = "ok"; releaseAll(); await settled(page);
        check("accepting follows the privacy link in the same tab", await followPrivacy(page, false), { asked: ["beforeunload"], path: "/privacy" });
        // Closing the tab with held results asks first; staying keeps it open.
        await page.goto(url); await prepare(page, batch); await page.click("#file-start"); await settled(page);
        const closing = [];
        page.once("dialog", (dialog) => { closing.push(dialog.type()); return dialog.dismiss(); });
        await page.close({ runBeforeUnload: true });
        await new Promise((resolve) => setTimeout(resolve, 300));
        check("held results ask before closing the tab", { asked: closing, closed: page.isClosed() }, { asked: ["beforeunload"], closed: false });

        // The prompt script fails to load: results and findings stay, the prompt panel says only the
        // prompt is unavailable, and a retry sends only the excerpt that has no result.
        const blockedContext = await browser.newContext({ locale: "en-US" });
        site.watch(blockedContext, url);
        await blockedContext.route("**/refactor-prompt.js", (route) => route.abort());
        const blocked = await blockedContext.newPage(); blocked.on("pageerror", (error) => report.pageErrors.push(error.message));
        await blocked.goto(url);
        requests = []; mode = "partial";
        await prepare(blocked, "- Always try to use functional components.\n- Use module1 for storage.\n- Keep functions short.");
        await blocked.click("#file-start"); await settled(blocked);
        const firstRun = requests.length;
        const kept = await blocked.evaluate(() => ({
          states: [...document.querySelectorAll(".instruction-unit")].map((unit) => unit.dataset.state),
          finding: document.querySelector('.instruction-unit[data-state="ok"] li.finding h2')?.textContent,
          prompt: document.querySelector("#file-export .prompt-panel")?.textContent, copy: document.querySelectorAll(".copy-prompt").length,
          expected: { finding: STRINGS.en.findings.hedge_dominance.h } }));
        check("blocked prompt script keeps results and findings", [kept.states, kept.finding], [["ok", "error", "ok"], kept.expected.finding]);
        check("blocked prompt script says only the prompt is unavailable", [kept.prompt, kept.copy], ["The refactoring prompt is unavailable because part of the page did not load. " +
          "Your results are unaffected. Reloading the page may restore the prompt, but it also clears these results.", 0]);
        mode = "ok"; await blocked.click("#file-start"); await settled(blocked);
        check("retry with a blocked prompt script resends only the unscored excerpt", [firstRun, requests.slice(firstRun).map((entry) => entry.rule),
          await blocked.evaluate(() => [...document.querySelectorAll(".instruction-unit")].map((unit) => unit.dataset.state))],
          [3, ["Use module1 for storage."], ["ok", "ok", "ok"]]);
        await blockedContext.close();

        // The document model fails to load: in every locale, preparing a file says the file reader
        // could not load, sends nothing and keeps the source text.
        const noModelContext = await browser.newContext({ locale: "en-US" });
        site.watch(noModelContext, url);
        await noModelContext.route("**/document-model.js", (route) => route.abort());
        const noModel = await noModelContext.newPage(); noModel.on("pageerror", (error) => report.pageErrors.push(error.message));
        for (const code of locales) {
          await noModel.goto(url); await noModel.selectOption("#ui-lang", code);
          const before = requests.length; await prepare(noModel, batch);
          check(code + " missing document model shows the file reader failure", await noModel.evaluate(() => {
            const error = document.getElementById("file-error");
            return !error.hidden && error.textContent === STRINGS[document.getElementById("ui-lang").value].file.parser_unavailable;
          }));
          check(code + " missing document model sends nothing and keeps the text",
            [requests.length - before, await noModel.inputValue("#file-source"), await noModel.locator("#file-report").isHidden()], [0, batch, true]);
          // Without the model there is no byte limit to show or check, so the counter hides and any
          // upload reports the reader failure without replacing the text.
          check(code + " missing document model hides the byte counter", await noModel.locator("#file-count").isHidden(), true);
          for (const [kind, size] of [["a small", 10], ["an oversized", 65537]]) {
            await noModel.locator("#file-upload").setInputFiles({ name: "AGENTS.md", mimeType: "text/markdown", buffer: Buffer.alloc(size, 97) });
            check(code + " missing document model refuses " + kind + " upload", await noModel.evaluate(() => {
              const error = document.getElementById("file-error");
              return [!error.hidden && error.textContent === STRINGS[document.getElementById("ui-lang").value].file.parser_unavailable,
                document.getElementById("file-source").value];
            }), [true, batch]);
          }
        }
        await noModelContext.close();

        // /review-ui.js fails to load: in every locale file mode says the file reader could not load
        // and offers no form, sends nothing, and the mode switch still reaches the single-rule form.
        const noReviewContext = await browser.newContext({ locale: "en-US" });
        site.watch(noReviewContext, url);
        await noReviewContext.route("**/review-ui.js", (route) => route.abort());
        const noReview = await noReviewContext.newPage();
        const noReviewErrors = [];
        noReview.on("pageerror", (error) => { noReviewErrors.push(error.message); report.pageErrors.push(error.message); });
        for (const code of locales) {
          const before = requests.length;
          await noReview.goto(url); await noReview.selectOption("#ui-lang", code);
          const shown = () => noReview.evaluate(() => {
            const t = STRINGS[document.getElementById("ui-lang").value].file, error = document.getElementById("file-error");
            return { message: !error.hidden && error.textContent === t.parser_unavailable, form: document.querySelectorAll("#file-panel form, #file-panel textarea").length,
              modes: [document.getElementById("mode-file").textContent === t.fileMode, document.getElementById("mode-rule").textContent === t.ruleMode,
                document.getElementById("input-mode").getAttribute("aria-label") === t.modeLabel],
              pressed: [document.getElementById("mode-file").getAttribute("aria-pressed"), document.getElementById("mode-rule").getAttribute("aria-pressed")] };
          });
          check(code + " blocked review-ui.js shows the file reader failure in file mode",
            [await noReview.locator("#file-panel").isVisible(), await shown()],
            [true, { message: true, form: 0, modes: [true, true, true], pressed: ["true", "false"] }]);
          await noReview.click("#mode-rule");
          check(code + " blocked review-ui.js switches to the single-rule form",
            [await noReview.locator("#rule").isVisible(), await noReview.locator("#file-panel").isHidden(), (await shown()).pressed], [true, true, ["false", "true"]]);
          await noReview.click("#mode-file");
          check(code + " blocked review-ui.js switches back and sends nothing",
            [await noReview.locator("#file-error").isVisible(), await noReview.locator("#rule").isHidden(), requests.length - before], [true, true, 0]);
        }
        check("blocked review-ui.js raises no page error", noReviewErrors, []);
        await noReviewContext.close();

        // The text sent is disclosed only when it differs from the excerpt beyond the list marker,
        // indentation and line endings. The reader never changes an item's words, so a stub stands in
        // for such a normalization on one item.
        const sentContext = await browser.newContext({ locale: "en-US" });
        site.watch(sentContext, url);
        await sentContext.addInitScript(() => {
          let model;
          Object.defineProperty(window, "DisregardDocument", { configurable: true, set: (value) => { model = value; },
            get: () => model && { ...model, parseDocument: (...args) => {
              const parsed = model.parseDocument(...args);
              for (const unit of parsed.units) if (unit.rule === "Normalize  this.") unit.rule = "Normalize this.";
              return parsed;
            } } });
        });
        const sentPage = await sentContext.newPage(); sentPage.on("pageerror", (error) => report.pageErrors.push(error.message));
        await sentPage.goto(url); mode = "ok";
        await prepare(sentPage, "- Keep functions short.\n  Split long ones.\n- Normalize  this.\n- Keep tests fast.\n  - Avoid network calls.");
        const disclosed = () => sentPage.evaluate(() => [...document.querySelectorAll(".instruction-unit")].map((unit) =>
          [...unit.querySelectorAll(".unit-content > details")].filter((detail) => detail.querySelector("summary").textContent === STRINGS.en.file.ruleSent)
            .map((detail) => detail.querySelector("pre").textContent)));
        const previewed = await disclosed();
        check("a plain list item shows no text-sent disclosure", previewed[0], []);
        check("an item whose sent text differs beyond the marker shows it", previewed[1], ["Normalize this."]);
        check("a nested item sent as its own lines shows no text-sent disclosure", previewed[2], []);
        const beforeSent = requests.length; await sentPage.click("#file-start"); await settled(sentPage);
        check("the disclosed text is the text sent", requests.slice(beforeSent).map((entry) => entry.rule).sort(),
          ["Keep functions short.\nSplit long ones.", "Keep tests fast.\n- Avoid network calls.", "Normalize this."]);
        check("scored units keep the same disclosures", await disclosed(), [[], ["Normalize this."], []]);
        await prepare(sentPage, scopedDoc);
        const beforeScoped = requests.length; await sentPage.click("#file-start"); await settled(sentPage);
        check("scoped excerpts are sent with their section context", requests.slice(beforeScoped).map((entry) => entry.rule).sort(), [...scopedRules].sort());
        const scopedPacket = JSON.parse((await sentPage.inputValue("#file-export .prompt-text")).split("quoted data):\n")[1]);
        check("the prompt marks the excerpts scored with their section context", scopedPacket.scored.map((unit) =>
          [unit.sourceLines, unit.rawExcerpt, unit.exactScoredText, unit.scoredWithSectionContext]),
          [[{ startLine: 3, endLine: 3 }, "- Run the full test suite.", scopedRules[0], true],
            [{ startLine: 5, endLine: 6 }, "1. Build the app.\n2. Ship it.", scopedRules[1], true],
            [{ startLine: 8, endLine: 9 }, "- Keep tests fast:\n  - Avoid network calls.", scopedRules[2], true]]);
        await prepare(sentPage, linkedDoc);
        const beforeLinked = requests.length; await sentPage.click("#file-start"); await settled(sentPage);
        check("a read instruction is sent as written", requests.slice(beforeLinked).map((entry) => entry.rule), [linkedRule]);
        const linkedPacket = JSON.parse((await sentPage.inputValue("#file-export .prompt-text")).split("quoted data):\n")[1]);
        check("the prompt marks the excerpt whose linked file was not read", linkedPacket.scored.map((unit) =>
          [unit.exactScoredText, unit.linkedContentNotRead, unit.scoredWithSectionContext]), [[linkedRule, true, undefined]]);
        await sentContext.close();
      }
      await context.close(); releaseAll();
    }
  } catch (error) { report.fatal = error.stack || error.message; }
  finally {
    releaseAll(); if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    Object.assign(report, site.audit());
    report.passed = !report.fatal && !report.pageErrors.length && report.checks.length > 100 && report.checks.every(check => check.passed) && report.networkClean;
    fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failed: report.checks.filter(check => !check.passed), pageErrors: report.pageErrors,
      providerRequests: report.providerRequests, unknownRequests: report.unknownRequests, fatal: report.fatal, output: target }));
    if (!report.passed) process.exitCode = 1;
  }
})();
