# Personal Page Tweaker 0.3.1

自分用のCSSとJavaScriptを、サイトごとに保存・実行するChrome拡張です。JavaScriptは3つの実行タイミングにそれぞれコードを保存でき、すべて同時に有効にできます。Chrome 138以降に対応します。

広告、アクセス解析、更新時にページを開く処理、外部からの自動更新・コード取得はありません。設定はブラウザー内の `chrome.storage.local` に保存します。ユーザーが登録したコード自身の通信は、そのコードの内容に従います。

## 既存の0.1.0 / 0.2.0 / 0.3.0から更新

1. 現在の拡張の **Export** で設定をバックアップします。
2. このフォルダーのファイルを、従来読み込んでいた `personal-page-styler` フォルダーに上書きコピーします。フォルダーの場所を変えず、拡張を削除せずに更新します。
3. `chrome://extensions/` で **Personal Page Tweakerの再読み込みボタン** を押します。新しい権限の確認が出た場合は内容を確認して有効にします。
4. 同じ拡張の **詳細 → ユーザースクリプトを許可する** をオンにします。CSSだけを使う場合、このスイッチは不要です。
5. 編集画面と対象ページを再読み込みします。

保存キーと設定IDを引き継ぐため、既存CSSはそのまま使えます。0.2.0のJavaScriptは、これまで選択していた実行タイミングの欄へ自動的に引き継ぎます。その他の欄は空欄になります。有効／無効、実行環境、対象URLなども保持します。

v1/v2のExportファイルもImportできます。0.3.0以降のExportは、タイミング別のJavaScriptを含むv3形式です。旧版へ戻す場合は、更新前に取ったバックアップを使ってください。

**別の場所から読み込むと、Chromeは別の拡張として扱います。** その場合は旧拡張でExport → 新拡張でImportし、サイト権限を許可し直してください。同時適用を避けるため、移行後は旧拡張を停止します。

## 新規導入

1. ZIPを展開します。
2. `chrome://extensions/` を開き、右上の **デベロッパー モード** をオンにします。
3. **パッケージ化されていない拡張機能を読み込む** で、`manifest.json` のあるフォルダーを選びます。
4. 拡張の **詳細 → ユーザースクリプトを許可する** をオンにします。

## 使い方

- 対象サイトを開き、拡張のポップアップで **このサイト用に作成** を押します。
- 設定の名前・対象URLを入力し、CSSまたはJavaScriptを貼り付けて **保存**。`Ctrl+S` / `Cmd+S` でも保存できます。
- サイト権限はサイトごとに許可します。対象URLが複数あれば1行に1つずつ入力します。
- **CSSは保存・停止・削除すると、開いているページにも反映されます。** ページ内遷移のURL条件も追従します。
- **JavaScriptは次のページ読み込みから実行されます。** 保存しても開いているページで勝手に再実行しません。停止や削除後も、実行済みのDOM変更やタイマーは再読み込みまで残ります。
- CSSとJavaScriptは、タブ内のチェックボックスで個別に有効／無効を切り替えられます。上部の「有効」は設定全体の切り替えです。
- ポップアップから設定の切り替え、名前を押して編集、対象ページの再読み込みができます。
- 対象ページ内のJavaScript変数に触れる場合は **ページと同じ環境** を選びます。通常は **独立した環境** を使ってください。独立した環境は設定ごとに分かれています。
- JavaScriptタブ内の **読み込み開始時（document_start）・DOM構築後（document_end）・読み込み後（document_idle）** を押すと、広い編集欄を切り替えられます。切り替えても未保存のコードは保持し、保存すると3つのタイミングをまとめて保存します。矢印キー・Home・Endでも切り替えられます。
- 各タブのコードはすべて有効になり、それぞれのタイミングで1回ずつ実行します。表示中のタブは実行対象に影響しません。実行しないタイミングは空欄にしてください。通常のコードは「読み込み後」に入力します。
- JavaScriptの有効／無効と実行環境は3つの欄で共通です。独立した環境でも、同じ設定の3つのタイミングは同じ環境を使います。タイミング間で値を引き継ぐ場合は `globalThis` のプロパティに保存してください。各欄の `let` / `const` などのローカル変数は欄ごとに分かれています。

実行済みのページへの再適用は、再読み込みボタンで明示的に行います。SPAのURL変更だけではJavaScriptは再実行されません。必要なら登録するスクリプト内で `MutationObserver` などを使ってください。

## 対象URL

Chromeのmatch patternのうち、http/https・ホスト・パスを扱います。

```text
https://example.com/*
*://*.example.org/articles/*
```

除外URLも同じ書式です。権限はホスト単位で許可されますが、実際の適用はパス条件と除外条件でも絞ります。URLのクエリーは条件に含まれ、`#`以降は含まれません。ポート指定、IPv6、`<all_urls>`、ローカルファイルはこの版では未対応です。すべてのWebサイトを明示指定する場合は `*://*/*` を使えます。

Chrome内部ページ、Chrome Web Storeなど、Chromeが拡張の実行を制限するページでは動きません。

## .user.jsのImport

**Import** からローカルの `.user.js` を開くと、新規の未保存・無効な設定として取り込みます。コードと対象URLを確認してから有効にして保存してください。既存の設定は置き換えません。

対応するメタデータ:

- `@name`
- `@match`（複数可）
- `@exclude-match`（複数可）
- `@run-at document-start / document-end / document-idle`
- `@noframes`（未指定ならフレーム内も対象）
- `@grant none / GM_addStyle / GM.addStyle`

`@grant none` はページと同じ環境を選びます。その他は独立した環境を選びます。`GM_addStyle(css)` はstyle要素を返し、`GM.addStyle(css)` はそれをPromiseで返します。

コードは `@run-at` に対応する編集欄へ取り込みます。`@run-at` がなければ「読み込み後」に入ります。他のタイミングの欄は空欄です。

**Tampermonkey/Greasemonkeyとの完全互換ではありません。** `GM_getValue`、`GM_setValue`、`GM_xmlhttpRequest`、`unsafeWindow`、メニュー追加などは未実装です。`@require`、`@resource`、`@include`、`@exclude`など実行に影響する未対応指定を含むファイルは、Import時にエラーを表示します。`@updateURL`、`@downloadURL`、`@version`などは自動更新に使用しません。

JavaScript欄に直接貼り付けた場合、メタデータコメントは解釈されません。対象URLなどは画面側で設定してください。外部スクリプトのURLを貼り付けて自動インストールする機能はありません。

## バックアップ

Exportは全設定をJSONに保存します。JSONのImportはプレビュー確認後に全設定を置き換えます。許可済みサイト用の有効なJavaScriptも復元され、次回読み込みから実行されます。権限自体はImportしません。

Import直前の内容は `personalPageStyler.beforeImport` に1世代分残します。復旧が必要な場合は、拡張の設定画面の開発者ツールで次のコードを実行し、得られたJSONをファイルに保存してImportできます。

```js
copy(JSON.stringify((await chrome.storage.local.get('personalPageStyler.beforeImport'))['personalPageStyler.beforeImport'], null, 2))
```

## 動かないとき

- 編集画面でサイト権限を確認します。
- JavaScriptタブの実行許可表示を確認します。「ユーザースクリプトを許可する」を変更したら **実行許可を再確認**。反映されなければ拡張自体を再読み込みします。
- 対象ページを再読み込みします。
- 実行時エラーは対象ページの開発者ツールのConsoleで確認します。捕捉できる同期エラーには `[Personal Page Tweaker: 設定名 / 実行タイミング]` が付きます。構文エラー・非同期エラーはChrome標準のConsoleに表示されます。

## 構成・テスト

Manifest V3。依存パッケージ・ビルド工程は不要です。CSSは付属のcontent script、ユーザーJavaScriptはChromeの `userScripts` APIで実行します。ユーザーJavaScriptに拡張のストレージやメッセージAPIを公開しません。

```powershell
node --test tests/*.test.cjs
node tests/browser-smoke.cjs
```

ブラウザーテストは別の一時プロファイルを使います。`PPS_CHROMIUM` 環境変数でChromium / Chrome for Testingの実行ファイルを指定できます。通常のChromeプロファイルにはアクセスしません。

自動テストは、旧CSS・単一JavaScriptデータの引き継ぎ、v3バックアップ、タイミング別コードの検証、URL条件、UserScriptヘッダー、スクリプト登録の更新と削除を確認します。ブラウザーテストは、タイミングの切り替えと未保存コードの保持、キーボード操作、選択中のタブを保ったまま全タイミングの保存・再表示、各タイミングでの一度だけの実行、1欄だけ空にしたときの停止、CSSの即時反映、除外URL、設定全体の停止、独立した環境／ページと同じ環境、フレーム、拡張再読み込み後の復元、サイト権限取り消しを確認します。

2026-10-30、Linux上のChrome for Testing 151.0.7922.34で、自動テスト12件とブラウザーテストの通過を確認しています。

公式API資料: [Chrome userScripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
