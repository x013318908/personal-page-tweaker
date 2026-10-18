(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  let activeTab = null, styles = [], status = {};
  function setStatus(text, warning = false) { $("statusText").textContent = text; $("statusText").style.color = warning ? "var(--warning)" : "var(--muted)"; }
  const fail = error => setStatus(error.message, true);
  function openEditor(params) { return chrome.tabs.create({ url: chrome.runtime.getURL("options.html?" + new URLSearchParams(params)) }); }
  async function render() {
    $("styleList").replaceChildren();
    const matching = PPS.sortStyles(styles.filter(s => PPS.matchesStyle(s, activeTab.url)));
    $("styleCount").textContent = String(matching.length);
    if (!matching.length) {
      const empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = "このサイト用の設定はまだありません。";
      $("styleList").append(empty);
    }
    for (const style of matching) {
      const row = document.createElement("div"); row.className = "style-row";
      const meta = document.createElement("div"); meta.className = "style-meta";
      const name = document.createElement("button"); name.className = "style-name"; name.textContent = style.name; name.title = "この設定を編集";
      name.addEventListener("click", () => openEditor({ id: style.id }).catch(fail));
      const state = document.createElement("span"); state.className = "style-state";
      let note = style.enabled ? "有効" : "停止中";
      if (style.enabled) {
        if (!await PPS.permissionContains(PPS.patternsForStyle(style))) note = "サイト権限が必要";
        else if (status.errors?.some(e => !e.id || e.id === style.id)) note = "登録エラー・設定を確認";
        else if (style.jsEnabled && style.js.trim() && !status.userScriptsAvailable) note = "JS実行許可が必要";
        if (note !== "有効") state.classList.add("warning");
      }
      state.textContent = `${PPS.codeLabel(style)} · ${note}`;
      meta.append(name, state);
      const label = document.createElement("label"); label.className = "switch";
      const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = style.enabled;
      checkbox.setAttribute("aria-label", `${style.name}を有効にする`);
      label.append(checkbox, document.createElement("span"));
      checkbox.addEventListener("change", async () => {
        checkbox.disabled = true;
        try {
          if (checkbox.checked && !await PPS.permissionRequest(PPS.patternsForStyle(style))) { checkbox.checked = false; setStatus("適用にはサイト権限が必要です。", true); return; }
          const response = await PPS.mutate("toggle", { id: style.id, enabled: checkbox.checked });
          styles = response.styles; status = response; await render();
          const problem = response.errors?.find(e => !e.id || e.id === style.id);
          if (problem) setStatus(`保存済みですが登録に失敗しました: ${problem.message}`, true);
          else if (checkbox.checked && style.jsEnabled && style.js.trim() && !status.userScriptsAvailable) setStatus("Chromeでユーザースクリプトを許可してください。設定画面に手順があります。", true);
          else setStatus(style.js.trim() ? "変更しました。JavaScriptの変更を反映するには再読み込みしてください。" : "変更しました。");
        } catch (error) { checkbox.checked = style.enabled; fail(error); }
        finally { checkbox.disabled = false; }
      });
      row.append(meta, label); $("styleList").append(row);
    }
  }
  $("openOptionsButton").addEventListener("click", () => chrome.runtime.openOptionsPage().catch(fail));
  $("createButton").addEventListener("click", () => { if (activeTab?.url) openEditor({ sourceUrl: activeTab.url }).catch(fail); });
  $("reloadButton").addEventListener("click", () => { if (activeTab?.id !== undefined) chrome.tabs.reload(activeTab.id).then(() => window.close()).catch(fail); });
  (async () => {
    [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!PPS.isHttpUrl(activeTab?.url)) {
      $("currentHost").textContent = "対象外ページ"; $("createButton").disabled = true; $("reloadButton").disabled = true;
      setStatus("http/httpsのページでCSSとJavaScriptを設定できます。", true); return;
    }
    $("currentHost").textContent = PPS.getHostFromUrl(activeTab.url);
    styles = await PPS.getStyles(); status = await PPS.sync(); await render();
    setStatus("名前を押すとCSS・JavaScriptを編集できます。");
  })().catch(fail);
})();
