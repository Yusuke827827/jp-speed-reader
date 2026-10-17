// 各単位の表示時間を決める（src/lib/timing.ts の移植）。
//
// 速度の基準は「文字/分」（空白を除いた文字数）。欧文の単位（語数を持つもの）は、
// wpm が指定されていれば「語/分」で合わせる。1 語を cpm / wpm 文字ぶんとして扱う。
// 各単位に「重み（文字数 + 句読点の間 + 最低表示量の補正）」を与え、段落の切れ目でまとめた
// 約 240 字ごとの区間で「区間の文字数 ÷ 区間の表示時間」が設定速度と一致するよう、
// 区間ごとに 1 重みあたりの時間を二分探索で決める。
//
// Web 版は重みと 1 重みあたりの時間を Float32Array に入れている。同じ値になるよう、
// ここでも [Float] に入れ、計算は Double で行う。

public struct TimingOptions: Sendable {
    /// 文字/分
    public var cpm: Double
    /// 欧文の語/分。nil なら欧文も文字/分で合わせる
    public var wpm: Double?
    /// 句読点で間をとるか
    public var pauses: Bool
    /// 間の長さの倍率（1 = 標準）
    public var pauseScale: Double
    /// 人物名を含む単位を少し長く表示する
    public var nameBoost: Bool
    /// 挿絵を表示する時間（ミリ秒）。挿絵は速度の計算に含めない
    public var illustMs: Double

    public init(cpm: Double, wpm: Double? = nil, pauses: Bool = true, pauseScale: Double = 1, nameBoost: Bool = false, illustMs: Double = 4000) {
        self.cpm = cpm
        self.wpm = wpm
        self.pauses = pauses
        self.pauseScale = pauseScale
        self.nameBoost = nameBoost
        self.illustMs = illustMs
    }
}

public enum Timing {
    /// 1 単位の表示時間の下限（ミリ秒）
    public static let minMs: Double = 40
    /// 速度を合わせる区間の目安の文字数
    public static let blockChars: Double = 240
    /// 人物名を含む単位に足す時間（文字数換算）
    static let nameUnits: Double = 1.5
    /// 短すぎる単位が一瞬で消えないよう、最低でもこの文字数ぶんは表示する
    static let minUnits: Double = 1.6

    /// 間の大きさ（文字数換算）
    static func pauseUnits(_ p: Pause) -> Double {
        switch p {
        case .none: return 0
        case .comma: return 1.5
        case .sentence: return 3
        case .paragraph: return 5
        }
    }

    /// 速度の計算に使う文字数。欧文の単位は語数を文字数に換算する
    public static func unitsOf(_ c: Chunk, _ opts: TimingOptions) -> Double {
        if let words = c.words, let wpm = opts.wpm, wpm != 0 { return Double(words) * opts.cpm / wpm }
        return Double(c.len)
    }

    public static func weightOf(_ c: Chunk, _ opts: TimingOptions) -> Double {
        if c.illust { return 0 }
        // 長い単位は目の移動が少ない分だけ、1 文字あたりの重みを少し下げる
        let units = unitsOf(c, opts)
        let len = units <= 8 ? units : 8 + (units - 8) * 0.85
        let base = max(minUnits, len)
        let pause = opts.pauses ? pauseUnits(c.pause) * opts.pauseScale : 0
        let name = opts.nameBoost && c.name ? nameUnits : 0
        return base + pause + name
    }

    /// 区間 [from, to) の 1 重みあたりの時間を求める
    static func solveBlock(_ weights: [Float], _ fixed: [Float], chars: Double, from: Int, to: Int, msPerChar: Double) -> (unit: Double, limited: Bool) {
        let target = chars * msPerChar
        var totalW = 0.0
        var count = 0
        for i in from..<to where fixed[i] == 0 {
            totalW += Double(weights[i])
            count += 1
        }
        if totalW == 0 { return (msPerChar, false) }
        func total(_ u: Double) -> Double {
            var t = 0.0
            for i in from..<to where fixed[i] == 0 { t += max(minMs, Double(weights[i]) * u) }
            return t
        }
        let limited = Double(count) * minMs > target
        var lo = 0.0
        var hi = target / totalW // total(hi) >= target が成り立つ
        if !limited {
            for _ in 0..<40 {
                let mid = (lo + hi) / 2
                if total(mid) > target { hi = mid } else { lo = mid }
            }
        }
        return (hi, limited)
    }

    public static func buildSchedule(_ chunks: [Chunk], _ opts: TimingOptions) -> Schedule {
        let n = chunks.count
        var weights = [Float](repeating: 0, count: n)
        var fixed = [Float](repeating: 0, count: n)
        var unit = [Float](repeating: 0, count: n)
        var totalChars = 0
        for i in 0..<n {
            weights[i] = Float(weightOf(chunks[i], opts))
            if chunks[i].illust { fixed[i] = Float(opts.illustMs) }
            totalChars += chunks[i].len
        }
        let msPerChar = 60000 / max(1, opts.cpm)

        // 段落の切れ目で区間を区切る。最後の短い残りは直前の区間に含める
        var blocks: [(from: Int, to: Int, chars: Double)] = []
        var start = 0
        var chars = 0.0
        for i in 0..<n {
            chars += unitsOf(chunks[i], opts)
            let boundary = chunks[i].pause == .paragraph || i == n - 1
            if boundary && (chars >= blockChars || i == n - 1) {
                blocks.append((start, i + 1, chars))
                start = i + 1
                chars = 0
            }
        }
        if blocks.count >= 2, blocks[blocks.count - 1].chars < blockChars / 2 {
            let last = blocks.removeLast()
            let prev = blocks.removeLast()
            blocks.append((prev.from, last.to, prev.chars + last.chars))
        }

        var limited = false
        for b in blocks {
            let r = solveBlock(weights, fixed, chars: b.chars, from: b.from, to: b.to, msPerChar: msPerChar)
            for i in b.from..<b.to { unit[i] = Float(r.unit) }
            limited = limited || r.limited
        }
        return Schedule(weights: weights, fixed: fixed, unit: unit, totalChars: totalChars, blocks: blocks.map { [$0.from, $0.to] }, limited: limited)
    }
}

public struct Schedule: Sendable {
    public var weights: [Float]
    /// 決まった時間だけ表示する単位（挿絵）のミリ秒。0 なら通常の単位
    public var fixed: [Float]
    /// 単位ごとの、重み 1 あたりのミリ秒（所属する区間の値）
    public var unit: [Float]
    public var totalChars: Int
    /// 速度を合わせた区間 [開始, 終了)
    public var blocks: [[Int]]
    /// 下限のせいで設定速度を出せない区間がある
    public var limited: Bool

    /// index 番目の単位の表示時間（ミリ秒）
    public func duration(_ index: Int) -> Double {
        if fixed[index] != 0 { return Double(fixed[index]) }
        return max(Timing.minMs, Double(weights[index]) * Double(unit[index]))
    }

    /// 指定範囲を表示したときの実速度（文字/分）
    public func effectiveCpm(_ chunks: [Chunk], from: Int = 0, to: Int? = nil) -> Double {
        var ms = 0.0
        var chars = 0
        for i in from..<(to ?? chunks.count) {
            ms += duration(i)
            chars += chunks[i].len
        }
        return ms > 0 ? Double(chars) / ms * 60000 : 0
    }

    /// 残り時間（ミリ秒）
    public func remainingMs(from: Int) -> Double {
        var ms = 0.0
        for i in from..<weights.count { ms += duration(i) }
        return ms
    }
}
