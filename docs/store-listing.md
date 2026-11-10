# Chrome Web Store 掲載原稿 — 1.1.0

メインの掲載言語は日本語。設定画面も日本語です。末尾の英語原稿は、英語の掲載説明を追加するときに使えます。

## 名前

Personal Page Tweaker

## 概要

サイトごとにCSSとJavaScriptを保存し、ページの見た目や動作を自分仕様に調整。3つの実行タイミングとサイト別のアクセス許可に対応。

## 詳細説明（日本語）

いつものページを、自分仕様に。

Personal Page Tweaker は、自分で用意したCSSとJavaScriptをサイトごとに保存し、ページの見た目や動作を調整するChrome拡張です。

主な機能
・サイトごとにCSSとJavaScriptを管理
・CSSは保存・停止・削除すると開いているページにも反映
・JavaScriptは「読み込み開始時」「DOM構築後」「読み込み後」に別々のコードを保存して実行
・広い編集欄とタイミング切り替え、内容のあるタブの小さな印
・対象URL、除外URL、埋め込みフレームの指定
・CSSとJavaScriptの個別の有効／無効、設定全体の切り替え
・サイト別のアクセス許可と、任意の全HTTP/HTTPSサイト一括許可
・独立した実行環境と、ページと同じ実行環境の選択
・ローカルの .user.js の取り込みとJSONバックアップ
・ブラウザーの明暗設定に対応

サイトへのアクセスは、初期状態ではサイトごとに許可します。任意で全HTTP/HTTPSサイトを一括許可することもできます。一括許可をオフにすると、以前の個別許可も解除され、サイトごとに許可し直せます。どちらの方式でも対象URL・除外URLを端末内で照合し、条件に合う許可済みページだけを登録コードで変更します。対象URLの条件、CSS、JavaScript、設定名はこのブラウザー内に保存します。開発者への送信、広告、利用状況の解析、コードの自動取得・自動更新はありません。

JavaScriptは対象ページの情報を読み取ったり、コードに従って外部と通信したりできます。内容を確認したコードを登録してください。

利用条件
・Chrome 138以降
・JavaScriptを使う場合は、chrome://extensions/ でこの拡張の「詳細」→「ユーザースクリプトを許可する」をオンにしてください。CSSだけならこの設定は不要です。
・JavaScriptの変更は対象ページの次の読み込みから反映します。保存時に再実行はしません。実行済みの変更は、停止・削除後も再読み込みまで残ります。
・Chrome内部ページやChrome Web Storeなど、Chromeが実行を制限するページでは使えません。
・Tampermonkey / Greasemonkeyとの完全互換ではありません。対応するGM機能はGM_addStyle / GM.addStyleです。

## English description

Make familiar pages your own.

Personal Page Tweaker stores your own CSS and JavaScript for websites you permit. Adjust how pages look and behave, with separate scripts for document_start, document_end and document_idle.

Features:
• Per-site CSS and JavaScript settings
• Live CSS updates on open pages
• A spacious editor with timing tabs and small indicators for tabs containing code
• URL matching, exclusions and optional frame support
• Independent CSS, JavaScript and rule enable/disable controls
• Per-site access by default, with optional all-HTTP/HTTPS-site permission
• Isolated user-script worlds or the page's main world
• Local .user.js import and JSON backup/restore
• Light and dark appearance

The settings interface is currently in Japanese. Chrome 138 or later is required. To use JavaScript, enable “Allow User Scripts” in this extension's details at chrome://extensions/. CSS works without this toggle.

Site access is granted individually by default. You can opt into all HTTP/HTTPS sites through Chrome's permission prompt. Turning this off also removes earlier individual grants; sites can be permitted individually again. Either way, the extension matches page URLs locally and runs your code only within each rule's URL/exclusion/frame conditions. Rules, URL patterns and code stay in Chrome local storage. The developer receives no data. There are no ads, analytics, automatic code downloads or script updates. User-supplied JavaScript can read page information and make network requests as written; only register code you have reviewed.

JavaScript changes take effect on the next page load. Saving does not rerun a script in the current document. Effects of previously executed code remain until reload. Chrome-restricted pages are unsupported. This is not a fully compatible Tampermonkey/Greasemonkey replacement; GM_addStyle and GM.addStyle are supported.

## ストア上のリンク

| フィールド | URL |
| --- | --- |
| ウェブサイト | https://x013318908.github.io/personal-page-tweaker/ |
| プライバシーポリシー | https://x013318908.github.io/personal-page-tweaker/privacy.html |
| サポート | https://github.com/x013318908/personal-page-tweaker/issues |
| 権限の説明 | https://x013318908.github.io/personal-page-tweaker/permissions.html |

GitHub Pagesの公開設定後、各URLがログインなしで開くことを確認してから入力します。公開前の新しいストアURLや拡張IDは原稿に埋め込んでいません。

## 画像

| 用途 | ファイル | サイズ |
| --- | --- | --- |
| ストアアイコン | `icons/icon-128.png` | 128×128 |
| CSSの紹介 | `docs/assets/screenshots/01-css.png` | 1280×800 |
| JavaScriptの紹介 | `docs/assets/screenshots/02-javascript.png` | 1280×800 |
| サイト別の管理 | `docs/assets/screenshots/03-site-controls.png` | 1280×800 |
| 小型プロモーション画像 | `docs/assets/promotion_image/promotion_small.png` | 440×280 |
| マーキープロモーション画像 | `docs/assets/promotion_image/promotion_large.png` | 1400×560 |

紹介画像はローカルのサンプルページと実際の拡張画面で作成しています。個人の閲覧履歴やアカウント情報は含みません。
