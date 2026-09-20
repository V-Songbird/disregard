"use strict";

// The one server-side piece. It exists because the API key cannot go in a page:
// everything else about this app is static.
//
// Written against the Web standard `Request -> Response`, which Vercel, Netlify
// Functions v2, Cloudflare Workers, Deno and Node 22 all accept, so no host is
// picked here. A host wanting `export default` gets it from the CommonJS
// default export.

const { analyze, AnalyzeError, MAX_RULE_CHARS } = require("../lib/analyze.js");

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function handler(request) {
  if (request.method !== "POST") {
    return json({ error: "use POST" }, 405);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "body must be JSON" }, 400);
  }
  if (!payload || typeof payload !== "object") {
    return json({ error: "body must be a JSON object with a `rule` field" }, 400);
  }

  try {
    const result = await analyze(payload.rule, { apiKey: process.env.TYPESAFE_API_KEY });
    return json(result);
  } catch (err) {
    if (err instanceof AnalyzeError) return json({ error: err.message }, err.status);
    // Anything unrecognised is ours, and its message may carry the request or
    // the key. Say nothing.
    return json({ error: "the rule could not be scored" }, 500);
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports.MAX_RULE_CHARS = MAX_RULE_CHARS;
