// 日本語テキストの正規化とルビ記法の解析（src/lib/normalize.ts の移植）。
// NFKC を全体にかけると「…」が「...」に、全角英数が半角に変わってしまうため、
// 文字化けの原因になりやすい範囲だけを選んで NFKC を適用する。位置はすべて UTF-16 の単位。

import Foundation

public enum Normalize {
    /// 康熙部首・CJK部首補助、CJK互換漢字、半角カナ、縦書き用の句読点・括弧
    static func isCompat(_ c: UInt16) -> Bool {
        switch c {
        case 0x2E80...0x2FDF, 0xF900...0xFAFF, 0xFF61...0xFF9F, 0xFE10...0xFE19, 0xFE30...0xFE4F: return true
        default: return false
        }
    }

    /// 縦書き用の句読点・括弧。NFKC では「？」「！」「（）」が半角になるので、全角の対応を自前で持つ
    static let vertical: [Character: String] = [
        "︐": "，", "︑": "、", "︒": "。", "︓": "：", "︔": "；", "︕": "！", "︖": "？", "︗": "〖", "︘": "〗", "︙": "…",
        "︰": "‥", "︱": "―", "︲": "–", "︵": "（", "︶": "）", "︷": "｛", "︸": "｝", "︹": "〔", "︺": "〕", "︻": "【",
        "︼": "】", "︽": "《", "︾": "》", "︿": "〈", "﹀": "〉", "﹁": "「", "﹂": "」", "﹃": "『", "﹄": "』", "﹇": "［", "﹈": "］",
    ]

    /// 康熙部首を NFKC で戻すと、日本で使わない字体になる字がある（⿊ → 黑 など）。日本の字体にそろえる
    static let kangxiJa: [String: String] = ["黑": "黒", "戶": "戸", "靑": "青", "龜": "亀", "麥": "麦", "黃": "黄", "齒": "歯"]

    /// CJK部首補助のうち NFKC で戻らないが、PDF で漢字の代わりに使われやすいもの
    static let radicals: [Character: String] = [
        "⺟": "母", "⺠": "民", "⻁": "虎", "⻄": "西", "⻆": "角",
        "⻏": "邑", "⻑": "長", "⻘": "青", "⻝": "食", "⻤": "鬼",
        "⻨": "麦", "⻩": "黄", "⻫": "斉", "⻭": "歯", "⻯": "竜", "⻲": "亀",
    ]

    static func replacement(_ c: UInt16) -> U16 {
        let ch = JS.string([c])
        if let ch1 = ch.first, let v = vertical[ch1] ?? radicals[ch1] { return JS.units(v) }
        let nfkc = ch.precomposedStringWithCompatibilityMapping
        let out = (0x2F00...0x2FDF).contains(c) ? (kangxiJa[nfkc] ?? nfkc) : nfkc
        return JS.units(out)
    }

    public static func normalizeChars(_ s: String) -> String { JS.string(normalizeChars(units: JS.units(s))) }

    static func normalizeChars(units s: U16) -> U16 {
        var a: U16 = []
        a.reserveCapacity(s.count)
        for c in s { if isCompat(c) { a += replacement(c) } else { a.append(c) } }
        // ノーブレークスペースを空白に、ゼロ幅文字・ソフトハイフンを削除
        var out: U16 = []
        out.reserveCapacity(a.count)
        for c in a {
            if c == 0xA0 { out.append(0x20); continue }
            if (0x200B...0x200D).contains(c) || c == 0xFEFF || c == 0xAD { continue }
            out.append(c)
        }
        return out
    }

    static let noteOpen: [UInt16] = [0xFF3B, 0xFF03] // ［＃
    static let noteClose: UInt16 = 0xFF3D // ］

    /// 青空文庫の注記［＃…］だけを外す。ルビの記法（｜漢字《かんじ》）は残す
    public static func stripNotes(_ s: String) -> String { JS.string(stripNotes(units: JS.units(s))) }

    static func stripNotes(units s: U16) -> U16 {
        var out: U16 = []
        var i = 0
        while i < s.count {
            if i + 1 < s.count, s[i] == noteOpen[0], s[i + 1] == noteOpen[1], let close = s[(i + 2)...].firstIndex(of: noteClose) {
                i = close + 1
                continue
            }
            out.append(s[i])
            i += 1
        }
        return out
    }

    static let bar: UInt16 = 0xFF5C // ｜
    static let rubyOpen: UInt16 = 0x300A // 《
    static let rubyClose: UInt16 = 0x300B // 》

    /// /^[ぁ-ヿー・ ]+$/
    static func isKanaOnly(_ s: ArraySlice<UInt16>) -> Bool {
        !s.isEmpty && s.allSatisfy { (0x3041...0x30FF).contains($0) || $0 == 0x20 }
    }

    /// /[一-鿿㐀-䶿豈-﫿々〆ヶ〇]/
    static func isKanji(_ c: UInt16) -> Bool {
        switch c {
        case 0x4E00...0x9FFF, 0x3400...0x4DBF, 0xF900...0xFAFF, 0x3005, 0x3006, 0x30F6, 0x3007: return true
        default: return false
        }
    }

    /// ルビ記法を解析し、本文とルビの位置に分ける。
    ///   ｜春風《はるかぜ》 … ｜ から 《 までが親文字
    ///   春風《はるかぜ》   … 《 の直前に続く漢字が親文字
    public static func parseRuby(_ str: String) -> (text: String, ruby: [Ruby]) {
        let s = JS.units(str)
        var ruby: [Ruby] = []
        var text: U16 = []
        var barAt = -1 // ｜ の位置（text 上）
        var i = 0
        while i < s.count {
            let c = s[i]
            if c == bar {
                barAt = text.count
                i += 1
                continue
            }
            if c == rubyOpen {
                guard let close = s[(i + 1)...].firstIndex(of: rubyClose) else {
                    text += s[i...]
                    break
                }
                let rt = s[(i + 1)..<close]
                var start = barAt
                // ｜の無い記法は、直前が漢字で、中身がかなだけのときに限る。
                // それ以外（《大賢者》のような本文中の括弧）は本文としてそのまま残す
                if start < 0, isKanaOnly(rt) {
                    var k = text.count
                    while k > 0, isKanji(text[k - 1]) { k -= 1 }
                    start = k < text.count ? k : -1
                }
                if start >= 0, start < text.count, !rt.isEmpty {
                    ruby.append(Ruby(start: start, end: text.count, text: JS.string(rt)))
                } else {
                    text += s[i...close]
                }
                i = close + 1
                barAt = -1
                continue
            }
            text.append(c)
            i += 1
        }
        return (JS.string(text), ruby)
    }
}
