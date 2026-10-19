// 読書履歴: 合計時間・読んだ文字数・平均の速さ、直近 14 日の読書時間、1 回ごとの記録。

import SwiftUI
import Charts
import FlowaKit

struct HistoryView: View {
    let store: BookStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let stats = HistoryStats(store.sessions)
        List {
            Section {
                HStack(spacing: 8) {
                    tile(formatDuration(stats.ms), L("合計時間"))
                    tile(stats.chars.formatted(), L("読んだ文字数"))
                    tile("\(stats.cpm)", L("平均 字/分"))
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            Section(L("直近14日")) {
                Chart(stats.days, id: \.start) { d in
                    BarMark(x: .value(L("日付"), d.start, unit: .day), y: .value(L("分"), d.ms / 60000))
                        .foregroundStyle(.tint)
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: .day, count: 2)) { _ in
                        AxisValueLabel(format: .dateTime.month(.defaultDigits).day(), centered: true)
                    }
                }
                .frame(height: 160)
                .accessibilityLabel(L("直近14日の読書時間"))
            }
            Section(L("記録")) {
                if store.sessions.isEmpty {
                    Text(L("まだ記録がありません。高速読書で再生すると、ここに残ります。")).foregroundStyle(.secondary)
                }
                ForEach(store.sessions.prefix(200), id: \.self) { s in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(s.title).font(.headline).lineLimit(1)
                        HStack(spacing: 12) {
                            Text(s.start.formatted(date: .abbreviated, time: .shortened))
                            Text(formatDuration(s.ms))
                            Text(L("\(s.cpm) 字/分"))
                            Text("\(Int(s.fromPercent))% → \(Int(s.toPercent))%")
                        }
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle(L("読書履歴"))
        .toolbar {
            ToolbarItem(placement: .confirmationAction) { Button(L("閉じる")) { dismiss() } }
        }
    }

    private func tile(_ value: String, _ label: String) -> some View {
        VStack(spacing: 4) {
            Text(value).font(.title3.bold()).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
    }
}

/// 時間の表示（1 時間未満は分、それ以上は時間と分）
func formatDuration(_ ms: Double) -> String {
    let min = Int((ms / 60000).rounded())
    if min < 60 { return L("\(min)分") }
    return L("\(min / 60)時間\(min % 60)分")
}
