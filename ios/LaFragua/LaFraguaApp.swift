import SwiftUI

@main
struct LaFraguaApp: App {
    var body: some Scene {
        WindowGroup {
            VistaWeb()
                .ignoresSafeArea(.container, edges: .bottom)
                .preferredColorScheme(.dark)
        }
    }
}
