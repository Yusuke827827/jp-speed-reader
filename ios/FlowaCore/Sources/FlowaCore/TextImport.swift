// テキストファイル（青空文庫形式を含む）の取り込み（src/lib/textImport.ts の移植）。
//
// - 文字コードは UTF-8（BOM の有無を問わない）を試し、読めなければ Shift_JIS とみなす。
// - 青空文庫形式なら、1 行目を題名、2 行目を著者とし、記号の説明（-------- で挟まれた部分）と
//   末尾の「底本：」以降を除く。ルビ記法（｜漢字《かんじ》）はそのまま残す。
// - ［＃「…」は大見出し］などの注記から目次を作り、ほかの注記は消す。
// - 段落の切れ目で約 1200 字（UTF-16 の単位）ごとに区切った「仮のページ」にする。

import Foundation

public struct TocEntry: Equatable, Sendable {
    public var title: String
    public var page: Int
    public var depth: Int

    public init(title: String, page: Int, depth: Int) {
        self.title = title
        self.page = page
        self.depth = depth
    }
}

public struct ParsedText: Equatable, Sendable {
    public var title: String?
    public var author: String?
    /// 仮のページごとの本文（段落は \n 区切り、ルビ記法を含む）
    public var pages: [String]
    public var toc: [TocEntry]
}

public enum TextImport {
    public static let pageChars = 1200

    /// UTF-8 として読めればそれを、読めなければ Shift_JIS として読む。先頭の BOM は外す
    public static func decodeText(_ data: Data) -> String? {
        if var s = String(data: data, encoding: .utf8) {
            if s.unicodeScalars.first == "\u{FEFF}" { s.unicodeScalars.removeFirst() }
            return s
        }
        return String(data: data, encoding: .shiftJIS)
    }

    // 正規表現は NSRegularExpression（位置は UTF-16 の単位で、JavaScript と同じ）
    private static func regex(_ pattern: String) -> NSRegularExpression {
        // パターンは固定の文字列なので、失敗するのはプログラムの誤りだけ
        try! NSRegularExpression(pattern: pattern)
    }
    static let notes = regex("［＃[^］]*］")
    static let heading = regex("［＃「([^」]+)」は(大|中|小)見出し］")
    static let headingBlock = regex("［＃(大|中|小)見出し］(.*?)［＃\\1見出し終わり］")
    static let rubyNotation = regex("《[^》]*》|｜")
    static let depthOf: [String: Int] = ["大": 0, "中": 1, "小": 2]
    static let paraEnds = JS.set("。」』！？!?")

    static func replaceAll(_ re: NSRegularExpression, _ s: String, with template: String = "") -> String {
        re.stringByReplacingMatches(in: s, range: NSRange(location: 0, length: (s as NSString).length), withTemplate: template)
    }

    static func groups(_ re: NSRegularExpression, _ s: String) -> [String]? {
        let ns = s as NSString
        guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { return nil }
        return (0..<m.numberOfRanges).map { m.range(at: $0).location == NSNotFound ? "" : ns.substring(with: m.range(at: $0)) }
    }

    static func trim(_ s: String) -> String { JS.string(JS.trim(JS.units(s))) }
    static func trimEnd(_ s: String) -> String { JS.string(JS.trimEnd(JS.units(s))) }

    /// /^-{10,}\s*$/
    static func isDashes(_ line: String) -> Bool {
        let u = JS.units(line)
        var i = 0
        while i < u.count, u[i] == 0x2D { i += 1 }
        return i >= 10 && u[i...].allSatisfy(JS.isSpace)
    }

    /// 行頭の全角・半角の空白を外す（/^[　 ]+/）
    static func trimIndent(_ s: String) -> String {
        let u = JS.units(s)
        var i = 0
        while i < u.count, u[i] == 0x3000 || u[i] == 0x20 { i += 1 }
        return JS.string(u[i...])
    }

    public static func parseTextBook(_ raw: String) -> ParsedText {
        // \r\n と \r を \n にそろえて行に分ける
        let normalized = raw.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        var lines = normalized.components(separatedBy: "\n")
        var title: String?
        var author: String?

        // 青空文庫形式: 題名・著者・記号の説明
        if let firstDash = lines.firstIndex(where: isDashes), firstDash <= 6,
           lines[firstDash..<min(lines.count, firstDash + 12)].contains(where: { $0.contains("記号について") }) {
            let head = lines[0..<firstDash].map(trim).filter { !$0.isEmpty }
            title = head.first
            author = head.count > 1 ? head[1] : nil
            let secondDash = lines.indices.first { $0 > firstDash && isDashes(lines[$0]) }
            lines = Array(lines[((secondDash ?? firstDash) + 1)...])
        }
        if let footer = lines.firstIndex(where: { $0.hasPrefix("底本：") }) { lines = Array(lines[0..<footer]) }

        // 段落と見出しを取り出す
        struct Para {
            var text: String
            var heading: (title: String, depth: Int)?
        }
        var paras: [Para] = []
        for line in lines {
            var t = Normalize.normalizeChars(line)
            var h: (title: String, depth: Int)?
            if let g = groups(heading, t) {
                h = (g[1], depthOf[g[2]] ?? 0)
            } else if let g = groups(headingBlock, t) {
                h = (trim(replaceAll(rubyNotation, replaceAll(notes, g[2]))), depthOf[g[1]] ?? 0)
            }
            t = trimEnd(trimIndent(replaceAll(notes, t)))
            if t.isEmpty { continue }
            paras.append(Para(text: t, heading: h))
        }

        // 空行で段落を区切る形式（1 段落が複数行にまたがる）なら、行をつなぐ
        // 判定: 句読点で終わらない行が多く、空行が多い
        let nonEmpty = lines.filter { !trim($0).isEmpty }.count
        let blank = lines.count - nonEmpty
        let openEnded = paras.filter { p in !(JS.units(p.text).last.map { paraEnds.contains($0) } ?? false) }.count
        if Double(blank) > Double(nonEmpty) * 0.3, Double(openEnded) > Double(paras.count) * 0.5 {
            var joined: [Para] = []
            var cur: Para?
            for line in lines {
                let t = trim(replaceAll(notes, Normalize.normalizeChars(line)))
                if t.isEmpty {
                    if let c = cur { joined.append(c) }
                    cur = nil
                } else if cur != nil {
                    cur!.text += t
                } else {
                    cur = Para(text: t, heading: nil)
                }
            }
            if let c = cur { joined.append(c) }
            paras = joined
        }

        // 仮のページに分ける
        var pages: [String] = []
        var toc: [TocEntry] = []
        var cur: [String] = []
        var size = 0
        for p in paras {
            if size >= pageChars || (p.heading != nil && !cur.isEmpty && p.heading!.depth == 0) {
                pages.append(cur.joined(separator: "\n"))
                cur = []
                size = 0
            }
            if let h = p.heading { toc.append(TocEntry(title: h.title, page: pages.count, depth: h.depth)) }
            cur.append(p.text)
            size += p.text.utf16.count
        }
        if !cur.isEmpty { pages.append(cur.joined(separator: "\n")) }
        return ParsedText(title: title, author: author, pages: pages, toc: toc)
    }
}
