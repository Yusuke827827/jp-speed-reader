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
| `FlowaCore/Tests/FlowaCoreTests/GoldenTests.swift` | 正解データとの比較 | `fixtures/golden/buildSchedule.json`・`joinLine.json` |

> これらのコードは、Swift を動かせない環境で書いたもので、まだ一度もビルドしていません。
> Mac で初めて `swift test` を実行したときにエラーが出たら、その内容をそのまま伝えてください。

## Mac での確認（初回）

1. App Store から **Xcode** を入れて一度起動し、追加のコンポーネントを入れる（無料）。
2. ターミナルで、このリポジトリの `ios/FlowaCore` に移動してテストを実行する。

   ```bash
   cd ios/FlowaCore
   swift test
   ```

   `Executed 3 tests, with 0 failures` のように出れば成功です。

## アプリの作り方（次の段階）

1. Xcode で「File → New → Project → iOS → App」を選び、Product Name を `Flowa`、Interface を SwiftUI にして、`ios/Flowa` に保存する。
2. 「File → Add Package Dependencies… → Add Local…」で `ios/FlowaCore` を追加する。
3. 実機で試すには、Xcode の Signing で自分の Apple ID を選ぶ（無料の Apple ID でも、自分の iPhone で 7 日間動かせます）。TestFlight で人に配るときに Apple Developer Program（年 99 ドル）に加入する。

## 移植の順番（予定）

1. 表示時間・行の結合（済み、Mac で未確認）
2. 文の分割と単位の分割（`segment.ts`。BudouX のモデル JSON を読む推論部分も Swift で書く）
3. 正規化・ルビ・青空文庫の取り込み（`normalize.ts`・`textImport.ts`）
4. 本文の位置とページの対応（`book.ts`）
5. PDF の行と段落の組み立て（`layout.ts`。入力は PDFKit の文字位置から作る）
6. 画面（本棚・取り込み・読書・PDF 表示・設定・履歴）、保存（SwiftData）、OCR（Vision）
