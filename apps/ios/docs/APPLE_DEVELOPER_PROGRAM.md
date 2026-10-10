# Apple Developer Program — tính năng nào cần membership trả phí

Audit của E theo chỉ thị #527 6093754296, trên HEAD `8c71699b`. Nguồn là bảng chính thức
"Supported capabilities (iOS)" (developer.apple.com/help/account/reference/supported-capabilities-ios),
đọc ngày 10/10/2026. Bảng có ba cột:

- **ADP:** Apple Developer Program, $99/năm.
- **ADEP:** Enterprise.
- **Apple Developer:** tài khoản miễn phí / Personal Team. Apple ghi rõ cột này *"can't distribute apps"*.

Cấu hình đối chiếu: `project.yml`, `ASCND/ASCND.entitlements`, `ASCNDWidgets/ASCNDWidgets.entitlements`.

## Bảng tính năng

Cột (a) là chạy trên simulator, (b) là chạy trên máy thật với Personal Team miễn phí, (c) là cần ADP.

| Tính năng | Capability / entitlement trong repo | (a) | (b) | (c) | Điểm vào UI | Trạng thái native |
|---|---|---|---|---|---|---|
| Đăng nhập / đăng ký / quên mật khẩu bằng email | không | ✅ | ✅ | — | `AuthView` | bật |
| **Sign in with Apple** | `com.apple.developer.applesignin` (**chưa khai** trong `project.yml`) | ❌ | ❌ | **✅ chỉ ADP**[^1] | nút dưới form ở `AuthView` | **ẩn**: cờ `ASCNDSignInWithApple` = `NO` |
| Apple Health: đọc sinh trắc / bước / giấc ngủ, ghi ngược buổi tập | `com.apple.developer.healthkit` | 🟡 không có dữ liệu cảm biến thật | ✅ HealthKit có ở cột Apple Developer | — | Today (`HealthSyncCard`), Trợ lý, Sinh trắc học | bật |
| Widget màn hình chính, dữ liệu dùng chung qua App Group | `com.apple.security.application-groups` (app + widget) | ✅ | ✅ App groups có ở cột Apple Developer | — | widget hệ thống | bật |
| Live Activity / Dynamic Island quãng nghỉ | không (`NSSupportsLiveActivities`, không dùng push update) | ✅ | ✅ | — | màn tập | bật |
| Nhắc nhở cục bộ | không (`UNUserNotificationCenter` cục bộ, không dùng push) | ✅ | ✅ | — | Cài đặt → Nhắc nhở | bật |
| Ảnh tiến trình: chụp bằng camera | không (`NSCameraUsageDescription`) | ❌ simulator không có camera | ✅ | — | Trợ lý → Ảnh tiến trình | bật; chọn ảnh từ thư viện chạy được cả (a) |
| Deep link `ascnd://` (email xác nhận / đặt lại mật khẩu) | không (URL scheme) | ✅ | ✅ | — | — | bật |
| Phát hành TestFlight / App Store | — | — | ❌ | **✅ chỉ ADP** | — | ngoài app |

[^1]: Bảng của Apple: Sign in with Apple chỉ có ở cột ADP, không có ở ADEP và cột Apple Developer.

Không dùng: Push notifications, Time Sensitive Notifications, Associated domains, iCloud, In-App Purchase,
Apple Pay, WeatherKit. Theo bảng, các mục này đều cần ADP. Repo không khai entitlement nào trong số đó.

**Kết luận:** chỉ một tính năng người dùng bị chặn bởi membership là nút Sign in with Apple. Mọi tính năng
khác chạy được với Personal Team miễn phí, nên **không ẩn**.

## Sign in with Apple — cách đang ẩn và cách bật

- **Cơ chế ẩn:**
  - `AppleFeatureGates.signInWithApple(info:)` (Core) đọc khoá Info.plist `ASCNDSignInWithApple`.
  - Khoá này lấy giá trị từ build setting `ASCND_SIGN_IN_WITH_APPLE`, mặc định `"NO"` trong `project.yml`.
  - Nút chỉ hiện khi giá trị rõ ràng là `YES` / `true` / `1`.
  - Test: `AppleFeatureGatesTests`.
- **Khi đã có ADP:**
  1. Đặt `ASCND_SIGN_IN_WITH_APPLE: "YES"` trong `project.yml`.
  2. Thêm entitlement `com.apple.developer.applesignin: [Default]` cho target `ASCND`.
  3. Bật capability cho App ID `com.ascnd.fitnessos` (và `.dev`) trên developer.apple.com.
  4. Đăng nhập email vẫn giữ nguyên.
- **Lý do không để nút hiện khi chưa đủ điều kiện:** thiếu entitlement thì `ASAuthorizationController`
  trả lỗi ngay. Nút hiện ra mà bấm không chạy là lời hứa sai với người dùng.

## PENDING — chưa xác minh được, cần thử trên máy / Kiệt duyệt

1. **`DEVELOPMENT_TEAM: Z54JL44R9Z`** cứng trong `project.yml`. Ký bằng Personal Team khác phải đổi team.
   Bundle ID `com.ascnd.fitnessos.dev` / `.dev.widgets` và App Group `group.com.ascnd.fitnessos` phải đăng ký
   được dưới team ấy. Nếu một team khác đã giữ các ID này thì có thể phải đổi hậu tố. Chưa thử trên máy:
   **PENDING**.
2. **Giới hạn của Personal Team** (hạn profile, số app / App ID): chưa đối chiếu nguồn chính thức trong
   lượt này. **PENDING**, không dựa vào để ẩn tính năng nào.
3. **HealthKit trên simulator:** chỉ ghi "không có dữ liệu cảm biến thật". Hành vi chi tiết chưa thử ở lượt này.

## Checklist trước khi phát hành (bắt buộc)

- [ ] **Tắt chế độ test linh vật:**
  - Đổi `CommunityMascots.testUnlockAll` thành `false` (`Packages/ASCNDKit/Sources/ASCNDCore/Community/CommunityProfile.swift`).
  - Sửa test `testModeIsOnUntilRelease` theo. Test đó cố ý ghim giá trị hiện tại để việc lật là có chủ đích.
  - Hiện cờ đang `true` theo quyết định của Kiệt (#527 6093754296): mọi linh vật, kể cả Drago / Nova trả phí,
    chọn được trong giai đoạn test. Server, xu và quyền mua không đổi.
- [ ] **Sign in with Apple:** bật theo mục trên nếu bản phát hành có nút này (RN có nút).
- [ ] **Ký và phát hành:** cần ADP (TestFlight / App Store).
