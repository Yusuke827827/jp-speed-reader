// 設定: 速度・分割の単位・表示・再生。

import SwiftUI
import FlowaCore
import FlowaKit

struct SettingsView: View {
    @Binding var settings: ReaderSettings
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section {
                Stepper(value: $settings.cpm, in: ReaderSettings.cpmRange, step: 50) {
                    LabeledContent(L("日本語・中国語"), value: L("\(settings.cpm) 字/分"))
                }
                Stepper(value: $settings.wpm, in: ReaderSettings.wpmRange, step: 10) {
                    LabeledContent(L("英語など"), value: "\(settings.wpm) WPM")
                }
            } header: {
                Text(L("速度"))
            } footer: {
                Text(L("日本語の黙読は一般に毎分400〜600字、英語は毎分200〜300語程度と言われます。句読点の間を入れても、全体の平均が設定値になるように表示時間を配分します。"))
            }

            Section(L("区切り方")) {
                Picker(L("単位"), selection: $settings.mode) {
                    ForEach(ChunkMode.allCases, id: \.rawValue) { m in
                        Text(modeLabel(m.rawValue)).tag(m.rawValue)
                    }
                }
                if settings.chunkMode == .phrase {
                    Stepper(value: $settings.phraseTarget, in: 4...14) {
                        LabeledContent(L("フレーズの目標の長さ"), value: L("\(settings.phraseTarget)字"))
                    }
                }
                Stepper(value: $settings.minChars, in: 1...6) {
                    LabeledContent(L("短い単位をつなぐ"), value: settings.minChars <= 1 ? L("つながない") : L("\(settings.minChars)字未満"))
                }
            }

            Section(L("表示")) {
                VStack(alignment: .leading) {
                    LabeledContent(L("文字の大きさ"), value: "\(Int(settings.fontSize))")
                    Slider(value: $settings.fontSize, in: 24...96, step: 2)
                }
                Toggle(L("明朝体で表示"), isOn: $settings.serif)
                Picker(L("文字の向き"), selection: $settings.direction) {
                    Text(L("本に合わせる")).tag("auto")
                    Text(L("横書き")).tag("horizontal")
                    Text(L("縦書き")).tag("vertical")
                }
                Picker(L("テーマ"), selection: $settings.theme) {
                    Text(L("端末の設定に合わせる")).tag("auto")
                    ForEach(ReaderTheme.all) { t in
                        HStack {
                            Text(L(String.LocalizationValue(t.label)))
                            Spacer()
                            Circle().fill(t.bg).overlay(Circle().stroke(.secondary.opacity(0.4))).frame(width: 18, height: 18)
                        }
                        .tag(t.id)
                    }
                }
                #if os(iOS)
                .pickerStyle(.navigationLink)
                #endif
            }

            Section(L("再生")) {
                Toggle(L("句読点・段落末で間をとる"), isOn: $settings.pauses)
                Toggle(L("再生の始めはゆっくり表示する"), isOn: $settings.rampUp)
                Toggle(L("論文の参考文献を飛ばす"), isOn: $settings.skipReferences)
            }

            Section {
                Button(L("初期設定に戻す"), role: .destructive) { settings = ReaderSettings() }
            }
        }
        .navigationTitle(L("設定"))
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(L("完了")) { dismiss() }
            }
        }
    }
}
