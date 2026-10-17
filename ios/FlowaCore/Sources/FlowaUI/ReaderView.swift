// 高速読書の画面: 単位を画面の中央に 1 つずつ表示する。タップで再生・一時停止。

import SwiftUI
import FlowaCore
import FlowaKit
#if canImport(UIKit)
import UIKit
#endif

/// 本のページを読み込んでから ReaderView を出す
struct ReaderScreen: View {
    let book: BookMeta
    let store: BookStore
    @Binding var settings: ReaderSettings
    @State private var model: ReaderModel?
    @State private var failed = false

    var body: some View {
        Group {
            if let model {
                ReaderView(model: model, settings: $settings, pdfURL: book.kind == .pdf ? store.originalFile(of: book) : nil)
            } else if failed {
                ContentUnavailableView(L("本を開けませんでした"), systemImage: "exclamationmark.triangle", description: Text(L("本棚から削除して、もう一度取り込んでください。")))
            } else {
                ProgressView()
            }
        }
        .navigationTitle(book.title)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task {
            guard model == nil else { return }
            guard let pages = try? store.pages(of: book.id) else {
                failed = true
                return
            }
            let m = ReaderModel(book: book, pages: pages, settings: settings)
            let id = book.id
            m.onPosition = { pos, pct in store.savePosition(id, position: pos, percent: pct) }
            model = m
            // 画面写真用: 少し読み進めた所を見せる
            if Demo.enabled, Demo.step > 0 {
                while m.preparing { try? await Task.sleep(for: .milliseconds(50)) }
                m.step(Demo.step)
            }
        }
        .onChange(of: settings) { _, new in
            if model?.settings != new { model?.settings = new }
        }
        .onDisappear { model?.pause() }
    }
}

struct ReaderView: View {
    let model: ReaderModel
    @Binding var settings: ReaderSettings
    /// PDF の本なら元のファイル（ページ表示に使う）
    let pdfURL: URL?
    @State private var scrubbing: Double?
    @State private var sheet: Sheet?
    @Environment(\.colorScheme) private var scheme

    private var theme: ReaderTheme { ReaderTheme.resolve(settings.theme, scheme: scheme) }

    enum Sheet: String, Identifiable {
        case settings, toc, pdf
        var id: String { rawValue }
    }

    var body: some View {
        VStack(spacing: 0) {
            display
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
                .onTapGesture { model.toggle() }
            controls
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
                .opacity(model.playing ? 0.35 : 1)
        }
        .foregroundStyle(theme.fg)
        .tint(theme.accent)
        .background(theme.bg.ignoresSafeArea())
        .environment(\.colorScheme, theme.dark ? .dark : .light)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                if let toc = model.book.toc, !toc.isEmpty {
                    Button { open(.toc) } label: { Label(L("目次"), systemImage: "list.bullet") }
                }
                #if canImport(UIKit)
                if let pdfURL, FileManager.default.fileExists(atPath: pdfURL.path) {
                    Button { open(.pdf) } label: { Label(L("PDFで見る"), systemImage: "doc.richtext") }
                }
                #endif
                Button { open(.settings) } label: { Label(L("設定"), systemImage: "textformat.size") }
            }
        }
        .sheet(item: $sheet) { which in
            NavigationStack {
                switch which {
                case .settings:
                    SettingsView(settings: $settings)
                case .toc:
                    TocView(toc: model.book.toc ?? [], currentPage: model.currentPage) { model.jump(toPage: $0) }
                case .pdf:
                    #if canImport(UIKit)
                    if let pdfURL {
                        PDFPageScreen(url: pdfURL, page: model.currentPage) { model.jump(toPage: $0) }
                    }
                    #else
                    EmptyView()
                    #endif
                }
            }
        }
        #if os(iOS)
        // 再生中は画面を消さない
        .onChange(of: model.playing) { _, playing in UIApplication.shared.isIdleTimerDisabled = playing }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        #endif
    }

    // MARK: - 表示

    @ViewBuilder private var display: some View {
        if model.preparing {
            VStack(spacing: 12) {
                ProgressView()
                Text(L("本文を分けています…")).font(.callout).foregroundStyle(.secondary)
            }
        } else if model.chunks.isEmpty {
            ContentUnavailableView(L("読める本文がありません"), systemImage: "doc.text.magnifyingglass")
        } else {
            VStack(spacing: 24) {
                if vertical {
                    // 縦書き: 列の左右に目印
                    HStack(spacing: 12) {
                        Rectangle().fill(.tint.opacity(0.5)).frame(width: 14, height: 2)
                        VerticalChunk(text: chunkText, size: settings.fontSize, font: chunkFont)
                            .frame(maxWidth: .infinity)
                        Rectangle().fill(.tint.opacity(0.5)).frame(width: 14, height: 2)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .accessibilityElement()
                    .accessibilityLabel(chunkText)
                } else {
                    Spacer(minLength: 0)
                    // 視線を置く位置の目印
                    Rectangle().fill(.tint.opacity(0.5)).frame(width: 2, height: 14)
                    Text(chunkText)
                        .font(chunkFont(settings.fontSize))
                        .lineLimit(3)
                        .minimumScaleFactor(0.3)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)
                        .frame(minHeight: settings.fontSize * 1.6)
                        .accessibilityAddTraits(.updatesFrequently)
                    Rectangle().fill(.tint.opacity(0.5)).frame(width: 2, height: 14)
                    Spacer(minLength: 0)
                }
                if model.finished {
                    Text(L("最後まで読みました")).foregroundStyle(.secondary)
                } else if !model.playing {
                    context
                }
            }
        }
    }

    private var chunkText: String {
        model.chunk.map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) } ?? ""
    }

    /// 縦書きで表示するか。欧文の単位は縦書きの本でも横に表示する
    private var vertical: Bool {
        settings.showsVertical(bookIsVertical: model.book.vertical) && model.chunk?.words == nil
    }

    /// 表示の字体。明朝のとき、日本語・中国語はヒラギノ明朝を指定する
    /// （.serif だけだと、端末の言語が英語のときに日本語がゴシックになる）
    private func chunkFont(_ size: Double) -> Font {
        guard settings.serif else { return .system(size: size) }
        if model.chunk?.words != nil { return .system(size: size, design: .serif) }
        return .custom("HiraMinProN-W3", size: size)
    }

    /// 一時停止中は、今の段落を読んでいる位置に印をつけて見せる
    @ViewBuilder private var context: some View {
        if let p = model.currentParagraph, let c = model.chunk {
            ScrollView {
                Text(highlighted(p.text, start: c.start, end: c.end))
                    .font(.callout)
                    .lineSpacing(4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
            }
            .frame(maxHeight: 160)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 16)
        }
    }

    private func highlighted(_ text: String, start: Int, end: Int) -> AttributedString {
        let ns = text as NSString
        let s = min(max(0, start), ns.length)
        let e = min(max(s, end), ns.length)
        var out = AttributedString(ns.substring(to: s))
        out.foregroundColor = .secondary
        var mid = AttributedString(ns.substring(with: NSRange(location: s, length: e - s)))
        mid.foregroundColor = .accentColor
        mid.font = .callout.bold()
        var rest = AttributedString(ns.substring(from: e))
        rest.foregroundColor = .secondary
        out += mid
        out += rest
        return out
    }

    // MARK: - 操作

    private var controls: some View {
        VStack(spacing: 10) {
            HStack {
                Text("\(Int(scrubbing ?? model.percent))%").monospacedDigit()
                Spacer()
                Text(formatRemaining(model.remainingSeconds))
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            Slider(
                value: Binding(get: { scrubbing ?? model.percent }, set: { scrubbing = $0 }),
                in: 0...100,
                onEditingChanged: { editing in
                    if !editing, let v = scrubbing {
                        model.seek(percent: v)
                        scrubbing = nil
                    }
                }
            )
            .accessibilityLabel(L("読んでいる位置"))
            HStack(spacing: 0) {
                controlButton("backward.end.fill", L("前の段落")) { model.previousParagraph() }
                controlButton("chevron.backward", L("1つ戻る")) { model.step(-1) }
                Button { model.toggle() } label: {
                    Image(systemName: model.playing ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 56))
                }
                .frame(maxWidth: .infinity)
                .accessibilityLabel(model.playing ? L("一時停止") : L("再生"))
                controlButton("chevron.forward", L("1つ進む")) { model.step(1) }
                controlButton("forward.end.fill", L("次の段落")) { model.nextParagraph() }
            }
            HStack(spacing: 16) {
                Button { changeSpeed(-1) } label: { Image(systemName: "minus.circle") }
                    .accessibilityLabel(L("遅くする"))
                Text(model.latin ? "\(settings.wpm) WPM" : L("\(settings.cpm) 字/分"))
                    .monospacedDigit()
                    .frame(minWidth: 110)
                Button { changeSpeed(1) } label: { Image(systemName: "plus.circle") }
                    .accessibilityLabel(L("速くする"))
            }
            .font(.title3)
            if model.speedLimited {
                Text(L("1単位の表示時間が最短に達したため、設定より遅くなります")).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private func controlButton(_ icon: String, _ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon).font(.title2) }
            .frame(maxWidth: .infinity)
            .accessibilityLabel(label)
            .disabled(model.preparing)
    }

    /// 再生を止めてから別の画面を出す
    private func open(_ which: Sheet) {
        model.pause()
        sheet = which
    }

    private func changeSpeed(_ dir: Int) {
        model.changeSpeed(dir)
        settings = model.settings
    }
}
