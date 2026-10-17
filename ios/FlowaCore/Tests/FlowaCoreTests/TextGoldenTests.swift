// 正規化・ルビ・青空文庫の取り込みを、fixtures/golden の正解データ（Web 版の結果）と比べる。

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

private func rubyList(_ value: Any?) throws -> [Ruby] {
    try XCTUnwrap(value as? [[String: Any]]).map { r in
        Ruby(start: try XCTUnwrap(r["start"] as? Int), end: try XCTUnwrap(r["end"] as? Int), text: try XCTUnwrap(r["text"] as? String))
    }
}

final class TextGoldenTests: XCTestCase {
    func testNormalize() throws {
        let golden = try loadFixture("normalize")
        let input = try XCTUnwrap(golden["input"] as? [String])
        let expected = try XCTUnwrap(golden["expected"] as? [[String: Any]])
        XCTAssertEqual(input.count, expected.count)
        for (s, e) in zip(input, expected) {
            XCTAssertEqual(Normalize.normalizeChars(s), e["normalizeChars"] as? String, "normalizeChars(\(s))")
            XCTAssertEqual(Normalize.stripNotes(s), e["stripNotes"] as? String, "stripNotes(\(s))")
            let want = try XCTUnwrap(e["parseRuby"] as? [String: Any])
            let got = Normalize.parseRuby(s)
            XCTAssertEqual(got.text, want["text"] as? String, "parseRuby(\(s)).text")
            XCTAssertEqual(got.ruby, try rubyList(want["ruby"]), "parseRuby(\(s)).ruby")
        }
    }

    func testParseTextBookAozora() throws {
        let golden = try loadFixture("parseTextBook-aozora")
        let expected = try XCTUnwrap(golden["expected"] as? [String: Any])
        let data = try Data(contentsOf: repoRoot.appendingPathComponent("public/samples/sample-aozora.txt"))
        let raw = try XCTUnwrap(TextImport.decodeText(data), "Shift_JIS として読めること")
        let parsed = TextImport.parseTextBook(raw)
        XCTAssertEqual(parsed.title, expected["title"] as? String)
        XCTAssertEqual(parsed.author, expected["author"] as? String)
        let pages = try XCTUnwrap(expected["pages"] as? [String])
        XCTAssertEqual(parsed.pages.count, pages.count)
        for (i, (got, want)) in zip(parsed.pages, pages).enumerated() { XCTAssertEqual(got, want, "pages[\(i)]") }
        let toc = try XCTUnwrap(expected["toc"] as? [[String: Any]]).map { t in
            TocEntry(title: t["title"] as? String ?? "", page: t["page"] as? Int ?? -1, depth: t["depth"] as? Int ?? -1)
        }
        XCTAssertEqual(parsed.toc, toc)
    }

    func testUtf8WithBomAndBlankLineParagraphs() throws {
        // Web 版の textImport.test.ts「BOM を外し、空行区切りの段落を 1 つにつなぐ」と同じ例
        let text = "\u{FEFF}雨の日は\n図書館へ行く\n\n晴れた日は\n川沿いを歩く\n\n"
        let raw = try XCTUnwrap(TextImport.decodeText(Data(text.utf8)))
        XCTAssertEqual(raw.unicodeScalars.first, "雨")
        let parsed = TextImport.parseTextBook(raw)
        XCTAssertEqual(parsed.pages.first?.components(separatedBy: "\n"), ["雨の日は図書館へ行く", "晴れた日は川沿いを歩く"])
    }
}
