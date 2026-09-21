/* Local structural extraction. Eligibility is conservative, not a semantic verdict. */
(function (root, factory) {
  const commonmark = typeof module === 'object' && module.exports
    ? require('./vendor/commonmark-0.31.2.min.js') : root.commonmark;
  const api = factory(commonmark);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DisregardDocument = api;
})(typeof window === 'object' ? window : null, function (commonmark) {
  'use strict';

  const LIMITS = Object.freeze({ fileBytes: 64 * 1024, rules: 40, units: 256, ruleChars: 2000 });
  const PARSER_VERSION = 'commonmark.js 0.31.2';

  function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }

  function linesOf(source) {
    const lines = [];
    const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
    let match;
    while ((match = pattern.exec(source))) {
      lines.push({ text: match[1], start: match.index, end: match.index + match[1].length });
      if (!match[2]) break;
    }
    return lines;
  }

  function inlineText(node) {
    const output = [];
    const walker = node.walker();
    let event;
    while ((event = walker.next())) {
      if (!event.entering) continue;
      if (event.node.type === 'text' || event.node.type === 'code') output.push(event.node.literal);
      if (event.node.type === 'softbreak' || event.node.type === 'linebreak') output.push(' ');
    }
    return output.join('').trim();
  }

  function descendants(node) {
    const nodes = [];
    const walker = node.walker();
    let event;
    while ((event = walker.next())) if (event.entering && event.node !== node) nodes.push(event.node);
    return nodes;
  }

  // These identify dependency risks, not whether a paragraph is an instruction.
  function contextualHeading(text) {
    return /\b(?:if|when|unless|before|after|during|while|until|except|only|windows|macos|linux)\b|^(?:for|on|in|under)\b/i.test(text);
  }

  function dependentText(text) {
    return /^(?:otherwise|then|instead|also|else|in that case|as above|as below)\b|\b(?:this|that|these|those|the following)\s+(?:rule|step|command|file|tool|setting|case|condition|process|requirement|approach|example|format)s?\b|\b(?:it|them|above|below|previous|aforementioned|former|latter)\b/i.test(text);
  }

  function looksLikeTable(text) {
    // Tables are a Markdown extension. Detect delimiter rows only to exclude them;
    // CommonMark still owns all block extraction and source locations.
    return text.split('\n').some(line => /^\s*\|?\s*:?-{3,}:?\s*\|(?:\s*:?-{3,}:?\s*\|?)+\s*$/.test(line));
  }

  function parseDocument(source, sourceName = 'AGENTS.md') {
    if (typeof source !== 'string') fail('invalid_source');
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(source)) fail('invalid_source');
    if (typeof sourceName !== 'string' || sourceName.length > 200 || /[\r\n\u0000]/.test(sourceName)) fail('invalid_source');
    if (!source.trim()) fail('empty');
    if (new TextEncoder().encode(source).length > LIMITS.fileBytes) fail('file_too_large');
    if (!commonmark || typeof commonmark.Parser !== 'function') fail('parser_unavailable');

    const lines = linesOf(source);
    const covered = new Set();
    const units = [];
    const headings = [];

    function add(startLine, endLine, kind, state, reason, context, rule) {
      // A range covers complete source lines; offsets are zero-based UTF-16,
      // end-exclusive, and exclude the final line terminator. rawText is exact.
      startLine = Math.max(1, startLine);
      endLine = Math.min(lines.length, Math.max(startLine, endLine));
      while (endLine > startLine && !lines[endLine - 1].text.trim()) endLine--;
      const startOffset = lines[startLine - 1].start;
      const endOffset = lines[endLine - 1].end;
      const rawText = source.slice(startOffset, endOffset);
      for (let line = startLine; line <= endLine; line++) covered.add(line);
      const unit = {
        id: '', startLine, endLine, startOffset, endOffset, rawText,
        rule: rule || '', context: context.slice(), state, kind,
      };
      if (reason) unit.reason = reason;
      units.push(unit);
      if (units.length > LIMITS.units) fail('too_many_units');
      return unit;
    }

    function addNode(node, state, reason, context, rule) {
      return add(node.sourcepos[0][0], node.sourcepos[1][0], node.type, state, reason, context, rule);
    }

    function rawNode(node) {
      return source.slice(lines[node.sourcepos[0][0] - 1].start, lines[node.sourcepos[1][0] - 1].end);
    }

    function normalized(node) {
      let text = rawNode(node).replace(/\r\n?/g, '\n');
      if (node.type === 'item') {
        const marker = text.match(/^[ \t]{0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+/);
        if (marker) {
          const indent = marker[0].length;
          const parts = text.split('\n');
          parts[0] = parts[0].slice(indent);
          for (let index = 1; index < parts.length; index++) {
            let count = 0;
            while (count < indent && /[ \t]/.test(parts[index][count] || '\0')) count++;
            parts[index] = parts[index].slice(count);
          }
          text = parts.join('\n');
        }
      }
      return text.trim();
    }

    function candidate(node, extraContext, forcedReason) {
      const context = headings.filter(Boolean).concat(extraContext || []);
      const text = normalized(node);
      const children = descendants(node);
      let state = 'ready';
      let reason;
      if (/(?:^|[\s("'`])@[^\s<>()"'`]+/.test(text)) {
        state = 'skipped'; reason = 'unresolved_reference';
      } else if (looksLikeTable(text)) {
        state = 'skipped'; reason = 'table';
      } else if (text.length > LIMITS.ruleChars) {
        state = 'skipped'; reason = 'rule_too_long';
      } else if (children.some(child => child.type === 'html_inline' || child.type === 'html_block')) {
        state = 'skipped'; reason = 'html';
      } else if (forcedReason) {
        state = 'requires_context'; reason = forcedReason;
      } else if (children.some(child => child.type === 'list')) {
        state = 'requires_context'; reason = 'nested_list';
      } else if (children.some(child => child.type === 'code_block' || child.type === 'block_quote' || child.type === 'heading')) {
        state = 'requires_context'; reason = 'attached_blocks';
      } else if (children.filter(child => child.type === 'paragraph').length > 1) {
        state = 'requires_context'; reason = 'multiple_paragraphs';
      } else if (/^\[[ xX]\]\s/.test(text)) {
        state = 'requires_context'; reason = 'task_item';
      } else if (context.some(contextualHeading) || (extraContext && extraContext.length)) {
        state = 'requires_context'; reason = 'inherited_scope';
      } else if (dependentText(text) || /:\s*$/.test(text)) {
        state = 'requires_context'; reason = 'dependent_text';
      } else if (children.some(child => (child.type === 'link' || child.type === 'image') && /(?:\.md(?:[?#]|$)|^#)/i.test(child.destination || ''))) {
        state = 'requires_context'; reason = 'linked_context';
      }
      return addNode(node, state, reason, context, state === 'skipped' ? '' : text);
    }

    // YAML frontmatter is not CommonMark. Mask the recognized prefix without
    // changing line numbers, then account for it as one excluded structural unit.
    let parseSource = source;
    const firstLine = lines[0].text.replace(/^\uFEFF/, '');
    if (firstLine.trim() === '---') {
      const closing = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line.text));
      if (closing > 0) {
        const end = lines[closing].end;
        add(1, closing + 1, 'frontmatter', 'skipped', 'frontmatter', [], '');
        parseSource = source.slice(0, end).replace(/[^\r\n]/g, ' ') + source.slice(end);
      }
    }
    // A UTF-8 BOM is source data but must not prevent first-line Markdown syntax.
    if (parseSource[0] === '\uFEFF') parseSource = ' ' + parseSource.slice(1);
    const tree = new commonmark.Parser({ smart: false }).parse(parseSource);
    let precedingScope = '';
    for (let node = tree.firstChild; node; node = node.next) {
      if (node.type === 'heading') {
        headings.length = node.level;
        headings[node.level - 1] = inlineText(node);
        addNode(node, 'skipped', 'heading_context', headings.filter(Boolean), '');
        precedingScope = '';
      } else if (node.type === 'list') {
        const extraContext = precedingScope ? [precedingScope] : [];
        if (node.listType === 'ordered') {
          candidate(node, extraContext, 'ordered_procedure');
        } else {
          for (let item = node.firstChild; item; item = item.next) candidate(item, extraContext);
        }
        precedingScope = '';
      } else if (node.type === 'paragraph') {
        const nextType = node.next && node.next.type;
        const dependency = nextType === 'list' ? 'list_introduction'
          : ['code_block', 'block_quote', 'html_block'].includes(nextType) ? 'attached_blocks' : undefined;
        candidate(node, [], dependency);
        // A paragraph introducing the next list may provide its condition even
        // without a colon. Keep it separately; do not prepend it to scored text.
        precedingScope = node.next && node.next.type === 'list' ? normalized(node) : '';
      } else {
        const reasons = { code_block: 'code', block_quote: 'quote', html_block: 'html', thematic_break: 'separator' };
        addNode(node, 'skipped', reasons[node.type] || 'unsupported_block', headings.filter(Boolean), '');
        precedingScope = '';
      }
    }

    // CommonMark intentionally removes reference definitions from the AST.
    // Retain every nonblank line omitted by the AST as explicit coverage gaps.
    for (let index = 0; index < lines.length; index++) {
      if (covered.has(index + 1) || !lines[index].text.trim()) continue;
      const start = index;
      while (index + 1 < lines.length && !covered.has(index + 2) && lines[index + 1].text.trim()) index++;
      add(start + 1, index + 1, 'unparsed', 'skipped', 'unparsed_source', [], '');
    }
    units.sort((left, right) => left.startOffset - right.startOffset);
    units.forEach((unit, index) => { unit.id = `unit-${index + 1}`; });
    if (units.filter(unit => unit.state === 'ready').length > LIMITS.rules) fail('too_many_rules');
    return { schemaVersion: 1, sourceName: sourceName || 'AGENTS.md', sourceText: source, parserVersion: PARSER_VERSION, units };
  }

  function summarize(report) {
    const summary = { total: 0, ready: 0, scored: 0, flagged: 0, unresolved: 0, failed: 0, cancelled: 0 };
    for (const unit of report.units) {
      summary.total++;
      if (unit.state === 'ready' || unit.state === 'pending') summary.ready++;
      else if (unit.state === 'ok') {
        summary.scored++;
        if (unit.result && Array.isArray(unit.result.findings) && unit.result.findings.length) summary.flagged++;
      } else if (unit.state === 'error') summary.failed++;
      else if (unit.state === 'cancelled') summary.cancelled++;
      else summary.unresolved++;
    }
    return summary;
  }

  return { parseDocument, summarize, LIMITS, PARSER_VERSION };
});
