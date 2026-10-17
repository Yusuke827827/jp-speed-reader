// 読み方の設定。端末に保存する（Web 版の src/lib/settings.ts のうち、高速読書に関わるもの）。

import Foundation
import FlowaCore

public struct ReaderSettings: Codable, Equatable, Sendable {
    /// 分割の単位（ChunkMode の rawValue）
    public var mode: String = ChunkMode.bunsetsu.rawValue
    public var phraseTarget: Int = 7
    /// これより短い単位は隣とつなぐ（1 = つながない）
    public var minChars: Int = 3
    /// 字/分
    public var cpm: Int = 600
    /// 欧文の語/分
    public var wpm: Int = 250
    public var pauses: Bool = true
    public var pauseScale: Double = 1
    /// 再生開始直後の数単位をゆっくり表示する
    public var rampUp: Bool = true
    /// 論文などの参考文献の節を高速読書で飛ばす
    public var skipReferences: Bool = true
    /// 高速読書の文字サイズ（pt）
    public var fontSize: Double = 44
    /// 明朝（serif）で表示する
    public var serif: Bool = true

    public init() {}

    public var chunkMode: ChunkMode { ChunkMode(rawValue: mode) ?? .bunsetsu }

    public static let cpmRange = 100...3000
    public static let wpmRange = 60...1200

    // 古い保存データに無い項目は既定値にする
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = ReaderSettings()
        mode = try c.decodeIfPresent(String.self, forKey: .mode) ?? d.mode
        phraseTarget = try c.decodeIfPresent(Int.self, forKey: .phraseTarget) ?? d.phraseTarget
        minChars = try c.decodeIfPresent(Int.self, forKey: .minChars) ?? d.minChars
        cpm = try c.decodeIfPresent(Int.self, forKey: .cpm) ?? d.cpm
        wpm = try c.decodeIfPresent(Int.self, forKey: .wpm) ?? d.wpm
        pauses = try c.decodeIfPresent(Bool.self, forKey: .pauses) ?? d.pauses
        pauseScale = try c.decodeIfPresent(Double.self, forKey: .pauseScale) ?? d.pauseScale
        rampUp = try c.decodeIfPresent(Bool.self, forKey: .rampUp) ?? d.rampUp
        skipReferences = try c.decodeIfPresent(Bool.self, forKey: .skipReferences) ?? d.skipReferences
        fontSize = try c.decodeIfPresent(Double.self, forKey: .fontSize) ?? d.fontSize
        serif = try c.decodeIfPresent(Bool.self, forKey: .serif) ?? d.serif
    }

    private static let key = "flowa.readerSettings"

    public static func load(_ defaults: UserDefaults = .standard) -> ReaderSettings {
        guard let data = defaults.data(forKey: key), let s = try? JSONDecoder().decode(ReaderSettings.self, from: data) else { return ReaderSettings() }
        return s
    }

    public func save(_ defaults: UserDefaults = .standard) {
        if let data = try? JSONEncoder().encode(self) { defaults.set(data, forKey: Self.key) }
    }

    /// 分割の結果に関わる項目（変わったら単位を作り直す）
    var segmentKey: [String] { [mode, String(phraseTarget), String(minChars), String(skipReferences)] }
}
