// 一時的な調査用: PDFKit が返す文字と位置を出力する
#if canImport(PDFKit)
import Foundation
import PDFKit
import XCTest

final class GlyphDumpTests: XCTestCase {
    func testDump() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        for name in ["sample-vertical", "sample-english-paper", "sample-horizontal"] {
            let doc = try XCTUnwrap(PDFDocument(url: root.appendingPathComponent("public/samples/\(name).pdf")))
            let page = try XCTUnwrap(doc.page(at: 0))
            let s = (page.string ?? "") as NSString
            print("== \(name) chars=\(page.numberOfCharacters) len=\(s.length) bounds=\(page.bounds(for: .mediaBox)) rotation=\(page.rotation)")
            let attr = page.attributedString
            let t0 = Date()
            var n = 0
            for i in 0..<s.length { if let sel = page.selection(for: NSRange(location: i, length: 1)) { _ = sel.bounds(for: page); n += 1 } }
            print("selection per char: \(n) chars in \(Date().timeIntervalSince(t0)) s")
            for i in 0..<min(70, s.length) {
                let r = page.selection(for: NSRange(location: i, length: 1))?.bounds(for: page) ?? .null
                var size = -1.0
                if let attr, i < attr.length, let f = attr.attribute(.font, at: i, effectiveRange: nil) as? NSFont { size = Double(f.pointSize) }
                print(String(format: "%3d U+%04X %@ x=%.1f y=%.1f w=%.1f h=%.1f font=%.1f", i, s.character(at: i), s.substring(with: NSRange(location: i, length: 1)), r.minX, r.minY, r.width, r.height, size))
            }
        }
    }
}
#endif
