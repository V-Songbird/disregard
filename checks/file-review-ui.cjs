"use strict";

// Real installed Edge, local HTTP fixtures and a simulated clipboard boundary.
// No provider calls, system clipboard reads, or external browser requests.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const http = require("node:http"), { createHash } = require("node:crypto");
const { chromium } = require(process.env.DISREGARD_PLAYWRIGHT_MODULE || "playwright");
const reviewAssets = require("./browser-assets.cjs");
const root = path.resolve(__dirname, ".."), target = process.argv[2] && path.resolve(process.argv[2]);
if (!target || fs.existsSync(target)) throw new Error("Pass a new report path: node checks/file-review-ui.cjs <new-report.json>");
fs.mkdirSync(path.dirname(target), { recursive: true });
const files = ["index.html", "style.css", "i18n.js", ...reviewAssets];
const assets = Object.fromEntries(files.map(file => [file === "index.html" ? "/" : "/" + file, file]));
const report = { browser: "installed Edge", providerRequests: 0, clipboard: "simulated writeText success/rejection; system clipboard untouched",
  sourceHashes: Object.fromEntries([...files.map(file => "public/" + file), "checks/file-review-ui.cjs"].map(file =>
    [file, createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")])),
  checks: [], pageErrors: [], screenshots: [] };
const sample = "# Project instructions\n\n- Always try to use functional components.\n- Run `node --test` before submitting changes.\n- Never log passwords.\n\n## Before deployment\n\n- Run `npm run deploy`.\n\n> Run an example command.\n\n@OTHER.md";
const batch = Array.from({ length: 5 }, (_, i) => `- Use module${i} for storage.`).join("\n");
let mode = "ok", requests = [], active = 0, maxActive = 0, waiting = [];
function result(rule) {
  const hedge = rule.includes("try to");
  return { status: "ok", findings: hedge ? [{ id: "hedge_dominance", factor: "F1", value: 0.2, verb: "try to" }] : [],
    factors: { F1: hedge ? 0.2 : 0.85, F2: 0.85, F3: 2, F7: 0.8, F8: 2, is_rule: 0.95,
      primitive: { choice: "rule", confidence: 0.9 }, rule_role: { choice: "direct_action", confidence: 0.9 } } };
}
function reply(entry, code = 200, body = result(entry.rule)) {
  if (entry.res.destroyed) return;
  entry.res.writeHead(code, { "Content-Type": "application/json" }); entry.res.end(JSON.stringify(body));
}
function releaseAll() { for (const entry of waiting.splice(0)) reply(entry); }
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/score") {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const { rule } = JSON.parse(raw);
    const entry = { rule, res }; requests.push(entry); active++; maxActive = Math.max(maxActive, active);
    res.once("close", () => active--);
    if (mode === "hold") waiting.push(entry);
    else if (mode === "html-rate") { res.writeHead(429, { "Content-Type": "text/html" }); res.end("<html>Limited</html>"); }
    else if (mode === "empty-unavailable") { res.writeHead(503); res.end(); }
    else if (mode === "rate") reply(entry, 429, { code: "rate_limited" });
    else if (mode === "partial" && rule.includes("module1")) reply(entry, 502, { code: "upstream" });
    else if (mode === "refused" && rule.includes("module1")) reply(entry, 200, { status: "refused", findings: [], echo: "DO NOT EXPORT THIS ECHO" });
    else if (mode === "invalid") reply(entry, 200, { status: "ok", findings: [], factors: {} });
    else reply(entry);
    return;
  }
  const file = assets[req.url];
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html" });
  res.end(fs.readFileSync(path.join(root, "public", file)));
});
function check(name, actual, expected = true) {
  let passed = true; try { assert.deepEqual(actual, expected); } catch { passed = false; }
  report.checks.push({ name, passed, actual, expected });
}
async function settled(page) { await page.waitForFunction(() => document.getElementById("file-cancel").hidden); }
async function prepare(page, text = sample) {
  await page.fill("#file-source", text); await page.click("#file-prepare");
}
async function copyText(page) {
  await page.locator("#file-export .copy-prompt").click();
  return page.evaluate(() => window.copiedPrompt);
}
async function reset(page) {
  mode = "ok"; releaseAll(); await page.reload();
  await page.waitForSelector("#file-source"); requests = []; maxActive = active;
}

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({ channel: "msedge", headless: true }); report.version = browser.version();
    for (const layout of ["desktop", "mobile"]) for (const locale of ["en", "es", "zh", "hi", "ar", "fr"]) {
      mode = "ok"; requests = []; maxActive = active;
      const context = await browser.newContext({ viewport: layout === "mobile" ? { width: 375, height: 812 } : { width: 1280, height: 900 }, locale: "en-US" });
      const page = await context.newPage(); page.on("pageerror", error => report.pageErrors.push(error.message));
      await context.route("**/*", route => new URL(route.request().url()).origin === url ? route.continue() : route.abort());
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
      const ready = await page.locator('.instruction-unit[data-state="ready"]').count();
      check(prefix + " 3 independent rules", ready, 3);
      check(prefix + " inherited scope excluded", await page.locator('.instruction-unit[data-state="requires_context"]').count(), 1);
      await page.click("#file-start"); await settled(page);
      check(prefix + " sends exact 3 units", requests.length, 3);
      check(prefix + " concurrency bounded", maxActive <= 2);
      const text = await copyText(page);
      check(prefix + " copied evidence", text.includes("hedge_dominance") && text.includes("Always try to use functional components."));
      check(prefix + " context-dependent command not exported", !text.includes("npm run deploy"));
      check(prefix + " copying adds no requests", requests.length, 3);
      check(prefix + " full locale keys", await page.evaluate(() => {
        const t = STRINGS[document.documentElement.lang].file;
        return document.getElementById("file-prepare").textContent === t.prepare && document.querySelector(".copy-prompt").textContent === t.copy;
      }));
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
        await page.screenshot({ path: screenshot, fullPage: true }); report.screenshots.push(path.relative(root, screenshot));
      }
      await page.fill("#file-source", sample + "\n");
      check(prefix + " editing invalidates report and prompt", await page.locator("#file-report").isHidden() && await page.locator(".copy-prompt").count() === 0);
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
        await prepare(page, Array.from({ length: 41 }, (_, i) => `- Use module${i}.`).join("\n"));
        check("41 independent rules reject locally", await page.locator("#file-error").isVisible() && requests.length === 0);
        await prepare(page, "@AGENTS.md");
        check("reference-only file offers no scoring", await page.locator("#file-start").isHidden() && await page.locator(".copy-prompt").count() === 0);

        await reset(page); mode = "partial"; await prepare(page, batch);
        await page.click("#file-start"); await settled(page);
        check("partial result retains 4 successes", await page.locator('.instruction-unit[data-state="ok"]').count(), 4);
        const beforeRetry = requests.length; mode = "ok";
        await page.click("#file-start"); await settled(page);
        check("retry only failed unit", requests.length - beforeRetry, 1);

        await reset(page); mode = "refused"; await prepare(page, batch);
        await page.click("#file-start"); await settled(page);
        const partial = await copyText(page);
        check("refused data omitted with coverage", !partial.includes("DO NOT EXPORT THIS ECHO") && !partial.includes("Use module1") && partial.includes("refused"));

        await reset(page); mode = "rate"; await prepare(page, batch);
        await page.click("#file-start"); await settled(page);
        check("rate limit stops unsent work", requests.length <= 2);
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
        await page.click("#file-cancel"); await settled(page);
        check("cancel sends at most 2", requests.length, 2);
        check("all cancelled units accounted", await page.locator('[data-state="cancelled"]').count(), 5);
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

        await reset(page); await page.click("#mode-rule");
        await page.fill("#rule", "Always try to use functional components."); await page.click("#go");
        await page.waitForSelector("#out .copy-prompt");
        await page.click("#out .copy-prompt");
        check("single-rule prompt uses exact snapshot", (await page.evaluate(() => window.copiedPrompt)).includes("Always try to use functional components."));
      }
      await context.close(); releaseAll();
    }
  } catch (error) { report.fatal = error.stack || error.message; }
  finally {
    releaseAll(); if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    report.passed = !report.fatal && !report.pageErrors.length && report.checks.length > 100 && report.checks.every(check => check.passed);
    fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failed: report.checks.filter(check => !check.passed), pageErrors: report.pageErrors, fatal: report.fatal, output: target }));
    if (!report.passed) process.exitCode = 1;
  }
})();
