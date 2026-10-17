// swift-tools-version:5.9
// Flowa の iOS 版の中身。
//   FlowaCore: 画面に依存しない処理（Web 版 src/lib の TypeScript から移植し、fixtures/golden の正解データと比べる）
//   FlowaKit:  PDF・テキストの取り込み、本棚の保存、設定、再生の状態
//   FlowaUI:   SwiftUI の画面（アプリ本体 ios/FlowaApp から使う）
//
//   cd ios/FlowaCore && swift test

import PackageDescription

let package = Package(
    name: "FlowaCore",
    defaultLocalization: "ja",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "FlowaCore", targets: ["FlowaCore"]),
        .library(name: "FlowaKit", targets: ["FlowaKit"]),
        .library(name: "FlowaUI", targets: ["FlowaUI"]),
    ],
    targets: [
        // Resources: BudouX の学習済みモデルとライセンス
        .target(name: "FlowaCore", resources: [.process("Resources")]),
        .target(name: "FlowaKit", dependencies: ["FlowaCore"]),
        // Resources: 画面の文言の英語訳
        .target(name: "FlowaUI", dependencies: ["FlowaCore", "FlowaKit"], resources: [.process("Resources")]),
        .testTarget(name: "FlowaCoreTests", dependencies: ["FlowaCore"]),
        .testTarget(name: "FlowaKitTests", dependencies: ["FlowaCore", "FlowaKit"]),
    ]
)
