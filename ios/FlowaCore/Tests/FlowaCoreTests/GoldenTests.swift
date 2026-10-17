// fixtures/golden の正解データ（Web 版の TypeScript の結果）と一致するかを確かめる。
// 正解データを作り直すときは、リポジトリの直下で `UPDATE_GOLDEN=1 npx vitest run src/golden` を実行する。

import Foundation
import XCTest
@testable import FlowaCore

/// リポジトリの直下（このファイルは ios/FlowaCore/Tests/FlowaCoreTests/ にある）
private let repoRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent() // FlowaCoreTests
    .deletingLastPathComponent() // Tests
    .deletingLastPathComponent() // FlowaCore
    .deletingLastPathComponent() // ios
    .deletingLastPathComponent() // リポジトリの直下

private func loadGolden(_ name: String) throws -> [String: Any] {
    let url = repoRoot.appendingPathComponent("fixtures/golden/\(name).json")
    let data = try Data(contentsOf: url)
    return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
}

/// 正解データは小数点以下 4 桁に丸めてある。Float の誤差も見込んで比べる
private func assertClose(_ actual: Double, _ expected: Double, _ message: String, file: StaticString = #filePath, line: UInt = #line) {
    let tolerance = max(1e-3, abs(expected) * 1e-5)
    XCTAssertLessThanOrEqual(abs(actual - expected), tolerance, "\(message): \(actual) ≠ \(expected)", file: file, line: line)
}

final class GoldenTests: XCTestCase {
    func testJoinLine() throws {
        let golden = try loadGolden("joinLine")
        let input = try XCTUnwrap(golden["input"] as? [[String]])
        let expected = try XCTUnwrap(golden["expected"] as? [String])
        XCTAssertEqual(input.count, expected.count)
        for (pair, want) in zip(input, expected) {
            XCTAssertEqual(Lines.joinLine(pair[0], pair[1]), want, "joinLine(\(pair[0]), \(pair[1]))")
        }
    }

    func testBuildSchedule() throws {
        let golden = try loadGolden("buildSchedule")
        let input = try XCTUnwrap(golden["input"] as? [String: Any])
        let rawChunks = try XCTUnwrap(input["chunks"] as? [[String: Any]])
        let chunks: [Chunk] = try rawChunks.map { c in
            Chunk(
                pause: try XCTUnwrap(Pause(rawValue: try XCTUnwrap(c["pause"] as? String))),
                len: try XCTUnwrap(c["len"] as? Int),
                words: c["words"] as? Int,
                name: c["name"] as? Bool ?? false,
                illust: c["illust"] as? Bool ?? false
            )
        }
        let options = try XCTUnwrap(input["options"] as? [String: Any])
        let expectedAll = try XCTUnwrap(golden["expected"] as? [String: Any])

        for pauses in [true, false] {
            let opts = TimingOptions(
                cpm: try XCTUnwrap(options["cpm"] as? Double),
                wpm: options["wpm"] as? Double,
                pauses: pauses,
                pauseScale: try XCTUnwrap(options["pauseScale"] as? Double),
                nameBoost: options["nameBoost"] as? Bool ?? false
            )
            let s = Timing.buildSchedule(chunks, opts)
            let expected = try XCTUnwrap(expectedAll["pauses=\(pauses)"] as? [String: Any])
            let weights = try XCTUnwrap(expected["weights"] as? [Double])
            let unit = try XCTUnwrap(expected["unit"] as? [Double])
            XCTAssertEqual(s.weights.count, weights.count)
            for i in 0..<weights.count {
                assertClose(Double(s.weights[i]), weights[i], "pauses=\(pauses) weights[\(i)]")
                assertClose(Double(s.unit[i]), unit[i], "pauses=\(pauses) unit[\(i)]")
            }
            XCTAssertEqual(s.blocks, try XCTUnwrap(expected["blocks"] as? [[Int]]))
            XCTAssertEqual(s.limited, try XCTUnwrap(expected["limited"] as? Bool))
            XCTAssertEqual(s.totalChars, try XCTUnwrap(expected["totalChars"] as? Int))
        }
    }

    /// 間を入れても、区間ごとの実速度が設定速度と一致する（Web 版の segment.test.ts と同じ性質）
    func testBlocksKeepTargetSpeed() {
        var chunks: [Chunk] = []
        for i in 0..<200 {
            let pause: Pause = i % 20 == 19 ? .paragraph : (i % 5 == 4 ? .sentence : (i % 3 == 0 ? .comma : .none))
            chunks.append(Chunk(pause: pause, len: 2 + i % 9))
        }
        let s = Timing.buildSchedule(chunks, TimingOptions(cpm: 600, pauses: true, pauseScale: 1.5))
        for b in s.blocks {
            let cpm = s.effectiveCpm(chunks, from: b[0], to: b[1])
            XCTAssertLessThan(abs(cpm - 600) / 600, 0.01, "block \(b): \(cpm)")
        }
    }
}
