// Flowa の iOS アプリ本体。画面はすべて FlowaUI（ios/FlowaCore）にある。

import SwiftUI
import FlowaUI

@main
struct FlowaApp: App {
    var body: some Scene {
        WindowGroup {
            FlowaRootView()
        }
    }
}
