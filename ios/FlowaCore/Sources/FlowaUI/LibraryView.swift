// 本棚: 取り込んだ本の一覧、ファイルの取り込み、削除。

import SwiftUI
import UniformTypeIdentifiers
import FlowaKit

/// 取り込みの進み具合（取り込みは画面とは別の処理で行い、ここに結果を返す）
@Observable
@MainActor
final class ImportJob {
    var running = false
    var done = 0
    var total = 0
    var error: String?
    /// 無料版の上限で止めた取り込み。Pro にしたら resume で続ける
    var held: Held?

    struct Held {
        var url: URL
        var removeAfter: Bool
        var done: ((BookMeta) -> Void)?
    }

    /// 取り込みを始める。終わったら done を呼ぶ。removeAfter は、他のアプリから渡された一時ファイルを消すとき。
    /// 無料版で PDF が上限に達していれば取り込まず、held に残す（画面は Pro の案内を出す）
    func run(_ url: URL, store: BookStore, isPro: Bool, removeAfter: Bool = false, done: ((BookMeta) -> Void)? = nil) {
        guard !running else { return }
        if url.pathExtension.lowercased() == "pdf", !ProLimits.canAddPDF(books: store.books, samples: Samples.nameSet, isPro: isPro) {
            held = Held(url: url, removeAfter: removeAfter, done: done)
            return
        }
        Task {
            if let meta = await importNow(url, store: store) { done?(meta) }
            if removeAfter { try? FileManager.default.removeItem(at: url) }
        }
    }

    /// Pro の案内を閉じたとき。Pro になっていれば止めた取り込みを続け、なっていなければやめる
    func resume(store: BookStore, isPro: Bool) {
        guard let h = held else { return }
        held = nil
        if isPro {
            run(h.url, store: store, isPro: true, removeAfter: h.removeAfter, done: h.done)
        } else if h.removeAfter {
            try? FileManager.default.removeItem(at: h.url)
        }
    }

    @discardableResult
    func importNow(_ url: URL, store: BookStore) async -> BookMeta? {
        running = true
        done = 0
        total = 0
        defer { running = false }
        let root = store.root
        do {
            let meta = try await Task.detached(priority: .userInitiated) {
                try BookImporter.importFile(url, root: root) { d, t in
                    Task { @MainActor in
                        self.done = d
                        self.total = t
                    }
                }
            }.value
            store.added(meta)
            return meta
        } catch let e as ImportError {
            self.error = Self.message(e)
        } catch {
            self.error = L("ファイルを読み込めませんでした。")
        }
        return nil
    }

    static func message(_ e: ImportError) -> String {
        switch e.kind {
        case .unsupported: return L("対応していないファイルです。PDF（.pdf）かテキストファイル（.txt）を選んでください。")
        case .unreadable: return L("ファイルを読み込めませんでした。iCloud Drive のファイルは、先に「ファイル」アプリでダウンロードしてから選んでください。")
        case .locked: return L("パスワードで保護された PDF は、まだ読み込めません。")
        case .noText: return L("本文が見つかりませんでした。画像だけでできた PDF の文字認識（OCR）は、iOS 版ではまだ使えません。")
        }
    }
}

struct LibraryView: View {
    let store: BookStore
    @Environment(ProStore.self) private var pro
    @Binding var settings: ReaderSettings
    let job: ImportJob
    @State private var importing = false
    @State private var showSettings = false

    var body: some View {
        Group {
            if store.books.isEmpty {
                ContentUnavailableView {
                    Label(L("本棚は空です"), systemImage: "books.vertical")
                } description: {
                    Text(L("PDF やテキストファイル（青空文庫形式も可）を取り込むと、1 文節ずつ画面の中央に表示して読めます。"))
                } actions: {
                    Button(L("ファイルを取り込む")) { importing = true }
                        .buttonStyle(.borderedProminent)
                    if !Samples.urls.isEmpty {
                        Button(L("サンプルで試す")) { importSamples() }
                    }
                }
            } else {
                List {
                    ForEach(store.books) { book in
                        NavigationLink(value: book) { BookRow(book: book) }
                    }
                    .onDelete { offsets in
                        let ids = offsets.map { store.books[$0].id }
                        for id in ids { store.delete(id) }
                    }
                }
            }
        }
        .navigationTitle(L("本棚"))
        .navigationDestination(for: BookMeta.self) { book in
            ReaderScreen(book: book, store: store, settings: $settings)
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { importing = true } label: { Label(L("ファイルを取り込む"), systemImage: "plus") }
                    .disabled(job.running)
            }
            ToolbarItem(placement: .automatic) {
                Button { showSettings = true } label: { Label(L("設定"), systemImage: "gearshape") }
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, .plainText]) { result in
            if case let .success(url) = result { job.run(url, store: store, isPro: pro.isPro) }
        }
        .overlay {
            if job.running {
                VStack(spacing: 12) {
                    if job.total > 0 {
                        ProgressView(value: Double(job.done), total: Double(job.total))
                        Text(L("本文を取り出しています（\(job.done)/\(job.total) ページ）"))
                    } else {
                        ProgressView()
                        Text(L("読み込んでいます…"))
                    }
                }
                .font(.callout)
                .padding(24)
                .frame(maxWidth: 320)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            }
        }
        .alert(L("取り込めませんでした"), isPresented: Binding(get: { job.error != nil }, set: { if !$0 { job.error = nil } })) {
            Button("OK") { job.error = nil }
        } message: {
            Text(job.error ?? "")
        }
        .sheet(isPresented: $showSettings) {
            NavigationStack { SettingsView(settings: $settings) }
        }
    }
}

extension LibraryView {
    /// 同梱のサンプル（縦書きの小説・英語の論文・青空文庫形式のテキスト）を取り込む
    func importSamples() {
        Task {
            for url in Samples.urls.reversed() { await job.importNow(url, store: store) }
        }
    }
}

struct BookRow: View {
    let book: BookMeta

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: book.kind == .pdf ? "doc.richtext" : "doc.plaintext")
                .font(.title2)
                .foregroundStyle(.secondary)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 4) {
                Text(book.title).font(.headline).lineLimit(2)
                if let author = book.author, !author.isEmpty {
                    Text(author).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                }
                HStack(spacing: 8) {
                    ProgressView(value: min(book.percent, 100), total: 100)
                        .frame(maxWidth: 120)
                    Text("\(Int(book.percent))%").font(.caption).monospacedDigit().foregroundStyle(.secondary)
                    if book.emptyPages > 0 {
                        Text(L("画像のページ \(book.emptyPages)")).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}
