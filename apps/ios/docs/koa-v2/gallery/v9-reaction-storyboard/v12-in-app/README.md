# `v12-in-app/`: cảnh xong buổi chạy thật (07/11/2026)

**Kiệt:** "duyệt storyboard xong buổi nhưng các storyboard còn lại chưa duyệt".

**Đổi:**
- Bấm "Kết thúc buổi": cảnh Koa phủ ngay lên màn tập (không lộ màn tổng kết trước). Hết cảnh hay chạm thì màn tổng kết mở ra. Áp cho buổi hôm nay và buổi ngày cũ trong lịch tuần.
- Số thật của buổi, giữ nguyên mốc / hiệu ứng / tiếng của bản duyệt:
  - tên buổi;
  - ba ô: tổng khối lượng, set, bài. Ô "thời gian" của mock thành "bài" vì app chưa lưu thời lượng buổi;
  - "+N Gains" và "Còn … Gains nữa Koa lên …". Không có Gains (buổi thứ hai trong ngày, tập quá ngày liền) thì chỉ còn pháo giấy.
- Hộp hệ thống xin quyền thông báo (sau lịch tập đầu tiên, #800) từng bật đè lên Koa: giờ chờ cảnh xong.
- Cảnh ghi set / kỷ lục chưa duyệt: vẫn chỉ ở mock Debug.

`finish-workout-in-app.mp4`: simulator iPhone 17 Pro, dữ liệu test (`-uiTestFakeBackend`), Full Body A 1 set Squat 80 kg × 5. `simctl` không ghi tiếng.
