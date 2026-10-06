# ASCND iOS (native)

App SwiftUI native. Quyết định: [ADR-0001](../../docs/adr/0001-native-ios-platform-strategy.md). Quy trình: [WORKFLOW](../../docs/WORKFLOW.md). Trạng thái: [MIGRATION_STATUS](../../docs/MIGRATION_STATUS.md).

## Chạy lên iPhone (Mac + Xcode 16 trở lên)

```sh
brew install xcodegen          # chỉ lần đầu
cd apps/ios
xcodegen                       # sinh ASCND.xcodeproj từ project.yml
open ASCND.xcodeproj
```

Trong Xcode:
1. Chọn scheme **ASCND** và chọn iPhone.
2. Bấm Run.

Bản Debug có bundle `com.ascnd.fitnessos.dev`, tên **ASCND Dev**, nên cài được cạnh app RN đang có để so sánh. Ký tự động bằng team `Z54JL44R9Z`.

Sau mỗi lần `git pull` có đổi `project.yml` hoặc thêm/xoá file, chạy lại `xcodegen`. Project không được commit.

## Cấu trúc

```
project.yml                 XcodeGen: target, build settings, bundle id
ASCND/App/                  điểm vào app, TabView gốc
ASCND/Resources/            Assets, Localizable.xcstrings (en/vi/es)
Packages/ASCNDKit/          SPM cục bộ, mỗi module một target
  Sources/ASCNDCore/        domain thuần — KHÔNG import SwiftUI/UIKit
  Sources/ASCNDDesignSystem tokens + component (#229)
  Sources/ASCNDTestSupport  golden vectors, đồng hồ cố định (chỉ cho test)
```

Thêm module bằng cách thêm `.target` vào `Packages/ASCNDKit/Package.swift`, rồi thêm `dependencies` vào `project.yml` nếu app cần dùng.

## Test

```sh
cd apps/ios/Packages/ASCNDKit && swift test     # macOS hoặc Linux (Swift 6.1)
```

`ASCNDCore` phải build được trên Linux: CI job `core-linux` giữ ranh giới này. Golden vectors trong `spec/vectors/*.json` được kiểm định dạng tự động. Runner cho từng luật nằm trong test của module dùng luật đó.

## Chuỗi hiển thị

Chuỗi hiển thị nằm trong `Localizable.xcstrings`, khoá dạng `area.name`, đủ en/vi/es. Không viết cứng chữ hiển thị trong code.
