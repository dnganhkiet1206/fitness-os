# Để sau: việc cần máy thật hoặc AI phía server

Chủ dự án (13/10/2026): làm hết những gì simulator làm được; việc cần **iPhone
thật** hoặc **AI** thì ghi lại ở đây để làm sau. Simulator chạy thật = đã thử
trên iPhone (xem PARITY_MATRIX); các mục dưới là phần simulator KHÔNG làm được.

Cách dùng: làm xong một mục thì gạch đi kèm ngày + bằng chứng (ảnh / commit),
không xoá dòng.

## AI (chờ server)

Project Supabase `guqmbqtgxqleuwajvwvg` hiện trả **404 cho mọi edge function**
(đo 13/10 bằng `POST /functions/v1/<tên>` có `apikey`: `scan-food`,
`ai-meal-suggest`, `ai-smart-nudges`, `ai-coach` đều 404, giống tên bịa).
Chủ dự án cần deploy hàm + đặt secret của nhà cung cấp AI. Sau đó:

| Việc | Màn | Ghi chú |
|---|---|---|
| Chụp ảnh món với AI thật (cả hai chế độ Món ăn / Nhãn) | `ScanFoodView` | giao diện đã thử với trả lời giả (`ASCND_FAKE_AI=1`, chỉ Debug) |
| Gợi ý món với AI thật, kiểm tiếng vi / en / es | `MealSuggestCard` | như trên |
| Coach AI, insight hôm nay, tổng kết tuần | tab Trợ lý | port trước đó (E); chưa từng chạy với server |
| Xem lại thông điệp lỗi khi hàm trả 429 / 5xx thật | mọi màn AI | `ai.failure.*` |

## Cần iPhone thật

| Việc | Màn | Vì sao simulator không làm được |
|---|---|---|
| Quét mã vạch bằng camera (EAN-13, UPC, Code 128; mã mờ, ánh sáng yếu) | `ScanBarcodeView` | simulator không có camera (`DataScannerViewController.isSupported == false`) |
| Chụp ảnh món bằng camera sau, xin quyền camera lần đầu / đã từ chối → Mở Cài đặt | `ScanFoodView` | không có camera |
| Apple Health: đọc bước / ngủ / sinh trắc thật, ghi ngược buổi tập | Today, Trợ lý | không có dữ liệu cảm biến thật |
| Nhận push / thông báo nhắc | Nhắc nhở | simulator không nhận push từ APNs |
| VoiceOver đọc đủ các màn Dinh dưỡng (tab, Ghi bữa, Chụp ảnh món, Gợi ý, Nhật ký, Kế hoạch ăn) | Dinh dưỡng | cần VoiceOver thật trên máy để nghe thứ tự / nhãn |
| Live Activity / Dynamic Island của buổi tập trên máy thật | Tập luyện | hành vi khoá màn hình / nền khác simulator |
