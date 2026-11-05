# APP_AUDIT.md — 3アプリの技術監査・動作テスト

最終更新: 2026-11-05（Phase 1 初回監査）
対象コミット: kintore-app `bf010d2` / jp-speed-reader（Flowa）`c1410bb` / hikidashi（Mindrawer）`309bcb8`

> 表記ルール: **PASS** = 実際に操作して正常を確認 / **FAIL** = 実際に操作して不具合を確認 / **NOT TESTED** = 未検証 / **BLOCKED** = 実機・認証情報・Mac などが無く検証不能

---

## 0. アクセス状況と検証環境

| リポジトリ | 読み取り | 書き込み（このセッション） | 備考 |
|---|---|---|---|
| Yusuke827827/kintore-app | ✅ clone 済み | ❌（読み取りのみ） | 公開リポジトリ |
| Yusuke827827/jp-speed-reader | ✅ | ✅ `claude/relaxed-fermat-slhzjr` | この文書の置き場所 |
| Yusuke827827/hikidashi | ✅ clone 済み | ❌（読み取りのみ） | 公開リポジトリ |

**検証環境の制約（隠さず報告）**

- `*.github.io`（公開URL）は、このクラウド環境のネットワーク制限で**接続できなかった**（`ERR_TUNNEL_CONNECTION_FAILED`）。代わりに、各リポジトリの最新コミットを本番と同じ設定（同じ base パス）でビルドし、`http://localhost:8080/<リポジトリ名>/` で配信してテストした。GitHub Pages 上の実物と、デプロイの遅れ・失敗による差があるかは確認できていない。
- 使用ブラウザ: Playwright + Chromium。iPhone 13 / iPhone SE / iPhone 15 Pro Max / Pixel 7 / Galaxy S9+ / iPad Mini / 横向きをエミュレーション。**Safari（WebKit）や実機ではない**。
- Linux 環境のため **Swift / Xcode が無く**、Flowa の iOS 版（`ios/`）、Mindrawer の iOS アプリ本体（`HikidashiCore`・`App/`）、kintore の Capacitor iOS ビルドは**ビルドもテストもできていない（BLOCKED）**。
- テストスクリプトは `business/e2e/` に置いた（再実行手順は同フォルダの README）。

### 実行したコマンドと結果

| コマンド | 対象 | 結果 |
|---|---|---|
| `npm ci && npm run lint` | Flowa | ✅ 0 error / 11 warning（React Compiler の purity・set-state-in-effect） |
| `npm test`（Vitest） | Flowa | ✅ 25 files / 159 tests passed |
| `npm run build`（tsc + vite） | Flowa | ✅ JS 本体 1.24MB（gzip 399KB）, precache 207 files / 6.3MB |
| `npm ci && npm run lint` | kintore | ✅ 0 error / 4 warning |
| `npm run build` | kintore | ✅ JS 609KB（gzip 195KB） |
| （テストなし） | kintore | ⚠ 自動テストが**1本も無い** |
| `npm ci && npm run typecheck` | Mindrawer server | ✅ |
| `npm test` | Mindrawer server | ❌ **FAIL**: `src/pages.generated.ts is out of date`（下記 B-1） |
| `npx vitest run` | Mindrawer server | ✅ 4 files / 27 tests passed |
| `npm audit --omit=dev` | Flowa | ⚠ fflate 0.8.2 に moderate 脆弱性 → **この監査で 0.8.3 に更新済み**（再テスト 159/159 PASS） |
| `npm audit --omit=dev` | kintore / Mindrawer server | ✅ 0 件 |
| `swift test` | Flowa iOS / Mindrawer | **BLOCKED**（Swift 無し。各リポジトリの GitHub Actions（macOS）で実行される設計） |

---

## A. 筋トレ記録（kintore-app）

### A-1. 技術構成（コードで確認）

| 項目 | 内容 |
|---|---|
| 言語/FW | JavaScript（JSX）+ React 19 + Vite 8、PWA（vite-plugin-pwa） |
| ネイティブ | **Capacitor 8（iOS のみ）**。`ios/` に Xcode プロジェクト。Android プロジェクトは未作成 |
| 主要依存 | `@revenuecat/purchases-capacitor`（課金）、`@capgo/capacitor-health`（HealthKit 読込）、`qrcode` |
| 規模 | 約 13,700 行（src） |
| 画面 | オンボーディング（5問）/ ホーム / 記録中 / 計画 / 食事 / 履歴 / 設定・カスタマイズ（下タブ6個） |
| データ保存 | `localStorage`（キー `kintore-app-data-v1`、1項目ごとに即保存） |
| 同期 | **GitHub Gist + 個人アクセストークン（PAT）**、QRで端末間コピー |
| 外部API | GitHub API（同期）、AI は API を使わず「質問文をコピー→ChatGPT等に貼る→答えを貼り戻す」方式 |
| 認証 | なし（アカウント不要） |
| 課金 | `src/lib/billing.js`：Web=ベータ（全機能無料）/`?paywall=test` で模擬購入、iOS=RevenueCat。年額¥3,000（7日無料）・月額¥480・買い切り¥7,800 |
| 多言語 | 日本語 + 英語（`src/i18n/en.js`） |
| デプロイ | main push → GitHub Actions → gh-pages |
| テスト | **自動テストなし**（lint のみ） |
| ストア準備 | `docs/app-store.md`、`appstore/listing.md`（日英掲載文）、スクショ 6.9/6.5インチ各6枚、`privacy.html`・`terms.html` |

### A-2. 動作テスト結果（Chromium・iPhone 13 / Pixel 7 エミュレーション）

| ID | 機能 | 結果 | 内容・再現手順 |
|---|---|---|---|
| K-01 | 初回起動・オンボーディング | PASS | 「はじめる」→ 目的/体型/頻度・経験/性別・身長体重 →「プランを作る」→ ホームに「胸で始める」表示 |
| K-02 | オンボーディングのスキップ | PASS | 「スキップ」でホームへ |
| K-03 | 種目追加 → セット入力 | PASS | 「胸で始める」→ 種目シート → ベンチプレス → 40kg×10回 |
| K-04 | 数字キーボード | PASS | 重さ `inputmode=decimal`、回数 `numeric`、aria-label 付き |
| K-05 | ✓ で休憩タイマー自動開始 | PASS | 画面下に「休憩 1:29」と −15秒/+15秒/スキップ |
| K-06 | 即時自動保存 | PASS | ✓ 直後に localStorage に 40kg が保存されている |
| K-07 | 記録中の再読み込み → 復元 | PASS | リロード後もベンチプレス 40kg の記録中画面に戻る |
| K-08 | 終了 → 履歴に反映 | PASS | 「終了」→ マイセット登録の確認 → 履歴に表示 |
| K-09 | オフライン起動 | PASS | Service Worker 制御下で `setOffline(true)` → リロードでホーム表示 |
| K-10 | プレミアム画面（`?paywall=test`） | PASS | 設定にプレミアムの項目が出る（模擬購入は未操作） |
| K-11 | 横スクロールが出ないか | PASS | iPhone SE〜15 Pro Max、Galaxy、iPad、横向きすべて 0px |
| K-12 | コンソールエラー | PASS | 0件 |
| K-13 | 画面ロック中の休憩タイマー音 | **BLOCKED** | 実機が必要。Web Audio を事前予約する方式で、WKWebView でロック中に鳴る保証は無い（→ 改善案 A-4-2） |
| K-14 | RevenueCat 購入・復元 | **BLOCKED** | Mac・Apple Developer・RevenueCat キーが必要 |
| K-15 | HealthKit 取り込み | **BLOCKED** | 実機が必要 |
| K-16 | Gist 同期 | **BLOCKED** | GitHub トークンが必要（テスト用トークンは作らない方針） |
| K-17 | 声で入力 | NOT TESTED | Web Speech API はヘッドレスで検証不可 |
| K-18 | 食事記録・PFC分析 | NOT TESTED | 時間の都合で未操作 |
| K-19 | ブラウザバック | NOT TESTED | タブ型でルーティング無し（URL が変わらない）ため、Android の戻るボタンでアプリが閉じる可能性 → 要実機確認 |

### A-3. スマホ実用性の所見

- 良い点: 前回値の自動入力・✓一発記録・±ボタン・画面スリープ防止（Wake Lock）・即時保存。**ジムでの片手操作に最も向いた設計**。
- 課題:
  1. **下タブが6個**（ホーム/記録中/計画/食事/履歴/設定）。Apple HIG の目安（最大5）を超え、iPhone SE ではラベルが詰まる。→「記録中」は上部バナーにし、5タブへ。
  2. ホーム画面でタップ領域 40px 未満のボタンが 21個中8個（「編集」等）。→ 44pt 以上に。
  3. 画面ロック中の休憩終了通知はネイティブの **ローカル通知**（`@capacitor/local-notifications`）が必要。
  4. Android の戻るボタン対策（`@capacitor/app` の `backButton`）。

### A-4. 不具合・リスク

| # | 重大度 | 内容 | 推奨対応 |
|---|---|---|---|
| A-4-1 | **高（事業）** | プレミアム機能に「クラウド同期」が入っているが、実体は **GitHub の個人アクセストークン（No expiration 推奨）** を貼る方式。一般の購入者は使えず、返金・低評価・審査指摘（2.1 / 3.1.1）の原因になる | 有料機能一覧から外す、または iCloud（CloudKit）/ 自前同期に置き換えてから販売 |
| A-4-2 | 中 | 休憩タイマー終了がロック中に鳴らない可能性 | ネイティブ版はローカル通知に |
| A-4-3 | 中（事業） | Web版はベータとして**全機能無料**のまま公開中。アプリ発売後、Web で無料のまま使えるとアプリ課金と食い合う | 発売日に Web 版も無料範囲を揃える（データは残す） |
| A-4-4 | 中 | 自動テストが無い（記録・統計・メニュー作成のロジック約 5,000 行） | `stats.js`・`planner.js`・`backup.js` から Vitest を追加 |
| A-4-5 | 低 | README が古い（課金・食事・HealthKit 等の記載なし） | 更新 |
| A-4-6 | 低 | Android 未対応（Capacitor Android 未追加） | `npx cap add android` + Google Play Billing（RevenueCat） |

---

## B. Mindrawer（hikidashi）

### B-1. 技術構成

| 項目 | 内容 |
|---|---|
| 本体 | **ネイティブ iOS（Swift / SwiftUI）**。`HikidashiCore`（Kit + UI、約 14,100 行）、`App/`（本体・共有シート拡張・Safari 拡張・ウィジェット・Apple Watch・Mac メニューバー） |
| Web 版 | `web/index.html` 1ファイル（約 4,200 行、素の JS）+ Service Worker。GitHub Pages で公開 |
| ブラウザ拡張 | `extension/`（Chrome 等、MV3） |
| サーバー | `server/`（Cloudflare Workers + KV、TypeScript 約 800 行）：AI 中継・StoreKit 2 JWS 検証・月の利用上限・同期（暗号文のみ）・共有フォルダ・公開リンク・メール/LINE 受け取り・ページ本文取得 |
| AI | Claude API。iOS は利用者の API キー（キーチェーン）または Plus 購読（中継サーバー経由）、未設定時は Apple Intelligence（端末内）か キーワード整理 |
| 課金 | StoreKit 2 自動更新サブスク `*.plus.monthly`（¥980/月・初回1週間無料案）。サーバーで JWS の証明書チェーンを Apple Root CA G3 まで検証 |
| データ | iOS: App Group 内ファイル + 任意で iCloud。Web: IndexedDB `mindrawer`。秘密のメモは鍵で暗号化 |
| 公開状態 | `App/project.yml` の `SERVER_URL` が空 → **Plus（課金）はまだ表示されない** |
| CI | GitHub Actions（macOS）で `swift test`・シミュレーター起動・スクショ自動作成、Release ワークフローで App Store Connect に送信可能 |
| ストア準備 | `docs/app-store.md`、`docs/privacy-policy.md`、`docs/support.md`、`scripts/store_shots.py` |

### B-2. 動作テスト結果（Web 版、Chromium・iPhone 13 / Galaxy S9+）

| ID | 機能 | 結果 | 内容 |
|---|---|---|---|
| M-01 | 初回起動・案内（3枚） | PASS | スキップ可 |
| M-02 | メモを「しまう」（APIキー無し） | PASS | 3件保存。フォルダ選択カード「このままでいい」が出る |
| M-03 | 再読み込み後のデータ保持 | PASS | 3/3 件がメモタブに残る（IndexedDB） |
| M-04 | 「ひきだす」（APIキー無し） | PASS | 「これから洗濯する」→「キーワードが近いメモが1件」でバスタオルのメモ |
| M-05 | 検索 | PASS | 「呼吸」で該当メモ |
| M-06 | JSON 書き出し | PASS | `hikidashi-2026-11-05.json`（1,297 bytes、本文を含む） |
| M-07 | オフライン起動 | PASS | SW 制御下でリロード可 |
| M-08 | 横スクロール | PASS | 全端末 0px |
| M-09 | コンソールエラー | PASS | 0件 |
| M-10 | AI 整理・AI 取り出し | **BLOCKED** | Anthropic API キーが必要（キーの貼り付けは依頼しない方針） |
| M-11 | iOS アプリ本体・共有シート・ウィジェット・Watch | **BLOCKED** | Mac / 実機が必要。CI のスクショで間接確認は可能（`screenshots` ブランチ） |
| M-12 | Plus 購入 → 中継サーバー | **BLOCKED** | サーバー未デプロイ・Apple 契約が必要（ロジックは server の単体テスト 27件が PASS） |
| M-13 | 共有フォルダ・同期・メール/LINE | **BLOCKED** | サーバーが必要 |
| M-14 | 声で入力 | NOT TESTED | ヘッドレスで不可 |

### B-3. 不具合・リスク

| # | 重大度 | 内容 | 推奨対応 |
|---|---|---|---|
| B-1 | **高（審査・法務）** | `server/npm test` が FAIL。原因は `docs/privacy-policy.md`（11/4 に同期・暗号化・位置を追記）と、サーバーが `/privacy` で配信する `pages.generated.ts` のずれ。**App Store に登録する予定のプライバシーポリシー URL が古い内容（同期でサーバーに暗号文を置くこと等が未記載）のまま**。CI の Server ワークフローも次回 server/ を変更すると赤になる | `cd server && node scripts/build-pages.mjs` を実行してコミット。最終更新日も更新 |
| B-2 | **高（利益）** | 中継サーバーが許可するモデルが**最上位モデル1つだけ**（100万トークンあたり入力$4/出力$20 とコードに記載）。1回の整理 ≈ 2,000入力+500出力 ≈ $0.018（約¥2.7）。月300回で ¥800 を超え、¥980 の売上（手数料後 ¥833）をほぼ食う。上限 `MONTHLY_BUDGET_USD=3`（≈¥450）で赤字は防げるが、上限到達で「使えない」体験になる | 整理・タグ付けは軽量モデル（入力$1/出力$5 級）、取り出しの難しい質問だけ上位モデル。プロンプトキャッシュ。予算上限 $1.5〜2 |
| B-3 | 中（コスト・悪用） | `/sync/<id>` `/page?url=` が**認証なし**。誰でも 10MB を KV に書ける（1年保持）、誰でもサーバーを経由してページを取得できる（オープンプロキシ）。`/page` の内部アドレス除外は 172.16/12・0.0.0.0・リダイレクト先を見ていない | 同期は購読 JWS か端末ごとのトークン必須、IP/ID ごとの回数制限（Cloudflare Rate Limiting）、`redirect: "manual"` で再検証 |
| B-4 | 中（UX） | 機能が非常に多い（手順モード・やることボード・Kindle ハイライト・家族共有・LINE 受け取り…）。初回ユーザーが価値を掴む前に迷う。サポート負荷も大 | ストア版 v1 は「共有シートで保存 → AI 整理 → ひきだす」に絞って見せる（他は設定の奥へ） |
| B-5 | 低 | Web 版は API キーを localStorage に保存し、ブラウザから直接 Anthropic を呼ぶ（BYOK 用として許容範囲だが XSS 時に漏れる） | CSP を設定。将来は Plus の Web 対応で中継経由に |
| B-6 | 低 | iOS 専用（Swift）。Android 版は作り直しが必要 | Android は当面 Web 版（PWA）+ 共有ターゲット（Web Share Target）で代替 |
| B-7 | 低 | 案内カードのページ送りの点とボタンが近接（iPhone 13 で約1px） | 余白を追加 |

---

## C. Flowa（jp-speed-reader）

### C-1. 技術構成

| 項目 | 内容 |
|---|---|
| 言語/FW | TypeScript + React 19 + Vite 8 + PWA（vite-plugin-pwa 2） |
| 主要依存 | pdfjs-dist 6（PDF表示・抽出）、tesseract.js 7（OCR・端末内）、budoux（文節分割）、fflate（EPUB/バックアップ）、idb（IndexedDB）、pdf-lib |
| 規模 | Web 約 11,800 行、iOS 移植（Swift）約 4,500 行 |
| 画面 | 本棚 / 取り込み / OCR / 高速読書 / PDF 閲覧 / 設定 / 記録 / メモ（下タブ4個） |
| データ | IndexedDB（本・元PDF・本文・位置・記録・栞・設定）。外部送信なし |
| 外部通信 | OCR 学習データを初回のみ jsDelivr から取得 |
| 認証/同期 | なし（JSON/ZIP の書き出し・読み込みのみ） |
| 課金 | **なし**（実装ゼロ） |
| 多言語 | 日本語 + 英語（訳漏れをテストで検出） |
| テスト | Vitest 159件 + golden（iOS 移植の正解データ） |
| iOS | SwiftUI で移植中（OCR・挿絵・人物メモ未移植）。GitHub Actions でテスト |

### C-2. 動作テスト結果（Chromium・iPhone 13 / iPhone SE / Pixel 7）

| ID | 機能 | 結果 | 内容 |
|---|---|---|---|
| F-01 | 初回起動・案内 | PASS | |
| F-02 | サンプルPDF（縦書き）取り込み | PASS | 約1.8秒で読書画面へ |
| F-03 | 再生で位置が進む | PASS | 4秒で 0→8（iPhone）/ 0→9（Pixel） |
| F-04 | リロードで読書位置を復元 | PASS | 8→8 |
| F-05 | ブラウザバック | PASS | 取り込み画面へ戻る（ハッシュルーティング） |
| F-06 | 本棚に読了率・続き | PASS | |
| F-07 | オフライン起動 | PASS | |
| F-08 | オフラインで読書 | PASS | オフラインのまま読書画面を再読み込みし再生、61% まで進行（初回判定はスクリプトの誤りで FAIL と出たが、画面写真で進行を確認し訂正） |
| F-09 | 自分の .txt を取り込み | PASS | ファイル選択から読書画面へ |
| F-10 | 壊れたPDF | PASS | 「PDF が壊れているか、PDF 形式ではありません…」と表示し、取り込まない |
| F-11 | PDF 閲覧画面 | PASS | canvas 描画 |
| F-12 | 記録画面・設定画面 | PASS | 横スクロールなし |
| F-13 | 全端末の横スクロール | PASS | 0px |
| F-14 | コンソールエラー | PASS | 0件 |
| F-15 | OCR（画像PDF） | NOT TESTED | 学習データを CDN から取るため未実施（単体テストは PASS） |
| F-16 | EPUB 取り込み | NOT TESTED | 単体テスト `epub.test.ts` は PASS |
| F-17 | iOS（SwiftUI）版 | **BLOCKED** | Mac が必要 |
| F-18 | 実機 Safari での 7日データ削除・容量 | **BLOCKED** | 実機が必要 |

### C-3. 不具合・リスク

| # | 重大度 | 内容 | 対応 |
|---|---|---|---|
| C-1 | 中 | fflate 0.8.2 の脆弱性（壊れた ZIP64 で `unzipSync` が無限ループ）。EPUB・バックアップ読み込みで使用 | **この監査で 0.8.3 に更新済み**（テスト 159/159 PASS、`npm audit --omit=dev` 0件） |
| C-2 | 中（事業） | 読む本の入手経路。Kindle 等 DRM 付き電子書籍は取り込めないため、「読みたい本を読めない」 | 青空文庫・自炊PDF・論文・Web記事に用途を絞って訴求 |
| C-3 | 低 | JS 本体 1.24MB（初回ロードが重い）。lint 警告 11件 | PDF/OCR を遅延読み込み |
| C-4 | 低 | iOS 版は機能が Web 版より少ない | 公開は Web 版（PWA）を主に、iOS は機能が揃ってから |

---

## D. 3アプリ横断のまとめ

| 観点 | 筋トレ | Mindrawer | Flowa |
|---|---|---|---|
| コード品質 | 良（テスト無し） | 良（テスト多い、機能過多） | 非常に良（テスト・golden 充実） |
| 収益化の実装度 | **高**（RevenueCat・3プラン・ペイウォール） | **高**（StoreKit 2・サーバー検証・利用上限） | なし |
| ストア提出準備 | 高（掲載文・スクショ・規約） | 高（掲載文・スクショ自動・リリース CI） | 低 |
| ネイティブ機能 | HealthKit、Wake Lock | 共有シート、ウィジェット、Watch、Siri、Safari拡張 | （iOS 移植中） |
| Android | 追加容易（Capacitor） | 困難（Swift） | PWA で可 |
| 変動費 | ほぼゼロ | **AI API 費**（要設計） | ほぼゼロ |
| 最大の課題 | 競合が強い / 同期の作り | AI 原価・機能過多 | 市場が小さい・課金なし |
