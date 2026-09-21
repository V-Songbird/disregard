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
const MAX_BODY_BYTES = 16 * 1024;

function apiKey(env) {
  if (env && env.TYPESAFE_API_KEY) return env.TYPESAFE_API_KEY;
  // `process` does not exist in a Worker unless nodejs_compat is on, and this
  // code has no reason to ask for it.
  if (typeof process !== "undefined" && process.env) return process.env.TYPESAFE_API_KEY;
  return undefined;
}

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

class BodyTooLargeError extends Error {}

function cancelWithoutWaiting(body) {
  // A hostile/custom stream can leave cancellation pending forever. Start it,
  // consume any rejection, and return the bounded response without awaiting it.
  try { Promise.resolve(body?.cancel()).catch(() => {}); } catch {}
}

async function boundedJson(request) {
  const declared = request.headers.get("content-length")?.trim();
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_BODY_BYTES) {
    cancelWithoutWaiting(request.body);
    throw new BodyTooLargeError();
  }
  if (!request.body) return JSON.parse("");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error("invalid body chunk");
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        cancelWithoutWaiting(reader);
        throw new BodyTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

/**
 * The POST /api/score handler. Web standard in, web standard out.
 *
 * @param {Request} request JSON body { rule: string }.
 * @param {object} [env]    Worker bindings. TYPESAFE_API_KEY is read here first,
 *                          then from process.env for a local run.
 * @returns {Promise<Response>} JSON, always Cache-Control: no-store. An error
 *   body is { code, error }: code is what the page renders, error is English.
 */
async function handler(request, env) {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed", error: "use POST" }, 405, { Allow: "POST" });
  }

  let payload;
  try {
    payload = await boundedJson(request);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return json({ code: "body_too_large", error: "body must be " + MAX_BODY_BYTES + " bytes or fewer" }, 413);
    }
    return json({ code: "bad_body", error: "body must be JSON" }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json({ code: "bad_body", error: "body must be a JSON object with a `rule` field" }, 400);
  }

  try {
    const result = await analyze(payload.rule, { apiKey: apiKey(env) });
    return json(result);
  } catch (err) {
    // `code` is what the page renders, in whichever language it is showing;
    // `error` is the English detail, for logs and for anyone calling this
    // directly.
    if (err instanceof AnalyzeError) return json({ code: err.code, error: err.message }, err.status);
    // Anything unrecognised is ours, and its message may carry the request or
    // the key. Say nothing.
    return json({ code: "failed", error: "the rule could not be scored" }, 500);
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports.MAX_RULE_CHARS = MAX_RULE_CHARS;
module.exports.MAX_BODY_BYTES = MAX_BODY_BYTES;
