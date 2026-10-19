// アプリの最初の画面（本棚）。アプリ本体（ios/FlowaApp）からはこれだけを使う。
// 「ファイル」アプリや共有メニューから渡されたファイルも、ここで取り込んで開く。

import SwiftUI
import FlowaKit

public struct FlowaRootView: View {
    @State private var store = BookStore()
    @State private var settings = ReaderSettings.load()
    @State private var job = ImportJob()
    @State private var path: [BookMeta] = []
    @State private var pro = ProStore(forcePro: Demo.enabled && !Demo.paywall)
    @State private var showPro = Demo.paywall

    public init() {}

    public var body: some View {
        NavigationStack(path: $path) {
            LibraryView(store: store, settings: $settings, job: job)
        }
        .onChange(of: settings) { _, new in new.save() }
        .onOpenURL { url in
            job.run(url, store: store, isPro: pro.isPro, removeAfter: url.path.contains("/Inbox/")) { meta in path = [meta] }
        }
        // 無料版の上限で取り込みを止めたら、Pro の案内を出す
        .onChange(of: job.held != nil) { _, held in if held { showPro = true } }
        // 返金などで Pro でなくなったら、Pro だけの配色をやめる
        .onChange(of: pro.isPro) { _, _ in limitTheme() }
        .sheet(isPresented: $showPro, onDismiss: { job.resume(store: store, isPro: pro.isPro) }) {
            NavigationStack {
                ProView(reason: job.held != nil ? L("無料版で本棚に置ける PDF は \(ProLimits.freePDFBooks) 冊までです。") : nil)
            }
        }
        .task {
            if let theme = Demo.value("-FlowaDemoTheme") { settings.theme = theme }
            await Demo.prepare(store: store, job: job) { path = [$0] }
        }
        .task {
            await pro.start()
            limitTheme()
        }
        // 本棚・設定・Pro の案内のどこからでも使えるようにする（シートにも届くよう最後に置く）
        .environment(pro)
    }

    private func limitTheme() {
        if !ProLimits.themeAllowed(settings.theme, isPro: pro.isPro) { settings.theme = "auto" }
    }
}

/// 画面写真を撮るための起動（-FlowaDemo）。サンプルを取り込み、最初の本を開く
enum Demo {
    static var enabled: Bool { ProcessInfo.processInfo.arguments.contains("-FlowaDemo") }
    /// 読書画面で、何単位進めた所を見せるか（-FlowaDemoStep 8）
    static var step: Int { value("-FlowaDemoStep").flatMap { Int($0) } ?? 0 }

    /// 起動時の引数「名前 値」の値
    static func value(_ name: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard enabled, let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
        return args[i + 1]
    }
    static var openFirst: Bool { ProcessInfo.processInfo.arguments.contains("-FlowaDemoOpen") }
    /// 起動してすぐ Pro の案内を出す（-FlowaDemoPaywall。このときは購入前の状態で動かす）
    static var paywall: Bool { enabled && ProcessInfo.processInfo.arguments.contains("-FlowaDemoPaywall") }

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
    /// 無料版の PDF の冊数に数えないファイル名
    static let nameSet = Set(names)

    static var urls: [URL] {
        names.compactMap { n in
            Bundle.main.url(forResource: (n as NSString).deletingPathExtension, withExtension: (n as NSString).pathExtension)
        }
    }
}
