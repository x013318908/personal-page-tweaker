# Personal Page Tweaker

Chrome/Chromium向けの自分用ページスタイル拡張です。Stylus互換ではなく、サイト別にCSSを保存して、許可済みサイトだけに適用します。

## 使い方

1. Chromeで `chrome://extensions/` を開く。
2. 「デベロッパー モード」を有効にする。
3. 「パッケージ化されていない拡張機能を読み込む」で、この `personal-page-styler` フォルダを選ぶ。
4. 対象サイトを開き、拡張のポップアップから「このサイト用に作成」を押す。
5. CSSを書いて保存し、サイト権限を許可する。

## MVPの仕様

- Manifest V3。
- 設定保存は `chrome.storage.local`。
- サイト権限は `optional_host_permissions` でサイト別に許可。
- 保存済みCSSは動的content scriptで対象ページに注入。
- Export/Importは独自JSON形式。
- Import時はプレビュー後に全設定を置換。

## 対象外

- Stylus形式の互換import。
- CSSプリプロセッサ。
- クラウド同期。
- 複雑なURL条件やフォルダ管理。
- `chrome://` やChrome Web Storeなど、拡張が触れないページ。
