// 段落の組み立てと位置の対応を、fixtures/golden の正解データ（Web 版の結果）と比べる。

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

/// 正解データの段落と比べる（本文・ルビ・ページの印、あれば先頭からの位置と挿絵）
private func assertParagraphs(_ got: [Paragraph], _ want: [[String: Any]], _ label: String, file: StaticString = #filePath, line: UInt = #line) throws {
    XCTAssertEqual(got.count, want.count, "\(label): 段落の数", file: file, line: line)
    for (i, (p, w)) in zip(got, want).enumerated() {
        let l = "\(label) [\(i)]"
        XCTAssertEqual(p.text, w["text"] as? String, l, file: file, line: line)
        let ruby = try XCTUnwrap(w["ruby"] as? [[String: Any]]).map { r in
            Ruby(start: r["start"] as? Int ?? -1, end: r["end"] as? Int ?? -1, text: r["text"] as? String ?? "")
        }
        XCTAssertEqual(p.ruby, ruby, l, file: file, line: line)
        XCTAssertEqual(p.pageMarks, w["pageMarks"] as? [[Int]], l, file: file, line: line)
        if let g = w["globalStart"] as? Int { XCTAssertEqual(p.globalStart, g, l, file: file, line: line) }
        if let il = w["illust"] as? [String: Any] {
            XCTAssertEqual(p.illust?.page, il["page"] as? Int, l, file: file, line: line)
            XCTAssertEqual(p.illust?.rect, il["rect"] as? [Double], l, file: file, line: line)
        } else {
            XCTAssertNil(p.illust, l, file: file, line: line)
        }
    }
}

final class BookGoldenTests: XCTestCase {
    func testBuildBookTextAndPositions() throws {
        let golden = try loadFixture("buildBookText")
        let input = try XCTUnwrap(golden["input"] as? [String: Any])
        let pages: [PageEntry] = try XCTUnwrap(input["pages"] as? [[String: Any]]).map { p in
            PageEntry(
                pageIndex: try XCTUnwrap(p["pageIndex"] as? Int),
                text: try XCTUnwrap(p["text"] as? String),
                contFromPrev: try XCTUnwrap(p["contFromPrev"] as? Bool),
                image: (p["image"] as? String).flatMap(PageEntry.Image.init(rawValue:)),
                illustRect: p["illustRect"] as? [Double]
            )
        }
        let book = BookText(pages: pages, pageCount: try XCTUnwrap(input["pageCount"] as? Int))
        let expected = try XCTUnwrap(golden["expected"] as? [String: Any])
        try assertParagraphs(book.paragraphs, try XCTUnwrap(expected["paragraphs"] as? [[String: Any]]), "buildBookText")
        XCTAssertEqual(book.totalChars, expected["totalChars"] as? Int)
        XCTAssertEqual(book.pageCount, expected["pageCount"] as? Int)

        let positions = try XCTUnwrap(input["positions"] as? [[String: Int]]).map { TextPosition(para: $0["para"] ?? 0, offset: $0["offset"] ?? 0) }
        XCTAssertEqual(positions.map(book.pageAt), expected["pageAt"] as? [Int])
        XCTAssertEqual(positions.map(book.globalOffset), expected["globalOffset"] as? [Int])
        let percents = try XCTUnwrap(expected["percentAt"] as? [Double])
        for (pos, want) in zip(positions, percents) {
            XCTAssertEqual(book.percentAt(pos), want, accuracy: 1e-3, "percentAt(\(pos))")
        }
        let queries = try XCTUnwrap(input["pageQueries"] as? [Int])
        let wantPositions = try XCTUnwrap(expected["positionForPage"] as? [[String: Int]]).map { TextPosition(para: $0["para"] ?? -1, offset: $0["offset"] ?? -1) }
        XCTAssertEqual(queries.map(book.positionForPage), wantPositions)
    }

    /// サンプル PDF のページ本文から段落を組み立て、参考文献の範囲を求める（layout-*.json の後半）
    func testBookFromSamplePages() throws {
        for name in ["layout-sample-horizontal", "layout-sample-vertical", "layout-sample-english-paper"] {
            let golden = try loadFixture(name)
            let expected = try XCTUnwrap(golden["expected"] as? [String: Any])
            let pageTexts = try XCTUnwrap(expected["pageTexts"] as? [[String: Any]])
            let pages = try pageTexts.enumerated().map { i, p in
                PageEntry(pageIndex: i, text: try XCTUnwrap(p["text"] as? String), contFromPrev: try XCTUnwrap(p["contFromPrev"] as? Bool))
            }
            let book = BookText(pages: pages, pageCount: pages.count)
            try assertParagraphs(book.paragraphs, try XCTUnwrap(expected["paragraphs"] as? [[String: Any]]), name)
            XCTAssertEqual(book.referenceParagraphs().sorted(), (expected["references"] as? [Int])?.sorted(), name)
        }
    }
}
