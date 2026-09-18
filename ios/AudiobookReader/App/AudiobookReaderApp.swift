import SwiftUI

@main
struct AudiobookReaderApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            LibraryView()
                .environment(model)
                .task { await model.load() }
        }
    }
}
