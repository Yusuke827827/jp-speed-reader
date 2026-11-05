# SECURITY_AUDIT.md — セキュリティ・プライバシー監査

最終更新: 2026-11-05 ／ 方法: ソースコードの目視確認、`npm audit`、危険なパターンの grep（`innerHTML`・`eval`・秘密情報・認証ヘッダー）、サーバーのロジック確認。**侵入テスト・実機での通信傍受は行っていない。**

## 重大度の基準
- **高**: 公開前に必ず直す（審査落ち・個人情報・お金の損失に直結）
- **中**: 公開後早めに直す（悪用されると費用やトラブル）
- **低**: 改善推奨

## 一覧

| ID | アプリ | 重大度 | 内容 | 推奨対応 | 状態 |
|---|---|---|---|---|---|
| S-1 | Mindrawer server | 高 | `/privacy` が配信するプライバシーポリシーが古い（同期・暗号化・位置の記述が無い）。`npm test` も FAIL | `node scripts/build-pages.mjs` を実行しコミット | 未対応（このセッションは書込権限なし） |
| S-2 | Mindrawer server | 中 | `/sync/<id>` に認証も回数制限もなく、誰でも 10MB×任意件数を KV に 1年保存できる → 保存料金・書き込み料金の悪用 | 書き込みに購読 JWS か端末トークン必須、ID/IP ごとの回数制限、保存総量の監視 | 未対応 |
| S-3 | Mindrawer server | 中 | `/page?url=` が誰でも使えるオープンプロキシ。内部アドレス除外が不十分（172.16/12、0.0.0.0、10進表記、**リダイレクト後の宛先**を再確認していない） | Origin 制限・回数制限・`redirect:"manual"` で各ホップを再検証 | 未対応 |
| S-4 | Mindrawer server | 中 | AI 中継の利用上限は KV の読み→書きで数えるため、同時に大量に送ると上限を少し超えうる（作者もコメントで認識） | Durable Objects でのカウント、または上限に余裕を持たせる | 許容（上限を低めに） |
| S-5 | Mindrawer server | 良 | StoreKit 2 の JWS を x5c チェーン・Apple Root CA G3 指紋・Apple 固有 OID・署名・bundleId・productId・期限・取り消しまで検証している。本文はモデル・max_tokens・サイズを制限 | — | 良好 |
| S-6 | Mindrawer Web | 低 | 利用者の Anthropic API キーを localStorage に保存しブラウザから直接送信 | CSP（`script-src 'self'`）を設定、キーは「自分用」と明示 | 未対応 |
| S-7 | Mindrawer | 中（規約） | App のプライバシー表示を「データの収集なし」とする予定。同期をオンにすると暗号化済みメモがサーバーに 1 年保存される。Apple の定義上の扱い（開発者が復号できない保存が「収集」に当たるか）は**要確認** | App Store Connect のヘルプで定義を確認し、迷う場合は「ユーザーコンテンツ（アプリの機能・トラッキングなし・ユーザーに紐付く）」として申告する方が安全 | 要確認 |
| S-8 | 筋トレ | 中 | GitHub の PAT（gist 権限、有効期限なし推奨）を localStorage に保存。XSS があれば流出。期限なしトークンを推奨する案内自体が危険 | 同期方式を変更（iCloud/自前）。当面は「有効期限 90 日」を推奨に変更 | 未対応 |
| S-9 | 筋トレ | 低 | `printHtml` で `innerHTML` を使用。呼び出し側は `esc()` でエスケープ済みで、現時点で XSS は確認されず | 新しい呼び出しでも必ず `esc()` を通す | 問題なし |
| S-10 | 筋トレ | 低 | RevenueCat の公開キーは `.env.production.local`（git 管理外）から注入。公開キーなので漏れても致命的ではない | 現状維持 | 良好 |
| S-11 | Flowa | 中 | fflate 0.8.2 の DoS 脆弱性（GHSA-px8p-9vwx-vf98） | 0.8.3 に更新 | **対応済み** |
| S-12 | Flowa | 良 | 本・PDF は端末内のみ。外部通信は OCR 学習データの取得だけ | — | 良好 |
| S-13 | 3アプリ共通 | 低 | 開発用依存（vite 等）に low〜high の audit 警告（本番バンドルには含まれない） | 定期的に `npm update` | 監視 |
| S-14 | 3アプリ共通 | 中（規約） | アカウント削除要件（Apple 5.1.1(v)）: 3アプリともアカウント登録が無いので対象外。ただし Mindrawer の同期・共有フォルダ・公開リンクの**サーバー側データを利用者が消す手段**が必要 | アプリ内に「サーバーのデータを削除」ボタン | 要確認 |

## 秘密情報の扱いルール（全リポジトリ共通）

1. 本番の API キー・広告ユニット ID・RevenueCat の秘密キー・App Store Connect の鍵は**リポジトリに書かない**。
   - Web/Capacitor: `.env.*.local`（git 管理外）
   - Cloudflare: `wrangler secret put ANTHROPIC_API_KEY`
   - GitHub Actions: リポジトリの Secrets
2. AdMob のアプリ ID（`ca-app-pub-…~…`）は Info.plist に入る公開値だが、広告ユニット ID は `.env` 経由にする。
3. チャットや Issue にキー・パスワードを貼らない。
