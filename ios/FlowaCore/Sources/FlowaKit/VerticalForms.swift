// 縦書きで 1 文字ずつ縦に並べるときの字形。句読点・括弧は縦書き用の字形に置き換え、
// 長音記号やダッシュ、欧文は 90 度回す。1〜2 桁の数字は縦中横（横に並べたまま 1 文字分に収める）。

import Foundation

public enum VerticalForms {
    public struct Cell: Equatable, Sendable {
        public var text: String
        /// 右に 90 度回して表示する
        public var rotated: Bool
        /// 欧文・数字など、幅の狭い字（回すと高さが詰まる）
        public var narrow: Bool

        public init(_ text: String, rotated: Bool = false, narrow: Bool = false) {
            self.text = text
            self.rotated = rotated
            self.narrow = narrow
        }
    }

    /// 縦書き用の字形（Unicode の縦書き用の互換文字）
    static let forms: [Character: Character] = [
        "、": "︑", "。": "︒", "，": "︐", "．": "︒",
        "「": "﹁", "」": "﹂", "『": "﹃", "』": "﹄",
        "（": "︵", "）": "︶", "(": "︵", ")": "︶",
        "【": "︻", "】": "︼", "〔": "︹", "〕": "︺",
        "〈": "︿", "〉": "﹀", "《": "︽", "》": "︾",
        "［": "﹇", "］": "﹈", "｛": "︷", "｝": "︸",
        "…": "︙", "‥": "︰", "：": "︓", "；": "︔",
        "！": "︕", "？": "︖",
    ]

    /// 回して表示する字
    static let rotate: Set<Character> = ["ー", "～", "〜", "—", "―", "–", "‐", "-", "＝", "=", "→", "←"]

    public static func cells(_ s: String) -> [Cell] {
        let chars = Array(s)
        var out: [Cell] = []
        var i = 0
        while i < chars.count {
            let c = chars[i]
            if c.isASCII, c.isNumber {
                // 数字の続き
                var j = i
                while j < chars.count, chars[j].isASCII, chars[j].isNumber { j += 1 }
                let run = String(chars[i..<j])
                if run.count <= 2 {
                    out.append(Cell(run))
                } else {
                    out += run.map { Cell(String($0), rotated: true, narrow: true) }
                }
                i = j
                continue
            }
            if let f = forms[c] {
                out.append(Cell(String(f)))
            } else if rotate.contains(c) {
                out.append(Cell(String(c), rotated: true))
            } else if c.isASCII {
                out.append(Cell(c == " " ? " " : String(c), rotated: true, narrow: true))
            } else if c.isWhitespace {
                out.append(Cell("　"))
            } else {
                out.append(Cell(String(c)))
            }
            i += 1
        }
        return out
    }
}
