"use strict";

(() => {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const fill = (text, values) => text.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);

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

  function create({ host, getStrings, findingCard, factorList }) {
    const model = window.DisregardDocument;
    let report = null, busy = false, ruleBusy = false, revision = 0, uploadedSource = null;
    let mode = "file", errorCode = null, message = null, runTotal = 0, runDone = 0;
    let stopped = false, everRan = false;
    const active = new Set(), rows = new Map();
    const modeFile = document.getElementById("mode-file"), modeRule = document.getElementById("mode-rule");
    const rulePanel = document.getElementById("rule-panel");
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
    const progress = el("p", "hint"); progress.id = "file-progress"; progress.setAttribute("role", "status");
    const start = el("button"); start.id = "file-start"; start.type = "button";
    const cancel = el("button", "secondary"); cancel.id = "file-cancel"; cancel.type = "button";
    const runActions = el("div", "row"); runActions.append(start, cancel);
    const list = el("div", "unit-list"); list.id = "file-units";
    const exported = el("div"); exported.id = "file-export";
    output.append(reportTitle, reportHint, coverage, progress, runActions, exported, list);
    host.append(form, error, output);

    const t = () => getStrings().file;
    // Textarea values normalize CRLF/CR to LF. Retain an uploaded UTF-8
    // snapshot until the reader actually edits its displayed text.
    const sourceText = () => uploadedSource && source.value === uploadedSource.displayed ? uploadedSource.text : source.value;
    const retryable = (unit) => ["ready", "error", "cancelled"].includes(unit.state);
    const isCurrent = (snapshot, token) => report === snapshot && token === revision &&
      sourceText() === snapshot.sourceText && (name.value.trim() || "AGENTS.md") === snapshot.sourceName;

    function controls() {
      const strings = t();
      modeFile.textContent = strings.fileMode; modeRule.textContent = strings.ruleMode;
      document.getElementById("input-mode").setAttribute("aria-label", strings.modeLabel);
      modeFile.setAttribute("aria-pressed", String(mode === "file"));
      modeRule.setAttribute("aria-pressed", String(mode === "rule"));
      modeFile.disabled = modeRule.disabled = busy || ruleBusy;
      host.hidden = mode !== "file"; rulePanel.hidden = mode !== "rule";
      source.readOnly = name.readOnly = busy;
      upload.disabled = busy; prepare.disabled = busy;
      label.textContent = strings.source; hint.textContent = strings.sourceHint;
      uploadLabel.textContent = strings.upload; nameLabel.textContent = strings.name; prepare.textContent = strings.prepare;
      const bytes = new TextEncoder().encode(sourceText()).length;
      count.textContent = fill(strings.bytes, { n: bytes, max: 65536 });
      count.classList.toggle("over", bytes > 65536);
      error.textContent = errorCode ? (strings[errorCode] || strings.invalid_source) : "";
      error.hidden = !errorCode;
      output.hidden = !report;
      cancel.hidden = !busy; cancel.textContent = strings.cancel;
      if (!report) return;
      reportTitle.textContent = strings.preview; reportHint.textContent = strings.previewHint;
      const summary = model.summarize(report);
      coverage.textContent = fill(strings.coverage, { ...summary, remaining: summary.total - summary.scored });
      const remaining = report.units.filter(retryable).length;
      start.textContent = fill(everRan ? strings.retry : strings.start, { n: remaining });
      start.hidden = busy || !remaining;
      progress.textContent = busy ? fill(strings.running, { done: runDone, total: runTotal }) :
        message ? strings[message] : remaining ? "" : strings.none;
    }

    function renderUnit(unit, row) {
      const strings = t();
      row.summary.replaceChildren();
      const location = el("span", "unit-location", fill(strings.lines, { start: unit.startLine, end: unit.endLine }));
      const state = el("span", "unit-state", strings.states[unit.state] || strings.states.skipped);
      const title = el("span", "unit-title", unit.rawText.trim().split(/\r\n|\r|\n/)[0]);
      title.dir = "auto";
      row.summary.append(location, state, title);
      row.details.dataset.state = unit.state;
      row.content.replaceChildren();
      const original = el("pre", "source-excerpt", unit.rawText); original.dir = "auto";
      row.content.append(original);
      if (unit.context.length) row.content.append(el("p", "hint", strings.context + ": " + unit.context.join(" / ")));
      if (unit.state !== "ok") {
        const reason = unit.state === "review" ? getStrings().reviewBody :
          unit.state === "refused" ? getStrings().refusedBody :
          unit.state === "not_english" ? getStrings().notEnglishUnknown :
          strings.reasons[unit.reason] || strings.states[unit.state];
        row.content.append(el("p", "hint", unit.state === "error" ?
          (["invalid_result", "unsupported_finding", "prompt_too_large"].includes(unit.errorCode) ? strings[unit.errorCode] || strings.unavailable :
            getStrings().errors[unit.errorCode] || getStrings().errors.failed) : reason));
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
      if (unit.rule && unit.rule !== unit.rawText.trim()) {
        const detail = el("details"); detail.append(el("summary", null, strings.ruleSent), el("pre", "source-excerpt", unit.rule));
        row.content.append(detail);
      }
    }

    function renderReport() {
      const open = new Set([...rows.entries()].filter(([, row]) => row.details.open).map(([id]) => id));
      const focusedId = output.contains(document.activeElement) ? document.activeElement.id : null;
      rows.clear(); list.replaceChildren(); exported.replaceChildren();
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
      stop(); report = null; errorCode = null; message = null; everRan = false;
      renderReport();
    }

    source.addEventListener("input", () => { uploadedSource = null; invalidate(); });
    name.addEventListener("input", invalidate);
    upload.addEventListener("change", async () => {
      if (busy) return;
      const file = upload.files[0]; if (!file) return;
      invalidate(); const token = revision;
      if (!/\.md$/i.test(file.name)) errorCode = "invalid_file";
      else if (file.size > 65536) errorCode = "file_too_large";
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
      catch (error) { errorCode = error.code || "invalid_source"; }
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
      busy = true; stopped = false; everRan = true; message = null;
      runTotal = queue.length; runDone = 0; exported.replaceChildren(); controls();
      cancel.focus({ preventScroll: true });
      async function worker() {
        while (!stopped && isCurrent(snapshot, token) && next < queue.length) {
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
                // Validate the consumed evidence before showing a completed unit.
                window.DisregardPrompt.buildPrompt({ ...snapshot, units: [{ ...unit, state: "ok", result: body }] }, window.STRINGS.en);
              }
              unit.state = body.status; unit.result = body;
            } else throw new Error("invalid response");
          } catch (error) {
            unit.state = stopped ? "cancelled" : "error";
            unit.errorCode = error.code || (controller.signal.aborted ? "timeout" : "network");
          } finally {
            clearTimeout(timer); active.delete(controller); runDone++;
            if (isCurrent(snapshot, token)) { renderUnit(unit, rows.get(unit.id)); controls(); }
          }
        }
      }
      try { await Promise.all([worker(), worker()]); }
      finally {
        busy = false;
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
            if (!start.hidden) start.focus({ preventScroll: true });
            else { reportTitle.tabIndex = -1; reportTitle.focus({ preventScroll: true }); }
          }
        } else { report = null; renderReport(); }
      }
    }
    start.addEventListener("click", run);
    cancel.addEventListener("click", () => stop());
    for (const button of [start, prepare, cancel]) button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.repeat && !event.isComposing) event.preventDefault();
    });
    modeFile.addEventListener("click", () => { if (!busy && !ruleBusy) { mode = "file"; controls(); } });
    modeRule.addEventListener("click", () => { if (!busy && !ruleBusy) { mode = "rule"; controls(); } });
    return { refresh: renderReport, setRuleBusy(value) { ruleBusy = value; controls(); } };
  }
  window.DisregardReview = { create, promptPanel };
})();
