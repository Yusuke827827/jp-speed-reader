# CLAUDE.md — プロジェクトの基本方針・開発ルール・テストルール

## このリポジトリ
- **Flowa**（日本語の高速読書 Web アプリ + iOS 移植中）。詳細は README.md、iOS は ios/README.md。
- `business/` に、3アプリ（筋トレ記録 / Flowa / Mindrawer）の事業化ドキュメントを置いている（business/README.md）。

## 事業の基本方針
1. 目的は「公開」ではなく**利益**（売上 − ストア手数料 − AI/サーバー費 − 広告費）を継続的に出すこと。
2. 投資の優先順位（2026-11 時点の案、オーナー承認待ち）: **筋トレ記録 > Mindrawer > Flowa（保留・最小限の保守）**。3アプリを同時に大きく開発しない。
3. 無料ユーザーに原価（AI API 等）がかかる設計にしない。
4. 実装されていない機能を宣伝・ストア掲載しない。
5. 市場規模・単価・転換率などの数字は【事実（出典）】【推定】【仮説】を区別して書く。
6. 費用・外部への影響がある操作（有料契約、広告出稿、課金開始、本番公開、データ削除、ストア提出）は**事前にオーナーの承認**を得る。

## 開発ルール
- Node.js 20.19+ / 22.12+。`npm ci` → `npm run lint` → `npm test` → `npm run build` がすべて通ってからコミットする。
- 画面の文言は `t('日本語')` で書き、英語訳を `src/i18n/en/` に足す（`src/lib/i18n.test.ts` が訳漏れを検出）。
- 処理（`src/lib`）を変えたら、iOS 移植の正解データ `fixtures/golden` との差を確認する（意図した変更なら `UPDATE_GOLDEN=1 npx vitest run src/golden`）。
- 本・PDF・本文は端末の外に送らない（外部通信は OCR 学習データの取得のみ）。
- 秘密情報（API キー、広告ユニット ID、ストアの鍵）をリポジトリ・コミット・チャットに書かない。`.env.*.local` か CI の Secrets を使う。
- 依存を追加・更新したら `npm audit --omit=dev` を確認する。

## テストルール
- **実際に動かして確認したものだけを PASS と書く。** コードを読んだだけのものは NOT TESTED、実機・認証情報・Mac が無いものは BLOCKED。
- 単体テスト: `npm test`（Vitest）。
- 画面の操作テスト: `business/e2e/`（Playwright、iPhone/Android の画面サイズ）。手順は business/e2e/README.md。
- スマホでの確認項目: 初回起動、取り込み、再生、位置の復元（再読み込み）、ブラウザバック、オフライン起動、横スクロールが出ないこと、コンソールエラー 0。
- iOS（Swift）は GitHub Actions の macOS で `swift test`（ios-core.yml）。Linux では実行できない。
- テストに失敗したら、出力をそのまま報告する（失敗を隠さない・テストを消して通さない）。
