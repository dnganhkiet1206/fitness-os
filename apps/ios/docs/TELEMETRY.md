# Đo lường — Sentry + PostHog

Bản native gửi crash / lỗi lên **Sentry** và sự kiện sản phẩm lên **PostHog**, để biết
người dùng bỏ app ở đâu (phễu onboarding → bữa đầu → buổi tập đầu, tỉ lệ quay lại).
Code: `ASCND/App/Telemetry.swift`. Chủ dự án chọn 15/10.

## Bật lên

Mặc định **tắt hẳn**: ba biến trong `Config/Backend.xcconfig` để trống → không SDK nào
khởi động, không gửi gì. Điền khoá thật vào `Config/Backend.local.xcconfig` (đã có trong
`.gitignore` — KHÔNG commit), bỏ `https://` vì `//` là chú thích trong `.xcconfig`:

```
ASCND_SENTRY_DSN = <key>@o<org>.ingest.<region>.sentry.io/<project>
ASCND_POSTHOG_KEY = phc_…
ASCND_POSTHOG_HOST = us.i.posthog.com
```

Build lại là chạy. Trên CI / bản phát hành: đặt ba biến này qua cấu hình build bí mật
của CI, không ghi vào repo. Mỗi sự kiện mang `build` = `debug` / `release` để lọc.

### Kiểm tra cấu hình Sentry

Bản Debug chạy với biến môi trường `ASCND_TELEMETRY_TEST=1` gửi một tin
"ASCND: kiểm tra Sentry (debug)" lên Sentry (simulator:
`SIMCTL_CHILD_ASCND_TELEMETRY_TEST=1 xcrun simctl launch …`). Bản Release không có lối này.

### dSYM cho Sentry (stack có tên hàm)

Không có dSYM, stack của crash / treo hiện `<redacted>`. Build phase **Upload dSYMs
to Sentry** (target ASCND, `tools/sentry-upload-dsyms.sh`) chạy ở mọi bản **Release**
— tức mỗi lần Archive cho TestFlight / App Store — và đẩy cả thư mục dSYM (app,
widget, framework) lên org `ascnd-fitness`, project `apple-ios`.

Một lần trên máy Archive:

1. Sentry → Settings → Auth Tokens (https://ascnd-fitness.sentry.io/settings/auth-tokens/)
   → tạo **Organization Token**.
2. Terminal: `sentry-cli login` → dán token (lưu ở `~/.sentryclirc`, ngoài repo).

Thiếu sentry-cli hay thiếu đăng nhập: build vẫn chạy, chỉ có một cảnh báo trong Xcode.
Bản Debug (simulator) không upload — sự kiện từ bản Debug vẫn không có tên hàm.

## Sự kiện (danh sách cố định — `Telemetry.Event`)

| Sự kiện | Khi nào | Thuộc tính |
|---|---|---|
| `app_opened` | app ra tiền cảnh | `days_since_first_open` |
| `onboarding_completed` | xong onboarding | — |
| `health_connected` | kết nối / đồng bộ Apple Health thành công | — |
| `meal_logged` | một bữa vào hàng đợi | — |
| `workout_logged` | ghi tay một buổi | `source=manual` |
| `workout_completed` | chốt một buổi tập | — |
| `quick_log_opened` | mở bảng Ghi nhanh | — |
| `quick_log_pick` | chọn một ô trong Ghi nhanh | `target` (meal/water/sleep/weight/workout) |
| `eat_again_used` | "Ăn lại" ghi xong một bữa | — |
| `start_card_action` | bấm thẻ "Bắt đầu" | `item` (health/meal/workout/hide) |
| `eat_like_yesterday` | ăn như hôm qua | — |
| `day_logged` | Kể cho Koa ghi cả ngày | `items`, `source` |
| `coach_quick_reply` | Koa Coach trả lời bằng câu mẫu, không gọi AI (`CoachQuickReply`) | — |
| `gains_earned` | màn tổng kết buổi tập | `delta`, `planned`, `pr`, `rank_up`… |
| `koa_rank_up` | Koa lên hạng | `rank` |
| `quest_claimed` | nhận thưởng nhiệm vụ | `quest` |
| `comeback_shown` | hiện thẻ quay lại | `days` (tối đa 30, có chỗ không gửi) |
| `comeback_session` | bắt đầu buổi từ thẻ quay lại | — |
| `notification_opened` | mở từ thông báo | `key` |
| `koa_room_opened` | đầu một lượt ở phòng Koa (mở phòng, app trở lại tiền cảnh) | — |
| `koa_room_left` | hết lượt ở phòng (rời phòng, sang màn khác, app ra nền) | `duration` (`under_10s` / `10_30s` / `30_120s` / `over_120s`), `pokes`, `walks` (`0` / `1_3` / `4_plus`) |
| `koa_item_bought` | mua xong đồ ở cửa hàng Koa | `items` |
| `koa_room_cleaned` | dọn phòng bằng xu thành công | — |
| `schedule_created` | tạo lịch tập ở onboarding | `sessions`, `place` |
| `first_session_started` | set đầu của buổi đầu | — |
| `first_session_completed` | xong buổi đầu | — |

## Không gửi

- Không email, tên: người dùng gắn bằng mã tài khoản (UUID).
- Không số liệu sức khoẻ: không cân nặng, giấc ngủ, nhịp tim, kcal, món ăn.
- Không ghi lại phiên (session replay), không tự chụp màn, không sự kiện vòng đời tự động.
- Sentry: `sendDefaultPii = false`; lấy mẫu hiệu năng 20%.

Bật đo lường thì cập nhật mục **App Privacy** trên App Store Connect (dữ liệu chẩn đoán,
dữ liệu sử dụng, mã người dùng — liên kết với người dùng, không dùng để theo dõi quảng cáo).
