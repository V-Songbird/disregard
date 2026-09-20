// The Cloudflare entry point, and the only ESM file here: Workers wants a
// module with a default export, everything else in this repo is CommonJS, and
// wrangler's bundler joins the two without a build step of our own.
//
//   wrangler dev          run it locally
//   wrangler deploy       ship it
//   wrangler secret put TYPESAFE_API_KEY
//
// Nothing else is routed yet. The static page, when it exists, is served by
// Workers static assets next to this.

import handler from "./api/score.js";

export default {
  fetch(request, env, ctx) {
    return handler(request, env, ctx);
  },
};
