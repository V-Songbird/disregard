"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

// Release settings in wrangler.jsonc. Comments are removed before parsing; strings
// match first, so comment-like text inside a string stays.
const text = fs.readFileSync(`${__dirname}/../wrangler.jsonc`, "utf8");
const config = JSON.parse(text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, string) => string ?? " "));

const settings = [
  ["preview_urls", false, "preview URLs would make every uploaded version public, including any without the rate limits"],
  ["observability.enabled", true, "without this block, a deploy leaves the Worker's existing logging, including invocation logs, unchanged"],
  ["observability.logs.enabled", true, "Workers Logs keeps the Worker's errors"],
  ["observability.logs.invocation_logs", false, "invocation logs would store each caller's IP address and location, which the privacy page does not list"],
  ["observability.traces.enabled", false, "traces would record each caller's location and user agent, which the privacy page does not list"],
];

for (const [setting, expected, reason] of settings) {
  test(`wrangler.jsonc sets ${setting} to ${expected}`, () => {
    const actual = setting.split(".").reduce((value, key) => value?.[key], config);
    assert.equal(actual, expected, `${setting} must be ${expected}: ${reason}.`);
  });
}

const limiters = [
  ["SCORE_CLIENT_LIMITER", "930021", 60, "per client IP address"],
  ["SCORE_AGGREGATE_LIMITER", "930022", 180, "across all clients"],
];

for (const [name, namespace_id, limit, scope] of limiters) {
  test(`wrangler.jsonc binds ${name} to namespace ${namespace_id} at ${limit} requests per 60 seconds`, () => {
    assert.deepEqual(config.ratelimits?.filter((binding) => binding.name === name),
      [{ name, namespace_id, simple: { limit, period: 60 } }],
      `ratelimits ${name} must use namespace ${namespace_id} at ${limit} requests per 60 seconds: it limits paid scoring calls ${scope}, and the Worker returns 503 without it.`);
  });
}
