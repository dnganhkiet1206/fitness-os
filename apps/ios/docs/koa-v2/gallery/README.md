# Thư viện ảnh của Koa V2

Mỗi thư mục là một phiên bản. Chỉ thêm, không ghi đè. Ảnh đã duyệt muốn đổi thì tạo thư mục mới (`v1-…`) và ghi lý do bên dưới.

| Phiên bản | Ngày | Là gì | Ai duyệt |
|---|---|---|---|
| `v0-baseline/` | 05/11/2026 | Koa hiện tại, chụp từ simulator. Đây là mốc nhận diện (giai đoạn 0) | chưa duyệt (chỉ là ảnh chụp hiện trạng) |

## `v0-baseline/`

Chụp ngày 05/11/2026 trên simulator iPhone 17 Pro, iOS 26.5, Xcode 26.6. Bản build Debug từ `native/ios-rewrite` @ `9cd4ae6d`.

| Tệp | Cách chụp | Cho thấy |
|---|---|---|
| `sim-koa-sheet-top.png` | `SIMCTL_CHILD_ASCND_DEBUG_KOA=1`, mở bảng spec Koa | Hình lớn "Vui vẻ · idle" và lưới biểu cảm |
| `sim-koa-sheet-poses.png` | cùng bảng, cuộn xuống mục 5 | 6 tư thế và 2 dáng cuối (`flop`, `pout`) |
| `sim-koa-room-a.png`, `-b.png` | `-uiTestFakeBackend YES -koaBench live` | Phòng Koa: lúc chào (cười tít mắt) và lúc nghỉ, cách nhau 4 giây |
| `sim-koa-room-8s.mp4` | `simctl io recordVideo` 8 giây, hạ còn 12 khung/giây, rộng 320 | Chuyển động khi đứng ở sân khấu |
| `sim-koa-room-frames-2fps.png` | `ffmpeg` lấy 2 khung/giây từ video gốc, cắt nửa dưới | 14 khung liên tiếp |

**Giới hạn của bộ ảnh này:**
- 2 khung/giây không bắt được cú chớp mắt (khoảng 0,16 giây). Muốn soi chớp mắt thì xem video gốc ở 60 khung/giây.
- Video đã nén. Không dùng để soi chi tiết nét.
