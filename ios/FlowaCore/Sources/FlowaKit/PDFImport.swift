// PDFKit で読んだ PDF の文字を、レイアウト解析用の断片（RawItem）に変換し、ページ本文を作る。
// Web 版の src/lib/pdfItems.ts（PDF.js の getTextContent から断片を作る処理）に当たる。
//
// PDFKit は PDF.js のような「描画命令ごとの断片」を返さないので、1 文字ずつの位置（PDFSelection）を取り、
// 同じ行（縦書きなら同じ列）に隙間なく続く文字を 1 つの断片にまとめる。空白は区切りとして捨て、
// 単語間の空白は Layout が位置の隙間から補う。

#if canImport(PDFKit)
import Foundation
import PDFKit
import FlowaCore

#if canImport(UIKit)
import UIKit
private typealias PlatformFont = UIFont
#else
import AppKit
private typealias PlatformFont = NSFont
#endif

public enum PDFImport {
    /// 本文がこれより少ないページは「テキストなし」（画像のページ）とみなす（importer.ts の MIN_PAGE_CHARS）
    public static let minPageChars = 8

    private struct Glyph {
        var ch: String
        /// 字形の箱（ベースラインの下の部分も含む）
        var rect: CGRect
        /// ベースラインの y（PDF.js の断片の y に当たる）
        var baseline: Double
        var size: Double
        /// 半角の空白（横書きの断片の途中にだけ含める。PDF.js の断片も単語間の空白を含む）
        var space = false
    }

    /// 1 ページ分の文字を断片にする
    public static func rawItems(_ page: PDFPage) -> [RawItem] {
        guard let string = page.string, !string.isEmpty else { return [] }
        let ns = string as NSString
        let attributed = page.attributedString

        var glyphs: [Glyph?] = []
        var i = 0
        while i < ns.length {
            // サロゲートペアなどは 1 文字として扱う
            let r = ns.rangeOfComposedCharacterSequence(at: i)
            i = r.location + r.length
            let ch = ns.substring(with: r)
            // 位置は PDFSelection から取る（characterBounds(at:) は、PDFKit が補った改行の分だけ位置がずれる）
            let rect = page.selection(for: r)?.bounds(for: page) ?? .null
            let blank = ch.unicodeScalars.allSatisfy { CharacterSet.whitespacesAndNewlines.contains($0) || CharacterSet.controlCharacters.contains($0) }
            if rect.isNull || rect.width <= 0 || rect.height <= 0 || (blank && ch != " ") {
                glyphs.append(nil)
                continue
            }
            var size = 0.0
            var descender = 0.0
            if let attributed, r.location < attributed.length, let font = attributed.attribute(.font, at: r.location, effectiveRange: nil) as? PlatformFont {
                size = Double(font.pointSize)
                descender = Double(font.descender)
            }
            if size <= 0 { size = Double(min(rect.width, rect.height)) }
            glyphs.append(Glyph(ch: ch, rect: rect, baseline: Double(rect.minY) - descender, size: size, space: blank))
        }
        return mergeRuns(glyphs)
    }

    private enum Dir { case none, horizontal, vertical }

    /// 隣り合う文字を断片にまとめる
    private static func mergeRuns(_ glyphs: [Glyph?]) -> [RawItem] {
        var items: [RawItem] = []
        var run: [Glyph] = []
        var dir = Dir.none

        func flush() {
            while run.last?.space == true { run.removeLast() }
            guard let first = run.first, let last = run.last else {
                run = []
                dir = .none
                return
            }
            let str = Normalize.normalizeChars(run.map(\.ch).joined())
            let size = run.map(\.size).max() ?? first.size
            if dir == .vertical {
                let minX = run.map { Double($0.rect.minX) }.min() ?? 0
                let maxX = run.map { Double($0.rect.maxX) }.max() ?? 0
                items.append(RawItem(str: str, x: minX, y: Double(last.rect.minY), w: maxX - minX, h: Double(first.rect.maxY - last.rect.minY), size: size, vertical: true))
            } else {
                items.append(RawItem(str: str, x: Double(first.rect.minX), y: first.baseline, w: Double(last.rect.maxX - first.rect.minX), h: size, size: size, vertical: false))
            }
            run = []
            dir = .none
        }

        for g in glyphs {
            guard let g else {
                flush()
                continue
            }
            guard let prev = run.last else {
                if !g.space { run = [g] }
                continue
            }
            let s = max(prev.size, g.size)
            let sameSize = abs(prev.size - g.size) < s * 0.2
            let horizontal = abs(g.baseline - prev.baseline) < s * 0.25
                && g.rect.minX - prev.rect.maxX > -s * 0.3 && g.rect.minX - prev.rect.maxX < s * 0.3
            let vertical = abs(g.rect.midX - prev.rect.midX) < s * 0.25
                && prev.rect.minY - g.rect.maxY > -s * 0.3 && prev.rect.minY - g.rect.maxY < s * 0.3
            if sameSize, horizontal, dir != .vertical {
                dir = .horizontal
                run.append(g)
            } else if g.space {
                flush()
            } else if sameSize, vertical, dir != .horizontal {
                dir = .vertical
                run.append(g)
            } else {
                flush()
                run = [g]
            }
        }
        flush()
        return items
    }

    /// 全ページの本文を組み立てる。progress は (済んだページ数, 全ページ数)
    public static func pages(_ doc: PDFDocument, progress: ((Int, Int) -> Void)? = nil) -> [StoredPage] {
        var lines: [PageLines] = []
        for i in 0..<doc.pageCount {
            let items = doc.page(at: i).map(rawItems) ?? []
            lines.append(Layout.itemsToLines(items))
            progress?(i + 1, doc.pageCount)
        }
        return Layout.linesToPageTexts(lines).map { t in
            let visible = t.text.unicodeScalars.filter { !CharacterSet.whitespacesAndNewlines.contains($0) }.count
            return StoredPage(text: visible < minPageChars ? "" : t.text, contFromPrev: t.contFromPrev, vertical: t.vertical)
        }
    }
}
#endif
