"use strict";

// Bounded rendered contrast and keyboard checks, not a WCAG certification.
// Uses installed Edge, local assets and fake scoring responses only.
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), crypto = require("node:crypto");
const { chromium } = require(process.env.DISREGARD_PLAYWRIGHT_MODULE || "playwright");
const { localSite, loopbackOnlyArgs } = require("./browser-assets.cjs");
const root = path.resolve(__dirname, ".."), output = process.argv[2];
if (!output || process.argv.length !== 3) throw new Error("Usage: node checks/theme-accessibility.cjs <new-report.json>");
const target = path.resolve(output);
if (fs.existsSync(target)) throw new Error("Refusing to overwrite an existing report");
fs.mkdirSync(path.dirname(target), { recursive: true });
const site = localSite({ "/research": "research.html", "/privacy": "privacy.html", "/terms": "terms.html" });
const result = { status: "ok", findings: [], factors: { F1: 0.85, F2: 0.85, F3: 2, F7: 0.8, F8: 2, is_rule: 0.9,
  rule_role: { choice: "direct_action", confidence: 0.9 }, primitive: { choice: "rule", confidence: 0.9 } } };
// Scored file rows: one with a finding, one that reads as background (not_a_rule) and one with none.
const hedged = { ...result, findings: [{ id: "hedge_dominance", factor: "F1", value: 0.2, verb: "try to" }], factors: { ...result.factors, F1: 0.2 } };
const background = { ...result, findings: [{ id: "not_a_rule", factor: "is_rule", value: 0.3 }], factors: { ...result.factors, is_rule: 0.3 } };
const fileDoc = "- Try to keep functions short.\n- The build cache is stored in `.cache/`, which CI clears nightly.\n- Never log passwords.";
const report = { browser: "installed Edge", sourceHashes: { ...site.hashes },
  pages: [], filePages: [], keyboard: [], pageErrors: [], screenshots: [] };
report.sourceHashes["checks/theme-accessibility.cjs"] = crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex");
report.keyboardScope = "Synthesized Edge keydown/keyup events, including repeat=true after the first response settles; loopback responses only. Not physical-keyboard, IME or screen-reader acceptance.";
let mode = "ok", requests = 0;
const waiting = [];
function reply(res, rule = "") {
  if (res.destroyed) return;
  res.writeHead(mode === "error" ? 502 : 200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(mode === "error" ? { code: "upstream" } : rule.startsWith("Try to") ? hedged : rule.startsWith("The build cache") ? background : result));
}
function release() { while (waiting.length) reply(waiting.shift()); }
// Resolves once the server holds `count` requests with their bodies read, so a stop cannot
// abort one in transit and request counts read afterwards are final.
async function holding(count) {
  for (const end = Date.now() + 10000; waiting.length < count;) {
    if (Date.now() > end) throw new Error("Timed out waiting for " + count + " held requests");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/score") {
    requests++;
    const raw = await site.readBody(req);
    if (raw === null) return;
    if (mode === "hold") waiting.push(res); else reply(res, JSON.parse(raw).rule);
    return;
  }
  site.serve(req, res);
});
async function colors(page) {
  return page.evaluate(() => {
    const rgba = (s) => {
      const m = s.match(/^rgba?\(([^)]+)\)$/);
      if (!m) throw new Error("Unsupported computed color: " + s);
      const a = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1];
    };
    const over = (a, b) => a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3]));
    const bg = (node) => {
      const chain = []; for (let n = node; n; n = n.parentElement) chain.unshift(n);
      let c = [255, 255, 255];
      for (const n of chain) c = over(rgba(getComputedStyle(n).backgroundColor), c);
      return c;
    };
    const luminance = (c) => c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
      .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    const text = [];
    for (const node of document.querySelectorAll("h1,h2,p,label,button,select,textarea,a,summary,dt,dd,.count,.unit-state,.unit-headline")) {
      if (node.hidden || !node.getClientRects().length || node.disabled) continue;
      const style = getComputedStyle(node), background = bg(node), foreground = over(rgba(style.color), background);
      const minimum = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.6667 && parseInt(style.fontWeight) >= 700) ? 3 : 4.5;
      const contrast = ratio(foreground, background);
      text.push({ tag: node.tagName, id: node.id, text: (node.textContent || node.getAttribute("placeholder") || "").trim().slice(0, 80),
        color: style.color, background, contrast, minimum, passed: contrast >= minimum });
    }
    const input = document.getElementById("rule");
    let placeholder = null, boundary = null;
    if (input) {
      const style = getComputedStyle(input), pseudo = getComputedStyle(input, "::placeholder"), background = bg(input);
      const color = rgba(pseudo.color); color[3] *= Number(pseudo.opacity);
      const contrast = ratio(over(color, background), background);
      placeholder = { color: pseudo.color, opacity: pseudo.opacity, background, contrast, minimum: 4.5, passed: contrast >= 4.5 };
      const outside = bg(input.parentElement), border = rgba(style.borderColor);
      const borderContrast = ratio(over(border, outside), outside), fillContrast = ratio(background, outside);
      boundary = { color: style.borderColor, outside, borderContrast, fillContrast, minimum: 3, passed: Math.max(borderContrast, fillContrast) >= 3 };
    }
    const active = document.activeElement;
    let focus = null;
    if (active && active !== document.body) {
      const s = getComputedStyle(active), outline = rgba(s.outlineColor), outside = bg(active.parentElement), contrast = ratio(over(outline, outside), outside);
      const r = active.getBoundingClientRect(), x = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2)), y = Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2));
      const at = document.elementFromPoint(x, y);
      focus = { id: active.id, tag: active.tagName, visible: active.matches(":focus-visible") && s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0,
        contrast, unobscured: !!at && (at === active || active.contains(at)), passed: contrast >= 3 && active.matches(":focus-visible") && s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 };
    }
    return { colorScheme: getComputedStyle(document.documentElement).colorScheme, text, placeholder, boundary, focus,
      overflow: document.documentElement.scrollWidth > innerWidth };
  });
}
const activeId = (page) => page.evaluate(() => document.activeElement?.id || "");
const settled = (page) => page.waitForFunction(() => document.getElementById("out").getAttribute("aria-busy") === "false");
async function submit(page, key) {
  const response = page.waitForResponse("**/api/score");
  await page.keyboard.press(key); await response; await settled(page);
}
async function keyboard(page, theme, layout, locale) {
  const checks = [], focus = [], heldEnter = [];
  const check = (name, passed) => checks.push({ name, passed: Boolean(passed) });
  const names = await page.evaluate(() => ({ input: document.querySelector('label[for="rule"]').textContent, picker: document.querySelector('label[for="ui-lang"]').textContent }));
  check("textbox has visible programmatic label", await page.getByRole("textbox", { name: names.input, exact: true }).count() === 1);
  check("picker has visible programmatic label", await page.getByRole("combobox", { name: names.picker, exact: true }).count() === 1);
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  for (const id of ["ui-lang", "mode-file", "mode-rule", "rule", "go"]) {
    await page.keyboard.press("Tab"); check("tab reaches " + id, await activeId(page) === id);
    const f = (await colors(page)).focus; focus.push(f); check(id + " visible unobscured focus", f?.passed && f.unobscured);
  }
  await page.keyboard.press("Enter");
  check("empty submit focuses the field", await activeId(page) === "rule");
  check("feedback is a polite live region", await page.locator("#out").getAttribute("aria-live") === "polite");
  await page.keyboard.insertText("Use `const`."); await page.keyboard.press("Tab");
  mode = "error"; await submit(page, "Enter");
  check("error restores submit focus", await activeId(page) === "go");
  check("error preserves text and releases input", await page.inputValue("#rule") === "Use `const`." && !(await page.locator("#rule").evaluate((e) => e.readOnly)));
  // Continue the remaining checks after a failed focus assertion.
  if (await activeId(page) !== "go") await page.locator("#go").focus();
  mode = "ok"; await submit(page, "Space");
  check("success restores submit focus", await activeId(page) === "go");
  if (await activeId(page) !== "go") await page.locator("#go").focus();
  await page.keyboard.press("Tab");
  check("tab reaches privacy explanation", await page.evaluate(() => document.activeElement.matches("#rule-consent a")));
  await page.keyboard.press("Tab");
  check("tab reaches result disclosure", await page.evaluate(() => document.activeElement.matches("#out > details > summary")));
  const disclosureFocus = (await colors(page)).focus; focus.push(disclosureFocus);
  check("disclosure has visible focus", disclosureFocus?.passed && disclosureFocus.unobscured);
  await page.keyboard.press("Enter"); check("Enter expands results", await page.locator("#out > details").evaluate((e) => e.open));
  await page.keyboard.press("Space"); check("Space collapses results", !(await page.locator("#out > details").evaluate((e) => e.open)));
  await page.keyboard.press("Tab");
  check("tab reaches copy prompt", await page.evaluate(() => document.activeElement.matches("#out .copy-prompt")));
  await page.keyboard.press("Tab");
  check("tab reaches prompt preview", await page.evaluate(() => document.activeElement.matches("#out .prompt-preview > summary")));

  await page.evaluate(() => {
    window.__heldEnterEvents = [];
    document.addEventListener("keydown", (event) => {
      if (event.key === "Enter") window.__heldEnterEvents.push({ target: event.target.id, repeat: event.repeat,
        control: event.ctrlKey, meta: event.metaKey, composing: event.isComposing });
    }, true);
  });
  for (const [target, modifier] of [["go", null], ["rule", "Control"], ["rule", "Meta"]]) {
    const name = modifier ? modifier + "+Enter in textbox" : "Enter on submit";
    await page.locator("#" + target).focus(); mode = "ok";
    await page.evaluate(() => { window.__heldEnterEvents = []; });
    const start = requests;
    if (modifier) await page.keyboard.down(modifier);
    try {
      const first = page.waitForResponse("**/api/score");
      await page.keyboard.down("Enter"); await first; await settled(page);
      const firstRequests = requests - start;
      check(name + " first physical press submits once", firstRequests === 1);
      await page.keyboard.down("Enter");
      await page.waitForTimeout(150); await settled(page);
      const repeatRequests = requests - start - firstRequests;
      check(name + " held repeat after completion sends nothing", repeatRequests === 0);
      await page.keyboard.up("Enter");
      const retryStart = requests, retry = page.waitForResponse("**/api/score");
      await page.keyboard.down("Enter"); await retry; await settled(page); await page.keyboard.up("Enter");
      const retryRequests = requests - retryStart;
      check(name + " new physical press still permits retry", retryRequests === 1);
      const events = await page.evaluate(() => window.__heldEnterEvents);
      check(name + " exercised native repeat flag", events.length === 3 && !events[0].repeat && events[1].repeat && !events[2].repeat);
      heldEnter.push({ target, modifier, firstRequests, repeatRequests, retryRequests, events });
    } finally {
      await page.keyboard.up("Enter");
      if (modifier) await page.keyboard.up(modifier);
    }
  }
  await page.locator("#rule").focus();
  const beforeComposition = requests;
  const compositionDefaultPreserved = await page.evaluate(() => {
    const event = new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, isComposing: true, repeat: true, bubbles: true, cancelable: true });
    document.getElementById("rule").dispatchEvent(event);
    return !event.defaultPrevented;
  });
  await page.waitForTimeout(100);
  check("composing shortcut neither submits nor cancels composition", requests === beforeComposition && compositionDefaultPreserved);

  await page.locator("#go").focus(); mode = "hold";
  const received = page.waitForRequest("**/api/score"); await page.keyboard.press("Enter"); await received;
  for (let i = 0; i < 6 && await activeId(page) !== "ui-lang"; i++) await page.keyboard.press("Shift+Tab");
  check("can navigate away while pending", await activeId(page) === "ui-lang");
  mode = "ok"; release(); await settled(page);
  check("completion does not steal moved focus", await activeId(page) === "ui-lang");
  await page.locator("#go").focus(); mode = "hold";
  const nextRequest = page.waitForRequest("**/api/score"); await page.keyboard.press("Enter"); await nextRequest;
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  mode = "ok"; release(); await settled(page);
  check("completion respects a deliberate blank-page click", await page.evaluate(() => document.activeElement === document.body));

  // Stop controls reached by keyboard while a mocked request is held, activated with Enter in one
  // journey and Space in another, in each mode. Escape is deliberately unbound and leaves the analysis running.
  const ruleState = () => page.evaluate(() => {
    const t = window.STRINGS[document.getElementById("ui-lang").value], out = document.getElementById("out"), stop = document.getElementById("rule-cancel");
    return { busy: out.getAttribute("aria-busy"), title: out.querySelector(".banner strong")?.textContent, body: out.querySelector(".banner p")?.textContent,
      stop: stop.textContent, hidden: stop.hidden, readOnly: document.getElementById("rule").readOnly, rule: document.getElementById("rule").value,
      t: { busyBody: t.busyBody, stoppedTitle: t.stoppedTitle, stoppedBody: t.stoppedBody } };
  });
  const ruleText = await page.inputValue("#rule");
  const ruleStopped = async (name, before) => {
    const s = await ruleState();
    check(name + " renders the stopped state", s.busy === "false" && s.hidden && !s.readOnly && s.rule === ruleText &&
      s.title === s.t.stoppedTitle && s.body === s.t.stoppedBody && requests === before);
    check(name + " focuses the field", await activeId(page) === "rule");
  };
  await page.locator("#go").focus(); mode = "hold"; await page.keyboard.press("Enter"); await holding(1);
  check("Enter on submit moves focus to rule stop", await activeId(page) === "rule-cancel");
  const ruleStopFocus = (await colors(page)).focus; focus.push(ruleStopFocus);
  check("rule stop has visible unobscured focus", ruleStopFocus?.passed && ruleStopFocus.unobscured);
  const busy = await ruleState();
  check("busy text names the rule stop control", busy.body === busy.t.busyBody && busy.body.includes(busy.stop));
  await page.keyboard.press("Escape"); await page.waitForTimeout(100);
  check("Escape leaves the rule analysis running", (await ruleState()).busy === "true" && await activeId(page) === "rule-cancel");
  if (await activeId(page) !== "rule-cancel") await page.locator("#rule-cancel").focus();
  let before = requests; await page.keyboard.press("Enter"); await ruleStopped("Enter on rule stop", before);
  mode = "ok"; release();
  await page.locator("#rule").focus(); mode = "hold"; await page.keyboard.press("Control+Enter"); await holding(1);
  await page.keyboard.press("Tab");
  check("tab from the pending field reaches rule stop", await activeId(page) === "rule-cancel");
  if (await activeId(page) !== "rule-cancel") await page.locator("#rule-cancel").focus();
  before = requests; await page.keyboard.press("Space"); await ruleStopped("Space on rule stop", before);
  mode = "ok"; release();

  const fileState = () => page.evaluate(() => ({ hidden: document.getElementById("file-cancel").hidden,
    progress: document.getElementById("file-progress").textContent, stopped: window.STRINGS[document.getElementById("ui-lang").value].file.stopped,
    states: [...document.querySelectorAll(".instruction-unit")].map((unit) => unit.dataset.state).join() }));
  // After the reader's Stop, the report heading holds focus: the status line announces the stop once,
  // a second press of the same key sends nothing, and the retry control is the next Tab stop.
  const fileStopped = async (name, before, key) => {
    await page.waitForFunction(() => document.getElementById("file-cancel").hidden);
    const s = await fileState();
    check(name + " renders the stopped state", s.progress === s.stopped && s.states === "cancelled,cancelled,cancelled" && requests === before);
    check(name + " moves focus to the report heading", await page.evaluate(() => document.activeElement === document.querySelector("#file-report h2")));
    const headingFocus = (await colors(page)).focus; focus.push(headingFocus);
    check(name + " heading has visible unobscured focus", headingFocus?.passed && headingFocus.unobscured);
    await page.keyboard.press(key); await page.waitForTimeout(300);
    const again = await fileState();
    check(name + " second " + key + " sends nothing", again.hidden && again.states === "cancelled,cancelled,cancelled" && requests === before);
    // Stop a run the second press started, so the remaining checks still run.
    if (!again.hidden) { await page.locator("#file-cancel").click(); await page.waitForFunction(() => document.getElementById("file-cancel").hidden); }
    check(name + " announces the stop once", await page.evaluate(() => window.__stopAnnouncements) === 1);
    await page.keyboard.press("Tab");
    check(name + " retry control is the next Tab stop", await activeId(page) === "file-start");
    if (await activeId(page) !== "file-start") await page.locator("#file-start").focus();
  };
  // Counts the times the status line changes to the stop message after each reset.
  const watchStops = () => page.evaluate(() => {
    window.__stopAnnouncements = 0;
    if (window.__stopObserver) return;
    const progress = document.getElementById("file-progress");
    window.__stopObserver = new MutationObserver(() => {
      if (progress.textContent === window.STRINGS[document.getElementById("ui-lang").value].file.stopped) window.__stopAnnouncements++;
    });
    window.__stopObserver.observe(progress, { childList: true, characterData: true, subtree: true });
  });
  await page.locator("#mode-file").focus(); await page.keyboard.press("Enter");
  check("Enter switches to file mode", await page.locator("#file-panel").isVisible());
  await page.fill("#file-source", ["module0", "module1", "module2"].map((name) => "- Use " + name + " for storage.").join("\n"));
  // From the text box, Tab reaches the file chooser, the path-rules option, then the primary action.
  await page.locator("#file-source").focus();
  for (const id of ["file-choose", "file-path-rules", "file-create"]) {
    await page.keyboard.press("Tab"); check("tab reaches " + id, await activeId(page) === id);
    const f = (await colors(page)).focus; focus.push(f); check(id + " visible unobscured focus", f?.passed && f.unobscured);
  }
  if (await activeId(page) !== "file-create") await page.locator("#file-create").focus();
  mode = "hold"; await page.keyboard.press("Enter"); await holding(2);
  check("Enter on the primary action moves focus to file stop", await activeId(page) === "file-cancel");
  const fileStopFocus = (await colors(page)).focus; focus.push(fileStopFocus);
  check("file stop has visible unobscured focus", fileStopFocus?.passed && fileStopFocus.unobscured);
  await page.keyboard.press("Escape"); await page.waitForTimeout(100);
  check("Escape leaves the file analysis running", !(await fileState()).hidden && await activeId(page) === "file-cancel");
  if (await activeId(page) !== "file-cancel") await page.locator("#file-cancel").focus();
  await watchStops(); before = requests; await page.keyboard.press("Enter"); await fileStopped("Enter on file stop", before, "Enter");
  mode = "ok"; release();
  mode = "hold"; await page.keyboard.press("Space"); await holding(2);
  await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
  check("tab reaches file stop while pending", await activeId(page) === "file-cancel");
  if (await activeId(page) !== "file-cancel") await page.locator("#file-cancel").focus();
  await watchStops(); before = requests; await page.keyboard.press("Space"); await fileStopped("Space on file stop", before, "Space");
  mode = "ok"; release();
  return { theme, layout, locale, checks, focus, heldEnter, passed: checks.every((c) => c.passed) };
}
(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({ channel: "msedge", headless: true, args: loopbackOnlyArgs }); report.version = browser.version();
    for (const theme of ["light", "dark"]) for (const layout of ["desktop", "mobile", "scaled"]) {
      for (const [route, locale] of [["/", "en"], ["/", "ar"], ["/research", "en"], ["/privacy", "en"], ["/terms", "en"]]) {
        const context = await browser.newContext({ locale: "en-US", colorScheme: theme, viewport: layout === "mobile" ? { width: 375, height: 812 } : { width: 1280, height: 900 } });
        site.watch(context, url);
        const page = await context.newPage(); page.on("pageerror", (e) => report.pageErrors.push(e.message));
        await page.goto(url + route);
        if (layout === "scaled") await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
        if (route === "/") await page.selectOption("#ui-lang", locale);
        if (route === "/") {
          const fileMeasured = await colors(page);
          report.filePages.push({ theme, layout, locale, ...fileMeasured,
            passed: fileMeasured.text.every(c => c.passed) && !fileMeasured.overflow });
          if (theme === "dark" && layout === "desktop" && locale === "en") {
            const screenshot = target.replace(/\.json$/, "-dark-file.png");
            await page.screenshot({ path: screenshot, fullPage: true }); report.screenshots.push(path.relative(root, screenshot).replaceAll("\\", "/"));
          }
          // The drop state a dragged file shows on the intake area.
          await page.fill("#file-source", fileDoc);
          const transfer = await page.evaluateHandle(() => {
            const data = new DataTransfer(); data.items.add(new File(["- Keep functions short."], "CLAUDE.md", { type: "text/markdown" })); return data;
          });
          await page.dispatchEvent("#file-drop", "dragenter", { dataTransfer: transfer });
          const dropMeasured = await colors(page);
          report.filePages.push({ theme, layout, locale, view: "drop state", ...dropMeasured,
            passed: dropMeasured.text.every((c) => c.passed) && dropMeasured.text.some((c) => c.text === (locale === "en" ? "Drop the file to read it." : "أفلِت الملف لقراءته.")) && !dropMeasured.overflow });
          await page.dispatchEvent("#file-drop", "dragleave", {});
          // Scored rows, opened from the result's details: three state labels and the one finding headline shown while collapsed.
          await page.click("#file-create");
          await page.waitForFunction(() => document.getElementById("file-cancel").hidden);
          await page.click("#file-details > summary");
          const rowsMeasured = await colors(page);
          report.filePages.push({ theme, layout, locale, view: "scored rows", ...rowsMeasured,
            passed: rowsMeasured.text.every((c) => c.passed) && rowsMeasured.text.filter((c) => c.tag === "SPAN" && !c.id).length === 4 && !rowsMeasured.overflow });
          if (layout === "desktop" && locale === "en") {
            const screenshot = target.replace(/\.json$/, "-" + theme + "-file-rows.png");
            await page.screenshot({ path: screenshot, fullPage: true }); report.screenshots.push(path.relative(root, screenshot).replaceAll("\\", "/"));
          }
          await page.click("#mode-rule");
        }
        const measured = await colors(page);
        report.pages.push({ theme, layout, route, locale, ...measured, passed: measured.text.every((c) => c.passed) &&
          (!measured.placeholder || measured.placeholder.passed) && (!measured.boundary || measured.boundary.passed) && !measured.overflow });
        if (layout === "desktop" && locale === "en" && ["/", "/research"].includes(route)) {
          const screenshot = path.join(path.dirname(target), path.basename(target, ".json") + "-" + theme + "-" + (route === "/" ? "home" : "research") + ".png");
          await page.screenshot({ path: screenshot, fullPage: true }); report.screenshots.push(path.relative(root, screenshot).replaceAll("\\", "/"));
        }
        if (route === "/") report.keyboard.push(await keyboard(page, theme, layout, locale));
        await context.close();
      }
    }
  } catch (error) { report.fatal = error.stack || error.message; }
  finally {
    release(); if (browser) await browser.close();
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    report.mockRequests = requests; Object.assign(report, site.audit());
    report.passed = !report.fatal && !report.pageErrors.length && report.pages.length === 30 && report.pages.every((p) => p.passed) && report.filePages.length === 36 && report.filePages.every(p => p.passed) && report.keyboard.every((k) => k.passed) && report.networkClean;
    fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ passed: report.passed, pages: report.pages.length, keyboardJourneys: report.keyboard.length, mockRequests: requests,
      providerRequests: report.providerRequests, unknownRequests: report.unknownRequests,
      failingPages: report.pages.filter((p) => !p.passed).map((p) => ({ theme: p.theme, layout: p.layout, route: p.route, locale: p.locale,
        text: p.text.filter((t) => !t.passed), placeholder: p.placeholder, boundary: p.boundary })),
      failingKeyboard: report.keyboard.filter((k) => !k.passed).map((k) => ({ theme: k.theme, layout: k.layout, locale: k.locale, checks: k.checks.filter((c) => !c.passed) })), fatal: report.fatal }));
    if (!report.passed) process.exitCode = 1;
  }
})();
