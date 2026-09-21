"use strict";

// Render synthetic responses across layouts and locales. These fixtures check
// UI behavior and prompt export, not model accuracy or translation quality.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { createHash } = require("node:crypto");
const { chromium } = require(process.env.DISREGARD_PLAYWRIGHT_MODULE || "playwright");
const reviewAssets = require("./browser-assets.cjs");
const root = path.resolve(__dirname, "..");
const output = process.argv[2] || ".private/checks/recommendation-ui.json";
const option = process.argv[3];
const customPacket = option?.startsWith("--packet=") ? option.slice(9) : null;
if ((option && !customPacket) || process.argv.length > 4) {
  throw new Error("Usage: node checks/recommendation-ui.cjs [.private/checks/new-report.json] [--packet=<fixtures.json>]");
}
const target = path.resolve(output);
if (fs.existsSync(target)) throw new Error("Refusing to overwrite an existing report: " + target);
fs.mkdirSync(path.dirname(target), { recursive: true });
const packetPath = customPacket || "checks/fixtures/file-review-findings.json";
const packet = JSON.parse(fs.readFileSync(path.join(root, packetPath)));
const hash = (file) => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
for (const [file, expected] of Object.entries(packet.sourceHashes)) {
  if (hash(file) !== expected) throw new Error("Fixture source changed: " + file);
}
const translationPath = "public/i18n.js";
const sourcePaths = ["public/index.html", "public/style.css", translationPath, packetPath, "checks/recommendation-ui.cjs"];
sourcePaths.push(...reviewAssets.map(file => "public/" + file));
const report = { mode: "synthetic", browser: "installed Edge", providerRequests: 0,
  sourceHashes: Object.fromEntries(sourcePaths.map((p) => [p, hash(p)])), scenarios: [], rendered: [], errors: [], screenshots: [] };
const assets = {
  "/": ["text/html", fs.readFileSync(path.join(root, "public/index.html"))],
  "/i18n.js": ["text/javascript", fs.readFileSync(path.join(root, translationPath))],
  "/style.css": ["text/css", fs.readFileSync(path.join(root, "public/style.css"))],
};
for (const asset of reviewAssets) assets["/" + asset] = ["text/javascript", fs.readFileSync(path.join(root, "public", asset))];
let fixture, requests = 0;
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/score") {
    requests++;
    for await (const _ of req) { /* only controlled local fixtures are sent */ }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(fixture.body));
    return;
  }
  const asset = assets[req.url];
  if (!asset) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": asset[0] });
  res.end(asset[1]);
});
(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({ channel: "msedge", headless: true });
    report.version = browser.version();
    const layouts = ["desktop", "mobile", "scaled"];
    const locales = ["en", "es", "zh", "hi", "ar", "fr"];
    for (const layout of layouts) {
      for (const locale of locales) {
        const context = await browser.newContext({ locale: "en-US", viewport: layout === "mobile" ? { width: 375, height: 812 } : { width: 1280, height: 900 } });
        const page = await context.newPage();
        page.on("pageerror", (error) => report.errors.push(error.message));
        await page.goto(url);
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
          const observed = await page.evaluate((body) => {
            const t = window.STRINGS[document.documentElement.lang];
            const fill = (value, verb) => String(value).replace(/\{verb\}/g, verb);
            if (body.status === "not_english") {
              const lang = t.languages[body.language?.code] || body.language?.name;
              const banner = document.querySelector("#out .banner");
              return { visible: [], banner: banner?.textContent, checks: {
                complete: !!banner && !document.querySelector("#out .finding"),
                translated: banner?.querySelector("strong")?.textContent === t.notEnglishTitle &&
                  banner?.querySelector("p")?.textContent === (lang ? t.notEnglishBody.replace("{lang}", lang) : t.notEnglishUnknown),
                noOverflow: document.documentElement.scrollWidth <= innerWidth,
                direction: document.documentElement.dir === t.dir,
              } };
            }
            const expected = body.findings;
            const cards = [...document.querySelectorAll("#out li.finding")];
            const visible = cards.map((card) => ({ h: card.querySelector("h2")?.textContent,
              d: card.querySelector("p:not(.fix)")?.textContent, fix: card.querySelector(".fix")?.textContent }));
            return { visible, checks: {
              complete: cards.length === expected.length,
              translated: expected.every((f, i) => visible[i]?.h === t.findings[f.id].h &&
                visible[i]?.d === fill(t.findings[f.id].d, f.verb) && visible[i]?.fix === fill(t.findings[f.id].fix, f.verb)),
              noPlaceholders: visible.every((f) => !JSON.stringify(f).includes("{verb}")),
              numbersBehindDisclosure: !cards.some((card) => /\bF[12378]\b|confidence\s+[01]\./.test(card.textContent)),
              noOverflow: document.documentElement.scrollWidth <= innerWidth,
              disclosureInitiallyClosed: !document.querySelector("#out > details").open,
              direction: document.documentElement.dir === t.dir,
            } };
          }, fixture.body);
          const checks = { ...observed.checks, oneMockRequest: requests - starting === 1,
            inputPreserved: await page.inputValue("#rule") === fixture.text };
          let disclosed;
          if (fixture.body.status === "ok") {
            await page.locator("#out > details > summary").click();
            checks.disclosureOpens = await page.locator("#out > details").evaluate((e) => e.open && e.querySelectorAll("dd").length > 0);
            checks.factorValuesPreserved = await page.evaluate((factors) => {
              const t = window.STRINGS[document.documentElement.lang];
              const values = [...document.querySelectorAll("#out dd")].map((e) => e.textContent);
              return ["is_rule", "F3", "F8", "F1", "F2", "F7"].filter((key) => factors[key] !== undefined)
                .every((key, i) => values[i] === (factors[key] === null ? t.undetermined : String(factors[key])));
            }, fixture.body.factors);
            if (fixture.body.factors.rule_role) {
              disclosed = await page.evaluate((role) => {
                const t = window.STRINGS[document.documentElement.lang];
                const label = [...document.querySelectorAll("#out dt")].find((e) => e.textContent === t.factors.rule_role);
                const expected = t.ruleRoles[role.choice] + " (" + t.confidence + " " + role.confidence + ")";
                return { label: label?.textContent, value: label?.nextElementSibling?.textContent,
                  translated: !!label && label.nextElementSibling?.textContent === expected,
                  fits: document.documentElement.scrollWidth <= innerWidth };
              }, fixture.body.factors.rule_role);
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
    report.mockRequests = requests;
    report.passed = !report.errors.length && report.scenarios.length === packet.cases.length * 18 && report.scenarios.every((s) => s.passed);
    fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ passed: report.passed, scenarios: report.scenarios.length, mockRequests: requests, errors: report.errors,
      failed: report.scenarios.filter((s) => !s.passed).map((s) => [s.layout, s.locale, s.id, s.checks]) }));
    if (!report.passed) process.exitCode = 1;
  }
})();
