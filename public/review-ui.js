"use strict";

(() => {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const fill = (text, values) => text.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
  // As in public/index.html: a key the server sent indexes a translation table
  // only when the table defines it itself, so "constructor" takes the fallback.
  const own = (table, key) => (Object.hasOwn(table, key) ? table[key] : undefined);
  // Displayed numbers follow the page language: one shared format per language tag,
  // Latin digits, the digits and decimals String() gives, and no grouping.
  const formats = new Map();
  const number = (value) => {
    if (typeof value !== "number") return String(value);
    const tag = document.documentElement.lang;
    if (!formats.has(tag)) formats.set(tag, new Intl.NumberFormat(tag, { numberingSystem: "latn", useGrouping: false, maximumFractionDigits: 20 }));
    return formats.get(tag).format(value);
  };
  // A counted label has one form per plural category of the page language, chosen from the raw count.
  const counted = (forms, count, values = { n: number(count) }) =>
    fill(forms[new Intl.PluralRules(document.documentElement.lang).select(count)] ?? forms.other, values);
  // Excerpt text as a reader compares it with the text sent: LF line endings, no indentation, and
  // for a list item no leading marker. Scoring drops those, so they alone never show the sent text.
  const comparable = (text, item) => {
    const lines = text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trimStart()).join("\n").trim();
    return item ? lines.replace(/^(?:[-+*]|\d{1,9}[.)])[ \t]+/, "") : lines;
  };
  // Without the prompt script, a scored result is still checked for the parts this page shows.
  const displayable = (result) => Array.isArray(result.findings) &&
    result.findings.every((finding) => finding !== null && typeof finding === "object") &&
    (result.factors === undefined || (result.factors !== null && typeof result.factors === "object"));
  // An excerpt whose only finding is not_a_rule reads as background. It is counted and labeled apart
  // from findings: a line the repository cannot show, such as where something lives, can guide an agent.
  const background = (unit) => unit.state === "ok" && unit.result.findings.length > 0 &&
    unit.result.findings.every((finding) => finding.id === "not_a_rule");
  // The findings a row counts and names: a scored excerpt's own, none for background.
  const findings = (unit) => unit.state === "ok" && !background(unit) ? unit.result.findings : [];

  function promptPanel(report, t) {
    const panel = el("section", "prompt-panel");
    let prompt;
    try { prompt = window.DisregardPrompt.buildPrompt(report, window.STRINGS.en); }
    catch (error) { panel.append(el("p", "hint", t[error.code] || t.unavailable)); return panel; }
    if (!prompt) return panel;
    const title = el("h2", null, t.prompt);
    const details = el("details", "prompt-preview");
    const summary = el("summary", null, t.prompt);
    const text = el("textarea", "prompt-text");
    text.value = prompt;
    text.readOnly = true;
    text.dir = "ltr";
    text.lang = "en";
    text.setAttribute("aria-label", t.prompt);
    text.spellcheck = false;
    details.append(summary, text);
    const copy = el("button", "copy-prompt", t.copy);
    copy.type = "button";
    const status = el("p", "hint copy-status");
    status.setAttribute("role", "status");
    copy.addEventListener("click", async () => {
      if (copy.disabled) return;
      copy.disabled = true;
      copy.textContent = t.copying;
      try {
        await navigator.clipboard.writeText(prompt);
        if (panel.isConnected) status.textContent = t.copied;
      } catch {
        if (panel.isConnected) {
          details.open = true;
          status.textContent = t.copyFailed;
          text.focus();
          text.select();
        }
      } finally {
        copy.disabled = false;
        copy.textContent = t.copy;
      }
    });
    panel.append(title, el("p", "hint", t.promptHint), copy, status, details);
    return panel;
  }

  // The supplied Worker allows a client 60 score requests a minute (wrangler.jsonc). A file run
  // starts at most PACE requests in any PACE_WINDOW, so a large file waits instead of being stopped.
  const PACE = 55, PACE_WINDOW = 60000;
  const GUIDE = "https://code.claude.com/docs/en/memory#write-effective-instructions";

  // The page owns the file/rule mode switch; onBusy tells it when a file review starts and settles.
  function create({ host, getStrings, findingCard, factorList, onBusy }) {
    const model = window.DisregardDocument;
    let report = null, busy = false, revision = 0, uploadedSource = null;
    let errorCode = null, message = null, runTotal = 0, runDone = 0;
    let stopped = false, everRan = false, pacing = 0;
    // Start times of this page's recent score requests, oldest first, across runs.
    const started = [];
    const active = new Set(), rows = new Map();
    const form = el("form"); form.id = "file-form"; form.noValidate = true;
    const label = el("label"); label.htmlFor = "file-source";
    const hint = el("p", "hint"); hint.id = "file-hint";
    const uploadLabel = el("label", "upload-label"); uploadLabel.htmlFor = "file-upload";
    const upload = el("input"); upload.type = "file"; upload.id = "file-upload"; upload.accept = ".md,text/markdown,text/plain";
    const nameLabel = el("label"); nameLabel.htmlFor = "file-name";
    const name = el("input"); name.id = "file-name"; name.type = "text"; name.value = "AGENTS.md"; name.maxLength = 200;
    name.dir = "auto"; name.autocomplete = "off";
    const source = el("textarea"); source.id = "file-source"; source.dir = "auto"; source.spellcheck = false;
    source.setAttribute("aria-describedby", "file-hint file-count");
    source.placeholder = "# Project instructions\n\n- Run `node --test` before submitting changes.\n- Never log passwords.";
    const prepare = el("button"); prepare.id = "file-prepare"; prepare.type = "submit";
    const count = el("span", "count"); count.id = "file-count";
    const actions = el("div", "row"); actions.append(prepare, count);
    const fileFields = el("div", "file-fields");
    const uploadField = el("div"); uploadField.append(uploadLabel, upload);
    const nameField = el("div"); nameField.append(nameLabel, name);
    fileFields.append(uploadField, nameField);
    form.append(fileFields, label, hint, source, actions);
    const error = el("p", "file-error"); error.id = "file-error"; error.setAttribute("role", "alert");
    const output = el("section", "file-report"); output.id = "file-report";
    const reportTitle = el("h2"), reportHint = el("p", "hint"), coverage = el("p", "coverage");
    const lengthNote = el("div", "banner"); lengthNote.id = "file-length";
    const progress = el("p", "hint"); progress.id = "file-progress"; progress.setAttribute("role", "status");
    const start = el("button"); start.id = "file-start"; start.type = "button";
    const cancel = el("button", "secondary"); cancel.id = "file-cancel"; cancel.type = "button";
    const runActions = el("div", "row"); runActions.append(start, cancel);
    const list = el("div", "unit-list"); list.id = "file-units";
    const exported = el("div"); exported.id = "file-export";
    // Once a row has findings, the reader may hide the rows without them, for this review only.
    const only = el("input"); only.type = "checkbox"; only.id = "file-filter";
    const onlyText = el("span"), onlyLabel = el("label", "unit-filter"); onlyLabel.append(only, onlyText);
    const showing = el("span", "count"); showing.id = "file-showing"; showing.setAttribute("role", "status");
    const filter = el("div", "row"); filter.append(onlyLabel, showing);
    output.append(reportTitle, reportHint, coverage, lengthNote, progress, runActions, exported, filter, list);
    host.append(form, error, output);

    const t = () => getStrings().file;
    // A message's limits come from the document model and render through number(). Without the
    // model no file can be read, so the hint and byte counter hide and an upload reports that failure.
    const limits = model?.LIMITS;
    const withLimits = (text) => limits ? fill(text, { kib: number(limits.fileBytes / 1024),
      excerpts: number(limits.rules), chars: number(limits.ruleChars) }) : text;
    // Textarea values normalize CRLF/CR to LF. Retain an uploaded UTF-8
    // snapshot until the reader actually edits its displayed text.
    const sourceText = () => uploadedSource && source.value === uploadedSource.displayed ? uploadedSource.text : source.value;
    // A unit that holds a scoring result is never sent again. Nor is one whose failure a new request
    // would repeat; preparing the file again is the reader's way to re-run it.
    const retryable = (unit) => !unit.result && ["ready", "error", "cancelled"].includes(unit.state) &&
      !["unsupported_finding", "prompt_too_large"].includes(unit.errorCode);
    const isCurrent = (snapshot, token) => report === snapshot && token === revision &&
      sourceText() === snapshot.sourceText && (name.value.trim() || "AGENTS.md") === snapshot.sourceName;

    function controls() {
      const strings = t();
      source.readOnly = name.readOnly = busy;
      upload.disabled = busy; prepare.disabled = busy;
      label.textContent = strings.source; hint.textContent = limits ? withLimits(strings.sourceHint) : ""; hint.hidden = !limits;
      uploadLabel.textContent = strings.upload; nameLabel.textContent = strings.name; prepare.textContent = strings.prepare;
      const bytes = new TextEncoder().encode(sourceText()).length;
      count.textContent = limits ? fill(strings.bytes, { n: number(bytes), max: number(limits.fileBytes) }) : ""; count.hidden = !limits;
      count.classList.toggle("over", Boolean(limits) && bytes > limits.fileBytes);
      error.textContent = errorCode ? withLimits(strings[errorCode] || strings.invalid_source) : "";
      error.hidden = !errorCode;
      output.hidden = !report;
      cancel.hidden = !busy; cancel.textContent = strings.cancel;
      if (!report) return;
      reportTitle.textContent = strings.preview; reportHint.textContent = strings.previewHint;
      const summary = model.summarize(report), context = report.units.filter(background).length;
      coverage.textContent = fill(context ? strings.coverage.textContext : strings.coverage.text, { scored: counted(strings.coverage.scored, summary.scored),
        flagged: number(summary.flagged - context), context: counted(strings.coverage.context, context),
        remaining: counted(strings.coverage.remaining, summary.total - summary.scored) });
      const remaining = report.units.filter(retryable).length;
      start.textContent = counted(everRan ? strings.retry : strings.start, remaining);
      start.hidden = busy || !remaining;
      const running = busy && counted(strings.running, runDone, { done: number(runDone), total: number(runTotal) });
      progress.textContent = busy ? (pacing ? fill(strings.pacing, { progress: running }) : running) :
        message ? strings[message] : remaining ? "" : strings.none;
      // Filtering keeps rows with findings, rows a retry would send and rows in flight.
      filter.hidden = !report.units.some((unit) => findings(unit).length);
      onlyText.textContent = strings.filter;
      const filtering = only.checked && !filter.hidden;
      let visible = 0;
      for (const unit of report.units) {
        const row = rows.get(unit.id);
        row.details.hidden = filtering && !findings(unit).length && !retryable(unit) && unit.state !== "pending";
        if (!row.details.hidden) visible++;
      }
      const total = report.units.length;
      showing.textContent = filtering ? counted(strings.showing, total, { shown: number(visible), total: number(total) }) : "";
    }

    function renderUnit(unit, row) {
      const strings = t();
      row.summary.replaceChildren();
      const location = el("span", "unit-location", unit.startLine === unit.endLine ? fill(strings.line, { line: number(unit.startLine) }) :
        fill(strings.lines, { start: number(unit.startLine), end: number(unit.endLine) }));
      // A response that arrived but failed validation was not scored; its request did not fail.
      const invalid = unit.state === "error" && ["invalid_result", "unsupported_finding", "prompt_too_large"].includes(unit.errorCode);
      // A scored row says what was found while collapsed: its count and each finding's headline, as text
      // inside the one summary control. The cards that explain them stay in the details.
      const flagged = findings(unit);
      const state = el("span", flagged.length ? "unit-state flagged" : "unit-state", invalid ? strings.states.skipped :
        background(unit) ? strings.states.background : flagged.length ? counted(strings.findingCount, flagged.length) :
        strings.states[unit.state] || strings.states.skipped);
      const title = el("span", "unit-title", unit.rawText.trim().split(/\r\n|\r|\n/)[0]);
      title.dir = "auto";
      // The space keeps the location and a counted label apart in the summary's accessible name.
      row.summary.append(location, " ", state, title);
      if (flagged.length) {
        const headlines = el("span", "unit-headlines");
        for (const finding of flagged) {
          const copy = own(getStrings().findings, finding.id);
          if (copy) headlines.append(el("span", "unit-headline", fill(copy.h, { verb: finding.verb })));
        }
        row.summary.append(headlines);
      }
      row.details.dataset.state = unit.state;
      row.content.replaceChildren();
      const original = el("pre", "source-excerpt", unit.rawText); original.dir = "auto";
      row.content.append(original);
      if (unit.context.length) row.content.append(el("p", "hint", fill(strings.context,
        { path: unit.context.reduce((outer, inner) => fill(strings.contextPath, { outer, inner })) })));
      if (unit.linkedUnread) row.content.append(el("p", "hint", strings.linkNotRead));
      if (unit.state !== "ok") {
        // The single-rule banner's language lookup and fallback.
        const language = unit.result?.language;
        const lang = (language?.code && own(getStrings().languages, language.code)) || language?.name;
        const reason = unit.state === "review" ? getStrings().reviewBody :
          unit.state === "refused" ? getStrings().refusedBody :
          unit.state === "not_english" ? (lang ? fill(getStrings().notEnglishBody, { lang }) : getStrings().notEnglishUnknown) :
          // File mode words the unknown-finding and timeout failures for an excerpt.
          unit.state === "error" ? own(strings.unitErrors, unit.errorCode) ||
            (invalid ? strings[unit.errorCode] : own(getStrings().errors, unit.errorCode) || getStrings().errors.failed) :
          strings.reasons[unit.reason];
        // Ready, pending and stopped units have nothing to add to their state label.
        if (reason) row.content.append(el("p", "hint", withLimits(reason)));
      }
      if (unit.state === "ok") {
        if (unit.result.findings.length) {
          const findings = el("ul", "findings");
          for (const finding of unit.result.findings) {
            const card = findingCard(finding);
            if (card) findings.append(card);
          }
          row.content.append(findings);
        } else row.content.append(el("p", "hint", strings.unchanged));
        row.content.append(factorList(unit.result.factors || {}));
      }
      // An excerpt scored with its section context says so wherever its sent text is disclosed.
      if (unit.rule && comparable(unit.rule, false) !== comparable(unit.rawText, unit.kind === "item")) {
        const sent = el("pre", "source-excerpt", unit.rule); sent.dir = "auto";
        const detail = el("details"); detail.append(el("summary", null, unit.withContext ? strings.ruleSentContext : strings.ruleSent), sent);
        row.content.append(detail);
      }
    }

    function renderReport() {
      const open = new Set([...rows.entries()].filter(([, row]) => row.details.open).map(([id]) => id));
      const focusedId = output.contains(document.activeElement) ? document.activeElement.id : null;
      rows.clear(); list.replaceChildren(); exported.replaceChildren(); lengthNote.replaceChildren();
      // The count and target come from the prompt script, which puts the same count in the prompt.
      const prompt = window.DisregardPrompt, lines = report && prompt ? prompt.lineCount(report.sourceText) : 0;
      lengthNote.hidden = !prompt || lines <= prompt.LINE_TARGET;
      if (!lengthNote.hidden) {
        const strings = t().longFile, body = el("p", null, fill(strings.body, { max: number(prompt.LINE_TARGET) }) + " ");
        const guide = el("a", null, strings.link); guide.id = "file-length-guide"; guide.href = GUIDE;
        body.append(guide);
        lengthNote.append(el("strong", null, counted(strings.title, lines)), body);
      }
      if (report) {
        for (const unit of report.units) {
          const details = el("details", "instruction-unit"); details.open = open.has(unit.id);
          const summary = el("summary"); summary.id = "unit-" + unit.id;
          const content = el("div", "unit-content"); details.append(summary, content);
          const row = { details, summary, content }; rows.set(unit.id, row);
          renderUnit(unit, row); list.append(details);
        }
        if (!busy) exported.append(promptPanel(report, t()));
      }
      controls();
      if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
    }

    function stop(reason = "stopped") {
      stopped = true; message = reason;
      for (const controller of active) controller.abort();
    }

    function invalidate() {
      revision++;
      stop(); report = null; errorCode = null; message = null; everRan = false; only.checked = false;
      renderReport();
    }

    source.addEventListener("input", () => { uploadedSource = null; invalidate(); });
    name.addEventListener("input", invalidate);
    upload.addEventListener("change", async () => {
      if (busy) return;
      const file = upload.files[0]; if (!file) return;
      invalidate(); const token = revision;
      if (!/\.md$/i.test(file.name)) errorCode = "invalid_file";
      // Without the document model there is no limit to check and no reader for the file.
      else if (!limits) errorCode = "parser_unavailable";
      else if (file.size > limits.fileBytes) errorCode = "file_too_large";
      else {
        try {
          const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
          if (token !== revision) return;
          source.value = text; name.value = file.name;
          uploadedSource = { text, displayed: source.value };
          source.focus();
        } catch { if (token === revision) errorCode = "read_failed"; }
      }
      upload.value = ""; controls();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault(); if (busy) return;
      invalidate();
      try { report = model.parseDocument(sourceText(), name.value.trim() || "AGENTS.md"); }
      // Without the document model script, the page failed to load, not the reader's file.
      catch (error) { errorCode = error.code || (model ? "invalid_source" : "parser_unavailable"); }
      renderReport();
      if (report) {
        if (!start.hidden) start.focus();
        else { reportTitle.tabIndex = -1; reportTitle.focus(); }
      } else source.focus();
    });

    async function run() {
      if (busy || !report) return;
      const snapshot = report, token = revision;
      if (!isCurrent(snapshot, token)) { invalidate(); return; }
      const queue = snapshot.units.filter(retryable);
      if (!queue.length) return;
      let next = 0;
      busy = true; onBusy(busy); stopped = false; everRan = true; message = null;
      runTotal = queue.length; runDone = 0; exported.replaceChildren(); controls();
      cancel.focus({ preventScroll: true });
      async function worker() {
        while (!stopped && isCurrent(snapshot, token) && next < queue.length) {
          const now = Date.now();
          while (started.length && now - started[0] >= PACE_WINDOW) started.shift();
          if (started.length >= PACE) {
            // Wait until the oldest request leaves the window, then check again; stopping ends the wait.
            const pause = new AbortController(); active.add(pause); pacing++; controls();
            await new Promise((resolve) => {
              const timer = setTimeout(resolve, started[0] + PACE_WINDOW - now);
              pause.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); });
            });
            active.delete(pause); pacing--; controls();
            continue;
          }
          started.push(now);
          const unit = queue[next++]; unit.state = "pending"; delete unit.errorCode;
          renderUnit(unit, rows.get(unit.id));
          const controller = new AbortController(); active.add(controller);
          const timer = setTimeout(() => controller.abort(), 35000);
          try {
            const response = await fetch("/api/score", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rule: unit.rule }), signal: controller.signal });
            // Edge/proxy errors may contain HTML or no body. Pause on the HTTP
            // status before attempting JSON so they cannot trigger more spend.
            if ([429, 503].includes(response.status)) {
              unit.state = "error";
              unit.errorCode = response.status === 429 ? "rate_limited" : "not_configured";
              stop("limited");
              continue;
            }
            const body = await response.json();
            if (!isCurrent(snapshot, token)) { stop(); break; }
            if (!response.ok) {
              unit.state = "error"; unit.errorCode = body?.code || "failed";
              if ([429, 503].includes(response.status) || body?.code === "not_configured") stop("limited");
            } else if (["ok", "not_english", "review", "refused"].includes(body?.status)) {
              if (body.status === "ok") {
                // Validate the consumed evidence before showing a completed unit. If the prompt
                // script did not load, check what this page shows and keep the result.
                if (window.DisregardPrompt) window.DisregardPrompt.buildPrompt({ ...snapshot, units: [{ ...unit, state: "ok", result: body }] }, window.STRINGS.en);
                else if (!displayable(body)) throw Object.assign(new Error("invalid_result"), { code: "invalid_result" });
              }
              unit.state = body.status; unit.result = body;
            } else throw new Error("invalid response");
          } catch (error) {
            unit.state = stopped ? "cancelled" : "error";
            // An aborted fetch rejects with a DOMException whose legacy numeric code is 20;
            // the deadline's abort is a timeout, as in the single-rule view.
            unit.errorCode = controller.signal.aborted ? "timeout" : error.code || "network";
          } finally {
            clearTimeout(timer); active.delete(controller); runDone++;
            if (isCurrent(snapshot, token)) { renderUnit(unit, rows.get(unit.id)); controls(); }
          }
        }
      }
      try { await Promise.all([worker(), worker()]); }
      finally {
        busy = false; onBusy(busy);
        if (isCurrent(snapshot, token)) {
          for (const unit of queue) if (["pending", "ready"].includes(unit.state)) {
            unit.state = "cancelled";
            renderUnit(unit, rows.get(unit.id));
          }
          if (!message) message = "done";
          // Completed rows stay mounted: inspecting a factor while another
          // request settles must not close its disclosure or steal focus.
          controls();
          exported.replaceChildren(promptPanel(report, t()));
          if (document.activeElement === cancel || document.activeElement === document.body) {
            // After the reader's Stop, the heading takes focus so a second press starts nothing; the
            // retry control is the next Tab stop. Scrolling keeps that focus in view.
            if (message === "stopped") { reportTitle.tabIndex = -1; reportTitle.focus(); }
            else if (!start.hidden) start.focus({ preventScroll: true });
            else { reportTitle.tabIndex = -1; reportTitle.focus({ preventScroll: true }); }
          }
        } else { report = null; renderReport(); }
      }
    }
    start.addEventListener("click", run);
    cancel.addEventListener("click", () => stop());
    only.addEventListener("change", controls);
    for (const button of [start, prepare, cancel]) button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.repeat && !event.isComposing) event.preventDefault();
    });
    // The review lives only in this page, and getting its results back repeats paid
    // requests. Leaving asks first while requests are in flight or results are held;
    // a preview without results, or no review at all, leaves without a prompt.
    window.addEventListener("beforeunload", (event) => {
      if (!busy && !report?.units.some((unit) => unit.result)) return;
      event.preventDefault();
      event.returnValue = true; // Browsers that predate preventDefault here.
    });
    return { refresh: renderReport };
  }
  window.DisregardReview = { create, promptPanel, number };
})();
