// 無料版でできることの範囲。Flowa Pro（買い切り）を買うと、ここの上限がなくなる。
// 分け方は docs/monetization.md の「無料と Pro の分け方」に合わせる。

import Foundation

public enum ProLimits {
    /// 無料版で本棚に置ける PDF の冊数（同梱のサンプルは数えない）
    public static let freePDFBooks = 3
    /// 無料版で読書履歴に出す日数（今日を含む。それより前の記録も消さずに残す）
    public static let freeHistoryDays = 7
    /// Pro だけで使える配色（Web 版で模様のある背景を持つもの）
    public static let proThemes: Set<String> = ["washi", "parchment", "night", "aurora"]

    /// 本棚にある PDF の冊数。samples（同梱のサンプルのファイル名）は数えない
    public static func pdfCount(_ books: [BookMeta], samples: Set<String>) -> Int {
        books.filter { $0.kind == .pdf && !samples.contains($0.fileName) }.count
    }

    /// PDF をもう 1 冊取り込めるか
    public static func canAddPDF(books: [BookMeta], samples: Set<String>, isPro: Bool) -> Bool {
        isPro || pdfCount(books, samples: samples) < freePDFBooks
    }

    /// その配色を使えるか
    public static func themeAllowed(_ id: String, isPro: Bool) -> Bool {
        isPro || !proThemes.contains(id)
    }

    /// 読書履歴に出す記録。無料版は直近 freeHistoryDays 日の分だけ
    public static func visibleSessions(_ sessions: [ReadingSession], isPro: Bool, now: Date = Date(), calendar: Calendar = .current) -> [ReadingSession] {
        guard !isPro, let from = calendar.date(byAdding: .day, value: 1 - freeHistoryDays, to: calendar.startOfDay(for: now)) else { return sessions }
        return sessions.filter { $0.start >= from }
    }
}
