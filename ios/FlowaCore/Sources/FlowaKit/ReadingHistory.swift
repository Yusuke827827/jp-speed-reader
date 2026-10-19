// 読書の記録（Web 版の db.ts の Session と History.tsx の集計に当たる）。
// 再生を始めてから止めるまでを 1 回として、時間・読んだ文字数・読了率の変化を残す。

import Foundation

public struct ReadingSession: Codable, Hashable, Sendable {
    public var bookId: String
    public var title: String
    public var start: Date
    public var end: Date
    /// 読んでいた時間（ミリ秒）
    public var ms: Double
    /// 表示した文字数（空白を除く）
    public var chars: Int
    public var fromPercent: Double
    public var toPercent: Double

    public init(bookId: String, title: String, start: Date, end: Date, ms: Double, chars: Int, fromPercent: Double, toPercent: Double) {
        self.bookId = bookId
        self.title = title
        self.start = start
        self.end = end
        self.ms = ms
        self.chars = chars
        self.fromPercent = fromPercent
        self.toPercent = toPercent
    }

    /// 実際の速度（字/分）
    public var cpm: Int { ms > 0 ? Int((Double(chars) / ms * 60000).rounded()) : 0 }
}

public struct HistoryStats: Equatable, Sendable {
    public struct Day: Equatable, Sendable {
        public var start: Date
        public var ms: Double
    }

    public var ms: Double
    public var chars: Int
    public var cpm: Int
    /// 直近の日ごとの読書時間（古い順）
    public var days: [Day]

    public init(_ sessions: [ReadingSession], now: Date = Date(), days count: Int = 14, calendar: Calendar = .current) {
        ms = sessions.reduce(0) { $0 + $1.ms }
        chars = sessions.reduce(0) { $0 + $1.chars }
        cpm = ms > 0 ? Int((Double(chars) / ms * 60000).rounded()) : 0
        let today = calendar.startOfDay(for: now)
        days = (0..<count).reversed().compactMap { i -> Day? in
            guard let d = calendar.date(byAdding: .day, value: -i, to: today), let next = calendar.date(byAdding: .day, value: 1, to: d) else { return nil }
            return Day(start: d, ms: sessions.filter { $0.start >= d && $0.start < next }.reduce(0) { $0 + $1.ms })
        }
    }
}
