"use strict";

// These edge bindings are approximate, location-local overload protection.
// They are not a global spending cap or an exact provider-usage counter.
// The portable scorer stays usable on other hosts; its host must supply its
// own request controls before exposing the paid endpoint publicly.

function unavailable() {
  return failure(503, "not_configured", "scoring is temporarily unavailable");
}

function failure(status, code, error) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (status === 429) headers["Retry-After"] = "60";
  return new Response(JSON.stringify({ code, error }), { status, headers });
}

async function limitThenScore(request, env, ctx, handler) {
  // The handler owns the existing 405 contract. Reading a body or consuming
  // a limit for another method would change that contract unnecessarily.
  if (request.method !== "POST") return handler(request, env, ctx);

  try {
    const client = env && env.SCORE_CLIENT_LIMITER;
    const aggregate = env && env.SCORE_AGGREGATE_LIMITER;
    if (typeof client?.limit !== "function" || typeof aggregate?.limit !== "function") {
      return unavailable();
    }

    // Cloudflare supplies this header at the trusted edge. Do not fall back
    // to user-controlled forwarding headers. Anonymous users on one IP share
    // a quota; requests without the edge header share an "unknown" quota.
    const address = request.headers.get("CF-Connecting-IP") || "unknown";
    const individual = await client.limit({ key: "disregard-score:client:" + address });
    if (typeof individual?.success !== "boolean") return unavailable();
    if (!individual.success) {
      return failure(429, "rate_limited", "too many scoring requests; retry in 60 seconds");
    }

    // A client already blocked above must not consume the shared allowance.
    const shared = await aggregate.limit({ key: "disregard-score:aggregate" });
    if (typeof shared?.success !== "boolean") return unavailable();
    if (!shared.success) {
      return failure(429, "rate_limited", "too many scoring requests; retry in 60 seconds");
    }
  } catch {
    // A binding failure must never bypass protection or expose its message.
    return unavailable();
  }

  return handler(request, env, ctx);
}

// A handled 5xx counts as a successful invocation in Workers metrics, and
// invocation logs are off (wrangler.jsonc), so this error is its only stored
// trace. Workers Logs keeps the request method and URL with it, but not the
// headers, IP address or location. Log only the stable code and the status:
// never the rule, a body, headers or error text.
async function scoreWithRateLimit(request, env, ctx, handler) {
  const response = await limitThenScore(request, env, ctx, handler);
  if (response.status >= 500) console.error({ code: await stableCode(response), status: response.status });
  return response;
}

// Error bodies are { code, error }. Read a copy so the response stays unread,
// and accept an identifier only.
async function stableCode(response) {
  try {
    const { code } = await response.clone().json();
    return typeof code === "string" && /^[a-z_]{1,40}$/.test(code) ? code : "unknown";
  } catch {
    return "unknown";
  }
}

module.exports = scoreWithRateLimit;
