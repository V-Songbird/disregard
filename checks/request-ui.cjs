"use strict";

// Optional browser integration check. Uses installed Edge and localhost only;
// /api/score is simulated here, so no provider key or paid request is needed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { createHash } = require("node:crypto");
const { chromium } = require(process.env.DISREGARD_PLAYWRIGHT_MODULE || "playwright");
const reviewAssets = require("./browser-assets.cjs");

const root = path.resolve(__dirname, "..");
const output = process.argv[2];
if (!output) throw new Error("Usage: node checks/request-ui.cjs <new-report.json>");
const reportPath = path.resolve(output);
if (fs.existsSync(reportPath)) throw new Error("Refusing to overwrite an existing report: " + reportPath);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const report = { browser: "installed Edge", network: "localhost mocks only", checks: [], pageErrors: [], scenarios: [] };
report.sourceHashes = Object.fromEntries(["public/index.html", "public/i18n.js", "checks/request-ui.cjs", ...reviewAssets.map(file => "public/" + file)].map((file) =>
  [file, createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")]));
const good = { status: "ok", findings: [], factors: { F3: 4 } };
let mode = "success", requests = 0;
const waiting = [];
function respond(res, status = 200, body = good) {
  if (res.destroyed) return;
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/score") {
    requests++;
    for await (const _ of req) { /* drain the bounded test input */ }
    if (mode === "hold") waiting.push(res);
    else if (mode === "body") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write("{");
      waiting.push(res);
    }
    else if (mode === "error") respond(res, 502, { code: "upstream" });
    else if (mode === "broken") { res.writeHead(502); res.end("<html>Bad gateway</html>"); }
    else respond(res);
    return;
  }
  const files = { "/": ["index.html", "text/html"], "/i18n.js": ["i18n.js", "text/javascript"], "/style.css": ["style.css", "text/css"] };
  for (const asset of reviewAssets) files["/" + asset] = [asset, "text/javascript"];
  const file = files[req.url];
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": file[1] });
  res.end(fs.readFileSync(path.join(root, "public", file[0])));
});

function check(name, actual, expected) {
  let passed = true;
  try { assert.deepEqual(actual, expected); } catch { passed = false; }
  report.checks.push({ name, passed, actual, expected });
}
function release() {
  while (waiting.length) {
    const res = waiting.shift();
    if (res.headersSent) res.end('"status":"ok","findings":[],"factors":{}}');
    else respond(res);
  }
}
async function state(page) {
  return page.evaluate(() => {
    const locale = document.documentElement.lang;
    const t = window.STRINGS[locale];
    const out = document.getElementById("out");
    return { locale, dir: document.documentElement.dir, title: out.querySelector("strong")?.textContent,
      body: out.querySelector("p")?.textContent, busy: out.getAttribute("aria-busy"),
      disabled: document.getElementById("go").disabled, button: document.getElementById("go").textContent,
      readOnly: document.getElementById("rule").readOnly, rule: document.getElementById("rule").value,
      empty: out.childElementCount === 0, overflow: document.documentElement.scrollWidth > innerWidth,
      expected: { busyTitle: t.busyTitle, submitBusy: t.submitBusy, emptyTitle: t.emptyTitle,
        cleanTitle: t.cleanTitle, upstream: t.errors.upstream, timeout: t.errors.timeout, network: t.errors.network,
        tooLong: t.errors.too_long.replace("{max}", "2000") } };
  });
}
async function settle(page) { await page.waitForFunction(() => document.getElementById("out").getAttribute("aria-busy") === "false"); }
async function localized(page, locale, kind) {
  await page.selectOption("#ui-lang", locale === "en" ? "es" : "en");
  const switched = await state(page);
  check(locale + " " + kind + " translates immediately", kind === "empty" ? switched.title : switched.body,
    kind === "empty" ? switched.expected.emptyTitle : switched.expected.upstream);
  await page.selectOption("#ui-lang", locale);
  const s = await state(page);
  check(locale + " " + kind + " translated", kind === "empty" ? s.title : s.body,
    kind === "empty" ? s.expected.emptyTitle : s.expected.upstream);
  return s;
}

(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({ channel: "msedge", headless: true });
    report.version = browser.version();
    const locales = ["en", "es", "zh", "hi", "ar", "fr"];
    for (const layout of ["desktop", "mobile", "scaled"]) {
      for (const locale of locales) {
        const context = await browser.newContext({ viewport: layout === "mobile" ? { width: 375, height: 812 } : { width: 1280, height: 900 }, locale: "en-US" });
        const page = await context.newPage();
        page.on("pageerror", (e) => report.pageErrors.push(e.message));
        await page.goto(url);
        await page.click("#mode-rule");
        if (layout === "scaled") await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
        const label = layout + "/" + locale;
        const rule = "Use `const`.";
        mode = "hold";
        await page.fill("#rule", rule);
        const start = requests;
        const received = page.waitForRequest("**/api/score");
        await page.click("#go");
        await received;
        await page.locator("#rule").press(" ");
        await page.selectOption("#ui-lang", locale);
        const switched = await state(page);
        check(label + " locale keeps busy state", [switched.disabled, switched.title, switched.button],
          [true, switched.expected.busyTitle, switched.expected.submitBusy]);
        await page.locator("#rule").press("Control+Enter");
        await page.locator("#rule").press("Meta+Enter");
        await page.waitForTimeout(100);
        const busy = await state(page);
        check(label + " single request", requests - start, 1);
        check(label + " busy controls", [busy.busy, busy.disabled, busy.readOnly, busy.rule], ["true", true, true, rule]);
        check(label + " busy localized", [busy.title, busy.button], [busy.expected.busyTitle, busy.expected.submitBusy]);
        check(label + " busy fits", busy.overflow, false);
        if (layout === "mobile" && ["es", "ar"].includes(locale)) {
          const screenshot = path.join(path.dirname(reportPath), path.basename(reportPath, ".json") + "-busy-" + locale + ".png");
          await page.screenshot({ path: screenshot, fullPage: true });
        }
        release();
        await settle(page);
        const done = await state(page);
        check(label + " result restores controls", [done.title, done.disabled, done.readOnly], [done.expected.cleanTitle, false, false]);
        await page.fill("#rule", "Run `npm test`.");
        check(label + " edits clear old result", (await state(page)).empty, true);

        mode = "error";
        await page.click("#go");
        await settle(page);
        const error = await localized(page, locale, "error");
        check(label + " error restores controls", [error.disabled, error.readOnly], [false, false]);
        check(label + " error fits", error.overflow, false);
        if (layout === "mobile" && ["es", "ar"].includes(locale)) {
          const screenshot = path.join(path.dirname(reportPath), path.basename(reportPath, ".json") + "-" + label.replace("/", "-") + ".png");
          await page.screenshot({ path: screenshot, fullPage: true });
          report.scenarios.push({ label, screenshot: path.relative(root, screenshot).replaceAll("\\", "/") });
        } else report.scenarios.push({ label });

        await page.fill("#rule", "");
        check(label + " edits clear error", (await state(page)).empty, true);
        await page.click("#go");
        await localized(page, locale, "empty");
        // An empty submit must return focus to the field that needs input.
        await page.click("#go");
        check(label + " empty submit focuses rule", await page.locator("#rule").evaluate((e) => e === document.activeElement), true);

        await page.fill("#rule", "a".repeat(2001));
        const beforeLong = requests;
        await page.locator("#rule").press("Control+Enter");
        await page.waitForTimeout(100);
        const long = await state(page);
        check(label + " overlong never sent", requests, beforeLong);
        check(label + " overlong visible error", long.body, long.expected.tooLong);
        check(label + " overlong remains disabled", long.disabled, true);

        mode = "success";
        await page.fill("#rule", rule);
        await page.locator("#rule").press("Meta+Enter");
        await settle(page);
        check(label + " recovers without reload", (await state(page)).title, done.expected.cleanTitle);
        await context.close();
      }
    }

    const editedContext = await browser.newContext({ locale: "en-US" });
    const edited = await editedContext.newPage();
    edited.on("pageerror", (e) => report.pageErrors.push(e.message));
    await edited.goto(url);
    await edited.click("#mode-rule");
    mode = "hold";
    await edited.fill("#rule", "Use `const`.");
    const beforeEdit = requests;
    await edited.click("#go");
    await edited.evaluate(() => {
      document.getElementById("ask").requestSubmit();
      const input = document.getElementById("rule");
      input.value = "Use `let`.";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await edited.waitForTimeout(100);
    check("direct requestSubmit remains single-flight", requests - beforeEdit, 1);
    release();
    await settle(edited);
    const stale = await state(edited);
    check("programmatic edit discards stale response", [stale.empty, stale.rule, stale.readOnly], [true, "Use `let`.", false]);
    await editedContext.close();

    // Exercise the browser's real fetch-abort path without waiting 35 seconds.
    // Only that timer is shortened; report the observed production duration.
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    page.on("pageerror", (e) => report.pageErrors.push(e.message));
    await page.addInitScript(() => {
      const original = window.setTimeout;
      window.__deadlineMs = [];
      window.setTimeout = (fn, ms, ...args) => {
        if (ms === 35000) { window.__deadlineMs.push(ms); return original(fn, 100, ...args); }
        return original(fn, ms, ...args);
      };
    });
    await page.goto(url);
    await page.click("#mode-rule");
    await page.fill("#rule", "Use `const`.");
    for (const stalled of ["hold", "body"]) {
      mode = stalled;
      await page.click("#go");
      const hasDeadline = await page.evaluate(() => window.__deadlineMs.length > 0);
      check(stalled + " client deadline installed", hasDeadline, true);
      if (hasDeadline) {
        await settle(page);
        const timed = await state(page);
        check(stalled + " timeout recoverable and input preserved", [timed.disabled, timed.readOnly, timed.rule, timed.body], [false, false, "Use `const`.", timed.expected.timeout]);
        report.deadlineMs = await page.evaluate(() => window.__deadlineMs[0]);
      }
      release();
      await settle(page);
      if (hasDeadline) {
        const late = await state(page);
        check(stalled + " late response cannot replace timeout", late.body, late.expected.timeout);
        await page.selectOption("#ui-lang", "es");
        const translated = await state(page);
        check(stalled + " timeout translates", translated.body, translated.expected.timeout);
        await page.selectOption("#ui-lang", "en");
      }
    }
    mode = "broken";
    await page.click("#go");
    await settle(page);
    check("malformed response restores input", [(await state(page)).disabled, (await state(page)).readOnly], [false, false]);
    const broken = await state(page);
    check("malformed response has a usable message", broken.body, broken.expected.network);
    mode = "success";
    await page.click("#go");
    await settle(page);
    const recovered = await state(page);
    check("timeout and malformed response allow retry", recovered.title, recovered.expected.cleanTitle);
    await context.close();
    check("no browser exceptions", report.pageErrors, []);
  } catch (error) {
    report.fatal = { message: error.message, stack: error.stack };
  } finally {
    release();
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    report.requestCount = requests;
    report.passed = !report.fatal && report.checks.every((c) => c.passed);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failed: report.checks.filter((c) => !c.passed).map((c) => c.name), fatal: report.fatal?.message, report: reportPath }));
    if (!report.passed) process.exitCode = 1;
  }
})();
