// 行をつなぐ（src/lib/layout.ts の joinLine の移植）。
// 日本語どうしなら空白を入れず、欧文の語どうしなら 1 つ入れる。行末のハイフンで分かれた英単語はつなぐ。
// 正規表現の代わりに文字の判定で書く（Web 版の正規表現と同じ条件）。

public enum Lines {
    static func isAsciiLetter(_ c: Character) -> Bool { c.isASCII && c.isLetter }
    static func isAsciiDigit(_ c: Character) -> Bool { c.isASCII && c.isNumber }
    static func isAsciiAlnum(_ c: Character) -> Bool { isAsciiLetter(c) || isAsciiDigit(c) }

    /// 欧文の語の終わり：/[A-Za-z0-9][.,;:!?%)\]"'’”]*$/
    static func latinEnd(_ s: String) -> Bool {
        let closers: Set<Character> = [".", ",", ";", ":", "!", "?", "%", ")", "]", "\"", "'", "’", "”"]
        guard let c = s.reversed().first(where: { !closers.contains($0) }) else { return false }
        return isAsciiAlnum(c)
    }

    /// 欧文の語の始まり：/^[(["'‘“]*[A-Za-z0-9]/
    static func latinStart(_ s: String) -> Bool {
        let openers: Set<Character> = ["(", "[", "\"", "'", "‘", "“"]
        guard let c = s.first(where: { !openers.contains($0) }) else { return false }
        return isAsciiAlnum(c)
    }

    /// 欧文の語どうしで、間に空白が要るか。数字どうし（行や断片をまたぐ 12.｜5、1,｜000）には入れない
    public static func latinSpaceBetween(_ a: String, _ b: String) -> Bool {
        guard latinEnd(a), latinStart(b) else { return false }
        var tail = Substring(a)
        if let last = tail.last, last == "." || last == "," { tail = tail.dropLast() }
        let digitPair = (tail.last.map(isAsciiDigit) ?? false) && (b.first.map(isAsciiDigit) ?? false)
        return !digitPair
    }

    public static func joinLine(_ a: String, _ b: String) -> String {
        // 行末のハイフンで分かれた英単語（exam- / ple）は、ハイフンを外してつなぐ：/[A-Za-z]-$/ と /^[a-z]/
        if a.hasSuffix("-"), let beforeHyphen = a.dropLast().last, isAsciiLetter(beforeHyphen),
           let first = b.first, first.isASCII, first.isLowercase {
            return String(a.dropLast()) + b
        }
        if latinSpaceBetween(a, b) { return a + " " + b }
        return a + b
    }
}
