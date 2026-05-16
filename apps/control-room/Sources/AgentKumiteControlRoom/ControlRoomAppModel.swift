import Foundation
import Observation

@MainActor
@Observable
final class ControlRoomAppModel {
    var selectedScreen: ControlRoomScreen = .arena
    var selectedInspector: InspectorItem?
    var loadedProjection: LoadedProjection?
    var loadedFileURL: URL?
    var errorMessage: String?
    var isImporterPresented = false
    var presentation = PresentationState(beatCount: 0)

    private let launchProjectionURL: URL?
    private var attemptedLaunchLoad = false

    init(arguments: [String] = ProcessInfo.processInfo.arguments) {
        launchProjectionURL = LaunchOptions.projectionURL(from: arguments)
    }

    var loadedFileName: String? {
        loadedFileURL?.lastPathComponent
    }

    func beginImport() {
        isImporterPresented = true
    }

    func clearError() {
        errorMessage = nil
    }

    func inspect(_ item: InspectorItem?) {
        selectedInspector = item
    }

    // Transport — the Arena routes attention to one focal beat at a time.
    // PresentationState mutation stays funneled through the model so it
    // remains the single owner of the presentation clock.
    func focusNextBeat() {
        presentation.stepForward()
    }

    func focusPreviousBeat() {
        presentation.stepBackward()
    }

    func togglePlayback() {
        if presentation.isPlaying {
            presentation.pause()
        } else {
            presentation.play()
        }
    }

    func focusBeat(at index: Int) {
        presentation.jump(to: index)
    }

    func resetPresentation() {
        presentation.reset()
    }

    func loadLaunchProjectionIfNeeded() {
        guard attemptedLaunchLoad == false else {
            return
        }

        attemptedLaunchLoad = true

        guard let launchProjectionURL else {
            return
        }

        openProjection(at: launchProjectionURL)
    }

    func handleImport(result: Result<URL, Error>) {
        isImporterPresented = false

        switch result {
        case .success(let url):
            openProjection(at: url)
        case .failure(let error):
            let nsError = error as NSError
            if nsError.domain == NSCocoaErrorDomain, nsError.code == NSUserCancelledError {
                return
            }

            errorMessage = error.localizedDescription
        }
    }

    func openProjection(at url: URL) {
        let accessedSecurityScope = url.startAccessingSecurityScopedResource()
        defer {
            if accessedSecurityScope {
                url.stopAccessingSecurityScopedResource()
            }
        }

        do {
            let data = try Data(contentsOf: url)
            let loadedProjection = try LoadedProjection.load(from: data)
            self.loadedProjection = loadedProjection
            loadedFileURL = url
            errorMessage = nil
            selectedInspector = nil
            presentation.rebind(beatCount: loadedProjection.replay.markers.count)

            if loadedProjection.aftermath == nil, selectedScreen == .aftermathLedger {
                selectedScreen = .liveOps
            }
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}

enum LaunchOptions {
    static func projectionURL(from arguments: [String]) -> URL? {
        guard let flagIndex = arguments.firstIndex(of: "--projection") else {
            return nil
        }

        let valueIndex = arguments.index(after: flagIndex)
        guard arguments.indices.contains(valueIndex) else {
            return nil
        }

        let rawValue = arguments[valueIndex]
        if let url = URL(string: rawValue), url.scheme != nil {
            return url
        }

        return URL(fileURLWithPath: rawValue)
    }
}
