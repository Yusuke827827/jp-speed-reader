// ファイルの取り込み: PDF なら本文を取り出してページごとに、テキストなら青空文庫形式も含めて読み込み、本棚に保存する。
// Web 版の src/lib/importer.ts に当たる。文字認識（OCR）・挿絵の判定・文字化けの修復はまだ移植していない。

import Foundation
import FlowaCore
#if canImport(PDFKit)
import PDFKit
#endif

public struct ImportError: LocalizedError, Equatable {
    public enum Kind: Equatable { case unsupported, unreadable, locked, noText }
    public var kind: Kind

    public init(_ kind: Kind) { self.kind = kind }
}

public enum BookImporter {
    /// 取り込んで保存し、本の情報を返す。時間がかかるので画面の処理とは別に呼ぶ
    public static func importFile(_ url: URL, root: URL, progress: (@Sendable (Int, Int) -> Void)? = nil) throws -> BookMeta {
        // 「ファイル」アプリから選んだファイルは、使う間だけアクセスの許可を得る
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        let name = url.lastPathComponent
        let ext = url.pathExtension.lowercased()
        let id = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        let meta: BookMeta
        let pages: [StoredPage]
        if ext == "txt" {
            guard let data = try? Data(contentsOf: url), let raw = TextImport.decodeText(data) else { throw ImportError(.unreadable) }
            let parsed = TextImport.parseTextBook(raw)
            if parsed.pages.joined().unicodeScalars.allSatisfy({ CharacterSet.whitespacesAndNewlines.contains($0) }) { throw ImportError(.noText) }
            pages = parsed.pages.map { StoredPage(text: $0, contFromPrev: false) }
            meta = BookMeta(
                id: id, kind: .text, title: parsed.title ?? url.deletingPathExtension().lastPathComponent, author: parsed.author,
                fileName: name, pageCount: pages.count, toc: parsed.toc.map { TocItem(title: $0.title, page: $0.page, depth: $0.depth) }
            )
        } else if ext == "pdf" {
            #if canImport(PDFKit)
            guard let doc = PDFDocument(url: url) else { throw ImportError(.unreadable) }
            if doc.isLocked { throw ImportError(.locked) }
            pages = PDFImport.pages(doc, progress: progress)
            let textPages = pages.filter { !$0.text.isEmpty }
            if textPages.isEmpty { throw ImportError(.noText) }
            let title = (doc.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String).flatMap { t -> String? in
                let s = t.trimmingCharacters(in: .whitespacesAndNewlines)
                return s.isEmpty ? nil : s
            }
            meta = BookMeta(
                id: id, kind: .pdf, title: title ?? url.deletingPathExtension().lastPathComponent,
                author: doc.documentAttributes?[PDFDocumentAttribute.authorAttribute] as? String,
                fileName: name, pageCount: doc.pageCount, emptyPages: pages.count - textPages.count,
                vertical: textPages.filter(\.vertical).count * 2 > textPages.count,
                toc: outline(doc)
            )
            #else
            throw ImportError(.unsupported)
            #endif
        } else {
            throw ImportError(.unsupported)
        }
        try BookStore.write(root: root, meta: meta, pages: pages, original: url)
        return meta
    }

    #if canImport(PDFKit)
    /// PDF のしおりを目次にする（ページの分からない項目は除く）
    static func outline(_ doc: PDFDocument) -> [TocItem] {
        var out: [TocItem] = []
        func walk(_ node: PDFOutline, _ depth: Int) {
            for i in 0..<node.numberOfChildren {
                guard let child = node.child(at: i) else { continue }
                let title = (child.label ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if let page = child.destination?.page, !title.isEmpty {
                    out.append(TocItem(title: title, page: doc.index(for: page), depth: depth))
                }
                walk(child, depth + 1)
            }
        }
        if let root = doc.outlineRoot { walk(root, 0) }
        return out
    }
    #endif
}
