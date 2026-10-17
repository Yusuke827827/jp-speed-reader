// PDF の文字片から行・ページ本文を組み立てる処理を、fixtures/golden の正解データ（Web 版の結果）と比べる。

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

private func number(_ v: Any?) throws -> Double {
    try XCTUnwrap((v as? NSNumber)?.doubleValue)
}

final class LayoutGoldenTests: XCTestCase {
    func testSamplePdfPages() throws {
        for name in ["layout-sample-horizontal", "layout-sample-vertical", "layout-sample-english-paper"] {
            let golden = try loadFixture(name)
            let input = try XCTUnwrap(golden["input"] as? [String: Any])
            let pages: [[RawItem]] = try XCTUnwrap(input["pages"] as? [[[String: Any]]]).map { items in
                try items.map { it in
                    RawItem(
                        str: try XCTUnwrap(it["str"] as? String),
                        x: try number(it["x"]), y: try number(it["y"]),
                        w: try number(it["w"]), h: try number(it["h"]),
                        size: try number(it["size"]),
                        vertical: try XCTUnwrap(it["vertical"] as? Bool)
                    )
                }
            }
            let got = Layout.linesToPageTexts(pages.map(Layout.itemsToLines))
            let expected = try XCTUnwrap(golden["expected"] as? [String: Any])
            let want = try XCTUnwrap(expected["pageTexts"] as? [[String: Any]])
            XCTAssertEqual(got.count, want.count, "\(name): ページ数")
            for (i, (g, w)) in zip(got, want).enumerated() {
                let l = "\(name) [\(i)]"
                XCTAssertEqual(g.text, w["text"] as? String, l)
                XCTAssertEqual(g.contFromPrev, w["contFromPrev"] as? Bool, l)
                XCTAssertEqual(g.vertical, w["vertical"] as? Bool, l)
            }
        }
    }
}
