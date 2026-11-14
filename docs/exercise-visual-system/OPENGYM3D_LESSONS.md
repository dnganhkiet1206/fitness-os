# Học từ OpenGym3D (14/11/2026)

Nguồn: [github.com/SUPERr007/opengym3d](https://github.com/SUPERr007/opengym3d). Đọc qua GitHub API, không tải repo. Mã nguồn MIT. Dữ liệu chuyển động trộn nhiều nguồn: Mixamo nằm trong một repo riêng tư; các clip quay từ video công khai họ tự ghi là "chỉ dùng trong app, để thử pipeline". Ta học cách làm, không chép dữ liệu của họ.

Kiệt yêu cầu ngày 14/11: không có ngân sách, không tự quay được. Phải học từ các dự án sẵn có rồi tự dựng cho app.

## Bài học lớn nhất (từ `NOTES.md` của họ, đúng với những gì ta đã gặp ở bench press)

> Mọi tư thế đặt bằng mắt đều hỏng; mọi tư thế suy từ dữ liệu thật đều đúng ngay lần đầu. Thấy sai hai lần thì dừng chỉnh số, đi đo.

Họ từng key tay toàn bộ bài. Một thread trên r/threejs chê "robot", và họ chuyển sang mocap.

## Kiến trúc "nhà máy bài tập"

Mỗi bài là một file cấu hình đầu vào, không phải một dự án riêng.

```
exercises/<id>.json  ─ "movement": {"pattern": "squat"|"hinge"|"press_vertical"|...}
                     ─ "mocap": <tham chiếu clip> (lane + giấy phép)
                     ─ "prop", "camera", cơ chính/phụ
  → resolve   tìm clip theo tên đồng nghĩa (khớp nguyên từ, không đoán theo chuỗi con); không có thì báo CAPTURE NEEDED
  → retarget  gắn lên rig MakeHuman
  → cổng 1    khớp: độ lệch chiều dài xương, biên độ gập, lật roll giữa hai khung, trượt chân, khoảng cách tay–dụng cụ, vòng lặp khép
  → cổng 2    giải phẫu theo họ động tác: độ hạ hông, gối hẹp nhất, độ nghiêng thân, mặt phẳng tay, cổ tay qua đầu…
  → cổng 3    mắt: tờ khung xương hai góc (khung lỗi đóng khung đỏ) + dải 12 khung + trình xem có khung xương
  → chỉ công bố bài qua cả ba cổng
```

Ngưỡng của cổng 2 lấy từ thống kê (census) các bài đã duyệt. Họ nào chưa có bài thật thì ngưỡng ghi là PROVISIONAL, tinh chỉnh từ bản ghi đầu tiên chứ không theo cảm tính.

## Các nguồn chuyển động, xếp theo giấy phép

| Lane | Giấy phép | Dùng cho ASCND |
|---|---|---|
| Mesh2Motion | CC0 | được; chủ yếu đi bộ, chạy, chống đẩy |
| Video tự quay hoặc video có giấy phép, qua MediaPipe | của mình (Pexels cho phép thương mại và chỉnh sửa) | được |
| CMU mocap | miễn phí mọi mục đích, cấm bán lại dữ liệu kể cả đã chuyển đổi | được, chỉ trong app |
| Mixamo | được nhúng vào sản phẩm, cấm phát lại file | được, chỉ trong app; cần tài khoản Adobe miễn phí |

Bộ bài thể dục của Mixamo theo ghi chép của họ:
- **Có:** Air Squat, Push Up, Jumping Jacks, Plank, Situps, Bicycle Crunch, Bicep Curl, Front Raises, Burpee, Kettlebell Swing, Back Squat, Overhead Squat, Pistol, Snatch, Clean And Jerk, Sumo High Pull, Jump Push Up.
- **Không có:** bench press, lunge, Romanian deadlift/deadlift, chèo, nâng ngang, nhón bắp chân, cầu mông, good morning, curl búa, duỗi tay sau, wall sit, superman, high knees.

## Kỹ thuật retarget (áp dụng được cho rig 63 xương của ASCND)

- Rig MakeHuman nghỉ ở tư thế chữ A. Retarget bằng cách **xoay từng xương cho trùng hướng thế giới của xương nguồn**, theo cung ngắn nhất, từng khung, nội suy tuyến tính.
- Chi tách đôi (`upperarm01` + `02`) phải xoay **cả hai đoạn**, nếu không đoạn sau giữ nguyên độ cong của tư thế A.
- **Roll lấy theo hướng phía trước của chính cơ thể** (qua pelvis/thân), chiếu vuông góc với từng đoạn. MediaPipe không cho độ xoay quanh trục chi, nên làm vậy để chi không bị lật.
- MediaPipe xuất **hướng** từng đoạn (hông→gối, vai→khuỷu…), không xuất góc. World landmarks lấy tâm hông làm gốc, nên độ hạ hông suy ra từ độ cao hông so với bàn chân thấp nhất.
- Họ chạy MediaPipe 0.10.21 với delegate CPU trên Apple silicon (bản 1.0.x lỗi Metal trên máy họ). Máy ta đang chạy được bản 1.2.3.

## Kinh nghiệm kỹ thuật đáng nhớ

- RealityKit gộp USDZ nhiều animation thành một clip, nên mỗi bài một USDZ (ASCND đang làm đúng như vậy).
- Blender chạy `-P` thoát mã 0 cả khi script lỗi. Dùng `--python-exit-code 1` trong CI.
- Đạo cụ bắt buộc: bài có tạ mà tay không cầm gì là bị chê ngay.
- Ảnh đại diện nên lấy khung xa khung đầu nhất, không lấy khung giữa.
- Nền trắng studio hắt ngược làm phai màu cơ. Đo độ bão hoà trên ảnh render, đừng chỉnh đèn theo cảm giác.

## ASCND sẽ làm gì

1. **Giữ** những gì ta đã vượt họ: rig có bả vai và cơ ngực, bản đồ cơ 21 nhóm, sợi cơ LIC, kiểm hướng sợi, phép đo QA theo nghiên cứu (Mausehund 2022).
2. **Học** nhà máy bài tập: thêm `movement.pattern` và nguồn chuyển động (lane) vào `exercise.json`; cổng giải phẫu theo họ động tác; tờ khung xương hai góc.
3. **Thêm lane chuyển động:**
   - MediaPipe từ video có giấy phép; đã chạy thử trên clip Pexels 20672105;
   - CMU;
   - Mixamo, nếu Kiệt tạo tài khoản Adobe miễn phí và tự đăng nhập.
4. **Bench press không có mocap ở bất kỳ nguồn miễn phí nào,** nên giữ bộ giải ràng buộc của ta cho họ đẩy ngang, dùng số đo từ video Pexels và nghiên cứu làm mục tiêu.
