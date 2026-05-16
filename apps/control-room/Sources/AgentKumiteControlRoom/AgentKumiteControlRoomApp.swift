import SwiftUI

@main
struct AgentKumiteControlRoomApp: App {
    @State private var model = ControlRoomAppModel()

    var body: some Scene {
        WindowGroup("Agent Kumite Control Room") {
            ControlRoomRootView(model: model)
        }
        .defaultSize(width: 1480, height: 960)
    }
}
