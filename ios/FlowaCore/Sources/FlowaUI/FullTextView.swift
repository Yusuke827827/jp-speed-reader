// 全文の表示: 本の段落を順に並べ、今読んでいる段落に印をつける。段落を選ぶと、そこから高速読書を続ける。

import SwiftUI
import FlowaCore
import FlowaKit

struct FullTextView: View {
    let model: ReaderModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let current = model.chunk?.para ?? 0
        ScrollViewReader { proxy in
            List {
                ForEach(Array(model.text.paragraphs.enumerated()), id: \.offset) { i, p in
                    if p.illust == nil {
                        Button {
                            model.jump(to: TextPosition(para: i, offset: 0))
                            dismiss()
                        } label: {
                            Text(p.text)
                                .font(.body)
                                .lineSpacing(4)
                                .foregroundStyle(.primary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .listRowBackground(i == current ? Color.accentColor.opacity(0.12) : nil)
                        .id(i)
                    }
                }
            }
            .listStyle(.plain)
            .onAppear { proxy.scrollTo(current, anchor: .center) }
        }
        .navigationTitle(L("全文"))
        .toolbar {
            ToolbarItem(placement: .confirmationAction) { Button(L("閉じる")) { dismiss() } }
        }
    }
}
