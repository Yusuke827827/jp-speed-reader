// BudouX の推論（文を文節相当の単位に分ける）。npm の budoux 0.9.3 の Parser.parseBoundaries の移植。
// 学習済みモデルは Resources/budoux-*.json（BudouX から変更なしで取り出したもの。Apache License 2.0、BUDOUX-LICENSE.txt）。
//
// Web 版と同じく、位置は UTF-16 の単位で数える。JavaScript の substring と同じく、
// 範囲は 0〜長さに丸め、始まりが終わりより後なら入れ替える。
// 絵文字などの途中（サロゲートペアの片方）を含む部分文字列や空文字列はモデルの語に一致しないので、0 点として扱う
// （モデルにそのような語が無いことは確かめてある）。

import Foundation

public struct BudouXParser: Sendable {
    /// 特徴の種類（UW1〜UW6、BW1〜BW3、TW1〜TW4）ごとの、語 → 点数
    let model: [String: [String: Int]]
    let baseScore: Double

    public init(model: [String: [String: Int]]) {
        self.model = model
        baseScore = -0.5 * Double(model.values.flatMap { $0.values }.reduce(0, +))
    }

    /// 同梱のモデルを読む。name は "ja"・"zh-hans"・"zh-hant"
    public static func load(_ name: String) throws -> BudouXParser {
        guard let url = Bundle.module.url(forResource: "budoux-\(name)", withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        let model = try JSONDecoder().decode([String: [String: Int]].self, from: Data(contentsOf: url))
        return BudouXParser(model: model)
    }

    /// 日本語のモデル（初回に読み込む）
    public static let japanese: BudouXParser = {
        do { return try load("ja") } catch { fatalError("BudouX の日本語モデルを読み込めません: \(error)") }
    }()

    /// 区切る位置（UTF-16 の位置）の一覧
    public func parseBoundaries(_ sentence: String) -> [Int] {
        parseBoundaries(units: Array(sentence.utf16))
    }

    /// 区切る位置の一覧（UTF-16 の並びを直接受け取る。絵文字の途中を含む文字列でも位置がずれない）
    public func parseBoundaries(units: [UInt16]) -> [Int] {
        let n = units.count
        guard n > 1 else { return [] }

        /// JavaScript の sentence.substring(a, b) と同じ範囲の文字列。モデルの語になりえないものは nil
        func sub(_ a: Int, _ b: Int) -> String? {
            var s = min(max(a, 0), n)
            var e = min(max(b, 0), n)
            if s > e { swap(&s, &e) }
            if s == e { return nil }
            let slice = units[s..<e]
            // 片方だけのサロゲートを含む部分はモデルの語に一致しない
            if UTF16.isTrailSurrogate(slice.first!) || UTF16.isLeadSurrogate(slice.last!) { return nil }
            return String(decoding: slice, as: UTF16.self)
        }

        let features: [(String, Int, Int)] = [
            ("UW1", -3, -2), ("UW2", -2, -1), ("UW3", -1, 0), ("UW4", 0, 1), ("UW5", 1, 2), ("UW6", 2, 3),
            ("BW1", -2, 0), ("BW2", -1, 1), ("BW3", 0, 2),
            ("TW1", -3, 0), ("TW2", -2, 1), ("TW3", -1, 2), ("TW4", 0, 3),
        ]
        let groups = features.map { (model[$0.0], $0.1, $0.2) }

        var result: [Int] = []
        for i in 1..<n {
            var score = baseScore
            for (group, from, to) in groups {
                guard let group, let key = sub(i + from, i + to) else { continue }
                score += Double(group[key] ?? 0)
            }
            if score > 0 { result.append(i) }
        }
        return result
    }

    /// 区切った文字列の一覧。区切りが絵文字などの途中に来た場合、その部分は置換文字になる
    /// （位置が必要な処理では parseBoundaries を使う）
    public func parse(_ sentence: String) -> [String] {
        if sentence.isEmpty { return [] }
        let units = Array(sentence.utf16)
        var out: [String] = []
        var start = 0
        for b in parseBoundaries(sentence) + [units.count] {
            out.append(String(decoding: units[start..<b], as: UTF16.self))
            start = b
        }
        return out
    }
}
