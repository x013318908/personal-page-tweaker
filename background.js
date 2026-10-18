importScripts("shared.js");

(function () {
  "use strict";

  function promisifyChromeCall(fn) {
    return new Promise((resolve, reject) => {
      fn((result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(result);
      });
    });
  }

  function scriptIdForPattern(pattern) {
    let hash = 0;
    for (let index = 0; index < pattern.length; index += 1) {
      hash = ((hash << 5) - hash + pattern.charCodeAt(index)) | 0;
    }

    return `${PPS.CONTENT_SCRIPT_PREFIX}${Math.abs(hash)}`;
  }

  async function getPermittedEnabledPatterns() {
    const styles = await PPS.getStyles();
    const patterns = new Set();

    for (const style of styles) {
      if (!style.enabled || !PPS.isValidMatchPattern(style.site.matchPattern)) {
        continue;
      }

      const permitted = await PPS.permissionContains(style.site.matchPattern);
      if (permitted) {
        patterns.add(style.site.matchPattern);
      }
    }

    return [...patterns];
  }

  async function unregisterOwnedContentScripts() {
    const registered = await promisifyChromeCall((done) => {
      chrome.scripting.getRegisteredContentScripts(done);
    }).catch(() => []);

    const ownedIds = registered
      .map((script) => script.id)
      .filter((id) => id.startsWith(PPS.CONTENT_SCRIPT_PREFIX));

    if (ownedIds.length === 0) {
      return;
    }

    await promisifyChromeCall((done) => {
      chrome.scripting.unregisterContentScripts({ ids: ownedIds }, done);
    }).catch(() => undefined);
  }

  async function registerContentScriptsForPatterns(patterns) {
    if (patterns.length === 0) {
      return;
    }

    const scripts = patterns.map((pattern) => ({
      id: scriptIdForPattern(pattern),
      matches: [pattern],
      js: ["shared.js", "content.js"],
      runAt: "document_start",
      allFrames: false,
      persistAcrossSessions: true
    }));

    await promisifyChromeCall((done) => {
      chrome.scripting.registerContentScripts(scripts, done);
    }).catch(() => undefined);
  }

  async function syncRegisteredContentScripts() {
    const patterns = await getPermittedEnabledPatterns();
    await unregisterOwnedContentScripts();
    await registerContentScriptsForPatterns(patterns);
    return patterns;
  }

  async function executeContentScript(tabId) {
    await promisifyChromeCall((done) => {
      chrome.scripting.executeScript({
        target: { tabId },
        files: ["shared.js", "content.js"]
      }, done);
    }).catch(() => undefined);
  }

  async function sendRefresh(tabId) {
    await promisifyChromeCall((done) => {
      chrome.tabs.sendMessage(tabId, { type: PPS.MESSAGE_REFRESH }, done);
    }).catch(() => undefined);
  }

  async function refreshMatchingTabs(patterns) {
    if (patterns.length === 0) {
      return;
    }

    const tabs = await promisifyChromeCall((done) => {
      chrome.tabs.query({ url: patterns }, done);
    }).catch(() => []);

    for (const tab of tabs) {
      if (!tab.id) {
        continue;
      }

      await executeContentScript(tab.id);
      await sendRefresh(tab.id);
    }
  }

  async function syncAndRefresh() {
    const patterns = await syncRegisteredContentScripts();
    await refreshMatchingTabs(patterns);
  }

  chrome.runtime.onInstalled.addListener(() => {
    syncAndRefresh();
  });

  chrome.runtime.onStartup.addListener(() => {
    syncAndRefresh();
  });

  chrome.permissions.onAdded.addListener(() => {
    syncAndRefresh();
  });

  chrome.permissions.onRemoved.addListener(() => {
    syncAndRefresh();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[PPS.STORAGE_KEY]) {
      syncAndRefresh();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== PPS.MESSAGE_SYNC) {
      return false;
    }

    syncAndRefresh()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  });
})();
