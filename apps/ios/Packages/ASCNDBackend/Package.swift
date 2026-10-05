// swift-tools-version: 6.0
//
// ASCNDBackend — chỗ DUY NHẤT của app iOS nói chuyện với Supabase (#224).
//
// Package riêng, không phải một target trong ASCNDKit: ASCNDKit không có
// dependency bên thứ ba nào và build được trên Linux (job `core-linux`). Kéo
// supabase-swift vào đó thì mọi lượt test Core đều phải tải và dựng nó.
import PackageDescription

let package = Package(
  name: "ASCNDBackend",
  platforms: [.iOS(.v18), .macOS(.v15)],
  products: [
    .library(name: "ASCNDBackend", targets: ["ASCNDBackend"]),
  ],
  dependencies: [
    .package(path: "../ASCNDKit"),
    .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.0.0"),
  ],
  targets: [
    .target(
      name: "ASCNDBackend",
      dependencies: [
        .product(name: "ASCNDCore", package: "ASCNDKit"),
        .product(name: "Supabase", package: "supabase-swift"),
      ],
      swiftSettings: [.enableUpcomingFeature("ExistentialAny")]
    ),
    .testTarget(name: "ASCNDBackendTests", dependencies: ["ASCNDBackend"]),
  ],
  swiftLanguageModes: [.v6]
)
