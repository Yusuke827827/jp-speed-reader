// アプリの最初の画面（本棚）。アプリ本体（ios/FlowaApp）からはこれだけを使う。
// 「ファイル」アプリや共有メニューから渡されたファイルも、ここで取り込んで開く。

import SwiftUI
import FlowaKit

public struct FlowaRootView: View {
    @State private var store = BookStore()
    @State private var settings = ReaderSettings.load()
    @State private var job = ImportJob()
    @State private var path: [BookMeta] = []

    public init() {}

    public var body: some View {
        NavigationStack(path: $path) {
            LibraryView(store: store, settings: $settings, job: job)
        }
        .onChange(of: settings) { _, new in new.save() }
        .onOpenURL { url in
            job.run(url, store: store, removeAfter: url.path.contains("/Inbox/")) { meta in path = [meta] }
        }
        .task { await Demo.prepare(store: store, job: job) { path = [$0] } }
    }
}

/// 画面写真を撮るための起動（-FlowaDemo）。サンプルを取り込み、最初の本を開く
enum Demo {
    static var enabled: Bool { ProcessInfo.processInfo.arguments.contains("-FlowaDemo") }
    /// 読書画面で、何単位進めた所を見せるか（-FlowaDemoStep 8）
    static var step: Int {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-FlowaDemoStep"), i + 1 < args.count else { return 0 }
        return Int(args[i + 1]) ?? 0
    }
    static var openFirst: Bool { ProcessInfo.processInfo.arguments.contains("-FlowaDemoOpen") }

    @MainActor
    static func prepare(store: BookStore, job: ImportJob, open: @escaping (BookMeta) -> Void) async {
        guard enabled else { return }
        if store.books.isEmpty {
            for url in Samples.urls.reversed() { await job.importNow(url, store: store) }
        }
        if openFirst, let first = store.books.first { open(first) }
    }
}

/// アプリに同梱したサンプル（ios/FlowaApp の project.yml で public/samples から入れる）
enum Samples {
    static let names = ["sample-vertical.pdf", "sample-english-paper.pdf", "sample-aozora.txt"]

    static var urls: [URL] {
        names.compactMap { n in
            Bundle.main.url(forResource: (n as NSString).deletingPathExtension, withExtension: (n as NSString).pathExtension)
        }
    }
}
