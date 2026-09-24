"use strict";

// Optional browser integration check. Uses installed Edge and localhost only;
// /api/score is simulated here, so no provider key or paid request is needed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { createHash } = require("node:crypto");
const { chromium } = require(process.env.DISREGARD_PLAYWRIGHT_MODULE || "playwright");
const { localSite, locales, langTags, loopbackOnlyArgs } = require("./browser-assets.cjs");

const root = path.resolve(__dirname, "..");
const output = process.argv[2];
if (!output) throw new Error("Usage: node checks/request-ui.cjs <new-report.json>");
const reportPath = path.resolve(output);
if (fs.existsSync(reportPath)) throw new Error("Refusing to overwrite an existing report: " + reportPath);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const site = localSite({ "/privacy": "privacy.html" });
const report = { browser: "installed Edge", network: "localhost mocks only", checks: [], pageErrors: [], scenarios: [], screenshots: [] };
report.sourceHashes = { ...site.hashes, "checks/request-ui.cjs": createHash("sha256").update(fs.readFileSync(__filename)).digest("hex") };
const good = { status: "ok", findings: [], factors: { F3: 4 } };
let mode = "success", requests = 0, canned;
const waiting = [];
function respond(res, status = 200, body = good) {
  if (res.destroyed) return;
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/score") {
    requests++;
    if (await site.readBody(req) === null) return;
    if (mode === "hold") waiting.push(res);
    else if (mode === "body") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write("{");
      waiting.push(res);
    }
    else if (mode === "error") respond(res, 502, { code: "upstream" });
    else if (mode === "broken") { res.writeHead(502); res.end("<html>Bad gateway</html>"); }
    else if (mode === "canned") respond(res, canned.status, canned.body);
    else respond(res);
    return;
  }
  site.serve(req, res);
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
// Resolves once the server holds `count` requests with their bodies read, so request counts
// read afterwards are final and release() reaches them.
async function holding(count) {
  for (const end = Date.now() + 10000; waiting.length < count;) {
    if (Date.now() > end) throw new Error("Timed out waiting for " + count + " held requests");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function state(page) {
  return page.evaluate(() => {
    const locale = document.getElementById("ui-lang").value;
    const t = window.STRINGS[locale];
    const out = document.getElementById("out");
    return { locale, lang: document.documentElement.lang, dir: document.documentElement.dir, title: out.querySelector("strong")?.textContent,
      body: out.querySelector("p")?.textContent, busy: out.getAttribute("aria-busy"),
      disabled: document.getElementById("go").disabled, button: document.getElementById("go").textContent,
      readOnly: document.getElementById("rule").readOnly, rule: document.getElementById("rule").value,
      modes: [document.getElementById("mode-file").disabled, document.getElementById("mode-rule").disabled],
      stop: [document.getElementById("rule-cancel").hidden, document.getElementById("rule-cancel").textContent],
      focus: document.activeElement?.id || "", changes: window.__outChanges,
      empty: out.childElementCount === 0, overflow: document.documentElement.scrollWidth > innerWidth,
      expected: { busyTitle: t.busyTitle, submitBusy: t.submitBusy, submit: t.submit, emptyTitle: t.emptyTitle, stop: t.file.cancel,
        stoppedTitle: t.stoppedTitle, stoppedBody: t.stoppedBody,
        cleanTitle: t.cleanTitle, upstream: t.errors.upstream, timeout: t.errors.timeout, network: t.errors.network,
        tooLong: t.errors.too_long.replace("{max}", "2000") } };
  });
}
// Counts the batches of changes to the live region from now on.
async function watchOut(page) {
  await page.evaluate(() => {
    window.__outChanges = 0;
    new MutationObserver(() => { window.__outChanges++; })
      .observe(document.getElementById("out"), { childList: true, subtree: true, characterData: true });
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
    browser = await chromium.launch({ channel: "msedge", headless: true, args: loopbackOnlyArgs });
    report.version = browser.version();
    for (const layout of ["desktop", "mobile", "scaled"]) {
      for (const locale of locales) {
        const context = await browser.newContext({ viewport: layout === "mobile" ? { width: 375, height: 812 } : { width: 1280, height: 900 }, locale: "en-US" });
        site.watch(context, url);
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
        await page.click("#go");
        await holding(1);
        await page.locator("#rule").press(" ");
        await page.selectOption("#ui-lang", locale);
        const switched = await state(page);
        check(label + " lang tag", switched.lang, langTags[locale]);
        check(label + " locale keeps busy state", [switched.disabled, switched.title, switched.button],
          [true, switched.expected.busyTitle, switched.expected.submitBusy]);
        await page.locator("#rule").press("Control+Enter");
        await page.locator("#rule").press("Meta+Enter");
        await page.waitForTimeout(100);
        const busy = await state(page);
        check(label + " single request", requests - start, 1);
        check(label + " busy controls", [busy.busy, busy.disabled, busy.readOnly, busy.rule, busy.modes], ["true", true, true, rule, [true, true]]);
        check(label + " busy localized", [busy.title, busy.button], [busy.expected.busyTitle, busy.expected.submitBusy]);
        check(label + " busy fits", busy.overflow, false);
        check(label + " stop control shown and labelled while pending", busy.stop, [false, busy.expected.stop]);
        if (layout === "mobile" && ["es", "ar"].includes(locale)) {
          const screenshot = path.join(path.dirname(reportPath), path.basename(reportPath, ".json") + "-busy-" + locale + ".png");
          await page.screenshot({ path: screenshot, fullPage: true });
          report.screenshots.push(path.relative(root, screenshot).replaceAll("\\", "/"));
        }
        release();
        await settle(page);
        const done = await state(page);
        check(label + " result restores controls", [done.title, done.disabled, done.readOnly, done.modes], [done.expected.cleanTitle, false, false, [false, false]]);
        check(label + " stop control hidden after completion", done.stop[0], true);
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
          report.screenshots.push(path.relative(root, screenshot).replaceAll("\\", "/"));
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

        // Stop by click: the field is released and focused, and the live region changes once.
        mode = "hold";
        await page.click("#go"); await holding(1);
        await watchOut(page);
        await page.click("#rule-cancel");
        const stopped = await state(page);
        check(label + " click stop releases and focuses the field", [stopped.busy, stopped.readOnly, stopped.disabled, stopped.button, stopped.focus, stopped.stop[0]],
          ["false", false, false, stopped.expected.submit, "rule", true]);
        check(label + " click stop is announced once", [stopped.title, stopped.body, stopped.changes],
          [stopped.expected.stoppedTitle, stopped.expected.stoppedBody, 1]);
        check(label + " stopped state fits", stopped.overflow, false);
        release();
        await page.waitForTimeout(150);
        check(label + " nothing renders after stop", [(await state(page)).title, (await state(page)).changes], [stopped.expected.stoppedTitle, 1]);
        await context.close();
      }
    }

    // Keyboard stops: a fresh Enter stops and the live region changes once; a held Enter does not
    // stop; a new request succeeds. The keyboard journeys in theme-accessibility.cjs check focus
    // moving to the stop control, Tab reaching it, and Enter and Space stops in every theme and layout.
    const stopContext = await browser.newContext({ locale: "en-US" });
    site.watch(stopContext, url);
    const stopPage = await stopContext.newPage();
    stopPage.on("pageerror", (e) => report.pageErrors.push(e.message));
    await stopPage.goto(url);
    await stopPage.click("#mode-rule");
    await stopPage.fill("#rule", "Use `const`.");
    mode = "hold";
    await stopPage.locator("#go").focus();
    await stopPage.keyboard.press("Enter"); await holding(1);
    await watchOut(stopPage);
    await stopPage.keyboard.press("Enter");
    const entered = await state(stopPage);
    check("Enter on stop releases and focuses the field", [entered.busy, entered.readOnly, entered.focus, entered.title, entered.changes],
      ["false", false, "rule", entered.expected.stoppedTitle, 1]);
    release();
    await stopPage.locator("#go").focus();
    const beforeHeld = requests;
    await stopPage.keyboard.down("Enter"); await holding(1);
    await stopPage.keyboard.down("Enter");
    await stopPage.waitForTimeout(100);
    const heldEnter = await state(stopPage);
    check("held Enter does not stop the request", [heldEnter.busy, heldEnter.focus, heldEnter.title, requests - beforeHeld],
      ["true", "rule-cancel", heldEnter.expected.busyTitle, 1]);
    await stopPage.keyboard.up("Enter");
    mode = "success"; release(); await settle(stopPage);
    const resumed = await state(stopPage);
    check("a new request after stop renders and returns focus to submit", [resumed.title, resumed.focus, resumed.stop[0]],
      [resumed.expected.cleanTitle, "go", true]);
    // Single-rule results are not a file review: following the privacy-notice link never asks.
    const leaveAsked = [];
    const noteLeave = (dialog) => { leaveAsked.push(dialog.type()); return dialog.accept(); };
    stopPage.on("dialog", noteLeave);
    await Promise.all([stopPage.waitForURL("**/privacy"), stopPage.click("#promise a")]);
    stopPage.off("dialog", noteLeave);
    check("single-rule results leave without a prompt", leaveAsked, []);
    await stopContext.close();

    // A response that arrives after stop never renders, even when the fetch ignores the abort.
    const lateStopContext = await browser.newContext({ locale: "en-US" });
    site.watch(lateStopContext, url);
    await lateStopContext.addInitScript(() => {
      window.fetch = () => new Promise((resolve) => setTimeout(() => resolve(new Response(
        JSON.stringify({ status: "ok", findings: [], factors: { F3: 4 } }), { status: 200, headers: { "Content-Type": "application/json" } })), 300));
    });
    const latePage = await lateStopContext.newPage();
    latePage.on("pageerror", (e) => report.pageErrors.push(e.message));
    await latePage.goto(url);
    await latePage.click("#mode-rule");
    await latePage.fill("#rule", "Use `const`.");
    await latePage.click("#go");
    await watchOut(latePage);
    await latePage.click("#rule-cancel");
    await latePage.waitForTimeout(600);
    const ignored = await state(latePage);
    check("late response after stop never renders", [ignored.title, ignored.changes, ignored.busy], [ignored.expected.stoppedTitle, 1, "false"]);
    await lateStopContext.close();

    const editedContext = await browser.newContext({ locale: "en-US" });
    site.watch(editedContext, url);
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
    await holding(1); await edited.waitForTimeout(100);
    check("direct requestSubmit remains single-flight", requests - beforeEdit, 1);
    release();
    await settle(edited);
    const stale = await state(edited);
    check("programmatic edit discards stale response", [stale.empty, stale.rule, stale.readOnly], [true, "Use `let`.", false]);
    await editedContext.close();

    // Exercise the browser's real fetch-abort path without waiting 35 seconds.
    // Only that timer is shortened; report the observed production duration.
    const context = await browser.newContext({ locale: "en-US" });
    site.watch(context, url);
    const page = await context.newPage();
    page.on("pageerror", (e) => report.pageErrors.push(e.message));
    await page.addInitScript(() => {
      const original = window.setTimeout;
      window.__deadlineMs = [];
      window.setTimeout = (fn, ms, ...args) => {
        if (ms === 35000) { window.__deadlineMs.push(ms); return original(fn, window.__fullDeadline ? ms : 100, ...args); }
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
    // The malformed and retry responses get the real deadline, so they settle on the response
    // they assert rather than race the shortened timer.
    await page.evaluate(() => { window.__fullDeadline = true; });
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

    // A stored language naming an inherited property is ignored like any unknown
    // value, and start-up leaves it in storage.
    for (const inherited of ["constructor", "toString", "__proto__"]) {
      const poisonedContext = await browser.newContext({ locale: "en-US" });
      site.watch(poisonedContext, url);
      const poisoned = await poisonedContext.newPage();
      const errors = [];
      poisoned.on("pageerror", (e) => { errors.push(e.message); report.pageErrors.push(e.message); });
      await poisoned.addInitScript((value) => {
        try { localStorage.setItem("disregard.lang", value); } catch { /* no storage before the page loads */ }
      }, inherited);
      await poisoned.goto(url);
      const shown = await poisoned.evaluate(() => {
        const en = window.STRINGS.en, picker = document.getElementById("ui-lang");
        return { lang: document.documentElement.lang, stored: localStorage.getItem("disregard.lang"), picker: [picker.value, picker.options.length],
          english: document.title === en.title && [...document.querySelectorAll("[data-i18n]")].every((node) => node.textContent === en[node.dataset.i18n]) };
      });
      check("stored " + inherited + " is ignored and English renders", [shown.lang, shown.english, shown.stored], ["en", true, inherited]);
      check("stored " + inherited + " keeps the picker populated", shown.picker, ["en", 6]);
      check("stored " + inherited + " raises no page error", errors, []);
      await poisonedContext.close();
    }

    // Browser languages choose the interface language without storing it; an
    // explicit pick is stored and wins over them after a reload.
    for (const [languages, detected] of [[["es-MX", "en"], "es"], [["zh-CN"], "zh"], [["fr-FR", "en"], "fr"], [["de-DE", "en"], "en"]]) {
      const detectContext = await browser.newContext({ locale: "en-US" });
      site.watch(detectContext, url);
      const detect = await detectContext.newPage();
      const errors = [];
      detect.on("pageerror", (e) => { errors.push(e.message); report.pageErrors.push(e.message); });
      await detect.addInitScript((list) => Object.defineProperty(navigator, "languages", { get: () => list }), languages);
      await detect.goto(url);
      const shown = () => detect.evaluate(() => {
        const locale = document.getElementById("ui-lang").value, t = window.STRINGS[locale];
        return { locale, lang: document.documentElement.lang, stored: localStorage.getItem("disregard.lang"),
          translated: document.title === t.title && [...document.querySelectorAll("[data-i18n]")].every((node) => node.textContent === t[node.dataset.i18n]) };
      });
      const label = "browser languages " + languages.join(" ");
      check(label + " choose " + detected + " without storing it", await shown(), { locale: detected, lang: langTags[detected], stored: null, translated: true });
      await detect.selectOption("#ui-lang", "ar");
      check(label + " store an explicit pick", await shown(), { locale: "ar", lang: langTags.ar, stored: "ar", translated: true });
      await detect.reload();
      check(label + " restore the pick after reload", await shown(), { locale: "ar", lang: langTags.ar, stored: "ar", translated: true });
      check(label + " raise no page error", errors, []);
      await detectContext.close();
    }

    // Traditional Chinese tags, and a bare zh listed after one, skip the Simplified
    // strings and detection moves down the list; a stored pick still wins.
    for (const [languages, detected, saved = null] of [
      [["zh-TW", "en", "en-GB", "en-US"], "en"], [["zh-HK"], "en"], [["zh-MO"], "en"], [["zh-Hant"], "en"],
      [["zh-Hant-HK"], "en"], [["zh-Hant-TW"], "en"], [["zh-TW", "zh", "en"], "en"], [["zh-TW", "zh-CN"], "zh"],
      [["zh-CN"], "zh"], [["zh-SG"], "zh"], [["zh-Hans"], "zh"], [["zh-Hans-HK"], "zh"], [["zh"], "zh"],
      [["en-US", "zh-TW"], "en"], [["zh-TW", "fr-FR"], "fr"], [["zh-TW", "en"], "zh", "zh"],
    ]) {
      const chineseContext = await browser.newContext({ locale: "en-US" });
      site.watch(chineseContext, url);
      const chinese = await chineseContext.newPage();
      chinese.on("pageerror", (e) => report.pageErrors.push(e.message));
      await chinese.addInitScript(([list, value]) => {
        Object.defineProperty(navigator, "languages", { get: () => list });
        if (value) try { localStorage.setItem("disregard.lang", value); } catch { /* no storage before the page loads */ }
      }, [languages, saved]);
      await chinese.goto(url);
      const shown = await chinese.evaluate(() => ({ locale: document.getElementById("ui-lang").value,
        lang: document.documentElement.lang, stored: localStorage.getItem("disregard.lang") }));
      check("browser languages " + languages.join(" ") + (saved ? " with stored " + saved : "") + " choose " + detected + " and store nothing new",
        shown, { locale: detected, lang: langTags[detected], stored: saved });
      await chineseContext.close();
    }

    // Server keys naming inherited properties take the same fallbacks as unknown keys.
    const keyContext = await browser.newContext({ locale: "en-US" });
    site.watch(keyContext, url);
    const keyPage = await keyContext.newPage();
    const keyErrors = [];
    keyPage.on("pageerror", (e) => { keyErrors.push(e.message); report.pageErrors.push(e.message); });
    await keyPage.goto(url);
    await keyPage.click("#mode-rule");
    await keyPage.fill("#rule", "Use `const`.");
    const inheritedKeys = [];
    for (const [status, body] of [
      [200, { status: "ok", findings: [{ id: "constructor" }, { id: "__proto__" }, { id: "toString" }],
        factors: { rule_role: { choice: "constructor", confidence: 0.9 }, primitive: { choice: "toString", confidence: 0.8 } } }],
      [200, { status: "not_english", language: { code: "__proto__", name: "Klingon" }, findings: [] }],
      [502, { code: "constructor" }],
    ]) {
      mode = "canned"; canned = { status, body };
      await keyPage.click("#go");
      await settle(keyPage);
      inheritedKeys.push(await keyPage.evaluate(() => {
        const t = window.STRINGS.en, out = document.getElementById("out");
        const value = (label) => [...out.querySelectorAll("dt")].find((dt) => dt.textContent === label)?.nextElementSibling?.textContent;
        return { cards: out.querySelectorAll("li.finding").length, role: value(t.factors.rule_role), primitive: value(t.factors.primitive),
          banner: out.querySelector(".banner p")?.textContent, expected: { role: "constructor (confidence 0.9)",
            primitive: "toString (confidence 0.8)", language: "This looks like Klingon. Scoring is evaluated on English rules, so this text was not scored. Check the language or translate the rule, then try again.",
            error: t.errors.failed.replace("{max}", "2000") } };
      }));
    }
    const [keyResult, keyLanguage, keyError] = inheritedKeys;
    check("inherited finding ids render no card", keyResult.cards, 0);
    check("inherited rule role shows the raw choice", keyResult.role, keyResult.expected.role);
    check("inherited primitive shows the raw choice", keyResult.primitive, keyResult.expected.primitive);
    check("inherited language code falls back to the name", keyLanguage.banner, keyLanguage.expected.language);
    check("inherited error code shows the generic failure", keyError.banner, keyError.expected.error);
    check("inherited server keys raise no page error", keyErrors, []);
    await keyContext.close();

    // /review-ui.js fails to load: in every locale the strings render, a single-rule analysis runs
    // with the numbers the loaded page shows and holds the mode switch as it does, and the prompt
    // area says the prompt is unavailable.
    const scored = { status: "ok", findings: [{ id: "hedge_dominance", factor: "F1", value: 0.2, verb: "try to" }],
      factors: { F1: 0.2, F2: 0.85, F3: 2, F7: 0.8, F8: 2, is_rule: 0.95,
        primitive: { choice: "rule", confidence: 0.9 }, rule_role: { choice: "direct_action", confidence: 0.9 } } };
    const shownRule = async (blocked, locale) => {
      const reviewContext = await browser.newContext({ locale: "en-US" });
      site.watch(reviewContext, url);
      if (blocked) await reviewContext.route("**/review-ui.js", (route) => route.abort());
      const reviewPage = await reviewContext.newPage();
      const errors = [];
      reviewPage.on("pageerror", (e) => { errors.push(e.message); report.pageErrors.push(e.message); });
      await reviewPage.goto(url);
      await reviewPage.selectOption("#ui-lang", locale);
      const strings = await reviewPage.evaluate(() => {
        const t = window.STRINGS[document.getElementById("ui-lang").value];
        return document.title === t.title && [...document.querySelectorAll("[data-i18n]")].every((node) => node.textContent === t[node.dataset.i18n]) &&
          document.getElementById("mode-rule").textContent === t.file.ruleMode;
      });
      await reviewPage.click("#mode-rule");
      await reviewPage.fill("#rule", "Always try to use functional components.");
      mode = "hold";
      const before = requests;
      await reviewPage.click("#go");
      await holding(1);
      const modes = () => reviewPage.evaluate(() => ["mode-file", "mode-rule"].map((id) => document.getElementById(id).disabled));
      const busyModes = await modes();
      respond(waiting.shift(), 200, scored);
      await settle(reviewPage);
      const doneModes = await modes();
      const shown = await reviewPage.evaluate(() => {
        const out = document.getElementById("out");
        return { counter: document.getElementById("rule-count").textContent, finding: out.querySelector("li.finding h2")?.textContent,
          values: [...out.querySelectorAll("dd")].map((dd) => dd.textContent), labels: [...out.querySelectorAll("dt")].map((dt) => dt.textContent),
          prompt: out.querySelector(".prompt-panel")?.textContent, copy: out.querySelectorAll(".copy-prompt").length,
          expected: window.STRINGS[document.getElementById("ui-lang").value].file.unavailable };
      });
      await reviewContext.close();
      return { strings, requests: requests - before, errors, modes: [busyModes, doneModes], ...shown };
    };
    for (const locale of locales) {
      const loaded = await shownRule(false, locale), blocked = await shownRule(true, locale);
      check(locale + " blocked review-ui.js renders every string", blocked.strings, true);
      check(locale + " blocked review-ui.js runs a single-rule analysis", [blocked.requests, blocked.finding], [1, loaded.finding]);
      check(locale + " blocked review-ui.js holds the mode switch while the rule runs", [blocked.modes, loaded.modes], [[[true, true], [false, false]], [[true, true], [false, false]]]);
      check(locale + " blocked review-ui.js formats numbers as the loaded page does",
        [blocked.counter, blocked.labels, blocked.values], [loaded.counter, loaded.labels, loaded.values]);
      check(locale + " blocked review-ui.js says the prompt is unavailable", [blocked.prompt, blocked.copy], [blocked.expected, 0]);
      check(locale + " blocked review-ui.js raises no page error", blocked.errors, []);
    }
    mode = "success";
    check("no browser exceptions", report.pageErrors, []);
  } catch (error) {
    report.fatal = { message: error.message, stack: error.stack };
  } finally {
    release();
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    report.requestCount = requests; Object.assign(report, site.audit());
    report.passed = !report.fatal && report.checks.every((c) => c.passed) && report.networkClean;
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failed: report.checks.filter((c) => !c.passed).map((c) => c.name),
      providerRequests: report.providerRequests, unknownRequests: report.unknownRequests, fatal: report.fatal?.message, report: reportPath }));
    if (!report.passed) process.exitCode = 1;
  }
})();
