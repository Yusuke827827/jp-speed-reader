# Flowa iOS 版

iOS 版は SwiftUI で作ります。中身は Swift パッケージ `ios/FlowaCore` の 3 つのモジュールに分け、
アプリ本体 `ios/FlowaApp` はそれを読み込むだけにしています。

| モジュール | 役割 |
|---|---|
| **FlowaCore** | 画面に依存しない処理。Web 版（`src/lib`）の TypeScript から移植し、`fixtures/golden` の正解データと一致するかをテストで確かめる（文字位置は UTF-16 の単位で比べる） |
| **FlowaKit** | PDF（PDFKit）・テキストの取り込み、本棚の保存、読み方の設定、再生の状態 |
| **FlowaUI** | SwiftUI の画面（本棚・読書・設定）。文言は日本語をキーにし、英語訳は `Resources/en.lproj` |

## 今あるもの

| ファイル | 内容 | 移植元 |
|---|---|---|
| `FlowaCore/Sources/FlowaCore/Chunk.swift` | 表示の単位 | `src/lib/segment.ts` の `Chunk` |
| `FlowaCore/Sources/FlowaCore/Timing.swift` | 表示時間の計算（字/分・語/分、区間ごとの速度合わせ） | `src/lib/timing.ts` |
| `FlowaCore/Sources/FlowaCore/JoinLine.swift` | 行の結合（行末のハイフン、欧文の空白） | `src/lib/layout.ts` の `joinLine` |
| `FlowaCore/Sources/FlowaCore/Segment.swift` | 文の分割と単位の分割（5モード、欧文の単語単位、人物名・ルビを切らない、最小字数、間の種類） | `src/lib/segment.ts` |
| `FlowaCore/Sources/FlowaCore/JSText.swift` | JavaScript の文字列の扱い（UTF-16 の添字、`\s`・`trim`、for...of）を再現する道具 | — |
| `FlowaCore/Sources/FlowaCore/Layout.swift` | PDF の文字片から行・ページ本文を組み立てる（縦書きの判定、ルビ、二段組、柱・ノンブル、見出し、ページをまたぐ段落） | `src/lib/layout.ts` |
| `FlowaCore/Sources/FlowaCore/Book.swift` | 段落の組み立て（ページをまたぐ段落、挿絵）、位置とページの対応、読了率、参考文献の範囲 | `src/lib/book.ts` |
| `FlowaCore/Sources/FlowaCore/Normalize.swift` | 文字の正規化、青空文庫の注記、ルビ記法 | `src/lib/normalize.ts` |
| `FlowaCore/Sources/FlowaCore/TextImport.swift` | テキストの取り込み（UTF-8／Shift_JIS、青空文庫の題名・目次、仮のページ） | `src/lib/textImport.ts` |
| `FlowaCore/Sources/FlowaCore/BudouX.swift` | BudouX の推論（文節相当の単位に分ける）。モデルは `Resources/`（日本語・簡体字・繁体字、Apache-2.0） | npm の `budoux` 0.9.3 |
| `FlowaCore/Sources/FlowaKit/PDFImport.swift` | PDFKit の文字と位置（PDFSelection）から断片を作り、Layout でページ本文にする | `src/lib/pdfItems.ts` |
| `FlowaCore/Sources/FlowaKit/BookImporter.swift` | PDF・テキストの取り込み | `src/lib/importer.ts`（OCR・挿絵・文字化けの修復を除く） |
| `FlowaCore/Sources/FlowaKit/BookStore.swift` | 本棚の保存（1 冊ごとのフォルダに情報・ページ本文・元のファイル）、読んでいた位置 | `src/lib/db.ts` |
| `FlowaCore/Sources/FlowaKit/ReaderSettings.swift` | 読み方の設定（端末に保存） | `src/lib/settings.ts` |
| `FlowaCore/Sources/FlowaKit/ReadingHistory.swift` | 読書の記録と集計（合計・直近 14 日） | `src/lib/db.ts` の Session、`src/ui/History.tsx` |
| `FlowaCore/Sources/FlowaKit/ReaderModel.swift` | 再生（予定時刻から逆算して待つ）、前後の移動、速度、位置の保存 | `src/ui/Reader.tsx` の画面以外の部分 |
| `FlowaCore/Sources/FlowaKit/ProLimits.swift`・`ProStore.swift` | Flowa Pro（買い切り）。無料版の上限（PDF 3 冊・Pro だけの配色）と、StoreKit 2 での購入・復元・購入済みかの確認 | — |
| `FlowaCore/Sources/FlowaUI/*.swift` | 本棚・読書・設定の画面 | `src/ui/Library.tsx`・`Reader.tsx`・`SettingsScreen.tsx` |
| `FlowaApp/project.yml`・`FlowaApp/Sources/FlowaApp.swift` | アプリ本体（XcodeGen でプロジェクトを作る） | — |
| `FlowaCore/Tests/FlowaKitTests/*.swift` | サンプル PDF を PDFKit で読み、Web 版と同じページ本文になるか。取り込み・保存・再生の確認 | `public/samples/`・`fixtures/golden/` |
| `FlowaCore/Tests/FlowaCoreTests/*.swift` | 正解データとの比較 | `fixtures/golden/` の buildSchedule・joinLine・budoux-ja・splitSentences・segmentBook-*・normalize・parseTextBook-aozora・buildBookText・layout-*（行・ページ本文と段落の組み立て） |

> `ios/` を変えると、GitHub Actions の Mac 環境で `swift test` と、アプリの iOS シミュレーター向けビルドが自動で実行されます（`.github/workflows/ios-core.yml`）。

## Mac での確認（初回）

1. App Store から **Xcode** を入れて一度起動し、追加のコンポーネントを入れる（無料）。
2. ターミナルで、このリポジトリの `ios/FlowaCore` に移動してテストを実行する。

   ```bash
   cd ios/FlowaCore
   swift test
   ```

   `Executed N tests, with 0 failures` と出れば成功です。

## アプリを動かす

1. ターミナルで XcodeGen を入れ、プロジェクトを作って開く（Homebrew が必要です）。

   ```bash
   brew install xcodegen
   cd ios/FlowaApp
   xcodegen generate
   open Flowa.xcodeproj
   ```

2. 上の欄で「Flowa」と、シミュレーター（例: iPhone 16）を選んで ▶ を押す。
3. 自分の iPhone で動かすときは、「Flowa」ターゲットの「Signing & Capabilities」で Team に自分の Apple ID を選ぶ（無料の Apple ID でも、自分の iPhone で 7 日間動かせます）。
   ID が使えないと言われたら、`project.yml` の `PRODUCT_BUNDLE_IDENTIFIER`（仮の `app.flowa.reader`）を自分用に変えて、もう一度 `xcodegen generate` する。
4. TestFlight で人に配るときに Apple Developer Program（年 99 ドル）に加入する。

`project.yml` を変えたら `xcodegen generate` をやり直してください（`Flowa.xcodeproj` はリポジトリに入れていません）。

## Flowa Pro（アプリ内課金）

無料版と Pro の分け方は [`docs/monetization.md`](../docs/monetization.md) のとおりです。今の iOS 版で Pro だけにしているのは次の 3 つです。

- 本棚に置ける PDF は無料版で 3 冊まで（同梱のサンプルとテキストは数えない）。4 冊目を取り込もうとすると Pro の案内を出し、購入したらそのまま取り込む
- 和紙・羊皮紙・夜空・オーロラの配色
- 読書履歴のすべての記録。無料版は今日を含む直近 7 日の記録だけを出す（それより前の記録も消さずに残し、Pro にすると見られる）

文字認識（OCR）・人物の色分けは、iOS 版に加えるときに無料版の上限（OCR は 1 冊 10 ページ）を付けます。

- 商品 ID は `app.flowa.reader.pro`（非消耗型）。App Store Connect の「App 内課金」に同じ ID で登録する
- Xcode から実行すると、App Store の代わりに `FlowaApp/Flowa.storekit` の商品で購入・復元・返金を試せる（「Debug → StoreKit → Manage Transactions」）
- 購入済みかは起動のたびに App Store の記録（`Transaction.currentEntitlements`）で確かめ、通信できないときのために前回の結果も端末に残す
- 画面写真の撮影（`-FlowaDemo`）では Pro として動かす。`-FlowaDemoPaywall` を付けると購入前の状態で Pro の案内を開く

## iOS 版でまだできないこと

- 画像だけのページの文字認識（OCR）。Web 版は Tesseract.js、iOS 版は Vision で作る予定
- 挿絵の表示（今は高速読書で飛ばす）
- 人物メモ、模様のある背景（和紙・夜空などは単色）
- パスワード付き PDF、文字化けする PDF の修復（ActualText）

## 移植の順番（予定）

1. 表示時間・行の結合（済み）
2. BudouX の推論（済み）
3. 文の分割と単位の分割（済み）
4. 正規化・ルビ・青空文庫の取り込み（済み）
5. 段落の組み立てと位置の対応（済み）
6. PDF の行と段落の組み立て（済み。アプリでは PDFKit の文字位置から `RawItem` を作って渡す）
7. 画面の第一段階: 本棚・取り込み・高速読書・設定（済み）
8. サンプル・他のアプリから開く・目次・PDF 表示・縦書き表示・テーマ（済み）
9. 読書履歴・全文の表示（済み）
10. 挿絵、OCR（Vision）、人物メモ
