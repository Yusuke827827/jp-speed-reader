// 無料版の上限（ProLimits）と、購入済みかの記憶（ProStore）のテスト。

import Foundation
import XCTest
@testable import FlowaKit

private func book(_ kind: BookMeta.Kind, _ file: String) -> BookMeta {
    BookMeta(id: UUID().uuidString, kind: kind, title: file, fileName: file, pageCount: 1)
}

final class ProTests: XCTestCase {
    let samples: Set<String> = ["sample-vertical.pdf", "sample-english-paper.pdf", "sample-aozora.txt"]

    /// 無料版は PDF 3 冊まで。テキストとサンプルは数えない
    func testPdfLimit() {
        var books = [book(.pdf, "sample-vertical.pdf"), book(.pdf, "sample-english-paper.pdf"), book(.text, "sample-aozora.txt"), book(.text, "a.txt")]
        XCTAssertEqual(ProLimits.pdfCount(books, samples: samples), 0)
        for name in ["1.pdf", "2.pdf"] {
            books.append(book(.pdf, name))
            XCTAssertTrue(ProLimits.canAddPDF(books: books, samples: samples, isPro: false))
        }
        books.append(book(.pdf, "3.pdf"))
        XCTAssertEqual(ProLimits.pdfCount(books, samples: samples), ProLimits.freePDFBooks)
        XCTAssertFalse(ProLimits.canAddPDF(books: books, samples: samples, isPro: false))
        XCTAssertTrue(ProLimits.canAddPDF(books: books, samples: samples, isPro: true))
    }

    func testThemes() {
        for id in ["auto", "paper", "light", "sepia", "gray", "dark", "black"] {
            XCTAssertTrue(ProLimits.themeAllowed(id, isPro: false), id)
        }
        for id in ["washi", "parchment", "night", "aurora"] {
            XCTAssertFalse(ProLimits.themeAllowed(id, isPro: false), id)
            XCTAssertTrue(ProLimits.themeAllowed(id, isPro: true), id)
        }
    }

    /// 起動直後は前回の結果を使う。forcePro は記憶に関係なく Pro
    @MainActor
    func testStoreStartsFromCache() throws {
        let name = "flowa-test-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        XCTAssertFalse(ProStore(defaults: defaults).isPro)
        XCTAssertTrue(ProStore(defaults: defaults, forcePro: true).isPro)
        defaults.set(true, forKey: "flowa.isPro")
        XCTAssertTrue(ProStore(defaults: defaults).isPro)
    }
}
