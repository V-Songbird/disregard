"use strict";

// Renders public/og.png, the 1200x630 link-preview card, with installed Edge.
// Usage: node checks/og-card.cjs [output path, default public/og.png]
// Colors are the dark theme in public/style.css; the finding is public/i18n.js wording.
const path = require("node:path");
const { chromium } = require(process.env.DISREGARD_PLAYWRIGHT_MODULE || "playwright");
const { loopbackOnlyArgs } = require("./browser-assets.cjs");

const target = path.resolve(process.argv[2] || path.join(__dirname, "..", "public", "og.png"));
const card = `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1200px; height: 630px; }
  body { box-sizing: border-box; padding: 72px 80px; background: #14141a; color: #e8e6e1;
    font: 28px/1.4 "Segoe UI", system-ui, sans-serif; display: flex; flex-direction: column; }
  h1 { margin: 0; font-size: 76px; line-height: 1; letter-spacing: -.02em; }
  p.promise { margin: 24px 0 0; max-width: 960px; font-size: 38px; line-height: 1.3; }
  .row { margin-top: auto; padding: 24px 28px; background: #1b1b22; border: 2px solid #32323c; border-radius: 10px; }
  .meta { color: #a8a49b; font-size: 22px; }
  .meta b { color: #f0a35a; margin-inline-start: 12px; }
  code { display: block; margin-top: 8px; font: 28px/1.4 Consolas, ui-monospace, monospace; }
  .finding { display: block; margin-top: 12px; padding-inline-start: 16px; border-inline-start: 4px solid #f0a35a; }
  .site { position: absolute; top: 80px; right: 80px; color: #a8a49b; font-size: 26px; }
</style>
<span class="site">disregard.dev</span>
<h1>Disregard</h1>
<p class="promise">Paste or drop your CLAUDE.md or AGENTS.md and get a prompt your agent can use to improve it.</p>
<div class="row">
  <span class="meta">Line 12<b>1 finding</b></span>
  <code>Always try to use functional components.</code>
  <span class="finding">Check whether this hedge is intentional.</span>
</div>`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: loopbackOnlyArgs });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(card);
    await page.screenshot({ path: target });
    console.log(target);
  } finally { await browser.close(); }
})();
