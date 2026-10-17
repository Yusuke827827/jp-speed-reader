// ページごとの本文を、ページをまたぐ段落も含めて 1 冊分の段落列に組み立てる（src/lib/book.ts の移植）。
// ページの本文はルビ記法（｜漢字《かんじ》）を含んだまま保存しており、ここで本文とルビに分ける。
// 各段落は「どの文字位置からどのページか」を持つので、高速読書の位置から PDF のページを引ける（逆も可）。
// 位置はすべて UTF-16 の単位。

import Foundation

/// ルビ。段落内の親文字の範囲 [start, end) と読み
public struct Ruby: Equatable, Sendable {
    public var start: Int
    public var end: Int
    public var text: String

    public init(start: Int, end: Int, text: String) {
        self.start = start
        self.end = end
        self.text = text
    }
}

/// 挿絵。ページ番号と、ページ内の範囲（左・上・幅・高さ、0〜1）
public struct Illust: Equatable, Sendable {
    public var page: Int
    public var rect: [Double]

    public init(page: Int, rect: [Double]) {
        self.page = page
        self.rect = rect
    }
}

public struct Paragraph: Equatable, Sendable {
    /// ルビ記法を除いた本文
    public var text: String
    public var ruby: [Ruby]
    /// [段落内の開始位置, ページ番号（0 始まり）] の昇順の並び
    public var pageMarks: [[Int]]
    /// 1 冊の先頭からの位置
    public var globalStart: Int
    /// 挿絵を表す段落（本文は空）
    public var illust: Illust?

    public init(text: String, ruby: [Ruby] = [], pageMarks: [[Int]] = [[0, 0]], globalStart: Int = 0, illust: Illust? = nil) {
        self.text = text
        self.ruby = ruby
        self.pageMarks = pageMarks
        self.globalStart = globalStart
        self.illust = illust
    }
}

/// 1 ページ分の本文
public struct PageEntry: Sendable {
    public enum Image: String, Sendable { case illust, blank }

    public var pageIndex: Int
    public var text: String
    public var contFromPrev: Bool
    public var image: Image?
    public var illustRect: [Double]?

    public init(pageIndex: Int, text: String, contFromPrev: Bool, image: Image? = nil, illustRect: [Double]? = nil) {
        self.pageIndex = pageIndex
        self.text = text
        self.contFromPrev = contFromPrev
        self.image = image
        self.illustRect = illustRect
    }
}

public struct TextPosition: Equatable, Sendable {
    public var para: Int
    public var offset: Int

    public init(para: Int, offset: Int) {
        self.para = para
        self.offset = offset
    }
}

public struct BookText: Sendable {
    public var paragraphs: [Paragraph]
    public var totalChars: Int
    public var pageCount: Int

    public init(pages: [PageEntry], pageCount: Int) {
        var paragraphs: [Paragraph] = []
        let sorted = pages.enumerated().sorted { $0.element.pageIndex != $1.element.pageIndex ? $0.element.pageIndex < $1.element.pageIndex : $0.offset < $1.offset }.map(\.element)
        let illustPages = Set(sorted.filter { $0.image == .illust }.map(\.pageIndex))
        let blankPages = Set(sorted.filter { $0.image == .blank }.map(\.pageIndex))
        // 挿絵は段落を途中で切らないよう、次に新しい段落が始まる位置に差し込む
        var pending: [Illust] = []
        func flush() {
            for il in pending { paragraphs.append(Paragraph(text: "", pageMarks: [[0, il.page]], illust: il)) }
            pending = []
        }
        var prevPage = -2
        for p in sorted {
            let parts = p.text.components(separatedBy: "\n").map { JS.string(JS.trim(JS.units($0))) }.filter { !$0.isEmpty }
            if !parts.isEmpty {
                // 直前の本文ページとの間が挿絵・白紙のページだけなら、段落をつなげてよい
                var gapOk = p.pageIndex == prevPage + 1
                if !gapOk, prevPage >= 0 {
                    gapOk = true
                    for k in (prevPage + 1)..<max(prevPage + 1, p.pageIndex) where !illustPages.contains(k) && !blankPages.contains(k) { gapOk = false }
                }
                let canJoin = p.contFromPrev && gapOk && paragraphs.last != nil && paragraphs.last?.illust == nil
                for (i, raw) in parts.enumerated() {
                    // 古い版で取り込んだ本文には縦書き用の記号が残っているので、読むときにも直す
                    let (t, ruby) = Normalize.parseRuby(Normalize.normalizeChars(raw))
                    if t.isEmpty { continue }
                    if i == 0, canJoin {
                        let last = paragraphs.count - 1
                        let shift = paragraphs[last].text.utf16.count
                        paragraphs[last].pageMarks.append([shift, p.pageIndex])
                        paragraphs[last].text += t
                        for r in ruby { paragraphs[last].ruby.append(Ruby(start: r.start + shift, end: r.end + shift, text: r.text)) }
                    } else {
                        flush()
                        paragraphs.append(Paragraph(text: t, ruby: ruby, pageMarks: [[0, p.pageIndex]]))
                    }
                }
                prevPage = p.pageIndex
            }
            if p.image == .illust { pending.append(Illust(page: p.pageIndex, rect: p.illustRect ?? [0, 0, 1, 1])) }
        }
        flush()
        var pos = 0
        for i in paragraphs.indices {
            paragraphs[i].globalStart = pos
            pos += paragraphs[i].text.utf16.count
        }
        self.paragraphs = paragraphs
        totalChars = pos
        self.pageCount = pageCount
    }

    /// 位置のあるページ
    public func pageAt(_ pos: TextPosition) -> Int {
        guard paragraphs.indices.contains(pos.para) else { return 0 }
        let marks = paragraphs[pos.para].pageMarks
        var page = marks[0][1]
        for m in marks {
            if m[0] <= pos.offset { page = m[1] } else { break }
        }
        return page
    }

    /// 指定ページ以降で最初に始まる本文の位置
    public func positionForPage(_ page: Int) -> TextPosition {
        for (i, p) in paragraphs.enumerated() {
            for m in p.pageMarks where m[1] >= page { return TextPosition(para: i, offset: m[0]) }
        }
        return TextPosition(para: max(0, paragraphs.count - 1), offset: 0)
    }

    public func globalOffset(_ pos: TextPosition) -> Int {
        guard paragraphs.indices.contains(pos.para) else { return 0 }
        return paragraphs[pos.para].globalStart + pos.offset
    }

    /// 読了率（0〜100）
    public func percentAt(_ pos: TextPosition) -> Double {
        if totalChars == 0 { return 0 }
        return min(100, Double(globalOffset(pos)) / Double(totalChars) * 100)
    }

    private static let referencesHeading = try! NSRegularExpression(
        pattern: "^(?:[0-9]+\\.?\\s*)?(?:references|bibliography|works cited|literature cited|参考文献|引用文献)$", options: [.caseInsensitive])
    private static let afterReferences = try! NSRegularExpression(
        pattern: "^(?:[0-9A-Z]+\\.?\\s*)?(?:appendix|appendices|supplementary|付録)", options: [.caseInsensitive])

    /// 参考文献の段落（見出しから、次の付録などの見出しの手前まで）。速読で飛ばすのに使う
    public func referenceParagraphs() -> Set<Int> {
        func matches(_ re: NSRegularExpression, _ s: String) -> Bool {
            re.firstMatch(in: s, range: NSRange(location: 0, length: (s as NSString).length)) != nil
        }
        var out = Set<Int>()
        var inRefs = false
        for (i, p) in paragraphs.enumerated() {
            let t = JS.string(JS.trim(JS.units(p.text)))
            if matches(Self.referencesHeading, t) { inRefs = true } else if inRefs, matches(Self.afterReferences, t) { inRefs = false }
            if inRefs { out.insert(i) }
        }
        return out
    }
}
