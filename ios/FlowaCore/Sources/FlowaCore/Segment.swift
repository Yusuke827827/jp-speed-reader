// 本文を、高速読書で 1 回に表示する単位（Chunk）に分ける（src/lib/segment.ts の移植）。
//
// 1. 段落を文に分ける（。！？ と、それに続く閉じ括弧で区切る。欧文はピリオドでも区切る）
// 2. 日本語の文を BudouX で文節相当の単位に分け、欧文の文は単語に分ける
// 3. モードに合わせて、短い単位はつなぎ、長い単位は字種の境目で切る
//
// Web 版と同じ結果になるよう、文字列は UTF-16 の並び（[UInt16]）で扱う。位置もすべて UTF-16 の単位。

public enum ChunkMode: String, CaseIterable, Sendable {
    case char
    case short
    case bunsetsu
    case phrase
    case sentence
}

public struct SegmentOptions: Sendable {
    public var mode: ChunkMode
    /// フレーズモードの目標文字数
    public var phraseTarget: Int
    /// これより短い単位は、同じ文の隣の単位とつなぐ（1 なら何もしない）
    public var minChars: Int
    /// 途中で切らない語（人物名など）
    public var names: [String]

    public init(mode: ChunkMode, phraseTarget: Int = 7, minChars: Int = 1, names: [String] = []) {
        self.mode = mode
        self.phraseTarget = phraseTarget
        self.minChars = minChars
        self.names = names
    }
}

public enum Segmenter {
    static let open = JS.set("「『（(【〈《〔［[｛{“‘")
    static let close = JS.set("」』）)】〉》〕］]｝}”’")
    static let sentEnd = JS.set("。！？!?．")
    static let comma = JS.set("、，,")
    /// 句読点・閉じ括弧など、行頭に来てはいけない文字
    static let noStart: Set<UInt16> = close.union(sentEnd).union(comma).union(JS.set("・：:；;ー～〜ゃゅょっぁぃぅぇぉャュョッァィゥェォ々ヽヾゝゞ…‥―"))
    /// 欧文で、ピリオドが付いても文の終わりではない略語（小文字で比べる）
    static let abbreviations: Set<String> = [
        "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "mt", "vs", "etc", "fig", "figs", "eq", "eqs", "no", "nos",
        "vol", "vols", "pp", "p", "al", "cf", "approx", "inc", "ltd", "co", "corp", "dept", "univ", "ed", "eds",
        "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "sec", "ch", "ref", "refs",
    ]
    static let dot = UInt16(UInt8(ascii: "."))
    /// 引用符・閉じ括弧（欧文の文末の判定で、空白と同じく読み飛ばす）
    static let quoteClose = JS.set("\"'’”)]")
    static let apostrophes = JS.set("’'")

    // MARK: - 文の分割

    /// text[i] の「.」が欧文の文の終わりか。略語・頭文字・小数・次が小文字のものは除く
    static func isLatinSentenceEnd(_ t: U16, _ i: Int) -> Bool {
        if i + 1 < t.count, !(JS.isSpace(t[i + 1]) || quoteClose.contains(t[i + 1])) { return false } // 小数（12.5）や e.g の途中
        var w = i
        while w > 0, JS.isAsciiLetter(t[w - 1]) || t[w - 1] == dot { w -= 1 }
        let word = Array(t[w..<i])
        if !word.contains(where: JS.isAsciiLetter) { return i > 0 && JS.isAsciiDigit(t[i - 1]) } // 数字の後（1999.）は文末
        if word.contains(dot) { return false } // e.g. / p.m. / U.S.
        if word.count == 1, (0x41...0x5A).contains(word[0]) { return false } // 頭文字（J. R. Tolkien）
        if abbreviations.contains(JS.string(word).lowercased()) { return false }
        // 次の文が小文字で始まるなら文の途中
        var k = i + 1
        while k < t.count, JS.isSpace(t[k]) || quoteClose.contains(t[k]) { k += 1 }
        if k >= t.count { return true }
        return !JS.isAsciiLower(t[k])
    }

    /// 英単語の中のアポストロフィ（don’t）は閉じ括弧として数えない
    static func isApostrophe(_ t: U16, _ i: Int) -> Bool {
        apostrophes.contains(t[i]) && i > 0 && JS.isAsciiLetter(t[i - 1]) && i + 1 < t.count && JS.isAsciiLetter(t[i + 1])
    }

    /// 段落を文に分ける。返り値は [開始, 終了) の組（UTF-16 の位置）
    public static func splitSentences(_ text: String) -> [[Int]] { splitSentences(units: JS.units(text)) }

    static func splitSentences(units t: U16) -> [[Int]] {
        var out: [[Int]] = []
        var start = 0
        var depth = 0
        var i = 0
        let n = t.count
        while i < n {
            let c = t[i]
            if open.contains(c) { depth += 1 } else if close.contains(c), !isApostrophe(t, i) { depth = max(0, depth - 1) }
            // 閉じ括弧は、直後に次の会話が始まるときだけ文の区切りにする（「…」と言った、は 1 文）。
            // Web 版は末尾で OPEN.includes('') が真になるので、末尾の閉じ括弧も区切りになる
            let nextIsOpen = i + 1 >= n || open.contains(t[i + 1])
            let closesBeforeOpen = depth == 0 && close.contains(c) && nextIsOpen
            if sentEnd.contains(c) || closesBeforeOpen || (c == dot && isLatinSentenceEnd(t, i)) {
                // 続く記号（！？、閉じ括弧）も同じ文に含める
                var j = i + 1
                while j < n, sentEnd.contains(t[j]) || close.contains(t[j]) {
                    if close.contains(t[j]) { depth = max(0, depth - 1) }
                    j += 1
                }
                // 括弧の中の句点（「…。と言った」）では文を切らない
                if depth == 0 {
                    out.append([start, j])
                    start = j
                }
                i = j
                continue
            }
            i += 1
        }
        if start < n { out.append([start, n]) }
        return out.filter { !JS.trim(t[$0[0]..<$0[1]]).isEmpty }
    }

    // MARK: - 字種と切れ目

    enum Kind { case kanji, hira, kata, alnum, punct, other }

    static let alnumMarks = JS.set(".,．，%％")
    static let punctMarks = JS.set("、。，．！？!?「」『』（）()…‥―・：；")

    /// 1 文字（UTF-16 の 1 単位。サロゲートペアは other）の字種
    static func kindOf(_ c: UInt16) -> Kind {
        switch c {
        case 0x4E00...0x9FFF, 0x3400...0x4DBF, 0x3005, 0x3006, 0x30F6: return .kanji
        case 0x3041...0x309F: return .hira
        case 0x30A0...0x30FF: return .kata
        default: break
        }
        if JS.isAsciiDigit(c) || JS.isAsciiLetter(c) || (0xFF10...0xFF19).contains(c) || (0xFF21...0xFF3A).contains(c) || (0xFF41...0xFF5A).contains(c) || alnumMarks.contains(c) {
            return .alnum
        }
        if punctMarks.contains(c) { return .punct }
        return .other
    }

    /// for...of の 1 文字（コードポイント）の字種。2 単位のものは正規表現に当たらないので other
    static func kindOf(codePoint cp: U16) -> Kind { cp.count == 1 ? kindOf(cp[0]) : .other }

    static func isGlue(_ c: UInt16) -> Bool { c == 0x2026 || c == 0x2025 || c == 0x2015 || c == 0x2014 } // … ‥ ― —

    /// 文字列中で切ってよい位置か（i の直前で切る）
    static func canBreakAt(_ s: U16, _ i: Int) -> Bool {
        if i <= 0 || i >= s.count { return false }
        let a = s[i - 1]
        let b = s[i]
        if noStart.contains(b) { return false }
        if open.contains(a) { return false }
        if kindOf(a) == .alnum, kindOf(b) == .alnum { return false }
        if isGlue(a), isGlue(b) { return false }
        return true
    }

    /// i 番目までに空白以外の文字が n 個になる位置（UTF-16 の 1 単位ずつ数える）
    static func nthVisibleIndex(_ s: U16, _ n: Int) -> Int {
        var count = 0
        for i in 0..<s.count {
            if !JS.isSpace(s[i]) { count += 1 }
            if count == n { return i + 1 }
        }
        return s.count
    }

    /// 長い単位を max 文字以内に切る。字種の境目を優先する
    static func splitLong(_ s: U16, _ max: Int) -> [U16] {
        var out: [U16] = []
        var rest = s
        // 少しだけ超える程度なら、切って短い切れ端を作るより 1 単位のまま表示する
        while JS.visible(rest) > max + min(3, max / 4) {
            var best = -1
            var bestScore = Int.min
            var i = 1
            while i < rest.count {
                if JS.visible(rest[0..<i]) > max { break }
                if !canBreakAt(rest, i) {
                    i += 1
                    continue
                }
                let a = kindOf(rest[i - 1])
                let b = kindOf(rest[i])
                // 後ろに寄せたいので長さを点数に足し、字種が変わる位置を優遇する。
                // ひらがなの途中（「しまし｜た」など）と、3 字未満の切れ端が残る位置は避ける
                var score = i
                if a != b { score += 4 }
                if comma.contains(rest[i - 1]) { score += 8 }
                if a == .hira, b == .kanji { score += 2 }
                if a == .hira, b == .hira { score -= 8 }
                if JS.visible(rest[i...]) < 3 { score -= 12 }
                if score > bestScore {
                    bestScore = score
                    best = i
                }
                i += 1
            }
            if best <= 0 {
                // max までに切れる場所がない（長い「……」「――」「ーーー」や数字列）。
                // 記号の連なりを途中で切らないよう、max を超えて最初に切ってよい位置まで伸ばす。無ければ全部を 1 単位にする
                best = rest.count
                var k = nthVisibleIndex(rest, max)
                while k < rest.count {
                    if canBreakAt(rest, k) {
                        best = k
                        break
                    }
                    k += 1
                }
            }
            out.append(Array(rest[0..<best]))
            rest = Array(rest[best...])
        }
        if !rest.isEmpty { out.append(rest) }
        return out
    }

    // MARK: - 単位の作り方

    /// 1 文字ずつ。ただし句読点・閉じ括弧・小書き文字は前に、開き括弧は後ろにつける
    static func splitChars(_ s: U16) -> [U16] {
        var out: [U16] = []
        var pendingOpen: U16 = []
        for c in JS.codePoints(s) {
            if c.count == 1, JS.isSpace(c[0]) { continue }
            if c.count == 1, open.contains(c[0]) {
                pendingOpen += c
                continue
            }
            let prevIsAlnum = !out.isEmpty && kindOf(out[out.count - 1].last!) == .alnum
            let isNoStart = c.count == 1 && noStart.contains(c[0])
            if !out.isEmpty, pendingOpen.isEmpty, isNoStart || (prevIsAlnum && kindOf(codePoint: c) == .alnum) {
                out[out.count - 1] += c
            } else {
                out.append(pendingOpen + c)
                pendingOpen = []
            }
        }
        if !pendingOpen.isEmpty {
            if out.isEmpty { out.append(pendingOpen) } else { out[out.count - 1] += pendingOpen }
        }
        return out
    }

    /// BudouX で分け、句読点だけ・閉じ括弧だけの断片を前に寄せる
    static func phrasesOf(_ sentence: U16) -> [U16] {
        var raw: [U16] = []
        if !sentence.isEmpty {
            var start = 0
            for b in BudouXParser.japanese.parseBoundaries(units: sentence) + [sentence.count] {
                raw.append(Array(sentence[start..<b]))
                start = b
            }
        }
        var out: [U16] = []
        var carry: U16 = [] // 前の文節の末尾にあった開き括弧（次の文節の頭へ移す）
        for piece in raw {
            var p = carry + piece
            carry = []
            // 文節の頭に来た閉じ括弧・句読点・「!!」などは、前の文節の末尾へ移す
            if !out.isEmpty {
                var k = 0
                while k < p.count, noStart.contains(p[k]) || JS.isSpace(p[k]) { k += 1 }
                if k > 0 {
                    out[out.count - 1] += p[0..<k]
                    p = Array(p[k...])
                }
            }
            // 文節の末尾に来た開き括弧は、次の文節の頭へ移す
            var e = p.count
            while e > 0, open.contains(p[e - 1]) { e -= 1 }
            if e < p.count, e > 0 {
                carry = Array(p[e...])
                p = Array(p[0..<e])
            }
            if !p.isEmpty { out.append(p) }
        }
        if !carry.isEmpty {
            if out.isEmpty { out.append(carry) } else { out[out.count - 1] += carry }
        }
        return out
    }

    /// 欧文が主の文か（空白以外の文字の半分以上がラテン文字）
    public static func isLatinText(_ s: String) -> Bool { isLatinText(units: JS.units(s)) }

    static func isLatinText(units s: U16) -> Bool {
        let letters = s.filter { !JS.isSpace($0) }
        if letters.isEmpty { return false }
        let latin = letters.filter { JS.isAsciiLetter($0) || (0x00C0...0x024F).contains($0) }.count
        return latin * 2 >= letters.count
    }

    /// 欧文の文を単語に分ける。単語の後ろの空白は単語に含める（/\S+\s*/g）
    static func wordsOf(_ s: U16) -> [U16] {
        var out: [U16] = []
        var i = 0
        while i < s.count {
            if JS.isSpace(s[i]) {
                i += 1
                continue
            }
            var j = i
            while j < s.count, !JS.isSpace(s[j]) { j += 1 }
            while j < s.count, JS.isSpace(s[j]) { j += 1 }
            out.append(Array(s[i..<j]))
            i = j
        }
        return out
    }

    /// 区切りの直前の文字（と、その前の文字）が条件に合う位置で分ける（後読みの split と同じ）
    static func splitAfter(_ s: U16, _ shouldSplit: (U16, Int) -> Bool) -> [U16] {
        var out: [U16] = []
        var start = 0
        if s.count > 1 {
            for k in 1..<s.count where shouldSplit(s, k) {
                out.append(Array(s[start..<k]))
                start = k
            }
        }
        out.append(Array(s[start...]))
        return out
    }

    /// 欧文の文をモードに応じて分ける。単語の途中では切らない
    static func segmentLatin(_ sentence: U16, _ opts: SegmentOptions) -> [U16] {
        let words = wordsOf(sentence)
        switch opts.mode {
        case .char, .short:
            return words
        case .bunsetsu:
            // 1 文字の語（a, I）は次の語とつなぐ
            return joinUpTo(words, 2, 16)
        case .phrase:
            // 目標文字数は日本語の 1 文字を欧文の 2 文字とみなす（7 字 → 14 字、2〜3 語）
            let target = max(8, opts.phraseTarget * 2)
            return joinUpTo(words, target, JS.round(Double(target) * 1.6))
        case .sentence:
            let maxLen = 80
            if JS.visible(sentence) <= maxLen { return [sentence] }
            let clauseMarks = JS.set(",;:")
            let clauses = splitAfter(sentence) { s, k in k >= 2 && JS.isSpace(s[k - 1]) && clauseMarks.contains(s[k - 2]) }
            return clauses.flatMap { c in JS.visible(c) <= maxLen ? [c] : joinUpTo(wordsOf(c), 40, 60) }
        }
    }

    static let hardEnds = JS.set("、，,」』）)")

    static func joinUpTo(_ parts: [U16], _ target: Int, _ maxLen: Int) -> [U16] {
        var out: [U16] = []
        var cur: U16 = []
        for p in parts {
            let curLen = JS.visible(cur)
            let pLen = JS.visible(p)
            let trimmed = JS.trimEnd(cur)
            let endsHard = trimmed.last.map { hardEnds.contains($0) } ?? false
            let startsDialogue = p.first.map { open.contains($0) } ?? false
            if !cur.isEmpty, curLen + pLen > maxLen || curLen >= target || endsHard || startsDialogue {
                out.append(cur)
                cur = p
            } else {
                cur += p
            }
        }
        if !cur.isEmpty { out.append(cur) }
        return out
    }

    /// 1 文をモードに応じて分ける
    public static func segmentSentence(_ sentence: String, _ opts: SegmentOptions) -> [String] {
        segmentSentence(units: JS.units(sentence), opts).map { JS.string($0) }
    }

    static func segmentSentence(units sentence: U16, _ opts: SegmentOptions) -> [U16] {
        if isLatinText(units: sentence) { return segmentLatin(sentence, opts) }
        switch opts.mode {
        case .char:
            return splitChars(sentence)
        case .short:
            return joinUpTo(phrasesOf(sentence).flatMap { splitLong($0, 4) }, 2, 4)
        case .bunsetsu:
            // 1 文字だけの文節は次とつなぐ
            return joinUpTo(phrasesOf(sentence).flatMap { splitLong($0, 12) }, 2, 12)
        case .phrase:
            let target = max(4, opts.phraseTarget)
            let maxLen = JS.round(Double(target) * 1.6)
            return joinUpTo(phrasesOf(sentence).flatMap { splitLong($0, maxLen) }, target, maxLen)
        case .sentence:
            let maxLen = 28
            if JS.visible(sentence) <= maxLen { return [sentence] }
            // 読点で節に分け、それでも長ければ文節でつなぎ直す
            let clauses = splitAfter(sentence) { s, k in comma.contains(s[k - 1]) }
            return clauses.flatMap { c in
                JS.visible(c) <= maxLen ? [c] : joinUpTo(phrasesOf(c).flatMap { splitLong($0, 16) }, 16, 20)
            }
        }
    }

    // MARK: - 1 冊分

    static let pauseStrip = JS.set("」』）)]】〉》\"”’")
    static let sentenceMarks = JS.set("。！？!?．")
    static let commaMarks = JS.set("、，,…―")
    static let quoteEnds = JS.set("」』")

    static func pauseOf(_ text: U16, isLastInPara: Bool, endsSentence: Bool) -> Pause {
        if isLastInPara { return .paragraph }
        var e = text.count
        while e > 0, pauseStrip.contains(text[e - 1]) || JS.isSpace(text[e - 1]) { e -= 1 }
        let t = text[0..<e]
        if let last = t.last, sentenceMarks.contains(last) { return .sentence }
        // 欧文のピリオドは略語（Dr. など）にも付くので、文の最後の単位のときだけ文の間にする
        if endsSentence, t.last == dot { return .sentence }
        if let last = JS.trim(text).last, quoteEnds.contains(last) { return .sentence }
        if let last = t.last, commaMarks.contains(last) { return .comma }
        return .none
    }

    /// 本文中の語の出現位置 [開始, 終了)。長い語を優先し、重なる出現は数えない
    static func findTerms(_ text: U16, _ terms: [String]) -> [(Int, Int)] {
        var seen = Set<String>()
        var unique: [U16] = []
        for t in terms where !t.isEmpty && !seen.contains(t) {
            seen.insert(t)
            unique.append(JS.units(t))
        }
        // 長い語を先に（同じ長さなら元の順。Array.sort は安定）
        let sorted = unique.enumerated().sorted { $0.element.count != $1.element.count ? $0.element.count > $1.element.count : $0.offset < $1.offset }.map(\.element)
        var out: [(Int, Int)] = []
        for t in sorted {
            var i = JS.indexOf(text, t)
            while i >= 0 {
                let e = i + t.count
                if !out.contains(where: { $0.0 < e && i < $0.1 }) { out.append((i, e)) }
                i = JS.indexOf(text, t, from: e)
            }
        }
        return out.enumerated().sorted { $0.element.0 != $1.element.0 ? $0.element.0 < $1.element.0 : $0.offset < $1.offset }.map(\.element)
    }

    struct Piece {
        var text: U16
        var start: Int
        var end: Int
    }

    /// 隣り合う単位をつなぐ。文字列は元の段落から取り直す（英語の単語の間の空白を残すため）
    static func joinPieces(_ source: U16, _ a: Piece, _ b: Piece) -> Piece {
        Piece(text: JS.trim(source[a.start..<b.end]), start: a.start, end: b.end)
    }

    static func countWords(_ s: U16) -> Int {
        var n = 0
        var inWord = false
        for c in s {
            if JS.isSpace(c) { inWord = false } else if !inWord {
                n += 1
                inWord = true
            }
        }
        return n
    }

    /// 1 冊分を単位に分ける
    public static func segmentBook(_ paragraphs: [Paragraph], _ opts: SegmentOptions) -> [Chunk] {
        var chunks: [Chunk] = []
        var sentenceEnds = Set<Int>()
        let minChars = max(1, opts.minChars)
        for (pi, para) in paragraphs.enumerated() {
            if para.illust != nil {
                chunks.append(Chunk(para: pi, len: 0, illust: true))
                continue
            }
            let text = JS.units(para.text)
            let nameRanges = opts.names.isEmpty ? [] : findTerms(text, opts.names)
            // ルビの親文字と人物名は途中で切らない
            let protect = para.ruby.map { ($0.start, $0.end) } + nameRanges
            func cutsInside(_ pos: Int) -> Bool { protect.contains { $0.0 < pos && pos < $0.1 } }

            for range in splitSentences(units: text) {
                let a = range[0]
                let b = range[1]
                let sentence = Array(text[a..<b])
                let latin = isLatinText(units: sentence)
                let pieces = segmentSentence(units: sentence, opts)
                // 元の文字位置を求めるため、元の文の中で順に探す（空白は分割時に落ちている場合がある）
                var local: [Piece] = []
                var cursor = a
                for piece in pieces {
                    let trimmed = JS.trim(piece)
                    if trimmed.isEmpty { continue }
                    let found = JS.indexOf(text, [trimmed[0]], from: cursor)
                    let start = found >= 0 && found < b ? found : cursor
                    let end = min(b, max(start + piece.count, start + 1))
                    local.append(Piece(text: trimmed, start: start, end: end))
                    cursor = end
                }
                // 保護範囲の途中で切れていれば、次の単位とつなぐ
                var i = 0
                while i < local.count - 1 {
                    if cutsInside(local[i].end) {
                        local.replaceSubrange(i...(i + 1), with: [joinPieces(text, local[i], local[i + 1])])
                    } else {
                        i += 1
                    }
                }
                // 最小字数に満たない単位は、同じ文の次の単位（文末なら前の単位）とつなぐ
                if minChars > 1 {
                    var merged: [Piece] = []
                    for p in local {
                        if let prev = merged.last, JS.visible(prev.text) < minChars {
                            merged[merged.count - 1] = joinPieces(text, prev, p)
                        } else {
                            merged.append(p)
                        }
                    }
                    if merged.count >= 2, let last = merged.last, JS.visible(last.text) < minChars {
                        let joined = joinPieces(text, merged[merged.count - 2], last)
                        merged.removeLast(2)
                        merged.append(joined)
                    }
                    local = merged
                }
                for p in local {
                    let name = nameRanges.contains { $0.0 < p.end && p.start < $0.1 }
                    chunks.append(Chunk(
                        text: JS.string(p.text), para: pi, start: p.start, end: p.end, pause: .none,
                        len: JS.visible(p.text), words: latin ? countWords(p.text) : nil, name: name
                    ))
                }
                if !local.isEmpty { sentenceEnds.insert(chunks.count - 1) }
            }
            var i = chunks.count - 1
            while i >= 0, chunks[i].para == pi {
                chunks[i].pause = pauseOf(JS.units(chunks[i].text), isLastInPara: i == chunks.count - 1, endsSentence: sentenceEnds.contains(i))
                i -= 1
            }
        }
        return chunks
    }

    /// 欧文の本か（挿絵を除く単位の半分以上が単語単位）。速度を語/分で扱うかの判定に使う
    public static func isLatinBook(_ chunks: [Chunk]) -> Bool {
        var latin = 0
        var all = 0
        for c in chunks where !c.illust {
            all += 1
            if c.words != nil { latin += 1 }
        }
        return all > 0 && latin * 2 >= all
    }

    /// 本文の位置を含む（なければその後の最初の）単位の番号
    public static func chunkIndexAt(_ chunks: [Chunk], _ pos: TextPosition) -> Int {
        var lo = 0
        var hi = chunks.count - 1
        var ans = chunks.count - 1
        while lo <= hi {
            let mid = (lo + hi) >> 1
            let c = chunks[mid]
            if c.para > pos.para || (c.para == pos.para && c.end > pos.offset) {
                ans = mid
                hi = mid - 1
            } else {
                lo = mid + 1
            }
        }
        return max(0, ans)
    }

    /// 単位が含まれる段落の、最初の単位の番号
    public static func paragraphStartIndex(_ chunks: [Chunk], _ index: Int) -> Int {
        guard chunks.indices.contains(index) else { return index }
        let p = chunks[index].para
        var i = index
        while i > 0, chunks[i - 1].para == p { i -= 1 }
        return i
    }
}
