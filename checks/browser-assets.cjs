"use strict";

// Explicit public assets used by every local browser harness. No external CDN.
// The export stays an array of these paths; shared harness helpers are attached.
const fs = require("node:fs"), path = require("node:path"), { createHash } = require("node:crypto");
const assets = [
  "file-i18n.js", "vendor/commonmark-0.31.2.min.js", "document-model.js",
  "refactor-prompt.js", "review-ui.js",
];

// Interface locales and the lang tag each one sets on <html>.
assets.langTags = { en: "en", es: "es-MX", zh: "zh-Hans", hi: "hi", ar: "ar", fr: "fr" };
assets.locales = Object.keys(assets.langTags);

// Edge sends every non-loopback request to a proxy name that never resolves, so
// nothing leaves the machine; loopback bypasses the proxy. Request interception
// is avoided because it also stops Edge from requesting /favicon.ico.
assets.loopbackOnlyArgs = ["--proxy-server=http://proxy.invalid:9", "--host-resolver-rules=MAP proxy.invalid ~NOTFOUND"];

// Requests a check may receive without serving them. Keep empty unless one is
// proven necessary; any other unknown request fails the check.
const allowedUnknownRequests = [];

// Serves one snapshot of public/ per run, so reported hashes match every response.
// Records any other request the local server receives, including ones the browser
// makes on its own, and every page request in a watched context to another origin.
assets.localSite = (pages = {}) => {
  const types = { html: "text/html", css: "text/css", js: "text/javascript" };
  const routes = { "/": "index.html", "/style.css": "style.css", "/i18n.js": "i18n.js", ...pages };
  for (const file of assets) routes["/" + file] = file;
  const served = Object.fromEntries(Object.entries(routes).map(([route, file]) => [route, { file: "public/" + file,
    type: types[path.extname(file).slice(1)], body: fs.readFileSync(path.join(__dirname, "..", "public", file)) }]));
  const unknownRequests = [], externalRequests = [];
  return {
    hashes: Object.fromEntries(Object.values(served).map(({ file, body }) => [file, createHash("sha256").update(body).digest("hex")])),
    serve(req, res) {
      const asset = req.method === "GET" && served[req.url];
      if (!asset) { unknownRequests.push(req.method + " " + req.url); res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": asset.type }); res.end(asset.body);
    },
    watch(context, origin) {
      context.on("request", (request) => {
        const url = new URL(request.url());
        if (url.protocol.startsWith("http") && url.origin !== origin) externalRequests.push(url.href);
      });
    },
    audit: () => ({ providerRequests: externalRequests.length, externalRequests, unknownRequests,
      networkClean: !externalRequests.length && unknownRequests.every((entry) => allowedUnknownRequests.includes(entry)) }),
  };
};

module.exports = assets;
