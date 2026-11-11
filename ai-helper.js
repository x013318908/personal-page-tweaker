(function (global) {
  "use strict";
  const fields = ["name", "site", "excludeMatches", "css", "cssEnabled", "jsByRunAt", "jsEnabled", "world", "allFrames"];
  function buildPrompt(style, request) {
    if (!request.trim()) throw new Error("実現したいこと、または直したい問題を入力してください。");
    const settings = Object.fromEntries(fields.map(key => [key, style[key]]));
    return [
      "Personal Page Tweaker 用の設定を作成・修正してください。",
      "以下の依頼と現在の設定を参考に、設定1件の完全なJSONオブジェクトだけを返してください（差分ではありません）。",
      "出力キーは name, site: {matchPatterns: string[]}, excludeMatches: string[], css: string, cssEnabled: boolean, jsByRunAt: {document_start: string, document_end: string, document_idle: string}, jsEnabled: boolean, world: USER_SCRIPT または MAIN, allFrames: boolean です。",
      "id・日時・enabled・バックアップ用のstyles配列は不要です。文字列内の改行や引用符をJSONとしてエスケープしてください。",
      "対象URLはChrome match pattern形式（例 https://example.com/*）。必要なサイト・パスだけに限定してください。",
      "見た目の変更にはCSSを優先。JavaScriptは必要なタイミングの欄だけに記述し、ほかは空文字にしてください。各欄は別の関数内で実行されます。通常はdocument_idle、worldはUSER_SCRIPT、allFramesはfalseです。",
      "GM_addStyle / GM.addStyle のみ対応しています。その他のGM_* API、chrome拡張API、@require、@resource、外部ライブラリの読み込み、トップレベルawait、import/exportは使えません。",
      "依頼にない通信・情報収集・操作を追加しないでください。ページ構造が不明ならセレクターを断定せず、必要なHTMLやスクリーンショットを先に質問してください。",
      "修正時は依頼と無関係な既存のCSS・各タイミングのJavaScriptを保持してください。",
      "\n依頼:\n" + request.trim(),
      "\n現在の設定（未保存の編集も含む）:\n" + JSON.stringify(settings, null, 2)
    ].join("\n");
  }
  function parseReply(text) {
    let source = text.trim();
    const fence = source.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
    if (fence) source = fence[1];
    let raw;
    try { raw = JSON.parse(source); } catch { throw new Error("JSONを読み取れません。AIが返したJSON全体を貼り付けてください。"); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("設定1件のJSONオブジェクトを貼り付けてください。");
    const allowed = [...fields, "id", "enabled", "createdAt", "updatedAt"];
    if (Object.keys(raw).some(key => !allowed.includes(key))) throw new Error("未対応の項目があります。依頼文で指定した形式の設定1件を使ってください。");
    if (fields.some(key => !Object.hasOwn(raw, key))) throw new Error("項目が不足しています。差分ではなく設定全体のJSONを貼り付けてください。");
    if (!raw.site || Object.keys(raw.site).some(key => !["matchPatterns", "matchPattern", "host"].includes(key))) throw new Error("siteには対象URLのmatchPatternsを指定してください。");
    if (!raw.jsByRunAt || global.PPS.RUN_ATS.some(key => typeof raw.jsByRunAt[key] !== "string")) throw new Error("JavaScriptの3つのタイミングを指定してください。未使用の欄は空文字です。");
    const candidate = { ...Object.fromEntries(fields.map(key => [key, raw[key]])), id: global.PPS.makeId(), enabled: false };
    const result = global.PPS.validateStyle(candidate);
    if (!result.ok) throw new Error(result.reason);
    return global.PPS.normalizeStyle(candidate);
  }
  global.PPTAI = { buildPrompt, parseReply };
})(globalThis);
