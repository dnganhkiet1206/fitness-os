// swift-tools-version: 6.0
//
// ASCNDKit — mọi module của app iOS, một package cục bộ, nhiều target.
//
// Vì sao một package chứ không mỗi module một package: thêm module là thêm một
// `.target` ở đây, không phải sửa `project.yml` và không chạm `.pbxproj`. Ranh
// giới module vẫn được trình biên dịch giữ (internal không lọt ra ngoài).
//
// Ranh giới:
//   ASCNDCore         domain thuần, không UI, không mạng — build và test được
//                     trên Linux. Logic dùng chung với RN được khoá bằng golden
//                     vectors (spec/vectors) ở đây.
//   ASCNDDesignSystem tokens + component (C sở hữu, #229).
//   ASCNDTestSupport  chỉ cho test: đọc golden vectors, đồng hồ cố định.
//
// Target Backend / Sync / Feature* thêm khi việc của chúng bắt đầu (#224,
// #225, #228) — không dựng trước.
import PackageDescription

let swiftSettings: [SwiftSetting] = [
  // Swift 6 language mode đã bật strict concurrency; hai cờ dưới bắt thêm lỗi
  // sớm mà không đổi ngữ nghĩa.
  .enableUpcomingFeature("ExistentialAny"),
  .enableUpcomingFeature("InternalImportsByDefault"),
]

let package = Package(
  name: "ASCNDKit",
  defaultLocalization: "en",
  platforms: [.iOS(.v18), .macOS(.v15)],
  products: [
    .library(name: "ASCNDCore", targets: ["ASCNDCore"]),
    .library(name: "ASCNDDesignSystem", targets: ["ASCNDDesignSystem"]),
    .library(name: "ASCNDLiveActivity", targets: ["ASCNDLiveActivity"]),
  ],
  targets: [
    .target(name: "ASCNDCore", swiftSettings: swiftSettings),
    .target(name: "ASCNDDesignSystem", dependencies: ["ASCNDCore"], swiftSettings: swiftSettings),
    // Live Activity dùng chung app + widget extension (chỉ có nội dung trên iOS).
    .target(name: "ASCNDLiveActivity", dependencies: ["ASCNDCore"], swiftSettings: swiftSettings),
    .target(name: "ASCNDTestSupport", dependencies: ["ASCNDCore"], swiftSettings: swiftSettings),
    .testTarget(
      name: "ASCNDCoreTests",
      dependencies: ["ASCNDCore", "ASCNDTestSupport"],
      resources: [.copy("Fixtures")],
      swiftSettings: swiftSettings
    ),
  ],
  swiftLanguageModes: [.v6]
)
