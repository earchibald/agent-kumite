import SwiftUI
import UniformTypeIdentifiers

struct ControlRoomRootView: View {
    @Bindable var model: ControlRoomAppModel

    var body: some View {
        NavigationSplitView {
            SidebarView(model: model)
        } detail: {
            PrimaryContentView(model: model)
        }
        .navigationTitle(model.selectedScreen.title)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Open Projection") {
                    model.beginImport()
                }
            }
        }
        .fileImporter(
            isPresented: $model.isImporterPresented,
            allowedContentTypes: [.json]
        ) { result in
            model.handleImport(result: result)
        }
        .inspector(isPresented: inspectorPresented) {
            InspectorDetailView(item: model.selectedInspector)
        }
        .alert("Unable to load projection", isPresented: errorPresented) {
            Button("OK", role: .cancel) {
                model.clearError()
            }
        } message: {
            Text(model.errorMessage ?? "Unknown error")
        }
        .task {
            model.loadLaunchProjectionIfNeeded()
        }
    }

    private var errorPresented: Binding<Bool> {
        Binding(
            get: { model.errorMessage != nil },
            set: { newValue in
                if newValue == false {
                    model.clearError()
                }
            }
        )
    }

    private var inspectorPresented: Binding<Bool> {
        Binding(
            get: { model.selectedInspector != nil },
            set: { newValue in
                if newValue == false {
                    model.inspect(nil)
                }
            }
        )
    }
}

private struct SidebarView: View {
    @Bindable var model: ControlRoomAppModel

    var body: some View {
        List(selection: $model.selectedScreen) {
            Section("Projection") {
                if let projection = model.loadedProjection {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(projection.kind.displayTitle)
                            .font(.headline)
                        Text(model.loadedFileName ?? "Loaded from disk")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text(projection.home.currentCursor.label)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                } else {
                    Text("No projection loaded")
                        .foregroundStyle(.secondary)
                }
            }

            Section("Screens") {
                ForEach(ControlRoomScreen.allCases) { screen in
                    Label(screen.title, systemImage: screen.systemImage)
                        .tag(screen)
                }
            }
        }
        .listStyle(.sidebar)
    }
}

private struct PrimaryContentView: View {
    @Bindable var model: ControlRoomAppModel

    var body: some View {
        if let projection = model.loadedProjection {
            switch model.selectedScreen {
            case .home:
                HomeDashboardView(projection: projection, onInspect: model.inspect)
            case .callsheet:
                CallsheetView(projection: projection, onInspect: model.inspect)
            case .liveOps:
                LiveOpsView(projection: projection, onInspect: model.inspect)
            case .replayLab:
                ReplayLabView(projection: projection, onInspect: model.inspect)
            case .aftermathLedger:
                AftermathLedgerView(projection: projection, onInspect: model.inspect)
            }
        } else {
            ContentUnavailableView(
                "Open a Projection",
                systemImage: "macwindow.on.rectangle",
                description: Text("Load a generated control-room or live-control-room JSON file to render the five-screen GUI shell.")
            )
        }
    }
}
