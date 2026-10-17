# Flowa iOS 版

iOS 版は SwiftUI で作り、画面に依存しない処理は Swift パッケージ **FlowaCore** にまとめます。
FlowaCore は Web 版（`src/lib`）の TypeScript から移植し、`fixtures/golden` の正解データと
一致するかをテストで確かめます（文字位置は UTF-16 の単位で比べます）。

## 今あるもの

| ファイル | 内容 | 移植元 |
|---|---|---|
| `FlowaCore/Sources/FlowaCore/Chunk.swift` | 表示の単位 | `src/lib/segment.ts` の `Chunk` |
| `FlowaCore/Sources/FlowaCore/Timing.swift` | 表示時間の計算（字/分・語/分、区間ごとの速度合わせ） | `src/lib/timing.ts` |
| `FlowaCore/Sources/FlowaCore/JoinLine.swift` | 行の結合（行末のハイフン、欧文の空白） | `src/lib/layout.ts` の `joinLine` |
| `FlowaCore/Sources/FlowaCore/Segment.swift` | 文の分割と単位の分割（5モード、欧文の単語単位、人物名・ルビを切らない、最小字数、間の種類） | `src/lib/segment.ts` |
| `FlowaCore/Sources/FlowaCore/JSText.swift` | JavaScript の文字列の扱い（UTF-16 の添字、`\s`・`trim`、for...of）を再現する道具 | — |
| `FlowaCore/Sources/FlowaCore/Book.swift` | 段落の組み立て（ページをまたぐ段落、挿絵）、位置とページの対応、読了率、参考文献の範囲 | `src/lib/book.ts` |
| `FlowaCore/Sources/FlowaCore/Normalize.swift` | 文字の正規化、青空文庫の注記、ルビ記法 | `src/lib/normalize.ts` |
| `FlowaCore/Sources/FlowaCore/TextImport.swift` | テキストの取り込み（UTF-8／Shift_JIS、青空文庫の題名・目次、仮のページ） | `src/lib/textImport.ts` |
| `FlowaCore/Sources/FlowaCore/BudouX.swift` | BudouX の推論（文節相当の単位に分ける）。モデルは `Resources/`（日本語・簡体字・繁体字、Apache-2.0） | npm の `budoux` 0.9.3 |
| `FlowaCore/Tests/FlowaCoreTests/*.swift` | 正解データとの比較 | `fixtures/golden/` の buildSchedule・joinLine・budoux-ja・splitSentences・segmentBook-*・normalize・parseTextBook-aozora・buildBookText・layout-*（段落の組み立て） |

> `ios/` を変えると、GitHub Actions の Mac 環境で `swift test` が自動で実行されます（`.github/workflows/ios-core.yml`）。

## Mac での確認（初回）

1. App Store から **Xcode** を入れて一度起動し、追加のコンポーネントを入れる（無料）。
2. ターミナルで、このリポジトリの `ios/FlowaCore` に移動してテストを実行する。

   ```bash
   cd ios/FlowaCore
   swift test
   ```

   `Executed N tests, with 0 failures` と出れば成功です。

## アプリの作り方（次の段階）

1. Xcode で「File → New → Project → iOS → App」を選び、Product Name を `Flowa`、Interface を SwiftUI にして、`ios/Flowa` に保存する。
2. 「File → Add Package Dependencies… → Add Local…」で `ios/FlowaCore` を追加する。
3. 実機で試すには、Xcode の Signing で自分の Apple ID を選ぶ（無料の Apple ID でも、自分の iPhone で 7 日間動かせます）。TestFlight で人に配るときに Apple Developer Program（年 99 ドル）に加入する。

## 移植の順番（予定）

1. 表示時間・行の結合（済み）
2. BudouX の推論（済み）
3. 文の分割と単位の分割（済み）
4. 正規化・ルビ・青空文庫の取り込み（済み）
5. 段落の組み立てと位置の対応（済み）
6. PDF の行と段落の組み立て（`layout.ts`。入力は PDFKit の文字位置から作る）
7. 画面（本棚・取り込み・読書・PDF 表示・設定・履歴）、保存（SwiftData）、OCR（Vision）
