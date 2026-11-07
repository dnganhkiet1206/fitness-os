# `v23-rest-done-style/`: màn nghỉ làm theo kiểu cảnh xong buổi (07/11/2026)

**Kiệt:** "tại sao không làm theo kiểu như khi buổi tập xong mà bạn cứ làm kiểu gì vậy". Trước đó: "koa cầm tạ kì quá".

**Đổi:** màn nghỉ dùng đúng bộ máy và ngôn ngữ hình của cảnh xong buổi đã duyệt:
- sân khấu tối, quầng cam, vũng sáng trên sàn;
- Koa vector của app diễn một mạch bằng `KoaPerformance` (bake 120 Hz, lớp theo đà, mắt dẫn đầu);
- tiêu đề lớn ở trên, thẻ số ở dưới, pháo giấy, tiếng tối giản;
- không đạo cụ.

| Nhịp | Khi nào | Koa | Chữ / thẻ |
|---|---|---|---|
| Mở đầu (`restIntro`) | 0–5,2 s | Thở dốc, rũ hai tay, hít một hơi, đứng thẳng | "XONG SET!" + "Squat · set 1/2"; thẻ số hiện ra lúc 2,6 s |
| Nghỉ | giữa | Thở đều rất nhẹ, mặt dịu | Thẻ số ở lại suốt quãng nghỉ: mức tạ, reps, so với lần trước (cam nếu tăng) |
| Vươn vai (`restStretch`) | giữa quãng nghỉ ≥ 40 s | Vươn vai giơ tay chữ V, nhón chân, buồn ngủ rồi vui | — |
| Hết giờ (`restGo`) | 3,5 s cuối | Nhún mỗi giây, mặt tập trung; ở 0 giơ tay chữ V | "LƯỢT MÌNH!" + pháo giấy; nút "Vào set tiếp" chuyển màu cam |

**Bảng đồng hồ phía dưới** có đủ tính năng của thẻ nghỉ cũ:
- giờ lớn và thanh tiến độ;
- −15s / tạm dừng / +15s;
- set tiếp theo;
- "Vào set tiếp";
- nút "Sửa" set vừa xong và nút thu nhỏ ở trên.

**Thẻ số** lấy từ set vừa ghi: mức tạ theo đơn vị tài khoản, reps (hoặc giây giữ), và chênh lệch so với mức tốt nhất buổi trước của bài. Chưa có lần trước thì thẻ thứ ba là "set 1/2".

| Tệp | Là gì |
|---|---|
| `keyframes.jpg` | 12 khung dừng hình của quãng nghỉ 90 s |
| `rest-45s.mp4` | Một quãng nghỉ 45 s, có tiếng |

Xem trên simulator: `SIMCTL_CHILD_ASCND_DEBUG_KOA_REST=90` (`…_T=<ms>` để dừng hình).
