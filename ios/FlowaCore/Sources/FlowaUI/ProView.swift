// Flowa Pro の案内と購入・復元。無料版の上限に達したときと、設定から開く。

import SwiftUI
import FlowaKit

struct ProView: View {
    @Environment(ProStore.self) private var pro
    /// 開いた理由（上限に達したときなど）。上に表示する
    var reason: String?
    @Environment(\.dismiss) private var dismiss
    @State private var notice: String?

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    if let reason {
                        Text(reason).font(.callout).foregroundStyle(.secondary)
                    }
                    Text("Flowa Pro").font(.largeTitle.bold())
                    Text(L("一度の購入で、ずっと使えます。")).font(.headline)
                }
                .padding(.vertical, 8)
            }

            Section(L("Pro でできること")) {
                Label(L("PDF を何冊でも本棚に置ける（無料版は \(ProLimits.freePDFBooks) 冊まで。サンプルは数えません）"), systemImage: "books.vertical")
                Label(L("和紙・羊皮紙・夜空・オーロラの配色"), systemImage: "paintpalette")
                Label(L("これから加える機能（画像だけの PDF の文字認識・人物の色分け・読書の履歴）もすべて使える"), systemImage: "sparkles")
            }

            Section {
                if pro.isPro {
                    Label(L("Flowa Pro をご利用中です"), systemImage: "checkmark.seal.fill")
                        .foregroundStyle(.tint)
                } else {
                    Button {
                        Task { show(await pro.purchase()) }
                    } label: {
                        Text(pro.price.map { L("購入する（\($0)）") } ?? L("購入する"))
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(pro.busy)
                    Button(L("購入を復元")) {
                        Task { show(await pro.restore()) }
                    }
                    .disabled(pro.busy)
                }
            } footer: {
                Text(L("購入は Apple ID に結び付きます。同じ Apple ID の iPhone・iPad でも使え、機種変更のあとは「購入を復元」で戻せます。"))
            }
        }
        .navigationTitle("Flowa Pro")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L("閉じる")) { dismiss() }
            }
        }
        .overlay {
            if pro.busy { ProgressView() }
        }
        .alert(notice ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("OK") { notice = nil }
        }
    }

    private func show(_ outcome: ProStore.Outcome) {
        switch outcome {
        case .purchased: dismiss()
        case .cancelled: break
        case .pending: notice = L("購入の承認を待っています。承認されると Pro になります。")
        case .nothingToRestore: notice = L("この Apple ID では、Flowa Pro の購入が見つかりませんでした。")
        case .unavailable: notice = L("App Store に接続できませんでした。通信できる所で、もう一度試してください。")
        case .failed: notice = L("購入を完了できませんでした。もう一度試してください。")
        }
    }
}
