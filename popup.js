(function () {
  "use strict";

  const els = {
    createButton: document.getElementById("createButton"),
    currentHost: document.getElementById("currentHost"),
    openOptionsButton: document.getElementById("openOptionsButton"),
    statusText: document.getElementById("statusText"),
    styleCount: document.getElementById("styleCount"),
    styleList: document.getElementById("styleList")
  };

  let activeTab = null;
  let activeUrl = "";
  let activeHost = "";
  let styles = [];

  function queryActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs[0] ? tabs[0] : null);
      });
    });
  }

  function setStatus(message, isWarning) {
    els.statusText.textContent = message;
    els.statusText.style.color = isWarning ? "var(--warning)" : "var(--muted)";
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.firstChild.remove();
    }
  }

  function styleAppliesToActiveUrl(style) {
    return PPS.matchPatternForUrl(style.site.matchPattern, activeUrl);
  }

  async function renderStyles() {
    clearNode(els.styleList);

    const matchingStyles = PPS.sortStyles(styles.filter(styleAppliesToActiveUrl));
    els.styleCount.textContent = String(matchingStyles.length);

    if (matchingStyles.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "このサイト用のスタイルはまだありません。";
      els.styleList.append(empty);
      return;
    }

    for (const style of matchingStyles) {
      const row = document.createElement("div");
      row.className = "style-row";

      const meta = document.createElement("div");
      meta.className = "style-meta";

      const name = document.createElement("span");
      name.className = "style-name";
      name.textContent = style.name;

      const state = document.createElement("span");
      state.className = "style-state";
      state.textContent = style.enabled ? "有効" : "停止中";

      if (style.enabled) {
        const permitted = await PPS.permissionContains(style.site.matchPattern);
        if (!permitted) {
          state.classList.add("warning");
          state.textContent = "権限が必要";
        }
      }

      meta.append(name, state);

      const switchLabel = document.createElement("label");
      switchLabel.className = "switch";
      switchLabel.title = "このスタイルを切り替える";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = style.enabled;

      const track = document.createElement("span");
      switchLabel.append(checkbox, track);

      checkbox.addEventListener("change", async () => {
        if (checkbox.checked) {
          const granted = await PPS.permissionRequest(style.site.matchPattern);
          if (!granted) {
            checkbox.checked = false;
            setStatus("適用にはこのサイトの権限が必要です。", true);
            return;
          }
        }

        styles = styles.map((item) => {
          if (item.id !== style.id) {
            return item;
          }

          return {
            ...item,
            enabled: checkbox.checked,
            updatedAt: PPS.nowIso()
          };
        });

        await PPS.setStyles(styles);
        setStatus(checkbox.checked ? "スタイルを有効にしました。" : "スタイルを停止しました。", false);
        renderStyles();
      });

      row.append(meta, switchLabel);
      els.styleList.append(row);
    }
  }

  async function load() {
    activeTab = await queryActiveTab();
    activeUrl = activeTab && activeTab.url ? activeTab.url : "";

    if (!PPS.isHttpUrl(activeUrl)) {
      activeHost = "";
      els.currentHost.textContent = "対象外ページ";
      els.createButton.disabled = true;
      setStatus("このページではCSSを適用できません。", true);
      els.styleCount.textContent = "0";
      clearNode(els.styleList);
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "http/https のページだけ対象です。";
      els.styleList.append(empty);
      return;
    }

    activeHost = PPS.getHostFromUrl(activeUrl);
    els.currentHost.textContent = activeHost;
    els.createButton.disabled = false;
    setStatus("このサイト用のスタイルを管理できます。", false);
    styles = await PPS.getStyles();
    await renderStyles();
  }

  els.openOptionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  els.createButton.addEventListener("click", () => {
    if (!activeUrl) {
      return;
    }

    const params = new URLSearchParams({ sourceUrl: activeUrl });
    chrome.tabs.create({
      url: chrome.runtime.getURL(`options.html?${params.toString()}`)
    });
  });

  load();
})();
