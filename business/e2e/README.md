# E2E テスト（3アプリの実際の操作）

Playwright（Chromium）で、スマホ画面をまねて実際に操作するスクリプト。結果は `[PASS]` / `[FAIL]` / `[NOT TESTED]` で出る。

## 準備（3アプリを本番と同じパスで配信する）

```bash
mkdir -p /tmp/serve
# Flowa（このリポジトリ）
BASE=/jp-speed-reader/ npx vite build --outDir /tmp/serve/jp-speed-reader --emptyOutDir
# 筋トレ（kintore-app を clone して）
(cd ../kintore-app && npm ci && npm run build && cp -r dist /tmp/serve/kintore-app)
# Mindrawer（hikidashi を clone して。web/ は静的ファイル）
cp -r ../hikidashi/web /tmp/serve/hikidashi
(cd /tmp/serve && python3 -m http.server 8080)
```

公開中のサイトに対して実行する場合は `E2E_ORIGIN=https://yusuke827827.github.io` を付ける。

## 実行

```bash
cd business/e2e
node flowa.cjs "iPhone 13"      # 取り込み・再生・位置の復元・戻る・オフライン・txt・壊れたPDF
node flowa.cjs "Pixel 7"
node flowa-offline.cjs          # オフラインで読書・PDF 表示
node kintore.cjs "iPhone 13"    # 種目追加・セット入力・休憩タイマー・自動保存・履歴・オフライン
node mindrawer.cjs "iPhone 13"  # しまう・再読み込み・ひきだす・検索・書き出し
node viewports.cjs              # iPhone SE〜iPad・横向きの横スクロールとタップ領域
```

画面写真（`*.png`）はカレントディレクトリに保存される（git には入れない）。
