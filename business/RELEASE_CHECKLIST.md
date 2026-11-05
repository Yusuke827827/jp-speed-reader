# RELEASE_CHECKLIST.md — App Store・Google Play 公開チェックリスト

最終更新: 2026-11-05 ／ **審査の通過は保証できない。** 下の「審査リスク」を事前に潰すことで確率を上げる。
公式ドキュメント（必ず最新を確認）:
- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- App Store Connect ヘルプ: https://developer.apple.com/help/app-store-connect/
- Google Play デベロッパー ポリシー: https://play.google.com/about/developer-content-policy/
- Play Console ヘルプ（テスト要件）: https://support.google.com/googleplay/android-developer/answer/14151465

---

## Part 1. あなた自身が行う作業（画面単位）

### 1-1. Apple Developer Program 登録
1. **なぜ**: App Store に出す・課金を受け取るために必須（年 $99）。
2. **サイト**: https://developer.apple.com/programs/enroll/
3. **手順**: Apple ID で 2 ファクタ認証を有効化 → 「Enroll」→ 個人（Individual）を選択 → 氏名・住所（英字、身分証と一致）→ 支払い。
4. **注意**: 個人登録だと App Store の販売者名に**本名**が出る。屋号で出したい場合は法人（D-U-N-S 番号が必要）。
5. **完了確認**: developer.apple.com の Account に「Membership: Apple Developer Program」と表示。

### 1-2. 有料アプリの契約・税・口座（App Store Connect）
1. **なぜ**: これが無いと課金商品が動かない。
2. **サイト**: https://appstoreconnect.apple.com →「ビジネス」（旧: 契約/税金/口座情報）
3. **入力**: 有料 App 契約に同意 → 銀行口座（日本の銀行、口座名義はローマ字）→ 税務フォーム（米国: W-8BEN。日本居住者として日米租税条約を選択）。
4. **完了確認**: 有料 App 契約のステータスが「有効」。
5. **続けて**: App Store Small Business Program に申請（手数料 15%）: https://developer.apple.com/app-store/small-business-program/

### 1-3. Google Play Console 登録
1. **なぜ**: Google Play に出すため（$25、1回）。
2. **サイト**: https://play.google.com/console/signup
3. **手順**: 個人アカウント → 本人確認（身分証）→ 支払い → 連絡先の電話確認。
4. **注意**: 個人アカウントは**新規アプリごとに「12 人以上のテスターが 14 日間クローズドテストに参加」**しないと本番公開を申請できない【二次情報で確認、公式ページで要確認】。家族・友人・SNS で 15 人程度集めておく。
5. **完了確認**: Play Console のホームでアプリを作成できる。
6. **続けて**: 「お支払いプロファイル」を作成（Google Payments 販売者アカウント、銀行口座）。

### 1-4. RevenueCat（筋トレ）
1. **なぜ**: iOS/Android の購入状態をまとめて管理し、レシート検証を代行。
2. **サイト**: https://app.revenuecat.com
3. **手順**: Project 作成 → iOS アプリ追加（Bundle ID `io.github.yusuke827827.kintore`）→ App Store Connect の「アプリ内課金キー（.p8）」をアップロード → Entitlement `premium` → Products 3つを紐付け → Offering `current` に `$rc_annual` `$rc_monthly` `$rc_lifetime`。
4. **注意**: 公開 SDK キー（`appl_`）だけをアプリに入れる（`.env.production.local`、git に入れない）。秘密キーは使わない。
5. **完了確認**: TestFlight のサンドボックス購入後、RevenueCat の Customers に購入が表示される。

### 1-5. App Store Connect でアプリと課金商品を作る
- 新規 App: 名前・言語（日本語）・Bundle ID・SKU（例 `kintore-001`）
- アプリ内課金: 自動更新サブスク（グループ「Premium」）に年額・月額、非消耗型に買い切り。各商品に表示名・説明・価格・**審査用スクリーンショット**。
- 年額に導入オファー「7日間無料」。
- **完了確認**: 商品のステータスが「提出準備完了」。

### 1-6. プライバシーポリシーの公開
- 筋トレ: `public/privacy.html`（公開済み URL）を、課金・HealthKit・RevenueCat・（導入するなら）分析の記載が最新か確認。
- Mindrawer: サーバー `/privacy` を最新化（SECURITY_AUDIT S-1）。
- **完了確認**: スマホで URL を開いて最新の日付が出る。

### 1-7. 提出
- TestFlight で自分の iPhone に入れ、購入・復元・解約後の挙動を確認 → 「審査に提出」。
- 審査メモ（例）: 「ログイン不要。プレミアムはサンドボックスで購入可能。HealthKit はワークアウトと体重の読み込みのみで、端末外に送信しない。」

---

## Part 2. アプリ別チェックリスト

### 筋トレ（iOS → Android）
- [ ] **有料機能から「クラウド同期（GitHub トークン）」を外す or iCloud 同期に置き換え**（審査 2.1 / 3.1.1・返金リスク）
- [ ] Info.plist: HealthKit の説明文 ✅、通知の許可（ローカル通知を入れたら）
- [ ] 休憩タイマー: `@capacitor/local-notifications` でロック中も知らせる（4.2 対策の「ネイティブらしさ」にもなる）
- [ ] 下タブを 5 個以下に
- [ ] 「購入を復元」ボタンがペイウォールと設定にある（3.1.1 必須）
- [ ] サブスクの説明（価格・期間・自動更新・解約方法・規約/ポリシーへのリンク）をペイウォールに表示（3.1.2）
- [ ] 利用規約（EULA）: Apple 標準 EULA か `terms.html`
- [ ] App のプライバシー: 「購入」（RevenueCat、トラッキングなし）、「健康とフィットネス」（端末内のみ＝収集に当たらない場合は申告不要）を正しく申告
- [ ] 年齢区分: 4+（医療行為の助言をしない文言）
- [ ] スクリーンショット 6.9/6.5 インチ ✅（順番を MARKETING_PLAN 1-3 に）
- [ ] Web 版の無料範囲を発売日にアプリと揃える
- [ ] Android: `npx cap add android`、RevenueCat Android キー、Play の定期購入登録、データセーフティ申告、12人×14日テスト
- [ ] 最低 SDK: iOS は Xcode 26 / iOS 26 SDK でビルド（2026-04-28 以降の要件と報道、要確認）、Android は targetSdk の最新要件

### Mindrawer（iOS）
- [ ] `server/` を `build-pages.mjs` で更新 → デプロイ → `/privacy` `/support` の URL を App Store Connect に登録
- [ ] AI のモデル構成と月の予算上限を見直し（MONETIZATION_PLAN §3）
- [ ] `/sync` `/page` に回数制限（SECURITY_AUDIT S-2, S-3）
- [ ] `App/project.yml` の `BUNDLE_PREFIX` `APP_GROUP` `SERVER_URL` を本番値に
- [ ] AI に送る前の同意（初回のみ）: 何が Anthropic に送られるか（5.1.2(i) 他者への提供の明示）
- [ ] 利用者の API キー入力機能: 審査で「外部サービスのキー入力」が問題にならないか（3.1.1 の「アプリ内課金以外の方法で機能を解放」と見なされないよう、Plus と別の“上級者向け設定”として説明）【要注意】
- [ ] サーバー上のデータ（同期・共有・公開リンク）を削除できる UI（5.1.1(v) の趣旨）
- [ ] 年額プランの追加
- [ ] App のプライバシー申告（S-7 の確認結果に従う）

### Flowa（保留）
- [ ] iOS 版の機能が Web 版に追いつくまで提出しない
- [ ] 提出時は「ユーザーが持っている PDF・テキストを読む」アプリであることを明示（著作物の配布をしない）

---

## Part 3. 審査で問題になりそうな箇所（事前リスト）

| リスク | 該当 | ガイドライン | 対策 |
|---|---|---|---|
| Web をそのまま包んだだけ | 筋トレ（Capacitor） | 4.2 最低限の機能 | HealthKit・ローカル通知・触覚・オフライン・ネイティブの共有を実装し審査メモに列挙 |
| 購入した機能が一般ユーザーに使えない | 筋トレ（GitHub 同期） | 2.1 / 3.1.1 | 有料一覧から外す |
| 復元ボタン・サブスク説明不足 | 筋トレ・Mindrawer | 3.1.1 / 3.1.2 | ペイウォールに明記 |
| 外部 API キーで AI を解放 | Mindrawer | 3.1.1 | 説明の仕方・審査メモ |
| AI 生成内容の不適切出力 | Mindrawer | 1.1 / 1.2 | 安全フィルターのフォールバック（実装済み）、通報手段 |
| 健康に関する助言 | 筋トレ（食事・体型） | 1.4.1 | 「医療アドバイスではない」表示 |
| 共有フォルダ（UGC） | Mindrawer | 1.2 ユーザー生成コンテンツ | 招待制・通報/ブロック手段を確認 |
| プライバシーポリシーの不一致 | Mindrawer | 5.1.1 | S-1 の修正 |
