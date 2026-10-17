// 画面の文言。日本語をキーにし、英語は Resources/en.lproj/Localizable.strings に置く（Web 版の t() と同じ考え方）。

import Foundation

func L(_ key: String.LocalizationValue) -> String {
    String(localized: key, bundle: .module)
}

/// 分割の単位の表示名
func modeLabel(_ mode: String) -> String {
    switch mode {
    case "char": return L("1文字")
    case "short": return L("2〜4文字")
    case "phrase": return L("フレーズ")
    case "sentence": return L("文")
    default: return L("文節")
    }
}

/// 残り時間（分・時間）
func formatRemaining(_ seconds: Double) -> String {
    let min = Int((seconds / 60).rounded(.up))
    if min < 60 { return L("残り約\(min)分") }
    return L("残り約\(min / 60)時間\(min % 60)分")
}
