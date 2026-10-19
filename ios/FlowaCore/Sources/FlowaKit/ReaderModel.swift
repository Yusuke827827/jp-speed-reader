// 高速読書の状態と再生（Web 版の src/ui/Reader.tsx のうち、画面に依存しない部分）。
// 予定時刻から逆算して待つので、表示の遅れが積み重ならない。

import Foundation
import Observation
import FlowaCore

@Observable
@MainActor
public final class ReaderModel {
    public let book: BookMeta
    public private(set) var text: BookText
    public private(set) var chunks: [Chunk] = []
    public private(set) var schedule: Schedule?
    public private(set) var index = 0
    public private(set) var playing = false
    /// 単位を作っている途中（長い本は数秒かかる）
    public private(set) var preparing = true
    /// 最後まで読んだ
    public private(set) var finished = false
    /// 欧文の本（速度を語/分で扱う）
    public private(set) var latin = false
    public var settings: ReaderSettings {
        didSet { settingsChanged(from: oldValue) }
    }

    /// 位置が変わったときに呼ぶ（保存用）
    public var onPosition: ((TextPosition, Double) -> Void)?
    /// 再生を止めたときに、その回の記録を渡す
    public var onSession: ((ReadingSession) -> Void)?

    /// 再生中の回（始めた時刻・そのときの読了率・表示した文字数）
    private var session: (start: Date, clock: ContinuousClock.Instant, fromPercent: Double, chars: Int)?

    /// 再生開始直後の倍率（だんだん速くする）
    static let ramp: [Double] = [1.7, 1.4, 1.2, 1.08]

    private var playTask: Task<Void, Never>?
    private var buildTask: Task<Void, Never>?
    private var pendingPosition: TextPosition

    public init(book: BookMeta, pages: [StoredPage], settings: ReaderSettings) {
        self.book = book
        self.settings = settings
        text = BookText(
            pages: pages.enumerated().map { PageEntry(pageIndex: $0.offset, text: $0.element.text, contFromPrev: $0.element.contFromPrev) },
            pageCount: book.pageCount
        )
        pendingPosition = book.textPosition ?? TextPosition(para: 0, offset: 0)
        rebuild()
    }

    public var chunk: Chunk? { chunks.indices.contains(index) ? chunks[index] : nil }

    public var position: TextPosition {
        guard let c = chunk else { return pendingPosition }
        return TextPosition(para: c.para, offset: c.start)
    }

    public var percent: Double { text.percentAt(position) }

    /// 残り時間（秒）
    public var remainingSeconds: Double {
        guard let schedule, !chunks.isEmpty else { return 0 }
        return schedule.remainingMs(from: index) / 1000
    }

    /// 速度の上限に達して、指定より遅くなっているか
    public var speedLimited: Bool { schedule?.limited ?? false }

    // MARK: - 単位と表示時間

    nonisolated static func segment(_ text: BookText, _ s: ReaderSettings) -> [Chunk] {
        let all = Segmenter.segmentBook(text.paragraphs, SegmentOptions(mode: s.chunkMode, phraseTarget: s.phraseTarget, minChars: s.minChars))
        let refs = s.skipReferences ? text.referenceParagraphs() : []
        let skip = !refs.isEmpty && refs.count < text.paragraphs.count
        // 挿絵はまだ表示できないので飛ばす
        return all.filter { !$0.illust && !(skip && refs.contains($0.para)) }
    }

    private func timingOptions() -> TimingOptions {
        TimingOptions(cpm: Double(settings.cpm), wpm: Double(settings.wpm), pauses: settings.pauses, pauseScale: settings.pauseScale)
    }

    private func rebuild() {
        let keep = position
        let wasPlaying = playing
        pause()
        preparing = true
        let text = self.text
        let s = settings
        buildTask?.cancel()
        buildTask = Task { [weak self] in
            let chunks = await Task.detached(priority: .userInitiated) { Self.segment(text, s) }.value
            guard let self, !Task.isCancelled else { return }
            self.chunks = chunks
            self.latin = Segmenter.isLatinBook(chunks)
            self.schedule = Timing.buildSchedule(chunks, self.timingOptions())
            self.index = chunks.isEmpty ? 0 : Segmenter.chunkIndexAt(chunks, keep)
            self.preparing = false
            if wasPlaying { self.play() }
        }
    }

    private func settingsChanged(from old: ReaderSettings) {
        if old.segmentKey != settings.segmentKey {
            rebuild()
        } else if old.cpm != settings.cpm || old.wpm != settings.wpm || old.pauses != settings.pauses || old.pauseScale != settings.pauseScale {
            schedule = Timing.buildSchedule(chunks, timingOptions())
            // 再生中なら新しい速度で数え直す
            if playing {
                pause()
                play()
            }
        }
    }

    // MARK: - 再生

    public func play() {
        guard !preparing, !chunks.isEmpty, !playing else { return }
        if index >= chunks.count - 1 { index = 0 }
        finished = false
        playing = true
        session = (Date(), ContinuousClock.now, percent, 0)
        playTask = Task { [weak self] in
            let clock = ContinuousClock()
            var due = clock.now
            var step = 0
            while let self, self.playing, !Task.isCancelled {
                let mult = self.settings.rampUp && step < Self.ramp.count ? Self.ramp[step] : 1
                step += 1
                let ms = (self.schedule?.duration(self.index) ?? 100) * mult
                due = due.advanced(by: .milliseconds(Int(ms.rounded())))
                try? await clock.sleep(until: due, tolerance: .milliseconds(4))
                guard !Task.isCancelled, self.playing else { return }
                self.session?.chars += self.chunks[self.index].len
                if self.index >= self.chunks.count - 1 {
                    self.playing = false
                    self.finished = true
                    self.endSession()
                    self.report()
                    return
                }
                self.index += 1
            }
        }
    }

    public func pause() {
        guard playing else { return }
        playing = false
        playTask?.cancel()
        playTask = nil
        endSession()
        report()
    }

    /// 再生の回を締めて記録を渡す（何も表示しなかった回は残さない）
    private func endSession() {
        guard let s = session else { return }
        session = nil
        let elapsed = ContinuousClock.now - s.clock
        let ms = Double(elapsed.components.seconds) * 1000 + Double(elapsed.components.attoseconds) / 1e15
        guard s.chars > 0 else { return }
        onSession?(ReadingSession(
            bookId: book.id, title: book.title, start: s.start, end: Date(), ms: ms, chars: s.chars,
            fromPercent: s.fromPercent, toPercent: percent
        ))
    }

    public func toggle() { playing ? pause() : play() }

    /// 単位をいくつか進める・戻す
    public func step(_ delta: Int) {
        guard !chunks.isEmpty else { return }
        index = min(max(0, index + delta), chunks.count - 1)
        finished = false
        report()
    }

    /// 前の段落の先頭（今の段落の途中なら、その先頭）へ
    public func previousParagraph() {
        guard !chunks.isEmpty else { return }
        let start = Segmenter.paragraphStartIndex(chunks, index)
        index = start < index ? start : Segmenter.paragraphStartIndex(chunks, max(0, start - 1))
        report()
    }

    /// 次の段落の先頭へ
    public func nextParagraph() {
        guard !chunks.isEmpty else { return }
        let p = chunks[index].para
        var i = index
        while i < chunks.count - 1, chunks[i].para == p { i += 1 }
        index = i
        report()
    }

    /// 読了率（0〜100）の位置へ
    public func seek(percent: Double) {
        guard !chunks.isEmpty, text.totalChars > 0 else { return }
        let target = Int(Double(text.totalChars) * min(max(percent, 0), 100) / 100)
        var para = 0
        for (i, p) in text.paragraphs.enumerated() where p.globalStart <= target { para = i }
        index = Segmenter.chunkIndexAt(chunks, TextPosition(para: para, offset: target - text.paragraphs[para].globalStart))
        report()
    }

    /// 本文の位置へ（全文の表示から選んだとき）
    public func jump(to pos: TextPosition) {
        guard !chunks.isEmpty else { return }
        pause()
        index = Segmenter.chunkIndexAt(chunks, pos)
        finished = false
        report()
    }

    /// 今いるページ（0 始まり）
    public var currentPage: Int { text.pageAt(position) }

    /// 指定したページ以降で最初に始まる本文へ
    public func jump(toPage page: Int) {
        guard !chunks.isEmpty else { return }
        index = Segmenter.chunkIndexAt(chunks, text.positionForPage(page))
        finished = false
        report()
    }

    /// 今の速度を一段変える（字/分は 50、語/分は 10 ずつ）
    public func changeSpeed(_ dir: Int) {
        if latin {
            settings.wpm = min(max(ReaderSettings.wpmRange.lowerBound, settings.wpm + dir * 10), ReaderSettings.wpmRange.upperBound)
        } else {
            settings.cpm = min(max(ReaderSettings.cpmRange.lowerBound, settings.cpm + dir * 50), ReaderSettings.cpmRange.upperBound)
        }
    }

    /// 今の単位を含む段落（一時停止中に前後を見せる）
    public var currentParagraph: Paragraph? {
        guard let c = chunk, text.paragraphs.indices.contains(c.para) else { return nil }
        return text.paragraphs[c.para]
    }

    private func report() {
        guard !chunks.isEmpty else { return }
        onPosition?(position, percent)
    }
}
