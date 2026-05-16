// swift-tools-version: 6.3
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "AgentKumiteControlRoom",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .executable(
            name: "AgentKumiteControlRoom",
            targets: ["AgentKumiteControlRoom"]
        ),
    ],
    targets: [
        .executableTarget(
            name: "AgentKumiteControlRoom"
        ),
        .testTarget(
            name: "AgentKumiteControlRoomTests",
            dependencies: ["AgentKumiteControlRoom"]
        ),
    ],
    swiftLanguageModes: [.v6]
)
