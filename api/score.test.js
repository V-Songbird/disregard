"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("./score.js");
const { MAX_BODY_BYTES, MAX_RULE_CHARS } = handler;
const encoder = new TextEncoder();
const bindings = { TYPESAFE_API_KEY: "fake-worker-key" };
const validRule = "Run prettier before committing.";
const goodAnswers = { answers: { control: { noul: 0.01 }, premise: { noul: 0.02 }, is_rule: { noul: 0.99 },
  trigger_distance: { score: 4 }, enforceability: { score: 0 }, best_primitive: { choice: "hook", confidence: 0.9 },
  candidate_role: { choice: "direct_action", confidence: 0.9 } },
  usage: { input_tokens: 12 } };
const request = (body, headers = {}) => new Request("https://fixture.invalid/api/score", { method: "POST", body, headers });
const streamed = (body, headers = {}) => new Request("https://fixture.invalid/api/score", { method: "POST", body, headers, duplex: "half" });

test.beforeEach((t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("No real provider request is permitted in this test."); });
});

function success(t, inspect = () => {}) {
  t.mock.method(globalThis, "fetch", async (url, init) => {
    inspect(url, init);
    return new Response(JSON.stringify(goodAnswers), { headers: { "Content-Type": "application/json" } });
  });
}
function localKey(t, value) {
  const previous = process.env.TYPESAFE_API_KEY;
  if (value === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = value;
  t.after(() => {
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
  });
}
async function error(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("content-type"), "application/json");
  const body = await response.json();
  assert.equal(body.code, code);
  assert.equal(typeof body.error, "string");
  return body;
}

test("unsupported methods have a complete 405 contract without body reads or provider calls", async () => {
  for (const method of ["GET", "PUT", "DELETE", "OPTIONS", "HEAD"]) {
    const response = await handler({ method, get body() { throw new Error("must not read"); } }, bindings);
    assert.deepEqual(await error(response, 405, "method_not_allowed"), { code: "method_not_allowed", error: "use POST" });
    assert.equal(response.headers.get("allow"), "POST");
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("oversized Content-Length cancels without opening a reader or awaiting cancellation", { timeout: 2000 }, async () => {
  let cancelled = 0;
  const response = await handler({ method: "POST", headers: new Headers({ "Content-Length": String(MAX_BODY_BYTES + 1) }),
    body: { cancel() { cancelled++; return new Promise(() => {}); }, getReader() { throw new Error("must not open reader"); } } }, bindings);
  await error(response, 413, "body_too_large");
  assert.equal(cancelled, 1);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("stream byte limit catches absent and false smaller lengths before reading the rest", { timeout: 2000 }, async () => {
  for (const headers of [{}, { "Content-Length": "1" }]) {
    let reads = 0, cancellations = 0, released = 0;
    const body = { getReader: () => ({
      async read() {
        reads++;
        if (reads === 1) return { value: encoder.encode(" ".repeat(MAX_BODY_BYTES)), done: false };
        if (reads === 2) return { value: encoder.encode("x"), done: false };
        throw new Error("must stop reading immediately on oversize");
      },
      cancel() { cancellations++; return new Promise(() => {}); },
      releaseLock() { released++; },
    }) };
    await error(await handler({ method: "POST", headers: new Headers(headers), body }, bindings), 413, "body_too_large");
    assert.equal(reads, 2); assert.equal(cancellations, 1); assert.equal(released, 1);
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("real stream oversize cancellation is safe even when its cancellation rejects", async () => {
  let cancelled = 0;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_BODY_BYTES + 1)); },
    cancel() { cancelled++; return Promise.reject(new Error("SECRET cancellation")); } });
  await error(await handler(streamed(body), bindings), 413, "body_too_large");
  await Promise.resolve();
  assert.equal(cancelled, 1);
  assert.equal(body.locked, false);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("exact raw byte boundary is accepted while one additional padding byte is rejected", async (t) => {
  success(t);
  const json = JSON.stringify({ rule: validRule });
  const exact = json + " ".repeat(MAX_BODY_BYTES - encoder.encode(json).length);
  const accepted = await handler(request(exact), bindings);
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).status, "ok");
  await error(await handler(request(exact + " "), bindings), 413, "body_too_large");
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

test("all 2000 UTF-16 units may be escaped in otherwise valid JSON", async (t) => {
  const rule = "Use " + "a".repeat(MAX_RULE_CHARS - 4);
  const escaped = '{"rule":"' + [...rule].map((character) => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")).join("") + '"}';
  assert.equal(rule.length, 2000);
  assert.ok(encoder.encode(escaped).length < MAX_BODY_BYTES);
  success(t, (_url, init) => assert.equal(JSON.parse(init.body).state.rule, rule));
  assert.equal((await handler(request(escaped), bindings)).status, 200);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

test("split multibyte UTF-8 and a split leading BOM decode as one JSON body", async (t) => {
  const rule = "Use `保存` for the save label.";
  const bytes = encoder.encode("\uFEFF" + JSON.stringify({ rule }));
  let index = 0;
  const body = new ReadableStream({ pull(controller) {
    if (index === bytes.length) controller.close();
    else controller.enqueue(bytes.slice(index, ++index));
  } });
  success(t, (_url, init) => assert.equal(JSON.parse(init.body).state.rule, rule));
  assert.equal((await handler(streamed(body), bindings)).status, 200);
  assert.equal(body.locked, false);
});

test("malformed JSON, non-objects and read errors are generic bad_body failures", async () => {
  for (const body of ["{SECRET", "", "null", "[]", '["x"]', "false", "12", '"text"']) {
    const result = await error(await handler(request(body), bindings), 400, "bad_body");
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
  }
  const failed = new ReadableStream({ pull(controller) { controller.error(new Error("SECRET read exception")); } });
  const result = await error(await handler(streamed(failed), bindings), 400, "bad_body");
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
  assert.equal(failed.locked, false);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("rule errors remain distinct and invalid requests never reach the provider", async () => {
  for (const [payload, code] of [[{}, "bad_rule"], [{ rule: 42 }, "bad_rule"], [{ rule: "  " }, "empty"],
    [{ rule: "a".repeat(MAX_RULE_CHARS + 1) }, "too_long"]]) {
    await error(await handler(request(JSON.stringify(payload)), bindings), 400, code);
  }
  const foreign = await handler(request(JSON.stringify({ rule: "提交之前运行格式化工具。" })), bindings);
  assert.equal(foreign.status, 200);
  assert.equal((await foreign.json()).status, "not_english");
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("bindings take precedence over local keys and successful integration needs no content type", async (t) => {
  localKey(t, "fake-local-key");
  const keys = [];
  success(t, (url, init) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    keys.push(init.headers.Authorization);
    assert.equal(JSON.parse(init.body).state.rule, validRule);
  });
  for (const env of [bindings, undefined]) {
    const input = env ? request(encoder.encode(JSON.stringify({ rule: validRule })))
      : request(JSON.stringify({ rule: validRule }), { "Content-Type": "text/plain" });
    if (env) assert.equal(input.headers.get("content-type"), null);
    const response = await handler(input, env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json();
    assert.equal(result.status, "ok"); assert.equal(result.tokens, 12);
    assert.ok(result.findings.some((finding) => finding.id === "should_be_a_hook"));
  }
  assert.deepEqual(keys, ["Bearer fake-worker-key", "Bearer fake-local-key"]);
});

test("missing configuration and upstream 429 or 502 remain sanitized", async (t) => {
  localKey(t, undefined);
  await error(await handler(request(JSON.stringify({ rule: validRule }))), 500, "not_configured");
  assert.equal(globalThis.fetch.mock.callCount(), 0);
  for (const [status, expected, code] of [[429, 429, "rate_limited"], [503, 502, "upstream"]]) {
    t.mock.method(globalThis, "fetch", async () => new Response("SECRET raw provider body", { status }));
    const result = await error(await handler(request(JSON.stringify({ rule: validRule })), bindings), expected, code);
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
  }
  t.mock.method(globalThis, "fetch", async () => { throw new Error("SECRET network context"); });
  const result = await error(await handler(request(JSON.stringify({ rule: validRule })), bindings), 502, "upstream");
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
});

test("HTTP response exposes supplemental role evidence and rejects missing role metadata safely", async (t) => {
  const answers = { ...goodAnswers.answers, is_rule: { noul: 0.49 },
    candidate_role: { choice: "artifact_requirement", confidence: 0.8, debug: "SECRET-role" } };
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.equal(Object.keys(JSON.parse(init.body).questions).length, 7);
    return Response.json({ answers });
  });
  const response = await handler(request(JSON.stringify({ rule: validRule })), bindings);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.factors.is_rule, 0.49);
  assert.deepEqual(body.factors.rule_role, { choice: "artifact_requirement", confidence: 0.8 });
  assert.ok(!body.findings.some((finding) => finding.id === "not_a_rule"));
  assert.ok(body.findings.some((finding) => finding.id === "should_be_a_hook"));
  assert.equal(JSON.stringify(body).includes("SECRET-role"), false);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
  delete answers.candidate_role;
  const failed = await error(await handler(request(JSON.stringify({ rule: validRule })), bindings), 502, "upstream");
  assert.equal(failed.error, "the scoring service returned an invalid response");
  assert.equal(globalThis.fetch.mock.callCount(), 2, "one request per submission, with no retry");
});
