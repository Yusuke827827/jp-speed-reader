// 文の分割と単位の分割を、fixtures/golden の正解データ（Web 版の結果）と比べる。

import Foundation
import XCTest
@testable import FlowaCore

private let repoRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent()

private func loadFixture(_ name: String) throws -> [String: Any] {
    let data = try Data(contentsOf: repoRoot.appendingPathComponent("fixtures/golden/\(name).json"))
    return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
}

final class SegmentGoldenTests: XCTestCase {
    func testSplitSentences() throws {
        let golden = try loadFixture("splitSentences")
        let input = try XCTUnwrap(golden["input"] as? [String])
        let expected = try XCTUnwrap(golden["expected"] as? [[[Int]]])
        for (text, want) in zip(input, expected) {
            XCTAssertEqual(Segmenter.splitSentences(text), want, text)
        }
    }

    func testSegmentBookJapanese() throws { try checkSegmentBook("segmentBook-ja") }
    func testSegmentBookEnglish() throws { try checkSegmentBook("segmentBook-en") }
    func testSegmentBookMixed() throws { try checkSegmentBook("segmentBook-mixed") }

    private func checkSegmentBook(_ name: String) throws {
        let golden = try loadFixture(name)
        let input = try XCTUnwrap(golden["input"] as? [String: Any])
        let rawBook = try XCTUnwrap(input["book"] as? [[String: Any]])
        let paragraphs: [Paragraph] = try rawBook.map { p in
            let ruby = try XCTUnwrap(p["ruby"] as? [[String: Any]]).map { r in
                Ruby(start: r["start"] as? Int ?? 0, end: r["end"] as? Int ?? 0, text: r["text"] as? String ?? "")
            }
            return Paragraph(text: try XCTUnwrap(p["text"] as? String), ruby: ruby)
        }
        let names = try XCTUnwrap(input["names"] as? [String])
        let phraseTarget = try XCTUnwrap(input["phraseTarget"] as? Int)
        let expectedAll = try XCTUnwrap(golden["expected"] as? [String: Any])

        for mode in ChunkMode.allCases {
            for minChars in [1, 3] {
                let key = "\(mode.rawValue)/min\(minChars)"
                let expected = try XCTUnwrap(expectedAll[key] as? [[String: Any]], key)
                let chunks = Segmenter.segmentBook(paragraphs, SegmentOptions(mode: mode, phraseTarget: phraseTarget, minChars: minChars, names: names))
                XCTAssertEqual(chunks.count, expected.count, "\(name) \(key): 単位の数")
                for (i, (c, e)) in zip(chunks, expected).enumerated() {
                    let label = "\(name) \(key) [\(i)]"
                    XCTAssertEqual(c.text, e["text"] as? String, label)
                    XCTAssertEqual(c.para, e["para"] as? Int, label)
                    XCTAssertEqual(c.start, e["start"] as? Int, label)
                    XCTAssertEqual(c.end, e["end"] as? Int, label)
                    XCTAssertEqual(c.pause.rawValue, e["pause"] as? String, label)
                    XCTAssertEqual(c.len, e["len"] as? Int, label)
                    XCTAssertEqual(c.words, e["words"] as? Int, label)
                    XCTAssertEqual(c.name, e["name"] as? Bool ?? false, label)
                }
            }
        }
    }
}
