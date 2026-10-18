# Personal Page Tweaker 0.2.0

自分用のCSSとJavaScriptを、サイトごとに保存・実行するChrome拡張です。従来のCSS編集画面にJavaScriptタブを追加しました。Chrome 138以降に対応します。

広告、アクセス解析、更新時にページを開く処理、外部からの自動更新・コード取得はありません。設定はブラウザー内の `chrome.storage.local` に保存します。ユーザーが登録したコード自身の通信は、そのコードの内容に従います。

## 既存の0.1.0から更新

1. 現在の拡張の **Export** で設定をバックアップします。
2. このフォルダーのファイルを、従来読み込んでいた `personal-page-styler` フォルダーに上書きコピーします。フォルダーの場所を変えず、拡張を削除せずに更新します。
3. `chrome://extensions/` で **Personal Page Tweakerの再読み込みボタン** を押します。新しい権限の確認が出た場合は内容を確認して有効にします。
4. 同じ拡張の **詳細 → ユーザースクリプトを許可する** をオンにします。CSSだけを使う場合、このスイッチは不要です。
5. 編集画面と対象ページを再読み込みします。

保存キーと設定IDを引き継ぐため、既存CSSはそのまま使えます。v1のExportファイルもImportできます。0.2.0のExportはv2形式です。旧版へ戻す場合は、更新前に取ったv1バックアップを使ってください。

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
- 読み込み開始時・DOM構築後・読み込み後からJavaScriptの実行タイミングを選べます。既定は「読み込み後」です。

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
- 実行時エラーは対象ページの開発者ツールのConsoleで確認します。捕捉できる同期エラーには `[Personal Page Tweaker: 設定名]` が付きます。構文エラー・非同期エラーはChrome標準のConsoleに表示されます。

## 構成・テスト

Manifest V3。依存パッケージ・ビルド工程は不要です。CSSは付属のcontent script、ユーザーJavaScriptはChromeの `userScripts` APIで実行します。ユーザーJavaScriptに拡張のストレージやメッセージAPIを公開しません。

```powershell
node --test tests/core.test.cjs
node tests/browser-smoke.cjs
```

ブラウザーテストは別の一時プロファイルを使います。`PPS_CHROMIUM` 環境変数でChromium / Chrome for Testingの実行ファイルを指定できます。通常のChromeプロファイルにはアクセスしません。

2026-10-05、Windows上のChromium 145.0.7632.6で確認済み: 旧CSSデータの引き継ぎ、実際の編集画面からの保存、CSSの即時反映、JavaScriptの一度だけの実行、除外URL、停止、独立した環境／ページと同じ環境、読み込み開始時の実行、フレーム、拡張再読み込み後の復元、サイト権限取り消し。データ形式・URL条件・UserScriptヘッダーの自動テスト5件も通過しています。

公式API資料: [Chrome userScripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
