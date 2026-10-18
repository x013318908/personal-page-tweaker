(function (global) {
  "use strict";

  const APP_ID = "personal-page-styler";
  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = "personalPageStyler.styles";
  const CONTENT_STYLE_ID = "personal-page-styler-style";
  const CONTENT_SCRIPT_PREFIX = "personal-page-styler:";
  const MESSAGE_REFRESH = "personal-page-styler:refresh";
  const MESSAGE_SYNC = "personal-page-styler:sync";

  function nowIso() {
    return new Date().toISOString();
  }

  function makeId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }

    return [
      Date.now().toString(36),
      Math.random().toString(36).slice(2, 10)
    ].join("-");
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeHost(input) {
    const raw = String(input || "").trim();
    if (!raw) {
      return "";
    }

    try {
      const asUrl = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
      return asUrl.hostname.toLowerCase();
    } catch (_error) {
      return raw
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .replace(/:\d+$/, "")
        .toLowerCase();
    }
  }

  function isHttpUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (_error) {
      return false;
    }
  }

  function getHostFromUrl(url) {
    if (!isHttpUrl(url)) {
      return "";
    }

    return new URL(url).hostname.toLowerCase();
  }

  function makeMatchPatternFromUrl(url) {
    const parsed = new URL(url);
    const scheme = parsed.protocol === "http:" ? "http" : "https";
    return `${scheme}://${parsed.hostname.toLowerCase()}/*`;
  }

  function makeMatchPatternFromHost(host, scheme) {
    const normalizedHost = normalizeHost(host);
    const normalizedScheme = scheme === "http" ? "http" : "https";
    return `${normalizedScheme}://${normalizedHost}/*`;
  }

  function parseMatchPattern(pattern) {
    const match = String(pattern || "").trim().match(/^(\*|http|https):\/\/([^/]+)(\/.*)$/);
    if (!match) {
      return null;
    }

    const scheme = match[1];
    const host = match[2].toLowerCase();
    const path = match[3] || "/*";

    if (!["*", "http", "https"].includes(scheme)) {
      return null;
    }

    if (!host || host.includes(":") || host.includes(" ")) {
      return null;
    }

    if (!path.startsWith("/")) {
      return null;
    }

    return { scheme, host, path };
  }

  function isValidMatchPattern(pattern) {
    return parseMatchPattern(pattern) !== null;
  }

  function hostMatchesPattern(patternHost, actualHost) {
    const host = actualHost.toLowerCase();
    if (patternHost === "*") {
      return true;
    }

    if (patternHost.startsWith("*.")) {
      const suffix = patternHost.slice(2);
      return host === suffix || host.endsWith(`.${suffix}`);
    }

    return patternHost === host;
  }

  function pathMatchesPattern(patternPath, actualPath) {
    const regex = new RegExp(`^${patternPath.split("*").map(escapeRegExp).join(".*")}$`);
    return regex.test(actualPath);
  }

  function matchPatternForUrl(pattern, url) {
    const parsedPattern = parseMatchPattern(pattern);
    if (!parsedPattern || !isHttpUrl(url)) {
      return false;
    }

    const parsedUrl = new URL(url);
    const scheme = parsedUrl.protocol.replace(":", "");
    const path = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;

    if (parsedPattern.scheme !== "*" && parsedPattern.scheme !== scheme) {
      return false;
    }

    return (
      hostMatchesPattern(parsedPattern.host, parsedUrl.hostname) &&
      pathMatchesPattern(parsedPattern.path, path)
    );
  }

  function styleMatchesUrl(style, url) {
    return Boolean(
      style &&
      style.enabled &&
      style.site &&
      matchPatternForUrl(style.site.matchPattern, url)
    );
  }

  function makeStyleFromUrl(url) {
    const host = getHostFromUrl(url);
    const matchPattern = makeMatchPatternFromUrl(url);
    const timestamp = nowIso();

    return {
      id: makeId(),
      name: host || "New style",
      enabled: true,
      site: {
        host,
        matchPattern
      },
      css: "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function makeBlankStyle() {
    const timestamp = nowIso();

    return {
      id: makeId(),
      name: "New style",
      enabled: true,
      site: {
        host: "",
        matchPattern: ""
      },
      css: "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function validateStyle(style) {
    if (!style || typeof style !== "object") {
      return { ok: false, reason: "Style must be an object." };
    }

    if (typeof style.id !== "string" || !style.id.trim()) {
      return { ok: false, reason: "Style id is required." };
    }

    if (typeof style.name !== "string" || !style.name.trim()) {
      return { ok: false, reason: "Style name is required." };
    }

    if (typeof style.enabled !== "boolean") {
      return { ok: false, reason: "Style enabled must be boolean." };
    }

    if (!style.site || typeof style.site !== "object") {
      return { ok: false, reason: "Style site is required." };
    }

    const host = normalizeHost(style.site.host);
    if (!host) {
      return { ok: false, reason: "Site host is required." };
    }

    if (!isValidMatchPattern(style.site.matchPattern)) {
      return { ok: false, reason: "Match pattern must be an http(s) Chrome match pattern." };
    }

    if (typeof style.css !== "string") {
      return { ok: false, reason: "CSS must be a string." };
    }

    return { ok: true };
  }

  function normalizeStyle(style) {
    const timestamp = nowIso();
    return {
      id: String(style.id || makeId()),
      name: String(style.name || "New style").trim(),
      enabled: Boolean(style.enabled),
      site: {
        host: normalizeHost(style.site && style.site.host),
        matchPattern: String(style.site && style.site.matchPattern || "").trim()
      },
      css: String(style.css || ""),
      createdAt: String(style.createdAt || timestamp),
      updatedAt: String(style.updatedAt || timestamp)
    };
  }

  function sortStyles(styles) {
    return [...styles].sort((a, b) => {
      const hostCompare = a.site.host.localeCompare(b.site.host);
      if (hostCompare !== 0) {
        return hostCompare;
      }

      return a.name.localeCompare(b.name);
    });
  }

  function validateExportPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return { ok: false, reason: "Import file must contain a JSON object." };
    }

    if (payload.app !== APP_ID || payload.schemaVersion !== SCHEMA_VERSION) {
      return { ok: false, reason: "Import file is not a Personal Page Tweaker v1 export." };
    }

    if (!Array.isArray(payload.styles)) {
      return { ok: false, reason: "Import file is missing styles." };
    }

    const seenIds = new Set();
    const styles = [];

    for (const rawStyle of payload.styles) {
      const normalized = normalizeStyle(rawStyle);
      const validation = validateStyle(normalized);
      if (!validation.ok) {
        return { ok: false, reason: validation.reason };
      }

      if (seenIds.has(normalized.id)) {
        normalized.id = makeId();
      }

      seenIds.add(normalized.id);
      styles.push(normalized);
    }

    return { ok: true, styles };
  }

  function buildExportPayload(styles) {
    return {
      app: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: nowIso(),
      styles: styles.map(normalizeStyle)
    };
  }

  function chromeLastError() {
    return global.chrome && chrome.runtime && chrome.runtime.lastError;
  }

  function getStyles() {
    return new Promise((resolve) => {
      chrome.storage.local.get({ [STORAGE_KEY]: [] }, (result) => {
        if (chromeLastError()) {
          resolve([]);
          return;
        }

        const styles = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
        resolve(styles.map(normalizeStyle));
      });
    });
  }

  function setStyles(styles) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEY]: styles.map(normalizeStyle) }, () => {
        const error = chromeLastError();
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve();
      });
    });
  }

  function permissionContains(matchPattern) {
    return new Promise((resolve) => {
      chrome.permissions.contains({ origins: [matchPattern] }, (contains) => {
        if (chromeLastError()) {
          resolve(false);
          return;
        }

        resolve(Boolean(contains));
      });
    });
  }

  function permissionRequest(matchPattern) {
    return new Promise((resolve) => {
      chrome.permissions.request({ origins: [matchPattern] }, (granted) => {
        if (chromeLastError()) {
          resolve(false);
          return;
        }

        resolve(Boolean(granted));
      });
    });
  }

  global.PPS = {
    APP_ID,
    SCHEMA_VERSION,
    STORAGE_KEY,
    CONTENT_STYLE_ID,
    CONTENT_SCRIPT_PREFIX,
    MESSAGE_REFRESH,
    MESSAGE_SYNC,
    buildExportPayload,
    getHostFromUrl,
    getStyles,
    isHttpUrl,
    isValidMatchPattern,
    makeBlankStyle,
    makeId,
    makeMatchPatternFromHost,
    makeMatchPatternFromUrl,
    makeStyleFromUrl,
    matchPatternForUrl,
    normalizeHost,
    normalizeStyle,
    nowIso,
    permissionContains,
    permissionRequest,
    setStyles,
    sortStyles,
    styleMatchesUrl,
    validateExportPayload,
    validateStyle
  };
})(globalThis);
