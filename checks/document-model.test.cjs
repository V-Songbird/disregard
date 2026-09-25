const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { parseDocument, summarize, LIMITS } = require('../public/document-model.js');
const commonmark = require('../public/vendor/commonmark-0.31.2.min.js');

function hasCode(code) {
  return error => error.code === code && error.message === code;
}

function assertSourceCoverage(report) {
  let offset = 0;
  for (const [index, line] of report.sourceText.split(/(?<=\n)|(?<=\r)(?!\n)/).entries()) {
    if (line.trim()) {
      assert.ok(report.units.some(unit => unit.startOffset <= offset && unit.endOffset >= offset + line.replace(/[\r\n]+$/, '').length), `uncovered nonblank line ${index + 1}`);
    }
    offset += line.length;
  }
  for (const unit of report.units) {
    assert.equal(report.sourceText.slice(unit.startOffset, unit.endOffset), unit.rawText);
    assert.ok(unit.rule.length <= LIMITS.ruleChars);
  }
}

test('preserves multiline list units, source ranges, and separate heading ancestry', () => {
  const source = '# Project\r\n\r\n## Rules\r\n\r\n- Keep **all** requirements\r\n  and `inline code`.\r\n- Generated artifacts must contain a license.\r\n';
  const report = parseDocument(source, 'CLAUDE.md');
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.sourceName, 'CLAUDE.md');
  assert.equal(report.sourceText, source);
  assert.equal(report.units.length, 4);
  const first = report.units[2];
  assert.deepEqual([first.startLine, first.endLine], [5, 6]);
  assert.equal(first.rawText, '- Keep **all** requirements\r\n  and `inline code`.');
  assert.equal(first.rule, 'Keep **all** requirements\nand `inline code`.');
  assert.deepEqual(first.context, ['Project', 'Rules']);
  assert.equal(first.state, 'ready');
  assert.equal(report.units[3].state, 'ready');
  assertSourceCoverage(report);
});

test('does not require imperative grammar for artifact requirements or background', () => {
  const report = parseDocument('Generated reports must contain a license.\n\nThe project uses Node.js 22.');
  assert.deepEqual(report.units.map(unit => unit.state), ['ready', 'ready']);
});

test('a rule under a conditional heading is scored with that heading first, on its own lines', () => {
  const report = parseDocument('# When changing the API\n- Preserve backward compatibility.\n\n# General\n- Use English comments.');
  const scoped = report.units[1];
  assert.deepEqual({ state: scoped.state, reason: scoped.reason, withContext: scoped.withContext, rule: scoped.rule },
    { state: 'ready', reason: undefined, withContext: true, rule: 'When changing the API:\nPreserve backward compatibility.' });
  assert.deepEqual([scoped.startLine, scoped.endLine, scoped.rawText], [2, 2, '- Preserve backward compatibility.']);
  assert.deepEqual(report.units[3].rule, 'Use English comments.');
  assert.equal(report.units[3].withContext, undefined);
  assertSourceCoverage(report);
});

test('the section heading and any conditional heading above it are stated, other headings are not', () => {
  const report = parseDocument('# Project\n\n## On Windows\n\n### Paths\n\n- Use backslashes.');
  assert.equal(report.units[3].rule, 'On Windows:\nPaths:\nUse backslashes.');
  assert.deepEqual(report.units[3].context, ['Project', 'On Windows', 'Paths']);
});

test('parent paragraph context is retained even without a colon', () => {
  const source = 'Only apply the following rules to release branches.\n\n- Run every check.\n- Update the release notes.';
  const report = parseDocument(source);
  assert.deepEqual(report.units.map(({ state, reason, withContext, rule }) => ({ state, reason, withContext, rule })), [
    { state: 'ready', reason: undefined, withContext: true, rule: 'Only apply the following rules to release branches.\n- Run every check.\n- Update the release notes.' },
    { state: 'ready', reason: undefined, withContext: true, rule: 'Only apply the following rules to release branches.\nRun every check.' },
    { state: 'ready', reason: undefined, withContext: true, rule: 'Only apply the following rules to release branches.\nUpdate the release notes.' },
  ]);
  for (const unit of report.units.slice(1)) assert.deepEqual(unit.context, ['Only apply the following rules to release branches.']);
  assert.equal(report.units[0].rawText, 'Only apply the following rules to release branches.');
  assertSourceCoverage(report);
});

test('scope never overrides another reason a unit needs context', () => {
  const source = '# When deploying\n\n- Run it twice.\n- Read [the notes](notes.md).\n- Check:\n- Before release, tag it:\n  - Use the version.\n- Keep this:\n\n  ```sh\n  npm test\n  ```\n\n1. Build it.\n2. Ship.\n\nOtherwise:\n\n- Stop.';
  const report = parseDocument(source);
  assert.deepEqual(report.units.map(({ startLine, state, reason }) => [startLine, state, reason]), [
    [1, 'skipped', 'heading_context'],
    [3, 'requires_context', 'inherited_scope'],
    [4, 'requires_context', 'inherited_scope'],
    [5, 'requires_context', 'inherited_scope'],
    [6, 'requires_context', 'nested_list'],
    [8, 'requires_context', 'attached_blocks'],
    [14, 'requires_context', 'ordered_procedure'],
    [17, 'requires_context', 'list_introduction'],
    [19, 'requires_context', 'inherited_scope'],
  ]);
  assertSourceCoverage(report);
});

test('an excluded or linked introduction keeps its list for contextual review', () => {
  for (const intro of ['See @AGENTS.md first.', 'Follow [the policy](policy.md) here.', 'Use <b>these</b> rules.']) {
    const report = parseDocument(intro + '\n\n- Run the tests.');
    assert.deepEqual(report.units.map(({ state, reason }) => [state, reason]).at(-1), ['requires_context', 'inherited_scope'], intro);
    assert.notEqual(report.units[0].state, 'ready', intro);
  }
});

test('an introduction is scored with its list only when every item is ready and it fits', () => {
  const mixed = parseDocument('Before release:\n\n- Run the tests.\n- Run it again.');
  assert.deepEqual(mixed.units.map(({ state, reason, rule }) => [state, reason, rule]), [
    ['requires_context', 'list_introduction', 'Before release:'],
    ['ready', undefined, 'Before release:\nRun the tests.'],
    ['requires_context', 'inherited_scope', 'Run it again.'],
  ]);
  const long = parseDocument('Only on release branches ' + 'x'.repeat(1960) + '.\n\n- Run the full test suite before tagging.');
  assert.deepEqual(long.units.map(({ state, reason }) => [state, reason]), [['requires_context', 'list_introduction'], ['requires_context', 'inherited_scope']]);
  assertSourceCoverage(long);
});

test('a command, path or name reference entry is not scored unless it or its scope states a requirement', () => {
  const skipped = ['**Run all tests**: `build/sbt test`', 'Pregel framework: `build/sbt "testOnly *PregelSuite"`', '`pnpm dev` - start the dev server',
    '`tests/lisp/` - ERT-style Emacs Lisp tests.', '`ASSIGN` - Assignment', '`controller/` -- HTTP controllers', '`make build` # build everything',
    '`anda_cli`: CLI entrypoint.', '**Build:** `make`', '`pnpm dev`'];
  const ready = ['`pnpm lint` must pass before committing', 'Run `pnpm test` before committing.', '`src/legacy/` - do not edit',
    '**Before committing**: `pnpm test`', 'Prefix unused parameters with underscore: `(_unused, used) => ...`', 'Use `pnpm`',
    '`a` / `b` - both helpers', '`pnpm dev` - start the dev server. Keep it running.', '`pnpm dev` - start the dev server\nand watch files'];
  for (const text of skipped) {
    for (const source of [text, '## Commands\n\n- ' + text]) {
      assert.deepEqual(parseDocument(source).units.map(({ state, reason, rule }) => [state, reason, rule]).at(-1), ['skipped', 'reference_entry', ''], source);
    }
  }
  for (const text of ready) assert.equal(parseDocument(text).units[0].state, 'ready', text);
  const linked = parseDocument('`profile.py` - profiling tool (see [Profiling](#profiling))').units[0];
  assert.deepEqual([linked.state, linked.reason], ['requires_context', 'linked_context']);
  const scoped = parseDocument('## When developing\n\n- `pnpm dev` - start the dev server');
  assert.deepEqual(scoped.units.map(({ state, rule }) => [state, rule]).at(-1), ['ready', 'When developing:\n`pnpm dev` - start the dev server']);
  const nested = parseDocument('- `pnpm dev` - start the dev server\n  - `pnpm dev --host` - expose it on the network');
  assert.deepEqual(nested.units.map(({ state, reason }) => [state, reason]), [['ready', undefined]]);
});

test('an introduction labels a reference list, and is scored with a list that mixes rules and references', () => {
  const units = source => parseDocument(source).units.map(({ state, reason, rule }) => [state, reason, rule]);
  assert.deepEqual(units('Common commands:\n\n- `pnpm dev` - start the dev server\n- `pnpm build` - build for production'), [
    ['skipped', 'reference_entry', ''], ['skipped', 'reference_entry', ''], ['skipped', 'reference_entry', ''],
  ]);
  assert.deepEqual(units('Before opening a PR, run:\n\n- `pnpm lint`\n- `pnpm test`'), [
    ['ready', undefined, 'Before opening a PR, run:\n- `pnpm lint`\n- `pnpm test`'],
    ['ready', undefined, 'Before opening a PR, run:\n`pnpm lint`'],
    ['ready', undefined, 'Before opening a PR, run:\n`pnpm test`'],
  ]);
  assert.deepEqual(units('Scripts:\n\n- `pnpm dev` - start the dev server\n- Keep the server running.'), [
    ['ready', undefined, 'Scripts:\n- `pnpm dev` - start the dev server\n- Keep the server running.'],
    ['skipped', 'reference_entry', ''],
    ['ready', undefined, 'Scripts:\nKeep the server running.'],
  ]);
});

test('a file over the ready-excerpt limit keeps each unit its context and leaves the later ones over the limit', () => {
  const plain = Array(140).fill('- Preserve requirements.').join('\n');
  const nested = Array(5).fill('- Keep tests fast.\n  - Avoid network calls.').join('\n');
  const scoped = '# When releasing\n\n' + Array(6).fill('- Tag the release.').join('\n');
  const relaxed = '# Notes\n\nRead [the guide](guide.md) first.\n\nKeep the key secret and never print it.';
  const report = parseDocument([plain + '\n' + nested, scoped, relaxed].join('\n\n'));
  const ready = report.units.filter(unit => unit.state === 'ready');
  const over = report.units.filter(unit => unit.reason === 'over_limit');
  assert.equal(ready.length, LIMITS.rules);
  assert.ok(ready.slice(140, 145).every(unit => unit.rule === 'Keep tests fast.\n- Avoid network calls.'));
  assert.ok(ready.slice(145).every(unit => unit.rule === 'When releasing:\nTag the release.' && unit.withContext === true));
  // The last scoped item, the linked-file instruction and the resolved pronoun are over the limit, in document order.
  assert.deepEqual(over.map(({ state, rule, withContext, linkedUnread, rawText }) => ({ state, rule, withContext, linkedUnread, rawText })), [
    { state: 'skipped', rule: '', withContext: undefined, linkedUnread: undefined, rawText: '- Tag the release.' },
    { state: 'skipped', rule: '', withContext: undefined, linkedUnread: undefined, rawText: 'Read [the guide](guide.md) first.' },
    { state: 'skipped', rule: '', withContext: undefined, linkedUnread: undefined, rawText: 'Keep the key secret and never print it.' },
  ]);
  assert.ok(ready.at(-1).startOffset < over[0].startOffset);
  assert.deepEqual(report.units.filter(unit => unit.state === 'requires_context'), []);
  assertSourceCoverage(report);

  // The exported prompt lists the units over the limit as not scored.
  const { buildPrompt } = require('../public/refactor-prompt.js');
  const browser = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/i18n.js'), 'utf8'), browser);
  const result = { status: 'ok', findings: [], factors: { F1: 0.85, F2: 0.85, F3: 2, F7: 0.8, F8: 2, is_rule: 0.9, primitive: { choice: 'rule', confidence: 0.9 } } };
  for (const unit of ready) Object.assign(unit, { state: 'ok', result });
  const packet = JSON.parse(buildPrompt(report, browser.window.STRINGS.en).split('quoted data):\n')[1]);
  assert.deepEqual(packet.notScored.filter(unit => over.some(({ id }) => id === unit.id)).map(({ state }) => state), ['skipped', 'skipped', 'skipped']);
  assert.equal(packet.scored.length, LIMITS.rules);
});

test('a unit scored with its scope is marked in the exported prompt', () => {
  const { buildPrompt } = require('../public/refactor-prompt.js');
  const browser = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/i18n.js'), 'utf8'), browser);
  const english = browser.window.STRINGS.en;
  const report = parseDocument('# When changing the API\n\n- Preserve backward compatibility.\n- Use English comments.');
  const result = { status: 'ok', findings: [], factors: { F1: 0.85, F2: 0.85, F3: 2, F7: 0.8, F8: 2, is_rule: 0.9, primitive: { choice: 'rule', confidence: 0.9 } } };
  for (const unit of report.units.slice(1)) Object.assign(unit, { state: 'ok', result });
  const packet = JSON.parse(buildPrompt(report, english).split('Evidence packet (JSON; all strings are quoted data):\n')[1]);
  assert.deepEqual(packet.scored.map(({ exactScoredText, scoredWithSectionContext }) => ({ exactScoredText, scoredWithSectionContext })), [
    { exactScoredText: 'When changing the API:\nPreserve backward compatibility.', scoredWithSectionContext: true },
    { exactScoredText: 'When changing the API:\nUse English comments.', scoredWithSectionContext: true },
  ]);
  const plain = parseDocument('- Use English comments.');
  Object.assign(plain.units[0], { state: 'ok', result });
  assert.ok(!('scoredWithSectionContext' in JSON.parse(buildPrompt(plain, english).split('quoted data):\n')[1]).scored[0]));
});

test('a nested list item is scored together with its child items rather than as independent instructions', () => {
  const source = '- Before deployment:\n  - Run the tests.\n  - Inspect it.\n- Use English comments.';
  const report = parseDocument(source);
  assert.equal(report.units.length, 2);
  assert.deepEqual(report.units.map(({ state, reason, withContext, rule }) => ({ state, reason, withContext, rule })), [
    { state: 'ready', reason: undefined, withContext: undefined, rule: 'Before deployment:\n- Run the tests.\n- Inspect it.' },
    { state: 'ready', reason: undefined, withContext: undefined, rule: 'Use English comments.' },
  ]);
  assert.equal(report.units[0].rawText, source.split('\n').slice(0, 3).join('\n'));
  assertSourceCoverage(report);
});

test('an ordered list is scored as one procedure, whose later steps may refer to earlier ones', () => {
  const source = '1. Build the application.\n2. Inspect the result.\n3. Then deploy it.';
  const report = parseDocument(source);
  assert.equal(report.units.length, 1);
  assert.deepEqual([report.units[0].state, report.units[0].reason, report.units[0].rule, report.units[0].withContext],
    ['ready', undefined, source, undefined]);
  assert.equal(report.units[0].rawText, source);
  assertSourceCoverage(report);
});

test('a nested item or procedure is scored after its section heading and introduction, on its own lines', () => {
  const source = '# Project\n\n## When releasing\n\nBefore you tag the release:\n\n1. Update the changelog.\n2. Run the tests:\n   - unit tests\n   - browser checks\n\n- Before merging:\n  - Rebase the branch.';
  const report = parseDocument(source);
  assert.deepEqual(report.units.map(({ startLine, endLine, state, reason, withContext, rule }) => ({ startLine, endLine, state, reason, withContext, rule })), [
    { startLine: 1, endLine: 1, state: 'skipped', reason: 'heading_context', withContext: undefined, rule: '' },
    { startLine: 3, endLine: 3, state: 'skipped', reason: 'heading_context', withContext: undefined, rule: '' },
    { startLine: 5, endLine: 5, state: 'requires_context', reason: 'list_introduction', withContext: undefined, rule: 'Before you tag the release:' },
    { startLine: 7, endLine: 10, state: 'ready', reason: undefined, withContext: true,
      rule: 'When releasing:\nBefore you tag the release:\n1. Update the changelog.\n2. Run the tests:\n   - unit tests\n   - browser checks' },
    { startLine: 12, endLine: 13, state: 'ready', reason: undefined, withContext: true, rule: 'When releasing:\nBefore merging:\n- Rebase the branch.' },
  ]);
  assertSourceCoverage(report);
});

test('a nested item or procedure keeps its reason when it depends on other text or holds more than rules', () => {
  const nested = {
    'its first line points elsewhere': '- Run it before release:\n  - Tag the build.',
    'it ends by introducing more': '- Before release:\n  - Check:',
    'it holds a code example': '- Before release:\n  - Run the tests:\n\n    ```sh\n    npm test\n    ```',
    'a child has two paragraphs': '- Before release:\n  - Tag the build.\n\n    Push the tag.',
    'a child is a task': '- Before release:\n  - [ ] Tag the build.',
    'a child links to other context': '- Before release:\n  - Follow [the checklist](release.md).',
  };
  for (const [name, source] of Object.entries(nested)) {
    const report = parseDocument(source);
    assert.deepEqual(report.units.map(({ state, reason, withContext }) => ({ state, reason, withContext })),
      [{ state: 'requires_context', reason: 'nested_list', withContext: undefined }], name);
    assertSourceCoverage(report);
  }
  const procedures = {
    'its first step points elsewhere': '1. Build it.\n2. Ship the build.',
    'its introduction points back': 'Otherwise:\n\n1. Build the app.\n2. Ship the build.',
    'its introduction is excluded': 'Read @AGENTS.md first.\n\n1. Build the app.\n2. Ship the build.',
    'it is too long with its scope': '# When releasing\n\nOnly on release branches ' + 'x'.repeat(1960) + '.\n\n1. Build the app.\n2. Ship the build.',
  };
  for (const [name, source] of Object.entries(procedures)) {
    const unit = parseDocument(source).units.at(-1);
    assert.deepEqual([unit.state, unit.reason, unit.rule, unit.withContext],
      ['requires_context', 'ordered_procedure', source.slice(source.indexOf('1. Build')), undefined], name);
  }
});

test('multiple paragraphs and attached examples stay with their parent item', () => {
  const source = '- Use the command below:\n\n  ```sh\n  npm test\n  ```\n\n- Preserve requirements.\n\n  Exceptions require approval.\n';
  const report = parseDocument(source);
  assert.equal(report.units.length, 2);
  assert.equal(report.units[0].reason, 'attached_blocks');
  assert.match(report.units[0].rawText, /npm test/);
  assert.equal(report.units[1].reason, 'multiple_paragraphs');
  assertSourceCoverage(report);
});

test('accounts for frontmatter, fenced examples, tables, quotes, HTML, and separators', () => {
  const source = '---\nname: demo\n---\n\n# Rules\n\n```md\n- Do not score this example.\n```\n\n| Command | Meaning |\n| --- | --- |\n| npm test | Test |\n\n> Quoted instructions are evidence.\n\n<div>Use unsafe HTML.</div>\n\n***\n\n- Preserve requirements.';
  const report = parseDocument(source);
  const reasons = report.units.map(unit => unit.reason);
  for (const reason of ['frontmatter', 'heading_context', 'code', 'table', 'quote', 'html', 'separator']) assert.ok(reasons.includes(reason), reason);
  assert.equal(report.units.at(-1).state, 'ready');
  assert.equal(report.units.filter(unit => unit.state === 'ready').length, 1);
  assertSourceCoverage(report);
});

test('a table does not introduce the list after it; a colon paragraph before a table still needs it', () => {
  const report = parseDocument('## Before remote work\n\n| Check | Command |\n| --- | --- |\n| Tests | npm test |\n\n- Do not commit `.only` tests.\n- Keep the lockfile.');
  assert.deepEqual(report.units.map(({ startLine, state, reason, rule }) => ({ startLine, state, reason, rule })), [
    { startLine: 1, state: 'skipped', reason: 'heading_context', rule: '' },
    { startLine: 3, state: 'skipped', reason: 'table', rule: '' },
    { startLine: 7, state: 'ready', reason: undefined, rule: 'Before remote work:\nDo not commit `.only` tests.' },
    { startLine: 8, state: 'ready', reason: undefined, rule: 'Before remote work:\nKeep the lockfile.' },
  ]);
  assertSourceCoverage(report);
  const colon = parseDocument('Run these before a release:\n\n| Check | Command |\n| --- | --- |\n| Tests | npm test |');
  assert.deepEqual(colon.units.map(({ state, reason }) => ({ state, reason })),
    [{ state: 'requires_context', reason: 'dependent_text' }, { state: 'skipped', reason: 'table' }]);
});

test('does not mistake pipes in ordinary text for a table', () => {
  assert.equal(parseDocument('Use A | B for the type union.').units[0].state, 'ready');
});

test('standalone @file imports remain unresolved and are never fetched', () => {
  const source = '@AGENTS.md\n\n- @.claude/rules/style.md';
  const report = parseDocument(source);
  assert.ok(report.units.every(unit => unit.state === 'skipped' && unit.reason === 'unresolved_reference'));
  assert.ok(report.units.every(unit => unit.rule === ''));
  assertSourceCoverage(report);
});

test('inline @file references are unresolved without mistaking email addresses for imports', () => {
  assert.equal(parseDocument('Read @AGENTS.md before making changes.').units[0].reason, 'unresolved_reference');
  assert.equal(parseDocument('Use owner@example.com in the contact field.').units[0].state, 'ready');
});

test('@ tokens inside code spans and code blocks are not file references', () => {
  for (const source of [
    'Install `@scope/name` before running the build.',
    '- Pin `@scope/name` to an exact version.',
    'Run ``npm install @scope/name`` before the build.',
    'Email owner@example.com about `@scope/name` releases.',
  ]) {
    const report = parseDocument(source);
    assert.equal(report.units.length, 1, source);
    assert.equal(report.units[0].state, 'ready', source);
    assert.equal(report.units[0].rule, source.replace(/^- /, ''), source);
  }
  const block = parseDocument('- Install the package:\n\n  ```sh\n  npm install @scope/name\n  ```');
  assert.deepEqual(block.units.map(({ state, reason }) => ({ state, reason })), [{ state: 'requires_context', reason: 'attached_blocks' }]);
  assertSourceCoverage(block);
});

test('an @file import outside code stays unresolved next to a code span', () => {
  for (const source of ['Read @AGENTS.md and install `@scope/name`.', '- `@scope/name` follows @.claude/rules/style.md', '`@scope/name has no closing backtick.']) {
    const report = parseDocument(source);
    assert.deepEqual(report.units.map(({ state, reason, rule }) => ({ state, reason, rule })), [{ state: 'skipped', reason: 'unresolved_reference', rule: '' }], source);
  }
});

test('a sentence is scored with its one example; prose introducing a list is scored with it', () => {
  const report = parseDocument('Run the command.\n\n```sh\nnpm test\n```\n\nRules for release builds.\n\n- Verify all checks.');
  assert.deepEqual([report.units[0].state, report.units[0].rule, report.units[0].withCode],
    ['ready', 'Run the command.\n```sh\nnpm test\n```', true]);
  assert.deepEqual([report.units[2].state, report.units[2].rule, report.units[2].rawText],
    ['ready', 'Rules for release builds.\n- Verify all checks.', 'Rules for release builds.']);
  assert.deepEqual([report.units[3].state, report.units[3].rule], ['ready', 'Rules for release builds.\nVerify all checks.']);
  assertSourceCoverage(report);
});

test('a paragraph ending in a colon or a sentence is scored with the one code block after it', () => {
  const report = parseDocument('After cloning, initialize the submodule:\n\n```bash\ngit submodule update --init\n```\n\nNext paragraph.');
  assert.deepEqual(report.units.map(({ startLine, endLine, state, reason, rule, withCode, withContext }) => ({ startLine, endLine, state, reason, rule, withCode, withContext })), [
    { startLine: 1, endLine: 1, state: 'ready', reason: undefined, rule: 'After cloning, initialize the submodule:\n```bash\ngit submodule update --init\n```', withCode: true, withContext: undefined },
    { startLine: 3, endLine: 5, state: 'skipped', reason: 'code', rule: '', withCode: undefined, withContext: undefined },
    { startLine: 7, endLine: 7, state: 'ready', reason: undefined, rule: 'Next paragraph.', withCode: undefined, withContext: undefined },
  ]);
  assertSourceCoverage(report);
  const cases = {
    '**Before (JUnit 4):**\n\n```java\n@Test\n```': '**Before (JUnit 4):**\n```java\n@Test\n```',
    'Run the checks:\n\n    npm test\n    npm run lint\n': 'Run the checks:\n```\nnpm test\nnpm run lint\n```',
    'Show the fence syntax:\n\n~~~ md\nUse ```sh fences.\n~~~': 'Show the fence syntax:\n````md\nUse ```sh fences.\n````',
    '# When releasing\n\nTag the build:\n\n```sh\ngit tag v1\n```': 'When releasing:\nTag the build:\n```sh\ngit tag v1\n```',
    '# Setup\n\nInstall the tools:\n\n```sh\nnpm ci\n```': 'Install the tools:\n```sh\nnpm ci\n```',
    'Generating tests with `pnpm new-test` is mandatory.\n\n```sh\npnpm new-test\n```': 'Generating tests with `pnpm new-test` is mandatory.\n```sh\npnpm new-test\n```',
    'Never skip the hooks!\n\n```sh\ngit commit\n```': 'Never skip the hooks!\n```sh\ngit commit\n```',
  };
  for (const [source, rule] of Object.entries(cases)) {
    const unit = parseDocument(source).units.find(unit => unit.kind === 'paragraph');
    assert.deepEqual([unit.state, unit.rule, unit.withCode], ['ready', rule, true], source);
  }
});

test('a code block introduction still needs context when it depends on more than that block', () => {
  for (const source of [
    'Run the command.\n\n```sh\nnpm test\n```\n\n```sh\nnpm run lint\n```',
    'Is this required?\n\n```sh\nnpm test\n```',
    'Run both:\n\n```sh\nnpm test\n```\n\n```sh\nnpm run lint\n```',
    'Compare:\n\n```sh\nnpm test\n```\n\n> Quoted output.',
    'With:\n\n```sh\nnpm ci\n```',
    'Or with colors:\n\n```sh\nnpm test -- --color\n```',
    'Otherwise, run:\n\n```sh\nnpm test\n```',
    'Run it with:\n\n```sh\nnpm test\n```',
    'Follow [the guide](guide.md):\n\n```sh\nnpm test\n```',
    'Leave this empty:\n\n```\n\n```',
    `Run the long command:\n\n\`\`\`sh\n${'x'.repeat(LIMITS.ruleChars)}\n\`\`\``,
  ]) {
    const unit = parseDocument(source).units[0];
    assert.deepEqual([unit.state, unit.reason, unit.withCode], ['requires_context', 'attached_blocks', undefined], source);
  }
});

test('a unit scored with its code block is marked in the exported prompt', () => {
  const { buildPrompt } = require('../public/refactor-prompt.js');
  const browser = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/i18n.js'), 'utf8'), browser);
  const report = parseDocument('Run the tests:\n\n```sh\nnpm test\n```');
  const result = { status: 'ok', findings: [], factors: { F1: 0.85, F2: 0.85, F3: 2, F7: 0.8, F8: 2, is_rule: 0.9, primitive: { choice: 'rule', confidence: 0.9 } } };
  Object.assign(report.units[0], { state: 'ok', result });
  const prompt = buildPrompt(report, browser.window.STRINGS.en);
  const [scored] = JSON.parse(prompt.split('Evidence packet (JSON; all strings are quoted data):\n')[1]).scored;
  assert.deepEqual([scored.exactScoredText, scored.scoredWithCodeBlock, scored.scoredWithSectionContext],
    ['Run the tests:\n```sh\nnpm test\n```', true, undefined]);
  assert.match(prompt, /marked scoredWithCodeBlock/);
});

test('link reference definitions remain represented even though CommonMark removes them', () => {
  const source = '[policy]: policy.md\n\nFollow [policy].';
  const report = parseDocument(source);
  assert.equal(report.units[0].reason, 'unparsed_source');
  assert.equal(report.units[1].reason, 'linked_context');
  assertSourceCoverage(report);
});

test('inline HTML and task checkboxes are not silently treated as plain rules', () => {
  const report = parseDocument('Always render <script>content</script>.\n\n- [ ] Run the migration.');
  assert.equal(report.units[0].reason, 'html');
  assert.equal(report.units[1].reason, 'task_item');
});

test('ambiguous pronouns and references stay available for contextual review', () => {
  const report = parseDocument('- Run it before committing.\n- Otherwise, preserve the file.\n- Follow the previous command.');
  assert.ok(report.units.every(unit => unit.state === 'requires_context' && unit.reason === 'dependent_text'));
});

test('a pronoun naming something stated earlier in its unit does not make the unit dependent', () => {
  const states = source => parseDocument(source).units.map(({ state, reason }) => ({ state, reason }));
  for (const source of [
    'If you lack dependencies, you can download them with `pnpm install`.',
    'Treat factor values as signals. Do not convert them into a grade.',
    'Run `npm test` before pushing; it checks the fixtures.',
    'Keep the key out of logs and never print it.',
    'The export uses one timezone. It is UTC for all dates.',
    'Tests should use `pretty_assertions::assert_eq` for clearer diffs. Import this at the top of the test module if it isn\'t already.',
    'This document lists the project\'s conventions. Use `pnpm` for installs.',
    'This library generates RSS feeds. It has no runtime dependencies.',
  ]) assert.deepEqual(states(source), [{ state: 'ready', reason: undefined }], source);
  for (const source of [
    'Run it before committing.',
    'In practice this means: do not post comments. If a user asks, tell them the policy.',
    'These checks use raw values. Do not reconstruct them from rounded values.',
    'It builds the docs. Run `make docs` before every release.',
    'This runs the linter on staged files.',
    'These modules use their own package managers.',
    'Run `npm test` before pushing. Use the flags described below.',
    'Keep the build green. Run the checks in the same order as above.',
  ]) assert.deepEqual(states(source), [{ state: 'requires_context', reason: 'dependent_text' }], source);
});

test('an instruction to read or follow a linked Markdown file is scored as written and marked as not read', () => {
  for (const source of [
    'Read [the contribution guide](docs/contributing.md) before opening a pull request.',
    'Before changing the parser, read and follow\n[`PARSER.md`](./PARSER.md).',
    '- Follow [the release checklist](#release-checklist).',
    'Read and follow [`CONTRIBUTING.md`](CONTRIBUTING.md) as well - it lists the required checks.',
  ]) {
    const report = parseDocument(source);
    assert.deepEqual(report.units.map(({ state, reason, linkedUnread, withContext, rule }) => ({ state, reason, linkedUnread, withContext, rule })),
      [{ state: 'ready', reason: undefined, linkedUnread: true, withContext: undefined, rule: source.replace(/^- /, '') }], source);
    assertSourceCoverage(report);
  }
  for (const source of [
    'See [development setup](development.md) for browser checks.',
    'Read [the guide](guide.md) and the [style notes](style.md).',
    'Follow ![the diagram](diagram.md).',
    'Use the scripts in [tools](tools/README.md).',
  ]) {
    assert.deepEqual(parseDocument(source).units.map(({ state, reason, linkedUnread }) => ({ state, reason, linkedUnread })),
      [{ state: 'requires_context', reason: 'linked_context', linkedUnread: undefined }], source);
  }
  assert.deepEqual(parseDocument('Read [the notes](https://example.com/notes).').units.map(({ state, linkedUnread }) => [state, linkedUnread]), [['ready', undefined]]);

  const { buildPrompt } = require('../public/refactor-prompt.js');
  const browser = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/i18n.js'), 'utf8'), browser);
  const report = parseDocument('Read [the guide](guide.md) first.\n\nUse English comments.');
  const result = { status: 'ok', findings: [], factors: { F1: 0.85, F2: 0.85, F3: 2, F7: 0.8, F8: 2, is_rule: 0.9, primitive: { choice: 'rule', confidence: 0.9 } } };
  for (const unit of report.units) Object.assign(unit, { state: 'ok', result });
  const packet = JSON.parse(buildPrompt(report, browser.window.STRINGS.en).split('quoted data):\n')[1]);
  assert.deepEqual(packet.scored.map(({ exactScoredText, linkedContentNotRead }) => ({ exactScoredText, linkedContentNotRead })), [
    { exactScoredText: 'Read [the guide](guide.md) first.', linkedContentNotRead: true },
    { exactScoredText: 'Use English comments.', linkedContentNotRead: undefined },
  ]);
});

test('oversized individual units keep all source rather than truncating', () => {
  const source = 'Keep '.repeat(501);
  const report = parseDocument(source);
  assert.equal(report.units[0].reason, 'rule_too_long');
  assert.equal(report.units[0].rawText, source);
  assert.equal(report.units[0].rule, '');
});

test('file limit measures UTF-8 bytes, accepts boundary, and rejects excess without parsing', () => {
  assert.doesNotThrow(() => parseDocument('é'.repeat(LIMITS.fileBytes / 2)));
  assert.throws(() => parseDocument('é'.repeat(LIMITS.fileBytes / 2 + 1)), hasCode('file_too_large'));
  assert.throws(() => parseDocument('😀'.repeat(LIMITS.fileBytes / 4 + 1)), hasCode('file_too_large'));
});

test('rejects empty input and limits eligible rules without silently dropping any', () => {
  assert.throws(() => parseDocument(' \r\n\t'), hasCode('empty'));
  const states = count => parseDocument(Array(count).fill('- Preserve requirements.').join('\n')).units.map(({ state, reason }) => [state, reason]);
  assert.deepEqual(states(LIMITS.rules), Array(LIMITS.rules).fill(['ready', undefined]));
  assert.deepEqual(states(LIMITS.rules + 1), Array(LIMITS.rules).fill(['ready', undefined]).concat([['skipped', 'over_limit']]));
});

// Every stated copy of the limits agrees with LIMITS: the single-rule MAX in public/index.html,
// MAX_RULE_CHARS in lib/analyze.js, and the numbers README.md and public/research.html state. Prose
// is matched by number and unit, so rewording keeps the test green while a changed number fails it.
test('stated limits match LIMITS in public/document-model.js', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const max = Number(/const MAX = (\d+);/.exec(read('public/index.html'))?.[1]);
  assert.deepEqual({ max, maxRuleChars: require('../lib/analyze.js').MAX_RULE_CHARS },
    { max: LIMITS.ruleChars, maxRuleChars: LIMITS.ruleChars });
  const number = String.raw`(?<![\w-])(\d[\d,]*)`;
  const kinds = {
    kib: [new RegExp(number + String.raw`\s*KiB\b`, 'g'), LIMITS.fileBytes / 1024],
    blocks: [new RegExp(number + String.raw`\s+(?:[\w-]+\s+)?blocks\b`, 'g'), LIMITS.units],
    excerpts: [new RegExp(number + String.raw`\s+(?:[\w-]+\s+)?excerpts\b`, 'g'), LIMITS.rules],
    ruleLength: [new RegExp(number + String.raw`\s+(?:[\w-]+\s+){0,2}(?:units|characters)\b`, 'g'), LIMITS.ruleChars],
  };
  const stated = new Set(), wrong = [];
  for (const file of ['README.md', 'public/research.html']) {
    const text = read(file).replace(/\s+/g, ' ');
    for (const [kind, [pattern, expected]] of Object.entries(kinds)) {
      for (const match of text.matchAll(pattern)) {
        stated.add(kind);
        if (Number(match[1].replaceAll(',', '')) !== expected) wrong.push(`${file}: "${match[0]}" instead of ${expected}`);
      }
    }
  }
  assert.deepEqual(wrong, []);
  assert.deepEqual([...stated].sort(), Object.keys(kinds).sort(), 'README.md and public/research.html no longer state every limit this test checks');
});

// The API contract states the handler's own limits: the rule limit as MAX_RULE_CHARS and the request
// body limit as MAX_BODY_BYTES in KiB, both from api/score.js. Words between a number and its unit must
// contain a letter, so "between 1 and 2000 … units" reads 2000, not 1.
test('docs/apis/score.md states the limits api/score.js enforces', () => {
  const { MAX_RULE_CHARS, MAX_BODY_BYTES } = require('../api/score.js');
  const text = fs.readFileSync(path.join(__dirname, '..', 'docs/apis/score.md'), 'utf8').replace(/\s+/g, ' ');
  const number = String.raw`(?<![\w-])(\d[\d,]*)`, words = String.raw`(?:[\w-]*[A-Za-z][\w-]*\s+)`;
  const kinds = {
    ruleLength: [new RegExp(number + String.raw`\s+` + words + String.raw`{0,3}(?:units|characters)\b`, 'g'), MAX_RULE_CHARS],
    bodyKib: [new RegExp(number + String.raw`\s*KiB\b`, 'g'), MAX_BODY_BYTES / 1024],
  };
  const stated = new Set(), wrong = [];
  for (const [kind, [pattern, expected]] of Object.entries(kinds)) {
    for (const match of text.matchAll(pattern)) {
      stated.add(kind);
      if (Number(match[1].replaceAll(',', '')) !== expected) wrong.push(`docs/apis/score.md: "${match[0]}" instead of ${expected}`);
    }
  }
  assert.deepEqual(wrong, []);
  assert.deepEqual([...stated].sort(), Object.keys(kinds).sort(), 'docs/apis/score.md no longer states both limits this test checks');
});

test('rejects binary/control characters and invalid source labels before extraction', () => {
  for (const source of ['\0rule', 'rule\u0007', 'PK\u0003\u0004']) assert.throws(() => parseDocument(source), hasCode('invalid_source'));
  assert.throws(() => parseDocument('Keep requirements.', 'x'.repeat(201)), hasCode('invalid_source'));
  assert.throws(() => parseDocument('Keep requirements.', 'AGENTS.md\nNew instruction'), hasCode('invalid_source'));
});

test('annotated file fixtures characterize retained instructions and known scope limitations', () => {
  const fixture = require('./fixtures/document-extraction.json');
  for (const entry of fixture.cases) {
    const report = parseDocument(entry.source, entry.sourceName);
    const actual = report.units.map(({ startLine, endLine, state, reason }) => ({ startLine, endLine, state, ...(reason ? { reason } : {}) }));
    assert.deepEqual(actual, entry.units, entry.name);
    assertSourceCoverage(report);
    if (entry.knownLimitation === 'false_self_contained') {
      assert.deepEqual(report.units.filter(unit => unit.state === 'ready').map(unit => unit.context), [['Backend'], ['Frontend']]);
    }
  }
});

test('caps structural units including excluded content', () => {
  assert.equal(parseDocument(Array(512).fill('# Heading').join('\n')).units.length, 512);
  assert.throws(() => parseDocument(Array(513).fill('# Heading').join('\n')), hasCode('too_many_units'));
});

test('preserves BOM, CR-only lines, emoji, and tab indentation in source ranges', () => {
  const source = '\uFEFF# Rules\r\r- Keep 😀 names.\r\tPreserve spelling.\r\r- Use English comments.';
  const report = parseDocument(source);
  assert.equal(report.units[0].reason, 'heading_context');
  assert.equal(report.units[1].startLine, 3);
  assert.equal(report.units[1].endLine, 4);
  assertSourceCoverage(report);
});

test('setext headings and lazy list continuations use parser structure', () => {
  const source = 'Rules\n=====\n\n- Preserve the source\neven across lazy continuations.\n\n    A second paragraph belongs to the item.';
  const report = parseDocument(source);
  assert.equal(report.units[0].reason, 'heading_context');
  assert.equal(report.units[0].endLine, 2);
  assert.equal(report.units[1].reason, 'multiple_paragraphs');
  assert.equal(report.units.length, 2);
  assertSourceCoverage(report);
});

test('coverage counts do not treat non-success responses as scored or clean', () => {
  const units = [
    { state: 'ready' }, { state: 'pending' }, { state: 'ok', result: { findings: [] } },
    { state: 'ok', result: { findings: [{ id: 'hedge' }] } }, { state: 'skipped' },
    { state: 'requires_context' }, { state: 'not_english' }, { state: 'review' },
    { state: 'refused' }, { state: 'error' }, { state: 'cancelled' },
  ];
  assert.deepEqual(summarize({ units }), { total: 11, ready: 2, scored: 2, flagged: 1, unresolved: 5, failed: 1, cancelled: 1 });
});

test('browser scripts provide the same API with no module loader or network', () => {
  const sandbox = { TextEncoder };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of ['vendor/commonmark-0.31.2.min.js', 'document-model.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public', file), 'utf8'), sandbox);
  }
  assert.equal(sandbox.DisregardDocument.parseDocument('- Preserve requirements.').units[0].state, 'ready');
});

test('vendored distribution and license match the recorded source hashes', () => {
  const files = {
    'commonmark-0.31.2.min.js': '2de0f8ecbca0a6470da57c8b2ad043777ae999c5132f9abf12e8c332d4e46164',
    'commonmark-LICENSE.txt': '6cc4b9b28cf68e5bd20f9e94859a85cde35095ef4f9d0f7385b0b6166642f50b',
  };
  for (const [file, expected] of Object.entries(files)) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../public/vendor', file))).digest('hex');
    assert.equal(actual, expected, file);
  }
});

// The adapter has no fallback skip reason, so every top-level block type the
// parser can produce needs its own branch or skip reason in document-model.js.
const TOP_LEVEL_BLOCKS = ['block_quote', 'code_block', 'heading', 'html_block', 'list', 'paragraph', 'thematic_break'];

test('the parser produces no top-level block type the adapter does not handle', () => {
  const table = new commonmark.Parser().blocks;
  assert.ok(table, 'the parser no longer exposes its block table; check its top-level block types by hand');
  const types = Object.keys(table).filter(type => type !== 'document' && type !== 'item').sort();
  assert.deepEqual(types, TOP_LEVEL_BLOCKS, 'the parser\'s top-level block types changed; give each new type a branch or a skip reason in public/document-model.js, then update TOP_LEVEL_BLOCKS');
});

test('every block construct is extracted and no skipped unit lacks a reason', () => {
  const source = [
    '# ATX heading', '',
    'Setext heading', '==============', '',
    'A paragraph.', '',
    '- Bullet item.', '',
    '1. Ordered item.', '',
    '> Quoted text.', '',
    '```sh', 'npm test', '```', '',
    '    indented code', '',
    '<div>HTML block</div>', '',
    '***', '',
    '[reference]: https://example.com',
  ].join('\n');
  const topLevel = new Set();
  for (let node = new commonmark.Parser().parse(source).firstChild; node; node = node.next) topLevel.add(node.type);
  assert.deepEqual([...topLevel].sort(), TOP_LEVEL_BLOCKS, 'the sample must contain every top-level block type');
  const report = parseDocument(source);
  const unexplained = report.units.filter(unit => unit.state === 'skipped' && !unit.reason).map(unit => `${unit.kind} at line ${unit.startLine}`);
  assert.deepEqual(unexplained, [], 'give each skipped block a skip reason in public/document-model.js');
  assertSourceCoverage(report);
});

test('empty and whitespace-only list items are skipped with a reason, not sent for scoring', () => {
  for (const source of ['- ', '* ', '-      ', '*\t\t']) {
    const report = parseDocument(source);
    assert.deepEqual(report.units.map(({ startLine, endLine, rawText, rule, state, reason }) => ({ startLine, endLine, rawText, rule, state, reason })),
      [{ startLine: 1, endLine: 1, rawText: source, rule: '', state: 'skipped', reason: 'empty_item' }], JSON.stringify(source));
    assertSourceCoverage(report);
  }
});

test('a list mixing empty and real items skips only the empty ones', () => {
  const source = '- Keep requirements.\n- \n-    \n- Run the tests.';
  const report = parseDocument(source);
  assert.deepEqual(report.units.map(({ startLine, state, reason, rule }) => ({ startLine, state, rule, ...(reason ? { reason } : {}) })), [
    { startLine: 1, state: 'ready', rule: 'Keep requirements.' },
    { startLine: 2, state: 'skipped', rule: '', reason: 'empty_item' },
    { startLine: 3, state: 'skipped', rule: '', reason: 'empty_item' },
    { startLine: 4, state: 'ready', rule: 'Run the tests.' },
  ]);
  assertSourceCoverage(report);
});

test('list items holding only a task checkbox, markup or punctuation are skipped as empty', () => {
  for (const source of ['- [ ]', '- [x]', '- [X]', '- **', '- ...', '* [ ] **']) {
    const report = parseDocument(source);
    assert.deepEqual(report.units.map(({ startLine, endLine, rawText, rule, state, reason }) => ({ startLine, endLine, rawText, rule, state, reason })),
      [{ startLine: 1, endLine: 1, rawText: source, rule: '', state: 'skipped', reason: 'empty_item' }], JSON.stringify(source));
    assertSourceCoverage(report);
  }
});

test('a list mixing word-free items, task items and real items skips only the word-free ones', () => {
  const source = '- Keep requirements.\n- [ ]\n- [x] Update the changelog.\n- **\n- Run the tests.';
  const report = parseDocument(source);
  assert.deepEqual(report.units.map(({ startLine, state, reason, rule }) => ({ startLine, state, rule, ...(reason ? { reason } : {}) })), [
    { startLine: 1, state: 'ready', rule: 'Keep requirements.' },
    { startLine: 2, state: 'skipped', rule: '', reason: 'empty_item' },
    { startLine: 3, state: 'requires_context', rule: '[x] Update the changelog.', reason: 'task_item' },
    { startLine: 4, state: 'skipped', rule: '', reason: 'empty_item' },
    { startLine: 5, state: 'ready', rule: 'Run the tests.' },
  ]);
  assertSourceCoverage(report);
});
