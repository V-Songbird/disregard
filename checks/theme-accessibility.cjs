"use strict";

// Bounded rendered contrast and keyboard checks, not a WCAG certification.
// Uses installed Edge, local assets and fake scoring responses only.
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), crypto = require("node:crypto");
const { chromium } = require(process.env.DISREGARD_PLAYWRIGHT_MODULE || "playwright");
const reviewAssets = require("./browser-assets.cjs");
const root = path.resolve(__dirname, ".."), output = process.argv[2];
if (!output || process.argv.length !== 3) throw new Error("Usage: node checks/theme-accessibility.cjs <new-report.json>");
const target = path.resolve(output);
if (fs.existsSync(target)) throw new Error("Refusing to overwrite an existing report");
fs.mkdirSync(path.dirname(target), { recursive: true });
const files = { "/": "index.html", "/research": "research.html", "/privacy": "privacy.html", "/terms": "terms.html", "/style.css": "style.css", "/i18n.js": "i18n.js" };
for (const asset of reviewAssets) files["/" + asset] = asset;
const assets = Object.fromEntries(Object.entries(files).map(([url, name]) => [url, fs.readFileSync(path.join(root, "public", name))]));
const result = { status: "ok", findings: [], factors: { F1: 0.85, F2: 0.85, F3: 2, F7: 0.8, F8: 2, is_rule: 0.9,
  rule_role: { choice: "direct_action", confidence: 0.9 }, primitive: { choice: "rule", confidence: 0.9 } } };
const report = { browser: "installed Edge", providerRequests: 0, sourceHashes: Object.fromEntries(Object.values(files).map((name) =>
  ["public/" + name, crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "public", name))).digest("hex")])),
  pages: [], filePages: [], keyboard: [], pageErrors: [], screenshots: [] };
report.sourceHashes["checks/theme-accessibility.cjs"] = crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex");
report.keyboardScope = "Synthesized Edge keydown/keyup events, including repeat=true after the first response settles; loopback responses only. Not physical-keyboard, IME or screen-reader acceptance.";
let mode = "ok", requests = 0;
const waiting = [];
function reply(res) {
  if (res.destroyed) return;
  res.writeHead(mode === "error" ? 502 : 200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(mode === "error" ? { code: "upstream" } : result));
}
function release() { while (waiting.length) reply(waiting.shift()); }
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/score") {
    requests++;
    for await (const _ of req) { /* controlled local fixture */ }
    if (mode === "hold") waiting.push(res); else reply(res);
    return;
  }
  const asset = assets[req.url];
  if (!asset) { res.writeHead(404); res.end(); return; }
  const name = files[req.url];
  res.writeHead(200, { "Content-Type": name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : "text/html" });
  res.end(asset);
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
    for (const node of document.querySelectorAll("h1,h2,p,label,button,select,textarea,a,summary,dt,dd,.count")) {
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
  check("tab reaches result disclosure", await page.evaluate(() => document.activeElement.matches("#out > details > summary")));
  const disclosureFocus = (await colors(page)).focus; focus.push(disclosureFocus);
  check("disclosure has visible focus", disclosureFocus?.passed && disclosureFocus.unobscured);
  await page.keyboard.press("Enter"); check("Enter expands results", await page.locator("#out > details").evaluate((e) => e.open));
  await page.keyboard.press("Space"); check("Space collapses results", !(await page.locator("#out > details").evaluate((e) => e.open)));
  await page.keyboard.press("Tab");
  check("tab reaches copy prompt", await page.evaluate(() => document.activeElement.matches("#out .copy-prompt")));
  await page.keyboard.press("Tab");
  check("tab reaches prompt preview", await page.evaluate(() => document.activeElement.matches("#out .prompt-preview > summary")));
  await page.keyboard.press("Tab");
  check("tab reaches privacy explanation", await page.evaluate(() => document.activeElement.matches("#promise a")));

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
  return { theme, layout, locale, checks, focus, heldEnter, passed: checks.every((c) => c.passed) };
}
(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({ channel: "msedge", headless: true }); report.version = browser.version();
    for (const theme of ["light", "dark"]) for (const layout of ["desktop", "mobile", "scaled"]) {
      for (const [route, locale] of [["/", "en"], ["/", "ar"], ["/research", "en"], ["/privacy", "en"], ["/terms", "en"]]) {
        const context = await browser.newContext({ locale: "en-US", colorScheme: theme, viewport: layout === "mobile" ? { width: 375, height: 812 } : { width: 1280, height: 900 } });
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
            await page.screenshot({ path: screenshot, fullPage: true }); report.screenshots.push(path.relative(root, screenshot));
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
    report.mockRequests = requests;
    report.passed = !report.fatal && !report.pageErrors.length && report.pages.length === 30 && report.pages.every((p) => p.passed) && report.filePages.length === 12 && report.filePages.every(p => p.passed) && report.keyboard.every((k) => k.passed);
    fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ passed: report.passed, pages: report.pages.length, keyboardJourneys: report.keyboard.length, mockRequests: requests,
      failingPages: report.pages.filter((p) => !p.passed).map((p) => ({ theme: p.theme, layout: p.layout, route: p.route, locale: p.locale,
        text: p.text.filter((t) => !t.passed), placeholder: p.placeholder, boundary: p.boundary })),
      failingKeyboard: report.keyboard.filter((k) => !k.passed).map((k) => ({ theme: k.theme, layout: k.layout, locale: k.locale, checks: k.checks.filter((c) => !c.passed) })), fatal: report.fatal }));
    if (!report.passed) process.exitCode = 1;
  }
})();
