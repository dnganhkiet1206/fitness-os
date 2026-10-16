# TestFlight — danh sách trước khi đẩy bản native (16/10)

Bản native thay bản RN trên cùng bundle `com.ascnd.fitnessos` (bản RN chưa từng phát hành).

## Đã có trong repo (tự động)

- **Số build tự tăng** — build phase "Set build number" (`tools/set-build-number.sh`) đặt
  `CFBundleVersion` = số commit trên nhánh cho app VÀ widget ở mọi bản Release. Không phải sửa tay;
  TestFlight không còn từ chối vì trùng số build. Muốn lên bản mới (0.2.0…) thì sửa `MARKETING_VERSION`
  trong `project.yml`.
- **Privacy manifest** — `ASCND/PrivacyInfo.xcprivacy` và `ASCNDWidgets/PrivacyInfo.xcprivacy`
  (UserDefaults: CA92.1 + 1C8F.1; không tracking). Sentry và PostHog có manifest riêng trong SDK.
- **dSYM lên Sentry** — build phase "Upload dSYMs to Sentry" ở bản Release (cần bước 1 bên dưới).
- `ITSAppUsesNonExemptEncryption = NO` đã có trong Info.plist (chỉ HTTPS chuẩn) — không phải trả lời
  câu hỏi mã hoá mỗi lần upload.

## Chủ dự án làm (một lần)

1. **Sentry**: https://ascnd-fitness.sentry.io/settings/auth-tokens/ → tạo *Organization Token* →
   trên máy Archive chạy `sentry-cli login`, dán token. (Không có token: build vẫn chạy, chỉ thiếu dSYM.)
2. **Khoá đo lường cho bản phát hành**: `Config/Backend.local.xcconfig` trên máy Archive phải có
   `ASCND_SENTRY_DSN`, `ASCND_POSTHOG_KEY`, `ASCND_POSTHOG_HOST` (đã có trên máy này). Thiếu → app chạy
   bình thường nhưng không gửi crash / sự kiện.
3. **App Store Connect → App Privacy** — điền khớp manifest:

   | Loại dữ liệu | Gắn với danh tính | Dùng cho | Tracking |
   |---|---|---|---|
   | Health (Apple Health: bước, nhịp tim, HRV, giấc ngủ) | Có | Chức năng app | Không |
   | Fitness (buổi tập, bài tập) | Có | Chức năng app | Không |
   | Photos (ảnh tiến trình, ảnh món ăn gửi AI) | Có | Chức năng app | Không |
   | Email, Name | Có | Chức năng app (tài khoản) | Không |
   | Other user content (bài đăng, bình luận, tin nhắn, câu hỏi cho Koa) | Có | Chức năng app | Không |
   | User ID | Có | Chức năng app, Analytics | Không |
   | Crash data (Sentry) | Có | Analytics, Chức năng app | Không |
   | Performance data (Sentry) | Có | Analytics | Không |
   | Product interaction (PostHog) | Có | Analytics | Không |

   Ghi chú cho người duyệt: câu hỏi cho Koa Coach, ảnh món ăn và số liệu tóm tắt được gửi tới nhà cung
   cấp AI (Google Gemini) qua máy chủ của ASCND để tạo câu trả lời; không dùng để quảng cáo.
4. **Chính sách quyền riêng tư**: thêm một đoạn về ASCND Intelligence (dữ liệu gửi cho AI như trên) và
   về Sentry / PostHog vào trang privacy policy mà App Store Connect trỏ tới.
5. **Archive**: Xcode → scheme ASCND → Any iOS Device → Product → Archive → Distribute → TestFlight.

## Chưa kiểm (NOT RUN)

- iOS 18–25 (chưa có máy / simulator) — ô chat kính có fallback vật liệu mờ, chưa nhìn thấy thật.
- Camera thật cho chụp món (simulator không có camera; đã kiểm qua thư viện ảnh).
- Gói Gemini miễn phí có giới hạn lượt và hay quá tải (503) — trước khi mở cho nhiều người nên cân nhắc
  khoá trả phí (`ASCND_AI_KEY`, đổi `ASCND_AI_MODEL` nếu cần).
