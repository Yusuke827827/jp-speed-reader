// Web 版（JavaScript）の文字列の扱いを再現するための小さな道具。
// JavaScript の文字列の添字・長さ・slice は UTF-16 の単位なので、ここでは [UInt16] の上で処理する。
// for...of は「コードポイント」ごとに回る（サロゲートペアは 1 つ）ので、visible などはそれに合わせる。

typealias U16 = [UInt16]

enum JS {
    /// JavaScript の正規表現の \s（WhiteSpace と LineTerminator）。String.prototype.trim も同じ範囲
    static func isSpace(_ c: UInt16) -> Bool {
        switch c {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
            return true
        default:
            return false
        }
    }

    static func units(_ s: String) -> U16 { Array(s.utf16) }
    static func string<C: Collection>(_ u: C) -> String where C.Element == UInt16 { String(decoding: u, as: UTF16.self) }
    /// BMP の文字だけからなる文字列の、各文字の集合
    static func set(_ s: String) -> Set<UInt16> { Set(s.utf16) }

    static func isLead(_ c: UInt16) -> Bool { UTF16.isLeadSurrogate(c) }
    static func isTrail(_ c: UInt16) -> Bool { UTF16.isTrailSurrogate(c) }

    /// String.prototype.trim
    static func trim(_ u: ArraySlice<UInt16>) -> U16 {
        var s = u.startIndex
        var e = u.endIndex
        while s < e, isSpace(u[s]) { s += 1 }
        while e > s, isSpace(u[e - 1]) { e -= 1 }
        return Array(u[s..<e])
    }
    static func trim(_ u: U16) -> U16 { trim(u[...]) }

    /// String.prototype.trimEnd
    static func trimEnd(_ u: U16) -> U16 {
        var e = u.count
        while e > 0, isSpace(u[e - 1]) { e -= 1 }
        return Array(u[0..<e])
    }

    /// 空白以外の文字の数（for...of と同じく、サロゲートペアは 1 文字）
    static func visible<C: Collection>(_ u: C) -> Int where C.Element == UInt16, C.Index == Int {
        var n = 0
        var i = u.startIndex
        while i < u.endIndex {
            let c = u[i]
            if isLead(c), i + 1 < u.endIndex, isTrail(u[i + 1]) {
                n += 1
                i += 2
                continue
            }
            if !isSpace(c) { n += 1 }
            i += 1
        }
        return n
    }

    /// for...of と同じく、コードポイントごとの UTF-16 の並び
    static func codePoints(_ u: U16) -> [U16] {
        var out: [U16] = []
        var i = 0
        while i < u.count {
            if isLead(u[i]), i + 1 < u.count, isTrail(u[i + 1]) {
                out.append([u[i], u[i + 1]])
                i += 2
            } else {
                out.append([u[i]])
                i += 1
            }
        }
        return out
    }

    /// String.prototype.indexOf（UTF-16 の並びとして探す）
    static func indexOf(_ hay: U16, _ needle: U16, from: Int = 0) -> Int {
        let start = max(0, from)
        if needle.isEmpty { return min(start, hay.count) }
        if needle.count > hay.count { return -1 }
        var i = start
        while i + needle.count <= hay.count {
            if hay[i] == needle[0], Array(hay[i..<(i + needle.count)]) == needle { return i }
            i += 1
        }
        return -1
    }

    /// Math.round（.5 は正の方向へ）
    static func round(_ x: Double) -> Int { Int((x + 0.5).rounded(.down)) }

    static func isAsciiLetter(_ c: UInt16) -> Bool { (0x41...0x5A).contains(c) || (0x61...0x7A).contains(c) }
    static func isAsciiDigit(_ c: UInt16) -> Bool { (0x30...0x39).contains(c) }
    static func isAsciiLower(_ c: UInt16) -> Bool { (0x61...0x7A).contains(c) }
}
