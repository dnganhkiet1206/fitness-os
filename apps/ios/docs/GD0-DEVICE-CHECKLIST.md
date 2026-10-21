# GĐ0 — Kiểm luồng cốt lõi trên iPhone thật

Giai đoạn 0 của `PRODUCT_DECISION_V1.md` (#527): xác minh nền tảng phát hành trước khi đo.
Danh sách chỉ gồm luồng phục vụ lời hứa A: lịch tập → buổi tập → Koa → quay lại.
Chạy trên bản Release cài từ TestFlight, hoặc bản Debug cài qua Xcode nếu chưa có TestFlight.

**Cách ghi kết quả:** mỗi dòng điền ✅ / ❌ / ⏭, kèm ngày, máy và iOS. Dòng ❌ thì mở issue hoặc ghi link Sentry. Không xoá dòng.

**Tài khoản:** dùng một tài khoản test mới do Kiệt tạo hoặc cho phép. Agent không tự tạo tài khoản trên Supabase production.

## A. Lần đầu mở app

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| A1 | Cài, mở, đăng ký bằng email | Vào onboarding, không crash | |
| A2 | Đi hết onboarding, ở màn "Bạn tập mấy buổi" chọn 3 buổi, phòng gym | Màn xem trước có 3 ngày, tên buổi, số phút | |
| A3 | Màn Sẵn sàng → "Tập buổi đầu ngay" | Mở tab Tập luyện. Kế hoạch tuần có đủ 3 mẫu buổi đúng ngày, các ngày còn lại là ngày nghỉ | |
| A4 | Làm lại A1–A3 với "Để lịch nhắc tôi" | Về Hôm nay, thẻ Koa có nhiệm vụ chính đúng buổi của hôm nay (hoặc ngày nghỉ) | |
| A5 | Xin quyền thông báo | Hộp thoại hệ thống hiện đúng một lần | |
| A6 | Apple Health: bỏ qua ("Để sau") | App vẫn chạy đủ, không chặn | |

## B. Buổi tập (lõi)

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| B1 | Bắt đầu buổi đầu | Hiện mẹo buổi đầu; ẩn mẹo thì không hiện lại | |
| B2 | Ghi hiệp, bấm nghỉ | Đồng hồ nghỉ chạy; **khoá màn hình** thì Live Activity / Dynamic Island đếm đúng | |
| B3 | Ra màn hình chính 2 phút rồi quay lại | Buổi tập còn nguyên tiến độ | |
| B4 | Tắt mạng giữa buổi, hoàn thành buổi, bật mạng | Buổi được lưu (outbox), không mất, không nhân đôi | |
| B5 | Hoàn thành buổi | Màn tóm tắt; Koa chuyển "pump"; Gains +10; nhiệm vụ chính xong (+35 xu) | |
| B6 | Lập một kỷ lục (PR) | Màn ăn mừng kỷ lục; Gains +4 | |

## C. Hằng ngày và quay lại

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| C1 | Ngày có buổi, qua giờ quen tập mà chưa tập | Đúng **một** lời nhắc Koa, câu không trách móc | |
| C2 | Ngày nghỉ đã đặt | Không có lời nhắc tập; có nhiệm vụ hồi phục | |
| C3 | Bấm vào lời nhắc | Mở đúng màn | |
| C4 | Widget Koa, widget buổi hôm nay | Đúng trạng thái sau khi tập (có thể trễ vài phút) | |
| C5 | Bỏ 3 ngày rồi mở app | Màn quay lại hiện **một lần**; bắt đầu được buổi ngay | |

## D. Ghi nhanh (Fuel)

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| D1 | Ghi bữa bằng tìm món | Lưu; calo / đạm cập nhật trên Hôm nay | |
| D2 | Quét mã vạch một sản phẩm đóng gói | Ra đúng món hoặc báo không tìm thấy, rõ ràng | |
| D3 | Chụp ảnh món (camera sau) | Lần đầu xin quyền camera; từ chối → có nút Mở Cài đặt | |
| D4 | +nước | Thanh nước tăng; đơn vị giống nhau ở mọi màn | |

## E. Apple Health (không bắt buộc)

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| E1 | Kết nối Health | Đọc được bước, ngủ, nhịp tim nghỉ / HRV nếu có | |
| E2 | Thiếu dữ liệu ngủ | App nói "chưa đủ dữ liệu", không bịa điểm sẵn sàng | |

## F. Tài khoản

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| F1 | Đăng xuất, đăng nhập lại | Dữ liệu còn đủ | |
| F2 | Xoá tài khoản (tài khoản test) | Xoá xong, về màn đăng nhập (App Store bắt buộc) | |

## Đã kiểm trên simulator (21/10, tài khoản test có sẵn)

AI trên server **chạy thật**:
- Coach trả lời theo luồng stream, đúng mục tiêu kcal / đạm.
- Insight hôm nay.
- Tổng kết tuần AI.
- Gợi ý món.

Lỗi tìm thấy (chi tiết trên #527, 21/10):
- **Coach bị cắt giữa câu.** Hỏi "How many workouts… and what is on my plan for tomorrow?" thì nhận "**You have logged 4 workouts recently," rồi dừng. Còn sót dấu `**` và không trả lời phần lịch. Nghi do `MAX_TOKENS = 1024` trong `ai-coach` cộng với phần nháp suy luận của model; chưa xác nhận.
- **Số buổi lệch.** Coach nói 4 buổi (đếm 7 ngày gần nhất), tổng kết tuần nói 2 buổi (tuần lịch).
- **Sẵn sàng lệch.** Hôm nay nói "chưa đủ dữ liệu để chấm", tổng kết tuần lại hiện 92 và khuyên "+2.5kg" dựa trên một điểm duy nhất. Trái quy tắc "thiếu dữ liệu thì nói thiếu".
- **Đơn vị lệch.** Câu của AI viết "2,508", app viết "2.508". Nước tính bằng oz ở tab Dinh dưỡng, bằng L ở tổng kết tuần.
- **Thêm một con số mới.** Tổng kết tuần AI sinh "Điểm tuần 55".

**Chưa kiểm:** Kể cho Koa (`ai-log-parse`), chụp ảnh món (`scan-food`).
