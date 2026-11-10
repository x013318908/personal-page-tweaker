# Chrome Web Store 公開手順

公開準備版: **1.1.0**。既存の保存キー・設定ID・v3データ形式を引き継ぎます。一括サイト許可は任意で、初期状態では従来の個別許可を使います。

## 提出ファイルを作る

Python 3.9以降を使います。拡張自体のビルドや依存パッケージの導入は不要です。

```sh
python scripts/package.py
```

生成物:

- `dist/personal-page-tweaker-1.1.0.zip`
- `dist/personal-page-tweaker-1.1.0.zip.sha256`

ZIP直下に `manifest.json` が入り、実行用のJS/HTML/CSS、アイコン、日本語のマニフェスト用メッセージだけを含みます。`.git`、テスト、公開用Webページ、画像生成用スクリプト、秘密鍵や環境設定は入りません。スクリプトは権限・ローカルリソース・画像サイズ・ZIP内の内容も検証します。

同じ入力からは同じZIPとSHA-256が生成されます。GitHubの「Download ZIP」はリポジトリ全体なので、ストアには上記の提出用ZIPを使ってください。

## 公開ページを有効にする

Read Later Is Brokenと同じく、GitHub Pagesは `main` ブランチの `docs/` フォルダーを使います。

1. 公開準備の変更を `main` にマージします。
2. リポジトリの **Settings → Pages → Build and deployment** を開きます。
3. **Deploy from a branch → main → /docs** を選び、Saveします。
4. 次の3ページがログインなしで開くことを確認します。

| ページ | 公開URL |
| --- | --- |
| 紹介 | https://x013318908.github.io/personal-page-tweaker/ |
| プライバシー | https://x013318908.github.io/personal-page-tweaker/privacy.html |
| 権限 | https://x013318908.github.io/personal-page-tweaker/permissions.html |

このリポジトリは準備開始時点ではPagesが未設定です。ファイルの追加だけでは上記URLは公開されません。

## Developer Dashboardに入力する

以前の拡張と同じ発行者アカウントで [Developer Dashboard](https://chrome.google.com/webstore/devconsole/) を開き、**新しいアイテム**として提出用ZIPをアップロードします。Read Later Is Brokenの既存アイテムは更新しません。

1. `docs/store-listing.md` から名前・概要・説明・URLを入力します。主言語は日本語です。カテゴリは内容に合う **Tools / ツール** を選びます。
2. 同資料の画像一覧からアイコン・スクリーンショット・プロモーション画像を追加します。
3. Privacy practicesには、`docs/permissions.html` のSingle purpose・権限別の英文・User-provided codeの説明を転記します。
4. Remote codeは**ユーザー提供コードを `chrome.userScripts` で実行することを申告**し、パッケージ外のコードを含むため **Yes** として下記の英文を使います。自動ダウンロードの有無と、ユーザーが手入力／ローカルファイル選択するコードを区別します。
5. 下記のデータ利用表に沿って入力し、プライバシーポリシーURLを指定します。端末内の処理も含めて記載します。
6. 発行者プロフィールの既存の連絡先・配布地域・公開範囲を確認し、審査用手順を追加します。

### Remote code欄の英文

Personal Page Tweaker is a user-script manager. Users explicitly enter JavaScript in the editor or select a local .user.js/backup file. Only this user-provided code is executed through chrome.userScripts on sites matching the user's rules and granted host access. Access is granted per site by default; users can explicitly opt into all HTTP/HTTPS sites. The extension does not fetch executable code from URLs, CDNs or developer servers, use eval/new Function in extension contexts, or automatically install/update scripts. All extension logic is in the submitted package. User-script messaging to extension APIs is not enabled.

### データ利用の申告

「開発者への送信がない」ことと「端末内でもデータを扱わない」ことは別です。今回の拡張は、URLの照合とユーザー指定のページ変更を行うため、Read Later Is Brokenの掲載上の申告文をそのまま転用しません。

| データ種別 | 申告する扱い |
| --- | --- |
| Web history / ウェブ履歴 | 閲覧中・許可済みページのURLを端末内で照合し、ポップアップにホストを表示。閲覧履歴APIや履歴ログは使わず、外部送信もしない。 |
| Website content / ウェブサイトのコンテンツ | ユーザー指定のCSS/JavaScriptでページ内容・見た目・動作を変更。ユーザー自身が登録したコード・URL条件を端末内に保存。 |
| その他のデータ種別 | 拡張本体では氏名、健康情報、金融・決済情報、認証情報、個人的な通信、位置情報、操作履歴の収集機能を持たない。任意のユーザーコードの動作はプライバシーポリシーで別途説明。 |

上の2種別はローカルでの取扱いとして開示します。3つのLimited Useに関する確認事項（販売しない・単一目的外に使わない・信用評価や融資に使わない）は本実装とポリシーに対応します。申請時点のダッシュボードのラベルも確認してください。

## 審査担当者向け手順（転記用）

No account or login is required. The settings interface is in Japanese.

1. Install the extension in Chrome 138 or later. Open its Details page at chrome://extensions/ and enable “Allow User Scripts”. CSS remains usable without this toggle.
2. Open https://example.com/. Open the extension popup and click 「このサイト用に作成」 (create a rule for this site).
3. Enter a name. The match pattern should be https://example.com/*. Enter `body { background: #eef3ff; }` in the CSS tab. Save with 「保存」 and grant access to example.com. The background changes in the existing page.
4. Open the JavaScript tab, select 「読み込み後」, and enter `document.querySelector('h1').textContent += ' ★';`. Save and reload example.com. The heading receives a star once.
5. The other timing tabs are independent editors. Their code is also saved and runs at its respective native document timing. A small dot indicates a non-empty editor.
6. In the popup, turn the rule off. CSS is removed immediately. Reload the target page to clear effects of already executed JavaScript.
7. Export creates a local JSON backup. Import displays a replacement preview. A local .user.js imports as a disabled draft; it is not automatically enabled.
8. In settings, expand 「アクセス設定」. 「全サイトへのアクセスを許可する」 is off by default. It requests all HTTP/HTTPS host access only when checked, through Chrome's permission prompt. Cancelling keeps individual-site permission requests available. Once granted, new rules need no separate site prompt; execution still follows each rule's URL/exclusion/frame conditions.
9. Unchecking that option removes all HTTP/HTTPS host grants, including earlier individual grants, as explained beside the control. CSS is removed; already executed JavaScript requires a page reload to clear its effects. Use a rule's 「権限を許可」 button to resume individual access. Chrome-side permission changes also update the open settings page. Host grants are not included in JSON backups.

## 提出する版を確認する

```sh
node --test tests/*.test.cjs
python scripts/package.py
python -m zipfile -e dist/personal-page-tweaker-1.1.0.zip /path/to/unpacked-release
```

展開先を `PPS_EXTENSION_ROOT`、Chrome / Chrome for Testingの実行ファイルを `PPS_CHROMIUM` に指定して実行します。

```sh
PPS_EXTENSION_ROOT=/path/to/unpacked-release PPS_CHROMIUM=/path/to/chrome node tests/browser-smoke.cjs
```

PowerShellでは各環境変数を `$env:PPS_EXTENSION_ROOT` / `$env:PPS_CHROMIUM` に設定してから `node tests/browser-smoke.cjs` を実行します。テストは一時プロファイルを使い、普段のChromeプロファイルにはアクセスしません。

画像を作り直す場合は `PPS_CHROMIUM` を設定して `node scripts/create-store-assets.cjs` を実行します。Node.js 22以降が必要です。外部パッケージは不要です。

## 公式資料

- [掲載情報と画像](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [画像のサイズ・形式](https://developer.chrome.com/docs/webstore/images)
- [プライバシー欄](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [ローカルのデータ処理も含むUser Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [User Scripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
- [Manifest V3でのコード実行](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
