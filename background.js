importScripts("shared.js");

(() => {
  "use strict";
  let queue = Promise.resolve();
  const serialize = job => {
    const next = queue.then(job);
    queue = next.catch(error => console.error("Personal Page Tweaker", error));
    return next;
  };
  const ownedContent = s => s.id.startsWith(PPS.CONTENT_SCRIPT_PREFIX);
  const ownedUser = s => s.id.startsWith(PPS.USER_SCRIPT_PREFIX);
  const same = (current, desired) => Object.keys(desired).every(key => JSON.stringify(current[key] ?? (Array.isArray(desired[key]) ? [] : undefined)) === JSON.stringify(desired[key]));
  async function withDeadline(promise, milliseconds) {
    let timer;
    try { return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(resolve, milliseconds); })]); }
    finally { clearTimeout(timer); }
  }

  async function permittedPatterns(style) {
    const result = [];
    for (const pattern of PPS.patternsForStyle(style)) if (await PPS.permissionContains(pattern)) result.push(pattern);
    return result;
  }

  async function reconcileContent(patterns) {
    const id = PPS.CONTENT_SCRIPT_PREFIX + "css";
    const desired = patterns.length ? [{ id, matches: [...new Set(patterns)].sort(), js: ["shared.js", "content.js"], runAt: "document_start", allFrames: true, persistAcrossSessions: true }] : [];
    const current = (await chrome.scripting.getRegisteredContentScripts()).filter(ownedContent);
    const stale = current.filter(s => !desired.some(d => d.id === s.id)).map(s => s.id);
    if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale });
    for (const definition of desired) {
      const old = current.find(s => s.id === definition.id);
      if (!old) await chrome.scripting.registerContentScripts([definition]);
      else if (!same(old, definition)) await chrome.scripting.updateContentScripts([definition]);
    }
  }

  async function reconcileUser(definitions) {
    let current;
    try {
      if (!chrome.userScripts) return { available: false, errors: [] };
      current = (await chrome.userScripts.getScripts()).filter(ownedUser);
    } catch { return { available: false, errors: [] }; }
    const errors = [];
    const stale = current.filter(s => !definitions.some(d => d.id === s.id)).map(s => s.id);
    if (stale.length) await chrome.userScripts.unregister({ ids: stale });
    for (const definition of definitions) {
      try {
        const old = current.find(s => s.id === definition.id);
        if (!old) await chrome.userScripts.register([definition]);
        else if (!same(old, definition)) {
          // update() cannot clear worldId when switching to MAIN.
          if (old.world !== definition.world) {
            await chrome.userScripts.unregister({ ids: [old.id] });
            await chrome.userScripts.register([definition]);
          } else await chrome.userScripts.update([definition]);
        }
      } catch (error) {
        // Never leave an older script active when the replacement fails.
        await chrome.userScripts.unregister({ ids: [definition.id] }).catch(() => {});
        const id = definition.id.slice(PPS.USER_SCRIPT_PREFIX.length, -(definition.runAt.length + 1));
        errors.push({ id, message: `${PPS.RUN_AT_LABELS[definition.runAt]}: ${error.message}` });
      }
    }
    return { available: true, errors };
  }

  async function refreshTabs(cssOrigins) {
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(tabs.map(async tab => {
      if (tab.id === undefined) return;
      if (tab.url && cssOrigins.some(p => PPS.matchPatternForUrl(p, tab.url))) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["shared.js", "content.js"] }).catch(() => {});
      }
      // Also tell already-injected tabs to remove CSS after deleting a rule or permission.
      await chrome.tabs.sendMessage(tab.id, { type: PPS.MESSAGE_REFRESH }).catch(() => {});
    }));
  }

  async function syncAll() {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    const styles = await PPS.getStyles();
    const cssOrigins = [], definitions = [], missingPermissions = [];
    for (const style of styles.filter(s => s.enabled)) {
      const patterns = await permittedPatterns(style);
      if (patterns.length !== PPS.patternsForStyle(style).length) missingPermissions.push(style.id);
      if (!patterns.length) continue;
      if (style.cssEnabled && style.css.trim()) cssOrigins.push(...patterns.map(PPS.originPattern));
      if (style.jsEnabled) definitions.push(...PPS.userScriptDefinitions(style, patterns));
    }
    const errors = [];
    try { await reconcileContent(cssOrigins); }
    catch (error) { errors.push({ id: "", message: "CSS: " + error.message }); }
    const user = await reconcileUser(definitions);
    // A discarded/frozen tab or a context invalidated by an extension reload
    // may never answer. It must not block saving or registering future scripts.
    await withDeadline(refreshTabs(cssOrigins), 1500);
    return { userScriptsAvailable: user.available, errors: [...errors, ...user.errors], missingPermissions };
  }

  async function cssForPage(message, sender) {
    if (!sender.tab || !PPS.isHttpUrl(sender.url) || !PPS.isHttpUrl(message.url) || new URL(sender.url).origin !== new URL(message.url).origin) return { ok: false };
    const styles = await PPS.getStyles(), css = [];
    for (const style of styles) {
      if (!style.enabled || !style.cssEnabled || !style.css.trim() || (!style.allFrames && sender.frameId !== 0) || !PPS.matchesStyle(style, message.url)) continue;
      const patterns = await permittedPatterns(style);
      if (patterns.some(p => PPS.matchPatternForUrl(p, message.url))) css.push(`/* ${style.name.replace(/\*\//g, "* /")} */\n${style.css}`);
    }
    return { ok: true, css: css.join("\n\n") };
  }

  async function mutate(message) {
    let styles = await PPS.getStyles();
    if (message.operation === "save") {
      const validation = PPS.validateStyle(message.style);
      if (!validation.ok) throw new Error(validation.reason);
      const style = PPS.normalizeStyle(message.style);
      const existing = styles.find(s => s.id === style.id);
      if (existing && message.expectedUpdatedAt !== existing.updatedAt) throw new Error("別の画面でこの設定が更新されました。下書きをコピーしてから画面を再読み込みしてください。");
      if (!existing && message.expectedUpdatedAt) throw new Error("この設定は別の画面で削除されました。");
      style.updatedAt = PPS.nowIso();
      styles = existing ? styles.map(s => s.id === style.id ? style : s) : [...styles, style];
    } else if (message.operation === "toggle") {
      if (typeof message.enabled !== "boolean") throw new Error("有効／無効の値が正しくありません。");
      styles = styles.map(s => s.id === message.id ? { ...s, enabled: message.enabled, updatedAt: PPS.nowIso() } : s);
    } else if (message.operation === "delete") {
      styles = styles.filter(s => s.id !== message.id);
    } else if (message.operation === "replace") {
      const result = PPS.validateExportPayload(message.payload);
      if (!result.ok) throw new Error(result.reason);
      // Preserve a local recovery copy before replacing an entire collection.
      await chrome.storage.local.set({ "personalPageStyler.beforeImport": PPS.buildExportPayload(styles) });
      styles = result.styles;
    } else throw new Error("不明な操作です。");
    await PPS.setStyles(styles);
    const status = await syncAll();
    return { ok: true, styles, ...status };
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || sender.id !== chrome.runtime.id) return false;
    let action;
    if (message.type === PPS.MESSAGE_CSS) action = cssForPage(message, sender);
    else if (sender.url?.startsWith(chrome.runtime.getURL(""))) {
      if (message.type === PPS.MESSAGE_SYNC) action = serialize(async () => ({ ok: true, ...await syncAll() }));
      if (message.type === PPS.MESSAGE_MUTATE) action = serialize(() => mutate(message));
    }
    if (!action) return false;
    action.then(respond, error => respond({ ok: false, error: error.message }));
    return true;
  });
  const schedule = () => { serialize(syncAll).catch(() => {}); };
  chrome.runtime.onInstalled.addListener(schedule);
  chrome.runtime.onStartup.addListener(schedule);
  chrome.permissions.onAdded.addListener(schedule);
  chrome.permissions.onRemoved.addListener(schedule);
  chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes[PPS.STORAGE_KEY]) schedule(); });
})();
