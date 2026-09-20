"use strict";

// The one server-side piece. It exists because the API key cannot go in a page:
// everything else about this app is static.
//
// Written against the Web standard `Request -> Response`. Cloudflare Workers is
// the host — see wrangler.jsonc and worker.js — and the same handler still runs
// unchanged on Netlify v2, Vercel, Deno or Node 22, because nothing here
// touches a Node built-in.
//
// The key arrives as a Workers secret, which is the `env` argument, and falls
// back to `process.env` for a local run:
//
//   wrangler secret put TYPESAFE_API_KEY

const { analyze, AnalyzeError, MAX_RULE_CHARS } = require("../lib/analyze.js");

function apiKey(env) {
  if (env && env.TYPESAFE_API_KEY) return env.TYPESAFE_API_KEY;
  // `process` does not exist in a Worker unless nodejs_compat is on, and this
  // code has no reason to ask for it.
  if (typeof process !== "undefined" && process.env) return process.env.TYPESAFE_API_KEY;
  return undefined;
}

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function handler(request, env) {
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
    const result = await analyze(payload.rule, { apiKey: apiKey(env) });
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
