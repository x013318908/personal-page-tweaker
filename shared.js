(function (global) {
  "use strict";
  const APP_ID = "personal-page-styler";
  const SCHEMA_VERSION = 2;
  // Keep the v1 key so an in-place upgrade retains existing CSS.
  const STORAGE_KEY = "personalPageStyler.styles";
  const CONTENT_STYLE_ID = "personal-page-styler-style";
  const CONTENT_SCRIPT_PREFIX = "personal-page-styler:";
  const USER_SCRIPT_PREFIX = "pps-js:";
  const MESSAGE_REFRESH = "personal-page-styler:refresh";
  const MESSAGE_SYNC = "personal-page-styler:sync";
  const MESSAGE_CSS = "personal-page-styler:css";
  const MESSAGE_MUTATE = "personal-page-styler:mutate";
  const nowIso = () => new Date().toISOString();
  const makeId = () => global.crypto.randomUUID();
  const lines = (text) => [...new Set(String(text || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean))];

  function normalizeHost(input) {
    const raw = String(input || "").trim();
    try { return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase(); }
    catch { return ""; }
  }
  function isHttpUrl(url) {
    try { return ["http:", "https:"].includes(new URL(url).protocol); }
    catch { return false; }
  }
  const getHostFromUrl = url => isHttpUrl(url) ? new URL(url).hostname.toLowerCase() : "";
  function parseMatchPattern(pattern) {
    const match = String(pattern || "").match(/^(\*|http|https):\/\/([^/]+)(\/[^\s#]*)$/);
    if (!match) return null;
    const [, scheme, rawHost, path] = match;
    const host = rawHost.toLowerCase();
    const bare = host.startsWith("*.") ? host.slice(2) : host;
    if (host !== "*") {
      if (!bare || /[\s*:@?#\\]/.test(bare)) return null;
      try { if (new URL(`https://${bare}`).hostname !== bare) return null; }
      catch { return null; }
    }
    return { scheme, host, path };
  }
  const isValidMatchPattern = pattern => Boolean(parseMatchPattern(pattern));
  function makeMatchPatternFromUrl(url) {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}/*`;
  }
  const makeMatchPatternFromHost = (host, scheme) => `${scheme === "http" ? "http" : "https"}://${normalizeHost(host)}/*`;
  function originPattern(pattern) {
    const p = parseMatchPattern(pattern);
    if (!p) throw new Error(`対象URLの書式が正しくありません: ${pattern}`);
    return `${p.scheme}://${p.host}/*`;
  }
  function matchPatternForUrl(pattern, url) {
    const p = parseMatchPattern(pattern);
    if (!p || !isHttpUrl(url)) return false;
    const u = new URL(url);
    if (p.scheme !== "*" && `${p.scheme}:` !== u.protocol) return false;
    const host = u.hostname.toLowerCase();
    if (p.host !== "*" && p.host !== host && !(p.host.startsWith("*.") && (host === p.host.slice(2) || host.endsWith(p.host.slice(1))))) return false;
    // Chrome match patterns include the query, but not the URL fragment.
    const escaped = p.path.split("*").map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${escaped}$`).test(u.pathname + u.search);
  }
  const patternsForStyle = style => style.site.matchPatterns || [style.site.matchPattern];
  function matchesStyle(style, url) {
    return patternsForStyle(style).some(p => matchPatternForUrl(p, url)) &&
      !(style.excludeMatches || []).some(p => matchPatternForUrl(p, url));
  }
  const styleMatchesUrl = (style, url) => Boolean(style && style.enabled && matchesStyle(style, url));
  function normalizeStyle(style) {
    const timestamp = nowIso();
    const patterns = Array.isArray(style.site?.matchPatterns) ? [...new Set(style.site.matchPatterns)] : [style.site?.matchPattern || ""];
    return {
      id: style.id || makeId(), name: (style.name || "新しい設定").trim(), enabled: style.enabled !== false,
      site: { host: style.site?.host || parseMatchPattern(patterns[0])?.host || "", matchPattern: patterns[0] || "", matchPatterns: patterns },
      excludeMatches: style.excludeMatches || [],
      css: style.css || "", cssEnabled: style.cssEnabled !== false,
      js: style.js || "", jsEnabled: style.jsEnabled !== false,
      runAt: style.runAt || "document_idle", world: style.world || "USER_SCRIPT", allFrames: style.allFrames === true,
      createdAt: style.createdAt || timestamp, updatedAt: style.updatedAt || timestamp
    };
  }
  function makeBlankStyle() { return normalizeStyle({ id: makeId(), name: "新しい設定", site: { matchPattern: "" } }); }
  function makeStyleFromUrl(url) {
    return normalizeStyle({ id: makeId(), name: getHostFromUrl(url), site: { host: getHostFromUrl(url), matchPattern: makeMatchPatternFromUrl(url) } });
  }
  function validateStyle(style) {
    const fail = reason => ({ ok: false, reason });
    if (!style || typeof style !== "object" || Array.isArray(style)) return fail("設定の形式が正しくありません。");
    if (typeof style.id !== "string" || !style.id.trim() || style.id.length > 160) return fail("設定IDが正しくありません。");
    if (typeof style.name !== "string" || !style.name.trim()) return fail("名前を入力してください。");
    if (typeof style.enabled !== "boolean") return fail("有効／無効の値が正しくありません。");
    if (!style.site || typeof style.site !== "object") return fail("対象URLを入力してください。");
    const patterns = patternsForStyle(style);
    if (!Array.isArray(patterns) || !patterns.length || patterns.some(p => typeof p !== "string" || !isValidMatchPattern(p))) return fail("対象URLをChromeのmatch patternで入力してください。例: https://example.com/*");
    if (style.excludeMatches !== undefined && (!Array.isArray(style.excludeMatches) || style.excludeMatches.some(p => typeof p !== "string" || !isValidMatchPattern(p)))) return fail("除外URLの書式が正しくありません。");
    if (typeof style.css !== "string" || (style.js !== undefined && typeof style.js !== "string")) return fail("CSSとJavaScriptは文字列で指定してください。");
    for (const key of ["cssEnabled", "jsEnabled", "allFrames"]) if (style[key] !== undefined && typeof style[key] !== "boolean") return fail(`${key} の値が正しくありません。`);
    if (style.runAt !== undefined && !["document_start", "document_end", "document_idle"].includes(style.runAt)) return fail("実行タイミングが正しくありません。");
    if (style.world !== undefined && !["USER_SCRIPT", "MAIN"].includes(style.world)) return fail("実行環境が正しくありません。");
    if (style.site.host !== undefined && typeof style.site.host !== "string") return fail("サイト名が正しくありません。");
    return { ok: true };
  }
  const sortStyles = styles => [...styles].sort((a, b) => a.site.host.localeCompare(b.site.host) || a.name.localeCompare(b.name));
  function validateExportPayload(payload) {
    if (!payload || payload.app !== APP_ID || ![1, 2].includes(payload.schemaVersion) || !Array.isArray(payload.styles)) return { ok: false, reason: "Personal Page Tweakerのv1/v2バックアップではありません。" };
    const seen = new Set(), styles = [];
    for (const raw of payload.styles) {
      const result = validateStyle(raw);
      if (!result.ok) return result;
      const style = normalizeStyle(raw);
      if (seen.has(style.id)) style.id = makeId();
      seen.add(style.id);
      styles.push(style);
    }
    return { ok: true, styles };
  }
  const buildExportPayload = styles => ({ app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(), styles: styles.map(normalizeStyle) });
  async function getStyles() {
    const result = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
    if (!Array.isArray(result[STORAGE_KEY])) throw new Error("保存データを読み込めません。既存データは保持しています。");
    return result[STORAGE_KEY].map(style => {
      const result = validateStyle(style);
      if (!result.ok) throw new Error(`保存データ: ${result.reason}`);
      return normalizeStyle(style);
    });
  }
  function setStyles(styles) { return chrome.storage.local.set({ [STORAGE_KEY]: styles.map(normalizeStyle) }); }
  function permissionOrigins(patterns) { return [...new Set((Array.isArray(patterns) ? patterns : [patterns]).map(originPattern))]; }
  async function permissionContains(patterns) {
    try { return await chrome.permissions.contains({ origins: permissionOrigins(patterns) }); }
    catch { return false; }
  }
  async function permissionRequest(patterns) { return chrome.permissions.request({ origins: permissionOrigins(patterns) }); }
  async function request(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "拡張機能に接続できません。拡張機能を再読み込みしてください。");
    return response;
  }
  const sync = () => request({ type: MESSAGE_SYNC });
  const mutate = (operation, data) => request({ type: MESSAGE_MUTATE, operation, ...data });
  const codeLabel = style => [style.css.trim() ? "CSS" : "", style.js.trim() ? "JS" : ""].filter(Boolean).join(" + ") || "空";

  function parseUserScript(source) {
    const block = source.match(/^[ \t]*\/\/\s*==UserScript==\s*\r?\n([\s\S]*?)^[ \t]*\/\/\s*==\/UserScript==/m);
    if (!block) return { ok: false, reason: "UserScriptヘッダーがありません。通常のJavaScriptは編集欄に貼り付けてください。" };
    const metadata = Object.create(null);
    for (const line of block[1].split(/\r?\n/)) {
      const match = line.match(/^\s*\/\/\s*@([\w-]+)(?:\s+(.*))?$/);
      if (match) (metadata[match[1]] ||= []).push((match[2] || "").trim());
    }
    const unsupported = ["require", "resource", "include", "exclude", "connect", "inject-into", "sandbox", "unwrap", "top-level-await"].filter(k => metadata[k]);
    const grants = (metadata.grant || []).filter(g => !["none", "GM_addStyle", "GM.addStyle"].includes(g));
    if (unsupported.length || grants.length) return { ok: false, reason: `この版では未対応です: ${[...unsupported.map(k => "@" + k), ...grants].join(", ")}。内容を対応するJavaScriptに直して貼り付けてください。` };
    const matches = metadata.match || [];
    if (!matches.length) return { ok: false, reason: "@matchが必要です。" };
    const runAt = (metadata["run-at"]?.[0] || "document-idle").replaceAll("-", "_");
    const style = normalizeStyle({ id: makeId(), name: metadata.name?.[0] || "インポートしたスクリプト", enabled: false,
      site: { matchPatterns: matches }, excludeMatches: metadata["exclude-match"] || [], css: "", js: source, runAt,
      world: metadata.grant?.includes("none") ? "MAIN" : "USER_SCRIPT", allFrames: !metadata.noframes });
    const validation = validateStyle(style);
    if (!validation.ok) return validation;
    return { ok: true, style };
  }

  function userScriptDefinition(style, permittedPatterns = patternsForStyle(style)) {
    const code = `(() => {\nconst GM_addStyle = (css) => { const s = document.createElement("style"); s.textContent = String(css); const attach = () => (document.head || document.documentElement).append(s); if (document.documentElement) attach(); else document.addEventListener("DOMContentLoaded", attach, { once: true }); return s; };\nconst GM = Object.freeze({ addStyle: async (css) => GM_addStyle(css) });\ntry {\n${style.js}\n} catch (error) { console.error(${JSON.stringify(`[Personal Page Tweaker: ${style.name}]`)}, error); }\n})();\n//# sourceURL=pps-${encodeURIComponent(style.id)}.user.js`;
    return { id: USER_SCRIPT_PREFIX + style.id, matches: permittedPatterns, excludeMatches: style.excludeMatches,
      js: [{ code }], runAt: style.runAt, world: style.world, allFrames: style.allFrames,
      ...(style.world === "USER_SCRIPT" ? { worldId: "pps-" + style.id } : {}) };
  }

  global.PPS = { APP_ID, SCHEMA_VERSION, STORAGE_KEY, CONTENT_STYLE_ID, CONTENT_SCRIPT_PREFIX, USER_SCRIPT_PREFIX,
    MESSAGE_REFRESH, MESSAGE_SYNC, MESSAGE_CSS, MESSAGE_MUTATE, nowIso, makeId, lines, normalizeHost, isHttpUrl,
    getHostFromUrl, parseMatchPattern, isValidMatchPattern, makeMatchPatternFromUrl, makeMatchPatternFromHost,
    originPattern, matchPatternForUrl, patternsForStyle, matchesStyle, styleMatchesUrl, normalizeStyle, makeBlankStyle,
    makeStyleFromUrl, validateStyle, sortStyles, validateExportPayload, buildExportPayload, getStyles, setStyles,
    permissionContains, permissionRequest, sync, mutate, codeLabel, parseUserScript, userScriptDefinition };
})(globalThis);
