import Foundation
import Observation

@MainActor
@Observable
final class ControlRoomAppModel {
    var selectedScreen: ControlRoomScreen = .home
    var selectedInspector: InspectorItem?
    var loadedProjection: LoadedProjection?
    var loadedFileURL: URL?
    var errorMessage: String?
    var isImporterPresented = false

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
