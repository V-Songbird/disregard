---
type: knowledge
summary: "Records the pinned local CommonMark parser, its provenance and integrity; read when reviewing or updating the vendored dependency."
related_files:
  - public/vendor/commonmark-0.31.2.min.js
  - public/vendor/commonmark-LICENSE.txt
  - public/document-model.js
  - checks/document-model.test.cjs
---

# CommonMark parser

`commonmark-0.31.2.min.js` is the unchanged browser distribution of
`commonmark@0.31.2`, the JavaScript CommonMark reference implementation.
It runs locally, with no runtime CDN request or build step. Only its parser and
AST source locations are used; the application never renders uploaded Markdown.

- Upstream: <https://github.com/commonmark/commonmark.js>
- Exact distribution: <https://unpkg.com/commonmark@0.31.2/dist/commonmark.min.js>
- License: <https://unpkg.com/commonmark@0.31.2/LICENSE> (BSD-2-Clause), retained
  in [commonmark-LICENSE.txt](../../public/vendor/commonmark-LICENSE.txt).
- Distribution SHA-256: `2de0f8ecbca0a6470da57c8b2ad043777ae999c5132f9abf12e8c332d4e46164`.
- License SHA-256: `6cc4b9b28cf68e5bd20f9e94859a85cde35095ef4f9d0f7385b0b6166642f50b`.

Updates require an explicit version change, fresh hashes, and the extraction suite.
`checks/document-model.test.cjs` lists the seven top-level block types the adapter
handles and fails when a new version can produce another. The adapter has no
fallback skip reason, so give a new type a branch or a skip reason in
`public/document-model.js` before adding it to that list.
CommonMark has no native tables or YAML frontmatter: the adapter excludes these
extensions explicitly and retains their raw source in the coverage report.
