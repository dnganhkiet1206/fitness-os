# Quy trình làm một bài 3D (mọi agent làm theo)

Kiệt chốt 15/11/2026, sau ba lần làm lại Dumbbell Shoulder Press. Bài mẫu đã đi hết quy trình:
`artifacts/exercise-visual-system/dumbbell-shoulder-press/` (Kiệt duyệt động tác 15/11, có mẹo trong trình xem).

Mỗi bước có **điều kiện xong**. Chưa đạt thì không sang bước sau. Lỗi dùng chung cho nhiều bài thì sửa ở tầng chung
(`motionlab/`, `pipeline/`, `evs/`) và ghi một dòng vào `MOTION_KIT_LESSONS.md`.

## 0. Chuẩn bị

- Nhánh `claude/<slug>` (hoặc tiền tố của agent) tạo từ `origin/native/ios-rewrite`, theo `AGENTS.md`.
- Đọc `MOTION_KIT.md`, `MOTION_KIT_LESSONS.md` (các luật đánh số) và bài mẫu ở trên.

## 1. Xem video trước (luật 10)

- Mở 2–3 video YouTube ngắn có **người thật** làm bài, trong trình duyệt tích hợp. **Chỉ xem**, không tải về, không chép.
- Bỏ qua video hoạt hình hay CGI: đó là sản phẩm của bên khác, không phải tham chiếu kỹ thuật.
- Dừng khung bằng `video.currentTime` ở **đáy, giữa, đỉnh**. Xem đủ các góc video có: trước, bên, sau.
- Ghi lại từng chi tiết nhìn thấy:
  - dụng cụ và góc ghế;
  - độ sâu ở đáy;
  - vị trí khuỷu so với cổ tay và vai;
  - hướng xoay tay;
  - bả vai (hạ, kéo sau);
  - đầu, lưng, bàn chân;
  - hai dụng cụ có chạm nhau không.
- Đọc cả phụ đề và mô tả video: thường có con số ("elbows tucked about 45 degrees").
- **Xong khi:** có bảng chi tiết, mỗi dòng ghi rõ video nào, mốc giây nào.

## 2. Tìm kiếm để kiểm lại

- Tìm kiếm web (ACE, ExRx, Muscle & Strength, bài của huấn luyện viên) để đối chiếu **từng chi tiết** ở bước 1.
- Nguồn mâu thuẫn nhau thì ghi cả hai, rồi chọn theo video người thật và nguồn có uy tín hơn. Ghi lý do chọn.
- **Xong khi:** mọi chi tiết đều có ít nhất một video và một trang web đồng ý.

## 3. Ghi vào `exercise.json`

- **Dụng cụ là một phần của bài.** Ghế có `setup` (góc lưng, độ cao, vị trí) và `role`. Cần mẫu mới thì thêm vào
  `config/equipment.json` (ví dụ `utility_bench_70`).
- Cập nhật `technical_cues`, `common_mistakes` và `phase_cues` theo bước 1–2.
- Thêm vào `motion_provenance`:
  - tên video, mã video, các mốc giây đã xem;
  - các trang đã đối chiếu;
  - `"license": "facts (watched only…)"`.
- Không ghi tên thương hiệu.

## 4. Mô phỏng

- Chỉnh tham số trong `motionlab/families/<họ>.py`. Mỗi tham số có chú thích nguồn (video, trang, hoặc ghi chú của Kiệt).
- Thông số phải khớp nhau giữa template và dụng cụ (ví dụ `back_pad_angle_from_vertical_deg` với `back_angle_from_vertical_deg`).
- Lệnh: `python3 pipeline/factory.py build <thư mục>`.
- **Xong khi:** QA đạt. Lỗi nào còn lại phải là lỗi đã biết, có ghi lý do.

## 5. Soi bằng mắt, so với video

- Lệnh: `python3 pipeline/factory.py eye <thư mục>`. Tạo `observer_sheet.png`: tầm mắt người đứng 1,6 m, 5 góc × 3 khung.
- Xem thêm `review_sheet.png` (8 góc).
- So **từng ô** với khung video tương ứng: độ sâu, khuỷu, ghế, đầu, chân, khoảng cách hai dụng cụ.
- Kiểm cả người, theo luật trong `MOTION_KIT_LESSONS.md`: tay, lưng, chân, dáng đứng.
- **Xong khi:** không còn điểm nào khác với video.

## 6. Đưa vào app

Dạng khối (từ 16–17/11, chi tiết ở `MODULAR_3D_PLAN.md`):

- Xuất chuyển động: `export_usdz.py --split` → `<id>_motion.usdz` + `<id>_equipment.json`. Chép vào `apps/ios/ASCND/Resources/ExerciseDemos/` cùng `_poster.jpg`.
- Dữ liệu bài (tên, góc máy, vai trò cơ, ghi chú Lab): sửa `exercise.json` rồi chạy `python3 pipeline/export_app_demos.py`. Không sửa Swift.
- Bản đồ cơ đổi thì chạy `python3 pipeline/export_muscle_shader_maps.py`.
- **Cuối cùng, sau mọi lần xuất vào app:** `Blender -b --factory-startup --python pipeline/slim_app_usdz.py`. Lệnh này bỏ texture thừa, cho phòng dùng chung hình học, bỏ pháp tuyến của phòng, lọc khung chuyển động (lệch tối đa 0,25°). Chạy lại nhiều lần không sao: file đã rút gọn thì bỏ qua.
- Lab: ghi chú "chờ Kiệt xem lại" trong `exercise.json` (`app_demo`).

## 7. Kiểm trên simulator

- Build theo `apps/ios/docs/AGENT_SESSION.md` §6. Đặt `-derivedDataPath` ra ngoài repo.
- **Cài theo UDID của máy, không dùng `booted`.** Thường có nhiều simulator cùng chạy, và `booted` có thể cài nhầm máy
  (15/11 đã cài nhầm sang máy iPhone 17 Pro).
- So `shasum` của file USDZ trong app (`xcrun simctl get_app_container <UDID> <bundle id>`) với file trong `Resources`.
- Chụp màn hình bằng `xcrun simctl io <UDID> screenshot`, vì bảng simulator có thể bị đứng hình.
  Nếu đứng thì `detach` rồi `attach` lại cho Kiệt.
- Mở **Lab → 3D** → bài → trình xem. Xoay đủ các góc.
- **Xong khi:** trình xem chạy bản mới (đúng mã file) và động tác giống với tờ soi.

## 8. Kiệt duyệt

- Mở trình xem trên simulator cho Kiệt, báo những gì đã đổi, và chờ Kiệt.
- Kiệt góp ý thì quay lại bước 1 hoặc bước 4. Ghi góp ý vào `agent_review.owner_feedback`, thêm dòng vào `MOTION_KIT_LESSONS.md`.
- Kiệt duyệt thì:
  - `exercise.json`: đặt `agent_review.status = "owner_approved_motion"` và `owner_approval = {motion, by, date}`;
  - `ExerciseDemo3D.swift`: tạo `Review(...)` (dấu xanh), trong `checked` có "Kiệt duyệt động tác <ngày>", `remaining` ghi lỗi còn lại.

## 9. Mẹo trong trình xem (chỉ làm sau khi Kiệt duyệt động tác)

- **Số mẹo:** 4–5, rút từ bước 1–2. Mỗi mẹo là một điều người tập phải làm đúng (ghế, vai, khuỷu, độ sâu, thân…).
- **Chuỗi chữ:** trong `Localizable.xcstrings`.
  - Khoá: `eg.demo3d.tip.<bài>_<ý>` và các hậu tố `.body`, `.how1`, `.how2`, `.why`, `.avoid`.
  - Đủ **en, es, vi**. Id có tiền tố theo bài để không trùng với bài khác.
- **Điểm neo:** chạy
  `Blender -b <thư mục>/<id>_master.blend -P pipeline/dump_anchor_points.py -- 0`, lấy toạ độ Y-up `(x, z, -y)`,
  rồi đẩy ra ngoài bề mặt da.
  - Chỉ đặt ở vùng **không chuyển động** khi tập.
  - Không đặt ở **phần dưới màn**, vì bảng cơ che mất.
- Thêm danh sách vào `ExerciseTips` và vào `tips(for:)` theo `PersonalRecords.exerciseKey`.
- Kiểm trên simulator:
  - bấm nút bóng đèn: trên người hiện các chấm có số, mỗi mẹo một chấm (Kiệt 17/11, không còn nhãn chữ và dây nối);
  - mỗi chấm phải nằm đúng vùng trên người;
  - không có chấm nào chồng nhau;
  - chạm một chấm và đọc đủ Cách làm / Vì sao / Tránh trong thẻ ở đáy màn.

## 10. PR và báo cáo

- Mở PR vào `native/ios-rewrite`. Chờ CI xanh trên đúng commit cuối, rồi gộp tay bằng **merge commit**.
- Không dùng `--auto`, không squash.
- Báo lên #527 theo **thấy / đổi / kiểm / NOT RUN**: ghi các video và trang đã xem, kết quả QA, simulator.
- Có chạm tới hạn chế hay việc hoãn thì cập nhật `apps/ios/docs/CONSTRAINTS_AND_DEFERRED.md`.
