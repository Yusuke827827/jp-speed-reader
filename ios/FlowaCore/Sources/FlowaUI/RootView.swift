// アプリの最初の画面（本棚）。アプリ本体（ios/FlowaApp）からはこれだけを使う。

import SwiftUI
import FlowaKit

public struct FlowaRootView: View {
    @State private var store = BookStore()
    @State private var settings = ReaderSettings.load()

    public init() {}

    public var body: some View {
        NavigationStack {
            LibraryView(store: store, settings: $settings)
        }
        .onChange(of: settings) { _, new in new.save() }
    }
}
