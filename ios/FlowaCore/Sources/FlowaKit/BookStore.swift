// 本棚の保存。1 冊ごとにフォルダを作り、情報（meta.json）・ページ本文（pages.json）・元のファイルを置く。
// Web 版の src/lib/db.ts（IndexedDB）に当たる。

import Foundation
import Observation
import FlowaCore

/// 1 ページ分の本文（Layout の結果。ルビ記法を含んだまま）
public struct StoredPage: Codable, Equatable, Sendable {
    public var text: String
    public var contFromPrev: Bool
    public var vertical: Bool

    public init(text: String, contFromPrev: Bool, vertical: Bool = false) {
        self.text = text
        self.contFromPrev = contFromPrev
        self.vertical = vertical
    }
}

/// 目次の項目（page は 0 始まりのページ番号、depth は 0 始まりの深さ）
public struct TocItem: Codable, Hashable, Sendable {
    public var title: String
    public var page: Int
    public var depth: Int

    public init(title: String, page: Int, depth: Int) {
        self.title = title
        self.page = page
        self.depth = depth
    }
}

public struct BookMeta: Codable, Identifiable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable { case pdf, text }

    public var id: String
    public var kind: Kind
    public var title: String
    public var author: String?
    public var fileName: String
    public var pageCount: Int
    /// 本文のないページ（画像だけのページ）の数。iOS 版ではまだ文字認識をしない
    public var emptyPages: Int
    public var vertical: Bool
    public var createdAt: Date
    public var lastReadAt: Date?
    /// 読んでいた位置（段落・段落内の位置）
    public var position: [Int]?
    /// 読了率（0〜100）
    public var percent: Double
    /// 目次（PDF のしおり、青空文庫の見出し）。古い保存データには無い
    public var toc: [TocItem]?

    public init(id: String, kind: Kind, title: String, author: String? = nil, fileName: String, pageCount: Int, emptyPages: Int = 0, vertical: Bool = false, createdAt: Date = Date(), toc: [TocItem]? = nil) {
        self.id = id
        self.kind = kind
        self.title = title
        self.author = author
        self.fileName = fileName
        self.pageCount = pageCount
        self.emptyPages = emptyPages
        self.vertical = vertical
        self.createdAt = createdAt
        lastReadAt = nil
        position = nil
        percent = 0
        self.toc = toc
    }

    public var textPosition: TextPosition? {
        guard let p = position, p.count == 2 else { return nil }
        return TextPosition(para: p[0], offset: p[1])
    }
}

@Observable
@MainActor
public final class BookStore {
    /// 最近読んだ順（読んでいなければ追加した順）
    public private(set) var books: [BookMeta] = []
    public let root: URL

    public init(root: URL? = nil) {
        self.root = root ?? Self.defaultRoot
        reload()
    }

    public static var defaultRoot: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Books", isDirectory: true)
    }

    nonisolated static func folder(_ root: URL, _ id: String) -> URL { root.appendingPathComponent(id, isDirectory: true) }

    public func reload() {
        let fm = FileManager.default
        let dirs = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        var out: [BookMeta] = []
        for d in dirs {
            if let data = try? Data(contentsOf: d.appendingPathComponent("meta.json")), let m = try? Self.decoder.decode(BookMeta.self, from: data) {
                out.append(m)
            }
        }
        books = out.sorted { ($0.lastReadAt ?? $0.createdAt) > ($1.lastReadAt ?? $1.createdAt) }
    }

    public func pages(of id: String) throws -> [StoredPage] {
        let data = try Data(contentsOf: Self.folder(root, id).appendingPathComponent("pages.json"))
        return try Self.decoder.decode([StoredPage].self, from: data)
    }

    /// 元のファイル（PDF の表示に使う）
    public func originalFile(of book: BookMeta) -> URL {
        Self.folder(root, book.id).appendingPathComponent("original").appendingPathComponent(book.fileName)
    }

    /// 取り込んだ本を保存する。original は元のファイルの写しを置く場所に移す
    nonisolated static func write(root: URL, meta: BookMeta, pages: [StoredPage], original: URL?) throws {
        let fm = FileManager.default
        let dir = folder(root, meta.id)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        do {
            try encoder.encode(pages).write(to: dir.appendingPathComponent("pages.json"), options: .atomic)
            if let original {
                let od = dir.appendingPathComponent("original", isDirectory: true)
                try fm.createDirectory(at: od, withIntermediateDirectories: true)
                try fm.copyItem(at: original, to: od.appendingPathComponent(meta.fileName))
            }
            // 情報は最後に書く（途中で失敗した本は本棚に出さない）
            try encoder.encode(meta).write(to: dir.appendingPathComponent("meta.json"), options: .atomic)
        } catch {
            try? fm.removeItem(at: dir)
            throw error
        }
    }

    public func added(_ meta: BookMeta) {
        books.removeAll { $0.id == meta.id }
        books.insert(meta, at: 0)
    }

    public func update(_ meta: BookMeta) {
        if let i = books.firstIndex(where: { $0.id == meta.id }) { books[i] = meta }
        try? Self.encoder.encode(meta).write(to: Self.folder(root, meta.id).appendingPathComponent("meta.json"), options: .atomic)
    }

    /// 読んでいた位置を保存する
    public func savePosition(_ id: String, position: TextPosition, percent: Double) {
        guard var m = books.first(where: { $0.id == id }) else { return }
        m.position = [position.para, position.offset]
        m.percent = percent
        m.lastReadAt = Date()
        update(m)
    }

    public func delete(_ id: String) {
        try? FileManager.default.removeItem(at: Self.folder(root, id))
        books.removeAll { $0.id == id }
    }

    nonisolated static var encoder: JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .millisecondsSince1970
        return e
    }

    nonisolated static var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .millisecondsSince1970
        return d
    }
}
