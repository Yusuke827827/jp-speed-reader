// PDF のテキスト断片（座標つき）から、行と段落を復元する（src/lib/layout.ts の移植）。
// 横書き・縦書きの両方を扱う。PDF の座標系は y が上向き。
//
// Web 版と同じ結果になるよう、計算の順番を変えずに Double で行い、並べ替えは安定にする
// （JavaScript の Array.prototype.sort は安定）。文字列の位置は UTF-16 の単位。

import Foundation

/// PDF のテキスト断片
public struct RawItem: Equatable, Sendable {
    public var str: String
    /// 左下 x
    public var x: Double
    /// 左下 y（ベースライン）
    public var y: Double
    public var w: Double
    public var h: Double
    /// フォントサイズ相当
    public var size: Double
    public var vertical: Bool

    public init(str: String, x: Double, y: Double, w: Double, h: Double, size: Double, vertical: Bool) {
        self.str = str
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.size = size
        self.vertical = vertical
    }

    var strLength: Int { str.utf16.count }
    var trimmedLength: Int { JS.trim(JS.units(str)).count }
}

public struct Line: Sendable {
    public var text: String
    /// 行の開始位置（横書きなら x、縦書きなら上端からの距離）
    public var start: Double
    /// 行の終端位置
    public var end: Double
    /// 行の並び方向の位置（横書きなら y、縦書きなら x）
    public var cross: Double
    public var size: Double
    /// text の各文字（UTF-16 の単位）の位置 [開始, 終了)。ルビの親文字を探すのに使う
    public var chars: [[Double]]
    /// 段組みのページでの段の番号（0 から）。段組みでなければ nil
    public var column: Int?
}

public struct PageText: Equatable, Sendable {
    /// 段落を \n で区切った本文
    public var text: String
    /// 先頭の段落が前ページから続いているか
    public var contFromPrev: Bool
    public var vertical: Bool
}

public struct PageLines: Sendable {
    public var lines: [Line]
    public var vertical: Bool
}

extension Array {
    /// 安定な並べ替え（JavaScript の Array.prototype.sort と同じく、同じ順位の要素は元の順に並ぶ）
    func stableSorted(by less: (Element, Element) -> Bool) -> [Element] {
        enumerated().sorted { a, b in
            if less(a.element, b.element) { return true }
            if less(b.element, a.element) { return false }
            return a.offset < b.offset
        }.map(\.element)
    }
}

public enum Layout {
    // MARK: - 小さな道具

    public static func median(_ xs: [Double]) -> Double {
        if xs.isEmpty { return 0 }
        let s = xs.stableSorted { $0 < $1 }
        let m = s.count >> 1
        return s.count % 2 == 1 ? s[m] : (s[m - 1] + s[m]) / 2
    }

    /// JavaScript の `x || 10`（0 なら既定値）
    static func orDefault(_ x: Double, _ d: Double) -> Double { x == 0 || x.isNaN ? d : x }

    // MARK: - 向きの判定

    /// 縦書きか横書きかを決める。断片の形（縦長・横長）で 3 倍以上の差があればそれに従う。
    /// 決まらないときは、縦・横の両方で行をまとめてみて、行の中の文字の間隔が 1 文字分に近い方を選ぶ
    public static func detectVertical(_ items: [RawItem]) -> Bool {
        var v = 0
        var h = 0
        for it in items {
            let n = it.trimmedLength
            if n < 2 { continue } // 1 文字の断片は形から向きが分からない
            if it.vertical || it.h > it.w * 1.5 { v += n } else { h += n }
        }
        if v + h >= 20, v >= h * 3 || h >= v * 3 { return v > h }
        let pv = linePitch(items, vertical: true)
        let ph = linePitch(items, vertical: false)
        if let pv, let ph {
            func off(_ p: Double) -> Double { abs(log(max(p, 0.01))) }
            if abs(off(pv) - off(ph)) > 0.1 { return off(pv) < off(ph) }
        }
        if v + h >= 20 { return v > h }
        // 1 文字ずつ配置された PDF: すぐ下に次の文字がある断片と、すぐ右にある断片の数を比べる
        return neighborVotes(items) > 0
    }

    /// その向きで行をまとめたときの、行の中で隣り合う文字の間隔の中央値（文字の大きさに対する比）
    static func linePitch(_ items: [RawItem], vertical: Bool) -> Double? {
        let lines = groupLines(splitSmallItems(items).body, vertical: vertical)
        var gaps: [Double] = []
        for l in lines {
            let cs = l.chars
            if cs.count > 1 {
                for i in 1..<cs.count { gaps.append((cs[i][0] - cs[i - 1][0]) / orDefault(l.size, 1)) }
            }
        }
        return gaps.count >= 10 ? median(gaps) : nil
    }

    static func neighborVotes(_ items: [RawItem]) -> Int {
        var singles = items.filter { $0.trimmedLength > 0 }
        if singles.count > 800 { singles = Array(singles[0..<800]) } // 数が多いページは先頭だけで十分
        var vote = 0
        for (ai, a) in singles.enumerated() {
            let s = orDefault(a.size, 10)
            for (bi, b) in singles.enumerated() where ai != bi {
                let dx = b.x - a.x
                let dy = a.y - b.y // 下にあれば正
                if abs(dx) < s * 0.3, dy > s * 0.5, dy < s * 1.6 { vote += 1 } else if abs(dy) < s * 0.3, dx > s * 0.5, dx < s * 1.6 { vote -= 1 }
            }
        }
        return vote
    }

    /// ルビや小さな柱など、本文より明らかに小さい文字を分ける
    static func splitSmallItems(_ items: [RawItem]) -> (body: [RawItem], small: [RawItem], bodySize: Double) {
        var sizes: [Double] = []
        for it in items { for _ in 0..<it.strLength { sizes.append(it.size) } }
        let bodySize = median(sizes)
        if bodySize == 0 { return (items, [], bodySize) }
        var body: [RawItem] = []
        var small: [RawItem] = []
        for it in items { if it.size >= bodySize * 0.62 { body.append(it) } else { small.append(it) } }
        return (body, small, bodySize)
    }

    // MARK: - 行の組み立て

    static func crossOf(_ it: RawItem, _ vertical: Bool) -> Double { vertical ? it.x + it.w / 2 : it.y }
    static func posOf(_ it: RawItem, _ vertical: Bool) -> Double { vertical ? -(it.y + it.h) : it.x }
    static func endOf(_ it: RawItem, _ vertical: Bool) -> Double { vertical ? -it.y : it.x + it.w }

    /// 断片を行にまとめる
    public static func groupLines(_ items: [RawItem], vertical: Bool) -> [Line] {
        let body = orDefault(median(items.map(\.size)), 10)
        // 縦書き: 列は x、列内は y の降順（上から下）。横書き: 行は y、行内は x の昇順
        let sorted = items.stableSorted { crossOf($0, vertical) > crossOf($1, vertical) }
        // 列（行）の平均位置と比べ、許容幅を 0.6 文字分とる
        var groups: [(items: [RawItem], sum: Double)] = []
        let tol = body * 0.6
        for it in sorted {
            let c = crossOf(it, vertical)
            if let gi = groups.firstIndex(where: { abs($0.sum / Double($0.items.count) - c) <= tol }) {
                groups[gi].items.append(it)
                groups[gi].sum += c
            } else {
                groups.append(([it], c))
            }
        }
        // 横書きは上から、縦書きは右から並べる（どちらも cross の降順）
        groups = groups.stableSorted { $0.sum / Double($0.items.count) > $1.sum / Double($1.items.count) }

        return groups.map { group -> Line in
            let g = group.items.stableSorted { posOf($0, vertical) < posOf($1, vertical) }
            var text = ""
            var prevEnd = -Double.infinity
            var chars: [[Double]] = []
            for it in g {
                let gap = posOf(it, vertical) - prevEnd
                // 横書きの欧文で単語間が空いているときだけ空白を補う
                if !vertical, !text.isEmpty, gap > body * 0.15, Lines.latinSpaceBetween(text, it.str) {
                    text += " "
                    chars.append([prevEnd, posOf(it, vertical)])
                }
                // 複数文字の断片は、文字ごとの位置を等分で見積もる
                let n = it.strLength
                let a = posOf(it, vertical)
                let step = (endOf(it, vertical) - a) / Double(max(1, n))
                for k in 0..<n { chars.append([a + step * Double(k), a + step * Double(k + 1)]) }
                text += it.str
                prevEnd = max(prevEnd, endOf(it, vertical))
            }
            var crossSum = 0.0
            for it in g { crossSum += crossOf(it, vertical) }
            return Line(
                text: text,
                start: g.map { posOf($0, vertical) }.min() ?? .infinity,
                end: g.map { endOf($0, vertical) }.max() ?? -.infinity,
                cross: crossSum / Double(g.count),
                size: median(g.map(\.size)),
                chars: chars,
                column: nil
            )
        }.filter { !JS.trim(JS.units($0.text)).isEmpty }
    }

    /// /^[ぁ-ヿー・]+$/
    static func isKanaRun(_ u: U16) -> Bool { !u.isEmpty && u.allSatisfy { (0x3041...0x30FF).contains($0) } }

    /// 小さい文字の並びをルビとみなし、隣の行の親文字に結び付けて、行の本文をルビ記法
    /// （｜親文字《るび》）に書き換える。縦書きは列の右、横書きは行の上にあるものを探す。
    /// 結び付け先が見つからない小さい文字（柱など）は捨てる
    static func attachRuby(_ lines: inout [Line], _ small: [RawItem], vertical: Bool, bodySize: Double) {
        if small.isEmpty || lines.isEmpty { return }
        // 近接する小さい文字をひと続きにまとめる
        let sorted = small.stableSorted { a, b in
            let d1 = crossOf(b, vertical) - crossOf(a, vertical)
            return (d1 != 0 && !d1.isNaN ? d1 : posOf(a, vertical) - posOf(b, vertical)) < 0
        }
        var runs: [(cross: Double, s: Double, e: Double, text: String, size: Double)] = []
        for it in sorted {
            let c = crossOf(it, vertical)
            if let last = runs.last, abs(last.cross - c) < it.size * 0.6, posOf(it, vertical) - last.e < it.size * 1.6 {
                runs[runs.count - 1].text += it.str
                runs[runs.count - 1].e = max(last.e, endOf(it, vertical))
            } else {
                runs.append((c, posOf(it, vertical), endOf(it, vertical), it.str, it.size))
            }
        }

        var marks: [Int: [(start: Int, end: Int, text: String)]] = [:]
        for r in runs {
            let text = JS.units(r.text).filter { !JS.isSpace($0) }
            // ルビはかな・カタカナがほとんど。それ以外（ページ番号の数字など）は対象外
            if !isKanaRun(text) { continue }
            var best: Int?
            var bestD = Double.infinity
            for (li, l) in lines.enumerated() {
                let d = r.cross - l.cross // 縦書きなら右、横書きなら上が正
                if d > 0, d < bodySize * 1.4, d < bestD, r.e > l.start, r.s < l.end {
                    best = li
                    bestD = d
                }
            }
            guard let bi = best else { continue }
            let line = lines[bi]
            let pad = bodySize * 0.3
            var start = -1
            var end = -1
            for (i, ab) in line.chars.enumerated() {
                let mid = (ab[0] + ab[1]) / 2
                if mid >= r.s - pad, mid <= r.e + pad {
                    if start < 0 { start = i }
                    end = i + 1
                }
            }
            if start < 0 { continue }
            // 親文字の前後のかな（送り仮名など）は外す
            let lt = JS.units(line.text)
            if lt[start..<end].contains(where: Normalize.isKanjiNoCompat) {
                while start < end, !Normalize.isKanjiNoCompat(lt[start]) { start += 1 }
                while end > start, !Normalize.isKanjiNoCompat(lt[end - 1]) { end -= 1 }
            }
            var list = marks[bi] ?? []
            if !list.contains(where: { $0.start < end && start < $0.end }) { list.append((start, end, JS.string(text))) }
            marks[bi] = list
        }

        for (li, list) in marks {
            var t = JS.units(lines[li].text)
            for m in list.stableSorted(by: { $0.start > $1.start }) { // 後ろから書き換えて位置をずらさない
                t = Array(t[0..<m.start]) + JS.units("｜") + Array(t[m.start..<m.end]) + JS.units("《\(m.text)》") + Array(t[m.end...])
            }
            lines[li].text = JS.string(t)
        }
    }

    // MARK: - ページ番号・段落

    static let pageNumberEdge = JS.set("-–—－‐・[(（")
    static let pageNumberTail = JS.set("-–—－‐・])）")
    static let kanjiNumerals = JS.set("一二三四五六七八九十百〇")
    static let romanNumerals = JS.set("ivxlcdmIVXLCDM")

    /// /^[\s\-–—－‐・[(（]*([0-9０-９]+|[一二三四五六七八九十百〇]+|[ivxlcdmIVXLCDM]+)[\s\-–—－‐・\])）]*$/（前後の空白を除いてから）
    public static func isPageNumber(_ s: String) -> Bool {
        let u = JS.trim(JS.units(s))
        var i = 0
        while i < u.count, JS.isSpace(u[i]) || pageNumberEdge.contains(u[i]) { i += 1 }
        let classes: [(UInt16) -> Bool] = [
            { JS.isAsciiDigit($0) || (0xFF10...0xFF19).contains($0) },
            { kanjiNumerals.contains($0) },
            { romanNumerals.contains($0) },
        ]
        guard i < u.count, let cls = classes.first(where: { $0(u[i]) }) else { return false }
        while i < u.count, cls(u[i]) { i += 1 }
        while i < u.count, JS.isSpace(u[i]) || pageNumberTail.contains(u[i]) { i += 1 }
        return i == u.count
    }

    static let paraOpeners = JS.set("　「『（(【〈《〔［[―")
    static let sentenceEndMarks = JS.set("。！？!?」』）)…―")
    static let numberedHeading = try! NSRegularExpression(pattern: "^(?:[0-9]+(?:\\.[0-9]+)*|[A-Z])\\.?\\s+[A-Z][A-Za-z ,:&'-]{0,60}$")
    static let namedHeading = try! NSRegularExpression(
        pattern: "^(?:abstract|references|bibliography|acknowledge?ments?|appendix(?:\\s+[A-Z0-9]+)?|appendices|参考文献|引用文献|付録)$",
        options: [.caseInsensitive])

    static func matches(_ re: NSRegularExpression, _ s: String) -> Bool {
        re.firstMatch(in: s, range: NSRange(location: 0, length: (s as NSString).length)) != nil
    }

    /// /(?:[。！？!?」』）)…―]|[A-Za-z]\.)$/
    static func endsSentence(_ s: String) -> Bool {
        let u = JS.units(s)
        guard let last = u.last else { return false }
        if sentenceEndMarks.contains(last) { return true }
        return last == Segmenter.dot && u.count >= 2 && JS.isAsciiLetter(u[u.count - 2])
    }

    static func cleanLine(_ s: String) -> String {
        var u = JS.units(Normalize.stripNotes(Normalize.normalizeChars(s)))
        var i = 0
        while i < u.count, u[i] == 0x3000 || u[i] == 0x20 { i += 1 }
        u = Array(u[i...])
        while let last = u.last, last == 0x20 || last == 0x09 { u.removeLast() }
        return JS.string(u)
    }

    /// 行の列から段落を組み立て、ページ本文を作る（柱・ノンブルは除去済みの前提）
    public static func buildPageText(_ lines: [Line], vertical: Bool) -> PageText {
        // 本文の行だけで行頭・行末の基準を測る（短い行は除く）。段組みなら段ごとに測る
        let bodyLines = lines.filter { JS.trim(JS.units($0.text)).count >= 3 }
        var metrics: [Int?: (start: Double, end: Double)] = [:]
        for col in Set(lines.map(\.column)) {
            let ls = bodyLines.filter { $0.column == col }
            metrics[col] = (median(ls.map(\.start)), max(0, ls.map(\.end).max() ?? -.infinity))
        }
        let size = orDefault(median(bodyLines.map(\.size)), 10)

        var paras: [String] = []
        var cur = ""
        var contFromPrev = true
        var prevShort = false
        var prevSize = 0.0
        var afterHeading = false

        for l in lines {
            let t = cleanLine(l.text)
            if t.isEmpty { continue }
            let m = metrics[l.column]!
            let indented = l.start - m.start > size * 0.6
            // 字の大きさが前の行と変わる所（題名・著者・見出し）でも段落を分ける
            let resized = prevSize > 0 && abs(l.size - prevSize) > max(l.size, prevSize) * 0.08
            let short = m.end - l.end > size * 1.5
            let heading = matches(namedHeading, t) || (short && matches(numberedHeading, t))
            var raw = JS.units(l.text)
            while let first = raw.first, first == 0x20 || first == Normalize.bar { raw.removeFirst() }
            let opener = raw.first.map { paraOpeners.contains($0) } ?? false
            let startsPara = opener || indented || resized || heading || afterHeading

            if cur.isEmpty, paras.isEmpty {
                contFromPrev = !startsPara
                cur = t
            } else if startsPara || (prevShort && endsSentence(cur)) {
                paras.append(cur)
                cur = t
            } else {
                cur = Lines.joinLine(cur, t)
            }
            prevShort = short
            prevSize = l.size
            afterHeading = heading
        }
        if !cur.isEmpty { paras.append(cur) }
        if paras.isEmpty { contFromPrev = false }
        return PageText(text: paras.joined(separator: "\n"), contFromPrev: contFromPrev, vertical: vertical)
    }

    // MARK: - 段組み

    /// 横書きのページが左右 2 段に組まれていれば、段の境目の x を返す。
    /// 中央付近で、行をまたいで文字の無い縦の帯を探す。帯をまたぐ行（題名など）は全体の 15% まで許す
    public static func findColumnGutter(_ items: [RawItem]) -> Double? {
        if items.isEmpty { return nil }
        let size = orDefault(median(items.map(\.size)), 10)
        let minX = items.map(\.x).min()!
        let maxX = items.map { $0.x + $0.w }.max()!
        let width = maxX - minX
        if width < size * 20 { return nil }
        func lineKey(_ it: RawItem) -> Int { JS.round(it.y / (size * 0.6)) }
        let allLines = Set(items.map(lineKey)).count
        if allLines < 3 { return nil }
        var best: (g: Double, cross: Int)?
        var g = minX + width * 0.3
        while g <= minX + width * 0.7 {
            let crossLines = Set(items.filter { $0.x < g && $0.x + $0.w > g }.map(lineKey)).count
            if best == nil || crossLines < best!.cross { best = (g, crossLines) }
            g += size / 4
        }
        guard let b = best, Double(b.cross) <= Double(allLines) * 0.15 else { return nil }
        // 帯の両側に、ある程度の行数がなければ段組みではない（右側だけ短い詩の行など）
        let left = items.filter { $0.x + $0.w <= b.g }
        let right = items.filter { $0.x >= b.g }
        let leftLines = Set(left.map(lineKey)).count
        let rightLines = Set(right.map(lineKey)).count
        if leftLines < 3 || rightLines < 3 || Double(leftLines) < Double(allLines) * 0.25 || Double(rightLines) < Double(allLines) * 0.25 { return nil }
        // 帯の幅が 1 文字分以上あること
        let leftEdge = left.map { $0.x + $0.w }.max()!
        let rightEdge = right.map(\.x).min()!
        if rightEdge - leftEdge < size * 0.8 { return nil }
        return (leftEdge + rightEdge) / 2
    }

    /// 横書きの段組みを考えて行にまとめる。段をまたぐ行は、段より上なら先頭に、下なら末尾に置く
    static func groupLinesWithColumns(_ items: [RawItem]) -> [Line] {
        guard let g = findColumnGutter(items) else { return groupLines(items, vertical: false) }
        let span = items.filter { $0.x < g && $0.x + $0.w > g }
        let left = items.filter { $0.x + $0.w <= g }
        let right = items.filter { $0.x >= g }
        let top = (left + right).map { $0.y + $0.h }.max() ?? -.infinity
        func tag(_ ls: [Line], _ column: Int) -> [Line] { ls.map { var l = $0; l.column = column; return l } }
        return groupLines(span.filter { $0.y >= top }, vertical: false)
            + tag(groupLines(left, vertical: false), 0)
            + tag(groupLines(right, vertical: false), 1)
            + groupLines(span.filter { $0.y < top }, vertical: false)
    }

    // MARK: - ページ

    /// ページの断片 → 行
    public static func itemsToLines(_ items: [RawItem]) -> PageLines {
        let usable = items.filter { $0.trimmedLength > 0 }
        if usable.isEmpty { return PageLines(lines: [], vertical: false) }
        let vertical = detectVertical(usable)
        let (body, small, bodySize) = splitSmallItems(usable)
        var lines = vertical ? groupLines(body, vertical: true) : groupLinesWithColumns(body)
        attachRuby(&lines, small, vertical: vertical, bodySize: bodySize)
        return PageLines(lines: lines, vertical: vertical)
    }

    /// 本文の字の大きさ。文字数で重みを付けた最頻値（脚注や柱の多いページでも本文の大きさを返す）
    static func bodySizeOf(_ lines: [Line]) -> Double {
        var keys: [Double] = [] // Map の挿入順
        var count: [Double: Int] = [:]
        for l in lines {
            let k = Double(JS.round(l.size * 10)) / 10
            if count[k] == nil { keys.append(k) }
            count[k, default: 0] += l.text.utf16.count
        }
        var best = 0.0
        var bestN = -1
        for k in keys {
            let n = count[k]!
            if n > bestN || (n == bestN && k > best) {
                best = k
                bestN = n
            }
        }
        return best
    }

    /// 数字と空白を除いた文字列（柱の比較に使う）
    static func headerKey(_ s: String) -> String {
        JS.string(JS.units(s).filter { !(JS.isAsciiDigit($0) || (0xFF10...0xFF19).contains($0) || JS.isSpace($0)) })
    }

    /// 複数ページに共通する柱（ランニングヘッダー）とノンブルを除いてから、各ページの本文を作る。
    /// ページ端 2 行のうち、数字を除いた文字列が多くのページに現れるものを柱とみなす
    public static func linesToPageTexts(_ pages: [PageLines]) -> [PageText] {
        func edge(_ p: PageLines) -> [Int] {
            let n = p.lines.count
            var out: [Int] = []
            for i in [0, 1, n - 2, n - 1] where i >= 0 && i < n && !out.contains(i) { out.append(i) }
            return out
        }
        var counts: [String: Int] = [:]
        for p in pages {
            var keys: [String] = []
            for i in edge(p) {
                let k = headerKey(p.lines[i].text)
                if !keys.contains(k) { keys.append(k) }
            }
            for k in keys where !k.isEmpty { counts[k, default: 0] += 1 }
        }
        let threshold = max(3, Int((Double(pages.count) * 0.3).rounded(.up)))
        let headers = Set(counts.filter { $0.value >= threshold }.map(\.key))

        return pages.map { p in
            // 本文より明らかに小さい文字の端の行も柱とみなす（ページ数が少なく頻度で判定できない場合）
            let body = bodySizeOf(p.lines)
            var drop = Set(edge(p).filter { i in
                let l = p.lines[i]
                let t = JS.string(JS.trim(JS.units(l.text)))
                if isPageNumber(t) { return true }
                if t.utf16.count > 40 { return false }
                return headers.contains(headerKey(t)) || (body > 0 && l.size < body * 0.85)
            })
            // 横書きのページ（段組みなら各段）の下部で、本文より小さい字の行が続く部分は脚注とみなして除く
            if !p.vertical, body > 0 {
                var cols: [Int?] = []
                for l in p.lines where !cols.contains(where: { $0 == l.column }) { cols.append(l.column) }
                for col in cols {
                    let idx = p.lines.indices.filter { p.lines[$0].column == col }
                    for i in idx.reversed() {
                        if drop.contains(i) { continue }
                        if p.lines[i].size >= body * 0.88 { break }
                        drop.insert(i)
                    }
                }
            }
            return buildPageText(p.lines.enumerated().filter { !drop.contains($0.offset) }.map(\.element), vertical: p.vertical)
        }
    }
}
