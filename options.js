(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const jsInputs = { document_start: "jsStartInput", document_end: "jsEndInput", document_idle: "jsIdleInput" };
  let styles = [], draft = PPS.makeBlankStyle(), dirty = false, busy = false, pendingImport = null;
  let status = { userScriptsAvailable: false, errors: [], missingPermissions: [] };
  let permissions = new Map(), permissionVersion = 0;
  const setStatus = (message, tone = "muted") => { $("saveStatus").textContent = message; $("saveStatus").style.color = `var(--${tone})`; };
  const report = error => { $("formError").textContent = error.message; setStatus("操作を完了できませんでした。", "danger"); };
  const guarded = fn => (...args) => Promise.resolve().then(() => fn(...args)).catch(report);
  const canLeave = () => !dirty || confirm("未保存の変更を破棄しますか？");
  function markDirty() { dirty = true; $("formError").textContent = ""; setStatus("未保存の変更があります。"); }
  function activateTab(kind) {
    for (const name of ["css", "js"]) {
      const active = name === kind;
      $(name + "Panel").hidden = !active;
      $(name + "Tab").setAttribute("aria-selected", String(active));
      $(name + "Tab").tabIndex = active ? 0 : -1;
    }
  }
  function formValue() {
    const matchPatterns = PPS.lines($("patternInput").value);
    return { ...draft, name: $("nameInput").value.trim(), enabled: $("enabledInput").checked,
      site: { host: PPS.parseMatchPattern(matchPatterns[0])?.host || "", matchPattern: matchPatterns[0] || "", matchPatterns },
      excludeMatches: PPS.lines($("excludeInput").value), css: $("cssInput").value,
      jsByRunAt: Object.fromEntries(PPS.RUN_ATS.map(runAt => [runAt, $(jsInputs[runAt]).value])),
      cssEnabled: $("cssEnabledInput").checked, jsEnabled: $("jsEnabledInput").checked,
      world: $("worldInput").value, allFrames: $("allFramesInput").checked };
  }
  function showDraft(style) {
    draft = structuredClone(style); dirty = false;
    $("nameInput").value = style.name;
    $("editorTitle").textContent = style.name;
    $("enabledInput").checked = style.enabled;
    $("hostInput").value = style.site.host;
    $("patternInput").value = PPS.patternsForStyle(style).filter(Boolean).join("\n");
    $("excludeInput").value = style.excludeMatches.join("\n");
    $("cssInput").value = style.css;
    for (const runAt of PPS.RUN_ATS) $(jsInputs[runAt]).value = style.jsByRunAt[runAt];
    $("cssEnabledInput").checked = style.cssEnabled; $("jsEnabledInput").checked = style.jsEnabled;
    $("worldInput").value = style.world;
    $("allFramesInput").checked = style.allFrames;
    $("deleteButton").disabled = !styles.some(s => s.id === style.id);
    $("formError").textContent = "";
    activateTab(PPS.hasJavaScript(style) && !style.css ? "js" : "css");
    renderList(); renderScriptStatus(); updatePermission().catch(report);
  }
  function renderScriptStatus() {
    const errors = (status.errors || []).filter(e => !e.id || e.id === draft.id);
    $("jsNotice").classList.toggle("is-success", Boolean(status.userScriptsAvailable && !errors.length));
    $("jsNotice").textContent = errors.length ? errors.map(e => e.message).join("\n") : status.userScriptsAvailable
      ? "JavaScriptを実行できます。許可済みの対象URLで、次のページ読み込みから実行します。"
      : `Chromeで実行許可が必要です。chrome://extensions/ を開き、この拡張の「詳細」→「ユーザースクリプトを許可する」をオンにしてください。その後「実行許可を再確認」を押してください。反映されなければ拡張機能を再読み込みしてください。`;
  }
  async function updatePermission() {
    const version = ++permissionVersion, patterns = PPS.lines($("patternInput").value);
    if (!patterns.length || patterns.some(p => !PPS.isValidMatchPattern(p))) {
      $("permissionText").textContent = "有効な対象URLを入力してください。";
      $("permissionText").className = "is-warning"; $("permissionButton").disabled = true; return;
    }
    const allowed = await PPS.permissionContains(patterns);
    if (version !== permissionVersion) return;
    $("permissionText").textContent = allowed ? "対象サイトへのアクセスは許可済みです。" : "適用には対象サイトへのアクセス許可が必要です。";
    $("permissionText").className = allowed ? "is-success" : "is-warning";
    $("permissionButton").disabled = allowed;
  }
  async function refreshPermissions() {
    permissions = new Map(await Promise.all(styles.map(async s => [s.id, await PPS.permissionContains(PPS.patternsForStyle(s))])));
  }
  function renderList() {
    $("styleList").replaceChildren();
    const query = $("searchInput").value.toLowerCase();
    const visible = PPS.sortStyles(styles).filter(s => `${s.name} ${s.site.host} ${PPS.patternsForStyle(s).join(" ")}`.toLowerCase().includes(query));
    if (!visible.length) {
      const empty = document.createElement("p"); empty.className = "style-list-empty";
      empty.textContent = styles.length ? "一致する設定がありません。" : "まだ設定がありません。";
      $("styleList").append(empty);
    }
    for (const style of visible) {
      const button = document.createElement("button"); button.type = "button";
      button.className = "style-item" + (style.id === draft.id ? " is-selected" : "");
      const main = document.createElement("span"); main.className = "style-item-main";
      const title = document.createElement("span"); title.className = "style-item-title"; title.textContent = style.name;
      const host = document.createElement("span"); host.className = "style-item-host"; host.textContent = `${PPS.codeLabel(style)} · ${style.site.host}`;
      main.append(title, host);
      const pill = document.createElement("span"); pill.className = "status-pill";
      if (!style.enabled) pill.textContent = "停止中";
      else if (!permissions.get(style.id)) { pill.textContent = "権限必要"; pill.classList.add("is-warning"); }
      else if (status.errors?.some(e => !e.id || e.id === style.id)) { pill.textContent = "登録エラー"; pill.classList.add("is-warning"); }
      else if (style.jsEnabled && PPS.hasJavaScript(style) && !status.userScriptsAvailable) { pill.textContent = "JS許可待ち"; pill.classList.add("is-warning"); }
      else { pill.textContent = "有効"; pill.classList.add("is-on"); }
      button.append(main, pill);
      button.addEventListener("click", () => { if (!busy && canLeave()) { showDraft(style); setStatus(""); } });
      $("styleList").append(button);
    }
  }
  function buildPattern() {
    const raw = $("hostInput").value.trim();
    if (!PPS.normalizeHost(raw)) throw new Error("URLまたはホスト名を入力してください。");
    $("patternInput").value = PPS.makeMatchPatternFromHost(raw, raw.startsWith("http://") ? "http" : "https");
    markDirty(); updatePermission().catch(report);
  }
  async function save() {
    if (busy) return;
    const style = formValue(), validation = PPS.validateStyle(style);
    if (!validation.ok) throw new Error(validation.reason);
    busy = true; $("saveButton").disabled = true;
    try {
      // Request before yielding to other work, while the Save gesture is active.
      if (style.enabled) await PPS.permissionRequest(PPS.patternsForStyle(style));
      const existing = styles.find(s => s.id === style.id);
      const response = await PPS.mutate("save", { style, expectedUpdatedAt: existing?.updatedAt });
      styles = response.styles; status = response;
      await refreshPermissions(); showDraft(styles.find(s => s.id === style.id));
      const problem = status.errors?.find(e => !e.id || e.id === style.id);
      if (problem) { $("formError").textContent = problem.message; setStatus("保存済みですが、実行登録に失敗しました。", "warning"); }
      else if (!permissions.get(style.id)) setStatus("保存しました。適用にはサイトの権限が必要です。", "warning");
      else if (PPS.hasJavaScript(style) && style.jsEnabled && !status.userScriptsAvailable) setStatus("保存しました。ChromeでJavaScriptの実行許可が必要です。", "warning");
      else setStatus(PPS.hasJavaScript(style) ? "保存しました。JavaScriptの反映には対象ページを再読み込みしてください。" : "保存しました。CSSを反映しました。", "success");
    } finally { busy = false; $("saveButton").disabled = false; }
  }
  async function remove() {
    if (busy || !confirm(`「${draft.name}」を削除しますか？`)) return;
    const response = await PPS.mutate("delete", { id: draft.id });
    styles = response.styles; status = response;
    await refreshPermissions(); showDraft(PPS.sortStyles(styles)[0] || PPS.makeBlankStyle());
    setStatus("削除しました。実行済みのJavaScriptによる変更はページ再読み込みまで残ります。", "success");
  }
  async function exportSettings() {
    const data = await PPS.getStyles();
    const url = URL.createObjectURL(new Blob([JSON.stringify(PPS.buildExportPayload(data), null, 2)], { type: "application/json" }));
    try { await chrome.downloads.download({ url, filename: `personal-page-styler-${new Date().toISOString().slice(0, 10)}.json`, saveAs: true }); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 30000); }
  }
  function hideImport() { $("importPreview").hidden = true; pendingImport = null; $("importButton").focus(); }
  async function importFile(file) {
    if (!file || busy) return;
    try {
      if (!canLeave()) return;
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".js")) {
        const result = PPS.parseUserScript(text);
        if (!result.ok) throw new Error(result.reason);
        showDraft(result.style); dirty = true;
        setStatus("スクリプトを下書きに読み込みました。内容を確認し、有効にして保存してください。");
        return;
      }
      const result = PPS.validateExportPayload(JSON.parse(text));
      if (!result.ok) throw new Error(result.reason);
      pendingImport = result.styles;
      $("importSummary").textContent = `${styles.length}件の設定を、ファイル内の${result.styles.length}件で置き換えます。有効なJavaScriptは対象ページの次回読み込みから実行されます。`;
      $("importNames").replaceChildren(...result.styles.slice(0, 30).map(s => { const li = document.createElement("li"); li.textContent = `${s.name} — ${PPS.codeLabel(s)} — ${s.enabled ? "有効" : "停止中"}`; return li; }));
      $("importPreview").hidden = false; $("cancelImportButton").focus();
    } finally { $("importInput").value = ""; }
  }
  async function confirmImport() {
    if (!pendingImport || busy) return;
    busy = true; $("confirmImportButton").disabled = true;
    try {
      const response = await PPS.mutate("replace", { payload: PPS.buildExportPayload(pendingImport) });
      styles = response.styles; status = response; hideImport();
      await refreshPermissions(); showDraft(PPS.sortStyles(styles)[0] || PPS.makeBlankStyle());
      setStatus("Importしました。必要なサイトの権限を許可してください。", "success");
    } finally { busy = false; $("confirmImportButton").disabled = false; }
  }
  $("editorForm").addEventListener("input", markDirty);
  $("nameInput").addEventListener("input", () => { $("editorTitle").textContent = $("nameInput").value || "新しい設定"; });
  $("patternInput").addEventListener("input", guarded(updatePermission));
  $("buildPatternButton").addEventListener("click", guarded(buildPattern));
  $("permissionButton").addEventListener("click", () => {
    PPS.permissionRequest(PPS.lines($("patternInput").value)).then(async granted => {
      status = await PPS.sync(); await refreshPermissions(); await updatePermission(); renderList(); renderScriptStatus();
      if (!granted) setStatus("権限は許可されませんでした。", "warning");
    }).catch(report);
  });
  $("editorForm").addEventListener("submit", event => { event.preventDefault(); save().catch(report); });
  $("deleteButton").addEventListener("click", guarded(remove));
  $("exportButton").addEventListener("click", guarded(exportSettings));
  $("newButton").addEventListener("click", () => { if (!busy && canLeave()) { showDraft(PPS.makeBlankStyle()); setStatus("未保存の新しい設定です。"); } });
  $("searchInput").addEventListener("input", renderList);
  $("importButton").addEventListener("click", () => { if (!busy) $("importInput").click(); });
  $("importInput").addEventListener("change", guarded(() => importFile($("importInput").files[0])));
  for (const id of ["cancelImportButton", "closeImportButton"]) $(id).addEventListener("click", hideImport);
  $("confirmImportButton").addEventListener("click", guarded(confirmImport));
  $("checkScriptsButton").addEventListener("click", guarded(async () => { status = await PPS.sync(); renderScriptStatus(); renderList(); }));
  for (const name of ["css", "js"]) {
    $(name + "Tab").addEventListener("click", () => activateTab(name));
    $(name + "Tab").addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const next = event.key === "Home" ? "css" : event.key === "End" ? "js" : name === "css" ? "js" : "css";
      activateTab(next); $(next + "Tab").focus();
    });
  }
  for (const id of ["cssInput", ...Object.values(jsInputs)]) $(id).addEventListener("keydown", event => {
    if (event.key !== "Tab" || event.shiftKey) return;
    event.preventDefault(); const editor = event.target;
    editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end"); markDirty();
  });
  document.addEventListener("keydown", event => {
    if (!$("importPreview").hidden) {
      if (event.key === "Escape") { event.preventDefault(); hideImport(); }
      if (event.key === "Tab") {
        const buttons = [...$("importPreview").querySelectorAll("button:not(:disabled)")];
        const index = buttons.indexOf(document.activeElement);
        if ((event.shiftKey && index <= 0) || (!event.shiftKey && index === buttons.length - 1)) { event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0].focus(); }
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (!event.repeat) save().catch(report); }
  });
  addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
  guarded(async () => {
    styles = await PPS.getStyles(); status = await PPS.sync(); await refreshPermissions();
    const params = new URLSearchParams(location.search), source = params.get("sourceUrl");
    showDraft(source && PPS.isHttpUrl(source) ? PPS.makeStyleFromUrl(source) : styles.find(s => s.id === params.get("id")) || PPS.sortStyles(styles)[0] || PPS.makeBlankStyle());
    document.documentElement.dataset.ready = "true";
  })();
})();
