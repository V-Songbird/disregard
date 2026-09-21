// The Cloudflare entry point, and the only ESM file here: Workers wants a
// module with a default export, everything else in this repo is CommonJS, and
// wrangler's bundler joins the two without a build step of our own.
//
//   wrangler dev          run it locally
//   wrangler deploy       ship it
//   wrangler secret put TYPESAFE_API_KEY
//
// The page in public/ is served by Workers static assets, which match before
// this runs. Only /api/score and mistyped paths reach here.

import handler from "./api/score.js";
import scoreWithRateLimit from "./lib/score-rate-limit.js";

export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname !== "/api/score") {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    return scoreWithRateLimit(request, env, ctx, handler);
  },
};
