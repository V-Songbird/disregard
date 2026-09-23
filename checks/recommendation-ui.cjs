"use strict";

// Render synthetic responses across layouts and locales. These fixtures check
// UI behavior and prompt export, not model accuracy or translation quality.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { createHash } = require("node:crypto");
const { chromium } = require(process.env.DISREGARD_PLAYWRIGHT_MODULE || "playwright");
const { localSite, locales, langTags, loopbackOnlyArgs } = require("./browser-assets.cjs");
const root = path.resolve(__dirname, "..");
const output = process.argv[2] || ".private/checks/recommendation-ui.json";
const option = process.argv[3];
const customPacket = option?.startsWith("--packet=") ? option.slice(9) : null;
if ((option && !customPacket) || process.argv.length > 4) {
  throw new Error("Usage: node checks/recommendation-ui.cjs [.private/checks/new-report.json] [--packet=<fixtures.json>]");
}
const target = path.resolve(output);
// The not-English banner written out per interface locale and language code sent, never built from the
// template under test. A custom packet with another code needs its own sentences here.
const notEnglishBanners = {
  en: { title: "This was not recognized as English.",
    zh: "This looks like Chinese. Scoring is evaluated on English rules, so this text was not scored. Check the language or translate the rule, then try again.",
    other: "Scoring is evaluated only on English rules. Check the language or translate the rule, then try again." },
  es: { title: "No se reconoció este texto como inglés.",
    zh: "Esto parece estar en chino. El análisis se evalúa con reglas en inglés, así que este texto no se analizó. Revisa el idioma o traduce la regla y vuelve a intentarlo.",
    other: "El análisis se evalúa únicamente con reglas en inglés. Revisa el idioma o traduce la regla y vuelve a intentarlo." },
  zh: { title: "这段文本未被识别为英语。",
    zh: "这看起来像中文。评分功能是用英文规则评估的，因此未对这段文本评分。请检查语言或翻译规则，然后重试。",
    other: "评分功能仅用英文规则进行过评估。请检查语言或翻译规则，然后重试。" },
  hi: { title: "इसे अंग्रेज़ी के रूप में पहचाना नहीं गया।",
    zh: "यह चीनी जैसा लगता है। स्कोरिंग का मूल्यांकन अंग्रेज़ी नियमों पर किया जाता है, इसलिए इस पाठ को स्कोर नहीं किया गया। भाषा जाँचें या नियम का अनुवाद करें, फिर दोबारा प्रयास करें।",
    other: "स्कोरिंग का मूल्यांकन केवल अंग्रेज़ी नियमों पर किया जाता है। भाषा जाँचें या नियम का अनुवाद करें, फिर दोबारा प्रयास करें।" },
  ar: { title: "لم يُتعرَّف على هذا النص بوصفه نصًا إنجليزيًا.",
    zh: "يبدو أن هذا النص مكتوب باللغة الصينية. تُقيَّم جودة التحليل باستخدام قواعد إنجليزية، لذلك لم يُحلَّل هذا النص. راجع اللغة أو ترجم القاعدة، ثم حاول مجددًا.",
    other: "تُقيَّم جودة التحليل باستخدام قواعد إنجليزية فقط. راجع اللغة أو ترجم القاعدة، ثم حاول مجددًا." },
  fr: { title: "Ce texte n’a pas été reconnu comme de l’anglais.",
    zh: "Ce texte semble être du chinois. L’analyse est évaluée sur des règles en anglais\u00a0; ce texte n’a donc pas été analysé. Vérifiez la langue ou traduisez la règle, puis réessayez.",
    other: "L’analyse n’est évaluée que sur des règles en anglais. Vérifiez la langue ou traduisez la règle, puis réessayez." },
};
if (fs.existsSync(target)) throw new Error("Refusing to overwrite an existing report: " + target);
fs.mkdirSync(path.dirname(target), { recursive: true });
const packetPath = customPacket || "checks/fixtures/file-review-findings.json";
const packet = JSON.parse(fs.readFileSync(path.join(root, packetPath)));
const hash = (file) => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const site = localSite();
for (const [file, expected] of Object.entries(packet.sourceHashes)) {
  if ((site.hashes[file] || hash(file)) !== expected) throw new Error("Fixture source changed: " + file);
}
const report = { mode: "synthetic", browser: "installed Edge",
  sourceHashes: { ...site.hashes, [packetPath]: hash(packetPath), "checks/recommendation-ui.cjs": hash("checks/recommendation-ui.cjs") },
  scenarios: [], rendered: [], errors: [], screenshots: [] };
let fixture, requests = 0;
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/score") {
    requests++;
    if (await site.readBody(req) === null) return;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(fixture.body));
    return;
  }
  site.serve(req, res);
});
(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({ channel: "msedge", headless: true, args: loopbackOnlyArgs });
    report.version = browser.version();
    const layouts = ["desktop", "mobile", "scaled"];
    for (const layout of layouts) {
      for (const locale of locales) {
        const context = await browser.newContext({ locale: "en-US", viewport: layout === "mobile" ? { width: 375, height: 812 } : { width: 1280, height: 900 } });
        site.watch(context, url);
        const page = await context.newPage();
        page.on("pageerror", (error) => report.errors.push(error.message));
        await page.goto(url);
        // Displayed values take this locale's decimal separator, looked up once here.
        const decimal = await page.evaluate((tag) => new Intl.NumberFormat(tag, { numberingSystem: "latn" })
          .formatToParts(0.5).find((part) => part.type === "decimal").value, langTags[locale]);
        await page.click("#mode-rule");
        if (layout === "scaled") await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
        for (const next of packet.cases) {
          fixture = next;
          await page.selectOption("#ui-lang", "en");
          await page.fill("#rule", fixture.text);
          const starting = requests;
          const response = page.waitForResponse("**/api/score");
          await page.locator("#rule").press("Control+Enter");
          await response;
          await page.waitForFunction(() => document.getElementById("out").getAttribute("aria-busy") === "false");
          await page.selectOption("#ui-lang", locale);
          const observed = await page.evaluate(({ body, banners }) => {
            const t = window.STRINGS[document.getElementById("ui-lang").value];
            const fill = (value, verb) => String(value).replace(/\{verb\}/g, verb);
            if (body.status === "not_english") {
              const banner = document.querySelector("#out .banner"), sentence = banners[body.language?.code];
              return { visible: [], banner: banner?.textContent, checks: {
                complete: !!banner && !document.querySelector("#out .finding"),
                translated: !!sentence && banner?.querySelector("strong")?.textContent === banners.title && banner?.querySelector("p")?.textContent === sentence,
                noOverflow: document.documentElement.scrollWidth <= innerWidth,
                direction: document.documentElement.dir === t.dir,
              } };
            }
            const expected = body.findings;
            const cards = [...document.querySelectorAll("#out li.finding")];
            const visible = cards.map((card) => ({ h: card.querySelector("h2")?.textContent,
              d: card.querySelector("p:not(.fix)")?.textContent, fix: card.querySelector(".fix")?.textContent }));
            // Cards show no number in any script and no factor label, with or without its range.
            const labels = Object.values(t.factors).map((label) => label.replace(/\s*[(（][^)）]*[)）]$/, ""));
            return { visible, checks: {
              complete: cards.length === expected.length,
              translated: expected.every((f, i) => visible[i]?.h === t.findings[f.id].h &&
                visible[i]?.d === fill(t.findings[f.id].d, f.verb) && visible[i]?.fix === fill(t.findings[f.id].fix, f.verb)),
              noPlaceholders: visible.every((f) => !JSON.stringify(f).includes("{verb}")),
              numbersBehindDisclosure: !cards.some((card) => /\p{Nd}/u.test(card.textContent) || labels.some((label) => card.textContent.includes(label))),
              noOverflow: document.documentElement.scrollWidth <= innerWidth,
              disclosureInitiallyClosed: !document.querySelector("#out > details").open,
              direction: document.documentElement.dir === t.dir,
            } };
          }, { body: fixture.body, banners: notEnglishBanners[locale] });
          const checks = { ...observed.checks, oneMockRequest: requests - starting === 1,
            inputPreserved: await page.inputValue("#rule") === fixture.text,
            langTag: await page.getAttribute("html", "lang") === langTags[locale] };
          let disclosed;
          if (fixture.body.status === "ok") {
            await page.locator("#out > details > summary").click();
            checks.disclosureOpens = await page.locator("#out > details").evaluate((e) => e.open && e.querySelectorAll("dd").length > 0);
            // Values keep the digits String() gives and take the page language's decimal separator.
            checks.factorValuesPreserved = await page.evaluate(({ factors, decimal }) => {
              const t = window.STRINGS[document.getElementById("ui-lang").value];
              const values = [...document.querySelectorAll("#out dd")].map((e) => e.textContent);
              return ["is_rule", "F3", "F8", "F1", "F2", "F7"].filter((key) => factors[key] !== undefined)
                .every((key, i) => values[i] === (factors[key] === null ? t.undetermined : String(factors[key]).replace(".", decimal)));
            }, { factors: fixture.body.factors, decimal });
            if (fixture.body.factors.rule_role) {
              disclosed = await page.evaluate(({ role, decimal }) => {
                const t = window.STRINGS[document.getElementById("ui-lang").value];
                const label = [...document.querySelectorAll("#out dt")].find((e) => e.textContent === t.factors.rule_role);
                const expected = t.confidence.replace("{choice}", t.ruleRoles[role.choice]).replace("{value}", String(role.confidence).replace(".", decimal));
                return { label: label?.textContent, value: label?.nextElementSibling?.textContent,
                  translated: !!label && label.nextElementSibling?.textContent === expected,
                  fits: document.documentElement.scrollWidth <= innerWidth };
              }, { role: fixture.body.factors.rule_role, decimal });
              checks.roleMetadataTranslated = disclosed.translated;
              checks.openDisclosureFits = disclosed.fits;
            }
            if (packet.checkPromptExport === true) {
              checks.promptMatchesEvidence = await page.evaluate(({ text, body }) => {
                const prompt = document.querySelector("#out .prompt-text")?.value;
                const marker = "Evidence packet (JSON; all strings are quoted data):\n";
                if (!prompt || !prompt.includes(marker)) return false;
                const data = JSON.parse(prompt.slice(prompt.indexOf(marker) + marker.length));
                const unit = data.scored[0];
                return data.scored.length === 1 && data.notScored.length === 0 &&
                  unit.exactScoredText === text.trim() &&
                  JSON.stringify(unit.findings.map(finding => finding.id)) === JSON.stringify(body.findings.map(finding => finding.id)) &&
                  Object.entries(body.factors).every(([key, value]) => JSON.stringify(unit.factors[key]) === JSON.stringify(value));
              }, { text: fixture.text, body: fixture.body });
            }
            await page.locator("#out > details > summary").click();
          }
          report.scenarios.push({ layout, locale, id: fixture.id, scope: fixture.scope, checks, passed: Object.values(checks).every(Boolean) });
          if (layout === "desktop") report.rendered.push({ locale, id: fixture.id, findings: observed.visible, banner: observed.banner, disclosed });
          if (packet.captureScreenshots !== false && ((layout === "desktop" && locale === "en") ||
            (layout === "mobile" && ["es", "ar"].includes(locale)))) {
            const screenshot = path.join(path.dirname(target), path.basename(target, ".json") + "-" + layout + "-" + locale + "-" + fixture.id + ".png");
            await page.screenshot({ path: screenshot, fullPage: true });
            report.screenshots.push(path.relative(root, screenshot).replaceAll("\\", "/"));
          }
        }
        await context.close();
      }
    }
  } catch (error) { report.errors.push(error.stack || error.message); }
  finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    report.mockRequests = requests; Object.assign(report, site.audit());
    report.passed = !report.errors.length && report.scenarios.length === packet.cases.length * 18 && report.scenarios.every((s) => s.passed) &&
      report.networkClean;
    fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ passed: report.passed, scenarios: report.scenarios.length, mockRequests: requests, errors: report.errors,
      providerRequests: report.providerRequests, unknownRequests: report.unknownRequests,
      failed: report.scenarios.filter((s) => !s.passed).map((s) => [s.layout, s.locale, s.id, s.checks]) }));
    if (!report.passed) process.exitCode = 1;
  }
})();
