# `v3-vector-turnaround/`: 8 góc vector dựng từ mẫu 3D (05/11/2026)

Kiệt chốt: **3D chỉ dùng để dựng góc, app vẫn vẽ vector** (audit mục 10). Đây là lần đầu chạy trọn quy trình đó. Là mock, chưa đưa vào app.

## Cách làm

Chạy `../../blender/koa_blockout.py <thư mục> vector`:
1. Dựng Koa 3D từ toạ độ `KoaSceneData`.
2. Render từng góc bằng màu ID phẳng (không khử răng cưa), mỗi mảng một màu: đầu, tai, mắt, con ngươi, mũi, miệng, lưỡi, má, mày, thân, bụng, tay, chân, bóng.
3. Dò viền vùng thấy được của từng mảng (Moore, giữ cả lỗ, `evenodd`), rút gọn điểm (RDP 1,1 px), nắn thành đường cong Bézier.
4. Tô bằng bảng màu Koa. Ra SVG trên **cùng khung 240 × 300 và cùng gốc toạ độ** với bản vẽ hiện tại, nên có thể nạp làm một góc mới của `KoaSceneData`.

Không cần công cụ ngoài: chỉ Blender 5.2 và numpy có sẵn trong Blender.

| Tệp | Là gì |
|---|---|
| `front-2d-vs-vector.png` | Trái: Koa 2D hiện tại (simulator). Phải: mặt trước vector dựng ra |
| `turnaround-guide-top-vector-bottom.jpg` | Trên: mẫu 3D có khối. Dưới: vector. Thứ tự góc: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315° |
| `vector-step-turn.mp4` | Đổi góc theo bước 45°, mỗi góc 0,25 s, hai vòng. Đây là kiểu xoay sẽ có trong app (khi đã có chuyển cảnh, đầu quay trước, thân theo sau) |
| `svg/` | 8 tệp SVG gốc |

## Vòng kiểm hình (đã xem ảnh render thật sau mỗi lần)

| Lần | Thấy | Sửa |
|---|---|---|
| 1 | Mày ra lấm chấm (chuỗi hạt chìm vào đầu); miệng mất; viền tai như bọt; mắt nhô ở góc nghiêng | Mày thành nét cong liền; miệng cắt nửa hình D; bướu viền tai nhỏ lại |
| 2 | Miệng bị cắt ngược nửa (chỉ còn vệt đen dưới mũi) | Đổi phía cắt |
| 3 | Không có má hồng, không có lưỡi (bị má phình và miệng che); con ngươi lấn ra ngoài lòng trắng | Nâng má, lưỡi; con ngươi nhỏ lại |

## Còn sai (một người chấm: mình)

- **Ở góc nghiêng và 3/4, má, lưỡi, mũi, mắt nhô ra khỏi viền đầu.** Vì các mảng mặt đang được đặt nổi lên mặt cầu cho dễ thấy ở mặt trước. Vòng sau: dán sát mặt đầu và chỉ nổi ở mũi.
- **Khác bản 2D:**
  - mắt nhỏ hơn;
  - con ngươi chưa có hai chấm sáng;
  - mũi thiếu vệt sáng dài;
  - miệng chưa có nét cười hai khoé;
  - tai chưa có viền răng cưa mịn như bản vẽ;
  - đầu và thân chưa có vệt phân cách dưới cằm.
- **Thân, tay ở góc nghiêng** giống khối trụ, chưa có dáng.
- **NOT VERIFIED:**
  - nạp vào `KoaSceneData` và vẽ bằng `Canvas` trong app;
  - chuyển góc có hoạt ảnh;
  - đồ mặc theo góc;
  - hiệu năng.

## Bước sau

1. Kiệt duyệt hướng nhìn của 8 góc (bóng dáng, tỉ lệ).
2. Sửa các lỗi trên.
3. Thêm góc vào `KoaSceneData` dưới cờ Debug, xem trên simulator cạnh mặt trước.
4. Chuyển góc khi Koa đi trong phòng.
