# `v9-reaction-storyboard/`: Koa phản ứng toàn màn hình (storyboard mock, 05/11/2026)

## v2 (`v2-app/`): Koa vector thật của app

Kiệt xem v1: "sao nhìn kì vậy". Lý do:
- v1 dùng ảnh render từ mẫu 3D (chỉ là khung tỉ lệ), nên lệch nét Koa: mặt trượt ra mép, tay như sợi mì, dáng ngồi thành cục tròn, không có đèn;
- góc cao / thấp làm méo cái đầu to;
- Koa không cử động, chỉ phóng ảnh tĩnh rồi cắt.

**v2 phát cùng storyboard bằng màn Debug trong app:**
- màn `KoaReactionPreview`, mở bằng `SIMCTL_CHILD_ASCND_DEBUG_KOA_REACTION=set|record|done`;
- dữ liệu `ASCNDCore/Koa/KoaReaction.swift`;
- Koa vẽ bằng `KoaFigureView`: đúng nét, có đèn, chớp mắt, mặt đổi mượt, quay mặt 2.5D;
- "máy quay" chỉ đẩy / lùi trên hình 2D;
- nhảy có nhún, bay và tiếp đất nén;
- video quay thẳng từ simulator iPhone 17 Pro.

| Tệp | Cảnh |
|---|---|
| `v2-app/koa-reaction-set.mp4` | Ghi set xong ≈ 2,5 s (một vòng, kèm 0,9 s nghỉ giữa vòng lặp) |
| `v2-app/koa-reaction-record.mp4` | Phá kỷ lục ≈ 4,1 s |
| `v2-app/koa-reaction-done.mp4` | Xong buổi ≈ 6 s |
| `v2-app/*-sheet.jpg` | 4 khung / giây |

**Còn (v2):**
- **Dáng ngồi:** dáng "thư giãn" của app ở cỡ này trông vẫn như đứng, cú "ngồi phịch" chưa đọc ra. Cần vẽ dáng ngồi rõ hơn.
- **Dáng `cheer` / `taDa` có mặt riêng:** mặt sao, mặt cười, không phải mặt gym.
- **Chưa có âm thanh;** rung chỉ có trên máy thật.

## v1 (đã bỏ): ảnh render 3D


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
