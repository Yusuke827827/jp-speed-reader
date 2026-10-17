// 読書画面の色の組み合わせ（Web 版の THEMES と同じ色。模様のある背景は単色にしている）。

import SwiftUI

struct ReaderTheme: Identifiable {
    let id: String
    /// 表示名（日本語。L() で訳す）
    let label: String
    let bg: Color
    let fg: Color
    let accent: Color
    let dark: Bool

    static let all: [ReaderTheme] = [
        ReaderTheme(id: "paper", label: "紙", bg: Color(hex: 0xf3f0e8), fg: Color(hex: 0x1f1d1a), accent: Color(hex: 0xb5482f), dark: false),
        ReaderTheme(id: "washi", label: "和紙", bg: Color(hex: 0xeee7d8), fg: Color(hex: 0x1e1b16), accent: Color(hex: 0xb0402a), dark: false),
        ReaderTheme(id: "parchment", label: "羊皮紙", bg: Color(hex: 0xe8d6a8), fg: Color(hex: 0x3a2a16), accent: Color(hex: 0x8a3b1c), dark: false),
        ReaderTheme(id: "night", label: "夜空", bg: Color(hex: 0x0b1430), fg: Color(hex: 0xf1ece2), accent: Color(hex: 0xf0b95a), dark: true),
        ReaderTheme(id: "aurora", label: "オーロラ", bg: Color(hex: 0x07080d), fg: Color(hex: 0xeceaf6), accent: Color(hex: 0xa7b8ff), dark: true),
        ReaderTheme(id: "light", label: "白", bg: Color(hex: 0xfbfaf7), fg: Color(hex: 0x1b1b1b), accent: Color(hex: 0xb5482f), dark: false),
        ReaderTheme(id: "sepia", label: "セピア", bg: Color(hex: 0xf1e7d0), fg: Color(hex: 0x3b2f1e), accent: Color(hex: 0xb5482f), dark: false),
        ReaderTheme(id: "gray", label: "グレー", bg: Color(hex: 0x3a3d42), fg: Color(hex: 0xe8e6e1), accent: Color(hex: 0xe07a5f), dark: true),
        ReaderTheme(id: "dark", label: "黒", bg: Color(hex: 0x1d1f24), fg: Color(hex: 0xe9e5dc), accent: Color(hex: 0xe07a5f), dark: true),
        ReaderTheme(id: "black", label: "真っ黒", bg: Color(hex: 0x000000), fg: Color(hex: 0xc9c5bc), accent: Color(hex: 0xe07a5f), dark: true),
    ]

    /// 設定の値から色を決める。auto は端末がダークモードなら「黒」、それ以外は「紙」
    static func resolve(_ id: String, scheme: ColorScheme) -> ReaderTheme {
        if id == "auto" { return all.first { $0.id == (scheme == .dark ? "dark" : "paper") }! }
        return all.first { $0.id == id } ?? all[0]
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255)
    }
}
