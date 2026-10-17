// 1 冊分の段落（src/lib/book.ts の Paragraph の一部）。位置は UTF-16 の単位。

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

public struct Paragraph: Equatable, Sendable {
    /// ルビ記法を除いた本文
    public var text: String
    public var ruby: [Ruby]
    /// 挿絵を表す段落（本文は空）
    public var illust: Bool

    public init(text: String, ruby: [Ruby] = [], illust: Bool = false) {
        self.text = text
        self.ruby = ruby
        self.illust = illust
    }
}
