/* Local structural extraction. Eligibility is conservative, not a semantic verdict. */
(function (root, factory) {
  const commonmark = typeof module === 'object' && module.exports
    ? require('./vendor/commonmark-0.31.2.min.js') : root.commonmark;
  const api = factory(commonmark);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DisregardDocument = api;
})(typeof window === 'object' ? window : null, function (commonmark) {
  'use strict';

  const LIMITS = Object.freeze({ fileBytes: 64 * 1024, rules: 150, units: 512, ruleChars: 2000 });
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

  // Claude Code's import parsing skips code spans and fenced code blocks. When a
  // block contains code, a match in the source counts only if the parsed text
  // outside that code has one too.
  const REFERENCE = /(?:^|[\s("'`])@[^\s<>()"'`]+/;
  function referencesFile(text, children) {
    const outsideCode = children.filter(child => child.type !== 'code' && child.type !== 'code_block');
    return REFERENCE.test(text) && (outsideCode.length === children.length
      || outsideCode.some(child => [child.literal, child.destination, child.title].some(value => REFERENCE.test(value || ''))));
  }

  // These identify dependency risks, not whether a paragraph is an instruction.
  function contextualHeading(text) {
    return /\b(?:if|when|unless|before|after|during|while|until|except|only|windows|macos|linux)\b|^(?:for|on|in|under)\b/i.test(text);
  }

  // Text pointing back to earlier instructions. An introduction that does so is
  // not a complete scope for its list.
  function refersBack(text) {
    return /^(?:otherwise|then|instead|also|else|in that case|as above|as below)\b|\b(?:above|previous|aforementioned|former|latter)\b/i.test(text);
  }

  // Words that point outside the unit count anywhere in it. Demonstratives and pronouns count only in
  // its first sentence: a later "this" or "it" usually refers to something the unit already names, and
  // the unit is scored as a whole. A first sentence that opens with a demonstrative, other than one
  // naming the document or project itself, or says "this means", depends on earlier text. A bare
  // demonstrative later in the first sentence ("Set these ...") is no longer caught by a later
  // pronoun; that trade is accepted.
  function dependentText(text) {
    const first = text.split(/(?<=[.!?])\s+(?=[A-Z*`_\[])/)[0];
    return refersBack(text) || /\bthe following\s+(?:rule|step|command|file|tool|setting|case|condition|process|requirement|approach|example|format)s?\b|\bbelow\b/i.test(text)
      || /\b(?:this|that|these|those)\s+(?:rule|step|command|file|tool|setting|case|condition|process|requirement|approach|example|format)s?\b/i.test(first)
      || /^\W*(?:this|these|those|that)\s+(?!(?:is|file|document(?:ation)?|guide|section|repo(?:sitory)?|project|library|codebase)\b)\w/i.test(first) || /\bthis means\b/i.test(first)
      || unresolvedPronoun(first);
  }

  // A bare "it" or "them" can refer to something named earlier in the same unit: code, a link or
  // file name, a noun after an article or possessive, or a plural noun. It still depends on other
  // text when it starts a sentence, when nothing before it could be its referent, or when the unit
  // also points elsewhere with "this", "these", "those" or a sentence-initial "they".
  function unresolvedPronoun(text) {
    const pronouns = [...text.matchAll(/\b(?:it|them)\b/gi)];
    return pronouns.length > 0 && (/\b(?:this|these|those)\b|(?:^|[.!?]\W*\s)\W*they\b/i.test(text) || pronouns.some(({ index }) => {
      const before = text.slice(0, index);
      return /(?:^|[.!?]\W*\s)\W*$/.test(before) || !referent(before);
    }));
  }

  function referent(text) {
    return /`[^`]+`|\[[^\]]+\]|\b[\w-]{2,}\.[a-z][a-z0-9]{0,4}\b|\b(?:the|a|an|your|our|each|every)\s+\w/i.test(text) ||
      text.split(/[^\w'-]+/).some(word => /^[a-z]{2,}[^\Wisu]s$/i.test(word) && !/^(?:always|does|sometimes|perhaps|towards|afterwards|besides|whereas)$/i.test(word));
  }

  const CONTEXT_LINK = /(?:\.md(?:[?#]|$)|^#)/i;
  function contextLinks(children) {
    return children.filter(child => (child.type === 'link' || child.type === 'image') && CONTEXT_LINK.test(child.destination || ''));
  }

  function linksContext(children) {
    return contextLinks(children).length > 0;
  }

  // An instruction to read or follow each linked Markdown file or section can be judged as written,
  // although the linked content is still not read.
  function readsLinks(text, children) {
    const targets = [...text.matchAll(/\b(?:read|follow)(?:\s+and\s+(?:read|follow))?\s+(?:the\s+)?\[[^\]]*\]\(<?([^)\s>]+)/gi)];
    return targets.filter(match => CONTEXT_LINK.test(match[1])).length === contextLinks(children).length;
  }

  function looksLikeTable(text) {
    // Tables are a Markdown extension. Detect delimiter rows only to exclude them;
    // CommonMark still owns all block extraction and source locations.
    return text.split('\n').some(line => /^\s*\|?\s*:?-{3,}:?\s*\|(?:\s*:?-{3,}:?\s*\|?)+\s*$/.test(line));
  }

  // A reference entry names a command, path or identifier on one line: an optional label of up to four
  // words, one code span, and an optional one-sentence description. Instruction guides recommend such
  // lists, and there is nothing to judge unless the entry or its scope states a requirement or condition.
  const REFERENCE_ENTRY = /^(?:(\*\*[^*`]+\*\*:?|__[^_`]+__:?|[^`:\n]+:)\s*)?(`+)[^`\n](?:[^`\n]*[^`\n])?\2\.?(?:(?:\s+(?:--|[-\u2013\u2014#])|:)\s+([^`\n]+))?$/;
  const REQUIREMENT = /\b(?:must|should|always|never|only|if|unless|when(?:ever)?|before|after|until|while|during|except|do not|don['\u2019]t|avoid|require[sd]?|needs?|ensure|make sure|prefer|instead|keep|use)\b/i;
  function referenceEntry(text, scope) {
    const match = REFERENCE_ENTRY.exec(text);
    const label = match && match[1] ? match[1].replace(/[*_:]/g, ' ').trim().split(/\s+/) : [];
    const description = match && match[3] || '';
    return !!match && label.length <= 4 && description.length <= 120 && !/[.!?]\s+\S/.test(description)
      && !REQUIREMENT.test(label.concat(description, scope).join('\n'));
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

    // The scope stated before a scored rule: the section heading, any conditional
    // heading above it, then an introducing paragraph. Each line ends in punctuation
    // so the rule after it starts its own clause.
    function scopeLines(intro) {
      const parts = headings.filter((heading, index) => heading && (index === headings.length - 1 || contextualHeading(heading)));
      return parts.concat(intro ? intro.text : []).map(part => /[.!?:]$/.test(part) ? part : part + ':');
    }

    // intro is the paragraph introducing a list item's list: { text, unit, readable }.
    function candidate(node, intro, forcedReason) {
      const context = headings.filter(Boolean).concat(intro ? intro.text : []);
      const text = normalized(node);
      const children = descendants(node);
      const whole = node.type === 'list' ? 'ordered_procedure' : children.some(child => child.type === 'list') ? 'nested_list' : '';
      let state = 'ready';
      let reason;
      let rule = text;
      if (!text || (node.type === 'item' && !/[\p{L}\p{N}]/u.test(text.replace(/^\[[ xX]\]/, '')))) {
        // A list item with no letter or number after an optional task checkbox,
        // such as an empty item, '[ ]' or '**', has nothing to score.
        state = 'skipped'; reason = 'empty_item';
      } else if (referencesFile(text, children)) {
        state = 'skipped'; reason = 'unresolved_reference';
      } else if (looksLikeTable(text)) {
        state = 'skipped'; reason = 'table';
      } else if (text.length > LIMITS.ruleChars) {
        state = 'skipped'; reason = 'rule_too_long';
      } else if (children.some(child => child.type === 'html_inline' || child.type === 'html_block')) {
        state = 'skipped'; reason = 'html';
      } else if (forcedReason) {
        state = 'requires_context'; reason = forcedReason;
      } else if (whole) {
        // A list item with its nested items, or an ordered list, is scored as one block,
        // after its scope when a single rule there would be. Its lines may refer to each
        // other, so only its first paragraph is checked for depending on other text. Each
        // item needs exactly one paragraph.
        const paragraphs = children.filter(child => child.type === 'paragraph');
        const items = [node].concat(children).filter(child => child.type === 'item');
        const scopedText = (!intro || intro.readable) &&
          (context.some(contextualHeading) || intro ? scopeLines(intro) : []).concat(text).join('\n');
        if (scopedText && scopedText.length <= LIMITS.ruleChars && paragraphs.length && !dependentText(inlineText(paragraphs[0]))
          && items.every(item => paragraphs.filter(child => child.parent === item).length === 1)
          && !paragraphs.some(child => /^\[[ xX]\]\s/.test(inlineText(child)))
          && !children.some(child => child.type === 'code_block' || child.type === 'block_quote' || child.type === 'heading')
          && !/:\s*$/.test(text) && !linksContext(children)) {
          rule = scopedText;
        } else {
          state = 'requires_context'; reason = whole;
        }
      } else if (children.some(child => child.type === 'code_block' || child.type === 'block_quote' || child.type === 'heading')) {
        state = 'requires_context'; reason = 'attached_blocks';
      } else if (children.filter(child => child.type === 'paragraph').length > 1) {
        state = 'requires_context'; reason = 'multiple_paragraphs';
      } else if (/^\[[ xX]\]\s/.test(text)) {
        state = 'requires_context'; reason = 'task_item';
      } else if (referenceEntry(text, scopeLines(intro)) && !linksContext(children)) {
        state = 'skipped'; reason = 'reference_entry';
      } else if (context.some(contextualHeading) || intro) {
        // A scoped rule that depends on nothing else is scored with its scope first,
        // unless its introduction was itself excluded or the result is too long.
        const scopedText = (!intro || intro.readable) && scopeLines(intro).concat(text).join('\n');
        if (scopedText && scopedText.length <= LIMITS.ruleChars && !dependentText(text) && !/:\s*$/.test(text) && !linksContext(children)) {
          rule = scopedText;
        } else {
          state = 'requires_context'; reason = 'inherited_scope';
        }
      } else if (dependentText(text) || /:\s*$/.test(text)) {
        state = 'requires_context'; reason = 'dependent_text';
      } else if (linksContext(children) && !readsLinks(text, children)) {
        state = 'requires_context'; reason = 'linked_context';
      }
      const unit = addNode(node, state, reason, context, state === 'skipped' ? '' : rule);
      // Only ready units carry a rule other than their own text: the ones scored with their scope.
      if (rule !== text) unit.withContext = true;
      else if (state === 'ready' && linksContext(children)) unit.linkedUnread = true;
      return unit;
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
    let intro = null;
    for (let node = tree.firstChild; node; node = node.next) {
      if (node.type === 'heading') {
        headings.length = node.level;
        headings[node.level - 1] = inlineText(node);
        addNode(node, 'skipped', 'heading_context', headings.filter(Boolean), '');
        intro = null;
      } else if (node.type === 'list') {
        if (node.listType === 'ordered') {
          candidate(node, intro);
        } else {
          // An introduction is scored with its list after it when every item is ready or a reference
          // entry. It labels a reference list, and is not scored, when every item is a reference entry.
          let listed = intro && intro.readable && [intro.text];
          let references = listed;
          for (let item = node.firstChild; item; item = item.next) {
            const unit = candidate(item, intro);
            if (unit.reason !== 'reference_entry') references = null;
            if (unit.state !== 'ready' && unit.reason !== 'reference_entry') listed = null;
            if (listed) listed.push('- ' + normalized(item).replace(/\n/g, '\n  '));
          }
          const introduced = listed && scopeLines(null).concat(listed).join('\n');
          if (references) {
            Object.assign(intro.unit, { state: 'skipped', reason: 'reference_entry', rule: '' });
          } else if (introduced && introduced.length <= LIMITS.ruleChars) {
            Object.assign(intro.unit, { state: 'ready', rule: introduced, withContext: true }); delete intro.unit.reason;
          }
        }
        intro = null;
      } else if (node.type === 'paragraph') {
        const nextType = node.next && node.next.type;
        const dependency = nextType === 'list' ? 'list_introduction'
          : ['code_block', 'block_quote', 'html_block'].includes(nextType) ? 'attached_blocks' : undefined;
        const unit = candidate(node, null, dependency);
        const text = normalized(node);
        // A paragraph ending in ':' that introduces one nonempty code block is scored with the block
        // after it, in a fence, unless another block follows, the paragraph depends on earlier text
        // (including a continuation such as "With:" or "Or with colors:") or links to context not read
        // here, or the result is too long. The code block stays skipped.
        const block = node.next;
        if (unit.reason === 'attached_blocks' && nextType === 'code_block' && /:$/.test(inlineText(node)) && block.literal.trim()
            && !(block.next && ['code_block', 'block_quote', 'html_block'].includes(block.next.type))
            && !refersBack(text) && !/^(?:or|and|but|with|plus)\b/i.test(text) && !unresolvedPronoun(text)
            && !linksContext(descendants(node))) {
          const fence = '`'.repeat(Math.max(3, ...(block.literal.match(/`+/g) || []).map(run => run.length + 1)));
          const code = fence + (/`/.test(block.info || '') ? '' : block.info || '') + '\n' + block.literal.replace(/\n$/, '') + '\n' + fence;
          const rule = (unit.context.some(contextualHeading) ? scopeLines(null) : []).concat(text, code).join('\n');
          if (rule.length <= LIMITS.ruleChars) {
            Object.assign(unit, { state: 'ready', rule, withCode: true }); delete unit.reason;
          }
        }
        // A paragraph introducing the next list may provide its condition even
        // without a colon. It is stated before each item unless it was excluded
        // itself, points back to earlier text, or links to context not read here.
        // A table introduces nothing, so its list is scored as if it followed the heading.
        intro = nextType === 'list' && unit.reason !== 'table' ? { text, unit,
          readable: unit.state !== 'skipped' && !refersBack(text) && !linksContext(descendants(node)) } : null;
      } else {
        const reasons = { code_block: 'code', block_quote: 'quote', html_block: 'html', thematic_break: 'separator' };
        addNode(node, 'skipped', reasons[node.type], headings.filter(Boolean), '');
        intro = null;
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
    // A file is never refused for its ready units: the first LIMITS.rules in document order keep
    // their context and are analyzed, and the rest stay listed as over the limit.
    for (const unit of units.filter(unit => unit.state === 'ready').slice(LIMITS.rules)) {
      Object.assign(unit, { state: 'skipped', reason: 'over_limit', rule: '' });
      delete unit.withContext;
      delete unit.withCode;
      delete unit.linkedUnread;
    }
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
