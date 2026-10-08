# ADR-0001: iOS native (SwiftUI), React Native giữ cho Android

- **Trạng thái:** Accepted (05/10/2026). Product Authority: Kiệt.
- **Owner:** A

## Bối cảnh

Kiệt đã thử app React Native (`native/`, Expo 57 / RN 0.86) trên iPhone thật nhiều lần. Các lỗi tương tác trên máy vẫn lặp lại:
- Dynamic Island không cập nhật khi bấm ±15s (#211, #212, #213).
- Vòng tiến độ nhảy theo từng chunk thay vì chạy liên tục.
- Trạng thái trong app và trên Live Activity lệch nhau.
- Toast đè thanh tab (#210).
- Ký target Widget (#204).

Có hai nguyên nhân gốc. Một là phần Swift (Widgets/Live Activity) đi qua bridge và config plugin. Hai là không có Xcode trong vòng lặp phát triển: Swift chưa từng được biên dịch trong CI.

## Quyết định

1. **iOS = app SwiftUI native mới ở `apps/ios/`.** App này là nguồn sự thật cho trải nghiệm iOS. Làm theo vertical slice, bắt đầu từ luồng buổi tập (xem [MIGRATION_STATUS](../MIGRATION_STATUS.md)).
2. **`native/` (React Native) giữ nguyên tên và vị trí** và tiếp tục là app Android. App iOS bản RN vẫn build được cho tới khi iOS native qua GO/NO-GO, không xoá sớm.
3. **Backend (`supabase/`) dùng chung**, là chủ dữ liệu. iOS không tự tính lại số liệu mà server đã tính. Logic dùng chung ở client (điểm, readiness, kinh tế xu…) được khoá bằng **golden vectors** (`spec/vectors/*.json`) chạy ở cả TS và Swift.
4. **Không tạo `apps/web`** cho tới khi có một tính năng web thật (marketing / help / privacy / account, xem Phụ lục B của đánh giá chiến lược).
5. **Legacy ở gốc repo** (Vite, Capacitor, `ios/App`, `package.json` gốc): không xoá cho tới khi có PR dọn riêng, sau khi đã xác minh mọi tham chiếu.

## Lựa chọn kỹ thuật cho `apps/ios`

| Mục | Chọn | Lý do |
|---|---|---|
| Ngôn ngữ | Swift 6, strict concurrency | Bắt lỗi data race lúc biên dịch. Live Activity và timer là nơi lỗi kiểu này hay xuất hiện. |
| UI | SwiftUI + Observation (`@Observable`) | Native, ít boilerplate. UIKit chỉ dùng khi SwiftUI thiếu. |
| Project | **XcodeGen** (`project.yml`). `.xcodeproj` không commit. | Bốn agent sửa song song mà không conflict `.pbxproj`. |
| Module | Một SPM package cục bộ `ASCNDKit` gồm nhiều target (Core, Backend, Sync, DesignSystem, Feature…) | Ranh giới module rõ. Core build và test được trên Linux. |
| iOS tối thiểu | **iOS 18.0** | Có zoom transition (#216), `@Entry`, các API Observation/Swift Testing mới. Liquid Glass (iOS 26) dùng qua `if #available` và có fallback. |
| Backend | `supabase-swift` | Client chính thức. Session lưu trong Keychain. |
| Bundle ID | Release `com.ascnd.fitnessos` (trùng bản RN, để cập nhật đè app đang có); Debug `com.ascnd.fitnessos.dev` | Kiệt cài được cả bản cũ lẫn bản mới cạnh nhau để so sánh. |
| Team | `Z54JL44R9Z` (đã có sẵn trong repo, #204) | Không phải secret. |
| Test | Swift Testing; golden vectors đọc từ `spec/vectors` | Chạy được cả trên macOS CI lẫn Linux. |

## Hệ quả

- **CI cần runner macOS** cho `apps/ios`. Repo public nên runner miễn phí.
- **Build lên iPhone:**
  - Kiệt build từ Xcode trên Mac: `brew install xcodegen && cd apps/ios && xcodegen`, rồi mở `ASCND.xcodeproj`.
  - Phân phối TestFlight qua CI là issue riêng. Việc này cần Kiệt thêm secret App Store Connect, agent không tự làm được.
- **Rủi ro:** hai codebase client phải giữ cùng hành vi. Cách giảm rủi ro là đặt spec và golden vectors trước code, đẩy dữ liệu dẫn xuất lên server, và để D forensic cũ↔mới trên từng slice.
