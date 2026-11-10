# Release Notes v1.1.0

## Japanese

- 設定画面の「アクセス設定」に、任意の全HTTP/HTTPSサイト一括許可を追加。初期状態はオフです。
- 一括許可を使わない場合やChromeの確認をキャンセルした場合も、従来のサイトごとの許可で利用できます。
- 一括許可後も、CSSとJavaScriptは各設定の対象URL・除外URL・フレーム条件に従って適用します。許可操作だけでJavaScriptを再実行しません。
- 一括許可を解除すると、Chromeの仕様により個別サイトの許可も解除されます。各設定の「権限を許可」から個別許可に戻せます。
- Chrome側での権限変更を開いている設定画面に反映し、編集中の内容を保持します。権限はExport/Importに含めません。
- 必須権限、既存の保存キー・設定ID・v3バックアップ形式は従来どおりです。

## English

- Added an optional all-HTTP/HTTPS-site access control in settings. It is off by default and requests permission through Chrome only when selected.
- Individual-site permission requests remain available without opting in, after cancelling, and after revoking broad access.
- CSS and JavaScript still follow each rule's URL patterns, exclusions and frame choice. Granting access does not rerun JavaScript in existing documents.
- Revoking broad access also removes earlier individual grants in Chrome. Use each rule's permission button to grant individual access again.
- Open settings reflect Chrome-side permission changes without replacing unsaved edits. Host grants are managed by Chrome and excluded from backups.
- Required permissions, existing storage keys, rule IDs and the v3 backup format are unchanged.
