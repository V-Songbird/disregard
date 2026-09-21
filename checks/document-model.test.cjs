const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { parseDocument, summarize, LIMITS } = require('../public/document-model.js');

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

test('keeps inherited conditional headings out of isolated scoring', () => {
  const report = parseDocument('# When changing the API\n- Preserve backward compatibility.\n\n# General\n- Use English comments.');
  assert.equal(report.units[1].state, 'requires_context');
  assert.equal(report.units[1].reason, 'inherited_scope');
  assert.equal(report.units[1].rule, 'Preserve backward compatibility.');
  assert.equal(report.units[3].state, 'ready');
});

test('parent paragraph context is retained even without a colon', () => {
  const source = 'Only apply the following rules to release branches.\n\n- Run every check.\n- Update the release notes.';
  const report = parseDocument(source);
  for (const unit of report.units.slice(1)) {
    assert.equal(unit.state, 'requires_context');
    assert.deepEqual(unit.context, ['Only apply the following rules to release branches.']);
  }
  assertSourceCoverage(report);
});

test('nested lists stay together rather than claiming independent child instructions', () => {
  const source = '- Before deployment:\n  - Run the tests.\n  - Inspect the artifact.\n- Use English comments.';
  const report = parseDocument(source);
  assert.equal(report.units.length, 2);
  assert.equal(report.units[0].state, 'requires_context');
  assert.equal(report.units[0].reason, 'nested_list');
  assert.equal(report.units[0].rawText, source.split('\n').slice(0, 3).join('\n'));
  assert.equal(report.units[1].state, 'ready');
  assertSourceCoverage(report);
});

test('ordered procedures remain a single context-dependent unit', () => {
  const source = '1. Build the application.\n2. Inspect the result.\n3. Deploy the artifact.';
  const report = parseDocument(source);
  assert.equal(report.units.length, 1);
  assert.equal(report.units[0].reason, 'ordered_procedure');
  assert.equal(report.units[0].rawText, source);
  assertSourceCoverage(report);
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

test('prose introducing examples or a list is not scored independently', () => {
  const report = parseDocument('Run the command.\n\n```sh\nnpm test\n```\n\nRules for release builds.\n\n- Verify all checks.');
  assert.equal(report.units[0].reason, 'attached_blocks');
  assert.equal(report.units[2].reason, 'list_introduction');
  assert.equal(report.units[3].reason, 'inherited_scope');
  assertSourceCoverage(report);
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
  assert.equal(parseDocument(Array(40).fill('- Preserve requirements.').join('\n')).units.length, 40);
  assert.throws(() => parseDocument(Array(41).fill('- Preserve requirements.').join('\n')), hasCode('too_many_rules'));
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
  assert.equal(parseDocument(Array(256).fill('# Heading').join('\n')).units.length, 256);
  assert.throws(() => parseDocument(Array(257).fill('# Heading').join('\n')), hasCode('too_many_units'));
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
