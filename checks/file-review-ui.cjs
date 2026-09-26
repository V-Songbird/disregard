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
// A paragraph ending in a colon is scored with the one code block after it, and says so.
const codeDoc = "After cloning, initialize the submodule:\n\n```bash\ngit submodule update --init\n```";
const codeRule = "After cloning, initialize the submodule:\n```bash\ngit submodule update --init\n```";
const batch = Array.from({ length: 5 }, (_, i) => `- Use module${i} for storage.`).join("\n");
// Rows with two findings, background only (not_a_rule) and none.
const summaryDoc = "- Always try to keep quality high.\n- The build cache is stored in `.cache/`, which CI clears nightly.\n- Keep functions short.";
// The same rows under a heading that is not scored, then one whose request fails in "partial" mode.
const filterDoc = "# Project instructions\n\n" + summaryDoc + "\n- Use module1 for storage.";
// The findings filter's label and its count with 2 of those 5 rows shown, written out per locale.
const filterLabels = {
  en: { label: "Show only excerpts with findings", showing: "Showing 2 of 5 excerpts" },
  es: { label: "Mostrar solo fragmentos con hallazgos", showing: "Mostrando 2 de 5 fragmentos" },
  zh: { label: "仅显示有发现的片段", showing: "正在显示 5 个片段中的 2 个" },
  hi: { label: "केवल निष्कर्ष वाले अंश दिखाएँ", showing: "दिखाए गए अंश: 5 में से 2" },
  ar: { label: "إظهار المقاطع التي فيها ملاحظات فقط", showing: "المقاطع المعروضة: 2 من 5" },
  fr: { label: "Afficher uniquement les extraits avec des points à examiner", showing: "Extraits affichés\u00a0: 2 sur 5" },
};
let mode = "ok", requests = [], active = 0, maxActive = 0, waiting = [], windowCount = 0;
function result(rule) {
  const hedge = rule.includes("try to"), vague = rule.includes("quality"), background = rule.includes("is stored in");
  const findings = background ? [{ id: "not_a_rule", factor: "is_rule", value: 0.3 }] : [
    ...(hedge ? [{ id: "hedge_dominance", factor: "F1", value: 0.2, verb: "try to" }] : []),
    ...(vague ? [{ id: "no_concrete_anchor", factor: "F7", value: 0.1 }] : [])];
  return { status: "ok", findings,
    factors: { F1: hedge ? 0.2 : 0.85, F2: 0.85, F3: 2, F7: vague ? 0.1 : 0.8, F8: 2, is_rule: background ? 0.3 : 0.95, specificity: vague ? 0.1 : 0.9,
      primitive: { choice: "rule", confidence: 0.9 }, rule_role: { choice: background ? "background" : "direct_action", confidence: 0.9 } } };
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
    values: ["0,95", "2", "2", "0,2", "0,85", "0,8", "0,9", "une consigne d’action (confiance 0,9)", "une règle (confiance 0,9)"] },
  ar: { context: "العناوين المحيطة: Project instructions / Before deployment",
    values: ["0.95", "2", "2", "0.2", "0.85", "0.8", "0.9", "تعليمات لتنفيذ إجراء (ثقة 0.9)", "قاعدة (ثقة 0.9)"] },
};
// Unit locations written out per locale: a list item across lines 1 and 2, then a one-line item on line 3.
const unitLocations = {
  en: ["Lines 1–2", "Line 3"], es: ["Líneas 1–2", "Línea 3"], zh: ["第 1–2 行", "第 3 行"],
  hi: ["पंक्तियाँ 1–2", "पंक्ति 3"], ar: ["الأسطر 1–2", "السطر 3"], fr: ["Lignes 1–2", "Ligne 3"],
};
// Counted labels written out per locale: retry buttons for 1 and 2 units, progress at 0 and 1 of 2
// finished, and coverage with 3 scored, 1 flagged, 5 left; 1 left; and 11 left. Row labels for 1 and
// 2 findings, none and background, and coverage with 3 scored, 1 flagged, 1 background, 0 left.
const countedLabels = {
  en: { retry1: "Analyze 1 remaining instruction", retry2: "Analyze 2 remaining instructions",
    running0: "Analyzing instructions… 0 of 2 finished.", running1: "Analyzing instructions… 1 of 2 finished.",
    coverage315: "3 analyzed · 1 with findings · 5 not analyzed", coverage001: "0 analyzed · 0 with findings · 1 not analyzed",
    coverage11: "0 analyzed · 0 with findings · 11 not analyzed" },
  es: { retry1: "Analizar 1 instrucción pendiente", retry2: "Analizar 2 instrucciones pendientes",
    running0: "Analizando instrucciones… 0 de 2 terminaron.", running1: "Analizando instrucciones… 1 de 2 terminó.",
    coverage315: "3 analizados · 1 con hallazgos · 5 sin analizar", coverage001: "0 analizados · 0 con hallazgos · 1 sin analizar",
    coverage11: "0 analizados · 0 con hallazgos · 11 sin analizar" },
  zh: { retry1: "分析剩余的 1 条指令", retry2: "分析剩余的 2 条指令",
    running0: "正在分析指令…已完成 0 / 2 项。", running1: "正在分析指令…已完成 1 / 2 项。",
    coverage315: "已分析 3 项 · 1 项有发现 · 5 项未分析", coverage001: "已分析 0 项 · 0 项有发现 · 1 项未分析",
    coverage11: "已分析 0 项 · 0 项有发现 · 11 项未分析" },
  hi: { retry1: "बाकी 1 निर्देश का विश्लेषण करें", retry2: "बाकी 2 निर्देशों का विश्लेषण करें",
    running0: "निर्देशों का विश्लेषण हो रहा है… 2 में से 0 पूरा हुआ।", running1: "निर्देशों का विश्लेषण हो रहा है… 2 में से 1 पूरा हुआ।",
    coverage315: "3 का विश्लेषण हुआ · 1 में निष्कर्ष मिले · 5 का विश्लेषण नहीं हुआ",
    coverage001: "0 का विश्लेषण हुआ · 0 में निष्कर्ष मिले · 1 का विश्लेषण नहीं हुआ",
    coverage11: "0 का विश्लेषण हुआ · 0 में निष्कर्ष मिले · 11 का विश्लेषण नहीं हुआ" },
  ar: { retry1: "تحليل التعليمة المتبقية", retry2: "تحليل التعليمتين المتبقيتين",
    running0: "جارٍ تحليل التعليمات… اكتمل 0 من 2.", running1: "جارٍ تحليل التعليمات… اكتمل 1 من 2.",
    coverage315: "تم تحليل 3 · ظهرت ملاحظات في 1 · لم يُحلل 5", coverage001: "تم تحليل 0 · ظهرت ملاحظات في 0 · لم يُحلل 1",
    coverage11: "تم تحليل 0 · ظهرت ملاحظات في 0 · لم يُحلل 11" },
  fr: { retry1: "Analyser 1 instruction restante", retry2: "Analyser les 2 instructions restantes",
    running0: "Analyse des instructions… 0 sur 2 terminée.", running1: "Analyse des instructions… 1 sur 2 terminée.",
    coverage315: "3 analysés · 1 avec des points à examiner · 5 non analysés", coverage001: "0 analysé · 0 avec des points à examiner · 1 non analysé",
    coverage11: "0 analysé · 0 avec des points à examiner · 11 non analysés" },
};
// The summary line under the prompt written out per locale: every part of a 3-part file checked, and
// 3 of 5 checked with the rest left to the agent.
const summaryLines = {
  en: { all: "3 of 3 parts were checked.", rest: "3 of 5 parts were checked. Your agent will read the rest." },
  es: { all: "Partes revisadas: 3 de 3.", rest: "Partes revisadas: 3 de 5. Tu agente leerá el resto." },
  zh: { all: "已检查 3 个部分中的 3 个。", rest: "已检查 5 个部分中的 3 个。其余部分由你的智能体阅读。" },
  hi: { all: "जाँचे गए हिस्से: 3 में से 3।", rest: "जाँचे गए हिस्से: 5 में से 3। बाकी हिस्से आपका एजेंट पढ़ेगा।" },
  ar: { all: "الأجزاء التي فُحصت: 3 من 3.", rest: "الأجزاء التي فُحصت: 3 من 5. سيقرأ وكيلك الباقي." },
  fr: { all: "Parties vérifiées\u00a0: 3 sur 3.", rest: "Parties vérifiées\u00a0: 3 sur 5. Votre agent lira le reste." },
};
// The same 3-part file checked again unchanged: its summary line adds that the 3 were not sent again.
const reusedLines = {
  en: "3 of 3 parts were checked. 3 of them were unchanged since your last check and were not sent again.",
  es: "Partes revisadas: 3 de 3. 3 de ellas no habían cambiado desde tu última revisión y no se volvieron a enviar.",
  zh: "已检查 3 个部分中的 3 个。其中 3 个部分自上次检查以来没有变化，因此没有再次发送。",
  hi: "जाँचे गए हिस्से: 3 में से 3। पिछली जाँच के बाद से न बदले और दोबारा न भेजे गए हिस्से: 3।",
  ar: "الأجزاء التي فُحصت: 3 من 3. الأجزاء التي لم تتغير منذ فحصك الأخير ولم تُرسل مرة أخرى: 3.",
  fr: "Parties vérifiées\u00a0: 3 sur 3. 3 d’entre elles n’avaient pas changé depuis votre dernière vérification et n’ont pas été renvoyées.",
};
// The length note's heading written out per locale for a file of 201 lines.
const longTitles = {
  en: "This file has 201 lines.", es: "Este archivo tiene 201 líneas.", zh: "此文件共有 201 行。",
  hi: "इस फ़ाइल में 201 पंक्तियाँ हैं।", ar: "يحتوي هذا الملف على 201 سطر.", fr: "Ce fichier compte 201 lignes.",
};
const longDoc = (count) => Array.from({ length: count }, (_, i) => `- Use module${i} for storage.`).join("\n") + "\n";
const rowLabels = {
  en: { finding1: "1 finding", findings2: "2 findings", clean: "No findings", background: "Background",
    coverage: "3 analyzed · 1 with findings · 1 read as background · 0 not analyzed" },
  es: { finding1: "1 hallazgo", findings2: "2 hallazgos", clean: "Sin hallazgos", background: "Información de contexto",
    coverage: "3 analizados · 1 con hallazgos · 1 de contexto · 0 sin analizar" },
  zh: { finding1: "1 项发现", findings2: "2 项发现", clean: "无发现", background: "背景信息",
    coverage: "已分析 3 项 · 1 项有发现 · 1 项为背景信息 · 0 项未分析" },
  hi: { finding1: "1 निष्कर्ष", findings2: "2 निष्कर्ष", clean: "कोई निष्कर्ष नहीं", background: "संदर्भ जानकारी",
    coverage: "3 का विश्लेषण हुआ · 1 में निष्कर्ष मिले · 1 संदर्भ जानकारी के रूप में पढ़ा गया · 0 का विश्लेषण नहीं हुआ" },
  ar: { finding1: "ملاحظة واحدة", findings2: "ملاحظتان", clean: "لا ملاحظات", background: "معلومات سياقية",
    coverage: "تم تحليل 3 · ظهرت ملاحظات في 1 · قُرئ 1 كمعلومات سياقية · لم يُحلل 0" },
  fr: { finding1: "1 point à examiner", findings2: "2 points à examiner", clean: "Aucun point à examiner", background: "Informations de contexte",
    coverage: "3 analysés · 1 avec des points à examiner · 1 lu comme du contexte · 0 non analysé" },
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
    else if (mode === "status") reply(entry, ...(statusCases[rule] || []));
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
// The one primary action reads the text and starts scoring; analyze() also waits for the run to settle.
async function create(page, text = sample) {
  await page.fill("#file-source", text); await page.click("#file-create");
}
async function analyze(page, text = sample) { await create(page, text); await settled(page); }
// Rows sit in the closed "See what was found" disclosure; opening it shows them.
async function openDetails(page) {
  if (!await page.locator("#file-details").evaluate((node) => node.open)) await page.click("#file-details > summary");
}
// A synthetic drag carrying the given files, as a desktop drag from the file manager delivers them.
// Dispatches a drag event carrying files, or text when given a string, and says whether the page took it over.
async function drag(page, type, files, target = "#file-drop") {
  return page.evaluate(({ type, files, target }) => {
    const data = new DataTransfer();
    if (typeof files === "string") data.setData("text/plain", files);
    else for (const file of files) data.items.add(new File([file.text], file.name, { type: "text/markdown" }));
    const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data });
    document.querySelector(target).dispatchEvent(event);
    return event.defaultPrevented;
  }, { type, files, target });
}
// Follows the privacy-notice link and answers any leave-page dialog, staying or leaving.
async function followPrivacy(page, stay) {
  const asked = [];
  const answer = (dialog) => { asked.push(dialog.type()); return stay ? dialog.dismiss() : dialog.accept(); };
  page.on("dialog", answer);
  try {
    await page.click("footer a[href='/privacy']");
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
      // The intake has no preview step and no file name field; the primary action waits for text.
      const intake = () => page.evaluate(() => ({ preview: document.querySelectorAll("#file-prepare").length,
        name: document.querySelectorAll("#file-form #file-name").length, disabled: document.getElementById("file-create").disabled,
        report: document.getElementById("file-report").hidden }));
      check(prefix + " the intake has one primary action and no preview or name field", await intake(),
        { preview: 0, name: 0, disabled: true, report: true });
      // The empty box offers a sample. Pressing it by keyboard fills the box, sends nothing, and hides the button.
      const sampleButton = () => page.evaluate(() => ({ hidden: document.getElementById("file-sample").hidden,
        labeled: document.getElementById("file-sample").textContent === STRINGS[document.getElementById("ui-lang").value].file.sample }));
      check(prefix + " the empty intake offers a labeled sample", await sampleButton(), { hidden: false, labeled: true });
      await page.focus("#file-choose"); await page.keyboard.press("Tab");
      check(prefix + " Tab reaches the sample after the file chooser", await page.evaluate(() => document.activeElement.id), "file-sample");
      // A held Enter: its repeats reach the primary action, which ignores them.
      await page.keyboard.down("Enter");
      for (let i = 0; i < 3; i++) await page.keyboard.down("Enter");
      await page.keyboard.up("Enter");
      check(prefix + " a held Enter on the sample fills the box, sends nothing and hands focus to the primary action",
        [(await page.inputValue("#file-source")).startsWith("# Project instructions\n"), await page.inputValue("#file-name"), requests.length,
          (await sampleButton()).hidden, await page.evaluate(() => document.activeElement.id), (await intake()).disabled, (await intake()).report],
        [true, "AGENTS.md", 0, true, "file-create", false, true]);
      await page.fill("#file-source", "");
      check(prefix + " emptying the box offers the sample again", (await sampleButton()).hidden, false);
      await page.fill("#file-source", "\n \n");
      const blankOffers = !(await sampleButton()).hidden;
      await page.click("#file-sample");
      check(prefix + " a box holding only blank lines still offers the sample, which replaces them", [blankOffers,
        (await page.inputValue("#file-source")).startsWith("# Project instructions\n"), requests.length], [true, true, 0]);
      await page.fill("#file-source", sample);
      check(prefix + " nothing is sent before the primary action", [requests.length, (await intake()).disabled, (await intake()).report], [0, false, true]);
      // While requests are held, the queued and in-flight units repeat no state and the excluded ones keep their reasons.
      mode = "hold"; await page.click("#file-create");
      await page.waitForFunction(() => document.querySelectorAll('[data-state="pending"]').length === 2);
      const preview = await unitHints(page);
      const reasons = await page.evaluate(() => Object.values(STRINGS[document.getElementById("ui-lang").value].file.reasons));
      const queued = preview.filter((unit) => ["ready", "pending"].includes(unit.state));
      check(prefix + " pending and ready units repeat no state", queued.map((unit) => unit.hints), [[], [], []]);
      check(prefix + " excluded units keep their reasons", preview.filter((unit) => !["ready", "pending"].includes(unit.state))
        .map((unit) => unit.hints.length === 1 && reasons.includes(unit.hints[0]) ? "reason" : unit.hints), Array(5).fill("reason"));
      check(prefix + " 3 independent rules", queued.length, 3);
      check(prefix + " inherited scope excluded", await page.locator('.instruction-unit[data-state="requires_context"]').count(), 1);
      check(prefix + " a running review hides the primary action and offers Stop", await page.evaluate(() =>
        [document.getElementById("file-create").getClientRects().length, !document.getElementById("file-cancel").hidden,
          document.activeElement.id]), [0, true, "file-cancel"]);
      mode = "ok"; releaseAll(); await settled(page);
      const coverage315 = await page.textContent("#file-report .coverage");
      check(prefix + " scored rows label their finding count", await page.evaluate(() =>
        [...document.querySelectorAll('.instruction-unit[data-state="ok"] .unit-state')].map((label) => label.textContent)),
        [rowLabels[locale].finding1, rowLabels[locale].clean, rowLabels[locale].clean]);
      if (joinExamples[locale]) check(prefix + " joins and numbers follow the locale", await page.evaluate(() => ({
        context: document.querySelector('.instruction-unit[data-state="requires_context"] .unit-content > p.hint')?.textContent,
        values: [...document.querySelector('.instruction-unit[data-state="ok"]').querySelectorAll("dd")].map((dd) => dd.textContent) })), joinExamples[locale]);
      check(prefix + " sends exact 3 units", requests.length, 3);
      check(prefix + " concurrency bounded", maxActive <= 2);
      const text = await copyText(page);
      check(prefix + " copied evidence", text.includes("hedge_dominance") && text.includes("Always try to use functional components."));
      check(prefix + " context-dependent command not exported", !text.includes("npm run deploy"));
      check(prefix + " copying adds no requests", requests.length, 3);
      // The path-rules option: a labeled checkbox by the primary action, off, that rebuilds only the prompt.
      const pathRulesView = () => page.evaluate(() => {
        const box = document.getElementById("file-path-rules"), style = getComputedStyle(box);
        return { checked: box.checked, focused: document.activeElement === box && box.matches(":focus-visible") && style.outlineStyle !== "none",
          label: box.labels.length === 1 && box.labels[0].textContent === STRINGS[document.getElementById("ui-lang").value].file.pathRules &&
            box.labels[0].getClientRects().length > 0, prompt: document.querySelector("#file-export .prompt-text").value };
      });
      const plainPrompt = await pathRulesView();
      await page.focus("#file-choose"); await page.keyboard.press("Tab");
      const pathRulesFocused = await pathRulesView();
      await page.keyboard.press("Space");
      const pathRulesOn = await pathRulesView();
      const added = pathRulesOn.prompt.indexOf("\nThe owner also asks whether some rules could move into path-scoped Claude Code rules.");
      await page.keyboard.press("Space");
      check(prefix + " the path-rules option is a labeled checkbox, off, and leaves the prompt without it",
        [await page.getByRole("checkbox", { name: /\.claude\/rules/ }).count(), plainPrompt.checked, plainPrompt.label, plainPrompt.prompt.includes(".claude/rules")],
        [1, false, true, false]);
      check(prefix + " the path-rules option takes keyboard focus visibly and toggles with Space", [pathRulesFocused.focused, pathRulesOn.checked], [true, true]);
      check(prefix + " the path-rules option adds one paragraph and sends nothing", [added > 0,
        added > 0 && pathRulesOn.prompt.slice(0, added) + pathRulesOn.prompt.slice(pathRulesOn.prompt.indexOf("\n", pathRulesOn.prompt.indexOf("approves before any edit.")) + 1)
          === plainPrompt.prompt, requests.length], [true, true, 3]);
      const pathRulesOff = await pathRulesView();
      check(prefix + " turning the path-rules option off restores the prompt", [pathRulesOff.checked, pathRulesOff.prompt], [false, plainPrompt.prompt]);
      check(prefix + " full locale keys", await page.evaluate(() => {
        const t = STRINGS[document.getElementById("ui-lang").value].file;
        return document.getElementById("file-create").textContent === t.create && document.querySelector(".copy-prompt").textContent === t.copy;
      }));
      check(prefix + " lang tag", await page.getAttribute("html", "lang"), langTags[locale]);
      await page.evaluate(() => { window.denyClipboard = true; });
      await page.locator("#file-export .copy-prompt").click();
      check(prefix + " failed copy selects manual prompt", await page.evaluate(() => {
        const text = document.querySelector("#file-export .prompt-text");
        return document.activeElement === text && text.selectionEnd === text.value.length && text.closest("details").open && text.dir === "ltr";
      }));
      await openDetails(page); await page.locator(".instruction-unit").nth(1).locator("summary").first().click();
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
      mode = "status"; await analyze(page, statusDoc);
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
      await analyze(page, "- Report an inherited error code.\n- Report an inherited error code.");
      const retry2 = await page.textContent("#file-start");
      await analyze(page, "- Report an inherited error code.");
      const retry1 = await page.textContent("#file-start"), coverage001 = await page.textContent("#file-report .coverage");
      mode = "hold"; await create(page, batch.split("\n").slice(0, 2).join("\n"));
      await page.waitForFunction(() => document.querySelectorAll('[data-state="pending"]').length === 2);
      const running0 = await page.textContent("#file-progress");
      reply(waiting.shift()); await page.waitForSelector('[data-state="ok"]', { state: "attached" });
      const running1 = await page.textContent("#file-progress");
      releaseAll(); await settled(page);
      // A rate limit stops an 11-unit file after its first requests, so none of the 11 is analyzed. None of
      // its excerpts was scored earlier on this page, so none takes an earlier result.
      mode = "rate"; await analyze(page, Array.from({ length: 11 }, (_, i) => `- Use store${i} for storage.`).join("\n")); mode = "status";
      check(prefix + " counted labels use each count's plural form", { retry1, retry2, running0, running1, coverage315, coverage001,
        coverage11: await page.textContent("#file-report .coverage") }, countedLabels[locale]);
      await analyze(page, "- Keep requirements\n  across lines.\n- Keep one line.");
      check(prefix + " unit locations name a range or one line", await page.evaluate(() =>
        [...document.querySelectorAll(".instruction-unit .unit-location")].map((location) => location.textContent)), unitLocations[locale]);
      // Over the Claude Code guide's 200-line target, one note above the excerpts; at 200 lines, whose last
      // line ends in a newline, none. A rate limit keeps these runs to their first requests.
      mode = "rate"; await analyze(page, longDoc(200));
      const at200 = await page.locator("#file-length").isHidden();
      await analyze(page, longDoc(201)); mode = "status";
      check(prefix + " only a file over 200 lines shows one length note above the excerpts", { at200, ...await page.evaluate(() => {
        const t = STRINGS[document.getElementById("ui-lang").value].file.longFile, note = document.getElementById("file-length");
        return { notes: document.querySelectorAll("#file-report .banner").length, shown: !note.hidden && note.getClientRects().length > 0,
          title: note.querySelector("strong").textContent, body: note.querySelector("p").textContent === t.body.replace("{max}", "200") + " " + t.link,
          link: note.querySelector("p > a").href,
          above: Boolean(note.compareDocumentPosition(document.getElementById("file-units")) & Node.DOCUMENT_POSITION_FOLLOWING),
          fits: document.documentElement.scrollWidth <= innerWidth };
      }) }, { at200: true, notes: 1, shown: true, title: longTitles[locale], body: true,
        link: "https://code.claude.com/docs/en/memory#write-effective-instructions", above: true, fits: true });
      // Collapsed rows name what was found: the count and each headline, as text inside the one summary control.
      // A row whose only finding is not_a_rule reads as background and is counted apart from findings.
      mode = "ok"; await analyze(page, summaryDoc);
      // A run that ends on its own puts the prompt first with Copy focused, then the summary line and the
      // file name; what was found waits, closed, in one disclosure that holds the coverage, filter and rows.
      check(prefix + " the result leads with the prompt and keeps the details closed", await page.evaluate(() => {
        const t = STRINGS[document.getElementById("ui-lang").value].file, more = document.getElementById("file-details");
        const order = ["#file-report > h2", "#file-export .copy-prompt", "#file-summary", "#file-name", "#file-details"].map((selector) => document.querySelector(selector));
        return { focused: document.activeElement === order[1], heading: order[0].textContent === t.promptTitle,
          ordered: order.every((node, i) => !i || Boolean(order[i - 1].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)),
          closed: !more.open, label: more.querySelector("summary").textContent === t.details,
          inside: ["#file-units", "#file-filter", ".coverage"].every((selector) => more.contains(document.querySelector("#file-report " + selector))),
          rowsHidden: [...document.querySelectorAll(".instruction-unit")].every((unit) => !unit.checkVisibility()),
          primary: document.getElementById("file-create").getClientRects().length };
      }), { focused: true, heading: true, ordered: true, closed: true, label: true, inside: true, rowsHidden: true, primary: 0 });
      check(prefix + " the summary line counts every part as checked", await page.textContent("#file-summary"), summaryLines[locale].all);
      // Checked again unchanged, the file sends nothing, and the rows below read the same.
      const beforeAgain = requests.length; await page.fill("#file-source", ""); await analyze(page, summaryDoc);
      check(prefix + " an unchanged file is checked again without sending and says so", [requests.length - beforeAgain,
        await page.textContent("#file-summary")], [0, reusedLines[locale]]);
      await openDetails(page);
      const rows = await page.evaluate(() => {
        const t = STRINGS[document.getElementById("ui-lang").value], units = [...document.querySelectorAll(".instruction-unit")];
        return { coverage: document.querySelector("#file-report .coverage").textContent,
          shown: units.map((unit) => [unit.open, unit.querySelector(".unit-state").textContent,
            ...[...unit.querySelectorAll("summary .unit-headline")].map((line) => line.getClientRects().length ? line.textContent : "hidden")]),
          headlines: [t.findings.hedge_dominance.h, t.findings.no_concrete_anchor.h],
          controls: units.map((unit) => unit.querySelector("summary").querySelectorAll("a, button, input, select, textarea, [tabindex]").length) };
      });
      check(prefix + " collapsed rows show their count and headlines", rows.shown,
        [[false, rowLabels[locale].findings2, ...rows.headlines], [false, rowLabels[locale].background], [false, rowLabels[locale].clean]]);
      check(prefix + " coverage counts background apart from findings", rows.coverage, rowLabels[locale].coverage);
      check(prefix + " each row summary stays one control", rows.controls, [0, 0, 0]);
      await page.locator(".instruction-unit > summary").first().focus(); await page.keyboard.press("Tab");
      check(prefix + " Tab moves from one row summary to the next", await page.evaluate(() =>
        document.activeElement === document.querySelectorAll(".instruction-unit > summary")[1]));
      // The findings filter appears once a row has findings, above the rows and off. With Space it keeps the rows
      // with findings and the one a retry would send, and says how many show; again, every row returns as it was.
      // Coverage, the retry control and the prompt, with its coverage gaps, read the same throughout.
      // A reload forgets the results above, so every row is sent again.
      await reset(page); mode = "hold"; await create(page, filterDoc);
      const filterBefore = await page.locator("#file-filter").isHidden();
      mode = "partial"; for (const entry of waiting.splice(0)) reply(entry, ...(entry.rule.includes("module1") ? [502, { code: "upstream" }] : []));
      await settled(page);
      check(prefix + " a partial run says so beside the prompt and offers the retry", await page.evaluate(() => {
        const t = STRINGS[document.getElementById("ui-lang").value].file;
        return [document.getElementById("file-progress").textContent === t.partial, document.getElementById("file-start").getClientRects().length > 0,
          document.getElementById("file-summary").textContent];
      }), [true, true, summaryLines[locale].rest]);
      await openDetails(page);
      for (const index of [1, 3]) await page.locator(".instruction-unit > summary").nth(index).click();
      const filterView = () => page.evaluate(() => ({
        rows: [...document.querySelectorAll(".instruction-unit")].map((unit) => [unit.dataset.state, unit.open, unit.getClientRects().length > 0]),
        checked: document.getElementById("file-filter").checked, showing: document.getElementById("file-showing").textContent,
        above: Boolean(document.getElementById("file-filter").compareDocumentPosition(document.getElementById("file-units")) & Node.DOCUMENT_POSITION_FOLLOWING),
        unchanged: [document.querySelector("#file-report .coverage").textContent, document.getElementById("file-start").textContent,
          document.querySelector("#file-export .prompt-text")?.value] }));
      const unfiltered = await filterView();
      const named = await page.getByRole("checkbox", { name: filterLabels[locale].label, exact: true }).count();
      await page.focus("#file-filter"); await page.keyboard.press("Space");
      const filtered = await filterView();
      await page.keyboard.press("Space");
      const restored = await filterView();
      check(prefix + " the findings filter is absent before findings exist", filterBefore);
      check(prefix + " the findings filter is a named checkbox above the rows, off", [named, unfiltered.checked, unfiltered.showing, unfiltered.above,
        unfiltered.rows], [1, false, "", true, [["skipped", false, true], ["ok", true, true], ["ok", false, true], ["ok", true, true], ["error", false, true]]]);
      check(prefix + " filtering keeps rows with findings or a retry and says how many show", [filtered.checked, filtered.showing, filtered.rows],
        [true, filterLabels[locale].showing, [["skipped", false, false], ["ok", true, true], ["ok", false, false], ["ok", true, false], ["error", false, true]]]);
      check(prefix + " filtering leaves coverage, retry and the prompt with its gaps unchanged", [filtered.unchanged, restored.unchanged,
        unfiltered.unchanged[2].includes("Scoring failed; no scored advice is available.")], [unfiltered.unchanged, unfiltered.unchanged, true]);
      check(prefix + " turning the filter off restores every row and its open state", restored, unfiltered);
      await page.keyboard.press("Space"); await analyze(page, filterDoc);
      check(prefix + " a new review starts with the filter off and the details closed", await page.evaluate(() =>
        [document.getElementById("file-filter").checked, document.querySelectorAll(".instruction-unit[hidden]").length,
          document.getElementById("file-details").open]), [false, 0, false]);
      mode = "status";
      await analyze(page, scopedDoc);
      check(prefix + " a scoped excerpt is scored and says its text carries its section context", await page.evaluate(() => {
        const t = STRINGS[document.getElementById("ui-lang").value].file;
        return [...document.querySelectorAll(".instruction-unit")].map((unit) => [unit.dataset.state,
          ...[...unit.querySelectorAll(".unit-content > details:has(> pre)")].map((detail) =>
            [detail.querySelector("summary").textContent === t.ruleSentContext, detail.querySelector("pre").textContent])]);
      }), [["skipped"], ...scopedRules.map((rule) => ["ok", [true, rule]])]);
      await analyze(page, linkedDoc);
      check(prefix + " a read instruction for a linked file is scored and says the file was not read", await page.evaluate(() => {
        const t = STRINGS[document.getElementById("ui-lang").value].file;
        return [...document.querySelectorAll(".instruction-unit")].map((unit) => [unit.dataset.state,
          ...[...unit.querySelectorAll(".unit-content > p.hint")].map((p) => p.textContent === t.linkNotRead ? "linkNotRead" :
            p.textContent === t.reasons.linked_context ? "linked_context" : p.textContent === t.unchanged ? "unchanged" : p.textContent)]);
      }), [["ok", "linkNotRead", "unchanged"], ["requires_context", "linked_context"]]);
      await page.click("#mode-rule");
      check(prefix + " one-rule mode does not show the path-rules option", await page.locator("#file-path-rules").isVisible(), false);
      await page.fill("#rule", "Keep requirements in Spanish."); await page.click("#go");
      await page.waitForFunction(() => document.querySelector("#out .banner strong")?.textContent === STRINGS[document.getElementById("ui-lang").value].notEnglishTitle);
      check(prefix + " single-rule banner renders the not-English sentence", await page.textContent("#out .banner p"), sentences.spanish);
      mode = "ok";
      if (layout === "desktop" && locale === "en") {
        await reset(page);
        await page.locator("#file-upload").setInputFiles({ name: "CLAUDE.md", mimeType: "text/markdown", buffer: Buffer.from(sample) });
        check("upload retains exact text and filename", [await page.inputValue("#file-source"), await page.inputValue("#file-name")], [sample, "CLAUDE.md"]);
        // Emptying the text forgets the loaded file's name, so pasted text takes the default.
        await page.fill("#file-source", "");
        check("emptying the text resets the file name to AGENTS.md", await page.inputValue("#file-name"), "AGENTS.md");
        // Dropping a file: a drag carrying a file shows the drop state, leaving clears it, and a dropped .md file
        // fills the text box and the file name without sending anything. A wrong drop says why and changes nothing.
        await drag(page, "dragenter", [{ name: "RULES.md", text: "- Keep functions short." }]);
        const dropState = () => page.evaluate(() => ({ zone: document.getElementById("file-drop").classList.contains("dragging"),
          hint: [...document.querySelectorAll("#file-drop .drop-hint")].filter((node) => node.getClientRects().length).map((node) => node.textContent) }));
        const dragged = await dropState();
        await page.dispatchEvent("#file-drop", "dragleave", {});
        check("a dragged file shows the drop state and leaving clears it", [dragged, await dropState()],
          [{ zone: true, hint: ["Drop the file to read it."] }, { zone: false, hint: [] }]);
        await drag(page, "drop", [{ name: "RULES.md", text: sample }]);
        await page.waitForFunction(() => document.getElementById("file-name").value === "RULES.md");
        check("a dropped .md file fills the text and name and sends nothing", [await page.inputValue("#file-source"), requests.length,
          await page.locator("#file-error").isHidden(), await page.evaluate(() => document.activeElement.id)], [sample, 0, true, "file-source"]);
        for (const [files, message] of [[[{ name: "notes.txt", text: "Use tabs." }], "Choose a plain-text Markdown (.md) file."],
          [[{ name: "A.md", text: "Use tabs." }, { name: "B.md", text: "Use spaces." }], "Drop one file at a time."]]) {
          await drag(page, "drop", files);
          check("a wrong drop (" + files.map((file) => file.name).join(", ") + ") says why and keeps the text", [await page.textContent("#file-error"),
            await page.inputValue("#file-source"), await page.inputValue("#file-name"), requests.length], [message, sample, "RULES.md", 0]);
        }
        // Outside the drop area a dragged file shows the same state and a dropped one loads the same way; dragged text is left alone.
        const pageFile = [{ name: "PAGE.md", text: "- Page drop." }];
        await drag(page, "dragenter", pageFile, "h1");
        const pageDragged = await dropState();
        const pageDropped = await drag(page, "drop", pageFile, "h1");
        await page.waitForFunction(() => document.getElementById("file-name").value === "PAGE.md");
        check("a file dropped outside the drop area shows the drop state and loads like a drop on it", [pageDragged, pageDropped,
          await page.inputValue("#file-source"), await page.locator("#file-error").isHidden(), requests.length],
          [{ zone: true, hint: ["Drop the file to read it."] }, true, "- Page drop.", true, 0]);
        check("dragged text is not taken over", [await drag(page, "dragover", "Use tabs.", "h1"), await drag(page, "drop", "Use tabs.", "#file-source")], [false, false]);
        // In one-rule mode a dropped file is refused: the page keeps it from the browser and loads and sends nothing.
        await page.click("#mode-rule");
        const ruleText = await page.inputValue("#rule"), pageUrl = page.url();
        const refused = [await drag(page, "dragover", pageFile, "#rule"), await dropState(), await drag(page, "drop", pageFile, "#rule")];
        check("a file dropped in one-rule mode is refused without leaving the page or sending", [...refused, await page.inputValue("#rule"),
          await page.inputValue("#file-source"), page.url(), requests.length], [true, { zone: false, hint: [] }, true, ruleText, "- Page drop.", pageUrl, 0]);
        await page.click("#mode-file");
        const windowsSource = "\uFEFF# Rules\r\n\r\n- Preserve requirements.\r\n";
        await page.locator("#file-upload").setInputFiles({ name: "AGENTS.md", mimeType: "text/markdown", buffer: Buffer.from(windowsSource) });
        await page.click("#file-create"); await settled(page);
        const windowsPrompt = await copyText(page);
        const expectedFingerprint = (() => { let h = 2166136261; for(let i=0;i<windowsSource.length;i++) h = Math.imul(h ^ windowsSource.charCodeAt(i),16777619)>>>0; return "fnv1a-utf16-"+h.toString(16).padStart(8,"0"); })();
        check("uploaded BOM and CRLF fingerprint preserved", windowsPrompt.includes(expectedFingerprint));
        // The file name in the result labels the file in the prompt; changing it rebuilds the prompt and sends nothing.
        const label = (text) => JSON.parse(text.split("quoted data):\n")[1]).source.label;
        const beforeName = requests.length;
        await page.fill("#file-name", "docs/CLAUDE.md");
        check("the file name field in the result changes the prompt label and keeps the review", [label(windowsPrompt), label(await copyText(page)),
          await page.locator("#file-report").isVisible(), requests.length - beforeName], ["AGENTS.md", "docs/CLAUDE.md", true, 0]);
        await page.locator("#file-upload").setInputFiles({name:"broken.md",mimeType:"text/markdown",buffer:Buffer.from([255,10,45,32,85,115,101,32,99,97,99,104,101,46])});
        check("invalid UTF-8 upload rejected without replacement", await page.locator("#file-error").isVisible());
        requests = [];
        // The byte counter shows only near or over the 64 KiB limit.
        await page.fill("#file-source", "x".repeat(1000));
        const smallCount = await page.locator("#file-count").isHidden();
        await page.fill("#file-source", "x".repeat(60000));
        check("the byte counter shows only near the limit", [smallCount, await page.textContent("#file-count")], [true, "60000 / 65536 bytes"]);
        await create(page, "x".repeat(65537));
        check("oversize file rejects locally", await page.locator("#file-error").isVisible() && requests.length === 0 &&
          await page.locator("#file-count.over").isVisible());
        mode = "hold"; await create(page, Array.from({ length: 151 }, (_, i) => `- Use module${i}.`).join("\n"));
        await page.waitForFunction(() => document.querySelectorAll('[data-state="pending"]').length === 2);
        const overLimit = await unitHints(page);
        check("151 independent rules send the first 150 and list the last over the limit", { error: await page.locator("#file-error").isVisible(),
          sent: requests.length, queued: overLimit.filter((unit) => ["ready", "pending"].includes(unit.state)).length, last: overLimit.at(-1),
          progress: await page.textContent("#file-progress") },
          { error: false, sent: 2, queued: 150, progress: "Analyzing instructions\u2026 0 of 150 finished.", last: { state: "skipped", label: "Not scored",
            hints: ["Only the first 150 selected excerpts of a file are analyzed. Review this part in a separate file to analyze it."] } });
        await page.click("#file-cancel"); await settled(page); mode = "ok"; releaseAll(); requests = [];
        await create(page, "@AGENTS.md");
        check("reference-only file sends nothing, offers no scoring and says there is no prompt", [requests.length, await page.locator("#file-start").isHidden(),
          await page.locator(".copy-prompt").count(), await page.textContent("#file-progress")],
          [0, true, 0, "No part of this file could be scored, so there is no prompt. \u201CSee what was found\u201D below says why."]);

        // Checking a file again sends only new or changed excerpts, still only after the primary action;
        // an unchanged one takes the result this page received for the same text sent.
        await reset(page); await analyze(page, sample);
        const firstPrompt = await page.inputValue("#file-export .prompt-text");
        await page.fill("#file-source", ""); await page.fill("#file-source", sample);
        const unsent = [requests.length, await page.locator("#file-report").isHidden()];
        await page.click("#file-create"); await settled(page);
        check("an unchanged file sends nothing, and only after the press, and yields the same prompt", { unsent, sent: requests.length - 3,
          same: await page.inputValue("#file-export .prompt-text") === firstPrompt,
          focused: await page.evaluate(() => document.activeElement.matches("#file-export .copy-prompt")),
          progress: await page.textContent("#file-progress"), summary: await page.textContent("#file-summary") },
          { unsent: [3, true], sent: 0, same: true, focused: true, progress: "Analysis finished.",
            summary: "3 of 8 parts were checked. 3 of them were unchanged since your last check and were not sent again. Your agent will read the rest." });
        let beforeEdit = requests.length;
        await analyze(page, sample.replace("Never log passwords.", "Never log secrets."));
        check("editing one excerpt sends only that excerpt", [requests.slice(beforeEdit).map((entry) => entry.rule), await page.textContent("#file-summary")],
          [["Never log secrets."], "3 of 8 parts were checked. 2 of them were unchanged since your last check and were not sent again. Your agent will read the rest."]);
        // A failed excerpt keeps no result, so checking the file again sends it and nothing else.
        mode = "partial"; await analyze(page, batch); mode = "ok";
        beforeEdit = requests.length; await page.fill("#file-source", ""); await analyze(page, batch);
        check("a failed excerpt is sent again and the scored ones are not", [requests.slice(beforeEdit).map((entry) => entry.rule),
          await page.textContent("#file-summary")], [["Use module1 for storage."], "5 of 5 parts were checked. 4 of them were unchanged since your last check and were not sent again."]);
        await reset(page); await analyze(page, batch);
        check("a reload forgets earlier results and sends every excerpt again", [requests.length, await page.textContent("#file-summary")], [5, "5 of 5 parts were checked."]);

        await reset(page); mode = "partial"; await analyze(page, batch);
        check("partial result retains 4 successes", await page.locator('.instruction-unit[data-state="ok"]').count(), 4);
        // A run that ends on its own focuses Copy when there is a prompt; the retry for the failed unit is offered beside it.
        check("a run that finishes with a failed unit focuses Copy and offers the retry", await page.evaluate(() =>
          [document.activeElement.matches("#file-export .copy-prompt"), document.getElementById("file-start").textContent]), [true, "Analyze 1 remaining instruction"]);
        const beforeRetry = requests.length; mode = "ok";
        await page.click("#file-start"); await settled(page);
        check("retry only failed unit", requests.length - beforeRetry, 1);
        check("a run that finishes every unit moves focus to Copy",
          await page.evaluate(() => document.activeElement.matches("#file-export .copy-prompt")));

        await reset(page); mode = "refused"; await analyze(page, batch);
        const partial = await copyText(page);
        check("refused data omitted with coverage", !partial.includes("DO NOT EXPORT THIS ECHO") && !partial.includes("Use module1") && partial.includes("refused"));

        await reset(page); mode = "rate"; await analyze(page, batch);
        check("rate limit stops unsent work", requests.length <= 2);
        check("a run that pauses on its own keeps focus on the retry control", await page.evaluate(() => document.activeElement.id), "file-start");
        check("rate-limited file has no prompt", await page.locator(".copy-prompt").count(), 0);
        for (const errorMode of ["html-rate", "empty-unavailable"]) {
          await reset(page); mode = errorMode; await analyze(page, batch);
          check(errorMode + " stops unsent requests without JSON", requests.length <= 2);
        }

        await reset(page); mode = "hold"; await create(page, batch);
        await page.waitForFunction(() => document.querySelectorAll('[data-state="pending"]').length === 2);
        // Let one row finish and inspect it while another request is outstanding.
        reply(waiting.shift());
        await page.waitForSelector('[data-state="ok"]', { state: "attached" }); await openDetails(page);
        const completed = page.locator('[data-state="ok"]').first();
        await completed.locator("summary").first().click();
        await completed.locator(".unit-content details summary").first().click();
        mode = "ok"; releaseAll(); await settled(page);
        check("completion preserves focused factor disclosure", await page.evaluate(() => document.activeElement.tagName === "SUMMARY" && document.activeElement.parentElement.open && document.activeElement.closest(".unit-content") !== null));

        await reset(page); mode = "hold"; await page.fill("#file-source", batch);
        await page.focus("#file-create"); await page.keyboard.down("Enter");
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

        await reset(page); mode = "hold"; await create(page, batch);
        await page.waitForFunction(() => document.querySelectorAll('[data-state="pending"]').length === 2);
        await page.evaluate(() => { document.getElementById("file-source").value = "Use another file."; });
        releaseAll(); await settled(page);
        check("late responses after programmatic edit cannot export", await page.locator("#file-report").isHidden() && await page.locator(".copy-prompt").count() === 0);

        await reset(page); mode = "invalid"; await analyze(page, "Use functional components.");
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
        await create(paced, Array.from({ length: 70 }, (_, i) => `- Use module${i} for storage.`).join("\n"));
        await paced.waitForFunction(() => document.getElementById("file-progress").textContent.includes("Waiting") &&
          !document.querySelector('[data-state="pending"]'), null, { timeout: 10000 });
        await paced.waitForTimeout(300);
        check("a large file waits after 55 requests and says so", { sent: requests.length - beforePaced,
          ok: await paced.locator('[data-state="ok"]').count(), progress: await paced.textContent("#file-progress") },
          { sent: 55, ok: 55, progress: "Analyzing instructions… 55 of 70 finished. Waiting to stay within the request limit; the analysis continues within a minute." });
        windowCount = 0; await paced.clock.fastForward(60000); await settled(paced);
        check("a paced file finishes without a 429", { sent: requests.length - beforePaced, ok: await paced.locator('[data-state="ok"]').count(),
          progress: await paced.textContent("#file-progress") }, { sent: 70, ok: 70, progress: "Analysis finished." });
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
        mode = "hold"; await analyze(deadline, "- Keep requirements.");
        check("a request past the deadline shows the timeout message", await unitText(deadline),
          [["error", "Request failed", "The service took too long to respond, so this excerpt was not scored. You can analyze it again."]]);
        releaseAll();
        // In every locale, each failure shows its file-mode text, and the bulk retry resends only the unverifiable
        // and timed-out units; the unknown-finding and oversized-prompt units would repeat their outcome.
        for (const code of locales) {
          await deadline.selectOption("#ui-lang", code);
          mode = "retry"; let before = requests.length;
          await analyze(deadline, retryDoc);
          const firstRun = requests.length - before;
          const shown = await deadline.evaluate(() => {
            const t = STRINGS[document.getElementById("ui-lang").value].file;
            return { hints: [...document.querySelectorAll(".instruction-unit .unit-content > p.hint")].map((p) => p.textContent),
              expected: [t.unitErrors.unsupported_finding, t.invalid_result, t.prompt_too_large, t.unitErrors.timeout, t.unchanged],
              progress: [document.getElementById("file-progress").textContent, t.partial], coverage: document.querySelector("#file-report .coverage").textContent,
              retry: document.getElementById("file-start").textContent };
          });
          check(code + " file-mode failures show excerpt wording", shown.hints, shown.expected);
          // After the first language, the one scored excerpt is unchanged and is not sent again.
          check(code + " retry counts only units a new request can change", [firstRun, shown.retry, shown.progress[0]],
            [code === locales[0] ? 5 : 4, countedLabels[code].retry2, shown.progress[1]]);
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

        // Leaving the page: with no review, text not yet sent, or a review without results, the link just navigates.
        await page.goto(url);
        check("no review leaves without a prompt", await followPrivacy(page, false), { asked: [], path: "/privacy" });
        await page.goto(url); await page.fill("#file-source", batch);
        check("text not yet sent leaves without a prompt", await followPrivacy(page, false), { asked: [], path: "/privacy" });
        await page.goto(url); await create(page, "@AGENTS.md");
        check("a review without results leaves without a prompt", await followPrivacy(page, false), { asked: [], path: "/privacy" });
        // Held results: the link asks first and staying keeps the review.
        await page.goto(url); mode = "ok"; await analyze(page, batch);
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
        mode = "hold"; await create(page, batch);
        await page.waitForFunction(() => document.querySelectorAll('[data-state="pending"]').length === 2);
        check("requests in flight ask before following the privacy link", await followPrivacy(page, true), { asked: ["beforeunload"], path: "/" });
        mode = "ok"; releaseAll(); await settled(page);
        check("accepting follows the privacy link in the same tab", await followPrivacy(page, false), { asked: ["beforeunload"], path: "/privacy" });
        // Closing the tab with held results asks first; staying keeps it open.
        await page.goto(url); await analyze(page, batch);
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
        await analyze(blocked, "- Always try to use functional components.\n- Use module1 for storage.\n- Keep functions short.");
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
          const before = requests.length; await create(noModel, batch);
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
        await sentPage.goto(url);
        // Held requests show the disclosures while the excerpts wait to be sent.
        const beforeSent = requests.length; mode = "hold";
        await create(sentPage, "- Keep functions short.\n  Split long ones.\n- Normalize  this.\n- Keep tests fast.\n  - Avoid network calls.");
        const disclosed = () => sentPage.evaluate(() => [...document.querySelectorAll(".instruction-unit")].map((unit) =>
          [...unit.querySelectorAll(".unit-content > details")].filter((detail) => detail.querySelector("summary").textContent === STRINGS.en.file.ruleSent)
            .map((detail) => detail.querySelector("pre").textContent)));
        await sentPage.waitForFunction(() => document.querySelectorAll('[data-state="pending"]').length === 2);
        const previewed = await disclosed();
        check("a plain list item shows no text-sent disclosure", previewed[0], []);
        check("an item whose sent text differs beyond the marker shows it", previewed[1], ["Normalize this."]);
        check("a nested item sent as its own lines shows no text-sent disclosure", previewed[2], []);
        mode = "ok"; releaseAll(); await settled(sentPage);
        check("the disclosed text is the text sent", requests.slice(beforeSent).map((entry) => entry.rule).sort(),
          ["Keep functions short.\nSplit long ones.", "Keep tests fast.\n- Avoid network calls.", "Normalize this."]);
        check("scored units keep the same disclosures", await disclosed(), [[], ["Normalize this."], []]);
        const beforeScoped = requests.length; await analyze(sentPage, scopedDoc);
        check("scoped excerpts are sent with their section context", requests.slice(beforeScoped).map((entry) => entry.rule).sort(), [...scopedRules].sort());
        const scopedPacket = JSON.parse((await sentPage.inputValue("#file-export .prompt-text")).split("quoted data):\n")[1]);
        check("the prompt marks the excerpts scored with their section context", scopedPacket.scored.map((unit) =>
          [unit.sourceLines, unit.rawExcerpt, unit.exactScoredText, unit.scoredWithSectionContext]),
          [[{ startLine: 3, endLine: 3 }, "- Run the full test suite.", scopedRules[0], true],
            [{ startLine: 5, endLine: 6 }, "1. Build the app.\n2. Ship it.", scopedRules[1], true],
            [{ startLine: 8, endLine: 9 }, "- Keep tests fast:\n  - Avoid network calls.", scopedRules[2], true]]);
        const beforeLinked = requests.length; await analyze(sentPage, linkedDoc);
        check("a read instruction is sent as written", requests.slice(beforeLinked).map((entry) => entry.rule), [linkedRule]);
        const linkedPacket = JSON.parse((await sentPage.inputValue("#file-export .prompt-text")).split("quoted data):\n")[1]);
        check("the prompt marks the excerpt whose linked file was not read", linkedPacket.scored.map((unit) =>
          [unit.exactScoredText, unit.linkedContentNotRead, unit.scoredWithSectionContext]), [[linkedRule, true, undefined]]);
        const beforeCode = requests.length; await analyze(sentPage, codeDoc);
        check("a code block introduction is sent with its block", requests.slice(beforeCode).map((entry) => entry.rule), [codeRule]);
        check("its sent text says the code block was sent with it", await sentPage.evaluate(() =>
          [...document.querySelectorAll(".unit-content > details:has(> pre)")].map((detail) =>
            [detail.querySelector("summary").textContent === STRINGS.en.file.ruleSentCode, detail.querySelector("pre").textContent])), [[true, codeRule]]);
        const codePacket = JSON.parse((await sentPage.inputValue("#file-export .prompt-text")).split("quoted data):\n")[1]);
        check("the prompt marks the excerpt scored with its code block", codePacket.scored.map((unit) =>
          [unit.rawExcerpt, unit.exactScoredText, unit.scoredWithCodeBlock, unit.scoredWithSectionContext]),
          [["After cloning, initialize the submodule:", codeRule, true, undefined]]);
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
