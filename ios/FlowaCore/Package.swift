// swift-tools-version:5.9
// Flowa の iOS 版で使う、画面に依存しない処理（表示時間・行の結合など）。
// Web 版（src/lib）の TypeScript から移植し、fixtures/golden の正解データと一致するかをテストで確かめる。
//
//   cd ios/FlowaCore && swift test

import PackageDescription

let package = Package(
    name: "FlowaCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "FlowaCore", targets: ["FlowaCore"]),
    ],
    targets: [
        // Resources: BudouX の学習済みモデルとライセンス
        .target(name: "FlowaCore", resources: [.process("Resources")]),
        .testTarget(name: "FlowaCoreTests", dependencies: ["FlowaCore"]),
    ]
)
