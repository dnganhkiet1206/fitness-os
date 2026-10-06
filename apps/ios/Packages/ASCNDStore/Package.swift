// swift-tools-version: 6.0
//
// ASCNDStore — nơi lưu trên máy (ADR-0003 §1): SQLite qua GRDB 7.
//
// Package riêng vì cùng lý do với ASCNDBackend: ASCNDKit không có dependency
// bên thứ ba và build được trên Linux. Logic ở ASCNDCore; đây chỉ lưu và nạp.
import PackageDescription

let package = Package(
  name: "ASCNDStore",
  platforms: [.iOS(.v18), .macOS(.v15)],
  products: [
    .library(name: "ASCNDStore", targets: ["ASCNDStore"]),
  ],
  dependencies: [
    .package(path: "../ASCNDKit"),
    .package(url: "https://github.com/groue/GRDB.swift.git", from: "7.0.0"),
  ],
  targets: [
    .target(
      name: "ASCNDStore",
      dependencies: [
        .product(name: "ASCNDCore", package: "ASCNDKit"),
        .product(name: "GRDB", package: "GRDB.swift"),
      ],
      swiftSettings: [.enableUpcomingFeature("ExistentialAny")]
    ),
    .testTarget(name: "ASCNDStoreTests", dependencies: ["ASCNDStore"]),
  ],
  swiftLanguageModes: [.v6]
)
