import AppKit
import SwiftUI

@main
struct AgentKumiteControlRoomApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var model = ControlRoomAppModel()

    var body: some Scene {
        WindowGroup("Agent Kumite Control Room") {
            ControlRoomRootView(model: model)
        }
        .defaultSize(width: 1480, height: 960)
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApplication.shared.setActivationPolicy(.regular)

        DispatchQueue.main.async {
            NSApplication.shared.activate(ignoringOtherApps: true)
            NSApplication.shared.windows.first?.makeKeyAndOrderFront(nil)
        }
    }
}
