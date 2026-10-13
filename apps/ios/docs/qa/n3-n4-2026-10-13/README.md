# QA trên simulator: N3 (thẻ tập luyện) và N4 (ba vòng hoạt động), 13/10/2026

**Người chạy:** B (#527).

**Máy:** iPhone 17 Pro simulator, iOS 26.5, Xcode 26.6. Build Debug.

**Tài khoản:** tài khoản thật của chủ dự án.

**Build:**
- Ảnh "before fix" chụp ở `af7235b5`.
- Các ảnh còn lại chụp ở commit sửa `3c2c3f51`.

**Cách đổi chế độ:**
- Dark mode: `xcrun simctl ui <dev> appearance dark`.
- Cỡ chữ: `xcrun simctl ui <dev> content_size accessibility-extra-extra-extra-large`.
- Ngôn ngữ: `defaults write com.ascnd.fitnessos.dev ascnd_lang en|es` rồi mở lại app.
- Reduce Motion: `defaults write com.apple.Accessibility ReduceMotionEnabled -bool true`.

**Dữ liệu ước lượng:** từ một buổi thử ghi qua app: "Tập Ngực", 3 × Bench Press 25 kg × 10, RPE 7. Chủ dự án đã xoá buổi này sau khi chạy.

| Ảnh | Nội dung |
|---|---|
| `today-more-vi-light.jpg` | Hai hàng "Tập luyện tuần này" / "Hoạt động" trong "Thêm về hôm nay" |
| `n4-empty-vi-light.jpg` | N4 rỗng, chụp trước khi đổi rãnh / nhãn |
| `n4-explainer-vi-light.jpg` | Tấm "?" của N4 |
| `n3-data-vi-light.jpg`, `n3-data-vi-dark.jpg` | N3 có dữ liệu cũ: buổi gần nhất cách 23 ngày, ghi chú "buổi cũ" |
| `n3-explainer-vi-light.jpg` | Tấm "?" của N3 |
| `n4-stale-bug-before-fix-vi-dark.jpg` | **Lỗi:** vừa ghi buổi mà N4 vẫn báo "chưa có hoạt động" |
| `n4-estimated-vi-dark.jpg`, `n4-estimated-en-dark.jpg` | Số ước lượng `~25` kcal / `~6` phút kèm dòng chú; rãnh tô màu và nhãn có chấm |
| `n4-axxxl-truncation-before-fix.jpg` | **Lỗi:** ba cột bị cắt chữ ở cỡ AX5 |
| `n4-axxxl-after-fix.jpg` | Cỡ AX5 sau khi sửa: ba hàng |
| `n4-es-reduce-motion-0.6s.jpg` | es + Reduce Motion: 0,6 s sau khi chạm, vòng đã vẽ đủ |
| `n3-data-es-dark.jpg` | N3 es với buổi thử: "79% más pesada", vạch thói quen, cột tuần này |
| `n4-empty-after-delete-no-relaunch-vi-light.jpg` | Sau khi xoá buổi thử, mở lại màn **không khởi động lại app**: về rỗng (xác nhận bản sửa) |
| `today-more-axxxl-dark-findings.jpg` | Phát hiện cho agent khác: `TodayMore` (tiêu đề không phóng to theo cỡ chữ) và `HealthSyncCard` (bẻ chữ giữa từ) |
| `today-more-healthcard-axxxl-after-fix.jpg` | AX5 sau khi B sửa: tiêu đề hàng lớn theo cỡ chữ, số đo xuống dưới; thẻ Apple Health xếp dọc |
| `workout-logger-axxxl-finding.jpg` | Phát hiện, **chưa sửa**: màn ghi set của tab Tập luyện ở AX5 bẻ "1/3" và "kg" từng ký tự theo chiều dọc |

**Chưa chạy:**
- VoiceOver: NOT RUN (chỉ soát nhãn trong mã).
- Thiết bị thật: NOT RUN.
- Vòng Move / Steps từ Apple Health: simulator không có dữ liệu HealthKit, nên chỉ thấy được nhánh ước lượng.
