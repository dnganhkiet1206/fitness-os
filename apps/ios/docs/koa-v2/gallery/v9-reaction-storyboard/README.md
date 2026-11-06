# `v9-reaction-storyboard/`: Koa phản ứng toàn màn hình (storyboard mock, 05/11/2026)

Kiệt: "phản ứng của Koa sẽ là full màn hình có storyboard đầy đủ" (sau khi gắn mặt gym vào lúc ghi set / xong bài).

**Mock để duyệt, chưa có trong app.**

**Mở `index.html`**:
- trái là khung điện thoại phát thử đúng nhịp;
- phải là storyboard từng khung: thời gian, máy quay, Koa, chữ, rung;
- `?scene=set|record|done&bare=1&t=<ms>` cho ra một khung đứng yên (dùng để quay video).

| Cảnh | Khi nào | Dài | Khung |
|---|---|---|---|
| **Ghi set xong** (`reaction-set.mp4`) | Mỗi lần bấm "Xong set" | ≈ 2,2 s | Cận mặt nghiến răng → "XONG SET!" trung cảnh → ngồi thở dốc → Koa thu nhỏ bay vào vòng đồng hồ nghỉ |
| **Phá kỷ lục** (`reaction-record.mp4`) | Set vừa xong là kỷ lục | ≈ 4,0 s | Góc thấp đẩy tạ → chớp trắng, cận mặt hét "KỶ LỤC MỚI!" → nhảy ăn mừng, pháo giấy → góc thấp nâng cúp |
| **Xong buổi** (`reaction-done.mp4`) | Bấm "Kết thúc buổi", trước màn tổng kết | ≈ 6,0 s | Góc cao "XONG BUỔI!" → uống nước → cận mặt tự hào → góc thấp gồng tay, 3 ô số đếm lên → ăn mừng "+12 Gains" |

`storyboard-done-page.jpg`: ảnh chụp trang storyboard của cảnh "xong buổi".

**Hình:** `img/` là ảnh render nền trong suốt của thư viện dáng v8 (`KOA_TRANSPARENT=1 … koa_pose.py`).

## Luật chung đề xuất

- Chạm bất kỳ đâu để bỏ qua. Đồng hồ nghỉ chạy ngầm từ lúc bấm "Xong set".
- **Giảm chuyển động:** không đẩy máy, không rung khung, không pháo giấy; giữ một khung tĩnh 1 s.
- **Cảnh "ghi set" lặp lại mỗi set (15–25 lần một buổi):** phải ngắn nhất, và nên có công tắc tắt trong Cài đặt.

## Khi làm thật (chưa làm, chờ duyệt)

- Koa trong app vẽ bằng `KoaRender` (vector), không dùng ảnh render.
- **Dáng còn thiếu**, phải vẽ thêm trong `KoaSceneData` / `tools/koa-wardrobe/build.py`:
  - ngồi thở;
  - nhảy tay chữ V;
  - nâng cúp;
  - uống nước;
  - gồng tay;
  - góc thấp / cao.

  Mỗi dáng cần Kiệt duyệt (art là của Kiệt).
- Rung theo `sensoryFeedback`; chưa có âm thanh.
