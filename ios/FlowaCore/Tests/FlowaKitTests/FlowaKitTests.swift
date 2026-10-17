// 取り込み・保存・再生の状態のテスト。PDF はサンプル PDF を PDFKit で読み、Web 版（PDF.js）の結果（fixtures/golden）と比べる。

import Foundation
import XCTest
import FlowaCore
@testable import FlowaKit
#if canImport(PDFKit)
import PDFKit
#endif

private let repoRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent()

private func loadFixture(_ name: String) throws -> [String: Any] {
    let data = try Data(contentsOf: repoRoot.appendingPathComponent("fixtures/golden/\(name).json"))
    return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
}

/// 条件を満たすまで待つ（最大 10 秒）
@MainActor
private func waitUntil(_ cond: () -> Bool) async throws {
    for _ in 0..<500 {
        if cond() { return }
        try await Task.sleep(for: .milliseconds(20))
    }
    XCTFail("待ち時間を過ぎました")
}

private func tempRoot() throws -> URL {
    let u = FileManager.default.temporaryDirectory.appendingPathComponent("flowa-test-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
    return u
}

final class FlowaKitTests: XCTestCase {
    #if canImport(PDFKit)
    /// PDFKit から作った断片で、Web 版（PDF.js）と同じ本文になる
    func testPdfImportMatchesWeb() throws {
        for name in ["sample-horizontal", "sample-vertical", "sample-english-paper"] {
            let doc = try XCTUnwrap(PDFDocument(url: repoRoot.appendingPathComponent("public/samples/\(name).pdf")), name)
            let pages = PDFImport.pages(doc)
            let expected = try XCTUnwrap(try loadFixture("layout-\(name)")["expected"] as? [String: Any])
            let want = try XCTUnwrap(expected["pageTexts"] as? [[String: Any]])
            XCTAssertEqual(pages.count, want.count, name)
            for (i, (g, w)) in zip(pages, want).enumerated() {
                XCTAssertEqual(g.text, w["text"] as? String, "\(name) p\(i)")
                XCTAssertEqual(g.contFromPrev, w["contFromPrev"] as? Bool, "\(name) p\(i)")
                XCTAssertEqual(g.vertical, w["vertical"] as? Bool, "\(name) p\(i)")
            }
        }
    }

    @MainActor
    func testImportPdfIntoStore() throws {
        let root = try tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let meta = try BookImporter.importFile(repoRoot.appendingPathComponent("public/samples/sample-vertical.pdf"), root: root)
        XCTAssertEqual(meta.kind, .pdf)
        XCTAssertTrue(meta.vertical)
        let store = BookStore(root: root)
        XCTAssertEqual(store.books.map(\.id), [meta.id])
        XCTAssertEqual(try store.pages(of: meta.id).count, meta.pageCount)
        XCTAssertTrue(FileManager.default.fileExists(atPath: store.originalFile(of: meta).path))
    }
    #endif

    @MainActor
    func testImportTextAndRead() async throws {
        let root = try tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let meta = try BookImporter.importFile(repoRoot.appendingPathComponent("public/samples/sample-aozora.txt"), root: root)
        XCTAssertEqual(meta.kind, .text)
        let golden = try XCTUnwrap(try loadFixture("parseTextBook-aozora")["expected"] as? [String: Any])
        XCTAssertEqual(meta.title, golden["title"] as? String)

        let store = BookStore(root: root)
        let pages = try store.pages(of: meta.id)
        XCTAssertEqual(pages.map(\.text), golden["pages"] as? [String])

        // 単位を作り、segmentBook をそのまま使った結果と同じか
        let model = ReaderModel(book: meta, pages: pages, settings: ReaderSettings())
        try await waitUntil { !model.preparing }
        XCTAssertFalse(model.chunks.isEmpty)
        XCTAssertEqual(model.chunks, Segmenter.segmentBook(model.text.paragraphs, SegmentOptions(mode: .bunsetsu, phraseTarget: 7, minChars: 3)))

        // 位置の保存と読み込み
        model.step(10)
        let pos = model.position
        store.savePosition(meta.id, position: pos, percent: model.percent)
        let saved = try XCTUnwrap(BookStore(root: root).books.first)
        XCTAssertEqual(saved.textPosition, pos)
        let reopened = ReaderModel(book: saved, pages: pages, settings: ReaderSettings())
        try await waitUntil { !reopened.preparing }
        XCTAssertEqual(reopened.index, 10)

        // 分割の単位を変えても同じ位置にとどまる
        reopened.settings.mode = ChunkMode.sentence.rawValue
        XCTAssertTrue(reopened.preparing)
        try await waitUntil { !reopened.preparing }
        let c = try XCTUnwrap(reopened.chunk)
        XCTAssertTrue(c.para == pos.para && c.start <= pos.offset && c.end > pos.offset, "\(c) \(pos)")
    }

    @MainActor
    func testPlaybackAdvances() async throws {
        let meta = BookMeta(id: "t", kind: .text, title: "t", fileName: "t.txt", pageCount: 1)
        var s = ReaderSettings()
        s.cpm = 3000
        s.rampUp = false
        let model = ReaderModel(book: meta, pages: [StoredPage(text: "雨の日は図書館へ行く。晴れた日は川沿いを歩く。", contFromPrev: false)], settings: s)
        try await waitUntil { !model.preparing }
        XCTAssertGreaterThan(model.chunks.count, 2)
        var reported = 0
        model.onPosition = { _, _ in reported += 1 }
        model.play()
        XCTAssertTrue(model.playing)
        try await waitUntil { model.finished }
        XCTAssertEqual(model.index, model.chunks.count - 1)
        XCTAssertFalse(model.playing)
        XCTAssertEqual(reported, 1)
        XCTAssertEqual(model.percent, model.text.percentAt(model.position))
    }

    func testVerticalForms() {
        let cells = VerticalForms.cells("「12時、ゲーム」123")
        XCTAssertEqual(cells.map(\.text), ["﹁", "12", "時", "︑", "ゲ", "ー", "ム", "﹂", "1", "2", "3"])
        XCTAssertEqual(cells.map(\.rotated), [false, false, false, false, false, true, false, false, true, true, true])
        XCTAssertEqual(VerticalForms.cells("OK").map(\.narrow), [true, true])
        XCTAssertEqual(VerticalForms.cells("なっていく").map(\.small), [false, true, false, false, false])
    }

    func testShowsVertical() {
        var s = ReaderSettings()
        XCTAssertTrue(s.showsVertical(bookIsVertical: true))
        XCTAssertFalse(s.showsVertical(bookIsVertical: false))
        s.direction = "vertical"
        XCTAssertTrue(s.showsVertical(bookIsVertical: false))
        s.direction = "horizontal"
        XCTAssertFalse(s.showsVertical(bookIsVertical: true))
    }

    func testSettingsDecodeOldData() throws {
        let s = try JSONDecoder().decode(ReaderSettings.self, from: Data(#"{"cpm": 900}"#.utf8))
        XCTAssertEqual(s.cpm, 900)
        XCTAssertEqual(s.wpm, ReaderSettings().wpm)
    }
}
