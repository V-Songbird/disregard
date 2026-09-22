"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const scoreWithRateLimit = require("./score-rate-limit.js");
const scoreHandler = require("../api/score.js");

const request = (address = "192.0.2.10") => new Request("https://fixture.invalid/api/score", {
  method: "POST", headers: address ? { "CF-Connecting-IP": address } : {}, body: "{}",
});
const allow = () => ({ limit: async () => ({ success: true }) });
const bindings = () => ({ SCORE_CLIENT_LIMITER: allow(), SCORE_AGGREGATE_LIMITER: allow() });

test.beforeEach((t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("No real provider request is permitted in this test."); });
  t.mock.method(console, "error", () => {});
});
const logged = () => console.error.mock.calls.map((call) => call.arguments);
const errorResponse = (status, body) => new Response(body, {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function failure(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("retry-after"), status === 429 ? "60" : null);
  const result = await response.json();
  assert.equal(result.code, code);
  assert.equal(typeof result.error, "string");
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
}

test("accepted requests consume both independent quotas before reaching the handler unchanged", async () => {
  const env = bindings(), ctx = {}, input = request(), response = new Response("scored");
  const events = [];
  env.SCORE_CLIENT_LIMITER.limit = async function (value) {
    assert.equal(this, env.SCORE_CLIENT_LIMITER);
    events.push(["client", value]); return { success: true };
  };
  env.SCORE_AGGREGATE_LIMITER.limit = async function (value) {
    assert.equal(this, env.SCORE_AGGREGATE_LIMITER);
    events.push(["aggregate", value]); return { success: true };
  };
  const result = await scoreWithRateLimit(input, env, ctx, (r, e, c) => {
    assert.equal(r, input); assert.equal(e, env); assert.equal(c, ctx);
    events.push(["handler"]); return response;
  });
  assert.equal(result, response);
  assert.equal(input.bodyUsed, false);
  assert.deepEqual(events, [
    ["client", { key: "disregard-score:client:192.0.2.10" }],
    ["aggregate", { key: "disregard-score:aggregate" }], ["handler"],
  ]);
});

test("client denial skips the shared quota, body, and scorer", async () => {
  const env = bindings();
  env.SCORE_CLIENT_LIMITER.limit = async () => ({ success: false });
  env.SCORE_AGGREGATE_LIMITER.limit = () => assert.fail("must not consume shared quota");
  const input = request();
  await failure(await scoreWithRateLimit(input, env, {}, () => assert.fail("must not score")), 429, "rate_limited");
  assert.equal(input.bodyUsed, false);
});

test("the shared quota protects the scorer when an individual quota accepts", async () => {
  const env = bindings();
  env.SCORE_AGGREGATE_LIMITER.limit = async () => ({ success: false });
  await failure(await scoreWithRateLimit(request(), env, {}, () => assert.fail("must not score")), 429, "rate_limited");
});

test("missing or malformed bindings fail closed without calling the scorer", async () => {
  for (const env of [undefined, {}, { SCORE_CLIENT_LIMITER: allow() },
    { SCORE_AGGREGATE_LIMITER: allow() },
    { ...bindings(), SCORE_CLIENT_LIMITER: { limit: true } },
    { ...bindings(), SCORE_AGGREGATE_LIMITER: null }]) {
    await failure(await scoreWithRateLimit(request(), env, {}, () => assert.fail("must not score")), 503, "not_configured");
  }
});

test("binding exceptions and invalid results fail closed with sanitized errors", async () => {
  for (const name of ["SCORE_CLIENT_LIMITER", "SCORE_AGGREGATE_LIMITER"]) {
    for (const result of [undefined, null, {}, { success: "true" }, { success: 1 }]) {
      const env = bindings(); env[name].limit = async () => result;
      await failure(await scoreWithRateLimit(request(), env, {}, () => assert.fail("must not score")), 503, "not_configured");
    }
    for (const reject of [() => { throw new Error("SECRET sync binding failure"); },
      async () => { throw new Error("SECRET async binding failure"); }]) {
      const env = bindings(); env[name].limit = reject;
      await failure(await scoreWithRateLimit(request(), env, {}, () => assert.fail("must not score")), 503, "not_configured");
    }
  }
});

test("unsupported methods preserve the scorer's 405 contract even without bindings", async () => {
  for (const method of ["GET", "PUT", "DELETE", "OPTIONS", "HEAD"]) {
    const response = await scoreWithRateLimit({ method, get headers() { throw new Error("must not read headers"); },
      get body() { throw new Error("must not read body"); } }, {}, {}, scoreHandler);
    await failure(response, 405, "method_not_allowed");
    assert.equal(response.headers.get("allow"), "POST");
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("only the trusted edge header partitions clients; missing headers share one quota", async () => {
  const seen = [], env = bindings();
  env.SCORE_CLIENT_LIMITER.limit = async ({ key }) => { seen.push(key); return { success: true }; };
  for (const address of ["192.0.2.10", "2001:db8::1", null]) {
    const input = request(address);
    input.headers.set("X-Forwarded-For", "attacker-controlled");
    input.headers.set("X-Real-IP", "also-attacker-controlled");
    await scoreWithRateLimit(input, env, {}, () => new Response("ok"));
  }
  assert.deepEqual(seen, ["disregard-score:client:192.0.2.10", "disregard-score:client:2001:db8::1", "disregard-score:client:unknown"]);
});

test("concurrent requests each await both guards and never score after denial or failure", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const called = [], env = bindings();
  env.SCORE_CLIENT_LIMITER.limit = async ({ key }) => {
    await gate;
    if (key.endsWith(".11")) return { success: false };
    if (key.endsWith(".12")) throw new Error("SECRET rejected client");
    return { success: true };
  };
  let aggregateCalls = 0;
  env.SCORE_AGGREGATE_LIMITER.limit = async () => { aggregateCalls++; return { success: true }; };
  const pending = ["192.0.2.10", "192.0.2.11", "192.0.2.12"].map((address) =>
    scoreWithRateLimit(request(address), env, {}, () => { called.push(address); return new Response("ok"); }));
  assert.deepEqual(called, []); assert.equal(aggregateCalls, 0);
  release();
  const [accepted, denied, failed] = await Promise.all(pending);
  assert.equal(accepted.status, 200);
  await failure(denied, 429, "rate_limited");
  await failure(failed, 503, "not_configured");
  assert.deepEqual(called, ["192.0.2.10"]); assert.equal(aggregateCalls, 1);
});

test("each handled 5xx logs one error with only its stable code and status, and passes through unchanged", async () => {
  await failure(await scoreWithRateLimit(request(), {}, {}, () => assert.fail("must not score")), 503, "not_configured");
  for (const [status, code] of [[500, "not_configured"], [500, "failed"], [502, "upstream"]]) {
    const body = JSON.stringify({ code, error: "SECRET detail" }), response = errorResponse(status, body);
    assert.equal(await scoreWithRateLimit(request(), bindings(), {}, () => response), response);
    assert.equal(response.bodyUsed, false);
    assert.equal(await response.text(), body);
  }
  assert.deepEqual(logged(), [[{ code: "not_configured", status: 503 }], [{ code: "not_configured", status: 500 }],
    [{ code: "failed", status: 500 }], [{ code: "upstream", status: 502 }]]);
});

test("a 5xx body without an identifier code logs unknown, never its text", async () => {
  const bodies = ["SECRET plain text", "", JSON.stringify({ error: "SECRET" }),
    JSON.stringify({ code: "SECRET code with spaces" }), JSON.stringify({ code: 7 })];
  for (const body of bodies) {
    const response = errorResponse(500, body);
    assert.equal(await scoreWithRateLimit(request(), bindings(), {}, () => response), response);
    assert.equal(await response.text(), body);
  }
  assert.deepEqual(logged(), bodies.map(() => [{ code: "unknown", status: 500 }]));
});

test("the scorer's provider failure logs upstream and 502 without the provider's text", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("SECRET raw provider body", { status: 503 }));
  const input = new Request("https://fixture.invalid/api/score", { method: "POST",
    headers: { "CF-Connecting-IP": "192.0.2.10" }, body: JSON.stringify({ rule: "Run prettier before committing." }) });
  const env = { ...bindings(), TYPESAFE_API_KEY: "fake-worker-key" };
  await failure(await scoreWithRateLimit(input, env, {}, scoreHandler), 502, "upstream");
  assert.deepEqual(logged(), [[{ code: "upstream", status: 502 }]]);
});

test("2xx and 4xx responses log nothing and pass through unchanged", async () => {
  for (const status of [200, 204, 400, 404, 413, 429, 499]) {
    const response = new Response(null, { status });
    assert.equal(await scoreWithRateLimit(request(), bindings(), {}, () => response), response);
  }
  const env = bindings();
  env.SCORE_CLIENT_LIMITER.limit = async () => ({ success: false });
  await failure(await scoreWithRateLimit(request(), env, {}, () => assert.fail("must not score")), 429, "rate_limited");
  await failure(await scoreWithRateLimit({ method: "GET" }, {}, {}, scoreHandler), 405, "method_not_allowed");
  await failure(await scoreWithRateLimit(request(), bindings(), {}, scoreHandler), 400, "bad_rule");
  assert.equal(console.error.mock.callCount(), 0);
});
