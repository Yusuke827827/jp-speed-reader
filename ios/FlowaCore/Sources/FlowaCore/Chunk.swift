// 高速読書で 1 回に表示する単位（src/lib/segment.ts の Chunk）。
// 文字位置（start / end）は Web 版と同じく UTF-16 の単位で持つ。

public enum Pause: String, Codable, Sendable {
    case none
    case comma
    case sentence
    case paragraph
}

public struct Chunk: Equatable, Sendable {
    public var text: String
    /// 段落の番号
    public var para: Int
    /// 段落内の開始・終了位置（UTF-16 の単位）
    public var start: Int
    public var end: Int
    public var pause: Pause
    /// 表示上の文字数（空白を除く）
    public var len: Int
    /// 欧文の単位の語数。速度を WPM で合わせるのに使う（日本語の単位には無い）
    public var words: Int?
    /// 登録した人物名を含む
    public var name: Bool
    /// 挿絵（本文は空）
    public var illust: Bool

    public init(
        text: String = "", para: Int = 0, start: Int = 0, end: Int = 0, pause: Pause = .none,
        len: Int, words: Int? = nil, name: Bool = false, illust: Bool = false
    ) {
        self.text = text
        self.para = para
        self.start = start
        self.end = end
        self.pause = pause
        self.len = len
        self.words = words
        self.name = name
        self.illust = illust
    }
}
