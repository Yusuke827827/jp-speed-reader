// 読書画面から開く画面: 目次と、PDF のページ表示。

import SwiftUI
import FlowaKit
#if canImport(UIKit) && canImport(PDFKit)
import PDFKit
import UIKit
#endif

/// 目次。項目を選ぶと、そのページの本文へ移る
struct TocView: View {
    let toc: [TocItem]
    let currentPage: Int
    let select: (Int) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List(Array(toc.enumerated()), id: \.offset) { _, item in
            Button {
                select(item.page)
                dismiss()
            } label: {
                HStack {
                    Text(item.title)
                        .padding(.leading, CGFloat(min(item.depth, 4)) * 16)
                        .foregroundStyle(.primary)
                    Spacer()
                    Text("\(item.page + 1)").monospacedDigit().foregroundStyle(.secondary)
                }
            }
            .listRowBackground(item.page <= currentPage && isLastBefore(item) ? Color.accentColor.opacity(0.12) : nil)
        }
        .navigationTitle(L("目次"))
        .toolbar {
            ToolbarItem(placement: .confirmationAction) { Button(L("閉じる")) { dismiss() } }
        }
    }

    /// 今のページを含む項目か（今のページ以前で最後の項目）
    private func isLastBefore(_ item: TocItem) -> Bool {
        toc.last { $0.page <= currentPage } == item
    }
}

#if canImport(UIKit) && canImport(PDFKit)
/// PDF をそのまま表示する。開いたときは今読んでいるページを出す
struct PDFPageScreen: View {
    let url: URL
    let page: Int
    /// 「ここから読む」で、表示中のページの本文へ移る
    let readFrom: (Int) -> Void
    @State private var shownPage: Int
    @Environment(\.dismiss) private var dismiss

    init(url: URL, page: Int, readFrom: @escaping (Int) -> Void) {
        self.url = url
        self.page = page
        self.readFrom = readFrom
        _shownPage = State(initialValue: page)
    }

    var body: some View {
        PDFKitView(url: url, page: page, shownPage: $shownPage)
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle(L("\(shownPage + 1) ページ"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(L("閉じる")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L("ここから読む")) {
                        readFrom(shownPage)
                        dismiss()
                    }
                }
            }
    }
}

private struct PDFKitView: UIViewRepresentable {
    let url: URL
    let page: Int
    @Binding var shownPage: Int

    func makeCoordinator() -> Coordinator { Coordinator(shownPage: $shownPage) }

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        if let doc = PDFDocument(url: url) {
            view.document = doc
            if let p = doc.page(at: min(max(0, page), max(0, doc.pageCount - 1))) { view.go(to: p) }
        }
        context.coordinator.observe(view)
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {}

    final class Coordinator: NSObject {
        let shownPage: Binding<Int>
        private var token: NSObjectProtocol?

        init(shownPage: Binding<Int>) { self.shownPage = shownPage }

        func observe(_ view: PDFView) {
            token = NotificationCenter.default.addObserver(forName: .PDFViewPageChanged, object: view, queue: .main) { [weak self, weak view] _ in
                guard let view, let page = view.currentPage, let doc = view.document else { return }
                self?.shownPage.wrappedValue = doc.index(for: page)
            }
        }

        deinit {
            if let token { NotificationCenter.default.removeObserver(token) }
        }
    }
}
#endif
