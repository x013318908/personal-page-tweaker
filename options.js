(function () {
  "use strict";

  const els = {
    buildPatternButton: document.getElementById("buildPatternButton"),
    cancelImportButton: document.getElementById("cancelImportButton"),
    closeImportButton: document.getElementById("closeImportButton"),
    confirmImportButton: document.getElementById("confirmImportButton"),
    cssInput: document.getElementById("cssInput"),
    deleteButton: document.getElementById("deleteButton"),
    editorForm: document.getElementById("editorForm"),
    editorTitle: document.getElementById("editorTitle"),
    enabledInput: document.getElementById("enabledInput"),
    exportButton: document.getElementById("exportButton"),
    formError: document.getElementById("formError"),
    hostInput: document.getElementById("hostInput"),
    importButton: document.getElementById("importButton"),
    importInput: document.getElementById("importInput"),
    importNames: document.getElementById("importNames"),
    importPreview: document.getElementById("importPreview"),
    importSummary: document.getElementById("importSummary"),
    nameInput: document.getElementById("nameInput"),
    newButton: document.getElementById("newButton"),
    patternInput: document.getElementById("patternInput"),
    permissionButton: document.getElementById("permissionButton"),
    permissionText: document.getElementById("permissionText"),
    saveStatus: document.getElementById("saveStatus"),
    searchInput: document.getElementById("searchInput"),
    styleList: document.getElementById("styleList")
  };

  let styles = [];
  let selectedId = "";
  let draftImportStyles = null;
  let permissionByStyleId = new Map();

  function clearNode(node) {
    while (node.firstChild) {
      node.firstChild.remove();
    }
  }

  function setFormError(message) {
    els.formError.textContent = message || "";
  }

  function setSaveStatus(message, tone) {
    els.saveStatus.textContent = message || "";
    if (tone === "warning") {
      els.saveStatus.style.color = "var(--warning)";
    } else if (tone === "error") {
      els.saveStatus.style.color = "var(--danger)";
    } else if (tone === "success") {
      els.saveStatus.style.color = "var(--success)";
    } else {
      els.saveStatus.style.color = "var(--muted)";
    }
  }

  function selectedStyle() {
    return styles.find((style) => style.id === selectedId) || null;
  }

  function getDraftFromForm() {
    const existing = selectedStyle();
    const timestamp = PPS.nowIso();
    const host = PPS.normalizeHost(els.hostInput.value);
    const pattern = els.patternInput.value.trim();

    return {
      id: existing ? existing.id : PPS.makeId(),
      name: els.nameInput.value.trim(),
      enabled: els.enabledInput.checked,
      site: {
        host,
        matchPattern: pattern
      },
      css: els.cssInput.value,
      createdAt: existing ? existing.createdAt : timestamp,
      updatedAt: timestamp
    };
  }

  function setFormFromStyle(style) {
    selectedId = style.id;
    els.editorTitle.textContent = style.name || "New style";
    els.nameInput.value = style.name || "";
    els.enabledInput.checked = Boolean(style.enabled);
    els.hostInput.value = style.site.host || "";
    els.patternInput.value = style.site.matchPattern || "";
    els.cssInput.value = style.css || "";
    setFormError("");
    updatePermissionStatus(style);
    renderStyleList();
  }

  function setBlankForm() {
    setFormFromStyle(PPS.makeBlankStyle());
    selectedId = "";
    els.deleteButton.disabled = true;
    setSaveStatus("未保存の新規スタイルです。", "");
  }

  async function refreshPermissionMap() {
    const nextMap = new Map();

    for (const style of styles) {
      if (PPS.isValidMatchPattern(style.site.matchPattern)) {
        nextMap.set(style.id, await PPS.permissionContains(style.site.matchPattern));
      } else {
        nextMap.set(style.id, false);
      }
    }

    permissionByStyleId = nextMap;
  }

  async function updatePermissionStatus(style) {
    els.permissionText.classList.remove("is-warning", "is-success");

    if (!style || !PPS.isValidMatchPattern(style.site.matchPattern)) {
      els.permissionText.textContent = "有効なmatch patternを入力してください。";
      els.permissionText.classList.add("is-warning");
      els.permissionButton.disabled = true;
      return;
    }

    const permitted = await PPS.permissionContains(style.site.matchPattern);
    if (permitted) {
      els.permissionText.textContent = "このサイトの権限は許可済みです。";
      els.permissionText.classList.add("is-success");
      els.permissionButton.disabled = true;
      return;
    }

    els.permissionText.textContent = "権限が必要です。保存後も、許可するまでページには適用されません。";
    els.permissionText.classList.add("is-warning");
    els.permissionButton.disabled = false;
  }

  function styleMatchesSearch(style, query) {
    if (!query) {
      return true;
    }

    const haystack = `${style.name} ${style.site.host} ${style.site.matchPattern}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }

  function renderStyleList() {
    clearNode(els.styleList);

    const query = els.searchInput.value.trim();
    const visibleStyles = PPS.sortStyles(styles).filter((style) => styleMatchesSearch(style, query));

    if (visibleStyles.length === 0) {
      const empty = document.createElement("p");
      empty.className = "style-list-empty";
      empty.textContent = styles.length === 0 ? "まだスタイルがありません。" : "一致するスタイルがありません。";
      els.styleList.append(empty);
      return;
    }

    for (const style of visibleStyles) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "style-item";
      if (style.id === selectedId) {
        item.classList.add("is-selected");
      }

      const main = document.createElement("span");
      main.className = "style-item-main";

      const title = document.createElement("span");
      title.className = "style-item-title";
      title.textContent = style.name;

      const host = document.createElement("span");
      host.className = "style-item-host";
      host.textContent = style.site.host;

      main.append(title, host);

      const status = document.createElement("span");
      status.className = "status-pill";

      if (!style.enabled) {
        status.textContent = "停止中";
      } else if (permissionByStyleId.get(style.id)) {
        status.classList.add("is-on");
        status.textContent = "有効";
      } else {
        status.classList.add("is-warning");
        status.textContent = "権限必要";
      }

      item.append(main, status);
      item.addEventListener("click", () => {
        els.deleteButton.disabled = false;
        setSaveStatus("");
        setFormFromStyle(style);
      });

      els.styleList.append(item);
    }
  }

  function buildPatternFromHostInput() {
    const raw = els.hostInput.value.trim();
    if (!raw) {
      setFormError("URLまたはhostを入力してください。");
      return;
    }

    let scheme = "https";
    if (/^http:\/\//i.test(raw)) {
      scheme = "http";
    }

    const host = PPS.normalizeHost(raw);
    if (!host) {
      setFormError("hostを判定できませんでした。");
      return;
    }

    els.hostInput.value = host;
    els.patternInput.value = PPS.makeMatchPatternFromHost(host, scheme);
    setFormError("");
    updatePermissionStatus(getDraftFromForm());
  }

  async function requestPermissionForDraft() {
    const draft = getDraftFromForm();
    const validation = PPS.validateStyle({
      ...draft,
      name: draft.name || "New style"
    });

    if (!validation.ok) {
      setFormError(validation.reason);
      return false;
    }

    const granted = await PPS.permissionRequest(draft.site.matchPattern);
    await updatePermissionStatus(draft);
    await refreshPermissionMap();
    renderStyleList();

    if (!granted) {
      setSaveStatus("権限は許可されませんでした。", "warning");
    }

    return granted;
  }

  async function saveDraft() {
    const draft = getDraftFromForm();
    const validation = PPS.validateStyle(draft);

    if (!validation.ok) {
      setFormError(validation.reason);
      setSaveStatus("保存できませんでした。", "error");
      return;
    }

    if (draft.enabled) {
      await PPS.permissionRequest(draft.site.matchPattern);
    }

    const existingIndex = styles.findIndex((style) => style.id === draft.id);
    if (existingIndex >= 0) {
      styles = styles.map((style) => style.id === draft.id ? draft : style);
    } else {
      styles = [...styles, draft];
    }

    await PPS.setStyles(styles);
    selectedId = draft.id;
    els.deleteButton.disabled = false;
    await refreshPermissionMap();
    renderStyleList();
    setFormFromStyle(draft);

    const hasPermission = await PPS.permissionContains(draft.site.matchPattern);
    setSaveStatus(
      hasPermission ? "保存しました。" : "保存しました。適用には権限が必要です。",
      hasPermission ? "success" : "warning"
    );
  }

  async function deleteSelectedStyle() {
    const style = selectedStyle();
    if (!style) {
      return;
    }

    const ok = confirm(`「${style.name}」を削除しますか？`);
    if (!ok) {
      return;
    }

    styles = styles.filter((item) => item.id !== style.id);
    await PPS.setStyles(styles);
    await refreshPermissionMap();

    if (styles.length > 0) {
      setFormFromStyle(PPS.sortStyles(styles)[0]);
    } else {
      setBlankForm();
    }

    renderStyleList();
    setSaveStatus("削除しました。", "success");
  }

  async function exportSettings() {
    const payload = PPS.buildExportPayload(styles);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const filenameDate = new Date().toISOString().slice(0, 10);

    chrome.downloads.download({
      url,
      filename: `personal-page-styler-${filenameDate}.json`,
      saveAs: true
    }, () => {
      URL.revokeObjectURL(url);
    });
  }

  function hideImportPreview() {
    els.importPreview.hidden = true;
    draftImportStyles = null;
  }

  function showImportPreview(importStyles) {
    draftImportStyles = importStyles;
    clearNode(els.importNames);

    els.importSummary.textContent = `${importStyles.length}件のスタイルで現在の設定をすべて置き換えます。`;

    for (const style of importStyles.slice(0, 25)) {
      const item = document.createElement("li");
      item.textContent = `${style.name} - ${style.site.host}`;
      els.importNames.append(item);
    }

    if (importStyles.length > 25) {
      const item = document.createElement("li");
      item.textContent = `ほか ${importStyles.length - 25} 件`;
      els.importNames.append(item);
    }

    els.importPreview.hidden = false;
  }

  async function handleImportFile(file) {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const validation = PPS.validateExportPayload(payload);

      if (!validation.ok) {
        setSaveStatus(validation.reason, "error");
        return;
      }

      showImportPreview(validation.styles);
    } catch (_error) {
      setSaveStatus("JSONを読み込めませんでした。既存設定は変更していません。", "error");
    } finally {
      els.importInput.value = "";
    }
  }

  async function confirmImport() {
    if (!draftImportStyles) {
      return;
    }

    styles = draftImportStyles;
    await PPS.setStyles(styles);
    await refreshPermissionMap();
    hideImportPreview();

    if (styles.length > 0) {
      setFormFromStyle(PPS.sortStyles(styles)[0]);
    } else {
      setBlankForm();
    }

    renderStyleList();
    setSaveStatus("Importしました。必要なサイトは権限を許可してください。", "success");
  }

  function createStyleFromQuery() {
    const params = new URLSearchParams(location.search);
    const sourceUrl = params.get("sourceUrl");

    if (sourceUrl && PPS.isHttpUrl(sourceUrl)) {
      const style = PPS.makeStyleFromUrl(sourceUrl);
      setFormFromStyle(style);
      selectedId = "";
      els.deleteButton.disabled = true;
      setSaveStatus("現在サイト用の未保存スタイルです。", "");
      return true;
    }

    return false;
  }

  async function load() {
    styles = await PPS.getStyles();
    await refreshPermissionMap();

    if (!createStyleFromQuery()) {
      if (styles.length > 0) {
        setFormFromStyle(PPS.sortStyles(styles)[0]);
        els.deleteButton.disabled = false;
      } else {
        setBlankForm();
      }
    }

    renderStyleList();
  }

  function handleSaveShortcut(event) {
    const isSaveShortcut =
      event.key.toLowerCase() === "s" &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey;

    if (!isSaveShortcut) {
      return;
    }

    event.preventDefault();

    if (event.repeat || !els.importPreview.hidden) {
      return;
    }

    saveDraft();
  }

  els.buildPatternButton.addEventListener("click", buildPatternFromHostInput);

  els.cssInput.addEventListener("input", () => {
    setSaveStatus("未保存の変更があります。", "");
  });

  els.deleteButton.addEventListener("click", deleteSelectedStyle);

  els.editorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveDraft();
  });

  els.exportButton.addEventListener("click", exportSettings);

  els.hostInput.addEventListener("change", buildPatternFromHostInput);

  els.importButton.addEventListener("click", () => {
    els.importInput.click();
  });

  els.importInput.addEventListener("change", () => {
    handleImportFile(els.importInput.files[0]);
  });

  els.nameInput.addEventListener("input", () => {
    els.editorTitle.textContent = els.nameInput.value.trim() || "New style";
    setSaveStatus("未保存の変更があります。", "");
  });

  els.newButton.addEventListener("click", () => {
    setBlankForm();
  });

  els.patternInput.addEventListener("input", () => {
    updatePermissionStatus(getDraftFromForm());
    setSaveStatus("未保存の変更があります。", "");
  });

  els.permissionButton.addEventListener("click", requestPermissionForDraft);

  els.searchInput.addEventListener("input", renderStyleList);

  els.cancelImportButton.addEventListener("click", hideImportPreview);
  els.closeImportButton.addEventListener("click", hideImportPreview);
  els.confirmImportButton.addEventListener("click", confirmImport);

  document.addEventListener("keydown", handleSaveShortcut);

  load();
})();
