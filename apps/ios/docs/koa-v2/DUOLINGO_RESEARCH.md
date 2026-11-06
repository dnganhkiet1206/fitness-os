# Duolingo vẽ và cho nhân vật xoay thế nào (nghiên cứu 05/11/2026)

Kiệt: "nghiên cứu cách duolingo vẽ, tôi vẫn thấy chưa được" (sau v4).

Đề bài Koa V2 cấm chép Duo: không chép hình, màu hay bóng dáng. Ở đây chỉ học **nguyên tắc**.

## Nguồn và mức tin

**Do Duolingo tự viết:**
- "Shape language: Duolingo's art style": https://blog.duolingo.com/shape-language-duolingos-art-style/
- "Reshaping Duo": https://blog.duolingo.com/reshaping-duo/
- "Building character": https://blog.duolingo.com/building-character/
- "World character visemes": https://blog.duolingo.com/world-character-visemes

**Nguồn thứ cấp, độ tin thấp hơn:**
- Bản chép style guide trên Scribd: https://www.scribd.com/document/583545694/Duolingo-Illustration-Guidelines
- Bài phân tích Medium: https://medium.com/gdg-vit/decoding-duolingo-how-technology-design-can-shape-learning-journeys-8a37f48138fc
- Các bài hướng dẫn rig Rive "kiểu Duolingo" trên dev.to.

**Không tìm thấy:**
- turnaround sheet của Duolingo;
- cấu trúc rig thật;
- cách họ làm đầu quay.

Phần "kỹ thuật xoay" dưới đây là kỹ thuật phổ biến của rig 2D (Rive, Character Animator), không phải tài liệu nội bộ Duolingo.

## Rút ra

1. **Dáng đầu tiên.** Khi làm lại Duo, họ chọn bóng dáng trước, vì dáng không đẹp thì chi tiết bên trong không cứu được (Reshaping Duo).
2. **Góc đẹp nhất là hơi nghiêng.** Duo được đặt ở góc hơi quay (quarter-turn) mà họ chọn là góc đẹp nhất (Reshaping Duo).
3. **Ít khối, phẳng, phóng đại.**
   - Họ dựng hình bằng rất ít khối vector đặt có chủ ý.
   - Họ phóng đại chi tiết chính gần như biếm hoạ (Shape language).
   - Bản chép style guide nói: khối tròn góc, phối cảnh phẳng, khoảng 15 khối là vừa.
4. **Chuyển động theo trạng thái, không theo hình học.**
   - Mỗi nhân vật có một trạng thái hoạt ảnh cho mỗi tư thế, và bộ miệng riêng (20+ miệng mỗi người).
   - Tất cả chạy song song trong state machine của Rive (World character visemes).
5. **Xoay đầu là 2.5D** (kỹ thuật chung, Duolingo không xác nhận):
   - dáng đầu gần như giữ nguyên;
   - mắt, mũi, miệng trượt theo hướng quay trên một mặt trụ tưởng tượng;
   - tai và phía sau trượt ngược lại;
   - các lớp đổi thứ tự trước / sau.

   Không ai chiếu một mô hình 3D thật.

## So với Koa

| | v4 (chiếu 3D) | v5 (2.5D) |
|---|---|---|
| Dáng ở 3/4 | Đúng hình học nhưng xấu: mắt xa thành lát mỏng, tai thành tấm giấy, thân thành cột | Giữ nguyên dáng bản vẽ Kiệt đã duyệt |
| Xoay | Bước 45° | Liên tục −35° … 35° |
| Mặt nghiêng, sau lưng | Có (trơn) | Không có. Cần vẽ tay riêng |
| Vào app | Phải nạp 8 bộ path mới | Chỉ thêm phép dời / co cho từng lớp đã có trong `KoaRender` |

**Đề xuất:**
- **v5 (2.5D) cho mọi góc trong khoảng ±35°.** Đó là gần hết thời gian Koa xuất hiện: Hôm nay, thẻ, phòng khi nhìn quanh.
- **Mặt nghiêng và sau lưng là hình vẽ tay riêng**, dùng mẫu 3D v4 chỉ làm khung tỉ lệ. Chuyển sang chúng bằng một cú quay nhanh có che (đầu quay trước, thân theo sau), giống cách các rig 2D làm.

Ảnh: `gallery/v5-2.5d-turn/`.
