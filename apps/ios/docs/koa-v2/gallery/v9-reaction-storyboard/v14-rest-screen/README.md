# `v14-rest-screen/`: màn nghỉ có Koa, thay đồng hồ nghỉ cũ (07/11/2026)

**Kiệt:** "biểu cảm xảy ra nhanh quá, story chưa có ý nghĩa; mục này thay cho phần đồng hồ đếm giờ nghỉ cũ, nên phải tích hợp luôn các tính năng nghỉ giữa hiệp và thay cho thiết kế cũ".

## Câu chuyện

Koa bám đúng đồng hồ nghỉ thật (`KoaRestStory`):

| Đoạn | Khi nào | Koa | Chữ, tiếng |
|---|---|---|---|
| Xong set | 4,2 s đầu | Gồng đẩy tạ, run tay → hạ tạ thở "phù" → mệt, thở dốc | "XONG SET!" + set vừa xong, chuông nhỏ |
| Thở cùng bạn | Phần lớn quãng nghỉ | Hít vào 4 s (thân phồng, tai dựng), thở ra 4 s. Mặt thở dốc tới khi hồi được 1/3, rồi dễ chịu | "Hít vào…" / "Thở ra…", vòng thở phồng xẹp |
| Chuẩn bị | 12 s cuối | Lắc vai, nhún tại chỗ, mặt tập trung nhìn người dùng | "Chuẩn bị"; nút "Vào set tiếp" sáng lên |
| Đếm ngược | 3 s cuối | Mỗi giây một cú nhún | Tiếng tích mỗi giây |
| Lên set | 0 s | Giơ tạ, nghiến răng | "Lên set!"; sau 1 s màn tự đóng về thẻ set kế |
| Tạm dừng | Bấm ⏸ | Đứng thở chậm, tập trung chờ | "Nghỉ · Tạm dừng" |

## Tính năng nghỉ (đủ như thẻ cũ)

- Đồng hồ lớn và thanh còn lại; 5 giây cuối đổi màu vàng.
- −15s, tạm dừng / tiếp tục, +15s.
- Set tiếp theo.
- "Vào set tiếp" (bỏ qua nghỉ).
- Set vừa xong, kèm "Sửa".
- Dòng kỷ lục.
- Thu nhỏ để xem cả buổi: dải nghỉ gọn ở đầu danh sách, chạm để mở lại.

## Tệp

`rest-screen-in-app.mp4` và `rest-screen-every-2s.jpg`: simulator iPhone 17 Pro, dữ liệu test, chạy thật trong màn tập. Trong video:
- xong set Squat;
- thở;
- thu nhỏ rồi mở lại;
- −15s ba lần;
- chuẩn bị, đếm ngược, "Lên set!", tự đóng.

Video không có tiếng vì `simctl` không ghi tiếng.
